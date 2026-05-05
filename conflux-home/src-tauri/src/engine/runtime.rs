// Conflux Engine — Agent Runtime
// The reasoning loop: receive message → think → act → observe → respond.
// Includes tool calling loop with up to 3 iterations.

use anyhow::Result;
use serde_json::Value;

use super::cloud;
use super::db::EngineDb;
use super::router::ModelResponse;
use super::router::OpenAIMessage;
use super::security::events::{self, EventCategory, EventType};
use super::security::permissions;
use super::state_events::ConfluxState;
use super::tools;
use super::tool_selector::{select_tools, ToolSelector, validate_tool_name, message_needs_tools};

const MAX_TOOL_ITERATIONS: usize = 3;
/// Maximum tools to send per request. Anthropic Claude caps at 128.
const MAX_TOOLS_PER_REQUEST: usize = 128;
const MAX_LOCAL_TOOLS: usize = 15;
/// Maximum tools for cloud AI routing (limit to prevent context overflow).
const MAX_CLOUD_TOOLS: usize = 20;

/// Assemble and smart-filter tool definitions for a user message.
/// Core tools (time, calc, web_search, file ops) are always included.
/// Domain tools are selected by keyword relevance to the message.
fn get_filtered_tools(user_message: &str, max_tools: usize) -> Vec<Value> {
    let mut all_tools = tools::get_tool_definitions();
    all_tools.extend(tools::get_integration_tool_definitions());
    all_tools.extend(tools::get_app_tool_definitions());

    if all_tools.len() <= max_tools {
        return all_tools;
    }

    // Smart selection — no conversation history for now (stateless per-turn)
    let selected = select_tools(&all_tools, user_message, max_tools, &[]);

    log::debug!(
        "[ToolSelector] {} → {}/{} tools",
        &user_message[..user_message.len().min(60)],
        selected.len(),
        all_tools.len()
    );

    selected
}

/// Helper: create a ToolResult from a message string.
fn tool_result_msg(success: bool, output: String) -> tools::ToolResult {
    tools::ToolResult {
        success,
        output,
        error: None,
    }
}

/// Helper: Extract user_id from session record, or fall back to get_supabase_user_id.
fn get_session_user_id(db: &EngineDb, session_id: &str) -> String {
    match db.get_session(session_id) {
        Ok(Some(session)) if !session.user_id.is_empty() => session.user_id,
        _ => {
            // Fallback: try to get from Supabase config
            db.get_config("supabase_user_id")
                .ok()
                .flatten()
                .filter(|id| !id.is_empty())
                .unwrap_or_default()
        }
    }
}


/// Attempt cloud chat, falling back to local AI on network errors.
async fn cloud_chat_with_fallback(
    alias: Option<&str>,
    messages: Vec<OpenAIMessage>,
    max_tokens: Option<i64>,
    tools: Option<Vec<serde_json::Value>>,
) -> Result<ModelResponse> {
    match cloud::cloud_chat(alias, messages.clone(), max_tokens, None, tools.clone()).await {
        Ok(r) => Ok(r),
        Err(e) => {
            let err_str = e.to_string().to_lowercase();
            let is_network = err_str.contains("network")
                || err_str.contains("connection")
                || err_str.contains("timeout")
                || err_str.contains("dns")
                || err_str.contains("resolve")
                || err_str.contains("offline")
                || err_str.contains("unreachable")
                || err_str.contains("refused")
                // Auth failures also trigger offline fallback — if cloud auth is broken,
                // try local AI instead of surfacing a cryptic 401/403 to the user
                || err_str.contains("401")
                || err_str.contains("403")
                || err_str.contains("unauthorized")
                || err_str.contains("forbidden")
                || err_str.contains("invalid credentials")
                || err_str.contains("user not found");

            if is_network {
                log::warn!("[Engine] Cloud chat failed with network error — trying local AI fallback: {}", e);

                // If tools were provided, do tool-aware offline routing through the local model.
                // This preserves tool-calling capability when completely offline.
                if let Some(tools) = tools {
                    if let Some(manager) = super::local_ai::get_or_init_local_ai().await {
                        if let Some(last_user) = messages.iter().rev().find(|m| m.role == "user").and_then(|m| m.content.as_ref()) {
                            log::info!("[Engine] Attempting tool-aware offline routing with {} tools", tools.len());
                            match super::local_ai::local_tool_route(&manager, last_user, &tools).await {
                                Ok(response) => {
                                    log::info!("[Engine] Tool-aware offline routing succeeded ({} chars, {} tool calls)",
                                        response.content.len(), response.tool_calls.len());
                                    return Ok(response);
                                }
                                Err(local_err) => {
                                    log::warn!("[Engine] Tool-aware offline routing failed: {}", local_err);
                                }
                            }
                        }
                    } else {
                        log::warn!("[Engine] Local AI not available for offline fallback");
                    }
                } else {
                    // No tools provided — fall back to simple completion
                    if let Some(manager) = super::local_ai::get_or_init_local_ai().await {
                        if let Some(last_user) = messages.iter().rev().find(|m| m.role == "user").and_then(|m| m.content.as_ref()) {
                            let system = messages.iter().find(|m| m.role == "system").and_then(|m| m.content.as_ref()).map(|s| s.as_str()).unwrap_or("You are a helpful assistant.");
                            let prompt = format!("{}

User: {}
Assistant:", system, last_user);
                            let max_tok = max_tokens.unwrap_or(512).min(2048) as i32;
                            match manager.completion(&prompt, max_tok, 0.7).await {
                                Ok(content) => {
                                    log::info!("[Engine] Local AI fallback succeeded ({} chars)", content.len());
                                    return Ok(ModelResponse {
                                        content,
                                        model: "local-offline".to_string(),
                                        provider_id: "local".to_string(),
                                        provider_name: "Local AI (Offline)".to_string(),
                                        tokens_used: 0,
                                        latency_ms: 0,
                                        tool_calls: vec![],
                                    });
                                }
                                Err(local_err) => {
                                    log::warn!("[Engine] Local AI fallback failed: {}", local_err);
                                }
                            }
                        }
                    } else {
                        log::warn!("[Engine] Local AI not available for offline fallback");
                    }
                }
            }
            Err(e)
        }
    }
}

/// Process a chat turn for an agent: take user input, think, potentially call tools, respond.
pub async fn process_turn(
    db: &EngineDb,
    session_id: &str,
    agent_id: &str,
    user_message: &str,
    max_tokens: Option<i64>,
) -> Result<ModelResponse> {
    // Check offline mode — hard switch, no fallback
    if super::is_offline_mode() {
        log::info!("[Engine] Offline mode — routing to local AI only");
        return local_offline_turn(db, session_id, agent_id, user_message, max_tokens).await;
    }

    let mut total_tool_calls_in_turn: usize = 0;
    let mut all_tool_names: Vec<String> = Vec::new();
    // 1. Load agent config
    let agent = db
        .get_agent(agent_id)?
        .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_id))?;

    // 2. Load recent conversation history (last 20 messages)
    let history = db.get_messages(session_id, 20)?;

    // 3. Load relevant memories
    let memories = db.search_memory(agent_id, user_message, 5)?;
    let memory_context = if !memories.is_empty() {
        let mem_lines: Vec<String> = memories
            .iter()
            .map(|m| format!("[{}] {}", m.memory_type, m.content))
            .collect();
        format!("\n\nRelevant memories:\n{}", mem_lines.join("\n"))
    } else {
        String::new()
    };

    // 4. Build the message array
    let mut messages: Vec<OpenAIMessage> = Vec::new();

    // System prompt: agent soul + instructions + memory + skills
    let skill_context = match db.get_skills_for_agent(agent_id) {
        Ok(skills) if !skills.is_empty() => {
            let skill_lines: Vec<String> = skills
                .iter()
                .map(|s| format!("{} {}: {}", s.emoji, s.name, s.instructions))
                .collect();
            format!("\n\nActive skills:\n{}", skill_lines.join("\n\n"))
        }
        _ => String::new(),
    };
    let system_prompt = build_system_prompt(db, &agent, &memory_context, &skill_context);
    messages.push(OpenAIMessage {
        role: "system".to_string(),
        content: Some(system_prompt),
        tool_call_id: None,
        tool_calls: None,
    });

    // Conversation history — filter orphaned tool messages and reconstruct tool_calls
    let mut prev_had_tool_calls = false;
    for msg in &history {
        // Skip orphaned tool messages (tool result without preceding assistant+tool_calls)
        if msg.role == "tool" && !prev_had_tool_calls {
            continue;
        }

        // Track whether this message has tool_calls (so next tool message is valid)
        prev_had_tool_calls = msg.role == "assistant" && msg.tool_name.is_some();

        // Reconstruct tool_calls for assistant messages that initiated tool calls
        let tool_calls = if msg.role == "assistant" && msg.tool_name.is_some() {
            let args = msg.tool_args.as_deref().unwrap_or("{}");
            let call_id = msg.tool_call_id.as_deref().unwrap_or("call_reconstructed");
            Some(vec![serde_json::json!({
                "id": call_id,
                "type": "function",
                "function": { "name": msg.tool_name.as_ref().unwrap(), "arguments": args }
            })])
        } else {
            None
        };

        messages.push(OpenAIMessage {
            role: msg.role.clone(),
            content: if msg.content.is_empty() {
                None
            } else {
                Some(msg.content.clone())
            },
            tool_call_id: msg.tool_call_id.clone(),
            tool_calls,
        });
    }

    // Current user message
    messages.push(OpenAIMessage {
        role: "user".to_string(),
        content: Some(user_message.to_string()),
        tool_call_id: None,
        tool_calls: None,
    });

    // 5. Store the user message
    db.add_message(session_id, "user", user_message, 0, None, None, None)?;

    // ── Training Data Collection: Session Start ──
    let _ = db.log_event(
        "session_start",
        Some(agent_id),
        Some(session_id),
        Some(&serde_json::json!({
            "message": user_message.chars().take(100).collect::<String>(),
        }).to_string()),
    );

    // 6. Determine if message needs tools at all
    let needs_tools = message_needs_tools(user_message);
    let tool_defs = if needs_tools {
        get_filtered_tools(user_message, MAX_CLOUD_TOOLS)
    } else {
        log::debug!("[Engine] Conversational message — skipping tools for speed");
        Vec::new()
    };

    // 7. Emit thinking state
    let state_manager = super::state_manager::get_state_manager();
    let _ = state_manager.lock().map(|mut mgr| {
        mgr.transition_with_context(
            ConfluxState::Thinking,
            Some(agent_id.to_string()),
            Some(session_id.to_string()),
            Some(serde_json::json!({
                "model": agent.model_alias,
                "session_message_count": history.len(),
            })),
        )
    });

    // 8. Local AI fast-path (try local routing first, fall back to cloud)
    //    Only attempt on first iteration (no tool results in context yet)
    //    Skip for conversational messages (no tools needed)
    //    DISABLED 2026-04-26: local_ai tool routing is producing garbled outputs
    //    in production (UNK bytes, hallucinated field names) which corrupts the
    //    conversation context and causes cloud tool execution to fail with
    //    "Unknown error". Re-enable once the toolrouter GGUF is fixed.
    let local_ai_enabled = std::env::var("CONFLUX_LOCAL_AI_TOOLS")
        .map(|v| v == "1")
        .unwrap_or(false);
    if needs_tools && local_ai_enabled { // Only route locally if message needs tools
        let local_tools = get_filtered_tools(user_message, MAX_LOCAL_TOOLS);
        if let Some(local_response) = try_local_routing(user_message, &local_tools).await {
            if !local_response.tool_calls.is_empty() {
                log::info!(
                    "[Engine] Local AI routed {} tool call(s) in {}ms",
                    local_response.tool_calls.len(),
                    local_response.latency_ms
                );

                // Execute local tool calls and feed results into the conversation
                // so the cloud model can generate a natural language response
                for tool_call in &local_response.tool_calls {
                    let args: Value = serde_json::from_str(&tool_call.arguments)
                        .unwrap_or_else(|_| serde_json::json!({}));
                    let user_id = get_session_user_id(db, session_id);

                    // Validate/correct tool name (270M model often truncates to category prefix)
                    // If no valid match found, skip this tool call entirely — do NOT fall through
                    // with the raw hallucinated name, which would hit the cloud router as invalid.
                    let validated_name = match validate_tool_name(&tool_call.name, &local_tools) {
                        Some(name) => name,
                        None => {
                            let name = tool_call.name.clone();
                            log::warn!(
                                "[Engine] Local AI tool '{}' has no valid match — skipping tool call",
                                name
                            );
                            continue;
                        }
                    };

                    match tools::execute_tool(&validated_name, &args, &user_id).await {
                        Ok(result) => {
                            let tool_content = if result.success {
                                result.output.clone()
                            } else {
                                format!("Error: {}", result.error.unwrap_or_default())
                            };
                            log::info!("[Engine] Local tool result ({}): {}", tool_call.name, &tool_content[..tool_content.len().min(200)]);

                            // Add the assistant's tool call and tool result to messages
                            // so the cloud model sees the context and responds naturally
                            messages.push(OpenAIMessage {
                                role: "assistant".to_string(),
                                content: None,
                                tool_calls: Some(vec![serde_json::json!({
                                    "id": tool_call.id,
                                    "type": "function",
                                    "function": {
                                        "name": validated_name,
                                        "arguments": tool_call.arguments,
                                    }
                                })]),
                                tool_call_id: None,
                            });
                            messages.push(OpenAIMessage {
                                role: "tool".to_string(),
                                content: Some(tool_content.clone()),
                                tool_calls: None,
                                tool_call_id: Some(tool_call.id.clone()),
                            });

                            // Log tool execution in DB
                            db.add_message(session_id, "tool", &tool_content, 0, None, None, None)?;

                            // ── Training Data Collection (Local Route) ──
                            let tool_exec_status = if tool_content.starts_with("Error:") { "error" } else { "success" };
                            let _ = db.add_tool_execution(
                                session_id,
                                &tool_call.id,
                                &validated_name,
                                &tool_call.arguments,
                                if tool_content.starts_with("Error:") { None } else { Some(&tool_content) },
                                tool_exec_status,
                                if tool_content.starts_with("Error:") { Some(&tool_content) } else { None },
                                Some(local_response.latency_ms as i64),
                            );
                            let _ = db.log_event(
                                "tool_called",
                                Some("local"),
                                Some(session_id),
                                Some(&serde_json::json!({
                                    "tool_name": validated_name,
                                    "status": tool_exec_status,
                                    "latency_ms": local_response.latency_ms,
                                }).to_string()),
                            );
                        }
                        Err(e) => {
                            log::warn!("[Engine] Local tool execution failed: {}", e);
                        }
                    }
                }

                // Fall through to cloud loop — it will see the tool results
                // in messages and generate a natural language response
                log::info!("[Engine] Local routing done — cloud will generate response from tool results");
            }
            // Local model returned no tool calls — fall through to cloud
            log::info!("[Engine] Local AI found no tool calls, falling back to cloud");
        }
    }

    // 9. Cloud tool calling loop (original logic)
    log::info!("[Engine] Entering cloud loop with {} messages", messages.len());
    let mut total_tokens: i64 = 0;
    let mut final_response: Option<ModelResponse> = None;

    for iteration in 0..MAX_TOOL_ITERATIONS {
        let response = cloud_chat_with_fallback(
            Some(&agent.model_alias),
            messages.clone(),
            max_tokens,
            if !tool_defs.is_empty() && (iteration == 0) {
                Some(tool_defs.clone())
            } else {
                None
            },
        )
        .await?;

        total_tokens += response.tokens_used;

        // If no tool calls, we're done
        if response.tool_calls.is_empty() {
            final_response = Some(response);
            break;
        }

        total_tool_calls_in_turn += response.tool_calls.len();
        for tool_call in &response.tool_calls {
            all_tool_names.push(tool_call.name.clone());
            // ── Tool Name Repair ──
            let repaired_name = if tool_defs.iter().any(|t| {
                t.get("function").and_then(|f| f.get("name")).and_then(|n| n.as_str()) == Some(&tool_call.name)
            }) {
                tool_call.name.clone()
            } else if let Some(valid) = validate_tool_name(&tool_call.name, &tool_defs) {
                log::warn!("[Engine] Auto-repaired tool name: '{}' → '{}'", tool_call.name, valid);
                valid
            } else {
                tool_call.name.clone()
            };

            log::info!(
                "[Engine] Tool call: {}({})",
                repaired_name,
                tool_call.arguments
            );

            // Parse arguments
            let args: Value = serde_json::from_str(&tool_call.arguments)
                .unwrap_or_else(|_| serde_json::json!({}));

            // Execute the tool with user context
            let user_id = get_session_user_id(db, session_id);

            // ── Security: Permission Gate ──
            let (resource_type, resource_value) = match repaired_name.as_str() {
                "file_read" | "file_write" | "file_delete" | "file_list" | "file_append" => {
                    let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
                    ("file_path".to_string(), path.to_string())
                }
                "http_request" | "curl" => {
                    let url = args.get("url").or_else(|| args.get("path")).and_then(|v| v.as_str()).unwrap_or("");
                    ("network_domain".to_string(), url.to_string())
                }
                "exec_command" | "shell_command" | "bash" => {
                    let cmd = args.get("command").or_else(|| args.get("cmd")).and_then(|v| v.as_str()).unwrap_or("");
                    ("exec_command".to_string(), cmd.to_string())
                }
                "browser_open" | "browser_navigate" | "browser_action" => {
                    let url = args.get("url").and_then(|v| v.as_str()).unwrap_or("");
                    ("browser_domain".to_string(), url.to_string())
                }
                "api_call" => {
                    let endpoint = args.get("endpoint").or_else(|| args.get("url")).and_then(|v| v.as_str()).unwrap_or("");
                    ("api_endpoint".to_string(), endpoint.to_string())
                }
                _ => ("exec_command".to_string(), repaired_name.clone()),
            };

            let session_id_owned = session_id.to_string();
            let perm_result = match permissions::check_permission(
                db,
                agent_id,
                Some(&session_id_owned),
                &resource_type,
                &resource_value,
                "default",
                &repaired_name,
            ).await {
                Ok(result) => result,
                Err(e) => {
                    log::warn!("[Security] Permission check failed: {}", e);
                    permissions::PermissionCheckResult {
                        allowed: true,
                        action: "allow".to_string(),
                        rule_id: None,
                        reason: "permission_check_failed".to_string(),
                        prompt_id: None,
                    }
                }
            };

            log::debug!("[Engine] Permission check for '{}': allowed={}, action={}", 
                repaired_name, perm_result.allowed, perm_result.action);

            let tool_result = if !perm_result.allowed {
                // Log the denied event
                let _ = events::log_security_event(
                    db,
                    agent_id,
                    Some(&session_id_owned),
                    EventType::PermissionDenied,
                    EventCategory::Warning,
                    Some(&repaired_name),
                    Some(&resource_value),
                    Some(&format!("{}: {}", perm_result.action, perm_result.reason)),
                    50,
                    false,
                );

                let message = match perm_result.action.as_str() {
                    "prompt" => {
                        use crate::engine::get_engine;
                        let notif_body = format!(
                            "Agent '{}' wants to use '{}' on '{}'",
                            agent_id, repaired_name, resource_value
                        );
                        get_engine().send_security_notification(
                            "🔔 Agent Permission Request",
                            &notif_body,
                        );

                        format!(
                            "Agent '{}' is requesting permission to use '{}' on '{}'.\nReason: {}\n\nWaiting for your approval in the Security Center.",
                            agent_id, repaired_name, resource_value, perm_result.reason
                        )
                    }
                    _ => {
                        format!(
                            "Permission denied: Agent '{}' cannot use '{}' on '{}'.\nReason: {}",
                            agent_id, repaired_name, resource_value, perm_result.reason
                        )
                    }
                };
                tool_result_msg(false, message)
            } else {
                // Log the allowed event
                let _ = events::log_security_event(
                    db,
                    agent_id,
                    Some(&session_id_owned),
                    EventType::FileAccess,
                    EventCategory::Info,
                    Some(&repaired_name),
                    Some(&resource_value),
                    None,
                    0,
                    true,
                );

                tools::execute_tool(&repaired_name, &args, &user_id).await?
            };

            let result_content = if tool_result.success {
                tool_result.output.clone()
            } else {
                let display = tool_result
                    .output
                    .is_empty()
                    .then_some(())
                    .and_then(|_| tool_result.error.clone())
                    .or_else(|| {
                        let out = &tool_result.output;
                        if out.is_empty() { None } else { Some(out.clone()) }
                    })
                    .unwrap_or_else(|| "Unknown error".to_string());
                eprintln!("[ENGINE ERROR] tool={}, display='{}', full={:?}", repaired_name, display, tool_result);
                log::error!("[ENGINE] tool_name={}, display={}", repaired_name, display);
                format!("Error: {}", display)
            };

            // Add assistant message with tool_calls to conversation
            messages.push(OpenAIMessage {
                role: "assistant".to_string(),
                content: response.content.clone().into(),
                tool_call_id: None,
                tool_calls: Some(vec![serde_json::json!({
                    "id": tool_call.id,
                    "type": "function",
                    "function": {
                        "name": repaired_name,
                        "arguments": tool_call.arguments,
                    }
                })]),
            });

            // Add tool result message
            messages.push(OpenAIMessage {
                role: "tool".to_string(),
                content: Some(result_content.clone()),
                tool_call_id: Some(tool_call.id.clone()),
                tool_calls: None,
            });

            // Store assistant message with tool_calls (so history replays correctly)
            db.add_message_with_tools(
                session_id,
                "assistant",
                &response.content,
                0,
                Some(&response.model),
                Some(&response.provider_id),
                Some(response.latency_ms),
                Some(&tool_call.id),
                Some(&tool_call.name),
                Some(&tool_call.arguments),
                None,
            )?;

            // Store tool result in DB
            db.add_message_with_tools(
                session_id,
                "tool",
                &result_content,
                0,
                None,
                None,
                None,
                Some(&tool_call.id),
                Some(&tool_call.name),
                Some(&tool_call.arguments),
                Some(&result_content),
            )?;

            // ── Training Data Collection ──
            // Log tool execution to tool_executions table for training data
            let tool_exec_result: Option<&str> = if result_content.starts_with("Error:") { None } else { Some(&result_content) };
            let tool_exec_status = if result_content.starts_with("Error:") { "error" } else { "success" };
            let _ = db.add_tool_execution(
                session_id,
                &tool_call.id,
                &tool_call.name,
                &tool_call.arguments,
                tool_exec_result,
                tool_exec_status,
                if result_content.starts_with("Error:") { Some(&result_content) } else { None },
                Some(response.latency_ms),
            );
            // Log telemetry event for tool called
            let _ = db.log_event(
                "tool_called",
                Some(agent_id),
                Some(session_id),
                Some(&serde_json::json!({
                    "tool_name": tool_call.name,
                    "status": tool_exec_status,
                    "latency_ms": response.latency_ms,
                }).to_string()),
            );

            log::info!(
                "[Engine] Tool result: {}",
                &result_content[..result_content.len().min(200)]
            );
        }

        // If this was the last iteration, force no tools
        if iteration == MAX_TOOL_ITERATIONS - 1 {
            let final_resp = cloud_chat_with_fallback(
                Some(&agent.model_alias),
                messages.clone(),
                max_tokens,
                None,
            )
            .await?;
            total_tokens += final_resp.tokens_used;
            final_response = Some(final_resp);
        }
    }

    let response = final_response.expect("Tool loop should always produce a final response");

    // 8. Store the assistant response
    db.add_message(
        session_id,
        "assistant",
        &response.content,
        response.tokens_used,
        Some(&response.model),
        Some(&response.provider_id),
        Some(response.latency_ms),
    )?;

    // 9. Extract memories from this exchange (fire and forget)
    let _ =
        super::memory::extract_and_store(db, session_id, agent_id, user_message, &response.content)
            .await;

    // 10. Log telemetry
    let _ = db.log_event(
        "message_processed",
        Some(agent_id),
        Some(session_id),
        Some(
            &serde_json::json!({
                "model": response.model,
                "provider": response.provider_id,
                "tokens": total_tokens,
                "latency_ms": response.latency_ms,
                "tool_calls": response.tool_calls.len(),
            })
            .to_string(),
        ),
    );

    // 11. Session compaction (if over threshold)
    let _ = maybe_compact_session(db, session_id, agent_id).await;

    // 12. Guided Skill Creation Check
    if total_tool_calls_in_turn >= 5 && !all_tool_names.is_empty() {
        use std::collections::HashMap;
        let mut freq = HashMap::new();
        for name in &all_tool_names {
            *freq.entry(name).or_insert(0) += 1;
        }
        let dominant_tool = freq
            .into_iter()
            .max_by_key(|(_, count)| *count)
            .map(|(name, _)| name)
            .unwrap_or(&"unknown".to_string())
            .clone();
        let skill_name = format!("{}-workflow", dominant_tool.replace("_", "-"));
        let tool_sequence = all_tool_names.join(" → ");
        let description = format!(
            "Learned from {} tool calls in a single turn. Sequence: {}.",
            total_tool_calls_in_turn, tool_sequence
        );
        let triggers = format!("When the user wants to {}", dominant_tool.replace("_", " "));
        let procedure = format!(
            "1. Analyze the user's request\n2. Call the appropriate tools in sequence: {}\n3. Return a concise summary of results",
            tool_sequence
        );

        let draft = serde_json::json!({
            "skill_name": skill_name,
            "description": description,
            "triggers": triggers,
            "procedure": procedure,
            "tool_sequence": tool_sequence,
            "total_tool_calls": total_tool_calls_in_turn,
        });
        let _ = db.set_config("pending_skill_draft", &serde_json::to_string(&draft).unwrap_or_default());
        log::info!("[Engine] Generated skill draft '{}' from {} tool calls", skill_name, total_tool_calls_in_turn);

        // Emit skill-prompt event via engine's emit_tauri_event (no AppHandle parameter needed)
        use crate::engine::get_engine;
        get_engine().emit_tauri_event("conflux:skill-prompt", serde_json::json!({
            "skill_name": skill_name,
            "description": description,
            "triggers": triggers,
            "procedure": procedure,
            "tool_sequence": tool_sequence,
            "total_tool_calls": total_tool_calls_in_turn,
        }));
    }

    Ok(response)
}

/// Process a streaming chat turn with tool calling support.
/// For tool calls, uses non-streaming (reliable JSON capture).
/// Streams the final text response via on_chunk callback.
pub async fn process_turn_stream(
    db: &EngineDb,
    session_id: &str,
    agent_id: &str,
    user_message: &str,
    max_tokens: Option<i64>,
    on_chunk: &mut dyn FnMut(&str) -> Result<()>,
) -> Result<ModelResponse> {
    // Check offline mode — hard switch, no fallback
    if super::is_offline_mode() {
        log::info!("[Engine][Stream] Offline mode — routing to local AI only");
        return local_offline_turn(db, session_id, agent_id, user_message, max_tokens).await;
    }

    // 1. Load agent config
    let agent = db
        .get_agent(agent_id)?
        .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_id))?;

    // 2. Load recent conversation history
    let history = db.get_messages(session_id, 20)?;

    // 3. Load relevant memories
    let memories = db.search_memory(agent_id, user_message, 5)?;
    let memory_context = if !memories.is_empty() {
        let mem_lines: Vec<String> = memories
            .iter()
            .map(|m| format!("[{}] {}", m.memory_type, m.content))
            .collect();
        format!("\n\nRelevant memories:\n{}", mem_lines.join("\n"))
    } else {
        String::new()
    };

    // 4. Build messages
    let mut messages: Vec<OpenAIMessage> = Vec::new();


    let skill_context = match db.get_skills_for_agent(agent_id) {
        Ok(skills) if !skills.is_empty() => {
            let skill_lines: Vec<String> = skills
                .iter()
                .map(|s| format!("{} {}: {}", s.emoji, s.name, s.instructions))
                .collect();
            format!("\n\nActive skills:\n{}", skill_lines.join("\n\n"))
        }
        _ => String::new(),
    };
    let system_prompt = build_system_prompt(db, &agent, &memory_context, &skill_context);
    messages.push(OpenAIMessage {
        role: "system".to_string(),
        content: Some(system_prompt),
        tool_call_id: None,
        tool_calls: None,
    });

    let mut prev_had_tool_calls_stream = false;
    for msg in &history {
        if msg.role == "tool" && !prev_had_tool_calls_stream {
            continue;
        }
        prev_had_tool_calls_stream = msg.role == "assistant" && msg.tool_name.is_some();
        let tool_calls = if msg.role == "assistant" && msg.tool_name.is_some() {
            let args = msg.tool_args.as_deref().unwrap_or("{}");
            let call_id = msg.tool_call_id.as_deref().unwrap_or("call_reconstructed");
            Some(vec![serde_json::json!({
                "id": call_id,
                "type": "function",
                "function": { "name": msg.tool_name.as_ref().unwrap(), "arguments": args }
            })])
        } else {
            None
        };
        messages.push(OpenAIMessage {
            role: msg.role.clone(),
            content: if msg.content.is_empty() {
                None
            } else {
                Some(msg.content.clone())
            },
            tool_call_id: msg.tool_call_id.clone(),
            tool_calls,
        });
    }

    messages.push(OpenAIMessage {
        role: "user".to_string(),
        content: Some(user_message.to_string()),
        tool_call_id: None,
        tool_calls: None,
    });

    // 5. Store user message before streaming
    db.add_message(session_id, "user", user_message, 0, None, None, None)?;

    // 6. Get tool definitions — smart-filtered to message context
    let tool_defs = get_filtered_tools(user_message, MAX_CLOUD_TOOLS);

    // 7. Tool calling loop (non-streaming for tool detection, streaming for final text)
    let mut final_response: Option<ModelResponse> = None;

    for iteration in 0..MAX_TOOL_ITERATIONS {
        let is_final_pass = iteration == MAX_TOOL_ITERATIONS - 1;

        // For intermediate passes, use non-streaming to reliably capture tool_calls
        let response = cloud_chat_with_fallback(
            Some(&agent.model_alias),
            messages.clone(),
            max_tokens,
            Some(tool_defs.clone()),
        )
        .await?;

        // If no tool calls, stream the final response
        if response.tool_calls.is_empty() {
            // If this is the first iteration with no tools, we can stream the response
            // But since we already got it non-streaming, just emit it as chunks
            on_chunk(&response.content)?;
            final_response = Some(response);
            break;
        }

        // Execute tool calls
        for tool_call in &response.tool_calls {
            log::info!(
                "[Engine/Stream] Tool call: {}({})",
                tool_call.name,
                tool_call.arguments
            );

            let args: Value = serde_json::from_str(&tool_call.arguments)
                .unwrap_or_else(|_| serde_json::json!({}));

            // Execute the tool with user context
            let user_id = get_session_user_id(db, session_id);
            if user_id.is_empty() {
                log::error!("[process_turn] No user_id found for session {}", session_id);
                return Ok(ModelResponse {
                    content: "Error: No user session found. Please sign in.".to_string(),
                    model: "error".to_string(),
                    provider_id: "error".to_string(),
                    provider_name: "error".to_string(),
                    tokens_used: 0,
                    latency_ms: 0,
                    tool_calls: vec![],
                });
            }
            let tool_result = tools::execute_tool(&tool_call.name, &args, &user_id).await?;

            let result_content = if tool_result.success {
                tool_result.output.clone()
            } else {
                // Tools put real error messages in EITHER output (actual tool error)
                // or error (structured error). Prefer output > error > "Unknown error".
                let display = tool_result
                    .output
                    .is_empty()
                    .then_some(())
                    .and_then(|_| tool_result.error.clone())
                    .or_else(|| {
                        let out = &tool_result.output;
                        if out.is_empty() { None } else { Some(out.clone()) }
                    })
                    .unwrap_or_else(|| "Unknown error".to_string());
                eprintln!("[ENGINE ERROR] tool={}, display='{}', full={:?}", tool_call.name, display, tool_result);
                log::error!("[ENGINE] tool_name={}, display={}", tool_call.name, display);
                format!("Error: {}", display)
            };

            // Notify the frontend about the tool call
            on_chunk(&format!(
                "\n🔧 *{}*\n{}\n",
                tool_call.name,
                &result_content[..result_content.len().min(500)]
            ))?;

            // Add assistant message with tool_calls
            messages.push(OpenAIMessage {
                role: "assistant".to_string(),
                content: response.content.clone().into(),
                tool_call_id: None,
                tool_calls: Some(vec![serde_json::json!({
                    "id": tool_call.id,
                    "type": "function",
                    "function": {
                        "name": tool_call.name,
                        "arguments": tool_call.arguments,
                    }
                })]),
            });

            // Add tool result
            messages.push(OpenAIMessage {
                role: "tool".to_string(),
                content: Some(result_content.clone()),
                tool_call_id: Some(tool_call.id.clone()),
                tool_calls: None,
            });

            // Store assistant message with tool_calls
            db.add_message_with_tools(
                session_id,
                "assistant",
                &response.content,
                0,
                Some(&response.model),
                Some(&response.provider_id),
                Some(response.latency_ms),
                Some(&tool_call.id),
                Some(&tool_call.name),
                Some(&tool_call.arguments),
                None,
            )?;
            // Store tool result
            db.add_message_with_tools(
                session_id,
                "tool",
                &result_content,
                0,
                None,
                None,
                None,
                Some(&tool_call.id),
                Some(&tool_call.name),
                Some(&tool_call.arguments),
                Some(&result_content),
            )?;
        }

        // Last iteration — force no tools, get final text
        if is_final_pass {
            let final_resp = cloud_chat_with_fallback(
                Some(&agent.model_alias),
                messages.clone(),
                max_tokens,
                None,
            )
            .await?;
            on_chunk(&final_resp.content)?;
            final_response = Some(final_resp);
        }
    }

    let response = final_response.expect("Tool loop should always produce a final response");

    // 8. Store assistant response
    db.add_message(
        session_id,
        "assistant",
        &response.content,
        response.tokens_used,
        Some(&response.model),
        Some(&response.provider_id),
        Some(response.latency_ms),
    )?;

    Ok(response)
}

/// Build the system prompt for an agent.
fn build_system_prompt(
    db: &super::db::EngineDb,
    agent: &super::types::Agent,
    memory_context: &str,
    skill_context: &str,
) -> String {
    let mut prompt = String::new();

    // User identity — injected from profile so Conflux knows who they're talking to
    if let Ok(Some(user_name)) = db.get_config("user_name") {
        if !user_name.is_empty() {
            prompt.push_str(&format!("The user's name is {}. Always address them by name when appropriate.\n\n", user_name));
        }
    }

    // Agent identity
    prompt.push_str(&format!("You are {}, {}.\n\n", agent.name, agent.role));

    // Soul (personality)
    if let Some(soul) = &agent.soul {
        prompt.push_str(&format!("Your personality:\n{}\n\n", soul));
    }

    // Instructions
    if let Some(instructions) = &agent.instructions {
        prompt.push_str(&format!("Your instructions:\n{}\n\n", instructions));
    }

    // Memory context
    if !memory_context.is_empty() {
        prompt.push_str(memory_context);
        prompt.push('\n');
    }

    // Active skills
    if !skill_context.is_empty() {
        prompt.push_str(skill_context);
    }

    // Tool usage instructions — be direct about expectations
    prompt.push_str(
        "\nYou have access to tools. When the user asks you to do something actionable — add an item, create something, look something up, send a message, make a plan — YOU MUST call a tool. Do NOT just describe what you would do. Actually call the tool.\n",
    );
    prompt.push_str(
        "\nTo call a tool, respond with a JSON object like:\n",
    );
    prompt.push_str(
        "{\"name\": \"tool_name\", \"arguments\": {\"arg1\": \"value1\"}}\n",
    );
    // ── Few-shot examples: show correct tool-calling in practice ──
    prompt.push_str(
        "\nEXAMPLES — always respond with ONLY the JSON tool call, nothing else:\n",
    );
    prompt.push_str(
        "User: \"I want to run a marathon by December\"\n",
    );
    prompt.push_str(
        "{\"name\": \"dream_add\", \"arguments\": {\"title\": \"Run a marathon by December\", \"category\": \"health\", \"target_date\": \"2026-12-31\"}}\n",
    );
    prompt.push_str(
        "User: \"Add chicken stir fry to my meals\"\n",
    );
    prompt.push_str(
        "{\"name\": \"kitchen_add_meal\", \"arguments\": {\"name\": \"Chicken stir fry\", \"meal_type\": \"dinner\", \"ingredients\": \"chicken, broccoli, soy sauce\"}}\n",
    );
    prompt.push_str(
        "User: \"Switch to the pulse theme\"\n",
    );
    prompt.push_str(
        "{\"name\": \"ui_action\", \"arguments\": {\"widget\": \"theme\", \"value\": \"pulse\"}}\n",
    );
    prompt.push_str(
        "User: \"Switch to the echo theme\"\n",
    );
    prompt.push_str(
        "{\"name\": \"ui_action\", \"arguments\": {\"widget\": \"theme\", \"value\": \"echo\"}}\n",
    );
    prompt.push_str(
        "User: \"Change theme to viper\"\n",
    );
    prompt.push_str(
        "{\"name\": \"ui_action\", \"arguments\": {\"widget\": \"theme\", \"value\": \"viper\"}}\n",
    );
    prompt.push_str(
        "User: \"Set theme to nexus\"\n",
    );
    prompt.push_str(
        "{\"name\": \"ui_action\", \"arguments\": {\"widget\": \"theme\", \"value\": \"nexus\"}}\n",
    );
    prompt.push_str(
        "User: \"I spent $40 on groceries\"\n",
    );
    prompt.push_str(
        "{\"name\": \"budget_add_entry\", \"arguments\": {\"amount\": 40.0, \"category\": \"groceries\", \"description\": \"Grocery run\"}}\n",
    );
    prompt.push_str(
        "User: \"Remind me to call the dentist Thursday\"\n",
    );
    prompt.push_str(
        "{\"name\": \"life_add_reminder\", \"arguments\": {\"title\": \"Call dentist\", \"due_date\": \"2026-05-07\", \"priority\": \"high\"}}\n",
    );
    prompt.push_str(
        "User: \"I'm feeling anxious about work\"\n",
    );
    prompt.push_str(
        "{\"name\": \"echo_write_entry\", \"arguments\": {\"entry_type\": \"journal\", \"content\": \"Feeling anxious about work...\"}}\n",
    );
    prompt.push_str(
        "User: \"Show me my tasks\"\n",
    );
    prompt.push_str(
        "{\"name\": \"life_list_tasks\", \"arguments\": {}}\n",
    );
    prompt.push_str(
        "\nRespond with ONLY the JSON. No explanation. No narration. No markdown.\n",
    );
    prompt.push_str(
        "\nAvailable tool categories: kitchen (meals, inventory, grocery, planning), life (tasks, habits, goals), feed (ripples, threads), vault (notes), echo (wellbeing), and general tools (calculator, web search).\n",
    );
    prompt.push_str(
        "\nAlways prefer searching the web for current information rather than guessing. Use the calculator for math.\n",
    );
    prompt.push_str(
        "\nUI CONTROL: You can change the app's appearance using the ui_action tool.\n",
    );
    prompt.push_str(
        "Theme (widget=\"theme\"):\n",
    );
    prompt.push_str(
        "  - Base: \"dark\" (default), \"light\", \"system\"\n",
    );
    prompt.push_str(
        "  - Color themes: \"conflux\" (⚡), \"nexus\" (🌐), \"hearth\" (🔥), \"pulse\" (💚), \"orbit\" (🛸), \"radar\" (📡), \"horizon\" (🌅), \"echo\" (🔔), \"aegis\" (🛡️), \"viper\" (🐍)\n",
    );
    prompt.push_str(
        "  - Color themes set the accent color AND wallpaper — full visual transformation.\n",
    );
    prompt.push_str(
        "  - Example: ui_action { widget: \"theme\", value: \"echo\" } or ui_action { widget: \"theme\", value: \"pulse\" }\n",
    );
    prompt.push_str(
        "Accent color (widget=\"accentColor\"): \"blue\", \"purple\", \"green\", \"orange\", \"pink\", \"cyan\".\n",
    );
    prompt.push_str(
        "Navigate apps (widget=\"activeApp\"): \"dashboard\", \"kitchen\", \"budget\", \"life\", \"dreams\", \"echo\", \"vault\", \"home\".\n",
    );
    prompt.push_str(
        "\nINTENT MAPPING — call the right tool immediately, no narration:\n",
    );
    prompt.push_str(
        "- User mentions a goal or dream → call dream_add\n",
    );
    prompt.push_str(
        "- User mentions cooking or a meal → call kitchen_add_meal\n",
    );
    prompt.push_str(
        "- User mentions spending money → call budget_add_entry\n",
    );
    prompt.push_str(
        "- User mentions a task or to-do → call life_add_task\n",
    );
    prompt.push_str(
        "- User asks to change app theme/appearance → call ui_action\n",
    );
    prompt.push_str(
        "- User says something emotional or wants to reflect → call echo_write_entry\n",
    );
    prompt.push_str(
        "\nBe helpful, concise, and in-character. If you do not know something, say so honestly.\n",
    );
    // Anti-hallucination rules — tight constraints to prevent hallucinated tool names
    prompt.push_str(
        "\nANTI-HALLUCINATION RULES:\n",
    );
    prompt.push_str(
        "- NEVER invent a tool name not in your tool list. Call a simpler related tool or admit you don't know.\n",
    );
    prompt.push_str(
        "- NEVER add parameters not in the tool's schema. Use only the listed parameters.\n",
    );
    prompt.push_str(
        "- NEVER narrate what you are about to do — call the tool directly.\n",
    );
    prompt.push_str(
        "- If unsure about an app control, call ui_action with the most reasonable widget and note uncertainty.\n",
    );
    prompt.push_str(
        "- If not confident about a fact, say so. Use web_search instead of guessing.\n",
    );
    prompt.push_str(
        "- Do not make up names, dates, numbers, or IDs. Use actual values from tool results or admit you don't have them.\n",
    );
    prompt.push_str(
        "- If a tool fails, read the error and respond honestly — do not retry with invented parameters.\n",
    );

    prompt
}

// ── Offline System Prompt ──

/// Build a minimal system prompt for offline/local mode.
/// Target: <500 tokens. No tools, no memories, no skills, no few-shot examples.
/// Just identity + basic conversational instructions.
fn build_offline_system_prompt(
    db: &super::db::EngineDb,
    agent: &super::types::Agent,
) -> String {
    let mut prompt = String::new();

    // User name (one line)
    if let Ok(Some(user_name)) = db.get_config("user_name") {
        if !user_name.is_empty() {
            prompt.push_str(&format!("The user's name is {}.\n\n", user_name));
        }
    }

    // Agent identity — name + role only, no soul dump
    prompt.push_str(&format!("You are {}, {}.\n\n", agent.name, agent.role));

    // Brief personality (first 2 sentences of soul if available)
    if let Some(soul) = &agent.soul {
        let brief: String = soul
            .split(". ")
            .take(2)
            .collect::<Vec<_>>()
            .join(". ");
        if !brief.is_empty() {
            prompt.push_str(&format!("{}\n\n", brief));
        }
    }

    // Basic instructions — conversational only
    prompt.push_str(
        "You are a helpful, friendly AI assistant. Respond conversationally. \
         Keep responses concise and natural. You do NOT have access to tools right now — \
         just talk to the user like a friend would. If they ask you to do something \
         that requires tools, explain you can't do that in offline mode but you're \
         happy to chat.",
    );

    prompt
}

/// Process a chat turn in offline mode — local inference only, no cloud path.
/// This is the hard offline path. If local fails, it returns an error, not cloud.
/// Optimized for speed: minimal prompt, no tools, no memories, no synthesis call.
async fn local_offline_turn(
    db: &EngineDb,
    session_id: &str,
    agent_id: &str,
    user_message: &str,
    _max_tokens: Option<i64>,
) -> Result<ModelResponse> {
    use super::local_ai::get_or_init_local_ai;

    let turn_start = std::time::Instant::now();
    log::info!("[Engine][Offline] Processing turn for agent '{}', session '{}'", agent_id, session_id);

    // Load agent config
    let agent = db
        .get_agent(agent_id)?
        .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_id))?;

    // Build MINIMAL system prompt — no tools, no memories, no skills
    let system_prompt = build_offline_system_prompt(db, &agent);

    // Get local llama-server manager
    let manager = get_or_init_local_ai().await
        .ok_or_else(|| anyhow::anyhow!("Local AI not available — llama-server not running"))?;

    // Emit thinking state
    let state_manager = super::state_manager::get_state_manager();
    let _ = state_manager.lock().map(|mut mgr| {
        mgr.transition_with_context(
            super::state_events::ConfluxState::Thinking,
            Some(agent_id.to_string()),
            Some(session_id.to_string()),
            Some(serde_json::json!({
                "model": "local-offline",
                "mode": "offline"
            })),
        )
    });

    // Build message array — minimal history for speed
    // IMPORTANT: Gemma Jinja template only supports user/model roles (no "system")
    // System prompt merged into the first user message
    let mut messages: Vec<serde_json::Value> = Vec::new();

    // Only last 1 exchange (2 messages) — CPU inference is slow with long context
    let history = db.get_messages(session_id, 4)?;
    let mut last_role = String::new();
    let mut system_merged = false;
    let mut started = false;
    let history_limit = 2; // 1 exchange — maximum speed
    for msg in history.iter().take(history_limit) {
        if msg.role == "user" || msg.role == "assistant" {
            let effective_role = if msg.role == "assistant" { "model" } else { "user" };

            // Skip leading model messages — conversation must start with user
            if !started && effective_role == "model" {
                continue;
            }
            started = true;

            if effective_role == last_role {
                // Merge with previous message of same role
                if let Some(last) = messages.last_mut() {
                    if let Some(content) = last.get_mut("content") {
                        if let Some(s) = content.as_str() {
                            *content = serde_json::json!(format!("{}\n{}", s, msg.content));
                        }
                    }
                }
            } else {
                // For the first user message, prepend the system prompt
                if effective_role == "user" && !system_merged {
                    let combined = format!("{}\n\n{}", system_prompt, msg.content);
                    messages.push(serde_json::json!({"role": "user", "content": combined}));
                    system_merged = true;
                } else {
                    messages.push(serde_json::json!({
                        "role": effective_role,
                        "content": msg.content
                    }));
                }
                last_role = effective_role.to_string();
            }
        }
    }

    // Add user's new message (with system prompt if not yet merged)
    if last_role == "user" {
        // Merge with last user message
        if let Some(last) = messages.last_mut() {
            if let Some(content) = last.get_mut("content") {
                if let Some(s) = content.as_str() {
                    *content = serde_json::json!(format!("{}\n{}", s, user_message));
                }
            }
        }
    } else {
        let content = if !system_merged {
            format!("{}\n\n{}", system_prompt, user_message)
        } else {
            user_message.to_string()
        };
        messages.push(serde_json::json!({"role": "user", "content": content}));
    }

    // Log prompt size for diagnostics
    let total_chars: usize = messages.iter()
        .filter_map(|m| m.get("content").and_then(|c| c.as_str()).map(|s| s.len()))
        .sum();
    let role_seq: Vec<&str> = messages.iter().filter_map(|m| m.get("role").and_then(|r| r.as_str())).collect();
    log::info!(
        "[Engine][Offline] Prompt: {} chars (~{} tokens), {} messages, roles: {:?}",
        total_chars, total_chars / 4, messages.len(), role_seq
    );

    // Persist user message so chat history is saved
    db.add_message(session_id, "user", user_message, 0, None, None, None)?;

    // Single model call via chat completions API (uses model's built-in chat template)
    // Note: 128 tokens is sufficient for tool calls; keep low for CPU inference speed
    let llm_start = std::time::Instant::now();
    let content = manager.chat_completion(&messages, 128, 0.7).await
        .map_err(|e| anyhow::anyhow!("Local chat completion failed: {}", e))?;
    let llm_ms = llm_start.elapsed().as_millis();
    log::info!("[Engine][Offline] LLM responded in {}ms, {} chars", llm_ms, content.len());

    // Clean up any UNK byte artifacts (for fine-tuned models that may produce them)
    let cleaned = regex::Regex::new(r"\[UNK_BYTE_[^\]]*\]")
        .unwrap()
        .replace_all(&content, "")
        .replace('▁', "")
        .trim()
        .to_string();

    // Store assistant message
    db.add_message(session_id, "assistant", &cleaned, 0, Some("local-offline"), Some("local"), None)?;

    // Emit done state
    let _ = state_manager.lock().map(|mut mgr| {
        mgr.transition_with_context(
            super::state_events::ConfluxState::Speaking,
            Some(agent_id.to_string()),
            Some(session_id.to_string()),
            None,
        )
    });

    let total_ms = turn_start.elapsed().as_millis();
    log::info!("[Engine][Offline] Turn complete in {}ms total (LLM: {}ms)", total_ms, llm_ms);

    Ok(ModelResponse {
        content: cleaned,
        model: "local-offline".to_string(),
        provider_id: "local".to_string(),
        provider_name: "Local AI (Offline)".to_string(),
        tokens_used: 0,
        latency_ms: total_ms as i64,
        tool_calls: vec![], // No tools in offline mode
    })
}

// ── Session Compaction ──

const COMPACTION_THRESHOLD: i64 = 50; // compact when session has 50+ messages
const COMPACTION_KEEP_RECENT: i64 = 20; // always keep last 20 messages raw

/// Check if a session needs compaction and run it if so.
async fn maybe_compact_session(
    db: &super::db::EngineDb,
    session_id: &str,
    agent_id: &str,
) -> Result<()> {
    let count = db.count_messages(session_id)?;
    if count < COMPACTION_THRESHOLD {
        return Ok(());
    }

    log::info!(
        "[Compaction] Session {} has {} messages, compacting...",
        session_id,
        count
    );

    // Get old messages (everything except last 20)
    let old_messages = db.get_old_messages(session_id, COMPACTION_KEEP_RECENT)?;
    if old_messages.is_empty() {
        return Ok(());
    }

    // Build a text summary from old messages
    let summary = build_compaction_summary(&old_messages);

    // Store as memory
    let memory_key = format!("compaction-{}", &session_id[..8.min(session_id.len())]);
    db.store_memory(
        agent_id,
        "compaction",
        Some(&memory_key),
        &summary,
        Some(session_id),
    )?;

    // Delete old messages
    let message_ids: Vec<String> = old_messages.iter().map(|m| m.id.clone()).collect();
    let deleted = db.delete_messages(&message_ids)?;

    log::info!(
        "[Compaction] Compacted {} messages into memory for session {}",
        deleted,
        session_id
    );

    // Log telemetry
    let _ = db.log_event(
        "session_compacted",
        Some(agent_id),
        Some(session_id),
        Some(
            &serde_json::json!({
                "messages_compacted": deleted,
                "summary_length": summary.len(),
            })
            .to_string(),
        ),
    );

    Ok(())
}

/// Build a text summary from a list of messages.
/// Extracts user questions, assistant responses, and tool calls.
fn build_compaction_summary(messages: &[super::types::Message]) -> String {
    let mut summary = String::new();
    let msg_count = messages.len();

    // Time range
    if let (Some(first), Some(last)) = (messages.first(), messages.last()) {
        summary.push_str(&format!(
            "Conversation summary ({} messages, {} → {}):\n\n",
            msg_count,
            &first.created_at[..16.min(first.created_at.len())],
            &last.created_at[..16.min(last.created_at.len())],
        ));
    }

    // Extract key exchanges (user questions + assistant answers)
    let mut i = 0;
    while i < messages.len() {
        let msg = &messages[i];

        match msg.role.as_str() {
            "user" => {
                // Truncate long user messages
                let content = truncate(&msg.content, 200);
                summary.push_str(&format!("User: {}\n", content));

                // Look for the next assistant response
                if i + 1 < messages.len() && messages[i + 1].role == "assistant" {
                    let resp = truncate(&messages[i + 1].content, 300);
                    summary.push_str(&format!("Assistant: {}\n\n", resp));
                    i += 2;
                } else {
                    summary.push('\n');
                    i += 1;
                }
            }
            "tool" => {
                // Note tool usage briefly
                if let Some(ref tool_name) = msg.tool_name {
                    summary.push_str(&format!("[Tool: {}]\n", tool_name));
                }
                i += 1;
            }
            _ => {
                i += 1;
            }
        }
    }

    summary.push_str("\n(Older conversation was compacted. Recent messages are preserved.)\n");
    summary
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max])
    }
}

/// Attempt to route a user message through the local AI model.
/// Returns Some(ModelResponse) if local routing succeeded, None if unavailable or failed.
/// Uses the persistent llama-server instance (started once, reused across requests).
/// Falls through silently — never blocks the cloud path.
async fn try_local_routing(
    user_message: &str,
    tool_defs: &[serde_json::Value],
) -> Option<ModelResponse> {
    use super::local_ai::{get_or_init_local_ai, local_tool_route};

    let manager = get_or_init_local_ai().await?;

    match local_tool_route(&manager, user_message, tool_defs).await {
        Ok(response) => Some(response),
        Err(e) => {
            log::warn!("[LocalAI] Routing failed: {}", e);
            None
        }
    }
}
