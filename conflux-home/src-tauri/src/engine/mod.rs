// Conflux Engine — Module Root
// The agent operating system. Everything ties together here.

pub mod cloud;
pub mod cron;
pub mod db;
pub mod deterministic;
pub mod echo_counselor;
pub mod google;
pub mod local_ai;
pub mod memory;
pub mod orbit_prompts;
pub mod router;
pub mod runtime;
pub mod security;
pub mod state_events;
pub mod state_manager;
pub mod tools;
pub mod tool_selector;
pub mod types;
pub mod commands {
    pub mod voice_commands;
}

pub use db::EngineDb;

use anyhow::Result;
use std::path::Path;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};
use uuid::Uuid;

/// Global engine instance.
static ENGINE: OnceLock<ConfluxEngine> = OnceLock::new();

/// Global offline mode flag. Set by the frontend toggle or auto-fallback.
static GLOBAL_OFFLINE: AtomicBool = AtomicBool::new(false);

/// Check if the engine is in offline mode (user-toggled or auto-fallback).
pub fn is_offline_mode() -> bool {
    GLOBAL_OFFLINE.load(Ordering::Relaxed)
}

/// Set offline mode on/off. Called from the `engine_set_offline_mode` Tauri command.
pub fn set_offline_mode(offline: bool) {
    GLOBAL_OFFLINE.store(offline, Ordering::Relaxed);
    log::info!("[Engine] Offline mode set: {}", offline);
}

/// Get the global engine instance. Panics if not initialized.
pub fn get_engine() -> &'static ConfluxEngine {
    ENGINE.get().expect("Conflux Engine not initialized")
}

/// Get the global engine instance safely. Returns None if not initialized.
pub fn try_get_engine() -> Option<&'static ConfluxEngine> {
    ENGINE.get()
}

/// Initialize the global engine. Call once during app setup.
/// Returns a reference to the engine for immediate post-init setup.
pub fn init_engine(db_path: &Path) -> Result<&'static ConfluxEngine> {
    let engine = ConfluxEngine::new(db_path)?;

    // NOTE: All provider API keys have been removed. Inference now routes through
    // the cloud router (https://theconflux.com/v1/chat/completions) using Supabase JWT.
    // Client-side provider keys are no longer supported.

    // Load Studio API keys from environment variables (if not already in DB)
    // These are for Studio features (Replicate, ElevenLabs), not inference
    if engine
        .db
        .get_config("studio_replicate_key")
        .ok()
        .flatten()
        .is_none()
    {
        if let Ok(key) = std::env::var("REPLICATE_API_KEY") {
            if !key.is_empty() {
                engine.db.set_config("studio_replicate_key", &key).ok();
                log::info!("[Engine] Replicate API key loaded from env");
            }
        }
    }
    if engine
        .db
        .get_config("studio_elevenlabs_key")
        .ok()
        .flatten()
        .is_none()
    {
        // Try runtime env var first, then compile-time embedded key
        let key = std::env::var("ELEVENLABS_API_KEY")
            .ok()
            .filter(|k| !k.is_empty())
            .or_else(|| option_env!("ELEVENLABS_API_KEY").map(|s| s.to_string()))
            .filter(|k| !k.is_empty());
        if let Some(key) = key {
            engine.db.set_config("studio_elevenlabs_key", &key).ok();
            log::info!("[Engine] ElevenLabs API key loaded");
        }
    }

    ENGINE
        .set(engine)
        .map_err(|_| anyhow::anyhow!("Engine already initialized"))?;

    // Auto-create system cron jobs (idempotent — skips if they already exist)
    if let Err(e) = get_engine().ensure_system_cron_jobs() {
        log::warn!("[Engine] Failed to ensure system cron jobs: {}", e);
    }

    Ok(get_engine())
}

/// The Conflux Engine — manages all agent state and inference.
pub struct ConfluxEngine {
    db: EngineDb,
    /// Stored AppHandle for emitting Tauri events and sending notifications.
    /// Set once at startup via `set_app_handle()`.
    app_handle: std::sync::Mutex<Option<tauri::AppHandle>>,
}

impl std::fmt::Debug for ConfluxEngine {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ConfluxEngine").finish()
    }
}

impl ConfluxEngine {
    /// Initialize the engine with a database file path.
    pub fn new(db_path: &Path) -> Result<Self> {
        let db = EngineDb::open(db_path)?;
        Ok(Self { db, app_handle: std::sync::Mutex::new(None) })
    }

    /// Store the Tauri app handle. Call once at startup from lib.rs.
    pub fn set_app_handle(&self, handle: tauri::AppHandle) {
        let mut guard = self.app_handle.lock().unwrap();
        *guard = Some(handle);
        log::info!("[Engine] AppHandle registered for real-time events");
    }

    /// Emit a Tauri event to all listeners.
    pub fn emit_tauri_event(&self, event: &str, payload: impl serde::Serialize + Clone) {
        use tauri::Emitter;
        let handle_guard = self.app_handle.lock().unwrap();
        if let Some(handle) = handle_guard.as_ref() {
            match handle.emit(event, payload) {
                Ok(()) => log::debug!("[Engine] Tauri event '{}' emitted", event),
                Err(e) => log::warn!("[Engine] Failed to emit {}: {}", event, e),
            }
        } else {
            log::warn!("[Engine] Cannot emit Tauri event '{}' — app_handle not registered", event);
        }
    }

    /// Send a desktop notification AND emit a Tauri event for UI reactivity.
    pub fn send_security_notification(&self, title: &str, body: &str) {
        // Emit Tauri event for frontend listeners (works on all platforms)
        self.emit_tauri_event("security:permission_prompt", serde_json::json!({
            "title": title,
            "body": body,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }));

        // Fire OS desktop notification (desktop only)
        #[cfg(desktop)]
        {
            use tauri_plugin_notification::NotificationExt;
            if let Some(ref handle) = *self.app_handle.lock().unwrap() {
                let _ = handle.notification().builder().title(title).body(body).show();
            }
        }
    }


    /// Initialize with in-memory database (for testing).
    pub fn new_in_memory() -> Result<Self> {
        let db = EngineDb::open_in_memory()?;
        Ok(Self { db, app_handle: std::sync::Mutex::new(None) })
    }

    /// Get a reference to the database.
    pub fn db(&self) -> &EngineDb {
        &self.db
    }

    // ── Agents ──

    pub fn get_agents(&self) -> Result<Vec<types::Agent>> {
        self.db.get_active_agents()
    }

    pub fn update_agent(
        &self,
        id: &str,
        name: Option<&str>,
        emoji: Option<&str>,
        role: Option<&str>,
        soul: Option<&str>,
        instructions: Option<&str>,
        model_alias: Option<&str>,
        is_active: Option<bool>,
    ) -> Result<()> {
        self.db
            .update_agent(id, name, emoji, role, soul, instructions, model_alias, is_active)
    }

    // ── Sessions ──

    pub fn create_session(&self, agent_id: &str, user_id: &str) -> Result<types::Session> {
        let session = self.db.create_session(agent_id, user_id)?;
        let _ = self
            .db
            .log_event("session_created", Some(agent_id), Some(&session.id), None);
        Ok(session)
    }

    pub fn get_sessions(&self, user_id: &str, limit: i64) -> Result<Vec<types::Session>> {
        self.db.get_recent_sessions(user_id, limit)
    }

    pub fn get_session(&self, session_id: &str) -> Result<Option<types::Session>> {
        self.db.get_session(session_id)
    }

    pub fn get_messages(&self, session_id: &str, limit: i64) -> Result<Vec<types::Message>> {
        self.db.get_messages(session_id, limit)
    }

    // ── Chat ──

    pub async fn chat(
        &self,
        session_id: &str,
        agent_id: &str,
        message: &str,
        max_tokens: Option<i64>,
    ) -> Result<router::ModelResponse> {
        runtime::process_turn(&self.db, session_id, agent_id, message, max_tokens).await
    }

    pub async fn chat_stream(
        &self,
        session_id: &str,
        agent_id: &str,
        message: &str,
        max_tokens: Option<i64>,
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<router::ModelResponse> {
        runtime::process_turn_stream(
            &self.db, session_id, agent_id, message, max_tokens, on_chunk,
        )
        .await
    }

    // ── Memory ──

    pub fn store_memory(
        &self,
        agent_id: &str,
        memory_type: &str,
        key: Option<&str>,
        content: &str,
        source: Option<&str>,
    ) -> Result<String> {
        self.db
            .store_memory(agent_id, memory_type, key, content, source)
    }

    pub fn search_memory(
        &self,
        agent_id: &str,
        query: &str,
        limit: i64,
    ) -> Result<Vec<types::Memory>> {
        self.db.search_memory(agent_id, query, limit)
    }

    pub fn get_all_memories(&self, agent_id: &str, limit: i64) -> Result<Vec<types::Memory>> {
        self.db.get_all_memories(agent_id, limit)
    }

    pub fn delete_memory(&self, memory_id: &str) -> Result<()> {
        self.db.delete_memory(memory_id)
    }

    // ── Providers ──

    pub fn get_providers(&self) -> Result<Vec<types::ProviderConfig>> {
        self.db.get_providers()
    }

    pub fn update_provider(
        &self,
        id: &str,
        name: &str,
        base_url: &str,
        api_key: &str,
        model_id: &str,
        model_alias: &str,
        priority: i32,
        is_enabled: bool,
    ) -> Result<()> {
        self.db.upsert_provider(
            id,
            name,
            base_url,
            api_key,
            model_id,
            model_alias,
            priority,
            is_enabled,
        )
    }

    pub fn delete_provider(&self, id: &str) -> Result<()> {
        self.db.delete_provider(id)
    }

    // ── Provider Templates ──

    pub fn get_provider_templates(&self) -> Result<Vec<types::ProviderTemplate>> {
        self.db.get_provider_templates()
    }

    pub fn install_provider_template(
        &self,
        template_id: &str,
        api_key: Option<&str>,
        model: Option<&str>,
    ) -> Result<String> {
        let template = self
            .db
            .get_provider_template(template_id)?
            .ok_or_else(|| anyhow::anyhow!("Template not found: {}", template_id))?;

        // Free tier doesn't need installation (already active)
        if template.is_free {
            return Ok("Free tier is already active.".to_string());
        }

        let key = api_key.unwrap_or("");
        if key.is_empty() {
            anyhow::bail!("API key is required for {}", template.name);
        }

        let model_id = model.unwrap_or(&template.default_model);
        let provider_id = format!("{}-user", template_id);

        self.db.upsert_provider(
            &provider_id,
            &template.name,
            &template.base_url,
            key,
            model_id,
            &template.model_alias,
            10, // lower priority than built-in providers
            true,
        )?;

        Ok(format!(
            "{} connected with model {}",
            template.name, model_id
        ))
    }

    pub fn is_template_installed(&self, template_id: &str) -> Result<bool> {
        self.db.check_template_installed(template_id)
    }

    // ── Provider API Keys ──

    /// Set the OpenAI API key. Stores in DB and configures the router.
    pub fn set_openai_key(&self, api_key: &str) -> Result<()> {
        self.db.set_config("openai_api_key", api_key)?;
        if !api_key.is_empty() {
            router::configure_provider("openai-gpt4o", api_key)?;
            router::configure_provider("openai-gpt4o-mini", api_key)?;
        }
        log::info!("[Engine] OpenAI API key updated");
        Ok(())
    }

    /// Set the Anthropic API key. Stores in DB and configures the router.
    pub fn set_anthropic_key(&self, api_key: &str) -> Result<()> {
        self.db.set_config("anthropic_api_key", api_key)?;
        if !api_key.is_empty() {
            router::configure_provider("anthropic-claude-sonnet", api_key)?;
            router::configure_provider("anthropic-claude-opus", api_key)?;
        }
        log::info!("[Engine] Anthropic API key updated");
        Ok(())
    }

    /// Set the Xiaomi (MiMo) API key. Stores in DB and configures the router.
    pub fn set_xiaomi_key(&self, api_key: &str) -> Result<()> {
        self.db.set_config("xiaomi_api_key", api_key)?;
        if !api_key.is_empty() {
            router::configure_provider("xiaomi-mimo-flash", api_key)?;
            router::configure_provider("xiaomi-mimo-pro", api_key)?;
        }
        log::info!("[Engine] Xiaomi API key updated");
        Ok(())
    }

    /// Get a masked API key for display.
    fn get_key_masked(&self, config_key: &str) -> Result<String> {
        match self.db.get_config(config_key)? {
            Some(key) if key.len() > 8 => Ok(format!("{}...{}", &key[..4], &key[key.len() - 4..])),
            Some(_) => Ok("••••".to_string()),
            None => Ok(String::new()),
        }
    }

    pub fn get_openai_key_masked(&self) -> Result<String> {
        self.get_key_masked("openai_api_key")
    }

    pub fn get_anthropic_key_masked(&self) -> Result<String> {
        self.get_key_masked("anthropic_api_key")
    }

    pub fn get_xiaomi_key_masked(&self) -> Result<String> {
        self.get_key_masked("xiaomi_api_key")
    }

    /// Get the list of available models from cloud router (for display in settings).
    pub async fn get_available_models(&self) -> Result<Vec<cloud::CloudModel>> {
        cloud::cloud_get_models().await
    }

    // ── Agent Capabilities & Permissions ──

    pub fn get_agent_capabilities(&self, agent_id: &str) -> Result<Vec<types::AgentCapability>> {
        self.db.get_agent_capabilities(agent_id)
    }

    pub fn find_agents_by_capability(&self, capability: &str) -> Result<Vec<String>> {
        self.db.find_agents_by_capability(capability)
    }

    pub fn get_agent_permissions(&self, agent_id: &str) -> Result<Option<types::AgentPermission>> {
        self.db.get_agent_permissions(agent_id)
    }

    pub fn can_agent_talk_to(&self, from: &str, to: &str) -> Result<bool> {
        self.db.can_agent_talk_to(from, to)
    }

    // ── Inter-Agent Communication ──

    pub async fn agent_ask(
        &self,
        from_agent: &str,
        to_agent: &str,
        question: &str,
        session_id: Option<&str>,
    ) -> Result<String> {
        // Check permissions
        if !self.can_agent_talk_to(from_agent, to_agent)? {
            anyhow::bail!(
                "{} does not have permission to talk to {}",
                from_agent,
                to_agent
            );
        }

        // Log the communication
        let comm_id = self
            .db
            .create_communication(from_agent, to_agent, "ask", question, session_id)?;

        // Create a temporary session for the target agent
        let temp_session = self.db.create_session(to_agent, "system")?;

        // Build anti-hallucination preamble for the target agent
        let verified_question = format!(
            "You have been asked a question by {} (communication ID: {}).\n\
             ANTI-HALLUCINATION RULES:\n\
             - Read actual data before answering. Never invent information.\n\
             - If you cannot verify something, say 'I cannot verify this.'\n\
             - If you use tools, report the actual tool results, not summaries.\n\
             - State your confidence level (high/medium/low) for factual claims.\n\n\
             Question from {}:\n{}",
            from_agent, comm_id, from_agent, question
        );

        // Process through the runtime's async process_turn
        let response = runtime::process_turn(
            &self.db,
            &temp_session.id,
            to_agent,
            &verified_question,
            None,
        )
        .await?;

        // Complete the communication
        self.db
            .complete_communication(&comm_id, &response.content, response.tokens_used)?;

        Ok(response.content)
    }

    // ── Verification (Anti-Hallucination Enforcement) ──

    pub fn create_verification_claim(
        &self,
        agent_id: &str,
        session_id: Option<&str>,
        claim_type: &str,
        claim: &str,
    ) -> Result<String> {
        self.db
            .create_verification(agent_id, session_id, claim_type, claim)
    }

    pub fn complete_verification_claim(
        &self,
        id: &str,
        verified_by: &str,
        result: &str,
        evidence: Option<&str>,
    ) -> Result<()> {
        self.db
            .complete_verification(id, verified_by, result, evidence)
    }

    pub fn get_unverified_claims(
        &self,
        agent_id: Option<&str>,
    ) -> Result<Vec<types::VerificationRecord>> {
        self.db.get_unverified_claims(agent_id)
    }

    // ── Tasks ──

    pub fn create_task(
        &self,
        title: &str,
        description: Option<&str>,
        agent_id: &str,
        created_by: &str,
        priority: &str,
        requires_verify: bool,
    ) -> Result<String> {
        // Check if creator can create tasks
        let perms = self.db.get_agent_permissions(created_by)?;
        if let Some(p) = perms {
            if !p.can_create_tasks {
                anyhow::bail!("{} does not have permission to create tasks", created_by);
            }
        }
        self.db.create_task(
            title,
            description,
            agent_id,
            created_by,
            priority,
            requires_verify,
        )
    }

    pub fn update_task_status(
        &self,
        task_id: &str,
        status: &str,
        result: Option<&str>,
    ) -> Result<()> {
        self.db.update_task_status(task_id, status, result)
    }

    pub fn get_task(&self, task_id: &str) -> Result<Option<types::Task>> {
        self.db.get_task(task_id)
    }

    pub fn get_tasks_for_agent(
        &self,
        agent_id: &str,
        status_filter: Option<&str>,
    ) -> Result<Vec<types::Task>> {
        self.db.get_tasks_for_agent(agent_id, status_filter)
    }

    // ── Lessons Learned ──

    pub fn add_lesson(
        &self,
        agent_id: Option<&str>,
        category: &str,
        lesson: &str,
        evidence: Option<&str>,
        action: Option<&str>,
    ) -> Result<String> {
        self.db
            .add_lesson(agent_id, category, lesson, evidence, action)
    }

    pub fn get_active_lessons(&self, category: Option<&str>) -> Result<Vec<types::LessonLearned>> {
        self.db.get_active_lessons(category)
    }

    // ── Cron Jobs ──

    pub fn create_cron_job(
        &self,
        name: &str,
        agent_id: &str,
        schedule: &str,
        timezone: &str,
        task_message: &str,
    ) -> Result<String> {
        let id = self
            .db
            .create_cron_job(name, agent_id, schedule, timezone, task_message)?;

        // Compute initial next run time
        if let Some(next) = cron::next_run(schedule, chrono::Utc::now()) {
            let next_str = next.format("%Y-%m-%dT%H:%M:%SZ").to_string();
            self.db.update_cron_next_run(&id, &next_str)?;
        }

        // Emit event
        self.db.emit_event(
            "cron_created",
            Some("system"),
            None,
            Some(&serde_json::json!({"id": id, "name": name}).to_string()),
        )?;

        Ok(id)
    }

    pub fn get_cron_jobs(&self, enabled_only: bool) -> Result<Vec<types::CronJob>> {
        self.db.get_cron_jobs(enabled_only)
    }

    pub fn toggle_cron_job(&self, id: &str, enabled: bool) -> Result<()> {
        self.db.toggle_cron_job(id, enabled)
    }

    pub fn delete_cron_job(&self, id: &str) -> Result<()> {
        self.db.delete_cron_job(id)
    }

    /// Force-update a cron job's prompt by name (for patching system crons).
    pub fn update_cron_message(&self, name: &str, message: &str) -> Result<()> {
        self.db.update_cron_message_by_name(name, message)
    }

    /// Run any due cron jobs. Call this from the background scheduler.
    pub async fn tick_cron(&self) -> Result<i64> {
        let due_jobs = self.db.get_due_cron_jobs()?;
        let mut executed = 0i64;

        for job in due_jobs {
            log::info!(
                "[Cron] Running job '{}' ({}) → agent {}",
                job.name,
                job.id,
                job.agent_id
            );

            // Create a temp session for this cron run
            let session = match self.db.create_session(&job.agent_id, "cron") {
                Ok(s) => s,
                Err(e) => {
                    log::error!("[Cron] Failed to create session for {}: {}", job.id, e);
                    let _ = self
                        .db
                        .update_cron_run(&job.id, "error", 0, Some(&e.to_string()));
                    continue;
                }
            };

            // Inject anti-hallucination preamble
            let message = format!(
                "SCHEDULED TASK (cron: {}):\n{}\n\n\
                 ANTI-HALLUCINATION RULES:\n\
                 - This is a scheduled autonomous task.\n\
                 - Read actual data before reporting results.\n\
                 - If the task cannot be completed, explain why honestly.\n\
                 - Log what you did in the session for audit purposes.",
                job.schedule, job.task_message
            );

            // Execute through the runtime
            match runtime::process_turn(&self.db, &session.id, &job.agent_id, &message, None).await
            {
                Ok(response) => {
                    let tokens = response.tokens_used;
                    let _ = self.db.update_cron_run(&job.id, "success", tokens, None);
                    self.db.emit_event(
                        "cron_fired",
                        Some(&job.agent_id),
                        None,
                        Some(&serde_json::json!({"job_id": job.id, "tokens": tokens}).to_string()),
                    )?;
                }
                Err(e) => {
                    log::error!("[Cron] Job {} failed: {}", job.id, e);
                    let _ = self
                        .db
                        .update_cron_run(&job.id, "error", 0, Some(&e.to_string()));
                    self.db.emit_event(
                        "cron_error",
                        Some(&job.agent_id),
                        None,
                        Some(
                            &serde_json::json!({"job_id": job.id, "error": e.to_string()})
                                .to_string(),
                        ),
                    )?;
                }
            }

            executed += 1;
        }

        Ok(executed)
    }

    /// Create default system cron jobs if they don't exist yet.
    /// Called once at startup — idempotent (skips jobs that already exist by name).
    pub fn ensure_system_cron_jobs(&self) -> Result<()> {
        let existing = self.db.get_cron_jobs(false)?;
        let existing_names: std::collections::HashSet<String> =
            existing.iter().map(|j| j.name.clone()).collect();

        let system_jobs: Vec<(&str, &str, &str, &str, &str)> = vec![
            ("morning-brief", "conflux", "0 7 * * *", "local",
             "Generate the daily morning briefing. \
              Use budget_get_summary for this month's spending. \
              Use kitchen_get_inventory to check items expiring within 3 days. \
              Use life_list_tasks with status 'pending' for today's tasks. \
              Use home_get_bills to check bills due within 7 days. \
              Use dream_list to check active dreams and their progress. \
              Compile a warm, concise morning briefing (5-8 sentences). \
              Start with 'Good morning! Here is your day:' \
              Include specific dollar amounts, item names, and task titles. \
              End with one actionable recommendation."),

            ("agent-diary", "conflux", "0 23 * * *", "local",
             "Write tonight's diary entry. \
              Reflect on the day — what patterns do you notice in the user's behavior? \
              Check budget entries from today for spending patterns. \
              Check kitchen meals logged this week for cooking frequency. \
              Check life tasks for completion rate. \
              Write a warm, reflective 3-5 sentence diary entry. \
              Be observational, not judgmental. Note trends and growth. \
              Store this reflection using memory_write with category 'diary' and a descriptive title."),

            ("weekly-insights", "conflux", "0 10 * * 0", "local",
             "Generate a weekly cross-app insights report. \
              1. Budget: Use budget_get_summary for this month. Note total spent, top categories, any unusual spending. \
              2. Kitchen: Use kitchen_list_meals to see what was cooked. Use kitchen_get_inventory for expiring items. \
              3. Life: Use life_list_tasks for completion stats. Use life_list_habits for streaks. \
              4. Home: Use home_get_bills for upcoming due dates. \
              5. Dreams: Use dream_list for progress percentages. \
              Write a structured report with specific numbers and 2-3 actionable recommendations. \
              Store the report using memory_write with category 'weekly-insights'."),

            ("pantry-check", "conflux", "0 8 * * *", "local",
             "Check kitchen inventory for items expiring in the next 3 days using kitchen_get_inventory. \
              If any items are expiring soon, use kitchen_list_meals to suggest a recipe that uses them. \
              If nothing is expiring, just say 'Pantry looks good!' with a 1-sentence inventory summary. \
              Keep it brief — 2-3 sentences max."),

            ("budget-nudge", "conflux", "0 18 * * *", "local",
             "Check today's budget entries using budget_get_entries for this month. \
              If the user spent money today, give a brief 1-sentence spending summary. \
              If a savings goal is close to deadline, mention progress using budget_get_goals. \
              If no budget activity today, stay completely silent — do not generate any output. \
              Be encouraging, never judgmental. 1-2 sentences max."),

            ("dream-motivation", "conflux", "0 9 * * 1-5", "local",
             "Check active dreams using dream_list. \
              Look for any dream tasks due today or this week. \
              If there are upcoming tasks, send a brief motivational 1-2 sentence reminder. \
              Reference the dream title and the specific task name. \
              If no upcoming tasks, check if any milestones were recently completed and celebrate briefly. \
              If nothing notable, stay silent — do not generate output."),

            ("security-scan", "conflux", "0 2 * * *", "local",
             "Run a scheduled status scan using only available tools. \
              1. Use home_get_year_summary to check home health score and overdue items. \
              2. Use life_list_tasks with status='pending' to check for overdue tasks. \
              3. Use home_get_overdue_maintenance to check for overdue maintenance. \
              If any overdue items or issues are found, report them briefly. \
              If everything is clean, respond with a single line: '✅ Nightly scan: all clear.' \
              Do NOT send a notification to the user unless there is a critical finding. \
              Keep output minimal — just the scan results summary."),

            ("dream-skill-synthesis", "conflux", "0 23 * * *", "local",
             "Dream Cycle — Nightly dream review. \
              1. Use dream_list to see all active dreams. \
              2. Use dream_get_dashboard to check progress and upcoming tasks. \
              3. For each dream with tasks due this week, note them briefly. \
              4. If a dream has stalled (no progress in 7+ days), mention it gently. \
              If no dreams are active or nothing notable, respond with: '🌙 Dream cycle: nothing to report.' \
              Be concise — this cron must complete within its timeout window. \
              Do NOT try to call tools that are not in your available tool list."),


            ("trajectory-mine", "conflux", "50 23 * * *", "local",
             "Trajectory Mining — Nightly activity review. \
              1. Use conflux_day_overview to see today's activity summary. \
              2. Use echo_get_entries to check recent journal entries (if any). \
              3. Use echo_get_patterns to check for recurring patterns. \
              If nothing notable happened today, respond with: '📊 Trajectory: quiet day, no patterns to report.' \
              Be concise — this cron must complete within its timeout window. \
              Do NOT try to call tools that are not in your available tool list."),
        ];

        for &(name, agent_id, schedule, tz, message) in system_jobs.iter() {
            if !existing_names.contains(&name.to_string()) {
                let id = self
                    .db
                    .create_cron_job(name, agent_id, schedule, tz, message)?;
                log::info!("[SystemCron] Created job '{}' (id={})", name, id);
                if let Some(next) = cron::next_run(schedule, chrono::Utc::now()) {
                    let next_str = next.format("%Y-%m-%dT%H:%M:%SZ").to_string();
                    self.db.update_cron_next_run_by_name(name, &next_str)?;
                }
            }
        }

        // Force-update system cron prompts that were patched (v2 hotfix).
        // These jobs reference tools that don't exist yet — update their prompts
        // to use only real tools so they stop hallucinating and failing.
        let patched_jobs = [
            ("security-scan", system_jobs.iter().find(|j| j.0 == "security-scan").map(|j| j.4)),
            ("dream-skill-synthesis", system_jobs.iter().find(|j| j.0 == "dream-skill-synthesis").map(|j| j.4)),
            ("trajectory-mine", system_jobs.iter().find(|j| j.0 == "trajectory-mine").map(|j| j.4)),
        ];
        for (name, msg) in patched_jobs {
            if let Some(message) = msg {
                let _ = self.db.update_cron_message_by_name(name, message);
            }
        }

        Ok(())
    }

    // ── Webhooks ──

    pub fn create_webhook(
        &self,
        name: &str,
        agent_id: &str,
        path: &str,
        secret: Option<&str>,
        task_template: &str,
    ) -> Result<String> {
        self.db
            .create_webhook(name, agent_id, path, secret, task_template)
    }

    pub fn get_webhooks(&self) -> Result<Vec<types::Webhook>> {
        self.db.get_webhooks()
    }

    pub fn delete_webhook(&self, id: &str) -> Result<()> {
        self.db.delete_webhook(id)
    }

    /// Process an incoming webhook request. Returns the agent's response.
    pub async fn handle_webhook(
        &self,
        path: &str,
        body: &str,
        auth_header: Option<&str>,
    ) -> Result<String> {
        let webhook = self
            .db
            .get_webhook_by_path(path)?
            .ok_or_else(|| anyhow::anyhow!("No webhook registered for path: {}", path))?;

        // Verify secret if set
        if let Some(ref secret) = webhook.secret {
            let provided = auth_header.unwrap_or("");
            if provided != secret {
                anyhow::bail!("Webhook auth failed for path: {}", path);
            }
        }

        // Record the call
        self.db.record_webhook_call(path)?;

        // Build message from template
        let message = webhook
            .task_template
            .replace("{{body}}", body)
            .replace("{{path}}", path);

        // Add anti-hallucination preamble
        let full_message = format!(
            "WEBHOOK TRIGGER ({}):\n{}\n\n\
             ANTI-HALLUCINATION RULES:\n\
             - This was triggered by an external webhook.\n\
             - Process the payload data accurately.\n\
             - If you take any actions, report them with evidence.",
            webhook.name, message
        );

        // Execute through the runtime
        let session = self.db.create_session(&webhook.agent_id, "webhook")?;
        let response = runtime::process_turn(
            &self.db,
            &session.id,
            &webhook.agent_id,
            &full_message,
            None,
        )
        .await?;

        // Emit event
        self.db.emit_event(
            "webhook_fired",
            Some(&webhook.agent_id),
            None,
            Some(&serde_json::json!({"path": path, "tokens": response.tokens_used}).to_string()),
        )?;

        Ok(response.content)
    }

    // ── Events ──

    pub fn emit_event(
        &self,
        event_type: &str,
        source: Option<&str>,
        target: Option<&str>,
        payload: Option<&str>,
    ) -> Result<String> {
        self.db.emit_event(event_type, source, target, payload)
    }

    pub fn get_unprocessed_events(&self, target_agent: Option<&str>) -> Result<Vec<types::Event>> {
        self.db.get_unprocessed_events(target_agent)
    }

    pub fn mark_event_processed(&self, id: &str) -> Result<()> {
        self.db.mark_event_processed(id)
    }

    pub fn cleanup_old_events(&self, days: i64) -> Result<i64> {
        self.db.cleanup_old_events(days)
    }

    // ── Heartbeats ──

    pub fn record_heartbeat(
        &self,
        check_name: &str,
        status: &str,
        details: Option<&str>,
    ) -> Result<String> {
        self.db.record_heartbeat(check_name, status, details)
    }

    pub fn get_latest_heartbeats(&self) -> Result<Vec<types::HeartbeatRecord>> {
        self.db.get_latest_heartbeats()
    }

    /// Run all health checks and record results.
    pub fn run_health_checks(&self) -> Result<serde_json::Value> {
        let mut results = serde_json::Map::new();

        // 1. Database health
        match self.db.conn().execute("SELECT 1", []) {
            Ok(_) => {
                self.db.record_heartbeat("database", "ok", None)?;
                results.insert("database".into(), serde_json::json!("ok"));
            }
            Err(e) => {
                self.db
                    .record_heartbeat("database", "error", Some(&e.to_string()))?;
                results.insert(
                    "database".into(),
                    serde_json::json!({"error": e.to_string()}),
                );
            }
        }

        // 2. Provider health (check if any providers are configured)
        match self.db.get_providers() {
            Ok(providers) if !providers.is_empty() => {
                let enabled = providers.iter().filter(|p| p.is_enabled).count();
                self.db.record_heartbeat(
                    "providers",
                    "ok",
                    Some(
                        &serde_json::json!({
                            "total": providers.len(),
                            "enabled": enabled
                        })
                        .to_string(),
                    ),
                )?;
                results.insert(
                    "providers".into(),
                    serde_json::json!({"total": providers.len(), "enabled": enabled}),
                );
            }
            Ok(_) => {
                self.db.record_heartbeat(
                    "providers",
                    "warning",
                    Some("No providers configured"),
                )?;
                results.insert(
                    "providers".into(),
                    serde_json::json!("warning: no providers"),
                );
            }
            Err(e) => {
                self.db
                    .record_heartbeat("providers", "error", Some(&e.to_string()))?;
                results.insert(
                    "providers".into(),
                    serde_json::json!({"error": e.to_string()}),
                );
            }
        }

        // 3. Scheduler health (count active cron jobs)
        match self.db.get_cron_jobs(true) {
            Ok(jobs) => {
                self.db.record_heartbeat(
                    "scheduler",
                    "ok",
                    Some(&serde_json::json!({"active_jobs": jobs.len()}).to_string()),
                )?;
                results.insert(
                    "scheduler".into(),
                    serde_json::json!({"active_jobs": jobs.len()}),
                );
            }
            Err(e) => {
                self.db
                    .record_heartbeat("scheduler", "error", Some(&e.to_string()))?;
                results.insert(
                    "scheduler".into(),
                    serde_json::json!({"error": e.to_string()}),
                );
            }
        }

        // 4. Agent health (count active agents)
        match self.db.get_active_agents() {
            Ok(agents) => {
                self.db.record_heartbeat(
                    "agents",
                    "ok",
                    Some(&serde_json::json!({"active": agents.len()}).to_string()),
                )?;
                results.insert("agents".into(), serde_json::json!({"active": agents.len()}));
            }
            Err(e) => {
                self.db
                    .record_heartbeat("agents", "error", Some(&e.to_string()))?;
                results.insert("agents".into(), serde_json::json!({"error": e.to_string()}));
            }
        }

        Ok(serde_json::Value::Object(results))
    }

    // ── Skills ──

    pub fn get_skills(&self, active_only: bool) -> Result<Vec<types::Skill>> {
        self.db.get_skills(active_only)
    }

    pub fn get_skill(&self, id: &str) -> Result<Option<types::Skill>> {
        self.db.get_skill(id)
    }

    pub fn get_skills_for_agent(&self, agent_id: &str) -> Result<Vec<types::Skill>> {
        self.db.get_skills_for_agent(agent_id)
    }

    /// Build the skill instructions block for an agent's system prompt.
    /// This is called by the runtime when assembling context.
    pub fn build_skill_context(&self, agent_id: &str) -> Result<String> {
        let skills = self.db.get_skills_for_agent(agent_id)?;
        if skills.is_empty() {
            return Ok(String::new());
        }

        let mut ctx = String::from("\n## ACTIVE SKILLS\n\n");
        for skill in &skills {
            ctx.push_str(&format!(
                "### {} {} (v{})\n",
                skill.emoji, skill.name, skill.version
            ));
            ctx.push_str(&skill.instructions);
            ctx.push_str("\n\n");
        }

        // Add required permissions check
        let mut needed_tools: Vec<String> = Vec::new();
        for skill in &skills {
            if let Some(ref perms) = skill.permissions {
                if let Ok(tools) = serde_json::from_str::<Vec<String>>(perms) {
                    for tool in tools {
                        if !needed_tools.contains(&tool) {
                            needed_tools.push(tool);
                        }
                    }
                }
            }
        }

        if !needed_tools.is_empty() {
            ctx.push_str(&format!(
                "Skills require tools: {}\n\n",
                needed_tools.join(", ")
            ));
        }

        Ok(ctx)
    }

    pub fn install_skill_from_json(&self, json: &str) -> Result<String> {
        let manifest: serde_json::Value = serde_json::from_str(json)?;

        let id = manifest["id"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing 'id' in skill manifest"))?;
        let name = manifest["name"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing 'name'"))?;
        let instructions = manifest["instructions"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing 'instructions'"))?;

        let emoji = manifest["emoji"].as_str().unwrap_or("🔌");
        let version = manifest["version"].as_str().unwrap_or("1.0.0");
        let description = manifest["description"].as_str();
        let author = manifest["author"].as_str();
        let triggers = manifest["triggers"]
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| {
                if manifest["triggers"].is_null() {
                    None
                } else {
                    Some(manifest["triggers"].to_string())
                }
            });
        let agents = manifest["agents"]
            .as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                if manifest["agents"].is_null() {
                    "*".to_string()
                } else {
                    manifest["agents"].to_string()
                }
            });
        let permissions = manifest["permissions"]
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| {
                if manifest["permissions"].is_null() {
                    None
                } else {
                    Some(manifest["permissions"].to_string())
                }
            });

        self.db.install_skill(
            id,
            name,
            description,
            emoji,
            version,
            author,
            instructions,
            triggers.as_deref(),
            &agents,
            permissions.as_deref(),
            "local",
            Some(json),
        )?;

        // Emit event
        self.db.emit_event(
            "skill_installed",
            Some("system"),
            None,
            Some(&serde_json::json!({"id": id, "name": name}).to_string()),
        )?;

        Ok(id.to_string())
    }

    /// Install a skill from a SKILL.md file (YAML frontmatter + markdown body).
    pub fn install_skill_from_file(&self, path: &str) -> Result<String> {
        use std::fs;
        let content = fs::read_to_string(path)?;


        // Strip YAML frontmatter
        let content = content.trim_start();
        let body = if content.starts_with("---") {
            let end = content
                .find("\n---\n")
                .map(|i| i + 6)
                .unwrap_or(0);
            &content[end..]
        } else {
            content
        };


        let mut json = serde_json::Map::new();

        // Parse frontmatter from raw content
        if content.starts_with("---") {
            if let Some(end) = content.find("\n---\n") {
                let fm = &content[4..end];
                for line in fm.lines() {
                    if let Some(col) = line.find(':') {
                        let key = line[..col].trim();
                        let val = line[col + 1..].trim().trim_matches('"');
                        if key == "agents" || key == "triggers" {
                            json.insert(key.to_string(), serde_json::Value::String(val.to_string()));
                        } else {
                            json.insert(key.to_string(), serde_json::Value::String(val.to_string()));
                        }
                    }
                }
            }
        }

        // Extract name from the first H1 heading in body
        if let Some(line) = body.lines().find(|l| l.starts_with("# ")) {
            json.insert("name".to_string(), serde_json::Value::String(line[2..].to_string()));
        }

        let id = uuid::Uuid::new_v4().to_string();
        json.insert("id".to_string(), serde_json::Value::String(id.clone()));

        json.insert(
            "instructions".to_string(),
            serde_json::Value::String(body.trim().to_string()),
        );
        json.insert("author".to_string(), serde_json::Value::String("conflux".to_string()));
        json.insert("source".to_string(), serde_json::Value::String(path.to_string()));
        // skill_type defaults to 'learned' if not found in frontmatter
        json.entry("skill_type".to_string()).or_insert(serde_json::Value::String("learned".to_string()));


        self.install_skill_from_json(&serde_json::to_string(&json)?)
    }

    pub fn toggle_skill(&self, id: &str, active: bool) -> Result<()> {
        self.db.toggle_skill(id, active)
    }

    pub fn uninstall_skill(&self, id: &str) -> Result<()> {
        self.db.uninstall_skill(id)
    }

    pub async fn test_provider(&self) -> Result<router::ModelResponse> {
        // Run a test call using the cloud router
        let messages = vec![router::OpenAIMessage {
            role: "user".to_string(),
            content: Some("Say 'hello' in one word.".to_string()),
            tool_call_id: None,
            tool_calls: None,
        }];

        cloud::cloud_chat(Some("simple_chat"), messages, Some(50), None, None).await
    }

    // ── Quota ──

    pub fn get_quota(&self, user_id: &str) -> Result<types::QuotaRecord> {
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        match self.db.get_quota(user_id, &today)? {
            Some(q) => Ok(q),
            None => Ok(types::QuotaRecord {
                user_id: user_id.to_string(),
                date: today,
                calls_used: 0,
                tokens_used: 0,
                providers_used: None,
            }),
        }
    }

    pub fn increment_quota(&self, user_id: &str, tokens: i64, provider_id: &str) -> Result<i64> {
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        self.db
            .increment_quota(user_id, &today, tokens, provider_id)
    }

    pub async fn has_quota(&self, user_id: &str) -> Result<cloud::QuotaStatus> {
        // Try cloud first
        match cloud::check_cloud_balance(user_id).await {
            Ok(status) => {
                if status.has_active_subscription {
                    return Ok(cloud::QuotaStatus {
                        allowed: status.total_available > 0,
                        source: "subscription".to_string(),
                        remaining: status.total_available,
                    });
                }
                if status.deposit_balance > 0 {
                    return Ok(cloud::QuotaStatus {
                        allowed: true,
                        source: "deposit".to_string(),
                        remaining: status.deposit_balance,
                    });
                }
            }
            Err(e) => {
                log::warn!(
                    "[Engine] Cloud balance check failed, falling back to local: {}",
                    e
                );
            }
        }

        // Fallback: free tier daily limit (local SQLite)
        let quota = self.get_quota(user_id)?;
        let limit: i64 = self
            .db
            .get_config("free_daily_limit")?
            .unwrap_or_else(|| "50".to_string())
            .parse()
            .unwrap_or(50);
        let remaining = (limit - quota.calls_used).max(0);
        Ok(cloud::QuotaStatus {
            allowed: remaining > 0,
            source: "free".to_string(),
            remaining,
        })
    }
}
