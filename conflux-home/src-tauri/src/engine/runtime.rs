// Conflux Engine — Agent Runtime
// The reasoning loop: receive message → think → act → observe → respond.
// Includes tool calling loop with up to 3 iterations.

use anyhow::Result;
use serde_json::Value;

use super::db::EngineDb;
use super::cloud;
use super::router::OpenAIMessage;
use super::router::ModelResponse;
use super::tools;
use super::state_events::ConfluxState;

const MAX_TOOL_ITERATIONS: usize = 3;

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

/// Process a chat turn for an agent: take user input, think, potentially call tools, respond.
pub async fn process_turn(
    db: &EngineDb,
    session_id: &str,
    agent_id: &str,
    user_message: &str,
    max_tokens: Option<i64>,
) -> Result<ModelResponse> {
    // 1. Load agent config
    let agent = db.get_agent(agent_id)?
        .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_id))?;

    // 2. Load recent conversation history (last 20 messages)
    let history = db.get_messages(session_id, 20)?;

    // 3. Load relevant memories
    let memories = db.search_memory(agent_id, user_message, 5)?;
    let memory_context = if !memories.is_empty() {
        let mem_lines: Vec<String> = memories.iter()
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
            let skill_lines: Vec<String> = skills.iter()
                .map(|s| format!("{} {}: {}", s.emoji, s.name, s.instructions))
                .collect();
            format!("\n\nActive skills:\n{}", skill_lines.join("\n\n"))
        }
        _ => String::new(),
    };
    let system_prompt = build_system_prompt(&agent, &memory_context, &skill_context);
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
            content: if msg.content.is_empty() { None } else { Some(msg.content.clone()) },
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

    // 6. Get tool definitions
    let mut tool_defs = tools::get_tool_definitions();
    tool_defs.extend(tools::get_integration_tool_definitions());
    tool_defs.extend(tools::get_app_tool_definitions());

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

    // 8. Tool calling loop
    let mut total_tokens: i64 = 0;
    let mut final_response: Option<ModelResponse> = None;

    for iteration in 0..MAX_TOOL_ITERATIONS {
        let response = cloud::cloud_chat(
            Some(&agent.model_alias),
            messages.clone(),
            max_tokens,
            None,
            if iteration == 0 || !tool_defs.is_empty() { Some(tool_defs.clone()) } else { None },
        ).await?;

        total_tokens += response.tokens_used;

        // If no tool calls, we're done
        if response.tool_calls.is_empty() {
            final_response = Some(response);
            break;
        }

        // Execute tool calls
        for tool_call in &response.tool_calls {
            log::info!("[Engine] Tool call: {}({})", tool_call.name, tool_call.arguments);

            // Parse arguments
            let args: Value = serde_json::from_str(&tool_call.arguments)
                .unwrap_or_else(|_| serde_json::json!({}));

            // Execute the tool with user context
            let user_id = get_session_user_id(db, session_id);
            let tool_result = tools::execute_tool(&tool_call.name, &args, &user_id).await?;

            let result_content = if tool_result.success {
                tool_result.output.clone()
            } else {
                format!("Error: {}", tool_result.error.unwrap_or_else(|| "Unknown error".to_string()))
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
                        "name": tool_call.name,
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

            log::info!("[Engine] Tool result: {}", &result_content[..result_content.len().min(200)]);
        }

        // If this was the last iteration, force no tools
        if iteration == MAX_TOOL_ITERATIONS - 1 {
            let final_resp = cloud::cloud_chat(
                Some(&agent.model_alias),
                messages.clone(),
                max_tokens,
                None,
                None, // No tools on final pass
            ).await?;
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
    let _ = super::memory::extract_and_store(db, session_id, agent_id, user_message, &response.content).await;

    // 10. Log telemetry
    let _ = db.log_event(
        "message_processed",
        Some(agent_id),
        Some(session_id),
        Some(&serde_json::json!({
            "model": response.model,
            "provider": response.provider_id,
            "tokens": total_tokens,
            "latency_ms": response.latency_ms,
            "tool_calls": response.tool_calls.len(),
        }).to_string()),
    );

    // 11. Session compaction (if over threshold)
    let _ = maybe_compact_session(db, session_id, agent_id).await;

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
    // 1. Load agent config
    let agent = db.get_agent(agent_id)?
        .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_id))?;

    // 2. Load recent conversation history
    let history = db.get_messages(session_id, 20)?;

    // 3. Load relevant memories
    let memories = db.search_memory(agent_id, user_message, 5)?;
    let memory_context = if !memories.is_empty() {
        let mem_lines: Vec<String> = memories.iter()
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
            let skill_lines: Vec<String> = skills.iter()
                .map(|s| format!("{} {}: {}", s.emoji, s.name, s.instructions))
                .collect();
            format!("\n\nActive skills:\n{}", skill_lines.join("\n\n"))
        }
        _ => String::new(),
    };
    let system_prompt = build_system_prompt(&agent, &memory_context, &skill_context);
    messages.push(OpenAIMessage {
        role: "system".to_string(),
        content: Some(system_prompt),
        tool_call_id: None,
        tool_calls: None,
    });

    let mut prev_had_tool_calls_stream = false;
    for msg in &history {
        if msg.role == "tool" && !prev_had_tool_calls_stream { continue; }
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
            content: if msg.content.is_empty() { None } else { Some(msg.content.clone()) },
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

    // 6. Get tool definitions
    let mut tool_defs = tools::get_tool_definitions();
    tool_defs.extend(tools::get_integration_tool_definitions());
    tool_defs.extend(tools::get_app_tool_definitions());

    // 7. Tool calling loop (non-streaming for tool detection, streaming for final text)
    let mut final_response: Option<ModelResponse> = None;

    for iteration in 0..MAX_TOOL_ITERATIONS {
        let is_final_pass = iteration == MAX_TOOL_ITERATIONS - 1;

        // For intermediate passes, use non-streaming to reliably capture tool_calls
        let response = cloud::cloud_chat(
            Some(&agent.model_alias),
            messages.clone(),
            max_tokens,
            None,
            Some(tool_defs.clone()),
        ).await?;

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
            log::info!("[Engine/Stream] Tool call: {}({})", tool_call.name, tool_call.arguments);

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
                format!("Error: {}", tool_result.error.unwrap_or_else(|| "Unknown error".to_string()))
            };

            // Notify the frontend about the tool call
            on_chunk(&format!("\n🔧 *{}*\n{}\n", tool_call.name, &result_content[..result_content.len().min(500)]))?;

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
            db.add_message_with_tools(session_id, "assistant", &response.content, 0, Some(&response.model), Some(&response.provider_id), Some(response.latency_ms), Some(&tool_call.id), Some(&tool_call.name), Some(&tool_call.arguments), None)?;
            // Store tool result
            db.add_message_with_tools(session_id, "tool", &result_content, 0, None, None, None, Some(&tool_call.id), Some(&tool_call.name), Some(&tool_call.arguments), Some(&result_content))?;
        }

        // Last iteration — force no tools, get final text
        if is_final_pass {
            let final_resp = cloud::cloud_chat(
                Some(&agent.model_alias),
                messages.clone(),
                max_tokens,
                None,
                None,
            ).await?;
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
    agent: &super::types::Agent,
    memory_context: &str,
    skill_context: &str,
) -> String {
    let mut prompt = String::new();

    // Agent identity
    prompt.push_str(&format!(
        "You are {}, {}.\n\n",
        agent.name, agent.role
    ));

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

    // Tool usage instructions
    prompt.push_str("\nYou have access to tools. Use them when they would help you answer accurately. ");
    prompt.push_str("Always prefer searching the web for current information rather than guessing. ");
    prompt.push_str("Use the calculator for math. Use file tools to read/write when asked.\n");
    prompt.push_str("\nBe helpful, concise, and in-character. If you don't know something, say so honestly.");

    prompt
}

// ── Session Compaction ──

const COMPACTION_THRESHOLD: i64 = 50;  // compact when session has 50+ messages
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

    log::info!("[Compaction] Session {} has {} messages, compacting...", session_id, count);

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

    log::info!("[Compaction] Compacted {} messages into memory for session {}", deleted, session_id);

    // Log telemetry
    let _ = db.log_event(
        "session_compacted",
        Some(agent_id),
        Some(session_id),
        Some(&serde_json::json!({
            "messages_compacted": deleted,
            "summary_length": summary.len(),
        }).to_string()),
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
