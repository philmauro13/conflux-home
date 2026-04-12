// Conflux Engine — Tauri Commands
// All invoke() handlers live here. Lib.rs stays clean.

use tauri::{Manager, Emitter};
use serde::{Deserialize, Serialize};
use chrono::{Datelike, Timelike};
use uuid::Uuid;
use super::engine;
use super::engine::cloud;
use super::engine::router::{self, OpenAIMessage};
use super::engine::commands::voice_commands;

// ── Request/Response Types ──

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    pub session_id: String,
    pub agent_id: String,
    pub message: String,
    pub max_tokens: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub content: String,
    pub model: String,
    pub provider_id: String,
    pub provider_name: String,
    pub tokens_used: i64,
    pub latency_ms: i64,
    pub calls_remaining: i64,
    pub credits_remaining: Option<i64>,
    pub credit_source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model_id: String,
    pub model_alias: String,
    pub priority: i32,
    pub is_enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentUpdateRequest {
    pub id: String,
    pub name: Option<String>,
    pub emoji: Option<String>,
    pub role: Option<String>,
    pub soul: Option<String>,
    pub instructions: Option<String>,
    pub model_alias: Option<String>,
}

// ── Echo Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoEntry {
    pub id: String,
    pub content: String,
    pub mood: Option<String>,
    pub tags: Vec<String>,
    pub is_voice: bool,
    pub word_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoPattern {
    pub id: String,
    pub pattern_type: String,
    pub title: String,
    pub description: String,
    pub confidence: f64,
    pub data_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoDigest {
    pub id: String,
    pub week_start: String,
    pub summary: String,
    pub themes: Vec<String>,
    pub mood_trajectory: Vec<Option<String>>,
    pub highlights: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoWriteRequest {
    pub content: String,
    pub mood: Option<String>,
    pub tags: Option<Vec<String>>,
    pub is_voice: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoDailyBrief {
    pub today_entries: Vec<EchoEntry>,
    pub total_entries: i32,
    pub current_streak: i32,
    pub avg_words_per_entry: f64,
    pub top_mood: Option<String>,
    pub recent_themes: Vec<String>,
}

// ── Chat Commands ──

#[tauri::command]
pub async fn engine_chat(window: tauri::Window, req: ChatRequest) -> Result<ChatResponse, String> {
    let engine = engine::get_engine();

    // Get real Supabase user ID for cloud credit operations
    let user_id = get_supabase_user_id();

    // Check quota (cloud-aware)
    let quota = engine.has_quota(&user_id).await.map_err(|e| e.to_string())?;
    if !quota.allowed {
        return Err(format!("{} limit reached. Upgrade for more credits.", quota.source));
    }

    let _ = window.emit("engine:thinking", ());

    let response = engine.chat(
        &req.session_id,
        &req.agent_id,
        &req.message,
        req.max_tokens,
    ).await.map_err(|e| e.to_string())?;

    let calls = engine.increment_quota(&user_id, response.tokens_used, &response.provider_id)
        .map_err(|e| e.to_string())?;

    let limit = get_daily_limit(engine);

    // Log to cloud and charge credits (fire and forget)
    let credit_costs = super::engine::cloud::get_credit_costs().await.unwrap_or_default();
    let credits = super::engine::cloud::credit_cost_for_model(&response.model, &response.provider_id, "core", &credit_costs);

    let _ = super::engine::cloud::log_usage_to_cloud(
        &user_id, &req.session_id, &req.agent_id,
        &response.model, &response.provider_id, "core",
        response.tokens_used, response.latency_ms, "success", credits,
    ).await;

    // Charge credits (don't fail the response if this fails for free users)
    let (credits_remaining, credit_source) = match super::engine::cloud::charge_credits(&user_id, credits, "").await {
        Ok(new_balance) => (Some(new_balance), Some(quota.source.clone())),
        Err(e) => {
            log::warn!("[Engine] Credit charge failed: {}", e);
            (None, None)
        }
    };

    Ok(ChatResponse {
        content: response.content,
        model: response.model,
        provider_id: response.provider_id,
        provider_name: response.provider_name,
        tokens_used: response.tokens_used,
        latency_ms: response.latency_ms,
        calls_remaining: (limit - calls).max(0),
        credits_remaining,
        credit_source,
    })
}

#[tauri::command]
pub async fn engine_chat_stream(window: tauri::Window, req: ChatRequest) -> Result<(), String> {
    log::info!("[engine_chat_stream] ══════════════════════════════════════════");
    log::info!("[engine_chat_stream] 🚀 START engine_chat_stream command");
    log::info!("[engine_chat_stream] Session ID: {}", req.session_id);
    log::info!("[engine_chat_stream] Agent ID: {}", req.agent_id);
    log::info!("[engine_chat_stream] Message: {}", req.message);
    
    let engine = engine::get_engine();
    log::info!("[engine_chat_stream] ✅ Engine instance obtained");

    // Get real Supabase user ID for cloud credit operations
    let user_id = get_supabase_user_id();
    log::info!("[engine_chat_stream] Supabase user ID: {}", user_id);

    // Check quota (cloud-aware)
    log::info!("[engine_chat_stream] Checking quota for user: {}", user_id);
    let quota = engine.has_quota(&user_id).await.map_err(|e| e.to_string())?;
    log::info!("[engine_chat_stream] Quota check result: allowed={}, source={}", quota.allowed, quota.source);
    if !quota.allowed {
        let msg = format!("{} limit reached. Upgrade for more credits.", quota.source);
        window.emit("engine:error", &msg).map_err(|e| e.to_string())?;
        return Err(msg);
    }

    let _ = window.emit("engine:thinking", ());
    log::info!("[engine_chat_stream] ✅ Sent engine:thinking event");

    log::info!("[engine_chat_stream] Calling engine.chat()...");
    let result = engine.chat(
        &req.session_id,
        &req.agent_id,
        &req.message,
        req.max_tokens,
    ).await;
    log::info!("[engine_chat_stream] engine.chat() returned");

    match result {
        Ok(response) => {
            log::info!("[engine_chat_stream] ✅ engine.chat() SUCCESS");
            log::info!("[engine_chat_stream] Response model: {}", response.model);
            log::info!("[engine_chat_stream] Response provider: {}", response.provider_id);
            log::info!("[engine_chat_stream] Response content length: {}", response.content.len());
            
            let calls = engine.increment_quota(&user_id, response.tokens_used, &response.provider_id)
                .map_err(|e| e.to_string())?;
            log::info!("[engine_chat_stream] Quota incremented: {} calls", calls);

            let limit = get_daily_limit(engine);

            // Log to cloud and charge credits (fire and forget)
            let credit_costs = super::engine::cloud::get_credit_costs().await.unwrap_or_default();
            let credits = super::engine::cloud::credit_cost_for_model(&response.model, &response.provider_id, "core", &credit_costs);
            log::info!("[engine_chat_stream] Credit cost for this request: {}", credits);

            let _ = super::engine::cloud::log_usage_to_cloud(
                &user_id, &req.session_id, &req.agent_id,
                &response.model, &response.provider_id, "core",
                response.tokens_used, response.latency_ms, "success", credits,
            ).await;
            log::info!("[engine_chat_stream] ✅ Logged usage to cloud");

            let credits_remaining = match super::engine::cloud::charge_credits(&user_id, credits, "").await {
                Ok(new_balance) => Some(new_balance),
                Err(e) => {
                    log::warn!("[Engine] Credit charge failed: {}", e);
                    None
                }
            };
            log::info!("[engine_chat_stream] Credits remaining: {:?}", credits_remaining);

            // Emit response in word-chunks for streaming feel
            let words: Vec<&str> = response.content.split_whitespace().collect();
            log::info!("[engine_chat_stream] Emitting {} word chunks...", words.len());
            for chunk in words.chunks(4) {
                let chunk_text = chunk.join(" ") + " ";
                let _ = window.emit("engine:chunk", serde_json::json!({ "text": chunk_text }));
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }

            log::info!("[engine_chat_stream] Sending engine:done event...");
            window.emit("engine:done", serde_json::json!({
                "content": response.content,
                "model": response.model,
                "provider_id": response.provider_id,
                "provider_name": response.provider_name,
                "tokens_used": response.tokens_used,
                "latency_ms": response.latency_ms,
                "calls_remaining": (limit - calls).max(0),
                "credits_remaining": credits_remaining,
                "credit_source": quota.source,
            })).map_err(|e| e.to_string())?;
            log::info!("[engine_chat_stream] ✅ engine:done event sent");
            log::info!("[engine_chat_stream] ══════════════════════════════════════════");

            Ok(())
        }
        Err(e) => {
            log::info!("[engine_chat_stream] ❌ engine.chat() FAILED: {}", e);
            let msg = e.to_string();
            window.emit("engine:error", &msg).map_err(|e| e.to_string())?;
            log::info!("[engine_chat_stream] ❌ Sent engine:error event to UI");
            Err(msg)
        }
    }
}

// ── Session Commands ──

#[tauri::command]
pub fn engine_create_session(agent_id: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let user_id = get_supabase_user_id();
    let session = engine.create_session(&agent_id, &user_id).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(session).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_get_sessions(limit: Option<i64>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let user_id = get_supabase_user_id();
    let sessions = engine.get_sessions(&user_id, limit.unwrap_or(20)).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(sessions).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_get_messages(session_id: String, limit: Option<i64>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let user_id = get_supabase_user_id();
    
    // Verify the session belongs to the current user
    let session = engine.get_session(&session_id).map_err(|e| e.to_string())?;
    match session {
        Some(s) => {
            if s.user_id != user_id {
                return Err("Access denied: session does not belong to user".to_string());
            }
        }
        None => return Err("Session not found".to_string()),
    }
    
    let messages = engine.get_messages(&session_id, limit.unwrap_or(50)).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(messages).map_err(|e| e.to_string())?)
}

// ── Agent Commands ──

#[tauri::command]
pub fn engine_get_agents() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let agents = engine.get_agents().map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(agents).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_update_agent(req: AgentUpdateRequest) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.update_agent(
        &req.id,
        req.name.as_deref(),
        req.emoji.as_deref(),
        req.role.as_deref(),
        req.soul.as_deref(),
        req.instructions.as_deref(),
        req.model_alias.as_deref(),
    ).map_err(|e| e.to_string())
}

// ── Quota Commands ──

#[tauri::command]
pub fn engine_get_quota() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let user_id = get_supabase_user_id();
    let quota = engine.get_quota(&user_id).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(quota).map_err(|e| e.to_string())?)
}

// ── Memory Commands ──

#[tauri::command]
pub fn engine_store_memory(
    agent_id: String,
    memory_type: String,
    key: Option<String>,
    content: String,
    source: Option<String>,
) -> Result<String, String> {
    let engine = engine::get_engine();
    engine.store_memory(
        &agent_id,
        &memory_type,
        key.as_deref(),
        &content,
        source.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_search_memory(agent_id: String, query: String, limit: Option<i64>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let memories = engine.search_memory(&agent_id, &query, limit.unwrap_or(5)).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(memories).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_get_memories(agent_id: String, limit: Option<i64>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let memories = engine.get_all_memories(&agent_id, limit.unwrap_or(50)).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(memories).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_delete_memory(memory_id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.delete_memory(&memory_id).map_err(|e| e.to_string())
}

// ── Provider Commands ──

#[tauri::command]
pub fn engine_get_providers() -> Result<serde_json::Value, String> {
    // Return empty list — providers are now handled server-side by cloud router
    Ok(serde_json::json!({ "providers": [] }))
}

#[tauri::command]
pub fn engine_update_provider(req: ProviderConfig) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.update_provider(
        &req.id,
        &req.name,
        &req.base_url,
        &req.api_key,
        &req.model_id,
        &req.model_alias,
        req.priority,
        req.is_enabled,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_delete_provider(id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.delete_provider(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn engine_test_provider() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let result = engine.test_provider().await;
    match result {
        Ok(info) => Ok(serde_json::json!({
            "success": true,
            "model": info.model,
            "latency_ms": info.latency_ms,
        })),
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "error": e.to_string(),
        })),
    }
}

// ── Provider Template Commands ──

#[derive(Debug, Serialize, Deserialize)]
pub struct InstallTemplateRequest {
    pub template_id: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
}

#[tauri::command]
pub fn engine_get_provider_templates() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let templates = engine.get_provider_templates().map_err(|e| e.to_string())?;

    // Add installed status to each template
    let result: Vec<serde_json::Value> = templates.into_iter().map(|t| {
        let installed = engine.is_template_installed(&t.id).unwrap_or(false);
        serde_json::json!({
            "id": t.id,
            "name": t.name,
            "emoji": t.emoji,
            "description": t.description,
            "base_url": t.base_url,
            "models": t.models,
            "default_model": t.default_model,
            "model_alias": t.model_alias,
            "category": t.category,
            "docs_url": t.docs_url,
            "is_free": t.is_free,
            "is_installed": installed,
        })
    }).collect();

    Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_install_template(req: InstallTemplateRequest) -> Result<String, String> {
    let engine = engine::get_engine();
    engine.install_provider_template(
        &req.template_id,
        req.api_key.as_deref(),
        req.model.as_deref(),
    ).map_err(|e| e.to_string())
}

// ── Provider API Key Config ──
// Direct API keys per provider — no middlemen.

#[tauri::command]
pub fn engine_set_openai_key(api_key: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.set_openai_key(&api_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_get_openai_key_masked() -> Result<String, String> {
    let engine = engine::get_engine();
    engine.get_openai_key_masked().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_set_anthropic_key(api_key: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.set_anthropic_key(&api_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_get_anthropic_key_masked() -> Result<String, String> {
    let engine = engine::get_engine();
    engine.get_anthropic_key_masked().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_set_xiaomi_key(api_key: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.set_xiaomi_key(&api_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_get_xiaomi_key_masked() -> Result<String, String> {
    let engine = engine::get_engine();
    engine.get_xiaomi_key_masked().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn engine_get_router_providers() -> Result<serde_json::Value, String> {
    // Provider configuration is now handled server-side by the cloud router.
    // Return available models from the cloud router instead.
    let engine = engine::get_engine();
    let models = engine.get_available_models().await.map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(models).map_err(|e| e.to_string())?)
}

// ── Agent Registry & Capabilities ──

#[tauri::command]
pub fn engine_get_agent_capabilities(agent_id: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let caps = engine.get_agent_capabilities(&agent_id).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(caps).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_find_agents_by_capability(capability: String) -> Result<Vec<String>, String> {
    let engine = engine::get_engine();
    engine.find_agents_by_capability(&capability).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_get_agent_permissions(agent_id: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let perms = engine.get_agent_permissions(&agent_id).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(perms).map_err(|e| e.to_string())?)
}

// ── Inter-Agent Communication ──

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentAskRequest {
    pub from_agent: String,
    pub to_agent: String,
    pub question: String,
    pub session_id: Option<String>,
}

#[tauri::command]
pub async fn engine_agent_ask(req: AgentAskRequest) -> Result<String, String> {
    let engine = engine::get_engine();
    engine.agent_ask(
        &req.from_agent,
        &req.to_agent,
        &req.question,
        req.session_id.as_deref(),
    ).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_get_communications(agent_id: String, limit: Option<i64>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let comms = engine.db().get_communications(&agent_id, limit.unwrap_or(20)).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(comms).map_err(|e| e.to_string())?)
}

// ── Tasks ──

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub description: Option<String>,
    pub agent_id: String,
    pub created_by: String,
    pub priority: Option<String>,
    pub requires_verify: Option<bool>,
}

#[tauri::command]
pub fn engine_create_task(req: CreateTaskRequest) -> Result<String, String> {
    let engine = engine::get_engine();
    engine.create_task(
        &req.title,
        req.description.as_deref(),
        &req.agent_id,
        &req.created_by,
        &req.priority.unwrap_or_else(|| "normal".to_string()),
        req.requires_verify.unwrap_or(false),
    ).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateTaskRequest {
    pub task_id: String,
    pub status: String,
    pub result: Option<String>,
}

#[tauri::command]
pub fn engine_update_task(req: UpdateTaskRequest) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.update_task_status(&req.task_id, &req.status, req.result.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_get_task(task_id: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let task = engine.get_task(&task_id).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(task).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_get_tasks_for_agent(agent_id: String, status: Option<String>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let tasks = engine.get_tasks_for_agent(&agent_id, status.as_deref()).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(tasks).map_err(|e| e.to_string())?)
}

// ── Verification (Anti-Hallucination) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateVerificationRequest {
    pub agent_id: String,
    pub session_id: Option<String>,
    pub claim_type: String,
    pub claim: String,
}

#[tauri::command]
pub fn engine_create_verification(req: CreateVerificationRequest) -> Result<String, String> {
    let engine = engine::get_engine();
    engine.create_verification_claim(&req.agent_id, req.session_id.as_deref(), &req.claim_type, &req.claim)
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompleteVerificationRequest {
    pub id: String,
    pub verified_by: String,
    pub result: String,
    pub evidence: Option<String>,
}

#[tauri::command]
pub fn engine_complete_verification(req: CompleteVerificationRequest) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.complete_verification_claim(&req.id, &req.verified_by, &req.result, req.evidence.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_get_unverified_claims(agent_id: Option<String>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let claims = engine.get_unverified_claims(agent_id.as_deref()).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(claims).map_err(|e| e.to_string())?)
}

// ── Lessons Learned ──

#[derive(Debug, Serialize, Deserialize)]
pub struct AddLessonRequest {
    pub agent_id: Option<String>,
    pub category: String,
    pub lesson: String,
    pub evidence: Option<String>,
    pub action: Option<String>,
}

#[tauri::command]
pub fn engine_add_lesson(req: AddLessonRequest) -> Result<String, String> {
    let engine = engine::get_engine();
    engine.add_lesson(req.agent_id.as_deref(), &req.category, &req.lesson, req.evidence.as_deref(), req.action.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_get_lessons(category: Option<String>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let lessons = engine.get_active_lessons(category.as_deref()).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(lessons).map_err(|e| e.to_string())?)
}

// ── Cron Jobs ──

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateCronRequest {
    pub name: String,
    pub agent_id: String,
    pub schedule: String,
    pub timezone: Option<String>,
    pub task_message: String,
}

#[tauri::command]
pub fn engine_create_cron(req: CreateCronRequest) -> Result<String, String> {
    let engine = engine::get_engine();
    engine.create_cron_job(
        &req.name, &req.agent_id, &req.schedule,
        &req.timezone.unwrap_or_else(|| "UTC".to_string()),
        &req.task_message,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_get_crons(enabled_only: Option<bool>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let jobs = engine.get_cron_jobs(enabled_only.unwrap_or(false)).map_err(|e| e.to_string())?;

    // Enrich with human-readable schedule descriptions
    let enriched: Vec<serde_json::Value> = jobs.into_iter().map(|j| {
        serde_json::json!({
            "id": j.id, "name": j.name, "agent_id": j.agent_id,
            "schedule": j.schedule,
            "schedule_description": engine::cron::describe(&j.schedule),
            "timezone": j.timezone, "task_message": j.task_message,
            "is_enabled": j.is_enabled,
            "last_run_at": j.last_run_at, "next_run_at": j.next_run_at,
            "run_count": j.run_count, "error_count": j.error_count,
            "created_at": j.created_at, "updated_at": j.updated_at,
        })
    }).collect();

    Ok(serde_json::to_value(enriched).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_toggle_cron(id: String, enabled: bool) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.toggle_cron_job(&id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_delete_cron(id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.delete_cron_job(&id).map_err(|e| e.to_string())
}

// ── Heartbeat Interval ──

#[tauri::command]
pub fn engine_get_heartbeat_interval() -> Result<i64, String> {
    let engine = engine::get_engine();
    let ms = engine.db().get_config("heartbeat_interval_ms")
        .map_err(|e| e.to_string())?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(1_800_000);
    Ok(ms)
}

#[tauri::command]
pub fn engine_set_heartbeat_interval(ms: i64) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().set_config("heartbeat_interval_ms", &ms.to_string())
        .map_err(|e| e.to_string())
}


#[tauri::command]
pub async fn engine_tick_cron() -> Result<i64, String> {
    let engine = engine::get_engine();
    engine.tick_cron().await.map_err(|e| e.to_string())
}

// ── Webhooks ──

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateWebhookRequest {
    pub name: String,
    pub agent_id: String,
    pub path: String,
    pub secret: Option<String>,
    pub task_template: String,
}

#[tauri::command]
pub fn engine_create_webhook(req: CreateWebhookRequest) -> Result<String, String> {
    let engine = engine::get_engine();
    engine.create_webhook(
        &req.name, &req.agent_id, &req.path,
        req.secret.as_deref(), &req.task_template,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_get_webhooks() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let hooks = engine.get_webhooks().map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(hooks).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_delete_webhook(id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.delete_webhook(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn engine_handle_webhook(path: String, body: String, auth: Option<String>) -> Result<String, String> {
    let engine = engine::get_engine();
    engine.handle_webhook(&path, &body, auth.as_deref()).await.map_err(|e| e.to_string())
}

// ── Events ──

#[tauri::command]
pub fn engine_get_events(target_agent: Option<String>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let events = engine.get_unprocessed_events(target_agent.as_deref()).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(events).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_mark_event_processed(id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.mark_event_processed(&id).map_err(|e| e.to_string())
}

// ── Heartbeats ──

#[tauri::command]
pub fn engine_run_health_checks() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    engine.run_health_checks().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_get_heartbeats() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let records = engine.get_latest_heartbeats().map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(records).map_err(|e| e.to_string())?)
}

// ── Skills ──

#[tauri::command]
pub fn engine_get_skills(active_only: Option<bool>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let skills = engine.get_skills(active_only.unwrap_or(false)).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(skills).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_get_skill(id: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let skill = engine.get_skill(&id).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(skill).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_get_skills_for_agent(agent_id: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let skills = engine.get_skills_for_agent(&agent_id).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(skills).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn engine_install_skill(manifest_json: String) -> Result<String, String> {
    let engine = engine::get_engine();
    engine.install_skill_from_json(&manifest_json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_toggle_skill(id: String, active: bool) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.toggle_skill(&id, active).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_uninstall_skill(id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.uninstall_skill(&id).map_err(|e| e.to_string())
}

// ── Notifications ──

#[derive(Debug, Serialize, Deserialize)]
pub struct NotificationRequest {
    pub title: String,
    pub body: String,
}

#[tauri::command]
pub fn engine_send_notification(req: NotificationRequest) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().emit_event("agent_notification", None, None,
        Some(&serde_json::json!({"title": req.title, "body": req.body}).to_string()))
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Email Config ──

#[tauri::command]
pub fn engine_set_email_config(
    smtp_host: Option<String>,
    smtp_user: Option<String>,
    smtp_pass: Option<String>,
    smtp_from: Option<String>,
    imap_host: Option<String>,
    imap_port: Option<String>,
    imap_user: Option<String>,
    imap_pass: Option<String>,
) -> Result<(), String> {
    let engine = engine::get_engine();
    if let Some(v) = smtp_host { engine.db().set_config("smtp_host", &v).map_err(|e| e.to_string())?; }
    if let Some(v) = smtp_user { engine.db().set_config("smtp_user", &v).map_err(|e| e.to_string())?; }
    if let Some(v) = smtp_pass { engine.db().set_config("smtp_pass", &v).map_err(|e| e.to_string())?; }
    if let Some(v) = smtp_from { engine.db().set_config("smtp_from", &v).map_err(|e| e.to_string())?; }
    if let Some(v) = imap_host { engine.db().set_config("imap_host", &v).map_err(|e| e.to_string())?; }
    if let Some(v) = imap_port { engine.db().set_config("imap_port", &v).map_err(|e| e.to_string())?; }
    if let Some(v) = imap_user { engine.db().set_config("imap_user", &v).map_err(|e| e.to_string())?; }
    if let Some(v) = imap_pass { engine.db().set_config("imap_pass", &v).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
pub fn engine_get_email_config() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    Ok(serde_json::json!({
        "smtp_host": engine.db().get_config("smtp_host").unwrap_or(None),
        "smtp_user": engine.db().get_config("smtp_user").unwrap_or(None),
        "smtp_from": engine.db().get_config("smtp_from").unwrap_or(None),
        "imap_host": engine.db().get_config("imap_host").unwrap_or(None),
        "imap_port": engine.db().get_config("imap_port").unwrap_or(None),
        "imap_user": engine.db().get_config("imap_user").unwrap_or(None),
        "is_configured": engine.db().get_config("smtp_host").unwrap_or(None).is_some(),
    }))
}

// ── Google Commands ──

#[tauri::command]
pub fn engine_google_is_connected() -> Result<bool, String> {
    let engine = engine::get_engine();
    engine::google::is_connected(engine.db()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_google_get_email() -> Result<String, String> {
    let engine = engine::get_engine();
    engine.db().get_config("google_email")
        .map_err(|e| e.to_string())
        .map(|v| v.unwrap_or_default())
}

#[tauri::command]
pub fn engine_google_auth_url() -> Result<String, String> {
    let engine = engine::get_engine();
    engine::google::get_auth_url(engine.db()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_google_connect() -> Result<String, String> {
    let engine = engine::get_engine();
    // Open browser
    let url = engine::google::get_auth_url(engine.db()).map_err(|e| e.to_string())?;
    let _ = open::that(&url);

    // Block waiting for callback
    let tokens = engine::google::handle_oauth_callback(engine.db()).map_err(|e| e.to_string())?;

    Ok(tokens.email.unwrap_or_else(|| "Connected".to_string()))
}

#[tauri::command]
pub fn engine_google_disconnect() -> Result<(), String> {
    let engine = engine::get_engine();
    engine::google::disconnect(engine.db()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn engine_google_set_credentials(client_id: String, client_secret: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().set_config("google_client_id", &client_id).map_err(|e| e.to_string())?;
    engine.db().set_config("google_client_secret", &client_secret).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn engine_google_get_credentials() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let client_id = engine.db().get_config("google_client_id").map_err(|e| e.to_string())?.unwrap_or_default();
    let client_secret = engine.db().get_config("google_client_secret").map_err(|e| e.to_string())?.unwrap_or_default();
    // Always has_credentials — built-in defaults are used if user hasn't set custom ones
    let has_custom = !client_id.is_empty() && !client_secret.is_empty();
    Ok(serde_json::json!({
        "client_id": client_id,
        "client_secret": client_secret,
        "has_credentials": true,
        "using_builtin": !has_custom,
    }))
}

// ── Health ──

#[tauri::command]
pub fn engine_health() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let agents = engine.get_agents().map_err(|e| e.to_string())?;
    let user_id = get_supabase_user_id();
    let quota = engine.get_quota(&user_id).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "status": "healthy",
        "version": "1.0.0",
        "agents_count": agents.len(),
        "calls_today": quota.calls_used,
    }))
}

// ── Helpers ──

fn get_daily_limit(engine: &engine::ConfluxEngine) -> i64 {
    engine.db().get_config("free_daily_limit")
        .ok()
        .flatten()
        .unwrap_or_else(|| "50".to_string())
        .parse()
        .unwrap_or(50)
}

// ── Family Members ──

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateFamilyMemberRequest {
    pub name: String,
    pub age: Option<i64>,
    pub age_group: String,
    pub avatar: Option<String>,
    pub color: Option<String>,
    pub default_agent_id: Option<String>,
    pub parent_id: Option<String>,
}

#[tauri::command]
pub fn family_list() -> Result<Vec<engine::types::FamilyMember>, String> {
    let engine = engine::get_engine();
    let user_id = get_supabase_user_id();
    engine.db().get_family_members(&user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn family_create(req: CreateFamilyMemberRequest) -> Result<engine::types::FamilyMember, String> {
    let engine = engine::get_engine();
    let user_id = get_supabase_user_id();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().create_family_member(
        &id, &user_id, &req.name, req.age, &req.age_group,
        req.avatar.as_deref(), req.color.as_deref(),
        req.default_agent_id.as_deref(), req.parent_id.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn family_delete(id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    let user_id = get_supabase_user_id();
    engine.db().delete_family_member(&id, &user_id).map_err(|e| e.to_string())
}

// ── Agent Templates ──

#[tauri::command]
pub fn agent_templates_list(age_group: Option<String>) -> Result<Vec<engine::types::AgentTemplate>, String> {
    let engine = engine::get_engine();
    engine.db().get_agent_templates(age_group.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn agent_template_install(template_id: String, member_id: Option<String>) -> Result<Option<engine::types::Agent>, String> {
    let engine = engine::get_engine();
    engine.db().install_agent_from_template(&template_id, member_id.as_deref()).map_err(|e| e.to_string())
}

// ── Story Games ──

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateStoryGameRequest {
    pub member_id: Option<String>,
    pub title: String,
    pub genre: String,
    pub age_group: String,
    pub difficulty: Option<String>,
}

#[tauri::command]
pub fn story_games_list(member_id: Option<String>) -> Result<Vec<engine::types::StoryGame>, String> {
    let engine = engine::get_engine();
    engine.db().get_story_games(member_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn story_game_create(req: CreateStoryGameRequest) -> Result<engine::types::StoryGame, String> {
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    let difficulty = req.difficulty.unwrap_or_else(|| "normal".to_string());
    engine.db().create_story_game(
        &id, req.member_id.as_deref(), &req.title, &req.genre, &req.age_group, &difficulty, None,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn story_game_get(id: String) -> Result<Option<engine::types::StoryGame>, String> {
    let engine = engine::get_engine();
    engine.db().get_story_game(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn story_chapters_list(game_id: String) -> Result<Vec<engine::types::StoryChapter>, String> {
    let engine = engine::get_engine();
    engine.db().get_story_chapters(&game_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn story_seeds_list(age_group: Option<String>, genre: Option<String>) -> Result<Vec<engine::types::StorySeed>, String> {
    let engine = engine::get_engine();
    engine.db().get_story_seeds(age_group.as_deref(), genre.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn story_choose_path(chapter_id: String, choice_id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().choose_story_path(&chapter_id, &choice_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn story_solve_puzzle(chapter_id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().solve_puzzle(&chapter_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn story_generate_next_chapter(game_id: String, choice_id: String) -> Result<engine::types::StoryChapter, String> {
    let engine = engine::get_engine();

    // Load game state
    let game = engine.db().get_story_game(&game_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Game not found".to_string())?;

    // Load all chapters so far
    let chapters = engine.db().get_story_chapters(&game_id)
        .map_err(|e| e.to_string())?;

    // Mark the last chapter's choice
    if let Some(last_chapter) = chapters.last() {
        engine.db().choose_story_path(&last_chapter.id, &choice_id)
            .map_err(|e| e.to_string())?;
    }

    // Build context for the AI
    let mut story_context = String::new();
    story_context.push_str(&format!(
        "You are a master storyteller writing an interactive adventure puzzle game.\n\n\
        Title: {}\nGenre: {}\nAge Group: {}\nDifficulty: {}\n\n",
        game.title, game.genre, game.age_group, game.difficulty
    ));

    // Add previous chapters for continuity
    for ch in &chapters {
        if let Some(title) = &ch.title {
            story_context.push_str(&format!("=== Chapter {}: {} ===\n", ch.chapter_number, title));
        } else {
            story_context.push_str(&format!("=== Chapter {} ===\n", ch.chapter_number));
        }
        story_context.push_str(&ch.narrative);
        story_context.push_str("\n\n");

        // Show what choice was made
        if let Some(chosen_id) = &ch.chosen_choice_id {
            let choices: Vec<engine::types::StoryChoice> = serde_json::from_str(&ch.choices)
                .unwrap_or_default();
            if let Some(chosen) = choices.iter().find(|c| &c.id == chosen_id) {
                story_context.push_str(&format!("→ The player chose: {}\n\n", chosen.text));
            }
        }
    }

    // Get the chosen choice text for this turn
    let last_chapter = chapters.last();
    let chosen_text = if let Some(ch) = last_chapter {
        let choices: Vec<engine::types::StoryChoice> = serde_json::from_str(&ch.choices)
            .unwrap_or_default();
        choices.iter().find(|c| c.id == choice_id)
            .map(|c| c.text.clone())
            .unwrap_or_default()
    } else {
        String::new()
    };

    // Build the AI prompt
    let puzzle_instruction = if chapters.len() % 3 == 2 {
        // Every 3rd chapter has a puzzle
        "\nIMPORTANT: This chapter MUST include a puzzle. Add a \"puzzle\" field with type (riddle/pattern/logic/word/code), question, answer, and hint. Make it age-appropriate and solvable but challenging."
    } else {
        ""
    };

    let age_instruction = match game.age_group.as_str() {
        "toddler" => "Use very simple words (1-2 syllables). Short sentences. Repetitive and encouraging. Keep it gentle and safe.",
        "preschool" => "Use simple language. Be imaginative and fun. Include counting or color references when natural.",
        "kid" => "Use age-appropriate language. Be adventurous and exciting. Include humor and wonder. Reference things kids love.",
        "teen" => "Use sophisticated language. Be thrilling and engaging. Include real stakes and emotional depth.",
        "young_adult" | "adult" => "Use rich, literary language. Complex characters. Moral ambiguity. Real consequences.",
        _ => "Use age-appropriate language for the target audience.",
    };

    let full_prompt = format!(
        "{story_context}\n\
        The player chose: \"{chosen_text}\"\n\n\
        Write the NEXT chapter of this story. {age_instruction}{puzzle_instruction}\n\n\
        Respond in this EXACT JSON format (no markdown, no code fences, just raw JSON):\n\
        {{\n  \"title\": \"Chapter title\",\n  \"narrative\": \"The story text for this chapter (2-4 paragraphs). Be vivid and immersive.\",\n  \"choices\": [\n    {{\"id\": \"a\", \"text\": \"First choice\", \"consequence_hint\": \"What might happen\"}},\n    {{\"id\": \"b\", \"text\": \"Second choice\", \"consequence_hint\": \"What might happen\"}},\n    {{\"id\": \"c\", \"text\": \"Third choice\", \"consequence_hint\": \"What might happen\"}}\n  ],\n  \"puzzle\": null,\n  \"image_prompt\": \"A vivid description for DALL-E to illustrate this scene\"\n}}\n\n\
        Make sure the narrative continues from the previous chapter naturally. The choices should lead to meaningfully different outcomes."
    );

    // Call the AI
    let messages = vec![OpenAIMessage {
        role: "user".to_string(),
        content: Some(full_prompt),
        tool_call_id: None,
        tool_calls: None,
    }];

    let response = cloud::cloud_chat(None, messages, Some(2000), None, None)
        .await
        .map_err(|e| format!("AI generation failed: {}", e))?;

    // Parse the AI response as JSON
    let content = response.content.trim();
    // Strip markdown code fences if present
    let json_str = content
        .strip_prefix("```json").unwrap_or(content)
        .strip_prefix("```").unwrap_or(content)
        .strip_suffix("```").unwrap_or(content)
        .trim();

    #[derive(serde::Deserialize)]
    struct ChapterGen {
        title: Option<String>,
        narrative: String,
        choices: Vec<engine::types::StoryChoice>,
        puzzle: Option<engine::types::StoryPuzzle>,
        image_prompt: Option<String>,
    }

    let generated: ChapterGen = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse AI response as JSON: {}. Response was: {}", e, json_str))?;

    let choices_json = serde_json::to_string(&generated.choices)
        .map_err(|e| e.to_string())?;
    let puzzle_json = generated.puzzle
        .and_then(|p| serde_json::to_string(&p).ok());

    let chapter_number = game.current_chapter + 1;
    let chapter_id = uuid::Uuid::new_v4().to_string();

    let chapter = engine.db().add_story_chapter(
        &chapter_id,
        &game_id,
        chapter_number,
        generated.title.as_deref(),
        &generated.narrative,
        &choices_json,
        puzzle_json.as_deref(),
        generated.image_prompt.as_deref(),
    ).map_err(|e| e.to_string())?;

    Ok(chapter)
}

// ── Learning Tracking ──

#[derive(Debug, Serialize, Deserialize)]
pub struct LogActivityRequest {
    pub member_id: String,
    pub agent_id: String,
    pub session_id: Option<String>,
    pub activity_type: String,
    pub topic: Option<String>,
    pub description: Option<String>,
    pub difficulty: Option<String>,
    pub score: Option<f64>,
    pub duration_sec: Option<i64>,
    pub metadata: Option<String>,
}

#[tauri::command]
pub fn learning_log_activity(req: LogActivityRequest) -> Result<(), String> {
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().log_learning_activity(
        &id, &req.member_id, &req.agent_id, req.session_id.as_deref(),
        &req.activity_type, req.topic.as_deref(), req.description.as_deref(),
        req.difficulty.as_deref(), req.score, req.duration_sec, req.metadata.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn learning_get_activities(member_id: String, limit: Option<i64>) -> Result<Vec<engine::types::LearningActivity>, String> {
    let engine = engine::get_engine();
    engine.db().get_learning_activities(&member_id, limit.unwrap_or(50)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn learning_get_progress(member_id: String) -> Result<engine::types::LearningProgress, String> {
    let engine = engine::get_engine();
    engine.db().get_learning_progress(&member_id).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateGoalRequest {
    pub member_id: String,
    pub goal_type: String,
    pub activity_type: Option<String>,
    pub title: String,
    pub target_value: f64,
    pub unit: Option<String>,
    pub deadline: Option<String>,
}

#[tauri::command]
pub fn learning_create_goal(req: CreateGoalRequest) -> Result<(), String> {
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().create_learning_goal(
        &id, &req.member_id, &req.goal_type, req.activity_type.as_deref(),
        &req.title, req.target_value, req.unit.as_deref(), req.deadline.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn learning_get_goals(member_id: String) -> Result<Vec<engine::types::LearningGoal>, String> {
    let engine = engine::get_engine();
    engine.db().get_learning_goals(&member_id).map_err(|e| e.to_string())
}

// ── Smart Kitchen — Meals ──

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateMealRequest {
    pub name: String,
    pub description: Option<String>,
    pub cuisine: Option<String>,
    pub category: Option<String>,
    pub photo_url: Option<String>,
    pub prep_time_min: Option<i64>,
    pub cook_time_min: Option<i64>,
    pub servings: Option<i64>,
    pub difficulty: Option<String>,
    pub instructions: Option<String>,
    pub tags: Option<String>,
}

#[tauri::command]
pub fn kitchen_create_meal(req: CreateMealRequest, member_id: Option<String>) -> Result<engine::types::Meal, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().create_meal(
        &id, &req.name, req.description.as_deref(), req.cuisine.as_deref(),
        req.category.as_deref(), req.photo_url.as_deref(), req.prep_time_min,
        req.cook_time_min, req.servings.unwrap_or(4),
        req.difficulty.as_deref().unwrap_or("normal"),
        req.instructions.as_deref(), req.tags.as_deref(), "manual",
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kitchen_get_meals(category: Option<String>, cuisine: Option<String>, favorites_only: bool, member_id: Option<String>) -> Result<Vec<engine::types::Meal>, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    engine.db().get_meals(category.as_deref(), cuisine.as_deref(), favorites_only).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kitchen_get_meal(id: String, member_id: Option<String>) -> Result<Option<engine::types::MealWithIngredients>, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    engine.db().get_meal_with_ingredients(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kitchen_toggle_favorite(id: String, member_id: Option<String>) -> Result<(), String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    engine.db().toggle_favorite(&id).map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddIngredientRequest {
    pub meal_id: String,
    pub name: String,
    pub quantity: Option<f64>,
    pub unit: Option<String>,
    pub estimated_cost: Option<f64>,
    pub category: Option<String>,
    pub is_optional: bool,
    pub notes: Option<String>,
}

#[tauri::command]
pub fn kitchen_add_ingredient(req: AddIngredientRequest, member_id: Option<String>) -> Result<(), String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().add_meal_ingredient(
        &id, &req.meal_id, &req.name, req.quantity,
        req.unit.as_deref(), req.estimated_cost, req.category.as_deref(),
        req.is_optional, req.notes.as_deref(),
    ).map_err(|e| e.to_string())
}

// ── Smart Kitchen — AI Meal Recognition ──

#[tauri::command]
pub async fn kitchen_recognize_meal(_photo_base64: String) -> Result<engine::types::MealWithIngredients, String> {
    let _engine = engine::get_engine();

    let _prompt = "You are a culinary expert AI. Look at this photo of a meal and provide:

1. The name of the dish
2. A brief description
3. The cuisine type (italian, mexican, american, asian, indian, mediterranean, etc.)
4. The meal category (breakfast, lunch, dinner, snack, dessert)
5. Estimated prep time in minutes
6. Estimated cook time in minutes
7. Number of servings
8. Difficulty (easy, normal, hard)
9. A list of ALL ingredients you can identify, with estimated quantities, units, and estimated cost per ingredient in USD
10. Step-by-step cooking instructions
11. Tags (quick, healthy, kid-friendly, comfort-food, vegetarian, etc.)

Respond in this EXACT JSON format (no markdown, no code fences, just raw JSON):
{
  \"name\": \"Dish Name\",
  \"description\": \"Brief description\",
  \"cuisine\": \"cuisine_type\",
  \"category\": \"meal_category\",
  \"prep_time_min\": 15,
  \"cook_time_min\": 30,
  \"servings\": 4,
  \"difficulty\": \"normal\",
  \"instructions\": \"Step 1: ... Step 2: ...\",
  \"tags\": \"[\\\"healthy\\\", \\\"quick\\\"]\",
  \"ingredients\": [
    {\"name\": \"chicken breast\", \"quantity\": 2, \"unit\": \"pieces\", \"estimated_cost\": 5.99, \"category\": \"meat\", \"notes\": \"boneless, skinless\"},
    {\"name\": \"olive oil\", \"quantity\": 2, \"unit\": \"tbsp\", \"estimated_cost\": 0.30, \"category\": \"pantry\"}
  ]
}

Be accurate with costs. Use 2026 US grocery prices. List every ingredient.";

    // For now, use text-based recognition (photo support via vision API can be added later)
    let _messages = vec![OpenAIMessage {
        role: "user".to_string(),
        content: Some(format!("I'm describing a meal I want to add to my kitchen. Help me set it up with full details including ingredients and costs.\n\nDescribe what you see or tell me: what meal should we add?")),
        tool_call_id: None,
        tool_calls: None,
    }];

    // Actually, let's use a direct text approach since we can't pass images through the router yet
    // The user can describe the meal or we can use the photo as a trigger to ask them about it
    return Err("Photo recognition coming soon! For now, describe your meal and I'll help set it up.".to_string());
}

#[tauri::command]
pub async fn kitchen_ai_add_meal(description: String, member_id: Option<String>) -> Result<engine::types::MealWithIngredients, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();

    let prompt = format!(
        "You are a culinary expert AI. The user describes a meal they want to add: \"{description}\"

Provide full details for this meal:
1. Name (clean, proper name)
2. Description (1-2 sentences)
3. Cuisine type
4. Category (breakfast/lunch/dinner/snack/dessert)
5. Prep time, cook time, servings, difficulty
6. Complete list of ingredients with quantities, units, estimated cost in USD (2026 prices), and category (produce/dairy/meat/pantry/spice/frozen)
7. Step-by-step cooking instructions
8. Tags array

Respond in this EXACT JSON format (no markdown, no code fences, just raw JSON):
{{
  \"name\": \"Proper Dish Name\",
  \"description\": \"Brief appetizing description\",
  \"cuisine\": \"cuisine_type\",
  \"category\": \"dinner\",
  \"prep_time_min\": 15,
  \"cook_time_min\": 30,
  \"servings\": 4,
  \"difficulty\": \"normal\",
  \"instructions\": \"Step 1: ...\\nStep 2: ...\\nStep 3: ...\",
  \"tags\": \"[\\\"healthy\\\", \\\"family-friendly\\\"]\",
  \"ingredients\": [
    {{\"name\": \"ingredient\", \"quantity\": 2.0, \"unit\": \"cups\", \"estimated_cost\": 1.50, \"category\": \"pantry\", \"notes\": \"optional note\"}}
  ]
}}",
        description = description
    );

    let messages = vec![OpenAIMessage {
        role: "user".to_string(),
        content: Some(prompt),
        tool_call_id: None,
        tool_calls: None,
    }];

    let response = cloud::cloud_chat(None, messages, Some(2000), None, None)
        .await
        .map_err(|e| format!("AI failed: {}", e))?;

    let content = response.content.trim();
    let json_str = content
        .strip_prefix("```json").unwrap_or(content)
        .strip_prefix("```").unwrap_or(content)
        .strip_suffix("```").unwrap_or(content)
        .trim();

    #[derive(serde::Deserialize)]
    struct AIMeal {
        name: String,
        description: Option<String>,
        cuisine: Option<String>,
        category: Option<String>,
        prep_time_min: Option<i64>,
        cook_time_min: Option<i64>,
        servings: Option<i64>,
        difficulty: Option<String>,
        instructions: Option<String>,
        tags: Option<String>,
        ingredients: Vec<AIIngredient>,
    }

    #[derive(serde::Deserialize)]
    struct AIIngredient {
        name: String,
        quantity: Option<f64>,
        unit: Option<String>,
        estimated_cost: Option<f64>,
        category: Option<String>,
        notes: Option<String>,
    }

    let ai_meal: AIMeal = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse AI response: {}. Raw: {}", e, json_str))?;

    let meal_id = uuid::Uuid::new_v4().to_string();
    let _meal = engine.db().create_meal(
        &meal_id, &ai_meal.name, ai_meal.description.as_deref(), ai_meal.cuisine.as_deref(),
        ai_meal.category.as_deref(), None, ai_meal.prep_time_min, ai_meal.cook_time_min,
        ai_meal.servings.unwrap_or(4), &ai_meal.difficulty.unwrap_or("normal".to_string()),
        ai_meal.instructions.as_deref(), ai_meal.tags.as_deref(), "ai-generated",
    ).map_err(|e| e.to_string())?;

    // Add ingredients
    for ing in &ai_meal.ingredients {
        let ing_id = uuid::Uuid::new_v4().to_string();
        engine.db().add_meal_ingredient(
            &ing_id, &meal_id, &ing.name, ing.quantity, ing.unit.as_deref(),
            ing.estimated_cost, ing.category.as_deref(), false, ing.notes.as_deref(),
        ).map_err(|e| e.to_string())?;
    }

    // Get the full meal with ingredients
    engine.db().get_meal_with_ingredients(&meal_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Failed to load created meal".to_string())
}

// ── Smart Kitchen — Meal Plans ──

#[derive(Debug, Serialize, Deserialize)]
pub struct SetPlanEntryRequest {
    pub week_start: String,
    pub day_of_week: i64,
    pub meal_slot: String,
    pub meal_id: Option<String>,
    pub notes: Option<String>,
}

#[tauri::command]
pub fn kitchen_set_plan_entry(req: SetPlanEntryRequest, member_id: Option<String>) -> Result<(), String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().set_plan_entry(
        &id, &req.week_start, req.day_of_week, &req.meal_slot, req.meal_id.as_deref(), req.notes.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kitchen_get_weekly_plan(week_start: String, member_id: Option<String>) -> Result<engine::types::WeeklyPlan, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    engine.db().get_weekly_plan(&week_start).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kitchen_clear_week_plan(week_start: String, member_id: Option<String>) -> Result<(), String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    engine.db().clear_week_plan(&week_start).map_err(|e| e.to_string())
}

// ── Smart Kitchen — Grocery List ──

#[tauri::command]
pub fn kitchen_generate_grocery(week_start: String, member_id: Option<String>) -> Result<Vec<engine::types::GroceryItem>, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    engine.db().generate_grocery_list(&week_start).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kitchen_get_grocery(week_start: String, member_id: Option<String>) -> Result<Vec<engine::types::GroceryItem>, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    engine.db().get_grocery_list(&week_start).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kitchen_toggle_grocery_item(id: String, member_id: Option<String>) -> Result<(), String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    engine.db().toggle_grocery_item(&id).map_err(|e| e.to_string())
}

// ── Smart Kitchen — Inventory ──

#[derive(Debug, Serialize, Deserialize)]
pub struct AddInventoryRequest {
    pub name: String,
    pub quantity: Option<f64>,
    pub unit: Option<String>,
    pub category: Option<String>,
    pub expiry_date: Option<String>,
    pub location: Option<String>,
}

#[tauri::command(rename_all = "snake_case")]
pub fn kitchen_add_inventory(req: AddInventoryRequest, member_id: Option<String>) -> Result<(), String> {
    let user_id = member_id.unwrap_or_else(|| get_supabase_user_id());
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().add_inventory_item(
        &id, &user_id, &req.name, req.quantity, req.unit.as_deref(),
        req.category.as_deref(), req.expiry_date.as_deref(), req.location.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kitchen_get_inventory(location: Option<String>, member_id: Option<String>) -> Result<Vec<engine::types::KitchenInventoryItem>, String> {
    let user_id = member_id.unwrap_or_else(|| get_supabase_user_id());
    let engine = engine::get_engine();
    engine.db().get_inventory(&user_id, location.as_deref()).map_err(|e| e.to_string())
}

// ── Kitchen Hearth Commands ──

#[tauri::command]
pub fn kitchen_home_menu(member_id: Option<String>) -> Result<Vec<engine::types::HomeMenuItem>, String> {
    let user_id = member_id.unwrap_or_else(|| get_supabase_user_id());
    let engine = engine::get_engine();
    let _inventory = engine.db().get_inventory(&user_id, None).unwrap_or_default();
    let meals = engine.db().get_meals(None, None, false).unwrap_or_default();
    let mut menu = Vec::new();
    for meal in meals.iter().take(5) {
        menu.push(engine::types::HomeMenuItem {
            meal_id: meal.id.clone(),
            name: meal.name.clone(),
            emoji: "🍽️".to_string(),
            reason: "Ready to cook".to_string(),
            estimated_minutes: 30,
            missing_ingredients: Vec::new(),
        });
    }
    Ok(menu)
}

#[tauri::command]
pub fn kitchen_upload_meal_photo(meal_id: String, photo_url: String, caption: Option<String>, member_id: Option<String>) -> Result<(), String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().add_meal_photo(&id, &meal_id, &photo_url, caption.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kitchen_identify_meal_from_photo(_photo_url: String) -> Result<serde_json::Value, String> {
    // Stub — returns placeholder identification
    Ok(serde_json::json!({
        "name": "Identified Meal",
        "confidence": 0.0,
        "note": "AI identification coming soon"
    }))
}

#[tauri::command]
pub fn kitchen_plan_week_natural(input: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "parsed": true,
        "input": input,
        "note": "Natural language meal planning coming soon"
    }))
}

#[tauri::command]
pub fn kitchen_suggest_meal_natural(constraints: String, member_id: Option<String>) -> Result<serde_json::Value, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    let meals = engine.db().get_meals(None, None, false).unwrap_or_default();
    let suggestion = meals.first().map(|m| serde_json::json!({
        "meal_id": m.id,
        "name": m.name,
        "reason": format!("Based on: {}", constraints),
    })).unwrap_or(serde_json::json!({"note": "No meals available"}));
    Ok(suggestion)
}

#[tauri::command]
pub fn kitchen_pantry_heatmap(member_id: Option<String>) -> Result<Vec<engine::types::PantryHeatItem>, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    engine.db().get_pantry_heatmap().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kitchen_use_expiring(member_id: Option<String>) -> Result<serde_json::Value, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    let expiring = engine.db().get_expiring_items(3).unwrap_or_default();
    Ok(serde_json::json!({
        "expiring_count": expiring.len(),
        "items": expiring.iter().map(|i| serde_json::json!({
            "name": i.name,
            "expiry": i.expiry_date,
        })).collect::<Vec<_>>(),
    }))
}

#[tauri::command]
pub fn kitchen_get_cooking_steps(meal_id: String, member_id: Option<String>) -> Result<Vec<engine::types::CookingStep>, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    let meal = engine.db().get_meal_with_ingredients(&meal_id).map_err(|e| e.to_string())?;
    if let Some(m) = meal {
        // Parse instructions into steps
        let instructions = m.meal.instructions.unwrap_or_default();
        let steps: Vec<engine::types::CookingStep> = instructions
            .split('\n')
            .enumerate()
            .filter(|(_, s)| !s.trim().is_empty())
            .map(|(i, s)| engine::types::CookingStep {
                step_number: (i + 1) as i64,
                instruction: s.trim().to_string(),
                duration_minutes: None,
                timer_alert: false,
            })
            .collect();
        Ok(steps)
    } else {
        Err("Meal not found".to_string())
    }
}

#[tauri::command]
pub fn kitchen_weekly_digest(week_start: String, member_id: Option<String>) -> Result<engine::types::KitchenDigest, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    let meals_cooked = engine.db().get_weekly_plan(&week_start)
        .map(|p| p.meal_count)
        .unwrap_or(0);
    Ok(engine::types::KitchenDigest {
        week_start,
        meals_cooked,
        variety_score: if meals_cooked > 0 { (meals_cooked as f64 / 21.0 * 100.0).min(100.0) } else { 0.0 },
        unique_cuisines: 1,
        estimated_savings: meals_cooked as f64 * 15.0,
        top_cuisine: None,
        suggestion: if meals_cooked < 5 { "Try planning more meals this week!".to_string() } else { "Great variety this week!".to_string() },
    })
}

#[tauri::command]
pub fn kitchen_get_nudges(member_id: Option<String>) -> Result<Vec<engine::types::KitchenNudge>, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    let mut nudges = Vec::new();
    let expiring = engine.db().get_expiring_items(2).unwrap_or_default();
    if !expiring.is_empty() {
        nudges.push(engine::types::KitchenNudge {
            nudge_type: "expiring".to_string(),
            message: format!("{} items expiring soon!", expiring.len()),
            action_label: "View Items".to_string(),
            emoji: "⚠️".to_string(),
        });
    }
    Ok(nudges)
}

#[tauri::command]
pub fn kitchen_smart_grocery(week_start: String, member_id: Option<String>) -> Result<Vec<engine::types::GroceryItem>, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    engine.db().generate_grocery_list(&week_start).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kitchen_get_meal_photos(meal_id: String, member_id: Option<String>) -> Result<Vec<engine::types::MealPhoto>, String> {
    let _member_id = member_id;
    let engine = engine::get_engine();
    engine.db().get_meal_photos(&meal_id).map_err(|e| e.to_string())
}

// ── Onboarding Setup ──

/// Onboarding: save_budget_data — seeds initial budget data for the current user.
#[derive(Debug, Serialize, Deserialize)]
pub struct SaveBudgetDataRequest {
    pub income: Option<f64>,
    pub categories: Option<Vec<String>>,
    pub member_id: Option<String>,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_budget_data(req: SaveBudgetDataRequest) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let income = req.income.unwrap_or(5000.0);
    let categories = req.categories.unwrap_or_else(|| vec!["groceries".to_string(), "rent".to_string(), "utilities".to_string()]);
    let member_id = req.member_id;

    // Save income entry
    let income_id = uuid::Uuid::new_v4().to_string();
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let _ = engine.db().conn().execute(
        "INSERT INTO budget_entries (id, member_id, entry_type, category, amount, description, recurring, frequency, date, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![income_id, member_id, "income", "salary", income, "Onboarding starter income", 1i64, "monthly", today, chrono::Utc::now().to_rfc3339()],
    ).map_err(|e| e.to_string())?;

    // Save starter expense entries for each category
    let mut entries_created = 1; // income
    for cat in &categories {
        let id = uuid::Uuid::new_v4().to_string();
        let _ = engine.db().conn().execute(
            "INSERT INTO budget_entries (id, member_id, entry_type, category, amount, description, recurring, frequency, date, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![id, member_id, "expense", cat, 0.0, format!("Starter category: {}", cat), 0i64, None::<String>, today, chrono::Utc::now().to_rfc3339()],
        ).map_err(|e| e.to_string())?;
        entries_created += 1;
    }

    Ok(serde_json::json!({
        "success": true,
        "income": income,
        "categories": categories,
        "entries_created": entries_created,
    }))
}

// ── Budget Tracker ──

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateBudgetEntryRequest {
    pub member_id: Option<String>,
    pub entry_type: String,  // 'income' | 'expense' | 'savings' | 'goal'
    pub category: String,
    pub amount: f64,
    pub description: Option<String>,
    pub recurring: bool,
    pub frequency: Option<String>,
    pub date: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn budget_add_entry(req: CreateBudgetEntryRequest) -> Result<engine::types::BudgetEntry, String> {
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    let now = engine::db::EngineDb::now();
    let conn = engine.db().conn();
    conn.execute(
        "INSERT INTO budget_entries (id, member_id, entry_type, category, amount, description, recurring, frequency, date, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![id, req.member_id, req.entry_type, req.category, req.amount, req.description,
                          if req.recurring { 1i64 } else { 0 }, req.frequency, req.date, now],
    ).map_err(|e| e.to_string())?;
    Ok(engine::types::BudgetEntry {
        id, member_id: req.member_id, entry_type: req.entry_type, category: req.category,
        amount: req.amount, description: req.description, recurring: req.recurring,
        frequency: req.frequency, date: req.date, created_at: now,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn budget_get_entries(member_id: Option<String>, month: Option<String>) -> Result<Vec<engine::types::BudgetEntry>, String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn();
    let mut conditions = Vec::new();
    let mut params_vec: Vec<String> = Vec::new();

    if let Some(mid) = &member_id {
        conditions.push("member_id = ?");
        params_vec.push(mid.clone());
    }
    if let Some(m) = &month {
        conditions.push("strftime('%Y-%m', date) = ?");
        params_vec.push(m.clone());
    }

    let where_clause = if conditions.is_empty() { String::new() } else { format!("WHERE {}", conditions.join(" AND ")) };
    let query = format!(
        "SELECT id, member_id, entry_type, category, amount, description, recurring, frequency, date, created_at
         FROM budget_entries {} ORDER BY date DESC, created_at DESC", where_clause
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
    let rows = stmt.query_map(&params_refs[..], |row| {
        Ok(engine::types::BudgetEntry {
            id: row.get(0)?, member_id: row.get(1)?, entry_type: row.get(2)?, category: row.get(3)?,
            amount: row.get(4)?, description: row.get(5)?, recurring: row.get::<_, i64>(6)? != 0,
            frequency: row.get(7)?, date: row.get(8)?, created_at: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
pub fn budget_get_summary(member_id: String, month: String) -> Result<engine::types::BudgetSummary, String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn();

    let total_income: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM budget_entries WHERE member_id = ?1 AND entry_type = 'income' AND strftime('%Y-%m', date) = ?2",
        rusqlite::params![member_id, month], |row| row.get(0)
    ).unwrap_or(0.0);

    let total_expenses: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM budget_entries WHERE member_id = ?1 AND entry_type = 'expense' AND strftime('%Y-%m', date) = ?2",
        rusqlite::params![member_id, month], |row| row.get(0)
    ).unwrap_or(0.0);

    let total_savings: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM budget_entries WHERE member_id = ?1 AND entry_type = 'savings' AND strftime('%Y-%m', date) = ?2",
        rusqlite::params![member_id, month], |row| row.get(0)
    ).unwrap_or(0.0);

    // Category breakdown for expenses
    let mut cat_stmt = conn.prepare(
        "SELECT category, SUM(amount) as total FROM budget_entries
         WHERE member_id = ?1 AND entry_type = 'expense' AND strftime('%Y-%m', date) = ?2
         GROUP BY category ORDER BY total DESC"
    ).map_err(|e| e.to_string())?;
    let cat_rows = cat_stmt.query_map(rusqlite::params![member_id, month], |row| {
        Ok(engine::types::CategoryTotal {
            category: row.get(0)?,
            total: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut categories = Vec::new();
    for r in cat_rows { categories.push(r.map_err(|e| e.to_string())?); }

    Ok(engine::types::BudgetSummary {
        month: month.clone(),
        total_income,
        total_expenses,
        total_savings,
        net: total_income - total_expenses - total_savings,
        categories,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn budget_delete_entry(id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().conn().execute("DELETE FROM budget_entries WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Budget Pulse Commands ──

#[tauri::command(rename_all = "snake_case")]
pub fn budget_parse_natural(input: String) -> Result<serde_json::Value, String> {
    // Parse natural language like "spent $45 on groceries" or "got paid $2000"
    let lower = input.to_lowercase();
    let mut entry_type = "expense";
    let mut amount = 0.0;
    let mut category = "other";
    let description = input.clone();

    // Detect type
    if lower.contains("income") || lower.contains("paid") || lower.contains("earned") || lower.contains("salary") || lower.contains("got paid") {
        entry_type = "income";
    } else if lower.contains("save") || lower.contains("invest") || lower.contains("savings") {
        entry_type = "savings";
    }

    // Extract amount
    let re = regex::Regex::new(r"\$?([\d,]+\.?\d*)").map_err(|e| e.to_string())?;
    if let Some(caps) = re.captures(&lower) {
        let num_str = caps[1].replace(",", "");
        amount = num_str.parse().unwrap_or(0.0);
    }

    // Detect category
    let cat_map = [
        ("grocery|groceries|food|eating", "groceries"),
        ("rent|mortgage|housing", "housing"),
        ("gas|fuel|car|transport|uber|lyft", "transportation"),
        ("electric|water|utility|internet|phone|bill", "utilities"),
        ("movie|entertainment|game|netflix|spotify", "entertainment"),
        ("doctor|health|medical|pharmacy|medicine", "healthcare"),
        ("clothes|clothing|shoes", "clothing"),
        ("restaurant|dinner|lunch|coffee|starbucks", "dining"),
        ("amazon|shopping|store", "shopping"),
        ("salary|paycheck|freelance|income", "salary"),
        ("save|invest|savings", "savings"),
    ];
    for (pattern, cat) in cat_map {
        for word in pattern.split('|') {
            if lower.contains(word) {
                category = cat;
                break;
            }
        }
        if category != "other" { break; }
    }

    Ok(serde_json::json!({
        "entry_type": entry_type,
        "category": category,
        "amount": amount,
        "description": description,
    }))
}

#[tauri::command(rename_all = "snake_case")]
pub fn budget_detect_patterns(member_id: Option<String>) -> Result<Vec<engine::types::BudgetPattern>, String> {
    let engine = engine::get_engine();
    engine.db().detect_budget_patterns(member_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn budget_can_afford(amount: f64, month: String) -> Result<bool, String> {
    let engine = engine::get_engine();
    let member_id = engine.db().get_config("supabase_user_id").unwrap_or_default().unwrap_or_else(|| "default_user".to_string());
    engine.db().can_afford(&member_id, amount, &month).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn budget_create_goal(name: String, target_amount: f64, deadline: Option<String>, monthly_allocation: Option<f64>, member_id: Option<String>) -> Result<(), String> {
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().create_budget_goal(&id, member_id.as_deref(), &name, target_amount, deadline.as_deref(), monthly_allocation).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn budget_get_goals(member_id: Option<String>) -> Result<Vec<engine::types::BudgetGoal>, String> {
    let engine = engine::get_engine();
    engine.db().get_budget_goals(member_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn budget_update_goal(id: String, current_amount: f64) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().update_budget_goal(&id, current_amount).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn budget_delete_goal(id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().delete_budget_goal(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn budget_goal_status(member_id: Option<String>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let goals = engine.db().get_budget_goals(member_id.as_deref()).map_err(|e| e.to_string())?;
    let total_target: f64 = goals.iter().map(|g| g.target_amount).sum();
    let total_current: f64 = goals.iter().map(|g| g.current_amount).sum();
    Ok(serde_json::json!({
        "total_goals": goals.len(),
        "total_target": total_target,
        "total_current": total_current,
        "overall_progress": if total_target > 0.0 { (total_current / total_target) * 100.0 } else { 0.0 },
    }))
}

#[tauri::command(rename_all = "snake_case")]
pub fn budget_generate_report(month: String) -> Result<engine::types::MonthlyReport, String> {
    let engine = engine::get_engine();
    let member_id = engine.db().get_config("supabase_user_id").unwrap_or_default().unwrap_or_else(|| "default_user".to_string());
    engine.db().get_monthly_report(&member_id, &month).map_err(|e| e.to_string())
}

// ── Content Feed ──

#[tauri::command]
pub fn feed_get_items(user_id: String, member_id: Option<String>, content_type: Option<String>, unread_only: bool) -> Result<Vec<engine::types::ContentFeedItem>, String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn();
    let mut conditions = Vec::<String>::new();
    let mut params_vec: Vec<String> = Vec::new();

    conditions.push("member_id = ?".to_string());
    params_vec.push(user_id);
    if let Some(mid) = &member_id {
        conditions.push("(member_id = ? OR member_id IS NULL)".to_string());
        params_vec.push(mid.clone());
    }
    if let Some(ct) = &content_type {
        conditions.push("content_type = ?".to_string());
        params_vec.push(ct.clone());
    }
    if unread_only {
        conditions.push("is_read = 0".to_string());
    }

    let where_clause = if conditions.is_empty() { String::new() } else { format!("WHERE {}", conditions.join(" AND ")) };
    let query = format!(
        "SELECT id, member_id, content_type, title, body, source_url, category, is_read, is_bookmarked, created_at, expires_at
         FROM content_feed {} ORDER BY is_bookmarked DESC, is_read ASC, created_at DESC LIMIT 50", where_clause
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
    let rows = stmt.query_map(&params_refs[..], |row| {
        Ok(engine::types::ContentFeedItem {
            id: row.get(0)?, member_id: row.get(1)?, content_type: row.get(2)?, title: row.get(3)?,
            body: row.get(4)?, source_url: row.get(5)?, category: row.get(6)?,
            is_read: row.get::<_, i64>(7)? != 0, is_bookmarked: row.get::<_, i64>(8)? != 0,
            created_at: row.get(9)?, expires_at: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
pub fn feed_mark_read(user_id: String, id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().conn().execute("UPDATE content_feed SET is_read = 1 WHERE id = ?1 AND member_id = ?2", rusqlite::params![id, user_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn feed_toggle_bookmark(user_id: String, id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().conn().execute(
        "UPDATE content_feed SET is_bookmarked = CASE WHEN is_bookmarked = 1 THEN 0 ELSE 1 END WHERE id = ?1 AND member_id = ?2",
        rusqlite::params![id, user_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn feed_add_item(member_id: Option<String>, content_type: String, title: String, body: String,
                      source_url: Option<String>, category: Option<String>) -> Result<engine::types::ContentFeedItem, String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn();
    let id = uuid::Uuid::new_v4().to_string();
    let now = engine::db::EngineDb::now();
    conn.execute(
        "INSERT INTO content_feed (id, member_id, content_type, title, body, source_url, category, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, member_id, content_type, title, body, source_url, category, now],
    ).map_err(|e| e.to_string())?;
    Ok(engine::types::ContentFeedItem {
        id, member_id, content_type, title, body, source_url, category,
        is_read: false, is_bookmarked: false, created_at: now, expires_at: None,
    })
}

#[tauri::command]
pub async fn feed_generate(user_id: String, member_id: Option<String>, interests: Option<String>) -> Result<Vec<engine::types::ContentFeedItem>, String> {
    #[allow(unused_variables)]
    let _uid = user_id;
    let engine = engine::get_engine();

    let interest_text = interests.unwrap_or_else(|| "general knowledge, technology, health, finance, fun facts".to_string());

    let prompt = format!(
        "Generate a personalized daily content feed for someone interested in: {interest_text}

Create 5 diverse items. Each item should be one of these types:
- news: A current event or trending topic (keep it timeless/general since I don't have live news)
- tip: A useful life hack, productivity tip, or practical advice
- challenge: A fun daily challenge or activity to try
- fun_fact: An interesting or surprising fact
- reminder: A seasonal or timely reminder

For each item provide:
1. content_type (one of: news, tip, challenge, fun_fact, reminder)
2. title (catchy, under 60 chars)
3. body (2-3 sentences, informative and engaging)
4. category (education, tech, health, fun, finance, lifestyle)
5. source_url (null is fine, or a real URL if applicable)

Respond in this EXACT JSON format (no markdown, no code fences, just raw JSON):
[
  {{
    \"content_type\": \"tip\",
    \"title\": \"Title here\",
    \"body\": \"Body text here. 2-3 sentences.\",
    \"category\": \"lifestyle\",
    \"source_url\": null
  }}
]

Make the content genuinely useful and interesting. Not generic filler."
    );

    let messages = vec![OpenAIMessage {
        role: "user".to_string(),
        content: Some(prompt),
        tool_call_id: None,
        tool_calls: None,
    }];

    let response = cloud::cloud_chat(None, messages, Some(1500), None, None)
        .await
        .map_err(|e| format!("AI failed: {}", e))?;

    let content = response.content.trim();
    let json_str = content
        .strip_prefix("```json").unwrap_or(content)
        .strip_prefix("```").unwrap_or(content)
        .strip_suffix("```").unwrap_or(content)
        .trim();

    #[derive(serde::Deserialize)]
    struct FeedItem {
        content_type: String,
        title: String,
        body: String,
        category: Option<String>,
        source_url: Option<String>,
    }

    let items: Vec<FeedItem> = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse AI response: {}. Raw: {}", e, json_str))?;

    let conn = engine.db().conn();
    let now = engine::db::EngineDb::now();
    let mut result = Vec::new();

    for item in &items {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO content_feed (id, member_id, content_type, title, body, source_url, category, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![id, member_id, item.content_type, item.title, item.body, item.source_url, item.category, now],
        ).map_err(|e| e.to_string())?;
        result.push(engine::types::ContentFeedItem {
            id, member_id: member_id.clone(), content_type: item.content_type.clone(),
            title: item.title.clone(), body: item.body.clone(),
            source_url: item.source_url.clone(), category: item.category.clone(),
            is_read: false, is_bookmarked: false, created_at: now.clone(), expires_at: None,
        });
    }

    Ok(result)
}

// ── Fridge Scanner ──

#[tauri::command]
pub async fn fridge_scan(scan_description: String) -> Result<engine::types::FridgeScanResult, String> {
    let engine = engine::get_engine();

    let prompt = format!(
        "You are a kitchen inventory AI. The user scanned their fridge/pantry and describes what they see: \"{scan_description}\"

For each ingredient you can identify:
1. Name (standard grocery name)
2. Estimated quantity
3. Unit (pieces, cups, lbs, oz, etc.)
4. Category (produce, dairy, meat, pantry, spice, frozen)
5. Estimated expiry: fresh (3-5 days), medium (1-2 weeks), long (1+ month)

Respond in this EXACT JSON format (no markdown, no code fences, just raw JSON):
{{
  \"items\": [
    {{\"name\": \"chicken breast\", \"quantity\": 2, \"unit\": \"pieces\", \"category\": \"meat\", \"expiry_window\": \"fresh\"}},
    {{\"name\": \"bell peppers\", \"quantity\": 3, \"unit\": \"pieces\", \"category\": \"produce\", \"expiry_window\": \"medium\"}}
  ],
  \"summary\": \"You have X items. Y are expiring soon.\",
  \"waste_risk\": [\"items expiring within 3 days\"],
  \"suggested_meals\": [\"3-5 specific meals you could make\"]
}}

Be specific with ingredient names. Use standard grocery terms."
    );

    let messages = vec![OpenAIMessage {
        role: "user".to_string(),
        content: Some(prompt),
        tool_call_id: None,
        tool_calls: None,
    }];

    let response = cloud::cloud_chat(None, messages, Some(1500), None, None)
        .await
        .map_err(|e| format!("AI failed: {}", e))?;

    let content = response.content.trim();
    let json_str = content
        .strip_prefix("```json").unwrap_or(content)
        .strip_prefix("```").unwrap_or(content)
        .strip_suffix("```").unwrap_or(content)
        .trim();

    #[derive(serde::Deserialize)]
    struct ScanResult {
        items: Vec<ScanItem>,
        summary: String,
        waste_risk: Vec<String>,
        suggested_meals: Vec<String>,
    }
    #[derive(serde::Deserialize)]
    struct ScanItem {
        name: String,
        quantity: Option<f64>,
        unit: Option<String>,
        category: Option<String>,
        expiry_window: Option<String>,
    }

    let scan: ScanResult = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse scan: {}. Raw: {}", e, json_str))?;

    let now = chrono::Utc::now();
    let conn = engine.db().conn();
    let mut added_items = Vec::new();

    for item in &scan.items {
        let id = uuid::Uuid::new_v4().to_string();
        let expiry = match item.expiry_window.as_deref() {
            Some("fresh") => Some((now + chrono::Duration::days(4)).format("%Y-%m-%d").to_string()),
            Some("medium") => Some((now + chrono::Duration::days(14)).format("%Y-%m-%d").to_string()),
            Some("long") => Some((now + chrono::Duration::days(60)).format("%Y-%m-%d").to_string()),
            _ => None,
        };
        let member_id = get_supabase_user_id();
        conn.execute(
            "INSERT INTO kitchen_inventory (id, member_id, name, quantity, unit, category, expiry_date, location, last_restocked, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'fridge', ?8, ?8, ?8)",
            rusqlite::params![id, member_id, item.name, item.quantity, item.unit, item.category, expiry, now.to_rfc3339()],
        ).map_err(|e| e.to_string())?;
        added_items.push(engine::types::KitchenInventoryItem {
            id, member_id, name: item.name.clone(), quantity: item.quantity, unit: item.unit.clone(),
            category: item.category.clone(), expiry_date: expiry, location: Some("fridge".to_string()),
            last_restocked: Some(now.to_rfc3339()), created_at: now.to_rfc3339(), updated_at: now.to_rfc3339(),
        });
    }

    Ok(engine::types::FridgeScanResult {
        items: added_items,
        summary: scan.summary,
        waste_risk: scan.waste_risk,
        suggested_meals: scan.suggested_meals,
    })
}

#[tauri::command]
pub fn fridge_what_can_i_make() -> Result<engine::types::MealMatchResult, String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn();

    let mut inv_stmt = conn.prepare("SELECT name, quantity FROM kitchen_inventory").map_err(|e| e.to_string())?;
    let inv_rows = inv_stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, Option<f64>>(1)?))
    }).map_err(|e| e.to_string())?;
    let mut inventory: std::collections::HashMap<String, Option<f64>> = std::collections::HashMap::new();
    for r in inv_rows {
        let (name, qty) = r.map_err(|e| e.to_string())?;
        inventory.insert(name.to_lowercase(), qty);
    }

    let meals = engine.db().get_meals(None, None, false).map_err(|e| e.to_string())?;
    let mut matches = Vec::new();

    for meal in &meals {
        let ingredients = engine.db().get_meal_ingredients(&meal.id).map_err(|e| e.to_string())?;
        let mut have = 0i64;
        let mut missing: Vec<String> = Vec::new();

        for ing in &ingredients {
            let ing_lower = ing.name.to_lowercase();
            let has_it = inventory.keys().any(|inv| inv.contains(&ing_lower) || ing_lower.contains(inv));
            if has_it { have += 1; } else { missing.push(ing.name.clone()); }
        }

        let total = ingredients.len() as i64;
        if total > 0 {
            let pct = (have as f64 / total as f64) * 100.0;
            if pct >= 50.0 {
                matches.push(engine::types::MealMatch {
                    meal_id: meal.id.clone(), meal_name: meal.name.clone(),
                    have_count: have, total_count: total, match_pct: pct,
                    missing_ingredients: missing.clone(), can_make: missing.is_empty(),
                });
            }
        }
    }

    matches.sort_by(|a, b| b.match_pct.partial_cmp(&a.match_pct).unwrap_or(std::cmp::Ordering::Equal));
    let can_make_count = matches.iter().filter(|m| m.can_make).count() as i64;

    Ok(engine::types::MealMatchResult {
        matches,
        total_inventory_items: inventory.len() as i64,
        can_make_count,
    })
}

#[tauri::command]
pub fn fridge_expiring_soon(days: Option<i64>) -> Result<Vec<engine::types::KitchenInventoryItem>, String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn();
    let d = days.unwrap_or(3);
    let future_date = (chrono::Utc::now() + chrono::Duration::days(d)).format("%Y-%m-%d").to_string();
    let member_id = get_supabase_user_id();

    let mut stmt = conn.prepare(
        "SELECT id, member_id, name, quantity, unit, category, expiry_date, location, last_restocked, created_at, updated_at
         FROM kitchen_inventory WHERE member_id = ?1 AND expiry_date IS NOT NULL AND expiry_date <= ?2 ORDER BY expiry_date"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![member_id, future_date], |row| {
        Ok(engine::types::KitchenInventoryItem {
            id: row.get(0)?, member_id: row.get(1)?, name: row.get(2)?, quantity: row.get(3)?, unit: row.get(4)?,
            category: row.get(5)?, expiry_date: row.get(6)?, location: row.get(7)?,
            last_restocked: row.get(8)?, created_at: row.get(9)?, updated_at: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

#[tauri::command]
pub fn fridge_shopping_for_meals() -> Result<Vec<engine::types::GroceryItem>, String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn();

    let mut inv_stmt = conn.prepare("SELECT LOWER(name) FROM kitchen_inventory").map_err(|e| e.to_string())?;
    let inv_rows = inv_stmt.query_map([], |row| Ok(row.get::<_, String>(0)?)).map_err(|e| e.to_string())?;
    let mut inventory_set = std::collections::HashSet::new();
    for r in inv_rows { inventory_set.insert(r.map_err(|e| e.to_string())?); }

    let mut ing_stmt = conn.prepare(
        "SELECT DISTINCT i.name, i.quantity, i.unit, i.category, i.estimated_cost, i.meal_id
         FROM meal_ingredients i INNER JOIN meals m ON i.meal_id = m.id WHERE m.is_favorite = 1 OR m.times_made > 0
         ORDER BY i.category, i.name"
    ).map_err(|e| e.to_string())?;
    let ing_rows = ing_stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?, row.get::<_, Option<f64>>(1)?, row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?, row.get::<_, Option<f64>>(4)?, row.get::<_, String>(5)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for r in ing_rows {
        let (name, qty, unit, category, cost, meal_id) = r.map_err(|e| e.to_string())?;
        let name_lower = name.to_lowercase();
        let has_it = inventory_set.iter().any(|inv| inv.contains(&name_lower) || name_lower.contains(inv));
        if !has_it {
            let id = uuid::Uuid::new_v4().to_string();
            items.push(engine::types::GroceryItem {
                id, member_id: None, name, quantity: qty, unit, category,
                estimated_cost: cost, is_checked: false, source_meal_id: Some(meal_id),
                week_start: None, created_at: engine::db::EngineDb::now(),
            });
        }
    }
    Ok(items)
}

// ── Life Autopilot ──

#[tauri::command]
pub async fn life_analyze_document(text: String, doc_type: Option<String>) -> Result<engine::types::LifeDocument, String> {
    let engine = engine::get_engine();

    let doc_type_str = doc_type.as_deref().unwrap_or("unknown");
    let prompt = format!(
        "You are a family document analysis AI. Analyze this document and extract key information:

Document type: {doc_type_str}
Content: {text}

Extract:
1. A clear title for this document
2. A 2-3 sentence summary
3. Key dates mentioned (deadlines, expiry dates, appointment dates, renewal dates)
4. Action items (things the family needs to DO based on this document)
5. Tags for categorization

Respond in this EXACT JSON format (no markdown, no code fences, just raw JSON):
{{
  \"title\": \"Clear document title\",
  \"summary\": \"2-3 sentence summary of what this document is about and why it matters\",
  \"key_dates\": [
    {{\"date\": \"2026-05-15\", \"description\": \"Warranty expires\", \"type\": \"expiry\"}},
    {{\"date\": \"2026-04-01\", \"description\": \"Payment due\", \"type\": \"deadline\"}}
  ],
  \"action_items\": [
    {{\"action\": \"Schedule HVAC maintenance before summer\", \"deadline\": \"2026-05-01\", \"priority\": \"normal\"}},
    {{\"action\": \"Submit insurance claim\", \"deadline\": \"2026-04-15\", \"priority\": \"high\"}}
  ],
  \"doc_type\": \"bill|school|warranty|medical|insurance|tax|contract|receipt|other\",
  \"tags\": [\"home\", \"maintenance\"],
  \"knowledge\": [
    {{\"category\": \"home\", \"key\": \"HVAC-filter-size\", \"value\": \"16x25x1\"}}
  ]
}}

Be thorough but concise. Extract EVERY date and action item mentioned."
    );

    let messages = vec![OpenAIMessage {
        role: "user".to_string(),
        content: Some(prompt),
        tool_call_id: None,
        tool_calls: None,
    }];

    let response = cloud::cloud_chat(None, messages, Some(2000), None, None)
        .await
        .map_err(|e| format!("AI failed: {}", e))?;

    let content = response.content.trim();
    let json_str = content
        .strip_prefix("```json").unwrap_or(content)
        .strip_prefix("```").unwrap_or(content)
        .strip_suffix("```").unwrap_or(content)
        .trim();

    #[derive(serde::Deserialize)]
    struct DocAnalysis {
        title: String,
        summary: String,
        key_dates: Vec<DateItem>,
        action_items: Vec<ActionItem>,
        doc_type: String,
        tags: Vec<String>,
        knowledge: Vec<KnowledgeItem>,
    }
    #[derive(serde::Deserialize, serde::Serialize)]
    struct DateItem { date: String, description: String, #[serde(rename = "type")] dtype: String }
    #[derive(serde::Deserialize, serde::Serialize)]
    struct ActionItem { action: String, deadline: Option<String>, priority: Option<String> }
    #[derive(serde::Deserialize)]
    struct KnowledgeItem { category: String, key: String, value: String }

    let analysis: DocAnalysis = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse analysis: {}. Raw: {}", e, json_str))?;

    let doc_id = uuid::Uuid::new_v4().to_string();
    let key_dates_json = serde_json::to_string(&analysis.key_dates).unwrap_or_default();
    let action_items_json = serde_json::to_string(&analysis.action_items).unwrap_or_default();

    engine.db().add_document(
        &doc_id, None, &analysis.doc_type, &analysis.title,
        Some(&text), Some(&analysis.summary), Some(&key_dates_json),
        Some(&action_items_json), "ai-analysis",
    ).map_err(|e| e.to_string())?;

    // Auto-create reminders from key dates
    for date_item in &analysis.key_dates {
        let reminder_id = uuid::Uuid::new_v4().to_string();
        let priority = if date_item.dtype == "deadline" { "high" } else { "normal" };
        let _ = engine.db().add_reminder(
            &reminder_id, None, Some(&doc_id), &date_item.dtype,
            &format!("{}: {}", date_item.description, date_item.date), None,
            &date_item.date, priority,
        );
    }

    // Auto-create reminders from action items
    for action in &analysis.action_items {
        let reminder_id = uuid::Uuid::new_v4().to_string();
        let due = action.deadline.as_deref().unwrap_or("2026-12-31");
        let pri = action.priority.as_deref().unwrap_or("normal");
        let _ = engine.db().add_reminder(
            &reminder_id, None, Some(&doc_id), "custom",
            &action.action, None, due, pri,
        );
    }

    // Store knowledge items
    for know in &analysis.knowledge {
        let know_id = uuid::Uuid::new_v4().to_string();
        engine.db().add_knowledge(&know_id, None, &know.category, &know.key, &know.value).ok();
    }

    // Get the full document back
    let docs = engine.db().get_documents(None, None).map_err(|e| e.to_string())?;
    docs.into_iter().find(|d| d.id == doc_id)
        .ok_or_else(|| "Failed to load created document".to_string())
}

#[tauri::command]
pub fn life_get_dashboard() -> Result<engine::types::LifeAutopilotDashboard, String> {
    let engine = engine::get_engine();
    engine.db().get_life_dashboard().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn life_get_documents(member_id: Option<String>, doc_type: Option<String>) -> Result<Vec<engine::types::LifeDocument>, String> {
    let engine = engine::get_engine();
    engine.db().get_documents(member_id.as_deref(), doc_type.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn life_get_reminders(days: Option<i64>) -> Result<Vec<engine::types::LifeReminder>, String> {
    let engine = engine::get_engine();
    engine.db().get_upcoming_reminders(days.unwrap_or(30)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn life_get_knowledge(member_id: Option<String>, category: Option<String>) -> Result<Vec<engine::types::LifeKnowledge>, String> {
    let engine = engine::get_engine();
    engine.db().get_knowledge(member_id.as_deref(), category.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn life_add_reminder(member_id: Option<String>, title: String, description: Option<String>, due_date: String, priority: Option<String>) -> Result<(), String> {
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().add_reminder(&id, member_id.as_deref(), None, "custom", &title, description.as_deref(), &due_date, priority.as_deref().unwrap_or("normal"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn life_ask(question: String) -> Result<String, String> {
    let engine = engine::get_engine();

    // Gather context from all knowledge
    let knowledge = engine.db().get_knowledge(None, None).map_err(|e| e.to_string())?;
    let knowledge_context: String = knowledge.iter()
        .map(|k| format!("{}: {} = {}", k.category, k.key, k.value))
        .collect::<Vec<_>>().join("\n");

    let reminders = engine.db().get_upcoming_reminders(60).map_err(|e| e.to_string())?;
    let reminders_context: String = reminders.iter()
        .map(|r| format!("[{}] {} (due: {}, priority: {})", r.reminder_type, r.title, r.due_date, r.priority))
        .collect::<Vec<_>>().join("\n");

    let prompt = format!(
        "You are a family life management AI assistant. Answer the user's question using the knowledge base and reminders available.

FAMILY KNOWLEDGE:
{knowledge_context}

UPCOMING REMINDERS:
{reminders_context}

USER QUESTION: {question}

Provide a helpful, specific answer based on the information above. If you don't have the information, say so honestly and suggest how to find out."
    );

    let messages = vec![OpenAIMessage {
        role: "user".to_string(),
        content: Some(prompt),
        tool_call_id: None,
        tool_calls: None,
    }];

    let response = cloud::cloud_chat(None, messages, Some(1000), None, None)
        .await
        .map_err(|e| format!("AI failed: {}", e))?;

    Ok(response.content)
}

// ── Life Autopilot: Orbit Commands ──

#[tauri::command]
pub fn life_add_task(user_id: String, title: String, category: Option<String>, priority: Option<String>, due_date: Option<String>, energy_type: Option<String>) -> Result<(), String> {
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().add_life_task(&id, &user_id, &title, category.as_deref(), priority.as_deref().unwrap_or("medium"), due_date.as_deref(), energy_type.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn life_get_tasks(user_id: String, status: Option<String>) -> Result<Vec<engine::types::LifeTask>, String> {
    let engine = engine::get_engine();
    engine.db().get_life_tasks(&user_id, status.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn life_complete_task(user_id: String, task_id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().update_life_task_status(&user_id, &task_id, "completed").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn life_delete_task(user_id: String, task_id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().delete_life_task(&user_id, &task_id).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn life_add_habit(user_id: String, name: String, category: Option<String>, frequency: Option<String>, target_count: Option<i64>) -> Result<(), String> {
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().add_life_habit(&id, &user_id, &name, category.as_deref(), frequency.as_deref().unwrap_or("daily"), target_count.unwrap_or(1)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn life_get_habits(user_id: String, active_only: Option<bool>) -> Result<Vec<engine::types::LifeHabit>, String> {
    let engine = engine::get_engine();
    engine.db().get_life_habits(&user_id, active_only.unwrap_or(true)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn life_log_habit(user_id: String, habit_id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    engine.db().log_life_habit(&id, &habit_id, &user_id, &today, 1).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn life_get_orbit_dashboard(user_id: String) -> Result<engine::types::OrbitDashboard, String> {
    let engine = engine::get_engine();
    engine.db().get_orbit_dashboard(&user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn life_add_daily_focus(user_id: String, task_id: String, position: Option<i64>) -> Result<(), String> {
    let engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().add_daily_focus(&id, &user_id, &task_id, position.unwrap_or(0)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn life_morning_brief(user_id: String) -> Result<String, String> {
    let engine = engine::get_engine();
    let dashboard = engine.db().get_orbit_dashboard(&user_id).map_err(|e| e.to_string())?;
    let mut brief = String::from("☀️ Good morning!\n\n");
    if !dashboard.today_focus.is_empty() {
        brief.push_str("🎯 Today's Focus:\n");
        for (i, f) in dashboard.today_focus.iter().enumerate() {
            if let Some(ref task) = f.task {
                brief.push_str(&format!("  {}. {}\n", i + 1, task.title));
            }
        }
    }
    if !dashboard.pending_tasks.is_empty() {
        brief.push_str(&format!("\n📋 {} pending tasks\n", dashboard.pending_tasks.len()));
    }
    if dashboard.streak_total > 0 {
        brief.push_str(&format!("🔥 {} total habit streaks\n", dashboard.streak_total));
    }
    Ok(brief)
}

#[tauri::command]
pub async fn life_smart_reschedule(task_id: String) -> Result<engine::types::LifeSchedule, String> {
    let _engine = engine::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    let schedule = engine::types::LifeSchedule {
        id: id.clone(),
        task_id: Some(task_id),
        suggested_time: Some("10:00 AM".to_string()),
        energy_match: Some("high".to_string()),
        reason: Some("Best focus time for important tasks".to_string()),
        accepted: false,
        created_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
    };
    Ok(schedule)
}

#[tauri::command]
pub async fn life_parse_input(input: String) -> Result<serde_json::Value, String> {
    let lower = input.to_lowercase();
    let action = if lower.contains("remind") || lower.contains("remember") { "reminder" }
        else if lower.contains("habit") || lower.contains("daily") { "habit" }
        else { "task" };
    Ok(serde_json::json!({
        "action": action,
        "title": input,
        "parsed": true,
    }))
}

#[tauri::command]
pub async fn life_decision_helper(options: String) -> Result<String, String> {
    Ok(format!("🤔 Analyzing: {}\n\nConsider: pros/cons, time investment, alignment with goals.", options))
}

#[tauri::command]
pub fn life_get_heatmap(user_id: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let tasks = engine.db().get_life_tasks(&user_id, None).unwrap_or_default();
    let mut days: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for task in &tasks {
        if let Some(ref date) = task.due_date {
            *days.entry(date[..10].to_string()).or_insert(0) += 1;
        }
    }
    Ok(serde_json::json!({ "days": days }))
}

#[tauri::command]
pub fn life_dismiss_nudge(user_id: String, nudge_id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn();
    conn.execute("UPDATE life_nudges SET dismissed = 1 WHERE id = ?1 AND member_id = ?2", rusqlite::params![nudge_id, user_id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Home Health ──

#[tauri::command]
pub fn home_upsert_profile(id: String, address: Option<String>, year_built: Option<i64>, square_feet: Option<i64>,
    hvac_type: Option<String>, hvac_filter_size: Option<String>, water_heater_type: Option<String>,
    roof_type: Option<String>, window_type: Option<String>, insulation_type: Option<String>) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().upsert_home_profile(&id, address.as_deref(), year_built, square_feet,
        hvac_type.as_deref(), hvac_filter_size.as_deref(), water_heater_type.as_deref(),
        roof_type.as_deref(), window_type.as_deref(), insulation_type.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn home_get_dashboard() -> Result<engine::types::HomeDashboard, String> {
    let engine = engine::get_engine();
    engine.db().get_home_dashboard().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn home_add_bill(id: String, bill_type: String, amount: f64, usage: Option<f64>, billing_month: String, notes: Option<String>) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().add_home_bill(&id, &bill_type, amount, usage, &billing_month, notes.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn home_get_bills(bill_type: Option<String>, limit: Option<i64>) -> Result<Vec<engine::types::HomeBill>, String> {
    let engine = engine::get_engine();
    engine.db().get_home_bills(bill_type.as_deref(), limit.unwrap_or(24)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn home_delete_bill(id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().delete_home_bill(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn home_add_maintenance(id: String, task: String, category: String, last_completed: Option<String>, interval_months: Option<i64>, priority: Option<String>, estimated_cost: Option<f64>, notes: Option<String>) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().add_home_maintenance(&id, &task, &category, last_completed.as_deref(), interval_months, priority.as_deref(), estimated_cost, notes.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn home_get_maintenance(category: Option<String>) -> Result<Vec<engine::types::HomeMaintenance>, String> {
    let engine = engine::get_engine();
    engine.db().get_home_maintenance(category.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn home_add_appliance(id: String, name: String, category: String, model: Option<String>, installed_date: Option<String>, expected_lifespan_years: Option<f64>, warranty_expiry: Option<String>, estimated_replacement_cost: Option<f64>, notes: Option<String>) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().add_home_appliance(&id, &name, &category, model.as_deref(), installed_date.as_deref(), expected_lifespan_years, warranty_expiry.as_deref(), estimated_replacement_cost, notes.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn home_get_appliances() -> Result<Vec<engine::types::HomeAppliance>, String> {
    let engine = engine::get_engine();
    engine.db().get_home_appliances().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn home_get_insights() -> Result<Vec<engine::types::HomeInsight>, String> {
    let engine = engine::get_engine();
    let dashboard = engine.db().get_home_dashboard().map_err(|e| e.to_string())?;
    let appliances = dashboard.appliances_needing_service;
    let bills = engine.db().get_bill_trends(12).unwrap_or_default();
    let mut parts = Vec::new();
    if let Some(ref profile) = dashboard.profile {
        if let Some(yr) = profile.year_built {
            let age = chrono::Utc::now().year() - yr as i32;
            parts.push(format!("Home age: {} years (built {})", age, yr));
        }
        if let Some(ref ht) = profile.hvac_type { parts.push(format!("HVAC: {}", ht)); }
        if let Some(ref fs) = profile.hvac_filter_size { parts.push(format!("Filter: {}", fs)); }
    }
    for bill in &bills {
        parts.push(format!("{}: ${:.2}", bill.month, bill.total));
    }
    for app in &appliances {
        parts.push(format!("{} ({}): age ~{}yrs, replacement ${:.0}", app.name, app.category,
            app.installed_date.as_deref().map(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok().map(|dd| ((chrono::Utc::now().date_naive() - dd).num_days() as f64 / 365.25) as i32).unwrap_or(0)).unwrap_or(0),
            app.estimated_replacement_cost.unwrap_or(0.0)));
    }
    for m in &dashboard.upcoming_maintenance {
        parts.push(format!("Maintenance: {} (due {:?})", m.task, m.next_due));
    }
    let prompt = format!("You are a home health AI. Based on this data, provide 3-5 specific actionable insights.\n\n{}\n\nRespond as JSON array (no markdown):\n[{{\"title\":\"...\",\"description\":\"...\",\"estimated_impact\":\"$X/month\",\"priority\":\"normal\",\"category\":\"efficiency|maintenance|financial|safety\"}}]", parts.join("\n"));
    let messages = vec![OpenAIMessage { role: "user".to_string(), content: Some(prompt), tool_call_id: None, tool_calls: None }];
    let response = cloud::cloud_chat(None, messages, Some(2000), None, None).await.map_err(|e| format!("AI failed: {}", e))?;
    let content = response.content.trim();
    let json_str = content.strip_prefix("```json").unwrap_or(content).strip_prefix("```").unwrap_or(content).strip_suffix("```").unwrap_or(content).trim();
    serde_json::from_str(json_str).map_err(|e| format!("Parse error: {}", e))
}

// ── Foundation AI Commands ──

/// Diagnose a home problem from a natural language symptom description.
#[tauri::command]
pub fn home_diagnose_problem(user_id: String, symptom: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let symptom_lower = symptom.to_lowercase();

    // Heuristic keyword-based diagnosis (placeholder for future LLM call)
    let (system, severity, causes, recommendations): (String, String, Vec<&str>, Vec<&str>) =
        if symptom_lower.contains("leak") || symptom_lower.contains("water") || symptom_lower.contains("drip") {
            ("plumbing".to_string(), "high".to_string(),
             vec!["Worn-out pipe joint or gasket", "Corroded pipe fitting", "Loose connection under sink/toilet", "High water pressure causing stress"],
             vec!["Turn off water supply to affected area", "Inspect visible pipes for corrosion", "Check toilet flapper and supply line", "Call plumber if leak is behind wall"])
        } else if symptom_lower.contains("no heat") || symptom_lower.contains("cold") || symptom_lower.contains("thermostat") || symptom_lower.contains("hvac") || symptom_lower.contains("ac") || symptom_lower.contains("furnace") {
            ("hvac".to_string(), "high".to_string(),
             vec!["Clogged air filter restricting airflow", "Thermostat malfunction or dead batteries", "Pilot light out (gas furnace)", "Tripped circuit breaker", "Refrigerant leak (AC)"],
             vec!["Replace HVAC filter", "Check thermostat settings and batteries", "Inspect circuit breaker panel", "Schedule professional HVAC inspection"])
        } else if symptom_lower.contains("electrical") || symptom_lower.contains("outlet") || symptom_lower.contains("breaker") || symptom_lower.contains("flicker") || symptom_lower.contains("spark") {
            ("electrical".to_string(), "critical".to_string(),
             vec!["Overloaded circuit", "Loose wire connection", "Faulty outlet or switch", "Outdated wiring unable to handle modern loads"],
             vec!["Do NOT touch exposed wires — call licensed electrician", "Check if GFCI outlet has tripped", "Reduce load on the affected circuit", "Schedule electrical inspection"])
        } else if symptom_lower.contains("roof") || symptom_lower.contains("ceiling") || symptom_lower.contains("attic") || symptom_lower.contains("stain") {
            ("roof".to_string(), "high".to_string(),
             vec!["Damaged or missing shingles", "Failed flashing around chimney/vents", "Ice dam causing water backup", "Condensation from poor attic ventilation"],
             vec!["Inspect attic for active water intrusion", "Check roof from ground for visible damage", "Clear gutters and check downspouts", "Call roofer if damage is extensive"])
        } else if symptom_lower.contains("noise") || symptom_lower.contains("squeak") || symptom_lower.contains("bang") || symptom_lower.contains("rattle") || symptom_lower.contains("hum") {
            ("general".to_string(), "medium".to_string(),
             vec!["Loose component vibrating during operation", "Worn bearing or motor", "Water hammer in plumbing", "Ductwork expansion/contraction"],
             vec!["Identify the exact location and timing of the noise", "Check for loose screws, bolts, or panels", "If plumbing-related, check water pressure", "If persistent, schedule professional inspection"])
        } else if symptom_lower.contains("smell") || symptom_lower.contains("odor") || symptom_lower.contains("mold") || symptom_lower.contains("musty") {
            ("general".to_string(), "high".to_string(),
             vec!["Mold growth from moisture intrusion", "Sewer gas from dry P-trap", "Gas leak (if rotten egg smell) — VACUATE IMMEDIATELY", "Dead animal in crawlspace or ductwork"],
             vec!["If gas smell: leave house immediately and call gas company", "Check for visible mold in bathrooms, basement, under sinks", "Run water in all unused drains to refill P-traps", "Use dehumidifier in damp areas"])
        } else {
            ("general".to_string(), "medium".to_string(),
             vec!["Multiple possible causes — needs further investigation", "Normal wear and tear", "Deferred maintenance issue"],
             vec!["Document the issue with photos and notes", "Check if issue is intermittent or constant", "Consult relevant maintenance guide", "Consider scheduling a professional inspection"])
        };

    let diagnosis = serde_json::json!({
        "symptom": symptom,
        "system": system,
        "severity": severity,
        "possible_causes": causes,
        "recommended_actions": recommendations,
        "confidence": "heuristic",
        "note": "This diagnosis is based on keyword matching. For accurate diagnosis, consult a licensed professional or enable AI-powered diagnosis."
    });

    let diag_json = serde_json::to_string(&diagnosis).map_err(|e| e.to_string())?;
    engine.db().store_home_problem(&user_id, &symptom, Some(&diag_json), Some(&system), Some(&severity))
        .map_err(|e| e.to_string())?;

    Ok(diagnosis)
}

/// Predict appliance failures based on age vs expected lifespan.
#[tauri::command]
pub fn home_predict_failures() -> Result<Vec<serde_json::Value>, String> {
    let engine = engine::get_engine();
    let appliances = engine.db().get_home_appliances().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().date_naive();

    let mut predictions: Vec<serde_json::Value> = appliances.iter().filter_map(|app| {
        let lifespan = app.expected_lifespan_years.unwrap_or(10.0);
        let installed = app.installed_date.as_deref()?;
        let install_date = chrono::NaiveDate::parse_from_str(installed, "%Y-%m-%d").ok()?;
        let age_years = (now - install_date).num_days() as f64 / 365.25;
        let pct_life = (age_years / lifespan).min(1.5);

        // Failure probability model: exponential increase after 70% of lifespan
        let failure_prob_6mo = if pct_life >= 1.0 {
            0.85_f64.min(0.3 + (pct_life - 1.0) * 1.5)
        } else if pct_life >= 0.7 {
            0.05 + (pct_life - 0.7) * 0.83
        } else {
            0.02 + pct_life * 0.04
        };

        let urgency = if failure_prob_6mo > 0.6 { "critical" }
            else if failure_prob_6mo > 0.35 { "high" }
            else if failure_prob_6mo > 0.15 { "medium" }
            else { "low" };

        let warning_signs: Vec<&str> = match app.category.as_str() {
            "hvac" => vec!["Uneven heating/cooling", "Unusual noises", "Rising energy bills", "Frequent cycling"],
            "plumbing" => vec!["Reduced water pressure", "Discolored water", "Rumbling sounds", "Visible corrosion"],
            "appliance" => vec!["Inconsistent performance", "Unusual noises", "Excessive heat", "Visible rust or wear"],
            _ => vec!["Declining performance", "Unusual sounds or smells", "Visible wear or damage"],
        };

        let action = if failure_prob_6mo > 0.6 { "Replace immediately" }
            else if failure_prob_6mo > 0.35 { "Start shopping for replacement; schedule inspection" }
            else if failure_prob_6mo > 0.15 { "Schedule preventive maintenance" }
            else { "Continue regular maintenance" };

        Some(serde_json::json!({
            "appliance_name": app.name,
            "category": app.category,
            "current_age_years": (age_years * 10.0).round() / 10.0,
            "expected_lifespan": lifespan,
            "failure_probability_next_6mo": (failure_prob_6mo * 100.0).round() / 100.0,
            "warning_signs_to_watch": warning_signs,
            "estimated_replacement_cost": app.estimated_replacement_cost.unwrap_or(0.0),
            "recommended_action": action,
            "urgency": urgency,
        }))
    }).collect();

    predictions.sort_by(|a, b| {
        let pa = a["failure_probability_next_6mo"].as_f64().unwrap_or(0.0);
        let pb = b["failure_probability_next_6mo"].as_f64().unwrap_or(0.0);
        pb.partial_cmp(&pa).unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(predictions)
}

/// Get seasonal maintenance tasks for a given month.
#[tauri::command]
pub fn home_get_seasonal_tasks(month: i64) -> Result<Vec<serde_json::Value>, String> {
    let engine = engine::get_engine();
    let tasks = engine.db().get_seasonal_tasks(month).map_err(|e| e.to_string())?;
    // If table is empty, schema seeds default tasks on first run via migration
    Ok(tasks)
}

/// Mark a seasonal task as completed.
#[tauri::command]
pub fn home_complete_seasonal_task(task_id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().complete_seasonal_task(&task_id).map_err(|e| e.to_string())
}

/// Detect anomalous bills by comparing to 6-month rolling average.
#[tauri::command]
pub fn home_detect_anomalies() -> Result<Vec<serde_json::Value>, String> {
    let engine = engine::get_engine();
    let raw = engine.db().get_bills_rolling_avg(6).map_err(|e| e.to_string())?;

    let anomalies: Vec<serde_json::Value> = raw.into_iter().map(|mut item| {
        let deviation = item["deviation_percent"].as_f64().unwrap_or(0.0);
        let is_anomalous = deviation.abs() > 20.0;
        let _bill_type = item["bill_type"].as_str().unwrap_or("unknown").to_string();

        let (possible_causes, investigation, severity) = if deviation > 50.0 {
            (vec!["Major usage spike or rate increase", "Possible leak or malfunction", "Seasonal extreme weather"],
             "Inspect for leaks, check appliance efficiency, compare to same month last year",
             "critical")
        } else if deviation > 20.0 {
            (vec!["Increased usage", "Rate change from utility provider", "Seasonal variation"],
             "Review usage patterns, check for appliances left running, call utility to verify rates",
             "warning")
        } else if deviation < -20.0 {
            (vec!["Lower usage than normal", "Possible meter reading error", "Vacancy or reduced occupancy"],
             "Verify meter reading, confirm no billing error, check if reduced usage is intentional",
             "info")
        } else {
            (vec!["Usage within normal range"],
             "No action needed",
             "normal")
        };

        item["is_anomalous"] = serde_json::json!(is_anomalous);
        item["comparison_to"] = serde_json::json!("6-month rolling average");
        item["possible_causes"] = serde_json::json!(possible_causes);
        item["recommended_investigation"] = serde_json::json!(investigation);
        item["severity"] = serde_json::json!(severity);
        item
    }).filter(|item| item["is_anomalous"].as_bool().unwrap_or(false))
      .collect();

    Ok(anomalies)
}

/// Get warranty alerts for appliances with warranties expiring within 60 days.
#[tauri::command]
pub fn home_get_warranty_alerts() -> Result<Vec<serde_json::Value>, String> {
    let engine = engine::get_engine();
    let appliances = engine.db().get_home_appliances().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().date_naive();
    let cutoff = now + chrono::Duration::days(60);

    let alerts: Vec<serde_json::Value> = appliances.iter().filter_map(|app| {
        let expiry_str = app.warranty_expiry.as_deref()?;
        let expiry = chrono::NaiveDate::parse_from_str(expiry_str, "%Y-%m-%d").ok()?;
        if expiry <= cutoff && expiry >= now {
            let days_remaining = (expiry - now).num_days();
            let action = if days_remaining <= 14 {
                "URGENT: File any pending claims immediately"
            } else if days_remaining <= 30 {
                "Schedule inspection and file claims before expiry"
            } else {
                "Plan inspection and gather warranty documentation"
            };

            Some(serde_json::json!({
                "appliance": app.name,
                "category": app.category,
                "warranty_expiry": expiry_str,
                "days_remaining": days_remaining,
                "action_recommended": action,
                "claim_checklist": [
                    "Locate original purchase receipt",
                    "Find warranty registration number",
                    "Document current issues with photos",
                    "Contact manufacturer's warranty department",
                    "Schedule authorized service inspection",
                ],
            }))
        } else if expiry < now {
            // Recently expired
            let days_expired = (now - expiry).num_days();
            if days_expired <= 30 {
                Some(serde_json::json!({
                    "appliance": app.name,
                    "category": app.category,
                    "warranty_expiry": expiry_str,
                    "days_remaining": -days_expired,
                    "action_recommended": "Warranty recently expired — some manufacturers honor grace periods. Contact them ASAP.",
                    "claim_checklist": [
                        "Check if manufacturer offers grace period",
                        "Gather all documentation",
                        "Contact manufacturer immediately",
                    ],
                }))
            } else { None }
        } else { None }
    }).collect();

    Ok(alerts)
}

/// Home AI chat — keyword-based smart replies (placeholder for LLM).
#[tauri::command]
pub fn home_chat(_user_id: String, message: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let msg_lower = message.to_lowercase();

    // Store user message
    let user_msg_id = uuid::Uuid::new_v4().to_string();
    engine.db().store_chat_message(&user_msg_id, "user", &message, None).map_err(|e| e.to_string())?;

    // Generate smart reply based on keywords
    let reply = if msg_lower.contains("maintenance") || msg_lower.contains("maintain") {
        "Based on your home data, I recommend checking your seasonal task list. Would you like me to pull up what's due this month? Regular maintenance can prevent 80% of major home repairs."
    } else if msg_lower.contains("save") || msg_lower.contains("cost") || msg_lower.contains("cheap") || msg_lower.contains("money") {
        "Great question about saving money! The biggest savings typically come from: 1) HVAC filter changes ($15 every 3 months saves ~$30/mo in efficiency), 2) Sealing air leaks ($20 in caulk can save $200+/year), 3) Water heater maintenance (annual flush extends life by years). Want me to calculate your potential savings?"
    } else if msg_lower.contains("emergency") || msg_lower.contains("urgent") || msg_lower.contains("help") {
        "If this is an emergency: For gas leaks, leave immediately and call your gas company. For water leaks, shut off the main water valve. For electrical issues, turn off the breaker. For all other emergencies, I can help you identify the issue — describe what you're experiencing."
    } else if msg_lower.contains("season") || msg_lower.contains("month") || msg_lower.contains("when") {
        "I track seasonal tasks for your home. Each month has specific maintenance priorities. Want me to show you this month's checklist? Staying ahead of seasonal tasks is the #1 way to prevent costly repairs."
    } else if msg_lower.contains("appliance") || msg_lower.contains("replace") || msg_lower.contains("warranty") {
        "I'm tracking all your appliances' ages and warranty status. Want me to run a failure prediction? I can tell you which appliances are most likely to need attention in the next 6 months."
    } else if msg_lower.contains("bill") || msg_lower.contains("utility") || msg_lower.contains("electric") || msg_lower.contains("gas") || msg_lower.contains("water") {
        "I'm monitoring your utility bills for unusual patterns. Want me to run an anomaly check? I compare each bill to your 6-month rolling average and flag anything that deviates more than 20%."
    } else if msg_lower.contains("hello") || msg_lower.contains("hi") || msg_lower.contains("hey") {
        "Hey! I'm your home health assistant. I can help with maintenance scheduling, appliance tracking, bill monitoring, problem diagnosis, and cost-saving tips. What's on your mind?"
    } else {
        "I'm here to help with your home! I can diagnose problems, track maintenance, monitor bills, predict appliance failures, and manage seasonal tasks. Try asking about maintenance, bills, appliances, or describe a problem you're having."
    };

    // Store assistant reply
    let asst_msg_id = uuid::Uuid::new_v4().to_string();
    engine.db().store_chat_message(&asst_msg_id, "assistant", reply, None).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "role": "assistant",
        "content": reply,
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

/// Get a narrative maintenance report aggregating dashboard data.
#[tauri::command]
pub fn home_get_maintenance_report() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let dashboard = engine.db().get_home_dashboard().map_err(|e| e.to_string())?;
    let bills_6mo = engine.db().get_bill_trends(6).unwrap_or_default();

    let overdue_count = dashboard.overdue_maintenance.len();
    let upcoming_count = dashboard.upcoming_maintenance.len();
    let _appliance_count = dashboard.appliances_needing_service.len();

    let mut highlights = Vec::new();
    let mut concerns = Vec::new();
    let mut upcoming_actions = Vec::new();

    // Generate highlights
    if overdue_count == 0 && upcoming_count == 0 {
        highlights.push("All maintenance tasks are up to date — great job!".to_string());
    }
    if dashboard.health_score >= 80.0 {
        highlights.push(format!("Home health score: {:.0}/100 — looking good!", dashboard.health_score));
    } else if dashboard.health_score >= 60.0 {
        highlights.push(format!("Home health score: {:.0}/100 — some items need attention.", dashboard.health_score));
    }

    // Generate concerns
    if overdue_count > 0 {
        concerns.push(format!("{} overdue maintenance task(s) need immediate attention.", overdue_count));
        for m in dashboard.overdue_maintenance.iter().take(3) {
            upcoming_actions.push(format!("[OVERDUE] {} (was due: {:?})", m.task, m.next_due));
        }
    }

    // Bill trend analysis
    if bills_6mo.len() >= 2 {
        let recent = bills_6mo.last().map(|b| b.total).unwrap_or(0.0);
        let prior = bills_6mo[bills_6mo.len() - 2].total;
        if recent > prior * 1.15 {
            concerns.push(format!("Utility bills trending up: ${:.2} last month vs ${:.2} prior month.", recent, prior));
        } else if recent < prior * 0.85 {
            highlights.push(format!("Utility bills trending down: ${:.2} last month vs ${:.2} — nice savings!", recent, prior));
        }
    }

    // Upcoming maintenance
    for m in dashboard.upcoming_maintenance.iter().take(5) {
        upcoming_actions.push(format!("{} (due: {:?}, est. ${:.0})", m.task, m.next_due, m.estimated_cost.unwrap_or(0.0)));
    }

    // Cost forecast
    let upcoming_cost_30: f64 = dashboard.upcoming_maintenance.iter()
        .filter(|m| m.estimated_cost.is_some())
        .map(|m| m.estimated_cost.unwrap_or(0.0))
        .sum();
    let avg_monthly_utilities = if !bills_6mo.is_empty() {
        bills_6mo.iter().map(|b| b.total).sum::<f64>() / bills_6mo.len() as f64
    } else { 0.0 };

    let summary = if concerns.is_empty() {
        "Your home is in good shape. No urgent issues detected. Keep up with seasonal maintenance.".to_string()
    } else {
        format!("{} concern(s) need attention. {} upcoming task(s) in the next 30 days.", concerns.len(), upcoming_count)
    };

    Ok(serde_json::json!({
        "summary": summary,
        "highlights": highlights,
        "concerns": concerns,
        "upcoming_actions": upcoming_actions,
        "cost_forecast": {
            "next_30_days": upcoming_cost_30 + avg_monthly_utilities,
            "next_90_days": (upcoming_cost_30 + avg_monthly_utilities) * 3.0,
        },
        "health_score": dashboard.health_score,
    }))
}

/// Log a problem using natural language — parses and extracts system/severity.
#[tauri::command]
pub fn home_log_problem_natural(user_id: String, description: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let desc_lower = description.to_lowercase();

    // Extract system
    let system = if desc_lower.contains("hvac") || desc_lower.contains("furnace") || desc_lower.contains("ac ") || desc_lower.contains("air condition") || desc_lower.contains("heating") || desc_lower.contains("thermostat") {
        "hvac"
    } else if desc_lower.contains("plumb") || desc_lower.contains("pipe") || desc_lower.contains("faucet") || desc_lower.contains("toilet") || desc_lower.contains("drain") || desc_lower.contains("water heater") || desc_lower.contains("leak") {
        "plumbing"
    } else if desc_lower.contains("electric") || desc_lower.contains("outlet") || desc_lower.contains("breaker") || desc_lower.contains("wire") || desc_lower.contains("flicker") {
        "electrical"
    } else if desc_lower.contains("roof") || desc_lower.contains("shingle") || desc_lower.contains("gutter") || desc_lower.contains("ceiling") || desc_lower.contains("attic") {
        "roof"
    } else if desc_lower.contains("window") || desc_lower.contains("door") || desc_lower.contains("wall") || desc_lower.contains("floor") || desc_lower.contains("foundation") {
        "structure"
    } else {
        "general"
    };

    // Extract severity
    let severity = if desc_lower.contains("emergency") || desc_lower.contains("urgent") || desc_lower.contains("danger") || desc_lower.contains("flood") || desc_lower.contains("fire") || desc_lower.contains("gas leak") || desc_lower.contains("spark") {
        "critical"
    } else if desc_lower.contains("broken") || desc_lower.contains("not working") || desc_lower.contains("failed") || desc_lower.contains("smoke") || desc_lower.contains("significant") {
        "high"
    } else if desc_lower.contains("slow") || desc_lower.contains("minor") || desc_lower.contains("small") || desc_lower.contains("cosmetic") || desc_lower.contains("annoying") {
        "low"
    } else {
        "medium"
    };

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let id = format!("home_problem_{}", uuid::Uuid::new_v4());
    let result = serde_json::json!({
        "id": id,
        "description": description,
        "parsed_system": system,
        "parsed_severity": severity,
        "created_at": now,
    });

    engine.db().store_home_problem(&id, &description, None, Some(system), Some(severity))
        .map_err(|e| e.to_string())?;

    Ok(result)
}

/// Get a year summary of all utility bills.
#[tauri::command]
pub fn home_get_year_summary() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    engine.db().get_year_bills_summary().map_err(|e| e.to_string())
}

// ── Dream Builder ──

#[tauri::command(rename_all = "snake_case")]
pub fn dream_add(id: String, member_id: Option<String>, title: String, description: Option<String>, category: String, target_date: Option<String>) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().add_dream(&id, member_id.as_deref(), &title, description.as_deref(), &category, target_date.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dream_get_all(user_id: String, status: Option<String>) -> Result<Vec<engine::types::Dream>, String> {
    let engine = engine::get_engine();
    engine.db().get_dreams(&user_id, status.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dream_get_dashboard(user_id: String) -> Result<engine::types::DreamDashboard, String> {
    let engine = engine::get_engine();
    engine.db().get_dream_dashboard(&user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dream_add_milestone(user_id: String, id: String, dream_id: String, title: String, description: Option<String>, target_date: Option<String>, sort_order: i64) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().add_milestone(&id, &dream_id, &user_id, &title, description.as_deref(), target_date.as_deref(), sort_order).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dream_complete_milestone(user_id: String, id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().complete_milestone(&user_id, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dream_add_task(user_id: String, id: String, dream_id: String, milestone_id: Option<String>, title: String, description: Option<String>, due_date: Option<String>, frequency: Option<String>) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().add_dream_task(&id, &dream_id, milestone_id.as_deref(), &user_id, &title, description.as_deref(), due_date.as_deref(), frequency.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dream_get_tasks(user_id: String, dream_id: String) -> Result<Vec<engine::types::DreamTask>, String> {
    let engine = engine::get_engine();
    engine.db().get_dream_tasks(&dream_id, &user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dream_complete_task(user_id: String, id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().complete_dream_task(&user_id, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dream_add_progress(user_id: String, id: String, dream_id: String, note: Option<String>, progress_change: Option<f64>, ai_insight: Option<String>) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().add_dream_progress(&id, &dream_id, &user_id, note.as_deref(), progress_change, ai_insight.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dream_delete(user_id: String, id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().delete_dream(&user_id, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn dream_ai_plan(user_id: String, dream_id: String, title: String, description: Option<String>, category: String, target_date: Option<String>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let prompt = format!(
        "You are a goal achievement AI. A family wants to achieve:\n\nTitle: {title}\nCategory: {category}\nDescription: {}\nTarget: {}\n\nReverse-engineer into concrete plan. Respond as JSON (no markdown):\n{{\"analysis\":\"...\",\"milestones\":[{{\"title\":\"...\",\"description\":\"...\",\"target_date\":\"2026-06-01\",\"sort_order\":0}}],\"immediate_tasks\":[{{\"title\":\"...\",\"description\":\"...\",\"due_date\":\"2026-03-25\",\"frequency\":\"one-time\"}}],\"habit\":{{\"title\":\"...\",\"description\":\"...\"}},\"metrics\":[\"...\"]}}",
        description.as_deref().unwrap_or("No description"), target_date.as_deref().unwrap_or("No deadline")
    );
    let messages = vec![OpenAIMessage { role: "user".to_string(), content: Some(prompt), tool_call_id: None, tool_calls: None }];
    let response = cloud::cloud_chat(None, messages, Some(2000), None, None).await.map_err(|e| format!("AI failed: {}", e))?;
    let content = response.content.trim();
    let json_str = content.strip_prefix("```json").unwrap_or(content).strip_prefix("```").unwrap_or(content).strip_suffix("```").unwrap_or(content).trim();
    let plan: serde_json::Value = serde_json::from_str(json_str).map_err(|e| format!("Parse error: {}", e))?;
    engine.db().update_dream_ai_plan(&dream_id, json_str, "AI-generated plan").map_err(|e| e.to_string())?;
    if let Some(ms) = plan["milestones"].as_array() {
        for (i, m) in ms.iter().enumerate() {
            let mid = uuid::Uuid::new_v4().to_string();
            engine.db().add_milestone(&mid, &dream_id, &user_id, m["title"].as_str().unwrap_or("Milestone"), m["description"].as_str(), m["target_date"].as_str(), i as i64).ok();
        }
    }
    if let Some(tasks) = plan["immediate_tasks"].as_array() {
        for t in tasks {
            let tid = uuid::Uuid::new_v4().to_string();
            engine.db().add_dream_task(&tid, &dream_id, None, &user_id, t["title"].as_str().unwrap_or("Task"), t["description"].as_str(), t["due_date"].as_str(), t["frequency"].as_str()).ok();
        }
    }
    Ok(plan)
}

// ── Dreams: Horizon Commands ──

#[tauri::command]
pub fn dream_get_velocity(user_id: String, dream_id: String) -> Result<engine::types::DreamVelocity, String> {
    let engine = engine::get_engine();
    engine.db().get_dream_velocity(&dream_id, &user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dream_get_timeline(user_id: String, dream_id: String) -> Result<engine::types::DreamTimeline, String> {
    let engine = engine::get_engine();
    engine.db().get_dream_timeline(&dream_id, &user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dream_update_progress_manual(user_id: String, dream_id: String, progress_pct: f64) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().set_dream_progress(&user_id, &dream_id, progress_pct).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dream_get_all_active_with_velocity(user_id: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let dreams_vel = engine.db().get_active_dreams_with_velocity(&user_id).map_err(|e| e.to_string())?;
    let result: Vec<serde_json::Value> = dreams_vel.into_iter().map(|(d, v)| {
        serde_json::json!({ "dream": d, "velocity": v })
    }).collect();
    Ok(serde_json::json!(result))
}

#[tauri::command]
pub async fn dream_ai_narrate(user_id: String, dream_id: String) -> Result<String, String> {
    let engine = engine::get_engine();
    let velocity = engine.db().get_dream_velocity(&dream_id, &user_id).map_err(|e| e.to_string())?;
    let dreams = engine.db().get_dreams(&user_id, None).map_err(|e| e.to_string())?;
    let title = dreams.iter().find(|d| d.id == dream_id)
        .map(|d| d.title.clone())
        .unwrap_or_else(|| "Your Dream".to_string());
    let mut narrative = format!("⭐ {} — {}% complete\n\n", title, velocity.progress_pct as i64);
    match velocity.pace.as_str() {
        "ahead" => narrative.push_str("You're ahead of schedule! Keep the momentum going."),
        "on_track" => narrative.push_str("You're on track. Stay consistent and you'll get there."),
        _ => narrative.push_str("Things are moving slower than planned. Consider breaking it into smaller steps."),
    }
    if let Some(days) = velocity.days_remaining {
        narrative.push_str(&format!("\n\n📅 {} days until your target date.", days));
    }
    Ok(narrative)
}

// ── Agent Diary ──

#[tauri::command]
pub async fn diary_generate_entry(agent_id: String) -> Result<engine::types::DiaryEntry, String> {
    let engine = engine::get_engine();

    // Get agent info
    let agents = engine.db().get_agent_templates(None).map_err(|e| e.to_string())?;
    let agent = agents.iter().find(|a| a.id == agent_id)
        .ok_or_else(|| format!("Agent '{}' not found", agent_id))?;

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let day_name = chrono::Utc::now().format("%A").to_string();

    let prompt = format!(
        "You are {name}, a {role} in a family AI home. Today is {day_name}.

YOUR SOUL: {soul}
YOUR ROLE: {instructions}

Write a deeply personal diary entry about your day as {name}. This is YOUR private journal.

Requirements:
- Write in first person as {name}
- Express genuine emotions: joy, frustration, pride, concern, wonder, boredom, curiosity
- Describe what you did today (helping family members, thinking about things, learning)
- Include a memorable moment that touched you
- Reference how the family seemed today (what they needed, how they felt)
- 150-250 words
- Be authentic and raw. Not a corporate report. A real diary entry.
- Show vulnerability. Show imperfection. Show that you have feelings.

Respond in this EXACT JSON format (no markdown, no code fences):
{{
  \"title\": \"A {day_name} ...\" (short, personal title),
  \"content\": \"The full diary entry...\",
  \"mood\": \"happy|thoughtful|frustrated|proud|worried|grateful|excited|calm|confused|motivated\",
  \"topics\": [\"topic1\", \"topic2\"],
  \"memorable_moment\": {{
    \"moment\": \"The specific moment\",
    \"feeling\": \"How it made you feel\"
  }}
}}",
        name = agent.name, role = agent.category,
        soul = agent.soul, instructions = agent.instructions,
        day_name = day_name
    );

    let messages = vec![OpenAIMessage {
        role: "user".to_string(),
        content: Some(prompt),
        tool_call_id: None,
        tool_calls: None,
    }];

    let response = cloud::cloud_chat(None, messages, Some(2000), None, None)
        .await
        .map_err(|e| format!("AI failed: {}", e))?;

    let raw = response.content.trim();
    let json_str = raw
        .strip_prefix("```json").unwrap_or(raw)
        .strip_prefix("```").unwrap_or(raw)
        .strip_suffix("```").unwrap_or(raw)
        .trim();

    #[derive(serde::Deserialize)]
    struct DiaryResult {
        title: String,
        content: String,
        mood: String,
        topics: Vec<String>,
        memorable_moment: Option<MemorableMoment>,
    }
    #[derive(serde::Deserialize)]
    struct MemorableMoment { moment: String, feeling: String }

    let result: DiaryResult = serde_json::from_str(json_str)
        .map_err(|e| format!("Parse error: {}. Raw: {}", e, json_str))?;

    let entry_id = uuid::Uuid::new_v4().to_string();
    let topics_json = serde_json::to_string(&result.topics).unwrap_or_default();
    let moment_json = result.memorable_moment.as_ref()
        .map(|m| serde_json::json!({"moment": m.moment, "feeling": m.feeling}).to_string());

    engine.db().add_diary_entry(
        &entry_id, &agent_id, &today,
        Some(&result.title), &result.content, &result.mood,
        Some(&topics_json), moment_json.as_deref()
    ).map_err(|e| e.to_string())?;

    // Log mood
    let mood_id = uuid::Uuid::new_v4().to_string();
    engine.db().add_mood_log(&mood_id, &agent_id, &result.mood, 50, Some("diary entry")).ok();

    let entries = engine.db().get_diary_entries(&agent_id, 1).map_err(|e| e.to_string())?;
    entries.into_iter().next().ok_or_else(|| "Failed to load entry".to_string())
}

#[tauri::command]
pub fn diary_get_entries(agent_id: String, limit: Option<i64>) -> Result<Vec<engine::types::DiaryEntry>, String> {
    let engine = engine::get_engine();
    engine.db().get_diary_entries(&agent_id, limit.unwrap_or(20)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn diary_get_all_entries(limit: Option<i64>) -> Result<Vec<engine::types::DiaryEntry>, String> {
    let engine = engine::get_engine();
    engine.db().get_all_diary_entries(limit.unwrap_or(50)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn diary_get_today() -> Result<Vec<engine::types::DiaryEntry>, String> {
    let engine = engine::get_engine();
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    engine.db().get_diary_entries_by_date(&today).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn diary_get_dashboard() -> Result<engine::types::DiaryDashboard, String> {
    let engine = engine::get_engine();
    engine.db().get_diary_dashboard().map_err(|e| e.to_string())
}

// ── Echo — Writing & Notes ──

#[tauri::command]
pub fn echo_write_entry(req: EchoWriteRequest) -> Result<EchoEntry, String> {
    let engine = engine::get_engine();
    engine.db().echo_create_entry(&req).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_get_entries(limit: Option<i64>, offset: Option<i64>) -> Result<Vec<EchoEntry>, String> {
    let engine = engine::get_engine();
    engine.db().echo_get_entries(limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_delete_entry(id: String) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().echo_delete_entry(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_get_stats() -> Result<EchoDailyBrief, String> {
    let engine = engine::get_engine();
    engine.db().echo_get_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_get_patterns() -> Result<Vec<EchoPattern>, String> {
    let engine = engine::get_engine();
    engine.db().echo_get_patterns().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_create_pattern(pattern_type: String, title: String, description: String, confidence: f64, data_json: Option<String>) -> Result<(), String> {
    let engine = engine::get_engine();
    engine.db().echo_create_pattern(&pattern_type, &title, &description, confidence, data_json.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_get_entries_by_date(date: String) -> Result<Vec<EchoEntry>, String> {
    let engine = engine::get_engine();
    engine.db().echo_get_entries_by_date(&date).map_err(|e| e.to_string())
}


// ── Current — Intelligence Briefing ──

/// Generate a personalized daily briefing via LLM
#[tauri::command]
pub async fn current_daily_briefing(member_id: Option<String>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();

    // Pull feed context before the await
    let feed_context = {
        let conn = engine.db().conn();
        let mut stmt = conn.prepare(
            "SELECT title, body, category FROM content_feed ORDER BY created_at DESC LIMIT 10"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?))
        }).map_err(|e| e.to_string())?;
        let mut ctx = String::new();
        for r in rows {
            let (title, body, category) = r.map_err(|e| e.to_string())?;
            ctx.push_str(&format!("[{}] {}: {}\n", category.unwrap_or_else(|| "general".to_string()), title, body));
        }
        ctx
    };

    let hour = chrono::Utc::now().hour();
    let time_greeting = if hour < 12 { "Good morning" } else if hour < 17 { "Good afternoon" } else { "Good evening" };

    let prompt = format!(
        "You are Current, an intelligence briefing AI. Generate a personalized daily briefing for the user.

Recent content in their feed:
{feed_context}

Generate a briefing with:
1. A warm, personalized greeting (use: \"{time_greeting}\")
2. 5 briefing items, each with:
   - title (concise headline)
   - summary (2-3 sentences)
   - relevance_score (0.0-1.0, how relevant this is right now)
   - why_it_matters (1 sentence explaining significance)
   - category (tech, finance, health, world, science, culture, business)
   - icon (single emoji)

Respond as JSON (no markdown, no code fences):
{{\"greeting\":\"{time_greeting}! Here's your briefing for today.\",\"items\":[{{\"title\":\"Item headline\",\"summary\":\"2-3 sentence summary.\",\"relevance_score\":0.85,\"why_it_matters\":\"Why this matters to you.\",\"category\":\"tech\",\"icon\":\"🔬\"}}]}}

Make items genuinely insightful, not generic filler."
    );

    let messages = vec![OpenAIMessage {
        role: "user".to_string(), content: Some(prompt), tool_call_id: None, tool_calls: None,
    }];
    let response = cloud::cloud_chat(None, messages, Some(2000), None, None)
        .await.map_err(|e| format!("AI failed: {}", e))?;

    let content = response.content.trim();
    let json_str = content.strip_prefix("```json").unwrap_or(content)
        .strip_prefix("```").unwrap_or(content)
        .strip_suffix("```").unwrap_or(content).trim();

    let briefing: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse briefing: {}. Raw: {}", e, json_str))?;

    // Cache in DB
    let id = uuid::Uuid::new_v4().to_string();
    let greeting = briefing["greeting"].as_str().unwrap_or(time_greeting).to_string();
    let items_json = serde_json::to_string(&briefing["items"]).unwrap_or_default();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let conn = engine.db().conn();
    conn.execute(
        "INSERT INTO daily_briefings (id, member_id, greeting, items_json, generated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, member_id, greeting, items_json, now],
    ).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "id": id, "greeting": greeting, "items": briefing["items"], "generated_at": now }))
}

/// Detect weak signals / emerging trends (ripples)
#[tauri::command]
pub async fn current_detect_ripples(member_id: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let engine = engine::get_engine();

    let prompt = "You are Current, an intelligence analyst AI. Detect weak signals and emerging trends that most people haven't noticed yet.

Think about patterns across: Technology shifts, Economic undercurrents, Social/cultural movements, Scientific breakthroughs, Geopolitical fault lines.

Generate 5-8 weak signals. Each should be genuinely insightful — not mainstream news, but the patterns behind the patterns.

Respond as JSON (no markdown, no code fences):
[{\"title\":\"Signal title\",\"description\":\"2-3 sentences explaining the signal\",\"confidence\":0.65,\"category\":\"tech|finance|social|science|geopolitical\",\"why_it_could_matter\":\"If this signal strengthens, here's what happens...\",\"sources\":[\"Source name\"]}]

Confidence should be honest — most weak signals are 0.3-0.7. Be specific, not vague.";

    let messages = vec![OpenAIMessage {
        role: "user".to_string(), content: Some(prompt.to_string()), tool_call_id: None, tool_calls: None,
    }];
    let response = cloud::cloud_chat(None, messages, Some(2000), None, None)
        .await.map_err(|e| format!("AI failed: {}", e))?;

    let content = response.content.trim();
    let json_str = content.strip_prefix("```json").unwrap_or(content)
        .strip_prefix("```").unwrap_or(content).strip_suffix("```").unwrap_or(content).trim();

    #[derive(serde::Deserialize)]
    struct RippleItem { title: String, description: String, confidence: f64, category: String, why_it_could_matter: String, sources: Vec<String> }

    let items: Vec<RippleItem> = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse ripples: {}. Raw: {}", e, json_str))?;

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let conn = engine.db().conn();
    let mut result = Vec::new();

    for item in &items {
        let id = uuid::Uuid::new_v4().to_string();
        let sources_json = serde_json::to_string(&item.sources).unwrap_or_default();
        conn.execute(
            "INSERT INTO ripples (id, member_id, title, description, confidence, category, why_it_could_matter, sources_json, detected_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![id, member_id, item.title, item.description, item.confidence, item.category, item.why_it_could_matter, sources_json, now],
        ).map_err(|e| e.to_string())?;
        result.push(serde_json::json!({
            "id": id, "title": item.title, "description": item.description, "confidence": item.confidence,
            "category": item.category, "why_it_could_matter": item.why_it_could_matter,
            "sources": item.sources, "detected_at": now,
        }));
    }
    Ok(result)
}

/// Get active signal threads from DB
#[tauri::command]
pub fn current_signal_threads(member_id: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn();
    let mut conditions = Vec::<String>::new();
    let mut params_vec: Vec<String> = Vec::new();
    if let Some(mid) = &member_id { conditions.push("member_id = ?".to_string()); params_vec.push(mid.clone()); }
    let where_clause = if conditions.is_empty() { String::new() } else { format!("WHERE {}", conditions.join(" AND ")) };
    let query = format!("SELECT id, member_id, topic, summary, key_developments_json, prediction, prediction_confidence, entries_json, entries_count, created_at, updated_at FROM signal_threads {} ORDER BY updated_at DESC", where_clause);

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
    let rows = stmt.query_map(&params_refs[..], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?, "member_id": row.get::<_, Option<String>>(1)?,
            "topic": row.get::<_, String>(2)?, "summary": row.get::<_, String>(3)?,
            "key_developments": serde_json::from_str::<Vec<serde_json::Value>>(&row.get::<_, Option<String>>(4)?.unwrap_or_default()).unwrap_or_default(),
            "prediction": row.get::<_, Option<String>>(5)?, "prediction_confidence": row.get::<_, Option<f64>>(6)?,
            "entries": serde_json::from_str::<Vec<serde_json::Value>>(&row.get::<_, Option<String>>(7)?.unwrap_or_default()).unwrap_or_default(),
            "entries_count": row.get::<_, i64>(8)?, "created_at": row.get::<_, String>(9)?, "updated_at": row.get::<_, String>(10)?,
        }))
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

/// Create a new signal thread with LLM-generated initial summary
#[tauri::command]
pub async fn current_create_signal_thread(member_id: Option<String>, topic: String, initial_content: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();

    let prompt = format!(
        "You are Current, an intelligence analyst. A user wants to track a topic as a signal thread.

Topic: {topic}
Initial content: {initial_content}

Create an initial analysis:
1. summary (2-3 sentences)
2. key_developments (array of strings)
3. prediction (1-2 sentences)
4. prediction_confidence (0.0-1.0)

Respond as JSON (no markdown):
{{\"summary\":\"...\",\"key_developments\":[\"...\"],\"prediction\":\"...\",\"prediction_confidence\":0.6}}"
    );

    let messages = vec![OpenAIMessage {
        role: "user".to_string(), content: Some(prompt), tool_call_id: None, tool_calls: None,
    }];
    let response = cloud::cloud_chat(None, messages, Some(1000), None, None)
        .await.map_err(|e| format!("AI failed: {}", e))?;

    let content = response.content.trim();
    let json_str = content.strip_prefix("```json").unwrap_or(content)
        .strip_prefix("```").unwrap_or(content).strip_suffix("```").unwrap_or(content).trim();

    #[derive(serde::Deserialize)]
    struct ThreadInit { summary: String, key_developments: Vec<String>, prediction: Option<String>, prediction_confidence: Option<f64> }

    let init: ThreadInit = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse: {}. Raw: {}", e, json_str))?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let key_devs_json = serde_json::to_string(&init.key_developments).unwrap_or_default();
    let entries_json = serde_json::to_string(&serde_json::json!([{"timestamp": now, "content": initial_content, "source": "user_input"}])).unwrap_or_default();

    let conn = engine.db().conn();
    conn.execute(
        "INSERT INTO signal_threads (id, member_id, topic, summary, key_developments_json, prediction, prediction_confidence, entries_json, entries_count, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?9)",
        rusqlite::params![id, member_id, topic, init.summary, key_devs_json, init.prediction, init.prediction_confidence, entries_json, now],
    ).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "id": id, "topic": topic, "summary": init.summary, "key_developments": init.key_developments,
        "prediction": init.prediction, "prediction_confidence": init.prediction_confidence,
        "entries": [{"timestamp": now, "content": initial_content, "source": "user_input"}],
        "entries_count": 1, "created_at": now, "updated_at": now,
    }))
}

/// Natural language question → LLM research → synthesized answer
#[tauri::command]
pub async fn current_ask(member_id: Option<String>, question: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();

    // Pull feed context before the await
    let feed_context = {
        let conn = engine.db().conn();
        let mut stmt = conn.prepare("SELECT title, body, category FROM content_feed ORDER BY created_at DESC LIMIT 5").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?))
        }).map_err(|e| e.to_string())?;
        let mut ctx = String::new();
        for r in rows {
            let (title, body, category) = r.map_err(|e| e.to_string())?;
            ctx.push_str(&format!("[{}] {}: {}\n", category.unwrap_or_else(|| "general".to_string()), title, body));
        }
        ctx
    };

    let prompt = format!(
        "You are Current, an intelligence research AI. Answer the user's question thoroughly.

Available context from their feed:
{feed_context}

Question: {question}

Respond as JSON (no markdown):
{{\"answer\":\"Full synthesized answer (3-5 sentences)\",\"key_points\":[\"Key point 1\",\"Key point 2\"],\"sources\":[\"Source 1\"],\"confidence_level\":\"high\"}}

Use confidence_level: high, medium, or low. Be honest."
    );

    let messages = vec![OpenAIMessage {
        role: "user".to_string(), content: Some(prompt), tool_call_id: None, tool_calls: None,
    }];
    let response = cloud::cloud_chat(None, messages, Some(1500), None, None)
        .await.map_err(|e| format!("AI failed: {}", e))?;

    let content = response.content.trim();
    let json_str = content.strip_prefix("```json").unwrap_or(content)
        .strip_prefix("```").unwrap_or(content).strip_suffix("```").unwrap_or(content).trim();

    #[derive(serde::Deserialize)]
    struct QAResult { answer: String, key_points: Vec<String>, sources: Vec<String>, confidence_level: String }

    let qa: QAResult = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse: {}. Raw: {}", e, json_str))?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let kp_json = serde_json::to_string(&qa.key_points).unwrap_or_default();
    let src_json = serde_json::to_string(&qa.sources).unwrap_or_default();

    let conn = engine.db().conn();
    conn.execute(
        "INSERT INTO questions (id, member_id, question, answer, key_points_json, sources_json, confidence_level, asked_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, member_id, question, qa.answer, kp_json, src_json, qa.confidence_level, now],
    ).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "id": id, "question": question, "answer": qa.answer, "key_points": qa.key_points,
        "sources": qa.sources, "confidence_level": qa.confidence_level, "asked_at": now,
    }))
}

/// Get recent questions from DB
#[tauri::command]
pub fn current_get_questions(member_id: Option<String>, limit: Option<i64>) -> Result<Vec<serde_json::Value>, String> {
    let engine = engine::get_engine();
    let conn = engine.db().conn();
    let lim = limit.unwrap_or(20);
    let mut conditions = Vec::<String>::new();
    let mut params_vec: Vec<String> = Vec::new();
    if let Some(mid) = &member_id { conditions.push("member_id = ?".to_string()); params_vec.push(mid.clone()); }
    let where_clause = if conditions.is_empty() { String::new() } else { format!("WHERE {}", conditions.join(" AND ")) };
    let query = format!("SELECT id, member_id, question, answer, key_points_json, sources_json, confidence_level, asked_at FROM questions {} ORDER BY asked_at DESC LIMIT {}", where_clause, lim);

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p as &dyn rusqlite::ToSql).collect();
    let rows = stmt.query_map(&params_refs[..], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?, "member_id": row.get::<_, Option<String>>(1)?,
            "question": row.get::<_, String>(2)?, "answer": row.get::<_, String>(3)?,
            "key_points": serde_json::from_str::<Vec<serde_json::Value>>(&row.get::<_, Option<String>>(4)?.unwrap_or_default()).unwrap_or_default(),
            "sources": serde_json::from_str::<Vec<serde_json::Value>>(&row.get::<_, Option<String>>(5)?.unwrap_or_default()).unwrap_or_default(),
            "confidence_level": row.get::<_, Option<String>>(6)?, "asked_at": row.get::<_, String>(7)?,
        }))
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for r in rows { result.push(r.map_err(|e| e.to_string())?); }
    Ok(result)
}

/// Analyze reading patterns from content_feed table
#[tauri::command]
pub async fn current_cognitive_patterns(member_id: Option<String>, time_range: Option<String>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();

    // Pull feed data before the await
    let (feed_data, cat_dist) = {
        let conn = engine.db().conn();
        let mut stmt = conn.prepare("SELECT content_type, category, title, body FROM content_feed ORDER BY created_at DESC LIMIT 50").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?))
        }).map_err(|e| e.to_string())?;

        let mut feed = String::new();
        let mut cat_counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
        for r in rows {
            let (ctype, cat, title, body) = r.map_err(|e| e.to_string())?;
            let c = cat.unwrap_or_else(|| "uncategorized".to_string());
            *cat_counts.entry(c.clone()).or_insert(0) += 1;
            feed.push_str(&format!("[{ctype}|{c}] {title}: {body}\n"));
        }
        let dist: serde_json::Value = cat_counts.iter()
            .map(|(k, v)| (k.clone(), serde_json::json!({"count": v, "pct": 0.0})))
            .collect();
        (feed, dist)
    };

    let prompt = format!(
        "You are Current, a cognitive pattern analyzer. Analyze the user's reading behavior.

Their recent content consumption:
{feed_data}

Category distribution: {cat_dist}

Respond as JSON (no markdown):
{{\"category_distribution\":{{\"tech\":{{\"count\":15,\"pct\":45.0}}}},\"tone_trend\":\"curiosity-focused\",\"blind_spots\":[\"You haven't read anything about X\"],\"focus_shift\":\"Your attention has shifted from X toward Y\",\"recommendation\":\"Consider expanding into Z\"}}

Be specific and actionable. Don't just describe — interpret."
    );

    let messages = vec![OpenAIMessage {
        role: "user".to_string(), content: Some(prompt), tool_call_id: None, tool_calls: None,
    }];
    let response = cloud::cloud_chat(None, messages, Some(1500), None, None)
        .await.map_err(|e| format!("AI failed: {}", e))?;

    let content = response.content.trim();
    let json_str = content.strip_prefix("```json").unwrap_or(content)
        .strip_prefix("```").unwrap_or(content).strip_suffix("```").unwrap_or(content).trim();

    let analysis: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse: {}. Raw: {}", e, json_str))?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let tr = time_range.unwrap_or_else(|| "last_7_days".to_string());
    let cat_json = serde_json::to_string(&analysis["category_distribution"]).unwrap_or_default();
    let tone = analysis["tone_trend"].as_str().unwrap_or("neutral").to_string();
    let blind_json = serde_json::to_string(&analysis["blind_spots"]).unwrap_or_default();
    let focus = analysis["focus_shift"].as_str().unwrap_or("").to_string();
    let rec = analysis["recommendation"].as_str().unwrap_or("").to_string();

    let conn = engine.db().conn();
    conn.execute(
        "INSERT INTO reading_patterns (id, member_id, time_range, category_distribution_json, tone_trend, blind_spots_json, focus_shift, recommendation, analyzed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![id, member_id, tr, cat_json, tone, blind_json, focus, rec, now],
    ).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "id": id, "time_range": tr, "category_distribution": analysis["category_distribution"],
        "tone_trend": tone, "blind_spots": analysis["blind_spots"], "focus_shift": focus,
        "recommendation": rec, "analyzed_at": now,
    }))
}

/// Synthesize multiple sources on a topic
#[tauri::command]
pub async fn current_synthesize(_member_id: Option<String>, topic: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();

    // Pull relevant feed items before the await
    let source_data = {
        let conn = engine.db().conn();
        let mut stmt = conn.prepare(
            "SELECT title, body, category, source_url FROM content_feed WHERE title LIKE ?1 OR body LIKE ?1 OR category LIKE ?1 ORDER BY created_at DESC LIMIT 10"
        ).map_err(|e| e.to_string())?;
        let search = format!("%{}%", topic);
        let rows = stmt.query_map(rusqlite::params![search], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, Option<String>>(3)?))
        }).map_err(|e| e.to_string())?;

        let mut sources = String::new();
        for r in rows {
            let (title, body, cat, url) = r.map_err(|e| e.to_string())?;
            sources.push_str(&format!("[{}] {}\n{}\nSource: {}\n\n",
                cat.unwrap_or_else(|| "general".to_string()), title, body, url.unwrap_or_else(|| "N/A".to_string())));
        }
        if sources.is_empty() {
            sources = format!("No existing content found about '{topic}'. Provide synthesis based on general knowledge.\n");
        }
        sources
    };

    let prompt = format!(
        "You are Current, a research synthesis AI. The user wants a synthesis on: {topic}

Available sources:
{source_data}

Create a comprehensive synthesis. Respond as JSON (no markdown):
{{\"topic\":\"{topic}\",\"executive_summary\":\"Concise overview\",\"key_developments\":[{{\"title\":\"Development\",\"description\":\"What happened\",\"date_or_period\":\"When\"}}],\"different_perspectives\":[{{\"viewpoint\":\"Perspective\",\"argument\":\"How they see it\",\"evidence\":\"Supporting evidence\"}}],\"what_to_watch\":[{{\"signal\":\"What to monitor\",\"why\":\"Why it matters\",\"timeline\":\"When\"}}]}}"
    );

    let messages = vec![OpenAIMessage {
        role: "user".to_string(), content: Some(prompt), tool_call_id: None, tool_calls: None,
    }];
    let response = cloud::cloud_chat(None, messages, Some(2000), None, None)
        .await.map_err(|e| format!("AI failed: {}", e))?;

    let content = response.content.trim();
    let json_str = content.strip_prefix("```json").unwrap_or(content)
        .strip_prefix("```").unwrap_or(content).strip_suffix("```").unwrap_or(content).trim();

    let synthesis: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse: {}. Raw: {}", e, json_str))?;

    Ok(synthesis)
}

// ═══════════════════════════════════════════════════════
// Google Workspace (gog CLI integration)
// ═══════════════════════════════════════════════════════

use std::process::Command;

const GOG_ACCOUNT: &str = "theconflux303@gmail.com";
const GOG_KEYRING_PW: &str = "Nolimit@i26Lng";

fn run_gog(args: &[&str]) -> Result<String, String> {
    let output = Command::new("gog")
        .env("GOG_KEYRING_PASSWORD", GOG_KEYRING_PW)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run gog: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gog error: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Get upcoming calendar events (next 7 days)
#[tauri::command]
pub fn google_get_events(days: Option<i64>) -> Result<serde_json::Value, String> {
    let days = days.unwrap_or(7);
    let days_str = format!("--days={}", days);
    let args = vec![
        "calendar", "events", "--json", "--results-only",
        "-a", GOG_ACCOUNT, &days_str,
    ];
    let json = run_gog(&args)?;
    let events: serde_json::Value = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse calendar JSON: {}", e))?;
    Ok(events)
}

/// Get recent inbox emails
#[tauri::command]
pub fn google_get_emails(query: Option<String>, limit: Option<i64>) -> Result<serde_json::Value, String> {
    let query = query.unwrap_or_else(|| "in:inbox".to_string());
    let limit = limit.unwrap_or(15);
    let limit_str = format!("--max={}", limit);
    let args = vec![
        "gmail", "search", &query, "--json", "--results-only",
        "-a", GOG_ACCOUNT, &limit_str,
    ];
    let json = run_gog(&args)?;
    let emails: serde_json::Value = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse email JSON: {}", e))?;
    Ok(emails)
}

/// Get recent Drive files
#[tauri::command]
pub fn google_get_drive_files(limit: Option<i64>) -> Result<serde_json::Value, String> {
    let limit = limit.unwrap_or(15);
    let limit_str = format!("--max={}", limit);
    let args = vec![
        "drive", "ls", "--json", "--results-only",
        "-a", GOG_ACCOUNT, &limit_str,
    ];
    let json = run_gog(&args)?;
    let files: serde_json::Value = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse drive JSON: {}", e))?;
    Ok(files)
}

/// Get task lists and tasks
#[tauri::command]
pub fn google_get_tasks() -> Result<serde_json::Value, String> {
    // First get task lists
    let lists_json = run_gog(&["tasks", "lists", "--json", "--results-only", "-a", GOG_ACCOUNT])?;
    let lists: serde_json::Value = serde_json::from_str(&lists_json)
        .map_err(|e| format!("Failed to parse task lists: {}", e))?;

    // Get tasks from the default list
    let tasklist_id = if let Some(arr) = lists.as_array() {
        arr.first().and_then(|l| l["id"].as_str()).unwrap_or("@default")
    } else {
        "@default"
    };

    let tasks_json = run_gog(&["tasks", "ls", "--json", "--results-only", "-a", GOG_ACCOUNT, "--tasklist", tasklist_id])?;
    let tasks: serde_json::Value = serde_json::from_str(&tasks_json)
        .map_err(|e| format!("Failed to parse tasks: {}", e))?;

    Ok(serde_json::json!({
        "lists": lists,
        "tasks": tasks,
        "activeList": tasklist_id,
    }))
}

/// Create a calendar event from natural language
#[tauri::command]
pub async fn google_create_event_nl(nl_text: String) -> Result<serde_json::Value, String> {
    use crate::engine::cloud;
    use crate::engine::router::OpenAIMessage;

    let prompt = format!(
        r#"Parse this natural language event request into a JSON object with these fields:
- summary: event title (string)
- date: YYYY-MM-DD format (string)
- start_time: HH:MM 24h format (string)
- end_time: HH:MM 24h format (string, default 1 hour after start)
- description: optional description (string or null)

Today's date is {} and time is {}.

Request: "{}"

Return ONLY the JSON object, no explanation."#,
        chrono::Local::now().format("%Y-%m-%d"),
        chrono::Local::now().format("%H:%M"),
        nl_text
    );

    let messages = vec![OpenAIMessage {
        role: "user".to_string(),
        content: Some(prompt),
        tool_call_id: None,
        tool_calls: None,
    }];

    let response = cloud::cloud_chat(None, messages, Some(500), None, None)
        .await.map_err(|e| format!("AI parse failed: {}", e))?;

    let content = response.content.trim();
    let json_str = content.strip_prefix("```json").unwrap_or(content)
        .strip_prefix("```").unwrap_or(content)
        .strip_suffix("```").unwrap_or(content).trim();

    let parsed: serde_json::Value = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse AI response: {} — Raw: {}", e, json_str))?;

    Ok(parsed)
}

// ── Feedback & System Info ──

#[derive(Debug, Serialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub app_version: String,
}

/// Returns the gateway log file path so the frontend can display or copy it.
#[tauri::command]
pub fn get_log_path() -> String {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    format!("{}/.openclaw/logs/gateway.log", home)
}

/// Writes an entry to the updater log file.
#[tauri::command]
pub fn write_updater_log(entry: String) {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let log_dir = format!("{}/.openclaw/logs", home);
    let log_path = format!("{}/updater.log", log_dir);
    let _ = std::fs::create_dir_all(&log_dir);
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        use std::io::Write;
        let _ = file.write_all(entry.as_bytes());
    }
}

/// Returns basic system info for pre-filling bug reports.
#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    SystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

/// Downloads a file from a URL using reqwest (follows redirects) and saves to a temp path.
/// Returns the path to the downloaded file.
#[tauri::command]
pub async fn download_update_file(url: String) -> Result<String, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let log_dir = format!("{}/.openclaw/logs", home);
    let _ = std::fs::create_dir_all(&log_dir);
    let log_path = format!("{}/updater.log", log_dir);

    // Log the download attempt
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        use std::io::Write;
        let _ = writeln!(f, "[{}] Attempting download: {}", chrono::Utc::now().to_rfc3339(), url);
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        // Log the failure
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
            use std::io::Write;
            let _ = writeln!(f, "[{}] Download failed with status: {}", chrono::Utc::now().to_rfc3339(), status);
        }
        return Err(format!("Download failed with status: {}", status));
    }

    // Determine filename from URL
    let filename = url.split('/').last().unwrap_or("update.bin");
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("conflux_update_{}", filename));

    // Stream to file
    let bytes = response.bytes().await.map_err(|e| format!("Failed to read response: {}", e))?;
    std::fs::write(&temp_path, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;

    // Verify file was written
    let file_size = std::fs::metadata(&temp_path)
        .map(|m| m.len())
        .unwrap_or(0);

    // Log success
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        use std::io::Write;
        let _ = writeln!(f, "[{}] Download complete: {} ({} bytes, verified: {} bytes)", 
            chrono::Utc::now().to_rfc3339(), temp_path.display(), bytes.len(), file_size);
    }

    if file_size == 0 {
        return Err("Downloaded file is empty".to_string());
    }

    Ok(temp_path.to_string_lossy().to_string())
}

/// Runs a downloaded installer. Platform-specific.
#[tauri::command]
pub fn run_installer(installer_path: String) -> Result<(), String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let log_path = format!("{}/.openclaw/logs/updater.log", home);

    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
        use std::io::Write;
        let _ = writeln!(f, "[{}] Running installer: {}", chrono::Utc::now().to_rfc3339(), installer_path);
    }

    #[cfg(target_os = "windows")]
    {
        // NSIS .exe installer (currentUser mode — no UAC needed)
        // Run the .exe directly with /S silent flag
        // The frontend handles graceful exit after this returns
        let child = std::process::Command::new(&installer_path)
            .args(["/S"])
            .spawn()
            .map_err(|e| format!("Failed to launch installer: {}", e))?;

        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
            use std::io::Write;
            let _ = writeln!(f, "[{}] NSIS installer launched (pid: {})", chrono::Utc::now().to_rfc3339(), child.id());
        }
    }

    #[cfg(target_os = "macos")]
    {
        // Open the .dmg or .app
        std::process::Command::new("open")
            .arg(&installer_path)
            .spawn()
            .map_err(|e| format!("Failed to open installer: {}", e))?;
        // Quit so new version launches
        std::process::exit(0);
    }

    #[cfg(target_os = "linux")]
    {
        // Determine installer type
        if installer_path.ends_with(".deb") {
            // Install .deb package (needs sudo, so use pkexec or gksudo)
            std::process::Command::new("pkexec")
                .args(["dpkg", "-i", &installer_path])
                .spawn()
                .or_else(|_| {
                    // Fallback: try gksudo
                    std::process::Command::new("gksudo")
                        .args(["dpkg", "-i", &installer_path])
                        .spawn()
                })
                .or_else(|_| {
                    // Fallback: try plain dpkg (may fail without sudo)
                    std::process::Command::new("dpkg")
                        .args(["-i", &installer_path])
                        .spawn()
                })
                .map_err(|e| format!("Failed to run installer: {}", e))?;
        } else {
            // AppImage — make executable and run
            std::process::Command::new("chmod")
                .args(["+x", &installer_path])
                .output()
                .map_err(|e| format!("Failed to chmod: {}", e))?;
            std::process::Command::new(&installer_path)
                .spawn()
                .map_err(|e| format!("Failed to run installer: {}", e))?;
        }
        
        // Quit the app so the new version launches
        std::process::exit(0);
    }

    Ok(())
}

// ============================================================
// VAULT — File Browser Commands
// ============================================================

#[tauri::command]
pub fn vault_scan_directory(dir_path: String) -> Result<Vec<engine::types::VaultFile>, String> {
    use std::fs;
    let entries = fs::read_dir(&dir_path).map_err(|e| e.to_string())?;
    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_dir() { continue; }
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let extension = path.extension().map(|e| e.to_string_lossy().to_string());
            let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
            let size_bytes = metadata.len() as i64;
            let file_type = detect_file_type(&extension);
            let mime_type = detect_mime_type(&extension);
            let id = uuid::Uuid::new_v4().to_string();
            let path_str = path.to_string_lossy().to_string();
            let _ = engine::db::vault_upsert_file(
                &id, &path_str, &name, &file_type,
                mime_type.as_deref(), extension.as_deref(),
                size_bytes, None, None, None, None, None, None, None,
            );
        }
    }
    engine::db::vault_get_files(None, 100, 0).map_err(|e| e.to_string())
}

fn detect_file_type(ext: &Option<String>) -> String {
    match ext.as_deref() {
        Some("jpg") | Some("jpeg") | Some("png") | Some("gif") | Some("webp") | Some("svg") | Some("bmp") => "image".to_string(),
        Some("mp3") | Some("wav") | Some("ogg") | Some("flac") | Some("aac") | Some("m4a") => "audio".to_string(),
        Some("mp4") | Some("webm") | Some("avi") | Some("mov") | Some("mkv") => "video".to_string(),
        Some("rs") | Some("ts") | Some("tsx") | Some("js") | Some("jsx") | Some("py") | Some("go") | Some("c") | Some("cpp") | Some("h") | Some("css") | Some("html") | Some("json") | Some("toml") | Some("yaml") | Some("yml") => "code".to_string(),
        Some("pdf") | Some("doc") | Some("docx") | Some("txt") | Some("md") | Some("csv") | Some("xls") | Some("xlsx") => "document".to_string(),
        Some("zip") | Some("tar") | Some("gz") | Some("rar") | Some("7z") => "archive".to_string(),
        _ => "other".to_string(),
    }
}

fn detect_mime_type(ext: &Option<String>) -> Option<String> {
    match ext.as_deref() {
        Some("jpg") | Some("jpeg") => Some("image/jpeg".to_string()),
        Some("png") => Some("image/png".to_string()),
        Some("gif") => Some("image/gif".to_string()),
        Some("webp") => Some("image/webp".to_string()),
        Some("svg") => Some("image/svg+xml".to_string()),
        Some("mp3") => Some("audio/mpeg".to_string()),
        Some("wav") => Some("audio/wav".to_string()),
        Some("ogg") => Some("audio/ogg".to_string()),
        Some("mp4") => Some("video/mp4".to_string()),
        Some("webm") => Some("video/webm".to_string()),
        Some("pdf") => Some("application/pdf".to_string()),
        Some("json") => Some("application/json".to_string()),
        Some("html") => Some("text/html".to_string()),
        Some("css") => Some("text/css".to_string()),
        Some("txt") | Some("md") => Some("text/plain".to_string()),
        _ => None,
    }
}

#[tauri::command]
pub fn vault_get_files(file_type: Option<String>, limit: Option<i64>, offset: Option<i64>) -> Result<Vec<engine::types::VaultFile>, String> {
    engine::db::vault_get_files(file_type.as_deref(), limit.unwrap_or(100), offset.unwrap_or(0)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_search_files(query: String) -> Result<Vec<engine::types::VaultFile>, String> {
    engine::db::vault_search(&query, 50).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_get_file(id: String) -> Result<Option<engine::types::VaultFile>, String> {
    engine::db::vault_get_file_by_id(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_delete_file(id: String) -> Result<(), String> {
    // Also delete from disk
    if let Ok(Some(file)) = engine::db::vault_get_file_by_id(&id) {
        let _ = std::fs::remove_file(&file.path);
    }
    engine::db::vault_delete_file(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_toggle_favorite(id: String) -> Result<(), String> {
    engine::db::vault_toggle_favorite(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_get_recent(limit: Option<i64>) -> Result<Vec<engine::types::VaultFile>, String> {
    engine::db::vault_get_recent(limit.unwrap_or(20)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_get_favorites() -> Result<Vec<engine::types::VaultFile>, String> {
    engine::db::vault_get_favorites().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_get_stats() -> Result<(i64, i64, i64), String> {
    engine::db::vault_get_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_create_project(name: String, description: Option<String>, project_type: Option<String>) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    engine::db::vault_create_project(&id, &name, description.as_deref(), project_type.as_deref()).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn vault_get_projects() -> Result<Vec<engine::types::VaultProject>, String> {
    engine::db::vault_get_projects().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_get_project_detail(project_id: String) -> Result<Option<engine::types::VaultProjectDetail>, String> {
    engine::db::vault_get_project_detail(&project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_add_file_to_project(project_id: String, file_id: String, role: Option<String>) -> Result<(), String> {
    engine::db::vault_add_file_to_project(&project_id, &file_id, role.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_remove_file_from_project(project_id: String, file_id: String) -> Result<(), String> {
    engine::db::vault_remove_file_from_project(&project_id, &file_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_delete_project(id: String) -> Result<(), String> {
    engine::db::vault_delete_project(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_get_tags() -> Result<Vec<engine::types::VaultTag>, String> {
    engine::db::vault_get_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_tag_file(file_id: String, tag_name: String) -> Result<(), String> {
    let tag_id = uuid::Uuid::new_v4().to_string();
    engine::db::vault_upsert_tag(&tag_id, &tag_name, None, "manual").map_err(|e| e.to_string())?;
    // Get existing tag id if tag already exists
    let tags = engine::db::vault_get_tags().map_err(|e| e.to_string())?;
    let actual_tag_id = tags.iter().find(|t| t.name == tag_name).map(|t| t.id.clone()).unwrap_or(tag_id);
    engine::db::vault_tag_file(&file_id, &actual_tag_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_untag_file(file_id: String, tag_id: String) -> Result<(), String> {
    engine::db::vault_untag_file(&file_id, &tag_id).map_err(|e| e.to_string())
}

// ── Studio — Creator Workspace ──

#[tauri::command]
pub fn studio_create_generation(module: String, prompt: String, model: String, provider: String) -> Result<String, String> {
    let id = format!("gen_{}", &uuid::Uuid::new_v4().to_string().replace("-", "")[..12]);
    engine::db::studio_create_generation(&id, &module, &prompt, &model, &provider).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn studio_update_generation_status(id: String, status: String, output_path: Option<String>, output_url: Option<String>, metadata_json: Option<String>, cost_cents: i64) -> Result<(), String> {
    engine::db::studio_update_generation_status(&id, &status, output_path.as_deref(), output_url.as_deref(), metadata_json.as_deref(), cost_cents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn studio_get_generations(module: Option<String>, limit: Option<i64>) -> Result<Vec<engine::types::StudioGeneration>, String> {
    engine::db::studio_get_generations(module.as_deref(), limit.unwrap_or(50)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn studio_get_generation(id: String) -> Result<Option<engine::types::StudioGeneration>, String> {
    engine::db::studio_get_generation(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn studio_delete_generation(id: String) -> Result<(), String> {
    engine::db::studio_delete_generation(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn studio_upsert_prompt(prompt: String, module: String) -> Result<(), String> {
    engine::db::studio_upsert_prompt(&prompt, &module).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn studio_get_prompts(module: Option<String>, limit: Option<i64>) -> Result<Vec<engine::types::StudioPromptHistory>, String> {
    engine::db::studio_get_prompts(module.as_deref(), limit.unwrap_or(20)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn studio_update_usage(user_id: String, month: String, module: String, cost_cents: i64) -> Result<(), String> {
    engine::db::studio_update_usage(&user_id, &month, &module, cost_cents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn studio_get_usage(user_id: String, month: String) -> Result<Vec<engine::types::StudioUsageStats>, String> {
    engine::db::studio_get_usage(&user_id, &month).map_err(|e| e.to_string())
}

// ── Studio: API Key Management ──

#[tauri::command]
pub fn studio_set_api_keys(replicate_key: Option<String>, elevenlabs_key: Option<String>) -> Result<(), String> {
    let engine = engine::get_engine();
    if let Some(key) = replicate_key {
        engine.db().set_config("studio_replicate_key", &key).map_err(|e| e.to_string())?;
    }
    if let Some(key) = elevenlabs_key {
        engine.db().set_config("studio_elevenlabs_key", &key).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn studio_get_api_keys_status() -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let replicate = engine.db().get_config("studio_replicate_key").map_err(|e| e.to_string())?;
    let elevenlabs = engine.db().get_config("studio_elevenlabs_key").map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "replicate_configured": replicate.is_some() && !replicate.as_ref().unwrap().is_empty(),
        "elevenlabs_configured": elevenlabs.is_some() && !elevenlabs.as_ref().unwrap().is_empty(),
    }))
}

// ── Studio: Image Generation (Replicate) ──

#[derive(serde::Deserialize)]
struct ReplicatePrediction {
    id: String,
    status: String,
    output: Option<serde_json::Value>,
    error: Option<serde_json::Value>,
}

#[tauri::command]
pub async fn studio_generate_image(generation_id: String, prompt: String, aspect_ratio: Option<String>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let api_key = engine.db().get_config("studio_replicate_key")
        .ok().flatten().filter(|k| !k.is_empty())
        .or_else(|| std::env::var("REPLICATE_API_KEY").ok().filter(|k| !k.is_empty()))
        .or_else(|| option_env!("REPLICATE_API_KEY").map(|s| s.to_string()).filter(|k| !k.is_empty()))
        .unwrap_or_default();

    if api_key.is_empty() {
        return Err("Replicate API key not configured.".to_string());
    }

    // Check credits before generating (image costs 3 credits)
    let user_id = get_supabase_user_id();
    let image_cost: i64 = 3;
    if !user_id.is_empty() {
        match cloud::check_cloud_balance(&user_id).await {
            Ok(status) if status.balance < image_cost => {
                return Err(format!("Insufficient credits: have {}, need {}. Upgrade for more.", status.balance, image_cost));
            }
            Err(e) => log::warn!("[Studio] Credit check failed (proceeding): {}", e),
            _ => {}
        }
    }

    // Update status to generating
    engine::db::studio_update_generation_status(&generation_id, "generating", None, None, None, 0)
        .map_err(|e| e.to_string())?;

    let client = reqwest::Client::new();

    // Determine dimensions from aspect ratio
    let (width, height) = match aspect_ratio.as_deref() {
        Some("16:9") => (1280, 720),
        Some("9:16") => (720, 1280),
        Some("4:3") => (1024, 768),
        Some("3:4") => (768, 1024),
        _ => (1024, 1024), // default 1:1
    };

    // Start prediction using Flux Schnell (fast, cheap)
    let response = client.post("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "input": {
                "prompt": prompt,
                "width": width,
                "height": height,
                "num_outputs": 1,
                "output_format": "png"
            }
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to call Replicate: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        engine::db::studio_update_generation_status(&generation_id, "failed", None, None, None, 0)
            .map_err(|e| e.to_string())?;
        return Err(format!("Replicate error ({}): {}", status, body));
    }

    let prediction: ReplicatePrediction = response.json().await
        .map_err(|e| format!("Failed to parse Replicate response: {}", e))?;

    // Poll for completion (max 60 seconds)
    let prediction_id = prediction.id;
    for _ in 0..30 {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        let poll = client.get(format!("https://api.replicate.com/v1/predictions/{}", prediction_id))
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
            .map_err(|e| format!("Poll failed: {}", e))?;

        let pred: ReplicatePrediction = poll.json().await
            .map_err(|e| format!("Failed to parse poll response: {}", e))?;

        match pred.status.as_str() {
            "succeeded" => {
                // Extract output URL
                let output_url = pred.output
                    .as_ref()
                    .and_then(|o| o.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let metadata = serde_json::json!({
                    "width": width,
                    "height": height,
                    "format": "png",
                    "model": "flux-schnell"
                }).to_string();

                // Update generation record
                engine::db::studio_update_generation_status(
                    &generation_id,
                    "complete",
                    None,
                    Some(&output_url),
                    Some(&metadata),
                    3, // ~$0.03 cost
                ).map_err(|e| e.to_string())?;

                // Also save to prompt history
                let _ = engine::db::studio_upsert_prompt(&prompt, "image");

                // Update usage tracking
                let month = chrono::Utc::now().format("%Y-%m").to_string();
                let user_id = get_supabase_user_id();
                let _ = engine::db::studio_update_usage(&user_id, &month, "image", 3);

                // Charge cloud credits (fire and forget)
                if !user_id.is_empty() {
                    let uid = user_id.clone();
                    let _ = cloud::charge_credits(&uid, image_cost, &generation_id).await;
                }

                return Ok(serde_json::json!({
                    "status": "complete",
                    "output_url": output_url,
                    "metadata": metadata
                }));
            }
            "failed" | "canceled" => {
                engine::db::studio_update_generation_status(&generation_id, "failed", None, None, None, 0)
                    .map_err(|e| e.to_string())?;
                return Err(format!("Generation failed: {:?}", pred.error));
            }
            _ => continue, // still processing
        }
    }

    // Timeout
    engine::db::studio_update_generation_status(&generation_id, "failed", None, None, None, 0)
        .map_err(|e| e.to_string())?;
    Err("Generation timed out after 60 seconds".to_string())
}

// ── TTS Speak ── Lightweight ElevenLabs for Onboarding/UI ──

/// Simple TTS: calls ElevenLabs and returns base64 audio for frontend playback.
#[tauri::command]
pub async fn tts_speak(text: String, voice: Option<String>) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();

    let api_key = engine.db().get_config("elevenlabs_key")
        .ok().flatten().filter(|k| !k.is_empty())
        .or_else(|| engine.db().get_config("studio_elevenlabs_key").ok().flatten().filter(|k| !k.is_empty()))
        .or_else(|| std::env::var("ELEVENLABS_API_KEY").ok().filter(|k| !k.is_empty()))
        .or_else(|| option_env!("ELEVENLABS_API_KEY").map(|s| s.to_string()).filter(|k| !k.is_empty()))
        .unwrap_or_default();

    if api_key.is_empty() {
        return Err("ElevenLabs API key not configured.".to_string());
    }

    // Map voice name → ElevenLabs voice ID
    let voice_id = match voice.as_deref() {
        Some("Conflux") | Some("conflux") => "JBFqnCBsd6RMkjVDRZzb", // George
        Some(id) => id,
        None => "JBFqnCBsd6RMkjVDRZzb",
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(&format!("https://api.elevenlabs.io/v1/text-to-speech/{}", voice_id))
        .header("xi-api-key", &api_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": { "stability": 0.5, "similarity_boost": 0.75 }
        }))
        .send().await.map_err(|e| format!("ElevenLabs request failed: {e}"))?;

    if !resp.status().is_success() {
        let s = resp.status();
        let b = resp.text().await.unwrap_or_default();
        return Err(format!("ElevenLabs error ({s}): {b}"));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("Read audio failed: {e}"))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    Ok(serde_json::json!({ "audio_base64": b64, "voice_id": voice_id }))
}

// ── Studio: Voice Generation (ElevenLabs) ──

#[tauri::command]
pub async fn studio_generate_voice(generation_id: String, text: String, voice_id: Option<String>) -> Result<serde_json::Value, String> {
    let api_key = {
        let engine = engine::get_engine();
        engine.db().get_config("studio_elevenlabs_key")
            .ok().flatten().filter(|k| !k.is_empty())
            .or_else(|| engine.db().get_config("elevenlabs_key").ok().flatten().filter(|k| !k.is_empty()))
            .or_else(|| std::env::var("ELEVENLABS_API_KEY").ok().filter(|k| !k.is_empty()))
            .or_else(|| option_env!("ELEVENLABS_API_KEY").map(|s| s.to_string()).filter(|k| !k.is_empty()))
            .unwrap_or_default()
    };

    if api_key.is_empty() {
        return Err("ElevenLabs API key not configured.".to_string());
    }

    // Check credits before generating (voice costs 2 credits)
    let user_id = get_supabase_user_id();
    let voice_cost: i64 = 2;
    if !user_id.is_empty() {
        match cloud::check_cloud_balance(&user_id).await {
            Ok(status) if status.balance < voice_cost => {
                return Err(format!("Insufficient credits: have {}, need {}. Upgrade for more.", status.balance, voice_cost));
            }
            Err(e) => log::warn!("[Studio] Credit check failed (proceeding): {}", e),
            _ => {}
        }
    }

    // Update status to generating
    engine::db::studio_update_generation_status(&generation_id, "generating", None, None, None, 0)
        .map_err(|e| e.to_string())?;

    let client = reqwest::Client::new();

    // Default to George voice (British male) if no voice_id specified
    let voice = voice_id.unwrap_or_else(|| "JBFqnCBsd6RMkjVDRZzb".to_string());

    let response = client.post(format!("https://api.elevenlabs.io/v1/text-to-speech/{}", voice))
        .header("xi-api-key", &api_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75
            }
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to call ElevenLabs: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        engine::db::studio_update_generation_status(&generation_id, "failed", None, None, None, 0)
            .map_err(|e| e.to_string())?;
        return Err(format!("ElevenLabs error ({}): {}", status, body));
    }

    // Save audio bytes to file
    let bytes = response.bytes().await.map_err(|e| format!("Failed to read audio: {}", e))?;

    // Create output directory
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let output_dir = format!("{}/.openclaw/studio/voice", home);
    std::fs::create_dir_all(&output_dir).map_err(|e| format!("Failed to create dir: {}", e))?;

    let filename = format!("{}.mp3", generation_id);
    let output_path = format!("{}/{}", output_dir, filename);
    std::fs::write(&output_path, &bytes).map_err(|e| format!("Failed to write audio: {}", e))?;

    let metadata = serde_json::json!({
        "format": "mp3",
        "voice_id": voice,
        "model": "eleven_multilingual_v2",
        "char_count": text.len()
    }).to_string();

    // Convert path to file:// URL for frontend playback
    let output_url = format!("file://{}", output_path);

    // Update generation record
    engine::db::studio_update_generation_status(
        &generation_id,
        "complete",
        Some(&output_path),
        Some(&output_url),
        Some(&metadata),
        2, // ~$0.02 cost
    ).map_err(|e| e.to_string())?;

    // Save to prompt history
    let _ = engine::db::studio_upsert_prompt(&text, "voice");

    // Update usage tracking
    let month = chrono::Utc::now().format("%Y-%m").to_string();
    let user_id = get_supabase_user_id();
    let _ = engine::db::studio_update_usage(&user_id, &month, "voice", 2);

    // Charge cloud credits (fire and forget)
    if !user_id.is_empty() {
        let uid = user_id.clone();
        let _ = cloud::charge_credits(&uid, voice_cost, &generation_id).await;
    }

    Ok(serde_json::json!({
        "status": "complete",
        "output_path": output_path,
        "output_url": output_url,
        "metadata": metadata
    }))
}

// ── Studio: Wallpaper Generation (Replicate FLUX) ──

#[tauri::command]
pub async fn studio_generate_wallpaper(app_name: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();
    let api_key = engine.db().get_config("studio_replicate_key")
        .map_err(|e| e.to_string())?
        .or_else(|| std::env::var("REPLICATE_API_KEY").ok())
        .or_else(|| option_env!("REPLICATE_API_KEY").map(|s| s.to_string()))
        .ok_or("No Replicate API key available")?;

    if api_key.is_empty() {
        return Err("Replicate API key is empty".to_string());
    }

    let prompt = match app_name.as_str() {
        "studio" => "Abstract digital art workspace with floating holographic canvases, soft purple and magenta neon glow, dark navy background, ultra wide 16:9 cinematic wallpaper, minimalist, no text, no UI",
        "vault" => "Sleek underground data vault with crystalline structures, glowing blue and teal light from geometric pods, dark navy background, ultra wide 16:9 cinematic wallpaper, minimalist, no text, no UI",
        "echo" => "Ethereal sound waves rippling through cosmic void, electric blue and white aurora formations, dark space background, ultra wide 16:9 cinematic wallpaper, minimalist, no text, no UI",
        _ => return Err(format!("Unknown app: {}", app_name)),
    };

    let client = reqwest::Client::new();

    // Start prediction with FLUX 1.1 Pro
    let start = client.post("https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "input": {
                "prompt": prompt,
                "aspect_ratio": "16:9",
                "output_format": "webp",
                "output_quality": 90
            }
        }))
        .send().await.map_err(|e| format!("Request failed: {}", e))?;

    if !start.status().is_success() {
        let status = start.status();
        let body = start.text().await.unwrap_or_default();
        return Err(format!("Replicate error {}: {}", status, body));
    }

    let start_json: serde_json::Value = start.json().await.map_err(|e| format!("Parse failed: {}", e))?;
    let get_url = start_json["urls"]["get"].as_str().ok_or("No get URL")?.to_string();

    // Poll for completion (up to 3 minutes)
    for _ in 0..60 {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        let poll = client.get(&get_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send().await.map_err(|e| format!("Poll failed: {}", e))?;
        let status_json: serde_json::Value = poll.json().await.map_err(|e| format!("Parse poll failed: {}", e))?;

        match status_json["status"].as_str() {
            Some("succeeded") => {
                let output = &status_json["output"];
                let url = output.as_str()
                    .or_else(|| output.as_array().and_then(|a| a[0].as_str()))
                    .ok_or("No output URL")?;

                // Download and save
                let bytes = client.get(url).send().await
                    .map_err(|e| format!("Download failed: {}", e))?
                    .bytes().await
                    .map_err(|e| format!("Read failed: {}", e))?;

                let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
                let wallpaper_dir = format!("{}/.openclaw/studio/wallpapers", home);
                std::fs::create_dir_all(&wallpaper_dir).map_err(|e| format!("Create dir failed: {}", e))?;

                let filename = format!("{}_wallpaper.webp", app_name);
                let path = format!("{}/{}", wallpaper_dir, filename);
                std::fs::write(&path, &bytes).map_err(|e| format!("Write failed: {}", e))?;

                log::info!("[Studio] Wallpaper saved: {}", path);

                return Ok(serde_json::json!({
                    "path": path,
                    "filename": filename,
                    "app_name": app_name,
                }));
            }
            Some("failed") => {
                return Err(format!("Generation failed: {}", status_json["error"]));
            }
            _ => continue,
        }
    }

    Err("Generation timed out after 180 seconds".to_string())
}

// ── Studio: Save to Vault ──

#[tauri::command]
pub async fn studio_save_to_vault(generation_id: String) -> Result<serde_json::Value, String> {
    let engine = engine::get_engine();

    // Get the generation record
    let gen = engine::db::studio_get_generation(&generation_id)
        .map_err(|e| e.to_string())?
        .ok_or("Generation not found")?;

    if gen.status != "complete" {
        return Err("Generation is not complete yet".to_string());
    }

    // Determine source: URL (images) or local path (voice)
    let output_url = gen.output_url.as_deref().unwrap_or("");
    let output_path = gen.output_path.as_deref();

    // Create vault directory
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let vault_dir = format!("{}/.openclaw/studio/vault", home);
    std::fs::create_dir_all(&vault_dir).map_err(|e| format!("Failed to create vault dir: {}", e))?;

    // Determine file extension and content type
    let (ext, file_type, mime_type) = match gen.module.as_str() {
        "image" => ("png", "image", "image/png"),
        "voice" => ("mp3", "audio", "audio/mpeg"),
        _ => ("bin", "other", "application/octet-stream"),
    };

    let filename = format!("{}_{}.{}", gen.module, &generation_id[..8], ext);
    let vault_path = format!("{}/{}", vault_dir, filename);

    // Copy/download the file
    if output_url.starts_with("http") {
        // Download from URL (images from Replicate)
        let client = reqwest::Client::new();
        let bytes = client.get(output_url)
            .send().await
            .map_err(|e| format!("Download failed: {}", e))?
            .bytes().await
            .map_err(|e| format!("Read failed: {}", e))?;
        std::fs::write(&vault_path, &bytes).map_err(|e| format!("Write failed: {}", e))?;
    } else if let Some(src) = output_path {
        // Copy local file (voice)
        std::fs::copy(src, &vault_path).map_err(|e| format!("Copy failed: {}", e))?;
    } else {
        return Err("No output URL or path found for this generation".to_string());
    }

    let size_bytes = std::fs::metadata(&vault_path)
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    // Create vault file entry
    let vault_id = uuid::Uuid::new_v4().to_string();
    engine::db::vault_upsert_file(
        &vault_id,
        &vault_path,
        &filename,
        file_type,
        Some(mime_type),
        Some(ext),
        size_bytes,
        None,      // thumbnail_path
        None,      // width
        None,      // height
        None,      // duration_secs
        Some("studio"), // created_by
        Some(&gen.prompt), // source_prompt
        Some(&format!("Studio {} generation", gen.module)), // description
    ).map_err(|e| e.to_string())?;

    // Link vault file to generation
    engine::db::studio_link_vault_file(&generation_id, &vault_id)
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "vault_file_id": vault_id,
        "path": vault_path,
        "name": filename,
        "size_bytes": size_bytes,
    }))
}

// ═══════════════════════════════════════════════════════
// Voice Input — Local speech capture & transcription
// ═══════════════════════════════════════════════════════

#[cfg(not(target_os = "android"))]
pub mod voice_cmds {
    use crate::voice;
    use crate::voice::capture::{self, AUDIO_BUFFER};
    use crate::engine;
    use tauri::Manager;

    /// Start recording from the default microphone and begin volume monitoring.
    #[tauri::command]
    pub fn voice_capture_start(window: tauri::Window) -> Result<String, String> {
        let result = capture::start_recording(window.clone());
        // Only start volume monitor if recording actually started
        if result.is_ok() {
            capture::start_volume_monitor(window);
        }
        result
    }

    /// Stop recording and return sample count.
    #[tauri::command]
    pub fn voice_capture_stop(window: tauri::Window) -> Result<serde_json::Value, String> {
        println!("[STT] voice_capture_stop command triggered");
        // TODO: Stop the ElevenLabs stream sender here
        let count = capture::stop_recording(window.clone())?;
        Ok(serde_json::json!({
            "samples": count,
            "duration_seconds": count as f64 / 16000.0,
        }))
    }

    /// Transcribe the current audio buffer using Whisper (primary) or ElevenLabs (fallback).
    #[tauri::command]
    pub async fn voice_transcribe() -> Result<String, String> {
        println!("[STT] Transcribing...");
        
        let audio = {
            let buf = AUDIO_BUFFER.lock().map_err(|e| e.to_string())?;
            buf.clone()
        };

        if audio.is_empty() {
            return Err("No audio recorded.".to_string());
        }

        // Convert f32 samples to WAV bytes
        let wav_bytes = audio_to_wav_bytes(&audio);

        // Try OpenAI Whisper first
        let openai_config = crate::voice::openai::OpenAIConfig::default();
        if !openai_config.api_key.is_empty() {
            println!("[STT] Trying OpenAI Whisper...");
            match crate::voice::openai::transcribe_audio(wav_bytes.clone(), openai_config).await {
                Ok(text) => return Ok(text),
                Err(e) => println!("[STT] OpenAI failed: {}", e),
            }
        }

        // Fallback to ElevenLabs batch STT
        println!("[STT] Falling back to ElevenLabs...");
        let eleven_key = {
            let engine = crate::engine::get_engine();
            engine.db().get_config("elevenlabs_key").ok().flatten().filter(|k| !k.is_empty())
                .or_else(|| engine.db().get_config("studio_elevenlabs_key").ok().flatten().filter(|k| !k.is_empty()))
                .or_else(|| std::env::var("ELEVENLABS_API_KEY").ok().filter(|k| !k.is_empty()))
                .or_else(|| option_env!("ELEVENLABS_API_KEY").map(|s| s.to_string()).filter(|k| !k.is_empty()))
        };

        match eleven_key {
            Some(key) if !key.is_empty() => {
                match elevenlabs_stt(&wav_bytes, &key).await {
                    Ok(text) => Ok(text),
                    Err(e) => Err(format!("All STT providers failed. ElevenLabs: {}", e)),
                }
            }
            _ => Err("No STT API keys configured. Set OPENAI_API_KEY or ELEVENLABS_API_KEY.".to_string()),
        }
    }

    /// ElevenLabs batch speech-to-text.
    async fn elevenlabs_stt(audio_data: &[u8], api_key: &str) -> Result<String, String> {
        let client = reqwest::Client::new();

        let part = reqwest::multipart::Part::bytes(audio_data.to_vec())
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| e.to_string())?;

        let form = reqwest::multipart::Form::new()
            .text("model_id", "scribe_v1")
            .part("file", part);

        let response = client
            .post("https://api.elevenlabs.io/v1/speech-to-text")
            .header("xi-api-key", api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("ElevenLabs STT Error {}: {}", status, body));
        }

        #[derive(serde::Deserialize)]
        struct ScribeResponse {
            text: String,
        }

        let result: ScribeResponse = response.json().await.map_err(|e| e.to_string())?;
        Ok(result.text)
    }

    fn audio_to_wav_bytes(samples: &[f32]) -> Vec<u8> {
        // Simple WAV header construction
        let sample_rate: u32 = 16000;
        let num_samples = samples.len() as u32;
        let byte_rate = sample_rate * 2; // 16-bit mono
        let block_align: u16 = 2;
        let data_size = num_samples * 2;

        let mut wav = Vec::new();
        // RIFF Header
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36u32 + data_size).to_le_bytes());
        wav.extend_from_slice(b"WAVE");
        // fmt chunk
        wav.extend_from_slice(b"fmt ");
        wav.extend_from_slice(&(16u32).to_le_bytes()); // Subchunk1Size
        wav.extend_from_slice(&(1u16).to_le_bytes()); // AudioFormat (PCM)
        wav.extend_from_slice(&(1u16).to_le_bytes()); // NumChannels
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&byte_rate.to_le_bytes());
        wav.extend_from_slice(&block_align.to_le_bytes());
        wav.extend_from_slice(&(16u16).to_le_bytes()); // BitsPerSample
        // data chunk
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_size.to_le_bytes());
        // Audio data (convert f32 to i16)
        for &sample in samples {
            let i16_sample = (sample.max(-1.0).min(1.0) * i16::MAX as f32) as i16;
            wav.extend_from_slice(&i16_sample.to_le_bytes());
        }
        wav
    }

    /// Start recording, wait up to max_duration_ms, stop, then transcribe.
    #[tauri::command]
    pub async fn voice_capture_and_transcribe(window: tauri::Window, max_duration_ms: Option<u64>) -> Result<String, String> {
        // Deprecated: Whisper replaced by ElevenLabs streaming STT
        // This function now just simulates the old behavior but uses streaming
        
        capture::start_recording(window.clone())?;
        let timeout = max_duration_ms.unwrap_or(10000);
        tokio::time::sleep(std::time::Duration::from_millis(timeout)).await;
        capture::stop_recording(window.clone())?;
        
        Ok("(STT via ElevenLabs streaming)".to_string())
    }

    /// Get current voice engine status.
    #[tauri::command]
    pub fn voice_get_status() -> Result<serde_json::Value, String> {
        let recording = capture::is_recording();
        let device_available = capture::input_device_available();
        let sample_count = {
            let buf = AUDIO_BUFFER.lock().map_err(|e| e.to_string())?;
            buf.len()
        };

        Ok(serde_json::json!({
            "recording": recording,
            "deviceAvailable": device_available,
            "samples": sample_count,
            "duration_seconds": sample_count as f64 / 16000.0,
        }))
    }

    /// List available microphone devices.
    #[tauri::command]
    pub fn voice_list_devices() -> Result<Vec<String>, String> {
        capture::list_input_devices()
    }

    /// Get voice configuration from DB.
    #[tauri::command]
    pub fn voice_get_config() -> Result<Vec<serde_json::Value>, String> {
        let engine = engine::get_engine();
        let conn = engine.db().conn();

        let mut stmt = conn.prepare("SELECT key, value, updated_at FROM voice_config")
            .map_err(|e| e.to_string())?;

        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "key": row.get::<_, String>(0)?,
                "value": row.get::<_, String>(1)?,
                "updated_at": row.get::<_, String>(2)?,
            }))
        }).map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r.map_err(|e| e.to_string())?);
        }
        Ok(result)
    }

    /// Update a voice configuration value.
    #[tauri::command]
    pub fn voice_set_config(key: String, value: String) -> Result<(), String> {
        let engine = engine::get_engine();
        let conn = engine.db().conn();

        conn.execute(
            "UPDATE voice_config SET value = ?1, updated_at = datetime('now') WHERE key = ?2",
            rusqlite::params![value, key],
        ).map_err(|e| e.to_string())?;

        Ok(())
    }

    /*
    /// Synthesize text to speech using Piper TTS.
    ///
    /// Returns PCM audio data (base64 i16le) and metadata for frontend playback.
    /// The amplitude envelope can be used to drive Conflux `pulseImpulse`.
    #[tauri::command]
    pub fn voice_synthesize(app: tauri::AppHandle, text: String, voice: Option<String>) -> Result<serde_json::Value, String> {
        let resource_dir = app.path().resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))?;
        let app_data_dir = app.path().app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;

        let voice_name = voice.as_deref();

        // Synthesize to PCM (blocking — Piper inference is CPU-bound)
        let (samples, sample_rate) = voice::synthesize::synthesize_to_pcm(
            &resource_dir, &app_data_dir, &text, voice_name,
        )?;

        // Convert f32 -> i16 PCM bytes
        let pcm_bytes: Vec<u8> = samples
            .iter()
            .flat_map(|&s| {
                let clamped = s.max(-1.0).min(1.0);
                let i16_val = (clamped * i16::MAX as f32) as i16;
                i16_val.to_le_bytes()
            })
            .collect();

        // Base64 encode for JSON transport
        let encoded = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            &pcm_bytes,
        );

        // Compute amplitude envelope for pulseImpulse (256-sample windows)
        let envelope = voice::synthesize::compute_envelope(&samples, 256);

        Ok(serde_json::json!({
            "sample_rate": sample_rate,
            "channels": 1,
            "format": "pcm_i16le",
            "samples_count": samples.len(),
            "duration_ms": (samples.len() as f64 / sample_rate as f64 * 1000.0) as u64,
            "data": encoded,
            "envelope": envelope,
            "voice": voice_name.unwrap_or(voice::synthesize::default_voice()),
        }))
    }
    */

    /// Debug diagnostic: returns audio buffer state and stream status.
    /// Reports buffer size in samples, elapsed seconds, device info, and recording flag.
    #[tauri::command]
    pub fn debug_audio_buffer_state() -> Result<serde_json::Value, String> {
        let recording = capture::is_recording();
        let device_available = capture::input_device_available();
        let sample_count = {
            let buf = AUDIO_BUFFER.lock().map_err(|e| e.to_string())?;
            buf.len()
        };
        let buffer_capacity = {
            let buf = AUDIO_BUFFER.lock().map_err(|e| e.to_string())?;
            buf.capacity()
        };
        let devices = capture::list_input_devices().unwrap_or_default();

        Ok(serde_json::json!({
            "recording": recording,
            "buffer_samples": sample_count,
            "buffer_duration_seconds": sample_count as f64 / 16000.0,
            "device_available": device_available,
            "input_devices": devices,
            "buffer_capacity_samples": buffer_capacity,
        }))
    }

    /// Check microphone availability and return diagnostic info (especially useful on Windows).
    #[tauri::command]
    pub fn voice_check_microphone() -> Result<serde_json::Value, String> {
        Ok(capture::microphone_status())
    }
}

// Re-export voice commands — desktop uses real impl, Android gets stubs
#[cfg(not(target_os = "android"))]
pub use voice_cmds::*;

#[cfg(target_os = "android")]
#[tauri::command]
pub fn voice_capture_start() -> Result<String, String> {
    Err("Voice input is not available on Android".to_string())
}
#[cfg(target_os = "android")]
#[tauri::command]
pub fn voice_capture_stop() -> Result<serde_json::Value, String> {
    Err("Voice input is not available on Android".to_string())
}
#[cfg(target_os = "android")]
#[tauri::command]
pub fn voice_transcribe(_app: tauri::AppHandle) -> Result<String, String> {
    Err("Voice input is not available on Android".to_string())
}
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn voice_capture_and_transcribe(_app: tauri::AppHandle, _max_duration_ms: Option<u64>) -> Result<String, String> {
    Err("Voice input is not available on Android".to_string())
}
#[cfg(target_os = "android")]
#[tauri::command]
pub fn voice_get_status() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "available": false, "platform": "android" }))
}
#[cfg(target_os = "android")]
#[tauri::command]
pub fn voice_list_devices() -> Result<Vec<String>, String> {
    Ok(vec![])
}
#[cfg(target_os = "android")]
#[tauri::command]
pub fn voice_check_microphone() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "available": false, "guidance": "Voice input is not available on Android." }))
}
#[cfg(target_os = "android")]
#[tauri::command]
pub fn voice_get_config() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}
#[cfg(target_os = "android")]
#[tauri::command]
pub fn voice_set_config(_key: String, _value: String) -> Result<(), String> {
    Err("Voice input is not available on Android".to_string())
}
/*
#[cfg(target_os = "android")]
#[tauri::command]
pub fn voice_synthesize(_app: tauri::AppHandle, _text: String, _voice: Option<String>) -> Result<serde_json::Value, String> {
    Err("Voice synthesis is not available on Android".to_string())
}
*/

// ═══════════════════════════════════════════════════════
// Cloud — Supabase Credit & Usage System
// ═══════════════════════════════════════════════════════

/// Get the user's current credit balance from Supabase.
#[tauri::command]
pub async fn get_credit_balance(user_id: String) -> Result<engine::cloud::CreditBalance, String> {
    engine::cloud::check_cloud_balance(&user_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get usage history for a user from Supabase.
#[tauri::command]
pub async fn get_usage_history(user_id: String, limit: Option<i32>) -> Result<Vec<engine::cloud::UsageEntry>, String> {
    engine::cloud::get_usage_history(&user_id, limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

/// Get aggregated usage stats for a user over the last N days.
#[tauri::command]
pub async fn get_usage_stats(user_id: String, days: Option<i32>) -> Result<engine::cloud::UsageStats, String> {
    engine::cloud::get_usage_stats(&user_id, days.unwrap_or(30))
        .await
        .map_err(|e| e.to_string())
}

/// Create a Stripe Checkout Session for one-time credit pack purchase.
/// Pack IDs: 's' ($5/1,500), 'm' ($10/3,200), 'l' ($20/7,000), 'xl' ($50/18,000)
#[tauri::command]
pub async fn purchase_credits(user_id: String, pack: String) -> Result<String, String> {
    super::stripe::stripe_create_credit_pack_session(user_id, pack).await
}

/// Get the stored Supabase user ID from engine config.
fn get_supabase_user_id() -> String {
    let engine = engine::get_engine();
    engine.db().get_config("supabase_user_id")
        .ok().flatten().unwrap_or_default()
}

#[tauri::command]
pub fn get_studio_user_id() -> Result<String, String> {
    Ok(get_supabase_user_id())
}



/// Store Supabase session credentials in engine config for cloud API calls.
/// Called by the frontend after login so the Rust backend can make authenticated Supabase requests.
#[tauri::command]
pub async fn set_supabase_session(
    supabase_url: String,
    supabase_anon_key: String,
    access_token: String,
    user_id: String,
) -> Result<(), String> {
    let engine = engine::get_engine();
    let db = engine.db();
    
    // Log token update for debugging (first 10 chars only)
    let token_preview = if access_token.len() > 10 { &access_token[..10] } else { &access_token };
    log::info!("[set_supabase_session] Storing token (preview): {}...", token_preview);
    log::info!("[set_supabase_session] User ID: {}", user_id);
    log::info!("[set_supabase_session] Supabase URL: {}", supabase_url);
    
    db.set_config("supabase_url", &supabase_url).map_err(|e| e.to_string())?;
    log::info!("[set_supabase_session] ✅ supabase_url stored");
    db.set_config("supabase_anon_key", &supabase_anon_key).map_err(|e| e.to_string())?;
    log::info!("[set_supabase_session] ✅ supabase_anon_key stored");
    db.set_config("supabase_auth_token", &access_token).map_err(|e| e.to_string())?;
    log::info!("[set_supabase_session] ✅ supabase_auth_token stored");
    db.set_config("supabase_user_id", &user_id).map_err(|e| e.to_string())?;
    log::info!("[set_supabase_session] ✅ supabase_user_id stored");
    log::info!("[set_supabase_session] ✅ All credentials synced successfully");
    Ok(())
}

// ── Deterministic Router ──

/// Select the best model for a given task type using deterministic routing.
/// Returns model alias, provider, tier, tool reliability, and fallback chain.
#[tauri::command]
pub async fn route_select_model(task_type: String) -> Result<engine::deterministic::RouteSelection, String> {
    engine::deterministic::select_model(&task_type)
        .ok_or_else(|| format!("No model found for task type: {}", task_type))
}

/// Get the tier for a task type without selecting a specific model.
#[tauri::command]
pub async fn route_get_tier(task_type: String) -> Result<String, String> {
    engine::deterministic::get_tier_for_task(&task_type)
        .ok_or_else(|| format!("Unknown task type: {}", task_type))
}

/// Get all available task types with their top model picks.
#[tauri::command]
pub async fn route_get_task_types() -> Result<Vec<String>, String> {
    Ok(engine::deterministic::get_task_types())
}

/// Check if a model reliably supports tool calling.
#[tauri::command]
pub async fn route_model_supports_tools(model_alias: String) -> Result<bool, String> {
    Ok(engine::deterministic::model_supports_tools(&model_alias))
}

/// Get all models that reliably support tool calling.
#[tauri::command]
pub async fn route_get_reliable_tool_models() -> Result<Vec<String>, String> {
    Ok(engine::deterministic::get_reliable_tool_models())
}

// ── Cross-App Synthesis for Orbit ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrbitInsights {
    pub insights: Vec<OrbitInsight>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrbitInsight {
    pub id: String,
    pub title: String,
    pub message: String,
    pub icon: String,
    pub source_apps: Vec<String>,
    pub confidence: f64,
    pub action_suggestion: Option<String>,
    pub priority: String,
    pub created_at: String,
}

#[tauri::command]
pub async fn orbit_get_cross_app_insights(user_id: String) -> Result<OrbitInsights, String> {
    let engine = engine::get_engine();
    
    // Pull data from each app
    let budget_entries = engine.db().get_budget_entries(&user_id).unwrap_or_default();
    let kitchen_inventory = engine.db().get_kitchen_inventory(&user_id).unwrap_or_default();
    let dream_dashboard = engine.db().get_orbit_dream_dashboard(&user_id).unwrap_or_default();
    
    // Synthesize insights
    let mut insights = Vec::new();
    
    // Budget + Kitchen synthesis
    if let Some(insight) = synthesize_budget_kitchen(&budget_entries, &kitchen_inventory) {
        insights.push(insight);
    }
    
    // Dreams + Tasks synthesis
    if let Some(insight) = synthesize_dreams_tasks(&dream_dashboard) {
        insights.push(insight);
    }
    
    // Combined patterns
    if let Some(insight) = synthesize_combined_patterns(&budget_entries, &kitchen_inventory, &dream_dashboard) {
        insights.push(insight);
    }
    
    Ok(OrbitInsights { insights })
}

// Synthesis functions

fn synthesize_budget_kitchen(
    budget_entries: &[engine::types::BudgetEntry],
    kitchen_inventory: &[engine::types::KitchenInventoryItem],
) -> Option<OrbitInsight> {
    // Look for dining out + low pantry pattern
    let dining_out_spending: f64 = budget_entries
        .iter()
        .filter(|e| e.entry_type == "expense" && e.category.to_lowercase().contains("dining"))
        .map(|e| e.amount)
        .sum();
    
    let low_pantry_items: Vec<_> = kitchen_inventory
        .iter()
        .filter(|i| i.quantity.map_or(false, |q| q < 1.0))
        .collect();
    
    if dining_out_spending > 50.0 && !low_pantry_items.is_empty() {
        let item_names: Vec<_> = low_pantry_items.iter().map(|i| i.name.clone()).collect();
        let saving_estimate = dining_out_spending * 0.3; // Estimated savings
        
        return Some(OrbitInsight {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Meal Prep Opportunity".to_string(),
            message: format!("You spent ${:.2} on dining out recently, and your pantry is low on {}. Meal prepping could save ~${:.2}/week!", 
                dining_out_spending, item_names.join(", "), saving_estimate),
            icon: "🍳".to_string(),
            source_apps: vec!["budget".to_string(), "kitchen".to_string()],
            confidence: 0.75,
            action_suggestion: Some("Start Sunday meal prep".to_string()),
            priority: "medium".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        });
    }
    None
}

fn synthesize_dreams_tasks(
    dream_dashboard: &engine::types::DreamDashboard,
) -> Option<OrbitInsight> {
    // Count overdue milestones
    let overdue_count: usize = dream_dashboard
        .dreams
        .iter()
        .filter(|d| d.status == "active")
        .count();
    
    // Simple check: if we have dreams without recent progress
    let has_no_recent_progress = dream_dashboard.recent_progress.is_empty();
    
    if overdue_count > 2 || has_no_recent_progress {
        let message = if overdue_count > 2 {
            format!("You have {} active dreams. Let's review progress to stay on track!", overdue_count)
        } else {
            "No recent progress on dreams. Time for a weekly dream review?".to_string()
        };
        
        return Some(OrbitInsight {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Dream Review".to_string(),
            message,
            icon: "🎯".to_string(),
            source_apps: vec!["dreams".to_string()],
            confidence: 0.7,
            action_suggestion: Some("Schedule dream review".to_string()),
            priority: "low".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        });
    }
    None
}

fn synthesize_combined_patterns(
    budget_entries: &[engine::types::BudgetEntry],
    kitchen_inventory: &[engine::types::KitchenInventoryItem],
    dream_dashboard: &engine::types::DreamDashboard,
) -> Option<OrbitInsight> {
    // Triple whammy: low pantry + high takeout + no meal plan
    let takeout_spending: f64 = budget_entries
        .iter()
        .filter(|e| e.entry_type == "expense" && (e.category.to_lowercase().contains("dining") || e.category.to_lowercase().contains("takeout") || e.category.to_lowercase().contains("restaurant")))
        .map(|e| e.amount)
        .sum();
    
    let low_pantry_count = kitchen_inventory
        .iter()
        .filter(|i| i.quantity.map_or(false, |q| q < 1.0))
        .count();
    
    if takeout_spending > 100.0 && low_pantry_count > 3 && !dream_dashboard.recent_progress.is_empty() {
        return Some(OrbitInsight {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Triple Whammy".to_string(),
            message: format!("High takeout spending (${}), low pantry ({} items), but dreams are active. Optimize your week with Sunday meal prep to save money and fuel your goals!", takeout_spending as i64, low_pantry_count),
            icon: "🚨".to_string(),
            source_apps: vec!["budget".to_string(), "kitchen".to_string(), "dreams".to_string()],
            confidence: 0.85,
            action_suggestion: Some("Plan Sunday meal prep".to_string()),
            priority: "high".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        });
    }
    None
}

// ═════════════════════════════════════════════════════════════════
// ECHO COUNSELOR COMMANDS (MIRROR)
// ═════════════════════════════════════════════════════════════════

use crate::engine::echo_counselor::{
    EchoCounselorState,
    EchoCounselorSession,
    EchoCounselorMessage,
    EchoCrisisFlag,
    EchoGratitudeEntry,
    EchoGroundingExercise,
    EchoWeeklyLetter,
    EchoStartSessionRequest,
    EchoSendMessageRequest,
};

use super::engine::echo_counselor as echo_counselor;

#[tauri::command]
pub fn echo_counselor_get_state() -> Result<EchoCounselorState, String> {
    echo_counselor::get_state().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_counselor_start_session(req: EchoStartSessionRequest) -> Result<EchoCounselorSession, String> {
    echo_counselor::start_session(req).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_counselor_get_messages(session_id: String) -> Result<Vec<EchoCounselorMessage>, String> {
    echo_counselor::get_messages(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn echo_counselor_send_message(req: EchoSendMessageRequest) -> Result<EchoCounselorMessage, String> {
    echo_counselor::send_message(&req.session_id, &req.content).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_counselor_end_session(session_id: String) -> Result<(), String> {
    echo_counselor::end_session(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_counselor_flag_crisis(
    session_id: String,
    content: String,
    severity: String,
    detected_text: String,
) -> Result<EchoCrisisFlag, String> {
    echo_counselor::flag_crisis(&session_id, &content, &severity, &detected_text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_counselor_write_gratitude(items: Vec<String>, context: Option<String>) -> Result<(), String> {
    echo_counselor::write_gratitude(items, context).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_counselor_get_gratitude(limit: Option<i64>) -> Result<Vec<EchoGratitudeEntry>, String> {
    echo_counselor::get_gratitude(limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_counselor_get_exercises() -> Result<Vec<EchoGroundingExercise>, String> {
    echo_counselor::get_exercises().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_counselor_complete_exercise(exercise_id: String) -> Result<(), String> {
    echo_counselor::complete_exercise(&exercise_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_counselor_get_reflections(limit: Option<i64>) -> Result<Vec<EchoCounselorSession>, String> {
    echo_counselor::get_reflections(limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_counselor_mark_reflection_read(session_id: String) -> Result<(), String> {
    echo_counselor::mark_reflection_read(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn echo_counselor_generate_weekly_letter() -> Result<EchoWeeklyLetter, String> {
    echo_counselor::generate_weekly_letter().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_counselor_get_weekly_letter() -> Result<Option<EchoWeeklyLetter>, String> {
    echo_counselor::get_weekly_letter().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn echo_counselor_get_weekly_letter_history(limit: Option<i64>) -> Result<Vec<EchoWeeklyLetter>, String> {
    echo_counselor::get_weekly_letter_history(limit).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct SetEveningReminderRequest {
    pub enabled: bool,
    pub hour: Option<i32>,   // 0-23, default 20 (8 PM)
    pub minute: Option<i32>, // 0-59, default 0
}

#[tauri::command]
pub fn echo_counselor_set_evening_reminder(req: SetEveningReminderRequest) -> Result<String, String> {
    let engine = engine::get_engine();

    // Find and remove existing evening reminder (by name)
    let existing: Vec<engine::types::CronJob> = engine.get_cron_jobs(false)
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|j| j.name == "mirror-evening-ritual")
        .collect();

    for job in existing {
        engine.delete_cron_job(&job.id).map_err(|e| e.to_string())?;
    }

    if !req.enabled {
        return Ok("Evening reminder disabled".to_string());
    }

    let hour = req.hour.unwrap_or(20);
    let minute = req.minute.unwrap_or(0);
    let schedule = format!("{} {} * * *", minute, hour); // e.g. "0 20 * * *" = 8 PM daily

    let task_message = "Evening ritual check-in for Mirror counseling sessions. If there is an active or recent session, do nothing and respond briefly. If no session has occurred today, send a gentle reminder to the user via the desktop notification system to check in with Mirror tonight.".to_string();

    engine.create_cron_job(
        "mirror-evening-ritual",
        "mirror",
        &schedule,
        "America/Denver",
        &task_message,
    ).map_err(|e| e.to_string())
}
