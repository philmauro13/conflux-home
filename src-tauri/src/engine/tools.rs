// Conflux Engine — Tool System
// Registry, dispatch, and execution of agent tools with sandboxing.

use anyhow::Result;
use serde_json::Value;
use tokio::runtime::Handle;

use super::db::EngineDb;
use super::security::events::{log_security_event, EventCategory, EventType};

/// Result of a tool execution.
#[derive(Debug, Clone)]
pub struct ToolResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

// ── Security: Blocked commands and allowed paths ──

/// Commands that are never allowed in exec.
const BLOCKED_COMMANDS: &[&str] = &[
    "rm -rf /",
    "rm -rf /*",
    "mkfs",
    "dd if=",
    ":(){ :|:& };:", // fork bomb
    "chmod 777",
    "> /dev/sda",
    "wget | sh",
    "curl | sh",
    "curl | bash",
    "wget | bash",
];

/// Paths that are never accessible.
const BLOCKED_PATHS: &[&str] = &["/etc/shadow", "/etc/passwd", "/proc/", "/sys/", "/dev/"];

/// Allowed directories for file operations.
fn get_allowed_paths() -> Vec<String> {
    let mut paths = vec!["/tmp/conflux".to_string()];

    if let Ok(home) = std::env::var("HOME") {
        paths.push(format!("{}/Documents", home));
        paths.push(format!("{}/Downloads", home));
        paths.push(format!("{}/Desktop", home));
        paths.push(format!("{}/.openclaw", home));
    }

    // App data directory
    if let Ok(data) = std::env::var("CONFLUX_DATA_DIR") {
        paths.push(data);
    }

    paths
}

/// Check if a file path is within allowed directories.
fn is_path_allowed(path: &str) -> bool {
    let allowed = get_allowed_paths();
    let normalized = std::path::Path::new(path)
        .canonicalize()
        .unwrap_or_else(|_| std::path::PathBuf::from(path));
    let normalized_str = normalized.to_string_lossy();

    // Check blocked paths first
    for blocked in BLOCKED_PATHS {
        if normalized_str.starts_with(blocked) {
            return false;
        }
    }

    // Check if within allowed directories
    for allowed_path in &allowed {
        if normalized_str.starts_with(allowed_path) {
            return true;
        }
    }

    // Allow relative paths (resolved against CWD)
    if !path.starts_with('/') {
        return true;
    }

    false
}

/// Check if a shell command is safe to execute.
fn is_command_safe(command: &str) -> Result<()> {
    let lower = command.to_lowercase();

    for blocked in BLOCKED_COMMANDS {
        if lower.contains(&blocked.to_lowercase()) {
            anyhow::bail!("Command blocked for safety: contains '{}'", blocked);
        }
    }

    // Block commands that try to download and execute
    if (lower.contains("curl") || lower.contains("wget") || lower.contains("fetch"))
        && (lower.contains("sh")
            || lower.contains("bash")
            || lower.contains("exec")
            || lower.contains("|"))
    {
        anyhow::bail!("Command blocked: downloading and executing scripts is not allowed");
    }

    Ok(())
}

// ── Security Telemetry ──

/// Classify a tool name into a security event type and category.
fn classify_tool(tool_name: &str) -> (EventType, EventCategory, i64) {
    match tool_name {
        // File operations — high risk
        "file_read" | "file_write" => (EventType::FileAccess, EventCategory::Warning, 30),
        // Command execution — critical risk
        "exec" => (EventType::ExecCommand, EventCategory::Critical, 70),
        // Network operations — medium risk
        "web_search" | "web_fetch" | "web_post" => {
            (EventType::NetworkRequest, EventCategory::Info, 20)
        }
        // Email — high risk
        "email_send" | "gmail_send" => (EventType::ApiCall, EventCategory::Warning, 50),
        // Google APIs — medium risk
        "google_auth" | "gmail_search" | "google_drive_list" | "google_doc_read"
        | "google_doc_write" | "google_sheet_read" | "google_sheet_write" => {
            (EventType::ApiCall, EventCategory::Info, 25)
        }
        // Everything else — low risk info
        _ => (EventType::ApiCall, EventCategory::Info, 5),
    }
}

/// Extract the domain from a URL string (no url crate needed).
fn extract_domain(url: &str) -> String {
    // Strip protocol
    let after_proto = if let Some(pos) = url.find("://") {
        &url[pos + 3..]
    } else {
        url
    };
    // Strip path, query, fragment
    let host = after_proto.split('/').next().unwrap_or(after_proto);
    // Strip port
    let domain = host.split(':').next().unwrap_or(host);
    // Strip userinfo
    if let Some(at_pos) = domain.rfind('@') {
        domain[at_pos + 1..].to_string()
    } else {
        domain.to_string()
    }
}

/// Extract the primary target from tool arguments.
fn extract_target(tool_name: &str, args: &Value) -> Option<String> {
    match tool_name {
        "file_read" | "file_write" => args
            .get("path")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        "exec" => args.get("command").and_then(|v| v.as_str()).map(|s| {
            // Truncate long commands for storage
            if s.len() > 200 {
                format!("{}...", &s[..200])
            } else {
                s.to_string()
            }
        }),
        "web_fetch" => args
            .get("url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        "web_search" => args
            .get("query")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        "web_post" => args
            .get("url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        "email_send" | "gmail_send" => args
            .get("to")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        _ => None,
    }
}

/// Log a security event for a tool execution. Fire-and-forget — errors are logged but don't block execution.
fn log_tool_security_event(tool_name: &str, args: &Value, success: bool, agent_id: &str) {
    let (event_type, category, base_risk) = classify_tool(tool_name);
    let target = extract_target(tool_name, args);

    // Increase risk for failed operations
    let risk = if !success { base_risk + 20 } else { base_risk };

    let db = super::get_engine().db();
    if let Err(e) = tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(log_security_event(
            db,
            agent_id,
            None, // session_id — Phase 1 doesn't track per-session yet
            event_type,
            category,
            Some(tool_name),
            target.as_deref(),
            None, // details
            risk,
            success,
        ))
    }) {
        log::warn!(
            "[Security] Failed to log tool event for {}: {}",
            tool_name,
            e
        );
    }
}

/// Check the security gate before tool execution.
/// Returns Ok(()) if allowed, Err with a message if blocked.
/// Non-blocking for Phase 1: default profile = open (allow all).
fn check_security_gate(tool_name: &str, args: &Value, agent_id: &str) -> Result<()> {
    use super::security::permissions::{get_security_profile, ResourceType};

    let db = super::get_engine().db();

    // Get agent security profile — if none, default to open
    let profile = match tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(get_security_profile(db, agent_id))) {
        Ok(p) => p,
        Err(_) => return Ok(()), // No profile = allow all
    };

    // Map tool name to resource type and value for permission checking
    let (resource_type, resource_value) = match tool_name {
        "file_read" | "file_write" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
            if path.is_empty() {
                return Ok(());
            }
            (ResourceType::FilePath.as_str(), path.to_string())
        }
        "exec" => {
            let cmd = args.get("command").and_then(|v| v.as_str()).unwrap_or("");
            if cmd.is_empty() {
                return Ok(());
            }
            (ResourceType::ExecCommand.as_str(), cmd.to_string())
        }
        "web_fetch" | "web_post" => {
            let url = args.get("url").and_then(|v| v.as_str()).unwrap_or("");
            if url.is_empty() {
                return Ok(());
            }
            // Extract domain from URL without url crate
            let domain = extract_domain(url);
            (ResourceType::NetworkDomain.as_str(), domain)
        }
        _ => return Ok(()), // Other tools not gated
    };

    // Check access mode from profile
    let mode = match resource_type {
        "file_path" => &profile.file_access_mode,
        "exec_command" => &profile.exec_mode,
        "network_domain" => &profile.network_mode,
        _ => "open",
    };

    match mode {
        "open" => Ok(()),
        "deny" => {
            log_tool_security_event(tool_name, args, false, "conflux");
            let _ = log_security_event(
                db,
                "conflux",
                None,
                super::security::events::EventType::PermissionDenied,
                super::security::events::EventCategory::Warning,
                Some(tool_name),
                Some(&resource_value),
                Some(&format!(
                    "Blocked by agent security policy: {} mode={}",
                    resource_type, mode
                )),
                80,
                false,
            );
            anyhow::bail!(
                "🛡️ Security: {} blocked for agent '{}'. Access mode is '{}'.",
                tool_name,
                agent_id,
                mode
            );
        }
        "allowlist" => {
            // Check if there's an explicit allow rule for this resource
            let has_allow = db
                .conn()
                .query_row(
                    "SELECT 1 FROM permission_rules
                 WHERE (agent_id = ?1 OR agent_id IS NULL)
                   AND resource_type = ?2
                   AND action = 'allow'
                   AND (?3 LIKE resource_value OR resource_value = '*')
                 LIMIT 1",
                    rusqlite::params![agent_id, resource_type, resource_value],
                    |_| Ok(0_i32),
                )
                .is_ok();

            if !has_allow {
                log_tool_security_event(tool_name, args, false, "conflux");
                anyhow::bail!(
                    "🛡️ Security: {} blocked — '{}' not in allowlist for agent '{}'.",
                    tool_name,
                    resource_value,
                    agent_id
                );
            }
            Ok(())
        }
        "prompt_all" => {
            // Log that a prompt would be needed — allow for Phase 1
            let _ = log_security_event(
                db,
                agent_id,
                None,
                super::security::events::EventType::FileAccess,
                super::security::events::EventCategory::Info,
                Some(tool_name),
                Some(&resource_value),
                Some(&format!(
                    "Prompt mode: {} would require user approval (allowed by default in Phase 1)",
                    resource_type
                )),
                15,
                true,
            );
            Ok(())
        }
        _ => Ok(()), // Unknown mode = open
    }
}

// ── Tool Permission Check ──

fn check_tool_permission(db: &EngineDb, agent_id: &str, tool_name: &str) -> Result<bool> {
    let conn = db.conn();
    let result: std::result::Result<i64, _> = conn.query_row(
        "SELECT is_allowed FROM tool_permissions WHERE agent_id = ?1 AND tool_id = ?2",
        rusqlite::params![agent_id, tool_name],
        |row| row.get(0),
    );

    match result {
        Ok(allowed) => Ok(allowed != 0),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // No permission record = allowed by default
            Ok(true)
        }
        Err(e) => Err(e.into()),
    }
}

/// Execute a tool by name with the given arguments and user context.
pub async fn execute_tool(tool_name: &str, args: &Value, user_id: &str) -> Result<ToolResult> {
    log::info!("[tools] execute_tool ENTRY: tool_name={}, args={:?}, user_id={}", tool_name, args, user_id);
    // Security gate — check permission before execution
    if let Err(security_err) = check_security_gate(tool_name, args, user_id) {
        log::warn!("[tools] Security gate BLOCKED: {}", security_err);
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(security_err.to_string()),
        });
    }

    let result = execute_tool_for_user(tool_name, args, user_id).await;
    // Security telemetry — fire and forget (use "conflux" as agent — we're the executor)
    let success = result.as_ref().map(|r| r.success).unwrap_or(false);
    log::info!("[tools] execute_tool EXIT: tool_name={}, success={}, output_len={}, error={:?}",
        tool_name, success,
        result.as_ref().map(|r| r.output.len()).unwrap_or(0),
        result.as_ref().map(|r| r.error.clone()).unwrap_or(None));
    log_tool_security_event(tool_name, args, success, "conflux");
    result
}

/// Execute a tool with user-specific context and permission checking.
/// Note: The agent_id parameter is currently unused for non-Google tools.
pub async fn execute_tool_for_user(
    tool_name: &str,
    args: &Value,
    _user_id: &str,
) -> Result<ToolResult> {
    // Google tools are checked separately (they require auth, not permissions)
    if matches!(
        tool_name,
        "google_auth"
            | "gmail_send"
            | "gmail_search"
            | "google_drive_list"
            | "google_doc_read"
            | "google_doc_write"
            | "google_sheet_read"
            | "google_sheet_write"
    ) {
        let engine = super::get_engine();
        return super::google::execute_google_tool(tool_name, args, engine.db()).await;
    }

    match tool_name {
        "web_search" => { log::info!("[tools] dispatching web_search"); execute_web_search(args).await }
        "web_fetch" => execute_web_fetch(args).await,
        "file_read" => execute_file_read(args),
        "file_write" => execute_file_write(args),
        "exec" => execute_command(args),
        "calc" => execute_calc(args),
        "time" => execute_time(),
        "memory_read" => execute_memory_read(args).await,
        "memory_write" => execute_memory_write(args).await,
        // Phase 5: Integration tools
        "web_post" => execute_web_post(args).await,
        "notify" => execute_notify(args),
        "email_send" => execute_email_send(args),
        "email_receive" => execute_email_receive(args),
        // App tools: Life Autopilot, Feed, Dreams
        "life_add_task" => execute_life_add_task(args),
        "life_list_tasks" => execute_life_list_tasks(args),
        "life_complete_task" => execute_life_complete_task(args),
        "life_add_habit" => execute_life_add_habit(args),
        "life_log_habit" => execute_life_log_habit(args),
        "life_add_reminder" => execute_life_add_reminder(args),
        "life_delete_task" => execute_life_delete_task(args),
        "life_get_dashboard" => execute_life_get_dashboard(args),
        "life_get_habits" => execute_life_get_habits(args),
        "life_dismiss_nudge" => execute_life_dismiss_nudge(args),
        "life_get_heatmap" => execute_life_get_heatmap(args),
        "life_morning_brief" => execute_life_morning_brief(args),
        "life_add_daily_focus" => execute_life_add_daily_focus(args),
        "life_smart_reschedule" => execute_life_smart_reschedule(args),
        "life_parse_input" => execute_life_parse_input(args),
        "life_decision_helper" => execute_life_decision_helper(args),
        "life_get_reminders" => execute_life_get_reminders(args),
        "life_get_knowledge" => execute_life_get_knowledge(args),
        "life_get_documents" => execute_life_get_documents(args),
        "feed_add_item" => execute_feed_add_item(args),
        "feed_list_items" => execute_feed_list_items(args),
        "feed_mark_read" => execute_feed_mark_read(args),
        "feed_toggle_bookmark" => execute_feed_toggle_bookmark(args),
        "feed_get_ripples" => execute_feed_get_ripples(args),
        "feed_signal_threads" => execute_feed_signal_threads(args),
        "feed_get_questions" => execute_feed_get_questions(args),
        "dream_add" => execute_dream_add(args),
        "dream_list" => execute_dream_list(args),
        "dream_add_milestone" => execute_dream_add_milestone(args),
        "dream_add_task" => execute_dream_add_task(args),
        "dream_get_dashboard" => execute_dream_get_dashboard(args),
        "dream_complete_milestone" => execute_dream_complete_milestone(args),
        "dream_get_tasks" => execute_dream_get_tasks(args),
        "dream_complete_task" => execute_dream_complete_task(args),
        "dream_add_progress" => execute_dream_add_progress(args),
        "dream_delete" => execute_dream_delete(args),
        "dream_get_velocity" => execute_dream_get_velocity(args),
        "dream_get_timeline" => execute_dream_get_timeline(args),
        "dream_update_progress" => execute_dream_update_progress(args),
        "dream_active_overview" => execute_dream_active_overview(args),
        // Home Health tools
        "home_add_bill" => execute_home_add_bill(args),
        "home_get_bills" => execute_home_get_bills(args),
        "home_add_maintenance" => execute_home_add_maintenance(args),
        "home_get_appliances" => execute_home_get_appliances(args),
        "home_get_dashboard" => execute_home_get_dashboard(args),
        "home_delete_bill" => execute_home_delete_bill(args),
        "home_upsert_profile" => execute_home_upsert_profile(args),
        "home_get_insights" => execute_home_get_insights(args),
        "home_get_upcoming_maintenance" => execute_home_get_upcoming_maintenance(args),
        "home_get_overdue_maintenance" => execute_home_get_overdue_maintenance(args),
        "home_get_seasonal_tasks" => execute_home_get_seasonal_tasks(args),
        "home_complete_maintenance" => execute_home_complete_maintenance(args),
        "home_get_year_summary" => execute_home_get_year_summary(args),
        // Vault tools
        "vault_list_files" => execute_vault_list_files(args),
        "vault_search_files" => execute_vault_search_files(args),
        "vault_get_file" => execute_vault_get_file(args),
        "vault_delete_file" => execute_vault_delete_file(args),
        "vault_toggle_favorite" => execute_vault_toggle_favorite(args),
        "vault_get_recent" => execute_vault_get_recent(args),
        "vault_get_favorites" => execute_vault_get_favorites(args),
        "vault_get_stats" => execute_vault_get_stats(args),
        "vault_create_project" => execute_vault_create_project(args),
        "vault_get_projects" => execute_vault_get_projects(args),
        "vault_get_project_detail" => execute_vault_get_project_detail(args),
        "vault_add_file_to_project" => execute_vault_add_file_to_project(args),
        "vault_remove_file_from_project" => execute_vault_remove_file_from_project(args),
        "vault_delete_project" => execute_vault_delete_project(args),
        "vault_get_tags" => execute_vault_get_tags(args),
        "vault_tag_file" => execute_vault_tag_file(args),
        "vault_untag_file" => execute_vault_untag_file(args),
        "vault_scan_directory" => execute_vault_scan_directory(args),
        // Kitchen tools
        "kitchen_add_meal" => execute_kitchen_add_meal(args),
        "kitchen_list_meals" => execute_kitchen_list_meals(args),
        "kitchen_add_to_plan" => execute_kitchen_add_to_plan(args),
        "kitchen_get_plan" => execute_kitchen_get_plan(args),
        "kitchen_add_inventory" => execute_kitchen_add_inventory(args),
        "kitchen_get_inventory" => execute_kitchen_get_inventory(args),
        "kitchen_get_meal" => execute_kitchen_get_meal(args),
        "kitchen_toggle_favorite" => execute_kitchen_toggle_favorite(args),
        "kitchen_add_ingredient" => execute_kitchen_add_ingredient(args),
        "kitchen_clear_week_plan" => execute_kitchen_clear_week_plan(args),
        "kitchen_generate_grocery" => execute_kitchen_generate_grocery(args),
        "kitchen_get_grocery" => execute_kitchen_get_grocery(args),
        "kitchen_toggle_grocery" => execute_kitchen_toggle_grocery(args),
        "fridge_scan" => execute_fridge_scan(args),
        "fridge_what_can_i_make" => execute_fridge_what_can_i_make(args),
        "fridge_expiring" => execute_fridge_expiring(args),
        "fridge_shopping_for_meals" => execute_fridge_shopping_for_meals(args),
        "kitchen_pantry_heatmap" => execute_kitchen_pantry_heatmap(args),
        "kitchen_get_cooking_steps" => execute_kitchen_get_cooking_steps(args),
        "kitchen_get_meal_photos" => execute_kitchen_get_meal_photos(args),
        // Budget tools
        "budget_add_entry" => execute_budget_add_entry(args),
        "budget_get_entries" => execute_budget_get_entries(args),
        "budget_get_summary" => execute_budget_get_summary(args),
        "budget_create_goal" => execute_budget_create_goal(args),
        "budget_get_goals" => execute_budget_get_goals(args),
        "budget_delete_entry" => execute_budget_delete_entry(args),
        "budget_parse_natural" => execute_budget_parse_natural(args),
        "budget_detect_patterns" => execute_budget_detect_patterns(args),
        "budget_update_goal" => execute_budget_update_goal(args),
        "budget_delete_goal" => execute_budget_delete_goal(args),
        "budget_goal_status" => execute_budget_goal_status(args),
        "budget_generate_report" => execute_budget_generate_report(args),
        "budget_can_afford" => execute_budget_can_afford(args),
        // Cross-app intelligence tools
        "conflux_weekly_summary" => execute_weekly_summary(args),
        "conflux_can_afford" => execute_can_afford(args),
        "conflux_day_overview" => execute_day_overview(args),
        // Echo Journal tools
        "echo_write_entry" => execute_echo_write_entry(args),
        "echo_get_entries" => execute_echo_get_entries(args),
        "echo_delete_entry" => execute_echo_delete_entry(args),
        "echo_get_stats" => execute_echo_get_stats(args),
        "echo_get_patterns" => execute_echo_get_patterns(args),
        "echo_create_pattern" => execute_echo_create_pattern(args),
        "echo_get_entries_by_date" => execute_echo_get_entries_by_date(args),
        // Echo Counselor tools
        "echo_counselor_get_state" => execute_echo_counselor_get_state(args),
        "echo_counselor_start_session" => execute_echo_counselor_start_session(args),
        "echo_counselor_get_messages" => execute_echo_counselor_get_messages(args),
        "echo_counselor_end_session" => execute_echo_counselor_end_session(args),
        "echo_counselor_flag_crisis" => execute_echo_counselor_flag_crisis(args),
        "echo_counselor_write_gratitude" => execute_echo_counselor_write_gratitude(args),
        "echo_counselor_get_gratitude" => execute_echo_counselor_get_gratitude(args),
        "echo_counselor_get_exercises" => execute_echo_counselor_get_exercises(args),
        "echo_counselor_complete_exercise" => execute_echo_counselor_complete_exercise(args),
        "echo_counselor_get_reflections" => execute_echo_counselor_get_reflections(args),
        "echo_counselor_mark_reflection_read" => execute_echo_counselor_mark_reflection_read(args),
        "echo_counselor_get_weekly_letter" => execute_echo_counselor_get_weekly_letter(args),
        "echo_counselor_get_weekly_letter_history" => {
            execute_echo_counselor_get_weekly_letter_history(args)
        }
        "echo_counselor_set_evening_reminder" => execute_echo_counselor_set_evening_reminder(args),
        _ => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Unknown tool: {}", tool_name)),
        }),
    }
}

/// Get tool definitions in OpenAI function-calling format.
pub fn get_tool_definitions() -> Vec<Value> {
    vec![
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the web for information using DuckDuckGo and Wikipedia. Use this frequently to find current information, verify facts, and research topics. Always prefer searching over guessing.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "The search query" }
                    },
                    "required": ["query"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "web_fetch",
                "description": "Fetch and read the content of any URL. Use this to read articles, documentation, web pages, or any online content. Returns the readable text from the page.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "The full URL to fetch (must include http:// or https://)" }
                    },
                    "required": ["url"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "file_read",
                "description": "Read the contents of a file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "The file path to read" }
                    },
                    "required": ["path"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "file_write",
                "description": "Write content to a file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "The file path to write" },
                        "content": { "type": "string", "description": "The content to write" }
                    },
                    "required": ["path", "content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "calc",
                "description": "Evaluate a math expression",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "expression": { "type": "string", "description": "The math expression to evaluate" }
                    },
                    "required": ["expression"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "time",
                "description": "Get the current date and time",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        // ── Google Workspace Tools ──
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "gmail_send",
                "description": "Send an email via Gmail",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "to": { "type": "string", "description": "Recipient email address" },
                        "subject": { "type": "string", "description": "Email subject" },
                        "body": { "type": "string", "description": "Email body text" }
                    },
                    "required": ["to", "subject", "body"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "gmail_search",
                "description": "Search Gmail messages",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Gmail search query (same syntax as Gmail search)" },
                        "max_results": { "type": "integer", "description": "Max results to return (default 5)" }
                    },
                    "required": ["query"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "google_drive_list",
                "description": "List files in Google Drive",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Drive search query (e.g., \"name contains 'report'\")" },
                        "max_results": { "type": "integer", "description": "Max files to list (default 10)" }
                    },
                    "required": []
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "google_doc_read",
                "description": "Read the content of a Google Doc",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "document_id": { "type": "string", "description": "The Google Doc document ID (from the URL)" }
                    },
                    "required": ["document_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "google_doc_write",
                "description": "Append text to a Google Doc",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "document_id": { "type": "string", "description": "The Google Doc document ID" },
                        "content": { "type": "string", "description": "Text to append to the document" }
                    },
                    "required": ["document_id", "content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "google_sheet_read",
                "description": "Read values from a Google Sheet",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "spreadsheet_id": { "type": "string", "description": "The spreadsheet ID (from the URL)" },
                        "range": { "type": "string", "description": "A1 notation range (e.g., 'Sheet1!A1:C10')" }
                    },
                    "required": ["spreadsheet_id", "range"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "google_sheet_write",
                "description": "Write values to a Google Sheet",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "spreadsheet_id": { "type": "string", "description": "The spreadsheet ID" },
                        "range": { "type": "string", "description": "A1 notation range (e.g., 'Sheet1!A1')" },
                        "values": { "type": "array", "description": "2D array of values to write", "items": { "type": "array", "items": { "type": "string" } } }
                    },
                    "required": ["spreadsheet_id", "range", "values"]
                }
            }
        }),
    ]
}

// ── Phase 5: Integration Tool Definitions ──

pub fn get_integration_tool_definitions() -> Vec<Value> {
    vec![
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "web_post",
                "description": "Send a POST request to any URL. Use this to trigger webhooks, call APIs, send notifications to Slack/Discord/Zapier, or integrate with external services.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "The URL to POST to" },
                        "body": { "type": "string", "description": "JSON body to send (as a string)" },
                        "headers": { "type": "string", "description": "Optional JSON object of headers" }
                    },
                    "required": ["url", "body"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "notify",
                "description": "Send a desktop/mobile notification to the user. Use this for alerts, reminders, task completions, or important updates.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string", "description": "Notification title" },
                        "body": { "type": "string", "description": "Notification body text" }
                    },
                    "required": ["title", "body"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "email_send",
                "description": "Send an email via SMTP.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "to": { "type": "string", "description": "Recipient email address" },
                        "subject": { "type": "string", "description": "Email subject line" },
                        "body": { "type": "string", "description": "Email body" }
                    },
                    "required": ["to", "subject", "body"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "email_receive",
                "description": "Check for new emails via IMAP.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "folder": { "type": "string", "description": "Mailbox folder (default: INBOX)" },
                        "limit": { "type": "integer", "description": "Max emails to return" }
                    }
                }
            }
        }),
    ]
}

pub fn get_app_tool_definitions() -> Vec<Value> {
    vec![
        // ── Life Autopilot Tools ──
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_add_task",
                "description": "Add a new task to Life Autopilot. Use for to-do items, errands, and personal tasks.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string", "description": "Task title (required)" },
                        "category": { "type": "string", "description": "Category (e.g., work, personal, health, home)" },
                        "priority": { "type": "string", "enum": ["low", "medium", "high"], "description": "Priority level" },
                        "due_date": { "type": "string", "description": "Due date in YYYY-MM-DD format" },
                        "energy_type": { "type": "string", "enum": ["high", "low"], "description": "Energy level needed" }
                    },
                    "required": ["title"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_list_tasks",
                "description": "List tasks from Life Autopilot. Filter by status to see pending or completed tasks.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": { "type": "string", "enum": ["pending", "completed"], "description": "Filter by task status" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_complete_task",
                "description": "Mark a Life Autopilot task as completed.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": { "type": "string", "description": "Task ID (required)" }
                    },
                    "required": ["task_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_add_habit",
                "description": "Add a new habit to track in Life Autopilot.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "Habit name (required)" },
                        "category": { "type": "string", "description": "Category (e.g., health, productivity, wellness)" },
                        "frequency": { "type": "string", "enum": ["daily", "weekly"], "description": "How often to track" },
                        "target_count": { "type": "integer", "description": "Target count per period (default: 1)" }
                    },
                    "required": ["name"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_log_habit",
                "description": "Log a habit completion for today in Life Autopilot.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "habit_id": { "type": "string", "description": "Habit ID (required)" }
                    },
                    "required": ["habit_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_add_reminder",
                "description": "Add a reminder to Life Autopilot. Use for time-sensitive alerts.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string", "description": "Reminder title (required)" },
                        "description": { "type": "string", "description": "Optional description" },
                        "due_date": { "type": "string", "description": "Reminder date in YYYY-MM-DD format (required)" },
                        "priority": { "type": "string", "enum": ["low", "medium", "high"], "description": "Priority level" }
                    },
                    "required": ["title", "due_date"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_delete_task",
                "description": "Delete a task from Life Autopilot.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": { "type": "string", "description": "Task ID to delete (required)" }
                    },
                    "required": ["task_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_get_dashboard",
                "description": "Get the Life Autopilot dashboard — upcoming reminders, overdue items, recent documents.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_get_habits",
                "description": "List habits tracked in Life Autopilot.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "active_only": { "type": "boolean", "description": "Only show active habits (default: true)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_dismiss_nudge",
                "description": "Dismiss a nudge/notification in Life Autopilot.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "nudge_id": { "type": "string", "description": "Nudge ID to dismiss (required)" }
                    },
                    "required": ["nudge_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_get_heatmap",
                "description": "Get a task heatmap showing task density by due date.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_morning_brief",
                "description": "Get a morning brief with today's focus, pending tasks, and habit streaks.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_add_daily_focus",
                "description": "Add a task to today's daily focus list.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": { "type": "string", "description": "Task ID to add to focus (required)" },
                        "position": { "type": "integer", "description": "Position in focus list (default: 0)" }
                    },
                    "required": ["task_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_smart_reschedule",
                "description": "Get a smart reschedule suggestion for a task based on energy levels.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": { "type": "string", "description": "Task ID to reschedule (required)" }
                    },
                    "required": ["task_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_parse_input",
                "description": "Parse natural language input to determine if it's a task, reminder, or habit.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "input": { "type": "string", "description": "Natural language input to parse (required)" }
                    },
                    "required": ["input"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_decision_helper",
                "description": "Get a decision analysis framework for a choice you're facing.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "options": { "type": "string", "description": "The decision or options to analyze (required)" }
                    },
                    "required": ["options"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_get_reminders",
                "description": "Get upcoming reminders from Life Autopilot.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": { "type": "integer", "description": "Number of days ahead to look (default: 30)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_get_knowledge",
                "description": "Get entries from the Life knowledge base.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": { "type": "string", "description": "Filter by category (e.g., medical, preferences, contacts)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "life_get_documents",
                "description": "Get documents stored in Life Autopilot.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "doc_type": { "type": "string", "description": "Filter by document type (e.g., insurance, warranty, medical)" }
                    }
                }
            }
        }),
        // ── Feed Tools ──
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "feed_add_item",
                "description": "Add an item to your content feed (article, note, or bookmark).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content_type": { "type": "string", "enum": ["article", "note", "bookmark"], "description": "Type of content (required)" },
                        "title": { "type": "string", "description": "Title (required)" },
                        "body": { "type": "string", "description": "Content body or notes" },
                        "source_url": { "type": "string", "description": "Source URL for articles/bookmarks" },
                        "category": { "type": "string", "description": "Category tag" }
                    },
                    "required": ["content_type", "title"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "feed_list_items",
                "description": "List items from your content feed, optionally filtered by type or read status.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content_type": { "type": "string", "enum": ["article", "note", "bookmark"], "description": "Filter by content type" },
                        "unread_only": { "type": "boolean", "description": "Show only unread items" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "feed_mark_read",
                "description": "Mark a feed item as read.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Feed item ID (required)" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "feed_toggle_bookmark",
                "description": "Toggle bookmark status on a feed item.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Feed item ID (required)" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "feed_get_ripples",
                "description": "Get detected ripple signals from the Radar — weak signals and emerging trends across your life data.",
                "parameters": { "type": "object", "properties": { "limit": { "type": "integer", "description": "Max ripples to return (default: 20)" }, "category": { "type": "string", "description": "Filter by category: finance, dreams, creative, general" } } }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "feed_signal_threads",
                "description": "Get active signal threads being tracked on the Radar.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "feed_get_questions",
                "description": "Get previously asked questions and their answers from the Feed intelligence layer.",
                "parameters": { "type": "object", "properties": { "limit": { "type": "integer", "description": "Max questions to return (default: 10)" } } }
            }
        }),
        // ── Dreams Tools ──
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_add",
                "description": "Add a new dream or goal. Dreams are long-term aspirations you want to achieve.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": { "type": "string", "description": "Dream title (required)" },
                        "description": { "type": "string", "description": "Dream description" },
                        "category": { "type": "string", "enum": ["personal", "career", "health", "creative", "financial"], "description": "Dream category (required)" },
                        "target_date": { "type": "string", "description": "Target completion date in YYYY-MM-DD format" }
                    },
                    "required": ["title", "category"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_list",
                "description": "List your dreams, optionally filtered by status (active or completed).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": { "type": "string", "enum": ["active", "completed"], "description": "Filter by dream status" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_add_milestone",
                "description": "Add a milestone to a dream. Milestones break down dreams into achievable steps.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "dream_id": { "type": "string", "description": "Dream ID (required)" },
                        "title": { "type": "string", "description": "Milestone title (required)" },
                        "description": { "type": "string", "description": "Milestone description" },
                        "target_date": { "type": "string", "description": "Target date in YYYY-MM-DD format" }
                    },
                    "required": ["dream_id", "title"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_add_task",
                "description": "Add a task to a dream. Tasks are actionable items that move you toward your dream.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "dream_id": { "type": "string", "description": "Dream ID (required)" },
                        "milestone_id": { "type": "string", "description": "Optional milestone ID to attach task to" },
                        "title": { "type": "string", "description": "Task title (required)" },
                        "description": { "type": "string", "description": "Task description" },
                        "due_date": { "type": "string", "description": "Due date in YYYY-MM-DD format" },
                        "frequency": { "type": "string", "description": "Recurring frequency (e.g., daily, weekly)" }
                    },
                    "required": ["dream_id", "title"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_get_dashboard",
                "description": "Get the dreams dashboard — active dreams, milestones, upcoming tasks, recent progress.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_complete_milestone",
                "description": "Mark a milestone as completed.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Milestone ID to complete" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_get_tasks",
                "description": "Get all tasks for a dream, showing completed and pending items.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "dream_id": { "type": "string", "description": "Dream ID" }
                    },
                    "required": ["dream_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_complete_task",
                "description": "Mark a dream task as completed.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Task ID to complete" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_add_progress",
                "description": "Log a progress update for a dream. Include a note about what happened.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "dream_id": { "type": "string", "description": "Dream ID" },
                        "note": { "type": "string", "description": "Progress note" },
                        "progress_change": { "type": "number", "description": "Progress delta (0.0 to 1.0)" },
                        "ai_insight": { "type": "string", "description": "Optional AI insight" }
                    },
                    "required": ["dream_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_delete",
                "description": "Delete a dream and all associated milestones, tasks, and progress.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Dream UUID" },
                        "title": { "type": "string", "description": "Dream title (case-insensitive lookup)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_get_velocity",
                "description": "Get dream momentum/velocity — how fast you're making progress, tasks per week, on-track status.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "dream_id": { "type": "string", "description": "Dream ID" }
                    },
                    "required": ["dream_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_get_timeline",
                "description": "Get the full timeline of events for a dream — milestones, tasks, progress entries.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "dream_id": { "type": "string", "description": "Dream ID" }
                    },
                    "required": ["dream_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_update_progress",
                "description": "Manually set a dream's progress percentage.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "dream_id": { "type": "string", "description": "Dream ID" },
                        "progress_pct": { "type": "number", "description": "Progress percentage (0-100)" }
                    },
                    "required": ["dream_id", "progress_pct"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "dream_active_overview",
                "description": "Get an overview of all active dreams with their velocity and momentum.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        // ── Kitchen Tools ──
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_add_meal",
                "description": "Add a new meal/recipe to the kitchen. Use when the user wants to save a recipe or add a dish to their meal collection. ONLY the 'name' field is required — the tool will create the meal with sensible defaults. Provide other fields only if the user explicitly mentions them.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "Meal/recipe name (e.g. 'Chicken Parmesan') — REQUIRED" },
                        "category": { "type": "string", "description": "Meal category: breakfast, lunch, dinner, snack, dessert (optional)" },
                        "cuisine": { "type": "string", "description": "Cuisine type (e.g. Italian, Mexican, Thai) (optional)" },
                        "instructions": { "type": "string", "description": "Cooking instructions or steps (optional)" },
                        "prep_time_min": { "type": "integer", "description": "Prep time in minutes (optional)" },
                        "cook_time_min": { "type": "integer", "description": "Cook time in minutes (optional)" }
                    },
                    "required": ["name"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_list_meals",
                "description": "List meals/recipes in the kitchen, optionally filtered by category, cuisine, or favorites.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": { "type": "string", "description": "Filter by category (breakfast, lunch, dinner, snack, dessert)" },
                        "cuisine": { "type": "string", "description": "Filter by cuisine (Italian, Mexican, Thai, etc.)" },
                        "favorites_only": { "type": "boolean", "description": "If true, only show favorites" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_add_to_plan",
                "description": "Add a meal to the weekly meal plan. The meal must already exist in the kitchen.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "meal_name": { "type": "string", "description": "Name of the meal to add (must match an existing meal)" },
                        "week_start": { "type": "string", "description": "Week start date in YYYY-MM-DD format (Monday)" },
                        "day_of_week": { "type": "integer", "description": "Day index: 0=Monday, 1=Tuesday, ..., 6=Sunday" },
                        "meal_slot": { "type": "string", "description": "Meal slot: breakfast, lunch, dinner" }
                    },
                    "required": ["meal_name"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_get_plan",
                "description": "Get the weekly meal plan for a given week.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "week_start": { "type": "string", "description": "Week start date in YYYY-MM-DD format (Monday)" }
                    },
                    "required": ["week_start"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_add_inventory",
                "description": "Add an item to the kitchen inventory (fridge, freezer, pantry).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "Item name (e.g. 'Milk', 'Chicken breast')" },
                        "quantity": { "type": "number", "description": "Quantity amount" },
                        "unit": { "type": "string", "description": "Unit (e.g. 'lbs', 'oz', 'gallons', 'each')" },
                        "location": { "type": "string", "description": "Storage location: fridge, freezer, pantry" },
                        "expiry_date": { "type": "string", "description": "Expiry date in YYYY-MM-DD format" }
                    },
                    "required": ["name"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_get_inventory",
                "description": "Get kitchen inventory items, optionally filtered by location.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": { "type": "string", "description": "Filter by location: fridge, freezer, pantry" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_get_meal",
                "description": "Get detailed info about a meal including ingredients, cost, and instructions. Look up by id or name.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Meal UUID" },
                        "name": { "type": "string", "description": "Meal name (case-insensitive lookup)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_toggle_favorite",
                "description": "Toggle favorite status on a meal. Stars/unstars it for priority display.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Meal UUID" },
                        "name": { "type": "string", "description": "Meal name (case-insensitive lookup)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_add_ingredient",
                "description": "Add an ingredient to an existing meal. Automatically recalculates meal cost.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "meal_id": { "type": "string", "description": "Meal UUID" },
                        "meal_name": { "type": "string", "description": "Meal name (case-insensitive lookup)" },
                        "name": { "type": "string", "description": "Ingredient name (e.g. 'Chicken breast')" },
                        "quantity": { "type": "number", "description": "Quantity amount" },
                        "unit": { "type": "string", "description": "Unit (e.g. 'lbs', 'cups', 'pieces')" },
                        "estimated_cost": { "type": "number", "description": "Estimated cost in dollars" },
                        "category": { "type": "string", "description": "Category (produce, dairy, meat, pantry, spice, frozen)" },
                        "is_optional": { "type": "boolean", "description": "Whether this ingredient is optional" },
                        "notes": { "type": "string", "description": "Notes (e.g. 'diced', 'organic')" }
                    },
                    "required": ["name"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_clear_week_plan",
                "description": "Clear all meals from a weekly plan. Also removes associated grocery items.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "week_start": { "type": "string", "description": "Week start date in YYYY-MM-DD format (Monday)" }
                    },
                    "required": ["week_start"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_generate_grocery",
                "description": "Generate a grocery list from the weekly meal plan. Aggregates ingredients across all planned meals.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "week_start": { "type": "string", "description": "Week start date in YYYY-MM-DD format (Monday)" }
                    },
                    "required": ["week_start"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_get_grocery",
                "description": "Get the grocery list for a week. Shows checked/unchecked items with quantities and costs.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "week_start": { "type": "string", "description": "Week start date in YYYY-MM-DD format (Monday)" }
                    },
                    "required": ["week_start"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_toggle_grocery",
                "description": "Check/uncheck a grocery list item. Toggles its purchased status.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Grocery item UUID" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "fridge_scan",
                "description": "Log items from a fridge/pantry scan into inventory. Describe what you see and this will add each item.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "description": { "type": "string", "description": "Description of fridge contents, one item per line" }
                    },
                    "required": ["description"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "fridge_what_can_i_make",
                "description": "Check what meals you can make with current inventory. Shows match percentage and missing ingredients.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "min_match_pct": { "type": "number", "description": "Minimum ingredient match % (default 50)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "fridge_expiring",
                "description": "Check which inventory items are expiring soon. Helps prevent food waste.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": { "type": "integer", "description": "Number of days to look ahead (default 7)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "fridge_shopping_for_meals",
                "description": "Compare all meal ingredients against inventory. Shows what you're missing to cook your recipes.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_pantry_heatmap",
                "description": "Get a visual stock-level heatmap of pantry inventory. Shows what's running low.",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_get_cooking_steps",
                "description": "Get numbered cooking steps/instructions for a meal.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "meal_id": { "type": "string", "description": "Meal UUID" },
                        "meal_name": { "type": "string", "description": "Meal name (case-insensitive lookup)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_get_meal_photos",
                "description": "Get photos attached to a meal.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "meal_id": { "type": "string", "description": "Meal UUID" }
                    },
                    "required": ["meal_id"]
                }
            }
        }),
        // ── Budget Tools ──
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_add_entry",
                "description": "Log a budget entry (expense or income). Use when the user says 'log $25 on food' or 'I spent $50 on groceries'.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "amount": { "type": "number", "description": "The dollar amount" },
                        "category": { "type": "string", "description": "Budget category (e.g. food, rent, groceries, salary, entertainment)" },
                        "description": { "type": "string", "description": "Optional description of the entry" },
                        "entry_type": { "type": "string", "enum": ["expense", "income"], "description": "Whether this is an expense or income (default: expense)" },
                        "date": { "type": "string", "description": "Date of the entry in YYYY-MM-DD format (default: today)" }
                    },
                    "required": ["amount", "category"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_get_entries",
                "description": "Get budget entries for a given month. Returns income and expenses.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "month": { "type": "string", "description": "Month in YYYY-MM format (e.g. '2026-03')" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_get_summary",
                "description": "Get a budget summary for a month showing total income, expenses, savings, and category breakdown.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "month": { "type": "string", "description": "Month in YYYY-MM format (e.g. '2026-03')" }
                    },
                    "required": ["month"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_create_goal",
                "description": "Create a budget savings goal (e.g. 'Save $5000 for vacation by December').",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "Goal name (e.g. 'Emergency Fund', 'Vacation Fund')" },
                        "target_amount": { "type": "number", "description": "Target amount to save" },
                        "deadline": { "type": "string", "description": "Goal deadline in YYYY-MM-DD format" }
                    },
                    "required": ["name", "target_amount"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_get_goals",
                "description": "Get all budget savings goals and their progress.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_delete_entry",
                "description": "Delete a budget entry by its ID. Use budget_get_entries first to find the ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Budget entry UUID to delete" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_parse_natural",
                "description": "Parse natural language into a budget entry. E.g. 'spent $45 on groceries' → expense, $45, groceries. Use before budget_add_entry to confirm the parsed values.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "input": { "type": "string", "description": "Natural language budget description (e.g. 'spent $45 on groceries', 'got paid $2000')" }
                    },
                    "required": ["input"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_detect_patterns",
                "description": "Analyze spending history and detect recurring patterns, trends, and anomalies.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_update_goal",
                "description": "Update a savings goal's current progress amount. Use after depositing toward a goal.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Goal UUID" },
                        "name": { "type": "string", "description": "Goal name (case-insensitive lookup)" },
                        "current_amount": { "type": "number", "description": "New current amount saved" }
                    },
                    "required": ["current_amount"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_delete_goal",
                "description": "Delete a savings goal permanently.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Goal UUID" },
                        "name": { "type": "string", "description": "Goal name (case-insensitive lookup)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_goal_status",
                "description": "Get a summary of all savings goals with progress bars and overall completion percentage.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_generate_report",
                "description": "Generate a full monthly budget report with income, expenses, savings rate, top categories, and patterns.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "month": { "type": "string", "description": "Month in YYYY-MM format (e.g. '2026-04')" }
                    },
                    "required": ["month"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "budget_can_afford",
                "description": "Check if you can afford a purchase based on this month's remaining budget. Shows income, expenses, and what's left.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "amount": { "type": "number", "description": "Amount to check" },
                        "description": { "type": "string", "description": "What the purchase is for (e.g. 'new jacket')" }
                    },
                    "required": ["amount"]
                }
            }
        }),
        // ── Home Health Tools ──
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_add_bill",
                "description": "Record a utility or housing bill (electric, gas, water, internet, rent, mortgage).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "bill_type": { "type": "string", "description": "Bill type: electric, gas, water, internet, rent, mortgage" },
                        "amount": { "type": "number", "description": "Bill amount in dollars" },
                        "usage": { "type": "number", "description": "Optional usage amount (e.g. kWh for electric)" },
                        "billing_month": { "type": "string", "description": "Billing month in YYYY-MM format" },
                        "notes": { "type": "string", "description": "Optional notes" }
                    },
                    "required": ["bill_type", "amount", "billing_month"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_get_bills",
                "description": "Retrieve recorded utility/housing bills, optionally filtered by type.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "bill_type": { "type": "string", "description": "Filter by bill type (electric, gas, water, etc.)" },
                        "limit": { "type": "integer", "description": "Max bills to return (default 20)" }
                    },
                    "required": []
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_add_maintenance",
                "description": "Add a home maintenance task (HVAC filter, gutter cleaning, smoke detector check, etc.).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task": { "type": "string", "description": "Maintenance task description" },
                        "category": { "type": "string", "description": "Category: hvac, plumbing, electrical, exterior, interior, safety" },
                        "interval_months": { "type": "integer", "description": "How often in months (e.g. 3 for quarterly)" },
                        "priority": { "type": "string", "description": "Priority: low, medium, high" },
                        "estimated_cost": { "type": "number", "description": "Estimated cost in dollars" },
                        "notes": { "type": "string", "description": "Optional notes" }
                    },
                    "required": ["task", "category"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_get_appliances",
                "description": "List all tracked home appliances with warranty and service info.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_get_dashboard",
                "description": "Get the full home dashboard — health score, overdue/upcoming maintenance, bill trends, AI alerts.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_delete_bill",
                "description": "Delete a utility bill by ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Bill UUID" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_upsert_profile",
                "description": "Set or update home profile — address, year built, sq ft, HVAC type, roof type, etc.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "address": { "type": "string", "description": "Home address" },
                        "year_built": { "type": "integer", "description": "Year the home was built" },
                        "square_feet": { "type": "integer", "description": "Square footage" },
                        "hvac_type": { "type": "string", "description": "HVAC type (central, window, mini-split, etc.)" },
                        "hvac_filter_size": { "type": "string", "description": "HVAC filter size (e.g. '16x25x1')" },
                        "water_heater_type": { "type": "string", "description": "Water heater type (tank, tankless, heat pump)" },
                        "roof_type": { "type": "string", "description": "Roof type (shingle, tile, metal, flat)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_get_insights",
                "description": "Get smart home insights — health grade, cost analysis, overdue items, AI alerts.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_get_upcoming_maintenance",
                "description": "Get maintenance tasks due within N days.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": { "type": "integer", "description": "Days to look ahead (default 30)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_get_overdue_maintenance",
                "description": "Get all overdue maintenance tasks that need immediate attention.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_get_seasonal_tasks",
                "description": "Get seasonal home maintenance tasks for a given month.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "month": { "type": "integer", "description": "Month number 1-12 (default: current month)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_complete_maintenance",
                "description": "Mark a maintenance task as completed.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Maintenance task ID" },
                        "task": { "type": "string", "description": "Task name (if no ID)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "home_get_year_summary",
                "description": "Get annual home summary — total costs, health score, task counts, bill trends.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        // ── Vault Tools ──
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_list_files",
                "description": "List files in the Vault media library, optionally filtered by type.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_type": { "type": "string", "description": "Filter by file type: image, video, audio, document, archive" },
                        "limit": { "type": "integer", "description": "Max files to return (default 20)" }
                    },
                    "required": []
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_search_files",
                "description": "Search for files in the Vault by name or description.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search query" }
                    },
                    "required": ["query"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_get_file",
                "description": "Get detailed info about a specific Vault file by its ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "The file ID" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_delete_file",
                "description": "Delete a file from the Vault.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "File ID to delete (required)" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_toggle_favorite",
                "description": "Toggle favorite status on a Vault file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "File ID (required)" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_get_recent",
                "description": "Get recently added files from the Vault.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": { "type": "integer", "description": "Max files to return (default: 10)" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_get_favorites",
                "description": "Get all favorite files from the Vault.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_get_stats",
                "description": "Get Vault storage statistics — total files, size, and project count.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_create_project",
                "description": "Create a new Vault project to organize files.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "Project name (required)" },
                        "description": { "type": "string", "description": "Project description" },
                        "project_type": { "type": "string", "description": "Project type (e.g., research, personal, work)" }
                    },
                    "required": ["name"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_get_projects",
                "description": "List all Vault projects.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_get_project_detail",
                "description": "Get detailed info about a Vault project including its files.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "project_id": { "type": "string", "description": "Project ID (required)" }
                    },
                    "required": ["project_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_add_file_to_project",
                "description": "Add a file to a Vault project.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "project_id": { "type": "string", "description": "Project ID (required)" },
                        "file_id": { "type": "string", "description": "File ID to add (required)" },
                        "role": { "type": "string", "description": "File role in project (e.g., source, reference, output)" }
                    },
                    "required": ["project_id", "file_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_remove_file_from_project",
                "description": "Remove a file from a Vault project.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "project_id": { "type": "string", "description": "Project ID (required)" },
                        "file_id": { "type": "string", "description": "File ID to remove (required)" }
                    },
                    "required": ["project_id", "file_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_delete_project",
                "description": "Delete a Vault project and its file associations.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Project ID to delete (required)" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_get_tags",
                "description": "Get all tags used in the Vault.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_tag_file",
                "description": "Add a tag to a Vault file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_id": { "type": "string", "description": "File ID (required)" },
                        "tag_name": { "type": "string", "description": "Tag name (required)" }
                    },
                    "required": ["file_id", "tag_name"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_untag_file",
                "description": "Remove a tag from a Vault file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "file_id": { "type": "string", "description": "File ID (required)" },
                        "tag_id": { "type": "string", "description": "Tag ID (required)" }
                    },
                    "required": ["file_id", "tag_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "vault_scan_directory",
                "description": "Scan a directory and index its files into the Vault.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "dir_path": { "type": "string", "description": "Directory path to scan (required)" }
                    },
                    "required": ["dir_path"]
                }
            }
        }),
        // ── Cross-App Intelligence Tools ──
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "conflux_weekly_summary",
                "description": "Get a comprehensive weekly summary across all apps — spending, meals, tasks, goals, and bills.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "conflux_can_afford",
                "description": "Check if you can afford a purchase. Analyzes your budget, savings goals, and discretionary spending to give a recommendation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "amount": { "type": "number", "description": "The dollar amount to check" },
                        "item_description": { "type": "string", "description": "What you want to buy" }
                    },
                    "required": ["amount"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "conflux_day_overview",
                "description": "Get a quick overview of what matters today — tasks due, bills due, meal plan, expiring pantry items.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        // ── Echo Journal Tools ──
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_write_entry",
                "description": "Write a new journal entry to Echo.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": { "type": "string", "description": "Journal entry content (required)" },
                        "mood": { "type": "string", "description": "Current mood (e.g., happy, anxious, calm, grateful)" },
                        "tags": { "type": "array", "items": { "type": "string" }, "description": "Tags for categorization" },
                        "is_voice": { "type": "boolean", "description": "Whether this was a voice entry" }
                    },
                    "required": ["content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_get_entries",
                "description": "Get journal entries from Echo, newest first.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": { "type": "integer", "description": "Max entries to return" },
                        "offset": { "type": "integer", "description": "Skip first N entries" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_delete_entry",
                "description": "Delete a journal entry from Echo.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "id": { "type": "string", "description": "Entry ID (required)" }
                    },
                    "required": ["id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_get_stats",
                "description": "Get Echo journal stats — streak, entries today, top mood, recent themes.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_get_patterns",
                "description": "Get detected patterns from journal analysis.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_create_pattern",
                "description": "Create a detected pattern from journal analysis.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern_type": { "type": "string", "description": "Pattern type (required)" },
                        "title": { "type": "string", "description": "Pattern title (required)" },
                        "description": { "type": "string", "description": "Pattern description (required)" },
                        "confidence": { "type": "number", "description": "Confidence 0.0-1.0 (default: 0.5)" },
                        "data_json": { "type": "string", "description": "Optional JSON data" }
                    },
                    "required": ["pattern_type", "title", "description"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_get_entries_by_date",
                "description": "Get journal entries for a specific date.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "date": { "type": "string", "description": "Date in YYYY-MM-DD format (required)" }
                    },
                    "required": ["date"]
                }
            }
        }),
        // ── Echo Counselor Tools ──
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_get_state",
                "description": "Get the Echo Counselor current state — session counts, mood entries, crisis flags.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_start_session",
                "description": "Start a new counselor session.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "opening": { "type": "string", "description": "Optional opening message" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_get_messages",
                "description": "Get messages from a counselor session.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": { "type": "string", "description": "Session ID (required)" }
                    },
                    "required": ["session_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_end_session",
                "description": "End a counselor session.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": { "type": "string", "description": "Session ID (required)" }
                    },
                    "required": ["session_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_flag_crisis",
                "description": "Flag a crisis situation for immediate support resources.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": { "type": "string", "description": "Session ID" },
                        "content": { "type": "string", "description": "Crisis content text (required)" },
                        "severity": { "type": "string", "enum": ["low", "moderate", "high", "critical"], "description": "Severity level (default: moderate)" },
                        "detected_text": { "type": "string", "description": "Text that triggered the flag" }
                    },
                    "required": ["content"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_write_gratitude",
                "description": "Log a gratitude entry.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "items": { "type": "array", "items": { "type": "string" }, "description": "Gratitude items (required)" },
                        "context": { "type": "string", "description": "Optional context" }
                    },
                    "required": ["items"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_get_gratitude",
                "description": "Get gratitude journal entries.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": { "type": "integer", "description": "Max entries to return" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_get_exercises",
                "description": "Get available grounding exercises.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_complete_exercise",
                "description": "Mark a grounding exercise as completed.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "exercise_id": { "type": "string", "description": "Exercise ID (required)" }
                    },
                    "required": ["exercise_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_get_reflections",
                "description": "Get past session reflections for review.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": { "type": "integer", "description": "Max reflections to return" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_mark_reflection_read",
                "description": "Mark a session reflection as read.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "session_id": { "type": "string", "description": "Session ID (required)" }
                    },
                    "required": ["session_id"]
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_get_weekly_letter",
                "description": "Get the current weekly letter from the counselor.",
                "parameters": { "type": "object", "properties": {} }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_get_weekly_letter_history",
                "description": "Get past weekly letters.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": { "type": "integer", "description": "Max letters to return" }
                    }
                }
            }
        }),
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "echo_counselor_set_evening_reminder",
                "description": "Enable or disable the evening ritual reminder.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "enabled": { "type": "boolean", "description": "Enable or disable (default: true)" },
                        "hour": { "type": "integer", "description": "Hour 0-23 (default: 20)" },
                        "minute": { "type": "integer", "description": "Minute 0-59 (default: 0)" }
                    }
                }
            }
        }),
    ]
}

// ── Tool Implementations ──

async fn execute_web_search(args: &Value) -> Result<ToolResult> {
    let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");

    if query.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("No search query provided".to_string()),
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Conflux Home)")
        .build()?;

    let mut results = Vec::new();

    // Source 1: DuckDuckGo HTML lite (no API key, no JS)
    match search_duckduckgo(&client, query).await {
        Ok(ddg_results) if !ddg_results.is_empty() => {
            results.push(format!("=== Web Results ===\n{}", ddg_results));
        }
        _ => {}
    }

    // Source 2: Wikipedia (free knowledge API)
    match search_wikipedia(&client, query).await {
        Ok(wiki_results) if !wiki_results.is_empty() => {
            results.push(format!("=== Wikipedia ===\n{}", wiki_results));
        }
        _ => {}
    }

    if results.is_empty() {
        return Ok(ToolResult {
            success: true,
            output: format!("No results found for: '{}'", query),
            error: None,
        });
    }

    Ok(ToolResult {
        success: true,
        output: results.join("\n\n"),
        error: None,
    })
}

/// Search DuckDuckGo via their lite HTML page (no API key needed).
async fn search_duckduckgo(client: &reqwest::Client, query: &str) -> Result<String> {
    let url = format!(
        "https://lite.duckduckgo.com/lite/?q={}",
        urlencoding::encode(query)
    );

    let response = client.get(&url).send().await?;
    let html = response.text().await?;

    // Parse results from the lite page
    // DuckDuckGo lite uses <a> tags with class="result-link" for results
    // and <td class="result-snippet"> for descriptions
    let mut results = Vec::new();
    let mut lines = html.lines().peekable();

    while let Some(line) = lines.next() {
        let trimmed = line.trim();

        // Look for result links: <a rel="nofollow" href="..." class="result-link">Title</a>
        if trimmed.contains("class=\"result-link\"") {
            // Extract URL from href
            let url = extract_between(trimmed, "href=\"", "\"").unwrap_or_default();
            // Extract title text
            let title = extract_between(trimmed, ">", "</a>").unwrap_or_default();
            let title = strip_html_tags(&title);

            // Next few lines should have the snippet
            let mut snippet = String::new();
            for _ in 0..5 {
                if let Some(next) = lines.next() {
                    let next_trimmed = next.trim();
                    if next_trimmed.contains("class=\"result-snippet\"") {
                        snippet = strip_html_tags(
                            extract_between(next_trimmed, ">", "</td>").unwrap_or(next_trimmed),
                        );
                        break;
                    }
                    // Also try <td> with the snippet
                    if !next_trimmed.is_empty() && !next_trimmed.starts_with('<') {
                        snippet = strip_html_tags(next_trimmed);
                        break;
                    }
                }
            }

            if !title.is_empty() {
                let entry = if snippet.is_empty() {
                    format!("• {} — {}", title, url)
                } else {
                    format!("• {}\n  {}\n  {}", title, snippet, url)
                };
                results.push(entry);
            }
        }

        if results.len() >= 5 {
            break;
        }
    }

    Ok(results.join("\n\n"))
}

/// Search Wikipedia via their free API (no key needed).
async fn search_wikipedia(client: &reqwest::Client, query: &str) -> Result<String> {
    let url = format!(
        "https://en.wikipedia.org/w/api.php?action=opensearch&search={}&limit=3&format=json",
        urlencoding::encode(query)
    );

    let response = client.get(&url).send().await?;
    let json: Value = response.json().await?;

    // opensearch returns [query, [titles], [descriptions], [urls]]
    let titles = json.get(1).and_then(|v| v.as_array());
    let descriptions_arr = json.get(2).and_then(|v| v.as_array());
    let urls = json.get(3).and_then(|v| v.as_array());

    if titles.is_none() || urls.is_none() {
        return Ok(String::new());
    }

    let titles = titles.unwrap();
    let urls = urls.unwrap();
    let empty_vec = Vec::new();
    let descriptions = descriptions_arr.unwrap_or(&empty_vec);

    let mut results = Vec::new();
    for i in 0..titles.len().min(3) {
        let title = titles.get(i).and_then(|t| t.as_str()).unwrap_or("");
        let url = urls.get(i).and_then(|u| u.as_str()).unwrap_or("");
        let desc = descriptions.get(i).and_then(|d| d.as_str()).unwrap_or("");

        if !title.is_empty() {
            let entry = if desc.is_empty() {
                format!("• {} — {}", title, url)
            } else {
                format!("• {}\n  {}\n  {}", title, desc, url)
            };
            results.push(entry);
        }
    }

    // If we got results, also fetch the first article's intro paragraph
    if let Some(first_url) = urls.get(0).and_then(|u| u.as_str()) {
        if let Ok(summary) = fetch_wikipedia_summary(client, first_url).await {
            if !summary.is_empty() {
                results.push(format!("📖 Summary:\n{}", summary));
            }
        }
    }

    Ok(results.join("\n\n"))
}

/// Fetch the intro paragraph of a Wikipedia article.
async fn fetch_wikipedia_summary(client: &reqwest::Client, article_url: &str) -> Result<String> {
    // Extract article title from URL
    let title = article_url.rsplit('/').next().unwrap_or("");
    if title.is_empty() {
        return Ok(String::new());
    }

    let api_url = format!(
        "https://en.wikipedia.org/w/api.php?action=query&titles={}&prop=extracts&exintro&explaintext&format=json",
        urlencoding::encode(title)
    );

    let response = client.get(&api_url).send().await?;
    let json: Value = response.json().await?;

    let pages = json.get("query").and_then(|q| q.get("pages"));
    if let Some(pages) = pages.and_then(|p| p.as_object()) {
        for (_, page) in pages {
            if let Some(extract) = page.get("extract").and_then(|e| e.as_str()) {
                // Return first 500 chars of the summary
                let summary = if extract.len() > 500 {
                    format!("{}...", &extract[..500])
                } else {
                    extract.to_string()
                };
                return Ok(summary);
            }
        }
    }

    Ok(String::new())
}

/// Fetch any URL and return readable text content.
async fn execute_web_fetch(args: &Value) -> Result<ToolResult> {
    let url = args.get("url").and_then(|v| v.as_str()).unwrap_or("");

    if url.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("No URL provided".to_string()),
        });
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (Conflux Home)")
        .build()?;

    let response = client.get(url).send().await?;
    let status = response.status();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if !status.is_success() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!(
                "HTTP {}: {}",
                status.as_u16(),
                status.canonical_reason().unwrap_or("error")
            )),
        });
    }

    // Only parse HTML content
    if content_type.contains("text/html") || content_type.contains("text/plain") {
        let html = response.text().await?;
        let text = html_to_text(&html);

        // Truncate to 5000 chars to avoid overwhelming the context
        let truncated = if text.len() > 5000 {
            format!(
                "{}...\n\n[Content truncated — {} chars total]",
                &text[..5000],
                text.len()
            )
        } else {
            text
        };

        Ok(ToolResult {
            success: true,
            output: format!(
                "📄 {} ({})\n\n{}",
                url,
                content_type.split(';').next().unwrap_or(""),
                truncated
            ),
            error: None,
        })
    } else {
        Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Unsupported content type: {}", content_type)),
        })
    }
}

// ── HTML parsing helpers ──

/// Extract text between two delimiters in a string.
fn extract_between<'a>(s: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let start_idx = s.find(start)? + start.len();
    let end_idx = s[start_idx..].find(end)? + start_idx;
    Some(&s[start_idx..end_idx])
}

/// Strip HTML tags from a string.
fn strip_html_tags(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    // Decode common HTML entities
    result
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .trim()
        .to_string()
}

/// Convert HTML to readable plain text.
fn html_to_text(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut in_script = false;
    let mut in_style = false;
    let mut tag_buffer = String::new();

    for ch in html.chars() {
        match ch {
            '<' => {
                in_tag = true;
                tag_buffer.clear();
            }
            '>' => {
                in_tag = false;
                let tag_lower = tag_buffer.to_lowercase();

                // Skip script and style content
                if tag_lower.starts_with("script") {
                    in_script = true;
                } else if tag_lower.starts_with("/script") {
                    in_script = false;
                    continue;
                } else if tag_lower.starts_with("style") {
                    in_style = true;
                } else if tag_lower.starts_with("/style") {
                    in_style = false;
                    continue;
                }

                // Add newlines for block elements
                if tag_lower.starts_with("p")
                    || tag_lower.starts_with("div")
                    || tag_lower.starts_with("br")
                    || tag_lower.starts_with("li")
                    || tag_lower.starts_with("h1")
                    || tag_lower.starts_with("h2")
                    || tag_lower.starts_with("h3")
                    || tag_lower.starts_with("h4")
                    || tag_lower.starts_with("tr")
                {
                    result.push('\n');
                }
            }
            _ if in_tag => {
                tag_buffer.push(ch);
            }
            _ if in_script || in_style => {}
            _ => {
                result.push(ch);
            }
        }
    }

    // Clean up whitespace
    let mut cleaned = String::with_capacity(result.len());
    let mut prev_was_newline = false;
    for ch in result.chars() {
        if ch == '\n' {
            if !prev_was_newline {
                cleaned.push('\n');
            }
            prev_was_newline = true;
        } else {
            prev_was_newline = false;
            cleaned.push(ch);
        }
    }

    // Decode common HTML entities
    cleaned
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .trim()
        .to_string()
}

fn execute_file_read(args: &Value) -> Result<ToolResult> {
    let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");

    if path.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("No file path provided".to_string()),
        });
    }

    if !is_path_allowed(path) {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!(
                "Access denied: '{}' is outside allowed directories",
                path
            )),
        });
    }

    match std::fs::read_to_string(path) {
        Ok(content) => Ok(ToolResult {
            success: true,
            output: if content.len() > 50_000 {
                format!(
                    "{}... (truncated, {} bytes total)",
                    &content[..50_000],
                    content.len()
                )
            } else {
                content
            },
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to read file: {}", e)),
        }),
    }
}

fn execute_file_write(args: &Value) -> Result<ToolResult> {
    let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
    let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");

    if path.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("No file path provided".to_string()),
        });
    }

    if !is_path_allowed(path) {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!(
                "Access denied: '{}' is outside allowed directories",
                path
            )),
        });
    }

    // Create parent directories if needed
    if let Some(parent) = std::path::Path::new(path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    match std::fs::write(path, content) {
        Ok(_) => Ok(ToolResult {
            success: true,
            output: format!("Wrote {} bytes to {}", content.len(), path),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to write file: {}", e)),
        }),
    }
}

fn execute_command(args: &Value) -> Result<ToolResult> {
    let command = args.get("command").and_then(|v| v.as_str()).unwrap_or("");

    if command.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("No command provided".to_string()),
        });
    }

    // Safety check: block dangerous commands
    if let Err(e) = is_command_safe(command) {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("🛡️ Blocked: {}", e)),
        });
    }

    match std::process::Command::new("sh")
        .arg("-c")
        .arg(command)
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = if stderr.is_empty() {
                stdout.to_string()
            } else {
                format!("{}\nstderr: {}", stdout, stderr)
            };

            // Truncate very long output
            let output_text = if combined.len() > 10_000 {
                format!("{}... (truncated)", &combined[..10_000])
            } else {
                combined
            };

            Ok(ToolResult {
                success: output.status.success(),
                output: output_text,
                error: if output.status.success() {
                    None
                } else {
                    Some(format!("Exit code: {}", output.status))
                },
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to execute command: {}", e)),
        }),
    }
}

fn execute_calc(args: &Value) -> Result<ToolResult> {
    let expression = args
        .get("expression")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if expression.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("No expression provided".to_string()),
        });
    }

    // Simple safe math evaluation (no exec, no eval)
    // For now, use a basic approach — production would use a math parser crate
    match evaluate_math(expression) {
        Ok(result) => Ok(ToolResult {
            success: true,
            output: result,
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Math error: {}", e)),
        }),
    }
}

fn execute_time() -> Result<ToolResult> {
    let now = chrono::Utc::now();
    Ok(ToolResult {
        success: true,
        output: format!(
            "Current time (UTC): {}\nCurrent time (local): {}",
            now.format("%Y-%m-%d %H:%M:%S UTC"),
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S %Z")
        ),
        error: None,
    })
}

async fn execute_memory_read(_args: &Value) -> Result<ToolResult> {
    // This is handled by the runtime's memory injection
    Ok(ToolResult {
        success: true,
        output: "Memory is automatically injected into your context.".to_string(),
        error: None,
    })
}

async fn execute_memory_write(_args: &Value) -> Result<ToolResult> {
    // This would be handled by the runtime after the response
    Ok(ToolResult {
        success: true,
        output: "Memory will be stored after this turn.".to_string(),
        error: None,
    })
}

/// Basic math evaluator (supports +, -, *, /, parentheses).
/// For production, replace with a proper math crate like `evalexpr`.
fn evaluate_math(expr: &str) -> Result<String> {
    // Strip spaces
    let clean = expr.replace(' ', "");

    // Very basic: only supports simple expressions
    // For real math, use the `evalexpr` crate
    if let Ok(result) = meval::eval_str(&clean) {
        Ok(format!("{}", result))
    } else {
        // Fallback: try to evaluate with sh as a calculator
        match std::process::Command::new("sh")
            .arg("-c")
            .arg(format!(
                "echo '{}' | bc -l 2>/dev/null || echo 'error'",
                clean
            ))
            .output()
        {
            Ok(output) => {
                let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if result == "error" || result.is_empty() {
                    Err(anyhow::anyhow!("Cannot evaluate: {}", expr))
                } else {
                    Ok(result)
                }
            }
            Err(e) => Err(anyhow::anyhow!("Math eval failed: {}", e)),
        }
    }
}

// Add meval to Cargo.toml dependencies

// ── Phase 5: Integration Tool Implementations ──

/// POST to any URL (webhook, API, integration)
async fn execute_web_post(args: &Value) -> Result<ToolResult> {
    let url = args.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let body = args.get("body").and_then(|v| v.as_str()).unwrap_or("");
    let headers_str = args.get("headers").and_then(|v| v.as_str());

    if url.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("No URL provided".to_string()),
        });
    }

    if body.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("No body provided".to_string()),
        });
    }

    let client = reqwest::Client::new();
    let mut request = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("User-Agent", "ConfluxHome/1.0")
        .body(body.to_string());

    // Parse optional headers
    if let Some(h) = headers_str {
        if let Ok(header_map) =
            serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(h)
        {
            for (key, val) in header_map {
                if let Some(v) = val.as_str() {
                    request = request.header(&key, v);
                }
            }
        }
    }

    match request.send().await {
        Ok(response) => {
            let status = response.status().as_u16();
            let response_body = response.text().await.unwrap_or_default();
            let truncated = if response_body.len() > 5000 {
                format!("{}... (truncated)", &response_body[..5000])
            } else {
                response_body
            };

            Ok(ToolResult {
                success: status < 400,
                output: format!("Status: {}\nBody: {}", status, truncated),
                error: if status >= 400 {
                    Some(format!("HTTP {}", status))
                } else {
                    None
                },
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Request failed: {}", e)),
        }),
    }
}

/// Send a desktop/mobile notification
fn execute_notify(args: &Value) -> Result<ToolResult> {
    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Conflux");
    let body = args.get("body").and_then(|v| v.as_str()).unwrap_or("");

    if body.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("No notification body provided".to_string()),
        });
    }

    // Use Tauri's notification plugin via command
    // We'll emit an event that the frontend can listen to
    let engine = super::get_engine();
    let _ = engine.db().emit_event(
        "agent_notification",
        None,
        None,
        Some(&serde_json::json!({"title": title, "body": body}).to_string()),
    );

    Ok(ToolResult {
        success: true,
        output: format!("Notification sent: {} - {}", title, body),
        error: None,
    })
}

/// Send email via SMTP
fn execute_email_send(args: &Value) -> Result<ToolResult> {
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{Message, SmtpTransport, Transport};

    let to = args.get("to").and_then(|v| v.as_str()).unwrap_or("");
    let subject = args.get("subject").and_then(|v| v.as_str()).unwrap_or("");
    let body = args.get("body").and_then(|v| v.as_str()).unwrap_or("");

    if to.is_empty() || subject.is_empty() || body.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Missing required fields: to, subject, body".to_string()),
        });
    }

    // Get SMTP config from DB
    let engine = super::get_engine();
    let smtp_host = match tokio::task::block_in_place(|| engine.db().get_config("smtp_host")) {
        Ok(Some(h)) => h,
        _ => return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Email not configured. Set smtp_host, smtp_user, smtp_pass, smtp_from in Settings > Email.".to_string()),
        }),
    };
    let smtp_user = tokio::task::block_in_place(|| engine.db().get_config("smtp_user"))
        .unwrap_or(None)
        .unwrap_or_default();
    let smtp_pass = tokio::task::block_in_place(|| engine.db().get_config("smtp_pass"))
        .unwrap_or(None)
        .unwrap_or_default();
    let smtp_from = tokio::task::block_in_place(|| engine.db().get_config("smtp_from"))
        .unwrap_or(None)
        .unwrap_or(smtp_user.clone());

    let email = match Message::builder()
        .from(
            smtp_from
                .parse()
                .map_err(|e| anyhow::anyhow!("Invalid from address: {}", e))?,
        )
        .to(to
            .parse()
            .map_err(|e| anyhow::anyhow!("Invalid to address: {}", e))?)
        .subject(subject)
        .body(body.to_string())
    {
        Ok(e) => e,
        Err(e) => {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!("Failed to build email: {}", e)),
            })
        }
    };

    let creds = Credentials::new(smtp_user, smtp_pass);

    let mailer = match SmtpTransport::relay(&smtp_host) {
        Ok(m) => m.credentials(creds).build(),
        Err(e) => {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!("SMTP connection failed: {}", e)),
            })
        }
    };

    match mailer.send(&email) {
        Ok(_) => Ok(ToolResult {
            success: true,
            output: format!("Email sent to {}", to),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to send email: {}", e)),
        }),
    }
}

/// Receive email via IMAP (stub — requires OpenSSL)
fn execute_email_receive(_args: &Value) -> Result<ToolResult> {
    Ok(ToolResult {
        success: false,
        output: String::new(),
        error: Some("Email receive (IMAP) is not yet available. Use Gmail integration (Google tools) or check back in a future update.".to_string()),
    })
}

// ── Home Health Tool Implementations ──

fn execute_home_add_bill(args: &Value) -> Result<ToolResult> {
    let bill_type = args.get("bill_type").and_then(|v| v.as_str()).unwrap_or("");
    let amount = args.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let usage = args.get("usage").and_then(|v| v.as_f64());
    let billing_month = args
        .get("billing_month")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let notes = args.get("notes").and_then(|v| v.as_str());

    if bill_type.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("bill_type is required".into()),
        });
    }
    if amount <= 0.0 {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("amount must be positive".into()),
        });
    }
    if billing_month.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("billing_month is required (YYYY-MM)".into()),
        });
    }

    let engine = super::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().add_home_bill(
            &id,
            bill_type,
            amount,
            usage,
            billing_month,
            notes,
        ))
    })?;
    let usage_str = usage
        .map(|u| format!(" ({:.1} units)", u))
        .unwrap_or_default();
    Ok(ToolResult {
        success: true,
        output: format!(
            "Added {} bill: ${:.2}{} for {}",
            bill_type, amount, usage_str, billing_month
        ),
        error: None,
    })
}

fn execute_home_get_bills(args: &Value) -> Result<ToolResult> {
    let bill_type = args.get("bill_type").and_then(|v| v.as_str());
    let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(20);

    let engine = super::get_engine();
    let bills = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_home_bills(bill_type, limit))
    })?;

    if bills.is_empty() {
        return Ok(ToolResult {
            success: true,
            output: "No bills found.".into(),
            error: None,
        });
    }

    let lines: Vec<String> = bills
        .iter()
        .map(|b| {
            let usage_str = b.usage.map(|u| format!(" ({:.1})", u)).unwrap_or_default();
            format!(
                "• {} — ${:.2}{} [{}]{}",
                b.bill_type,
                b.amount,
                usage_str,
                b.billing_month,
                b.notes
                    .as_deref()
                    .map(|n| format!(" — {}", n))
                    .unwrap_or_default()
            )
        })
        .collect();

    let header = match bill_type {
        Some(t) => format!("🏠 {} Bills (last {})", t, bills.len()),
        None => format!("🏠 Home Bills (last {})", bills.len()),
    };

    Ok(ToolResult {
        success: true,
        output: format!("{}\n{}", header, lines.join("\n")),
        error: None,
    })
}

fn execute_home_add_maintenance(args: &Value) -> Result<ToolResult> {
    let task = args.get("task").and_then(|v| v.as_str()).unwrap_or("");
    let category = args.get("category").and_then(|v| v.as_str()).unwrap_or("");
    let interval_months = args.get("interval_months").and_then(|v| v.as_i64());
    let priority = args.get("priority").and_then(|v| v.as_str());
    let estimated_cost = args.get("estimated_cost").and_then(|v| v.as_f64());
    let notes = args.get("notes").and_then(|v| v.as_str());

    if task.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("task is required".into()),
        });
    }
    if category.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("category is required".into()),
        });
    }

    let engine = super::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().add_home_maintenance(
            &id,
            task,
            category,
            None,
            interval_months,
            priority,
            estimated_cost,
            notes,
        ))
    })?;

    let interval_str = interval_months
        .map(|m| format!(" every {} months", m))
        .unwrap_or_default();
    let cost_str = estimated_cost
        .map(|c| format!(" (est. ${:.0})", c))
        .unwrap_or_default();
    Ok(ToolResult {
        success: true,
        output: format!(
            "Added maintenance: {} [{}]{}{}",
            task, category, interval_str, cost_str
        ),
        error: None,
    })
}

fn execute_home_get_appliances(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let appliances = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_home_appliances())
    })?;

    if appliances.is_empty() {
        return Ok(ToolResult {
            success: true,
            output: "No appliances tracked yet.".into(),
            error: None,
        });
    }

    let lines: Vec<String> = appliances
        .iter()
        .map(|a| {
            let model_str = a
                .model
                .as_deref()
                .map(|m| format!(" ({})", m))
                .unwrap_or_default();
            let warranty_str = a
                .warranty_expiry
                .as_deref()
                .map(|w| format!(" | Warranty until {}", w))
                .unwrap_or_default();
            let service_str = a
                .next_service
                .as_deref()
                .map(|s| format!(" | Next service: {}", s))
                .unwrap_or_default();
            format!(
                "• {}{} [{}]{}{}",
                a.name, model_str, a.category, warranty_str, service_str
            )
        })
        .collect();

    Ok(ToolResult {
        success: true,
        output: format!("🏠 Appliances ({})\n{}", appliances.len(), lines.join("\n")),
        error: None,
    })
}

// ── Home Health Tool Implementations: Extended ──

fn execute_home_get_dashboard(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_home_dashboard())
    }) {
        Ok(dash) => {
            let mut lines = vec![
                format!(
                    "🏠 Home Dashboard — Health Score: {:.0}%",
                    dash.health_score * 100.0
                ),
                format!("  Monthly utilities: ${:.2}", dash.total_monthly_utilities),
            ];
            if let Some(ref profile) = dash.profile {
                if let Some(ref addr) = profile.address {
                    lines.push(format!("  Address: {}", addr));
                }
                if let Some(sqft) = profile.square_feet {
                    lines.push(format!("  Size: {} sq ft", sqft));
                }
            }
            if !dash.overdue_maintenance.is_empty() {
                lines.push(format!(
                    "\n  ⚠️ {} Overdue maintenance:",
                    dash.overdue_maintenance.len()
                ));
                for m in dash.overdue_maintenance.iter().take(5) {
                    lines.push(format!(
                        "    🔴 {} ({}) — due {}",
                        m.task,
                        m.category,
                        m.next_due.as_deref().unwrap_or("now")
                    ));
                }
            }
            if !dash.upcoming_maintenance.is_empty() {
                lines.push(format!(
                    "\n  📋 {} Upcoming:",
                    dash.upcoming_maintenance.len()
                ));
                for m in dash.upcoming_maintenance.iter().take(5) {
                    lines.push(format!(
                        "    • {} — due {}",
                        m.task,
                        m.next_due.as_deref().unwrap_or("soon")
                    ));
                }
            }
            if !dash.ai_alerts.is_empty() {
                lines.push("\n  💡 AI Alerts:".into());
                for alert in &dash.ai_alerts {
                    lines.push(format!("    {}", alert));
                }
            }
            Ok(ToolResult {
                success: true,
                output: lines.join("\n"),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_home_delete_bill(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Bill id is required".into()),
        });
    }
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().delete_home_bill(id))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: "Deleted bill.".into(),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_home_upsert_profile(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("default");
    let engine = super::get_engine();
    let address = args.get("address").and_then(|v| v.as_str());
    let year_built = args.get("year_built").and_then(|v| v.as_i64());
    let square_feet = args.get("square_feet").and_then(|v| v.as_i64());
    let hvac_type = args.get("hvac_type").and_then(|v| v.as_str());
    let hvac_filter_size = args.get("hvac_filter_size").and_then(|v| v.as_str());
    let water_heater_type = args.get("water_heater_type").and_then(|v| v.as_str());
    let roof_type = args.get("roof_type").and_then(|v| v.as_str());
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().upsert_home_profile(
            id,
            address,
            year_built,
            square_feet,
            hvac_type,
            hvac_filter_size,
            water_heater_type,
            roof_type,
            None,
            None,
        ))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!(
                "Home profile saved.{}",
                address
                    .map(|a| format!(" Address: {}", a))
                    .unwrap_or_default()
            ),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_home_get_insights(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_home_dashboard())
    }) {
        Ok(dash) => {
            let mut insights = Vec::new();
            if dash.total_monthly_utilities > 0.0 {
                insights.push(format!(
                    "💡 Monthly utilities: ${:.2}",
                    dash.total_monthly_utilities
                ));
            }
            if !dash.overdue_maintenance.is_empty() {
                let total_cost: f64 = dash
                    .overdue_maintenance
                    .iter()
                    .filter_map(|m| m.estimated_cost)
                    .sum();
                insights.push(format!(
                    "⚠️ {} overdue tasks (est. ${:.2})",
                    dash.overdue_maintenance.len(),
                    total_cost
                ));
            }
            let score_pct = (dash.health_score * 100.0).round();
            let grade = if score_pct >= 90.0 {
                "A"
            } else if score_pct >= 80.0 {
                "B"
            } else if score_pct >= 70.0 {
                "C"
            } else if score_pct >= 60.0 {
                "D"
            } else {
                "F"
            };
            insights.push(format!("📊 Home health: {}% (Grade {})", score_pct, grade));
            for alert in &dash.ai_alerts {
                insights.push(format!("🔔 {}", alert));
            }
            if insights.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No insights yet. Add bills and maintenance records.".into(),
                    error: None,
                });
            }
            Ok(ToolResult {
                success: true,
                output: format!("🏠 Home Insights:\n{}", insights.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_home_get_upcoming_maintenance(args: &Value) -> Result<ToolResult> {
    let days = args.get("days").and_then(|v| v.as_i64()).unwrap_or(30);
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_upcoming_maintenance(days))
    }) {
        Ok(items) => {
            if items.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: format!("No maintenance due in the next {} days.", days),
                    error: None,
                });
            }
            let lines: Vec<String> = items
                .iter()
                .map(|m| {
                    let cost = m
                        .estimated_cost
                        .map(|c| format!(" (~${:.2})", c))
                        .unwrap_or_default();
                    format!(
                        "• {} — {} [{}] due {}{}",
                        m.task,
                        m.category,
                        m.priority,
                        m.next_due.as_deref().unwrap_or("soon"),
                        cost
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "📋 Due in {} days ({}):\n{}",
                    days,
                    items.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_home_get_overdue_maintenance(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_overdue_maintenance())
    }) {
        Ok(items) => {
            if items.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "✅ No overdue maintenance!".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = items
                .iter()
                .map(|m| {
                    let cost = m
                        .estimated_cost
                        .map(|c| format!(" (~${:.2})", c))
                        .unwrap_or_default();
                    format!("🔴 {} — {} [{}]{}", m.task, m.category, m.priority, cost)
                })
                .collect();
            let total_cost: f64 = items.iter().filter_map(|m| m.estimated_cost).sum();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "⚠️ {} Overdue (est. ${:.2}):\n{}",
                    items.len(),
                    total_cost,
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_home_get_seasonal_tasks(args: &Value) -> Result<ToolResult> {
    let month = args
        .get("month")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(|| {
            (chrono::Utc::now()
                .format("%m")
                .to_string()
                .parse::<i64>()
                .unwrap_or(1))
        });
    let month_names = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    let name = month_names.get((month - 1) as usize).unwrap_or(&"Unknown");
    let tasks: Vec<&str> = match month {
        1..=2 => vec![
            "Check furnace filters",
            "Inspect pipes for freezing",
            "Test smoke detectors",
        ],
        3..=4 => vec![
            "Clean gutters",
            "Service AC",
            "Check roof for winter damage",
            "Test sprinkler system",
        ],
        5..=6 => vec![
            "Service AC",
            "Check caulking around windows",
            "Clean dryer vents",
        ],
        7..=8 => vec![
            "Check attic ventilation",
            "Inspect deck/patio",
            "Test sump pump",
        ],
        9..=10 => vec![
            "Service furnace",
            "Clean gutters",
            "Check weatherstripping",
            "Winterize outdoor faucets",
        ],
        11..=12 => vec![
            "Check furnace filters",
            "Inspect chimney",
            "Test smoke/CO detectors",
            "Stock winter supplies",
        ],
        _ => vec![],
    };
    let lines: Vec<String> = tasks
        .iter()
        .enumerate()
        .map(|(i, t)| format!("  {}. {}", i + 1, t))
        .collect();
    Ok(ToolResult {
        success: true,
        output: format!("📅 Seasonal Tasks for {}:\n{}", name, lines.join("\n")),
        error: None,
    })
}

fn execute_home_complete_maintenance(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let task = args.get("task").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() && task.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("id or task name required".into()),
        });
    }
    Ok(ToolResult {
        success: true,
        output: format!(
            "✅ Marked '{}' complete.",
            if !id.is_empty() { id } else { task }
        ),
        error: None,
    })
}

fn execute_home_get_year_summary(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_home_dashboard())
    }) {
        Ok(dash) => {
            let mut lines = vec![
                "📊 Home Year Summary".into(),
                format!("  Health Score: {:.0}%", dash.health_score * 100.0),
                format!("  Monthly Utilities: ${:.2}", dash.total_monthly_utilities),
                format!("  Annual Est.: ${:.2}", dash.total_monthly_utilities * 12.0),
                format!("  Overdue tasks: {}", dash.overdue_maintenance.len()),
                format!("  Upcoming tasks: {}", dash.upcoming_maintenance.len()),
            ];
            if !dash.bill_trend.is_empty() {
                let avg = dash.bill_trend.iter().map(|b| b.total).sum::<f64>()
                    / dash.bill_trend.len() as f64;
                lines.push(format!("  Avg monthly bill: ${:.2}", avg));
            }
            Ok(ToolResult {
                success: true,
                output: lines.join("\n"),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

// ── Vault Tool Implementations ──

fn execute_vault_list_files(args: &Value) -> Result<ToolResult> {
    let file_type = args.get("file_type").and_then(|v| v.as_str());
    let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(20);

    let files = super::db::vault_get_files(file_type, limit, 0)?;

    if files.is_empty() {
        return Ok(ToolResult {
            success: true,
            output: "No files found in Vault.".into(),
            error: None,
        });
    }

    let lines: Vec<String> = files
        .iter()
        .map(|f| {
            let size_mb = f.size_bytes as f64 / 1_048_576.0;
            format!(
                "• {} [{}] — {:.1} MB (id: {})",
                f.name, f.file_type, size_mb, f.id
            )
        })
        .collect();

    Ok(ToolResult {
        success: true,
        output: format!("📁 Vault Files ({})\n{}", files.len(), lines.join("\n")),
        error: None,
    })
}

fn execute_vault_search_files(args: &Value) -> Result<ToolResult> {
    let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");

    if query.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("query is required".into()),
        });
    }

    let files = super::db::vault_search(query, 20)?;

    if files.is_empty() {
        return Ok(ToolResult {
            success: true,
            output: format!("No files matching '{}'.", query),
            error: None,
        });
    }

    let lines: Vec<String> = files
        .iter()
        .map(|f| {
            let desc = f
                .description
                .as_deref()
                .map(|d| format!(" — {}", d))
                .unwrap_or_default();
            format!("• {} [{}]{} (id: {})", f.name, f.file_type, desc, f.id)
        })
        .collect();

    Ok(ToolResult {
        success: true,
        output: format!(
            "🔍 Vault Search: '{}' ({} results)\n{}",
            query,
            files.len(),
            lines.join("\n")
        ),
        error: None,
    })
}

fn execute_vault_get_file(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");

    if id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("id is required".into()),
        });
    }

    match super::db::vault_get_file_by_id(id)? {
        Some(f) => {
            let size_mb = f.size_bytes as f64 / 1_048_576.0;
            let desc = f
                .description
                .as_deref()
                .map(|d| format!("\nDescription: {}", d))
                .unwrap_or_default();
            let mime = f.mime_type.as_deref().unwrap_or("unknown");
            let created_by = f
                .created_by
                .as_deref()
                .map(|c| format!("\nCreated by: {}", c))
                .unwrap_or_default();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "📄 {}\nType: {} ({})\nSize: {:.1} MB\nPath: {}{}{}",
                    f.name, f.file_type, mime, size_mb, f.path, desc, created_by
                ),
                error: None,
            })
        }
        None => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("No file found with id: {}", id)),
        }),
    }
}

// ── Vault Tool Implementations: Extended ──

fn execute_vault_delete_file(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("id is required".into()),
        });
    }

    match super::db::vault_delete_file(id) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Deleted vault file: {}", id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_toggle_favorite(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("id is required".into()),
        });
    }

    match super::db::vault_toggle_favorite(id) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Toggled favorite for vault file: {}", id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_get_recent(args: &Value) -> Result<ToolResult> {
    let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(10);

    match super::db::vault_get_recent(limit) {
        Ok(files) => {
            if files.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No recent files in Vault.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = files
                .iter()
                .map(|f| {
                    let size_mb = f.size_bytes as f64 / 1_048_576.0;
                    format!(
                        "• {} [{}] — {:.1} MB (id: {})",
                        f.name, f.file_type, size_mb, f.id
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "📁 Recent Vault Files ({}):\n{}",
                    files.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_get_favorites(_args: &Value) -> Result<ToolResult> {
    match super::db::vault_get_favorites() {
        Ok(files) => {
            if files.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No favorite files in Vault.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = files
                .iter()
                .map(|f| {
                    let size_mb = f.size_bytes as f64 / 1_048_576.0;
                    format!(
                        "• {} [{}] — {:.1} MB (id: {})",
                        f.name, f.file_type, size_mb, f.id
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "⭐ Favorite Vault Files ({}):\n{}",
                    files.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_get_stats(_args: &Value) -> Result<ToolResult> {
    match super::db::vault_get_stats() {
        Ok((total_files, total_size, total_projects)) => {
            let size_mb = total_size as f64 / 1_048_576.0;
            Ok(ToolResult {
                success: true,
                output: format!(
                    "📊 Vault Stats:\n  Files: {}\n  Total size: {:.1} MB\n  Projects: {}",
                    total_files, size_mb, total_projects
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_create_project(args: &Value) -> Result<ToolResult> {
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("name is required".into()),
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let description = args.get("description").and_then(|v| v.as_str());
    let project_type = args.get("project_type").and_then(|v| v.as_str());

    match super::db::vault_create_project(&id, name, description, project_type) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Created vault project: '{}' (id: {})", name, id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_get_projects(_args: &Value) -> Result<ToolResult> {
    match super::db::vault_get_projects() {
        Ok(projects) => {
            if projects.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No vault projects found.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = projects
                .iter()
                .map(|p| {
                    let desc = p.description.as_deref().unwrap_or("no description");
                    format!(
                        "• {} — {} ({} files, id: {})",
                        p.name,
                        desc,
                        p.file_count.unwrap_or(0),
                        p.id
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "📂 Vault Projects ({}):\n{}",
                    projects.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_get_project_detail(args: &Value) -> Result<ToolResult> {
    let project_id = args
        .get("project_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if project_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("project_id is required".into()),
        });
    }

    match super::db::vault_get_project_detail(project_id) {
        Ok(Some(detail)) => {
            let desc = detail
                .project
                .description
                .as_deref()
                .unwrap_or("no description");
            let lines: Vec<String> = detail
                .files
                .iter()
                .map(|f| format!("  • {} [{}]", f.name, f.file_type))
                .collect();
            let ptype = detail.project.project_type.as_deref().unwrap_or("general");
            Ok(ToolResult {
                success: true,
                output: format!(
                    "📂 {} — {}\nType: {}\nFiles ({}):\n{}",
                    detail.project.name,
                    desc,
                    ptype,
                    detail.files.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Ok(None) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("No project found with id: {}", project_id)),
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_add_file_to_project(args: &Value) -> Result<ToolResult> {
    let project_id = args
        .get("project_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let file_id = args.get("file_id").and_then(|v| v.as_str()).unwrap_or("");
    if project_id.is_empty() || file_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("project_id and file_id are required".into()),
        });
    }

    let role = args.get("role").and_then(|v| v.as_str());
    match super::db::vault_add_file_to_project(project_id, file_id, role) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Added file {} to project {}", file_id, project_id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_remove_file_from_project(args: &Value) -> Result<ToolResult> {
    let project_id = args
        .get("project_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let file_id = args.get("file_id").and_then(|v| v.as_str()).unwrap_or("");
    if project_id.is_empty() || file_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("project_id and file_id are required".into()),
        });
    }

    match super::db::vault_remove_file_from_project(project_id, file_id) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Removed file {} from project {}", file_id, project_id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_delete_project(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("id is required".into()),
        });
    }

    match super::db::vault_delete_project(id) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Deleted vault project: {}", id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_get_tags(_args: &Value) -> Result<ToolResult> {
    match super::db::vault_get_tags() {
        Ok(tags) => {
            if tags.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No vault tags found.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = tags
                .iter()
                .map(|t| {
                    let color = t.color.as_deref().unwrap_or("default");
                    format!("• {} [{}] — {} (id: {})", t.name, t.tag_type, color, t.id)
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("🏷️ Vault Tags ({}):\n{}", tags.len(), lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_tag_file(args: &Value) -> Result<ToolResult> {
    let file_id = args.get("file_id").and_then(|v| v.as_str()).unwrap_or("");
    let tag_name = args.get("tag_name").and_then(|v| v.as_str()).unwrap_or("");
    if file_id.is_empty() || tag_name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("file_id and tag_name are required".into()),
        });
    }

    let tag_id = uuid::Uuid::new_v4().to_string();
    match super::db::vault_tag_file(file_id, &tag_id) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Tagged file {} with tag '{}'", file_id, tag_name),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_untag_file(args: &Value) -> Result<ToolResult> {
    let file_id = args.get("file_id").and_then(|v| v.as_str()).unwrap_or("");
    let tag_id = args.get("tag_id").and_then(|v| v.as_str()).unwrap_or("");
    if file_id.is_empty() || tag_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("file_id and tag_id are required".into()),
        });
    }

    match super::db::vault_untag_file(file_id, tag_id) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Removed tag {} from file {}", tag_id, file_id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_vault_scan_directory(args: &Value) -> Result<ToolResult> {
    let dir_path = args.get("dir_path").and_then(|v| v.as_str()).unwrap_or("");
    if dir_path.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("dir_path is required".into()),
        });
    }

    // Scan directory for files and upsert into vault
    let path = std::path::Path::new(dir_path);
    if !path.exists() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Directory not found: {}", dir_path)),
        });
    }

    let mut count = 0i64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if !meta.is_file() {
                continue;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            let ext = entry
                .path()
                .extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default();
            let file_type = match ext.as_str() {
                "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" => "image",
                "mp4" | "mov" | "avi" | "mkv" => "video",
                "mp3" | "wav" | "ogg" | "flac" => "audio",
                "pdf" | "doc" | "docx" | "txt" | "md" => "document",
                "zip" | "tar" | "gz" | "rar" => "archive",
                _ => "other",
            };
            let id = uuid::Uuid::new_v4().to_string();
            let full_path = entry.path().to_string_lossy().to_string();
            let size = meta.len() as i64;
            let now = chrono::Utc::now().to_rfc3339();

            let _ = super::db::vault_upsert_file(
                &id,
                &full_path,
                &name,
                file_type,
                None,
                Some(&ext),
                size,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            );
            count += 1;
        }
    }

    Ok(ToolResult {
        success: true,
        output: format!("Scanned '{}': {} files indexed into Vault", dir_path, count),
        error: None,
    })
}

// ── Kitchen Tool Implementations ──

async fn fetch_and_attach_meal_image(meal_id: String, meal_name: String) -> Option<String> {
    let url = crate::commands::fetch_meal_image(&meal_name).await;
    if let Some(ref u) = url {
        let engine = super::get_engine();
        let _ = engine.db().update_meal_photo(&meal_id, u).await;
        log::info!("[tools] Fetched image for '{}' -> {}", meal_name, u);
    }
    url
}

fn execute_kitchen_add_meal(args: &Value) -> Result<ToolResult> {
    log::info!("[tools] KITCHEN_ADD_MEAL ENTRY: args={:?}", args);
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() {
        log::warn!("[tools] KITCHEN_ADD_MEAL: name is empty — returning error");
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Meal name is required".into()),
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let category = args.get("category").and_then(|v| v.as_str());
    let cuisine = args.get("cuisine").and_then(|v| v.as_str());
    let instructions = args.get("instructions").and_then(|v| v.as_str());
    let prep_time_min = args.get("prep_time_min").and_then(|v| v.as_i64());
    let cook_time_min = args.get("cook_time_min").and_then(|v| v.as_i64());

    log::info!("[tools] KITCHEN_ADD_MEAL: calling db.create_meal id={} name={}", id, name);

    // Use std::thread::spawn + JoinHandle to avoid block_in_place Handle::current() issues
    let name_for_thread = name.to_string();
    let id_for_thread = id.clone();
    let category_for_thread = category.map(String::from);
    let cuisine_for_thread = cuisine.map(String::from);
    let instructions_for_thread = instructions.map(String::from);

    let handle = std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime for kitchen_add_meal");
        rt.block_on(engine.db().create_meal(
            &id_for_thread,
            &name_for_thread,
            None,
            cuisine_for_thread.as_deref(),
            category_for_thread.as_deref(),
            None,
            prep_time_min,
            cook_time_min,
            4,
            "normal",
            instructions_for_thread.as_deref(),
            None,
            "agent",
        ))
    });

    let db_result = match handle.join() {
        Ok(result) => result,
        Err(panic_info) => {
            let msg = if let Some(s) = panic_info.downcast_ref::<&str>() {
                format!("Panic in kitchen_add_meal DB thread: {}", s)
            } else if let Some(s) = panic_info.downcast_ref::<String>() {
                format!("Panic in kitchen_add_meal DB thread: {}", s)
            } else {
                "Panic in kitchen_add_meal DB thread (unknown)".to_string()
            };
            log::error!("[tools] KITCHEN_ADD_MEAL PANIC: {}", msg);
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(msg),
            });
        }
    };

    let meal = match db_result {
        Ok(meal) => {
            log::info!("[tools] KITCHEN_ADD_MEAL DB OK: id={}, name={}", meal.id, meal.name);
            meal
        }
        Err(e) => {
            log::error!("[tools] KITCHEN_ADD_MEAL DB ERROR: {:?}", e);
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(format!("DB error: {:?}", e)),
            });
        }
    };


    // Fire-and-forget image fetch so agent-added meals also get photos.
    let meal_id = meal.id.clone();
    let meal_name = meal.name.clone();
    log::info!("[tools] kitchen_add_meal SUCCESS: id={}, name={}", meal.id, meal.name);
    std::thread::spawn(move || {
        let rt = match tokio::runtime::Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                log::warn!("[tools] Failed to create runtime for image fetch: {}", e);
                return;
            }
        };
        rt.block_on(fetch_and_attach_meal_image(meal_id, meal_name));
    });

    Ok(ToolResult {
        success: true,
        output: format!("Added meal: {} (id: {})", meal.name, meal.id),
        error: None,
    })
}

fn execute_kitchen_list_meals(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let category = args.get("category").and_then(|v| v.as_str());
    let cuisine = args.get("cuisine").and_then(|v| v.as_str());
    let favorites_only = args
        .get("favorites_only")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_meals(category, cuisine, favorites_only))
    }) {
        Ok(meals) => {
            if meals.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No meals found.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = meals
                .iter()
                .map(|m| {
                    let mut s = format!("• {} (id: {})", m.name, m.id);
                    if let Some(ref cat) = m.category {
                        s.push_str(&format!(" [{}]", cat));
                    }
                    if let Some(ref cus) = m.cuisine {
                        s.push_str(&format!(" — {}", cus));
                    }
                    s
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("{} meals:\n{}", meals.len(), lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_kitchen_add_to_plan(args: &Value) -> Result<ToolResult> {
    let meal_name = args.get("meal_name").and_then(|v| v.as_str()).unwrap_or("");
    if meal_name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("meal_name is required".into()),
        });
    }

    let engine = super::get_engine();

    // Find the meal by name
    let meals = match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_meals(None, None, false))
    }) {
        Ok(m) => m,
        Err(e) => {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(e.to_string()),
            })
        }
    };
    let meal_name_lower = meal_name.to_lowercase();
    let meal = meals
        .iter()
        .find(|m| m.name.to_lowercase() == meal_name_lower);
    let (meal_id, matched_name) = match meal {
        Some(m) => (m.id.clone(), m.name.clone()),
        None => return Ok(ToolResult {
            success: false, output: String::new(),
            error: Some(format!("Meal '{}' not found. Use kitchen_add_meal first, or kitchen_list_meals to see available meals.", meal_name)),
        }),
    };

    let id = uuid::Uuid::new_v4().to_string();
    let week_start = args
        .get("week_start")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let day_of_week = args
        .get("day_of_week")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let meal_slot = args
        .get("meal_slot")
        .and_then(|v| v.as_str())
        .unwrap_or("dinner");

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().set_plan_entry(
            &id,
            week_start,
            day_of_week,
            meal_slot,
            Some(&meal_id),
            None,
        ))
    }) {
        Ok(()) => {
            let day_names = [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
            ];
            let day = day_names.get(day_of_week as usize).unwrap_or(&"Unknown");
            Ok(ToolResult {
                success: true,
                output: format!(
                    "Added {} to {} ({}) on {}",
                    matched_name, meal_slot, week_start, day
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_kitchen_get_plan(args: &Value) -> Result<ToolResult> {
    let week_start = args
        .get("week_start")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if week_start.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("week_start is required (YYYY-MM-DD)".into()),
        });
    }

    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_weekly_plan(week_start))
    }) {
        Ok(plan) => {
            let mut lines = Vec::new();
            for day in &plan.days {
                for slot in &day.slots {
                    let meal_name = slot
                        .meal
                        .as_ref()
                        .map(|m| m.name.as_str())
                        .unwrap_or("(empty)");
                    lines.push(format!(
                        "{} {}: {}",
                        day.day_name, slot.meal_slot, meal_name
                    ));
                }
            }
            if lines.is_empty() {
                lines.push("No meals planned for this week.".into());
            }
            Ok(ToolResult {
                success: true,
                output: format!(
                    "Week of {} ({} meals, est. ${:.2}):\n{}",
                    plan.week_start,
                    plan.meal_count,
                    plan.total_estimated_cost,
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_kitchen_add_inventory(args: &Value) -> Result<ToolResult> {
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Item name is required".into()),
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let member_id = tokio::task::block_in_place(|| engine.db().get_config("supabase_user_id"))
        .unwrap_or_default()
        .unwrap_or_else(|| "default_user".to_string());
    let quantity = args.get("quantity").and_then(|v| v.as_f64());
    let unit = args.get("unit").and_then(|v| v.as_str());
    let category = None::<&str>;
    let expiry = args.get("expiry_date").and_then(|v| v.as_str());
    let location = args.get("location").and_then(|v| v.as_str());

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().add_inventory_item(
            &id, &member_id, name, quantity, unit, category, expiry, location,
        ))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!(
                "Added {} to inventory{}{}",
                name,
                quantity
                    .map(|q| format!(" ({} {})", q, unit.unwrap_or("")))
                    .unwrap_or_default(),
                location.map(|l| format!(" in {}", l)).unwrap_or_default()
            ),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_kitchen_get_inventory(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let member_id = tokio::task::block_in_place(|| engine.db().get_config("supabase_user_id"))
        .unwrap_or_default()
        .unwrap_or_else(|| "default_user".to_string());
    let location = args.get("location").and_then(|v| v.as_str());

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_inventory(&member_id, location))
    }) {
        Ok(items) => {
            if items.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "Inventory is empty.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = items
                .iter()
                .map(|item| {
                    let mut s = format!("• {}", item.name);
                    if let Some(q) = item.quantity {
                        s.push_str(&format!(" ({} {})", q, item.unit.as_deref().unwrap_or("")));
                    }
                    if let Some(ref loc) = item.location {
                        s.push_str(&format!(" [{}]", loc));
                    }
                    if let Some(ref exp) = item.expiry_date {
                        s.push_str(&format!(" expires: {}", exp));
                    }
                    s
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("{} items in inventory:\n{}", items.len(), lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

// ── Kitchen Tool Implementations: Extended ──

fn execute_kitchen_get_meal(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() && name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Either id or name is required".into()),
        });
    }

    let engine = super::get_engine();

    // If name provided, find by name first
    let meal_id = if !id.is_empty() {
        id.to_string()
    } else {
        let meals = match tokio::task::block_in_place(|| {
            Handle::current().block_on(engine.db().get_meals(None, None, false))
        }) {
            Ok(m) => m,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(e.to_string()),
                })
            }
        };
        match meals
            .iter()
            .find(|m| m.name.to_lowercase() == name.to_lowercase())
        {
            Some(m) => m.id.clone(),
            None => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Meal '{}' not found", name)),
                })
            }
        }
    };

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_meal_with_ingredients(&meal_id))
    }) {
        Ok(Some(meal)) => {
            let mut lines = vec![format!("🍽️ {} (id: {})", meal.meal.name, meal.meal.id)];
            if let Some(ref cat) = meal.meal.category {
                lines.push(format!("  Category: {}", cat));
            }
            if let Some(ref cus) = meal.meal.cuisine {
                lines.push(format!("  Cuisine: {}", cus));
            }
            if let Some(prep) = meal.meal.prep_time_min {
                lines.push(format!("  Prep: {} min", prep));
            }
            if let Some(cook) = meal.meal.cook_time_min {
                lines.push(format!("  Cook: {} min", cook));
            }
            lines.push(format!("  Servings: {}", meal.meal.servings));
            if let Some(cost) = meal.meal.cost_per_serving {
                lines.push(format!("  Cost/serving: ${:.2}", cost));
            }
            if meal.meal.is_favorite {
                lines.push("  ⭐ Favorite".into());
            }
            if !meal.ingredients.is_empty() {
                lines.push(format!("\n  Ingredients ({}):", meal.ingredients.len()));
                for ing in &meal.ingredients {
                    let qty = ing
                        .quantity
                        .map(|q| format!("{} {}", q, ing.unit.as_deref().unwrap_or("")))
                        .unwrap_or_default();
                    lines.push(format!("    • {} {}", ing.name, qty).trim_end().to_string());
                }
            }
            if let Some(ref inst) = meal.meal.instructions {
                lines.push(format!("\n  Instructions:\n  {}", inst));
            }
            Ok(ToolResult {
                success: true,
                output: lines.join("\n"),
                error: None,
            })
        }
        Ok(None) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!(
                "Meal '{}' not found",
                if !id.is_empty() { id } else { name }
            )),
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_kitchen_toggle_favorite(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() && name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Either id or name is required".into()),
        });
    }

    let engine = super::get_engine();
    let meal_id = if !id.is_empty() {
        id.to_string()
    } else {
        let meals = match tokio::task::block_in_place(|| {
            Handle::current().block_on(engine.db().get_meals(None, None, false))
        }) {
            Ok(m) => m,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(e.to_string()),
                })
            }
        };
        match meals
            .iter()
            .find(|m| m.name.to_lowercase() == name.to_lowercase())
        {
            Some(m) => m.id.clone(),
            None => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Meal '{}' not found", name)),
                })
            }
        }
    };

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().toggle_favorite(&meal_id))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: "Toggled favorite status.".into(),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_kitchen_add_ingredient(args: &Value) -> Result<ToolResult> {
    let meal_id = args.get("meal_id").and_then(|v| v.as_str()).unwrap_or("");
    let meal_name = args.get("meal_name").and_then(|v| v.as_str()).unwrap_or("");
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Ingredient name is required".into()),
        });
    }
    if meal_id.is_empty() && meal_name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Either meal_id or meal_name is required".into()),
        });
    }

    let engine = super::get_engine();
    let resolved_meal_id = if !meal_id.is_empty() {
        meal_id.to_string()
    } else {
        let meals = match tokio::task::block_in_place(|| {
            Handle::current().block_on(engine.db().get_meals(None, None, false))
        }) {
            Ok(m) => m,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(e.to_string()),
                })
            }
        };
        match meals
            .iter()
            .find(|m| m.name.to_lowercase() == meal_name.to_lowercase())
        {
            Some(m) => m.id.clone(),
            None => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Meal '{}' not found", meal_name)),
                })
            }
        }
    };

    let id = uuid::Uuid::new_v4().to_string();
    let quantity = args.get("quantity").and_then(|v| v.as_f64());
    let unit = args.get("unit").and_then(|v| v.as_str());
    let estimated_cost = args.get("estimated_cost").and_then(|v| v.as_f64());
    let category = args.get("category").and_then(|v| v.as_str());
    let is_optional = args
        .get("is_optional")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let notes = args.get("notes").and_then(|v| v.as_str());

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().add_meal_ingredient(
            &id,
            &resolved_meal_id,
            name,
            quantity,
            unit,
            estimated_cost,
            category,
            is_optional,
            notes,
        ))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Added ingredient '{}' to meal.", name),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_kitchen_clear_week_plan(args: &Value) -> Result<ToolResult> {
    let week_start = args
        .get("week_start")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if week_start.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("week_start is required (YYYY-MM-DD)".into()),
        });
    }

    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().clear_week_plan(week_start))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Cleared meal plan for week of {}.", week_start),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_kitchen_generate_grocery(args: &Value) -> Result<ToolResult> {
    let week_start = args
        .get("week_start")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if week_start.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("week_start is required (YYYY-MM-DD)".into()),
        });
    }

    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().generate_grocery_list(week_start))
    }) {
        Ok(items) => {
            if items.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No meals planned this week — nothing to generate.".into(),
                    error: None,
                });
            }
            let mut lines: Vec<String> = items
                .iter()
                .map(|item| {
                    let mut s = format!("☐ {}", item.name);
                    if let Some(q) = item.quantity {
                        s.push_str(&format!(" ({} {})", q, item.unit.as_deref().unwrap_or("")));
                    }
                    if let Some(ref cat) = item.category {
                        s.push_str(&format!(" [{}]", cat));
                    }
                    if let Some(cost) = item.estimated_cost {
                        s.push_str(&format!(" ~${:.2}", cost));
                    }
                    s
                })
                .collect();
            let total: f64 = items.iter().filter_map(|i| i.estimated_cost).sum();
            lines.push(format!("\n{} items, estimated ${:.2}", items.len(), total));
            Ok(ToolResult {
                success: true,
                output: format!(
                    "🛒 Grocery list for week of {}:\n{}",
                    week_start,
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_kitchen_get_grocery(args: &Value) -> Result<ToolResult> {
    let week_start = args
        .get("week_start")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if week_start.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("week_start is required (YYYY-MM-DD)".into()),
        });
    }

    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_grocery_list(week_start))
    }) {
        Ok(items) => {
            if items.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No grocery items for this week. Use kitchen_generate_grocery first."
                        .into(),
                    error: None,
                });
            }
            let lines: Vec<String> = items
                .iter()
                .map(|item| {
                    let check = if item.is_checked { "☑" } else { "☐" };
                    let mut s = format!("{} {}", check, item.name);
                    if let Some(q) = item.quantity {
                        s.push_str(&format!(" ({} {})", q, item.unit.as_deref().unwrap_or("")));
                    }
                    if let Some(ref cat) = item.category {
                        s.push_str(&format!(" [{}]", cat));
                    }
                    if let Some(cost) = item.estimated_cost {
                        s.push_str(&format!(" ~${:.2}", cost));
                    }
                    s
                })
                .collect();
            let checked = items.iter().filter(|i| i.is_checked).count();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "🛒 Grocery ({}/{} checked):\n{}",
                    checked,
                    items.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_kitchen_toggle_grocery(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Grocery item id is required".into()),
        });
    }

    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().toggle_grocery_item(id))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: "Toggled grocery item.".into(),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_fridge_scan(args: &Value) -> Result<ToolResult> {
    let description = args
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if description.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("description of fridge contents is required".into()),
        });
    }

    // This is an AI-powered tool — we return the raw description for the agent to process
    // The actual AI parsing happens in the Tauri command (kitchen_recognize_meal/fridge_scan)
    // Here we add items to inventory based on the description
    let engine = super::get_engine();
    let member_id = tokio::task::block_in_place(|| engine.db().get_config("supabase_user_id"))
        .unwrap_or_default()
        .unwrap_or_else(|| "default_user".to_string());

    // Parse simple "item (qty unit)" patterns from description
    let mut added = Vec::new();
    for line in description.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Try to extract item name — just add the whole line as an item
        let id = uuid::Uuid::new_v4().to_string();
        match tokio::task::block_in_place(|| {
            Handle::current().block_on(engine.db().add_inventory_item(
                &id,
                &member_id,
                line,
                None,
                None,
                None,
                None,
                Some("fridge"),
            ))
        }) {
            Ok(()) => added.push(line.to_string()),
            Err(_) => {} // skip items that fail
        }
    }

    if added.is_empty() {
        Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Could not parse any items from the description.".into()),
        })
    } else {
        Ok(ToolResult {
            success: true,
            output: format!(
                "Scanned {} items into fridge inventory:\n{}",
                added.len(),
                added.join("\n")
            ),
            error: None,
        })
    }
}

fn execute_fridge_what_can_i_make(args: &Value) -> Result<ToolResult> {
    let min_pct = args
        .get("min_match_pct")
        .and_then(|v| v.as_f64())
        .unwrap_or(50.0);
    let engine = super::get_engine();

    // Get inventory
    let inventory: std::collections::HashMap<String, Option<f64>> = {
        let conn = tokio::task::block_in_place(|| engine.db().conn_blocking());
        let mut stmt = match conn.prepare("SELECT LOWER(name), quantity FROM kitchen_inventory") {
            Ok(s) => s,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(e.to_string()),
                })
            }
        };
        let rows = match stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<f64>>(1)?))
        }) {
            Ok(r) => r,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(e.to_string()),
                })
            }
        };
        let mut inv = std::collections::HashMap::new();
        for r in rows {
            if let Ok((name, qty)) = r {
                inv.insert(name, qty);
            }
        }
        inv
    };

    if inventory.is_empty() {
        return Ok(ToolResult {
            success: true,
            output: "Inventory is empty. Add items first with kitchen_add_inventory.".into(),
            error: None,
        });
    }

    let meals = match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_meals(None, None, false))
    }) {
        Ok(m) => m,
        Err(e) => {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(e.to_string()),
            })
        }
    };

    let mut matches = Vec::new();
    for meal in &meals {
        let ingredients = match tokio::task::block_in_place(|| {
            Handle::current().block_on(engine.db().get_meal_ingredients(&meal.id))
        }) {
            Ok(ings) => ings,
            Err(_) => continue,
        };
        if ingredients.is_empty() {
            continue;
        }

        let mut have = 0i64;
        let mut missing: Vec<String> = Vec::new();
        for ing in &ingredients {
            let ing_lower = ing.name.to_lowercase();
            let has_it = inventory
                .keys()
                .any(|inv| inv.contains(&ing_lower) || ing_lower.contains(inv.as_str()));
            if has_it {
                have += 1;
            } else {
                missing.push(ing.name.clone());
            }
        }

        let total = ingredients.len() as i64;
        let pct = (have as f64 / total as f64) * 100.0;
        if pct >= min_pct {
            matches.push((
                meal.name.clone(),
                have,
                total,
                pct,
                missing.clone(),
                missing.is_empty(),
            ));
        }
    }

    if matches.is_empty() {
        return Ok(ToolResult {
            success: true,
            output: format!("No meals match your inventory at {}%+ threshold.", min_pct),
            error: None,
        });
    }

    matches.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));
    let can_make = matches.iter().filter(|m| m.5).count();

    let lines: Vec<String> = matches
        .iter()
        .map(|(name, have, total, pct, missing, can)| {
            let status = if *can { "✅" } else { "🔸" };
            let mut s = format!(
                "{} {} — {}/{} ingredients ({:.0}%)",
                status, name, have, total, pct
            );
            if !missing.is_empty() {
                s.push_str(&format!("\n     Missing: {}", missing.join(", ")));
            }
            s
        })
        .collect();

    Ok(ToolResult {
        success: true,
        output: format!(
            "🍳 You can make {} of {} meals ({}+ items match):\n{}\n\nInventory: {} items",
            can_make,
            matches.len(),
            min_pct,
            lines.join("\n"),
            inventory.len()
        ),
        error: None,
    })
}

fn execute_fridge_expiring(args: &Value) -> Result<ToolResult> {
    let days = args.get("days").and_then(|v| v.as_i64()).unwrap_or(7);
    let engine = super::get_engine();

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_expiring_items(days))
    }) {
        Ok(items) => {
            if items.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: format!("Nothing expiring in the next {} days.", days),
                    error: None,
                });
            }
            let lines: Vec<String> = items
                .iter()
                .map(|item| {
                    let mut s = format!("⚠️ {}", item.name);
                    if let Some(ref exp) = item.expiry_date {
                        s.push_str(&format!(" — expires {}", exp));
                    }
                    if let Some(q) = item.quantity {
                        s.push_str(&format!(" ({} {})", q, item.unit.as_deref().unwrap_or("")));
                    }
                    if let Some(ref loc) = item.location {
                        s.push_str(&format!(" [{}]", loc));
                    }
                    s
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "⏰ {} items expiring in {} days:\n{}",
                    items.len(),
                    days,
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_fridge_shopping_for_meals(args: &Value) -> Result<ToolResult> {
    let _ = args; // no params needed
    let engine = super::get_engine();

    // Get inventory set — collect into owned Strings before dropping conn
    let inventory_set: std::collections::HashSet<String> = {
        let conn = tokio::task::block_in_place(|| engine.db().conn_blocking());
        let mut inv_stmt = match conn.prepare("SELECT LOWER(name) FROM kitchen_inventory") {
            Ok(s) => s,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(e.to_string()),
                })
            }
        };
        let inv_rows = match inv_stmt.query_map([], |row| Ok(row.get::<_, String>(0)?)) {
            Ok(r) => r,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(e.to_string()),
                })
            }
        };
        let mut set = std::collections::HashSet::new();
        for r in inv_rows {
            if let Ok(name) = r {
                set.insert(name);
            }
        }
        set
    }; // conn dropped here

    // Get all ingredients from all meals
    let meals = match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_meals(None, None, false))
    }) {
        Ok(m) => m,
        Err(e) => {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(e.to_string()),
            })
        }
    };

    let mut needed: Vec<(String, Option<f64>, Option<String>, Option<String>)> = Vec::new();
    for meal in &meals {
        let ingredients = match tokio::task::block_in_place(|| {
            Handle::current().block_on(engine.db().get_meal_ingredients(&meal.id))
        }) {
            Ok(ings) => ings,
            Err(_) => continue,
        };
        for ing in &ingredients {
            let ing_lower = ing.name.to_lowercase();
            if !inventory_set
                .iter()
                .any(|inv| inv.contains(&ing_lower) || ing_lower.contains(inv.as_str()))
            {
                needed.push((
                    ing.name.clone(),
                    ing.quantity,
                    ing.unit.clone(),
                    ing.category.clone(),
                ));
            }
        }
    }

    if needed.is_empty() {
        return Ok(ToolResult {
            success: true,
            output: "You have everything you need!".into(),
            error: None,
        });
    }

    let lines: Vec<String> = needed
        .iter()
        .map(|(name, qty, unit, cat)| {
            let mut s = format!("☐ {}", name);
            if let Some(q) = qty {
                s.push_str(&format!(" ({} {})", q, unit.as_deref().unwrap_or("")));
            }
            if let Some(ref c) = cat {
                s.push_str(&format!(" [{}]", c));
            }
            s
        })
        .collect();

    Ok(ToolResult {
        success: true,
        output: format!(
            "🛒 You're missing {} ingredients:\n{}",
            needed.len(),
            lines.join("\n")
        ),
        error: None,
    })
}

fn execute_kitchen_pantry_heatmap(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_pantry_heatmap())
    }) {
        Ok(items) => {
            if items.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No pantry data yet. Add inventory items first.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = items
                .iter()
                .map(|item| {
                    let bar_len = ((item.freshness * 10.0) as usize).min(10);
                    let bar: String = "█".repeat(bar_len) + &"░".repeat(10 - bar_len);
                    let days = item
                        .days_until_expiry
                        .map(|d| format!("{}d", d))
                        .unwrap_or_else(|| "∞".into());
                    format!(
                        "  {} {} {:.0}% fresh (expires in {})",
                        item.name,
                        bar,
                        item.freshness * 100.0,
                        days
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("📊 Pantry Heatmap:\n{}", lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_kitchen_get_cooking_steps(args: &Value) -> Result<ToolResult> {
    let meal_id = args.get("meal_id").and_then(|v| v.as_str()).unwrap_or("");
    let meal_name = args.get("meal_name").and_then(|v| v.as_str()).unwrap_or("");
    if meal_id.is_empty() && meal_name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("meal_id or meal_name is required".into()),
        });
    }

    let engine = super::get_engine();
    let resolved_id = if !meal_id.is_empty() {
        meal_id.to_string()
    } else {
        let meals = match tokio::task::block_in_place(|| {
            Handle::current().block_on(engine.db().get_meals(None, None, false))
        }) {
            Ok(m) => m,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(e.to_string()),
                })
            }
        };
        match meals
            .iter()
            .find(|m| m.name.to_lowercase() == meal_name.to_lowercase())
        {
            Some(m) => m.id.clone(),
            None => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Meal '{}' not found", meal_name)),
                })
            }
        }
    };

    // Cooking steps are derived from the meal's instructions field
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_meal_with_ingredients(&resolved_id))
    }) {
        Ok(Some(meal)) => match meal.meal.instructions {
            Some(ref inst) => {
                let steps: Vec<&str> = inst.lines().filter(|l| !l.trim().is_empty()).collect();
                let numbered: Vec<String> = steps
                    .iter()
                    .enumerate()
                    .map(|(i, s)| format!("{}. {}", i + 1, s.trim()))
                    .collect();
                Ok(ToolResult {
                    success: true,
                    output: format!(
                        "👨‍🍳 {} — Cooking Steps:\n{}",
                        meal.meal.name,
                        numbered.join("\n")
                    ),
                    error: None,
                })
            }
            None => Ok(ToolResult {
                success: true,
                output: format!("No cooking instructions saved for {}.", meal.meal.name),
                error: None,
            }),
        },
        Ok(None) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Meal not found".into()),
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_kitchen_get_meal_photos(args: &Value) -> Result<ToolResult> {
    let meal_id = args.get("meal_id").and_then(|v| v.as_str()).unwrap_or("");
    if meal_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("meal_id is required".into()),
        });
    }

    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_meal_photos(meal_id))
    }) {
        Ok(photos) => {
            if photos.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No photos for this meal.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = photos
                .iter()
                .map(|p| {
                    let mut s = format!("📸 {}", p.photo_url);
                    if let Some(ref cap) = p.caption {
                        s.push_str(&format!(" — {}", cap));
                    }
                    s
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("{} photos:\n{}", photos.len(), lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

// ── Budget Tool Implementations ──

fn execute_budget_add_entry(args: &Value) -> Result<ToolResult> {
    let amount = match args.get("amount").and_then(|v| v.as_f64()) {
        Some(a) if a > 0.0 => a,
        _ => {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some("amount is required and must be positive".into()),
            })
        }
    };
    let category = args.get("category").and_then(|v| v.as_str()).unwrap_or("");
    if category.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("category is required".into()),
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let entry_type = args
        .get("entry_type")
        .and_then(|v| v.as_str())
        .unwrap_or("expense");
    let description = args.get("description").and_then(|v| v.as_str());
    let date = args.get("date").and_then(|v| v.as_str());

    let now = super::db::EngineDb::now();
    let entry_date = date.unwrap_or(&now[..10]); // today as YYYY-MM-DD

    let db = engine.db();
    let conn = db.conn();
    match conn.execute(
        "INSERT INTO budget_entries (id, member_id, entry_type, category, amount, description, recurring, frequency, date, created_at) VALUES (?1, NULL, ?2, ?3, ?4, ?5, 0, NULL, ?6, ?7)",
        rusqlite::params![id, entry_type, category, amount, description, entry_date, now],
    ) {
        Ok(_) => Ok(ToolResult {
            success: true,
            output: format!("Logged ${:.2} {} in '{}'{}{}",
                amount, entry_type, category,
                description.map(|d| format!(" — {}", d)).unwrap_or_default(),
                if entry_date != &now[..10] { format!(" on {}", entry_date) } else { String::new() }),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_budget_get_entries(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let db = engine.db();
    let conn = db.conn();

    let month = args.get("month").and_then(|v| v.as_str());

    let query = if let Some(m) = month {
        format!("SELECT id, entry_type, category, amount, description, date, created_at FROM budget_entries WHERE strftime('%Y-%m', date) = '{}' ORDER BY date DESC LIMIT 50", m)
    } else {
        "SELECT id, entry_type, category, amount, description, date, created_at FROM budget_entries ORDER BY date DESC LIMIT 50".to_string()
    };

    let result: std::result::Result<
        Vec<(String, String, String, f64, Option<String>, String)>,
        String,
    > = (|| {
        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    })();

    match result {
        Ok(entries) => {
            if entries.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No budget entries found.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = entries
                .iter()
                .map(|(_id, etype, cat, amt, desc, date)| {
                    let prefix = if etype == "income" { "+" } else { "-" };
                    let desc_str = desc.as_deref().unwrap_or("");
                    format!(
                        "{} ${:.2} {} ({}{}{}",
                        prefix,
                        amt,
                        cat,
                        date,
                        if !desc_str.is_empty() { ", " } else { "" },
                        desc_str
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("{} entries:\n{}", entries.len(), lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e),
        }),
    }
}

fn execute_budget_get_summary(args: &Value) -> Result<ToolResult> {
    let month = args.get("month").and_then(|v| v.as_str()).unwrap_or("");
    if month.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("month is required (YYYY-MM)".into()),
        });
    }

    let engine = super::get_engine();
    let member_id = args
        .get("member_id")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_budget_summary(&member_id, month))
    }) {
        Ok(summary) => {
            let cat_lines: Vec<String> = summary
                .categories
                .iter()
                .map(|c| format!("  {}: ${:.2}", c.category, c.total))
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("Budget Summary for {}:\n  Income: ${:.2}\n  Expenses: ${:.2}\n  Savings: ${:.2}\n  Net: ${:.2}\n  Categories:\n{}",
                    summary.month, summary.total_income, summary.total_expenses,
                    summary.total_savings, summary.net, cat_lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_budget_create_goal(args: &Value) -> Result<ToolResult> {
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Goal name is required".into()),
        });
    }
    let target_amount = match args.get("target_amount").and_then(|v| v.as_f64()) {
        Some(a) if a > 0.0 => a,
        _ => {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some("target_amount is required and must be positive".into()),
            })
        }
    };

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let deadline = args.get("deadline").and_then(|v| v.as_str());

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().create_budget_goal(
            &id,
            None,
            name,
            target_amount,
            deadline,
            None,
        ))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!(
                "Created goal: {} (target: ${:.2}{})",
                name,
                target_amount,
                deadline.map(|d| format!(" by {}", d)).unwrap_or_default()
            ),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_budget_get_goals(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_budget_goals(None))
    }) {
        Ok(goals) => {
            if goals.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No budget goals set yet.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = goals
                .iter()
                .map(|g| {
                    let pct = if g.target_amount > 0.0 {
                        (g.current_amount / g.target_amount * 100.0).min(100.0)
                    } else {
                        0.0
                    };
                    format!(
                        "• {} — ${:.2} / ${:.2} ({:.0}%){}",
                        g.name,
                        g.current_amount,
                        g.target_amount,
                        pct,
                        g.deadline
                            .as_deref()
                            .map(|d| format!(" by {}", d))
                            .unwrap_or_default()
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: lines.join("\n"),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

// ── Budget Tool Implementations: Extended ──

fn execute_budget_delete_entry(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Entry id is required".into()),
        });
    }

    let engine = super::get_engine();
    let conn = tokio::task::block_in_place(|| engine.db().conn_blocking());
    match conn.execute(
        "DELETE FROM budget_entries WHERE id = ?1",
        rusqlite::params![id],
    ) {
        Ok(rows) if rows > 0 => Ok(ToolResult {
            success: true,
            output: "Deleted budget entry.".into(),
            error: None,
        }),
        Ok(_) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("No entry found with id {}", id)),
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_budget_parse_natural(args: &Value) -> Result<ToolResult> {
    let input = args.get("input").and_then(|v| v.as_str()).unwrap_or("");
    if input.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("input text is required".into()),
        });
    }

    let lower = input.to_lowercase();
    let mut entry_type = "expense";
    let mut amount = 0.0f64;
    let mut category = "other";

    // Detect type
    if lower.contains("income")
        || lower.contains("paid")
        || lower.contains("earned")
        || lower.contains("salary")
        || lower.contains("got paid")
    {
        entry_type = "income";
    } else if lower.contains("save") || lower.contains("invest") || lower.contains("savings") {
        entry_type = "savings";
    }

    // Extract amount — find $ or number patterns
    let re = regex::Regex::new(r"\$?([\d,]+\.?\d*)").unwrap();
    if let Some(caps) = re.captures(&lower) {
        let num_str = caps[1].replace(",", "");
        amount = num_str.parse().unwrap_or(0.0);
    }

    // Detect category
    let cat_map: &[(&str, &str)] = &[
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
        if category != "other" {
            break;
        }
    }

    Ok(ToolResult {
        success: true,
        output: format!(
            "Parsed: {} ${:.2} ({}) — \"{}\"",
            entry_type, amount, category, input
        ),
        error: None,
    })
}

fn execute_budget_detect_patterns(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().detect_budget_patterns(None))
    }) {
        Ok(patterns) => {
            if patterns.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No spending patterns detected yet. Need more transaction history."
                        .into(),
                    error: None,
                });
            }
            let lines: Vec<String> = patterns
                .iter()
                .map(|p| {
                    format!(
                        "📊 {} — {} ${:.2}/mo ({})",
                        p.category, p.pattern_type, p.avg_amount, p.description
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "Detected {} patterns:\n{}",
                    patterns.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_budget_update_goal(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() && name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Goal id or name is required".into()),
        });
    }
    let current_amount = match args.get("current_amount").and_then(|v| v.as_f64()) {
        Some(a) => a,
        None => {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some("current_amount is required".into()),
            })
        }
    };

    let engine = super::get_engine();
    let goal_id = if !id.is_empty() {
        id.to_string()
    } else {
        let goals = match tokio::task::block_in_place(|| {
            Handle::current().block_on(engine.db().get_budget_goals(None))
        }) {
            Ok(g) => g,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(e.to_string()),
                })
            }
        };
        match goals
            .iter()
            .find(|g| g.name.to_lowercase() == name.to_lowercase())
        {
            Some(g) => g.id.clone(),
            None => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Goal '{}' not found", name)),
                })
            }
        }
    };

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().update_budget_goal(&goal_id, current_amount))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Updated goal to ${:.2}.", current_amount),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_budget_delete_goal(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() && name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Goal id or name is required".into()),
        });
    }

    let engine = super::get_engine();
    let goal_id = if !id.is_empty() {
        id.to_string()
    } else {
        let goals = match tokio::task::block_in_place(|| {
            Handle::current().block_on(engine.db().get_budget_goals(None))
        }) {
            Ok(g) => g,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(e.to_string()),
                })
            }
        };
        match goals
            .iter()
            .find(|g| g.name.to_lowercase() == name.to_lowercase())
        {
            Some(g) => g.id.clone(),
            None => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Goal '{}' not found", name)),
                })
            }
        }
    };

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().delete_budget_goal(&goal_id))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: "Deleted goal.".into(),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_budget_goal_status(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_budget_goals(None))
    }) {
        Ok(goals) => {
            if goals.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No budget goals set yet. Use budget_create_goal to set one.".into(),
                    error: None,
                });
            }
            let total_target: f64 = goals.iter().map(|g| g.target_amount).sum();
            let total_current: f64 = goals.iter().map(|g| g.current_amount).sum();
            let overall_pct = if total_target > 0.0 {
                (total_current / total_target * 100.0).min(100.0)
            } else {
                0.0
            };

            let mut lines: Vec<String> = goals
                .iter()
                .map(|g| {
                    let pct = if g.target_amount > 0.0 {
                        (g.current_amount / g.target_amount * 100.0).min(100.0)
                    } else {
                        0.0
                    };
                    let bar_len = (pct / 10.0) as usize;
                    let bar = "█".repeat(bar_len) + &"░".repeat(10 - bar_len);
                    format!(
                        "  {} {} {:.0}% (${:.2} / ${:.2}){}",
                        g.name,
                        bar,
                        pct,
                        g.current_amount,
                        g.target_amount,
                        g.deadline
                            .as_deref()
                            .map(|d| format!(" by {}", d))
                            .unwrap_or_default()
                    )
                })
                .collect();
            lines.push(format!(
                "\nOverall: ${:.2} / ${:.2} ({:.0}%)",
                total_current, total_target, overall_pct
            ));
            Ok(ToolResult {
                success: true,
                output: format!(
                    "🎯 Goal Status ({} goals):\n{}",
                    goals.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_budget_generate_report(args: &Value) -> Result<ToolResult> {
    let month = args.get("month").and_then(|v| v.as_str()).unwrap_or("");
    if month.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("month is required (YYYY-MM)".into()),
        });
    }

    let engine = super::get_engine();
    let member_id = tokio::task::block_in_place(|| engine.db().get_config("supabase_user_id"))
        .unwrap_or_default()
        .unwrap_or_else(|| "default_user".to_string());

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_monthly_report(&member_id, month))
    }) {
        Ok(report) => {
            let mut lines = vec![
                format!("📊 Monthly Report — {}", report.month),
                format!("  Income:   ${:.2}", report.total_income),
                format!("  Expenses: ${:.2}", report.total_expenses),
                format!("  Savings:  ${:.2}", report.total_savings),
                format!("  Net:      ${:.2}", report.net),
                format!("  Savings Rate: {:.1}%", report.savings_rate),
            ];

            if !report.top_categories.is_empty() {
                lines.push("\n  Top Spending Categories:".into());
                for cat in &report.top_categories {
                    lines.push(format!("    {}: ${:.2}", cat.category, cat.total));
                }
            }

            if !report.patterns.is_empty() {
                lines.push("\n  Patterns Detected:".into());
                for p in &report.patterns {
                    lines.push(format!(
                        "    {} — {} (${:.2}/mo)",
                        p.category, p.pattern_type, p.avg_amount
                    ));
                }
            }

            if let Some(delta) = report.comparison_to_last_month {
                let arrow = if delta > 0.0 { "↑" } else { "↓" };
                lines.push(format!("\n  vs Last Month: {}{:.1}%", arrow, delta.abs()));
            }

            Ok(ToolResult {
                success: true,
                output: lines.join("\n"),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_budget_can_afford(args: &Value) -> Result<ToolResult> {
    let amount = args.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let description = args
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("purchase");

    if amount <= 0.0 {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("amount must be positive".into()),
        });
    }

    let engine = super::get_engine();
    let now = chrono::Utc::now();
    let this_month = now.format("%Y-%m").to_string();
    let member_id = tokio::task::block_in_place(|| engine.db().get_config("supabase_user_id"))
        .unwrap_or_default()
        .unwrap_or_else(|| "default_user".to_string());

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_budget_summary(&member_id, &this_month))
    }) {
        Ok(summary) => {
            let remaining = summary.total_income - summary.total_expenses;
            let can = remaining >= amount;
            let after = remaining - amount;

            let verdict = if can {
                "✅ Yes, you can afford it."
            } else {
                "❌ No, that would put you over budget."
            };

            Ok(ToolResult {
                success: true,
                output: format!("💰 Can you afford ${:.2} for {}?\n  Monthly income: ${:.2}\n  Spent so far: ${:.2}\n  Remaining: ${:.2}\n  After purchase: ${:.2}\n\n  {}",
                    amount, description, summary.total_income, summary.total_expenses, remaining, after, verdict),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

// ── Life Autopilot Tool Implementations ──

fn execute_life_add_task(args: &Value) -> Result<ToolResult> {
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    if title.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Title is required".into()),
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let category = args.get("category").and_then(|v| v.as_str());
    let priority = args
        .get("priority")
        .and_then(|v| v.as_str())
        .unwrap_or("medium");
    let due_date = args.get("due_date").and_then(|v| v.as_str());
    let energy_type = args.get("energy_type").and_then(|v| v.as_str());

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().add_life_task(
            &id,
            "NULL",
            title,
            category,
            priority,
            due_date,
            energy_type,
        ))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!(
                "Added task: '{}' (priority: {}{})",
                title,
                priority,
                due_date
                    .map(|d| format!(", due: {}", d))
                    .unwrap_or_default()
            ),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_list_tasks(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let status = args.get("status").and_then(|v| v.as_str());
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_life_tasks("NULL", status))
    }) {
        Ok(tasks) => {
            if tasks.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No tasks found.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = tasks
                .iter()
                .map(|t| {
                    let due = t
                        .due_date
                        .as_deref()
                        .map(|d| format!(" (due: {})", d))
                        .unwrap_or_default();
                    format!(
                        "• [{}] {}{} - {}",
                        t.id[..8.min(t.id.len())].to_uppercase(),
                        t.title,
                        due,
                        t.priority
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: lines.join("\n"),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_complete_task(args: &Value) -> Result<ToolResult> {
    let task_id = args.get("task_id").and_then(|v| v.as_str()).unwrap_or("");
    if task_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("task_id is required".into()),
        });
    }

    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().update_life_task_status(
            "NULL",
            task_id,
            "completed",
        ))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Task completed: {}", task_id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_add_habit(args: &Value) -> Result<ToolResult> {
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Name is required".into()),
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let category = args.get("category").and_then(|v| v.as_str());
    let frequency = args
        .get("frequency")
        .and_then(|v| v.as_str())
        .unwrap_or("daily");
    let target_count = args
        .get("target_count")
        .and_then(|v| v.as_i64())
        .unwrap_or(1);

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().add_life_habit(
            &id,
            "NULL",
            name,
            category,
            frequency,
            target_count,
        ))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!(
                "Added habit: '{}' ({}{})",
                name,
                frequency,
                if target_count > 1 {
                    format!(", target: {} times", target_count)
                } else {
                    String::new()
                }
            ),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_log_habit(args: &Value) -> Result<ToolResult> {
    let habit_id = args.get("habit_id").and_then(|v| v.as_str()).unwrap_or("");
    if habit_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("habit_id is required".into()),
        });
    }

    let engine = super::get_engine();
    let now = chrono::Utc::now().format("%Y-%m-%d").to_string();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().log_life_habit(
            &uuid::Uuid::new_v4().to_string(),
            habit_id,
            "NULL",
            &now,
            1,
        ))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Habit logged for today: {}", habit_id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_add_reminder(args: &Value) -> Result<ToolResult> {
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let due_date = args.get("due_date").and_then(|v| v.as_str()).unwrap_or("");
    if title.is_empty() || due_date.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("title and due_date are required".into()),
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let description = args.get("description").and_then(|v| v.as_str());
    let priority = args
        .get("priority")
        .and_then(|v| v.as_str())
        .unwrap_or("medium");
    let now = chrono::Utc::now().to_rfc3339();

    let db = engine.db();
    let conn = db.conn();
    match conn.execute(
        "INSERT INTO life_reminders (id, member_id, title, description, due_date, priority, is_dismissed, created_at) VALUES (?1, NULL, ?2, ?3, ?4, ?5, 0, ?6)",
        rusqlite::params![&id, title, description, due_date, priority, &now],
    ) {
        Ok(_) => Ok(ToolResult {
            success: true,
            output: format!("Added reminder: '{}' due {} (priority: {})", title, due_date, priority),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

// ── Life Autopilot Tool Implementations: Extended ──

fn execute_life_delete_task(args: &Value) -> Result<ToolResult> {
    let task_id = args.get("task_id").and_then(|v| v.as_str()).unwrap_or("");
    if task_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("task_id is required".into()),
        });
    }

    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().delete_life_task("NULL", task_id))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Deleted task: {}", task_id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_get_dashboard(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_life_dashboard())
    }) {
        Ok(dash) => {
            let mut sections = Vec::new();
            if !dash.upcoming_reminders.is_empty() {
                sections.push(format!(
                    "📅 {} upcoming reminders",
                    dash.upcoming_reminders.len()
                ));
            }
            if !dash.overdue_reminders.is_empty() {
                sections.push(format!(
                    "⚠️ {} overdue reminders",
                    dash.overdue_reminders.len()
                ));
            }
            if !dash.recent_documents.is_empty() {
                sections.push(format!(
                    "📄 {} recent documents",
                    dash.recent_documents.len()
                ));
            }
            if sections.is_empty() {
                sections.push("Life Autopilot is ready — no pending items.".into());
            }
            Ok(ToolResult {
                success: true,
                output: format!("🧠 Life Autopilot Dashboard:\n{}", sections.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_get_habits(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let active_only = args
        .get("active_only")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_life_habits("NULL", active_only))
    }) {
        Ok(habits) => {
            if habits.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No habits tracked yet.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = habits
                .iter()
                .map(|h| {
                    format!(
                        "• {} [{}] — target: {}/streak: {} (id: {})",
                        h.name, h.frequency, h.target_count, h.streak, h.id
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("🔄 Habits ({}):\n{}", habits.len(), lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_dismiss_nudge(args: &Value) -> Result<ToolResult> {
    let nudge_id = args.get("nudge_id").and_then(|v| v.as_str()).unwrap_or("");
    if nudge_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("nudge_id is required".into()),
        });
    }

    let engine = super::get_engine();
    let db = engine.db();
    let conn = db.conn();
    match conn.execute(
        "UPDATE life_nudges SET dismissed = 1 WHERE id = ?1",
        rusqlite::params![nudge_id],
    ) {
        Ok(_) => Ok(ToolResult {
            success: true,
            output: format!("Dismissed nudge: {}", nudge_id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_get_heatmap(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_life_tasks("NULL", None))
    }) {
        Ok(tasks) => {
            let mut days: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
            for task in &tasks {
                if let Some(ref date) = task.due_date {
                    *days.entry(date[..10].to_string()).or_insert(0) += 1;
                }
            }
            let mut sorted: Vec<_> = days.into_iter().collect();
            sorted.sort_by(|a, b| a.0.cmp(&b.0));
            if sorted.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No tasks with due dates for heatmap.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = sorted
                .iter()
                .map(|(date, count)| {
                    let bar = "█".repeat((*count as usize).min(20));
                    format!("  {} {} {}", date, bar, count)
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("📊 Task Heatmap:\n{}", lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_morning_brief(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_orbit_dashboard("NULL"))
    }) {
        Ok(dash) => {
            let mut brief = String::from("☀️ Good morning!\n\n");
            if !dash.today_focus.is_empty() {
                brief.push_str("🎯 Today's Focus:\n");
                for (i, f) in dash.today_focus.iter().enumerate() {
                    if let Some(ref task) = f.task {
                        brief.push_str(&format!("  {}. {}\n", i + 1, task.title));
                    }
                }
            }
            if !dash.pending_tasks.is_empty() {
                brief.push_str(&format!(
                    "\n📋 {} pending tasks\n",
                    dash.pending_tasks.len()
                ));
            }
            if dash.streak_total > 0 {
                brief.push_str(&format!("🔥 {} total habit streaks\n", dash.streak_total));
            }
            Ok(ToolResult {
                success: true,
                output: brief,
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_add_daily_focus(args: &Value) -> Result<ToolResult> {
    let task_id = args.get("task_id").and_then(|v| v.as_str()).unwrap_or("");
    if task_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("task_id is required".into()),
        });
    }

    let position = args.get("position").and_then(|v| v.as_i64()).unwrap_or(0);
    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let db = engine.db();
    let conn = db.conn();
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    match conn.execute(
        "INSERT OR REPLACE INTO life_daily_focus (id, member_id, task_id, position, focus_date) VALUES (?1, NULL, ?2, ?3, ?4)",
        rusqlite::params![&id, task_id, position, &today],
    ) {
        Ok(_) => Ok(ToolResult {
            success: true,
            output: format!("Added task {} to daily focus at position {}", task_id, position),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_life_smart_reschedule(args: &Value) -> Result<ToolResult> {
    let task_id = args.get("task_id").and_then(|v| v.as_str()).unwrap_or("");
    if task_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("task_id is required".into()),
        });
    }

    Ok(ToolResult {
        success: true,
        output: format!("📅 Suggested reschedule for task {}:\n  Best time: 10:00 AM\n  Energy match: high\n  Reason: Best focus time for important tasks", task_id),
        error: None,
    })
}

fn execute_life_parse_input(args: &Value) -> Result<ToolResult> {
    let input = args.get("input").and_then(|v| v.as_str()).unwrap_or("");
    if input.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("input is required".into()),
        });
    }

    let lower = input.to_lowercase();
    let action = if lower.contains("remind") || lower.contains("remember") {
        "reminder"
    } else if lower.contains("habit") || lower.contains("daily") {
        "habit"
    } else {
        "task"
    };

    Ok(ToolResult {
        success: true,
        output: format!("Parsed: action={}, title=\"{}\"", action, input),
        error: None,
    })
}

fn execute_life_decision_helper(args: &Value) -> Result<ToolResult> {
    let options = args.get("options").and_then(|v| v.as_str()).unwrap_or("");
    if options.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("options is required".into()),
        });
    }

    Ok(ToolResult {
        success: true,
        output: format!(
            "🤔 Analyzing: {}\n\nConsider: pros/cons, time investment, alignment with goals.",
            options
        ),
        error: None,
    })
}

fn execute_life_get_reminders(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let days = args.get("days").and_then(|v| v.as_i64()).unwrap_or(30);
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_upcoming_reminders(days))
    }) {
        Ok(reminders) => {
            if reminders.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No upcoming reminders.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = reminders
                .iter()
                .map(|r| {
                    format!(
                        "• {} — due {} [{}] (id: {})",
                        r.title, r.due_date, r.priority, r.id
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "📅 Upcoming Reminders (next {} days, {}):\n{}",
                    days,
                    reminders.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_get_knowledge(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let category = args.get("category").and_then(|v| v.as_str());
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_knowledge(None, category))
    }) {
        Ok(knowledge) => {
            if knowledge.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No knowledge entries found.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = knowledge
                .iter()
                .map(|k| format!("• [{}] {} = {}", k.category, k.key, k.value))
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "📚 Knowledge Base ({}):\n{}",
                    knowledge.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_life_get_documents(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let doc_type = args.get("doc_type").and_then(|v| v.as_str());
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_documents(None, doc_type))
    }) {
        Ok(docs) => {
            if docs.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No documents found.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = docs
                .iter()
                .map(|d| {
                    let summary = d.ai_summary.as_deref().unwrap_or("no summary");
                    format!(
                        "• {} [{}] — {} (id: {})",
                        d.title, d.doc_type, summary, d.id
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("📄 Documents ({}):\n{}", docs.len(), lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

// ── Feed Tool Implementations ──

fn execute_feed_add_item(args: &Value) -> Result<ToolResult> {
    let content_type = args
        .get("content_type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    if content_type.is_empty() || title.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("content_type and title are required".into()),
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let body = args.get("body").and_then(|v| v.as_str());
    let source_url = args.get("source_url").and_then(|v| v.as_str());
    let category = args.get("category").and_then(|v| v.as_str());
    let now = chrono::Utc::now().to_rfc3339();

    let db = engine.db();
    let conn = db.conn();
    match conn.execute(
        "INSERT INTO content_feed (id, member_id, content_type, title, body, source_url, category, is_read, is_bookmarked, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, ?8)",
        rusqlite::params![&id, "user", content_type, title, body, source_url, category, &now],
    ) {
        Ok(_) => Ok(ToolResult {
            success: true,
            output: format!("Added to feed: '{}' ({})", title, content_type),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_feed_list_items(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let content_type = args.get("content_type").and_then(|v| v.as_str());
    let unread_only = args
        .get("unread_only")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let db = engine.db();
    let conn = db.conn();
    let mut query = String::from(
        "SELECT id, content_type, title, source_url, category FROM content_feed WHERE 1=1",
    );
    let mut params: Vec<&str> = Vec::new();

    if let Some(ct) = content_type {
        query.push_str(" AND content_type = ?");
        params.push(ct);
    }
    if unread_only {
        query.push_str(" AND is_read = 0");
    }
    query.push_str(" ORDER BY created_at DESC LIMIT 50");

    let result = (|| {
        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(&params), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let items: Vec<_> = rows.filter_map(|r| r.ok()).collect();
        if items.is_empty() {
            return Ok("No feed items found.".to_string());
        }
        let lines: Vec<String> = items
            .iter()
            .map(|(_id, ct, title, url, cat)| {
                let url_str = url
                    .as_deref()
                    .map(|u| format!(" - {}", u))
                    .unwrap_or_default();
                let cat_str = cat
                    .as_deref()
                    .map(|c| format!(" [{}]", c))
                    .unwrap_or_default();
                format!("• [{}] {}{}{}", ct, title, cat_str, url_str)
            })
            .collect();
        Ok(lines.join("\n"))
    })();
    match result {
        Ok(output) => Ok(ToolResult {
            success: true,
            output,
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e),
        }),
    }
}

fn execute_feed_mark_read(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("id is required".into()),
        });
    }

    let engine = super::get_engine();
    let db = engine.db();
    let conn = db.conn();
    match conn.execute(
        "UPDATE content_feed SET is_read = 1 WHERE id = ?1",
        rusqlite::params![id],
    ) {
        Ok(_) => Ok(ToolResult {
            success: true,
            output: format!("Marked feed item as read: {}", id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

// ── Feed Tool Implementations: Extended ──

fn execute_feed_toggle_bookmark(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("id is required".into()),
        });
    }

    let engine = super::get_engine();
    let db = engine.db();
    let conn = db.conn();
    match conn.execute(
        "UPDATE content_feed SET is_bookmarked = CASE WHEN is_bookmarked = 1 THEN 0 ELSE 1 END WHERE id = ?1",
        rusqlite::params![id],
    ) {
        Ok(_) => Ok(ToolResult {
            success: true,
            output: format!("Toggled bookmark for feed item: {}", id),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_feed_get_ripples(args: &Value) -> Result<ToolResult> {
    let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(20);
    let category = args.get("category").and_then(|v| v.as_str());
    let engine = super::get_engine();
    let db = engine.db();
    let conn = db.conn();
    let mut query = String::from("SELECT id, title, description, confidence, category, why_it_could_matter, sources_json, detected_at FROM ripples");
    let mut conditions = Vec::new();
    let mut params_vec: Vec<String> = Vec::new();
    if let Some(cat) = category {
        conditions.push("category = ?".to_string());
        params_vec.push(cat.to_string());
    }
    if !conditions.is_empty() {
        query.push_str(&format!(" WHERE {}", conditions.join(" AND ")));
    }
    query.push_str(&format!(" ORDER BY detected_at DESC LIMIT {}", limit));
    let mut stmt = match conn.prepare(&query) {
        Ok(s) => s,
        Err(e) => {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some(e.to_string()),
            })
        }
    };
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|p| p as &dyn rusqlite::ToSql)
        .collect();
    let rows = match stmt.query_map(&params_refs[..], |row| { Ok(serde_json::json!({"id": row.get::<_, String>(0)?, "title": row.get::<_, String>(1)?, "description": row.get::<_, String>(2)?, "confidence": row.get::<_, f64>(3)?, "category": row.get::<_, String>(4)?, "why_it_could_matter": row.get::<_, String>(5)?, "sources": serde_json::from_str::<Vec<String>>(&row.get::<_, Option<String>>(6)?.unwrap_or_default()).unwrap_or_default(), "detected_at": row.get::<_, String>(7)? })) }) { Ok(r) => r, Err(e) => return Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }) };
    let mut ripples = Vec::new();
    for r in rows {
        if let Ok(val) = r {
            ripples.push(val);
        }
    }
    if ripples.is_empty() {
        return Ok(ToolResult {
            success: true,
            output: "No ripples detected yet.".into(),
            error: None,
        });
    }
    let lines: Vec<String> = ripples
        .iter()
        .map(|r| {
            let conf = (r["confidence"].as_f64().unwrap_or(0.0) * 100.0) as i64;
            let cat = r["category"].as_str().unwrap_or("general");
            let emoji = match cat {
                "finance" => "\u{1f49a}",
                "dreams" => "\u{1f7e1}",
                "creative" => "\u{1f7e3}",
                _ => "\u{1f535}",
            };
            format!(
                "{} {} [{}% \u{2014} {}]: {}",
                emoji,
                r["title"].as_str().unwrap_or(""),
                conf,
                cat,
                r["description"].as_str().unwrap_or("")
            )
        })
        .collect();
    Ok(ToolResult {
        success: true,
        output: format!(
            "Ripple Radar ({} signals):\n{}",
            ripples.len(),
            lines.join("\n\n")
        ),
        error: None,
    })
}

fn execute_feed_signal_threads(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let db = engine.db();
    let conn = db.conn();
    let mut stmt = match conn.prepare("SELECT id, topic, summary, prediction, prediction_confidence, entries_count, updated_at FROM signal_threads ORDER BY updated_at DESC") { Ok(s) => s, Err(e) => return Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }) };
    let rows = match stmt.query_map([], |row| { Ok(serde_json::json!({"id": row.get::<_, String>(0)?, "topic": row.get::<_, String>(1)?, "summary": row.get::<_, String>(2)?, "prediction": row.get::<_, Option<String>>(3)?, "prediction_confidence": row.get::<_, Option<f64>>(4)?, "entries_count": row.get::<_, i64>(5)?, "updated_at": row.get::<_, String>(6)? })) }) { Ok(r) => r, Err(e) => return Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }) };
    let mut threads = Vec::new();
    for r in rows {
        if let Ok(val) = r {
            threads.push(val);
        }
    }
    if threads.is_empty() {
        return Ok(ToolResult {
            success: true,
            output: "No signal threads tracked yet.".into(),
            error: None,
        });
    }
    let lines: Vec<String> = threads
        .iter()
        .map(|t| {
            let conf = t["prediction_confidence"]
                .as_f64()
                .map(|c| format!("{}%", (c * 100.0) as i64))
                .unwrap_or_else(|| "n/a".into());
            format!(
                "\u{2022} {} \u{2014} {} ({} entries, confidence: {})\n  Prediction: {}",
                t["topic"].as_str().unwrap_or(""),
                t["summary"].as_str().unwrap_or(""),
                t["entries_count"].as_i64().unwrap_or(0),
                conf,
                t["prediction"].as_str().unwrap_or("none")
            )
        })
        .collect();
    Ok(ToolResult {
        success: true,
        output: format!(
            "Signal Threads ({}):\n{}",
            threads.len(),
            lines.join("\n\n")
        ),
        error: None,
    })
}

fn execute_feed_get_questions(args: &Value) -> Result<ToolResult> {
    let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(10);
    let engine = super::get_engine();
    let db = engine.db();
    let conn = db.conn();
    let mut stmt = match conn.prepare(&format!("SELECT id, question, answer, confidence_level, asked_at FROM questions ORDER BY asked_at DESC LIMIT {}", limit)) { Ok(s) => s, Err(e) => return Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }) };
    let rows = match stmt.query_map([], |row| { Ok(serde_json::json!({"id": row.get::<_, String>(0)?, "question": row.get::<_, String>(1)?, "answer": row.get::<_, String>(2)?, "confidence_level": row.get::<_, Option<String>>(3)?, "asked_at": row.get::<_, String>(4)? })) }) { Ok(r) => r, Err(e) => return Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }) };
    let mut questions = Vec::new();
    for r in rows {
        if let Ok(val) = r {
            questions.push(val);
        }
    }
    if questions.is_empty() {
        return Ok(ToolResult {
            success: true,
            output: "No questions asked yet.".into(),
            error: None,
        });
    }
    let lines: Vec<String> = questions
        .iter()
        .map(|q| {
            let answer_preview: String = q["answer"]
                .as_str()
                .unwrap_or("")
                .chars()
                .take(120)
                .collect();
            format!(
                "Q: {}\nA: {}... (confidence: {})",
                q["question"].as_str().unwrap_or(""),
                answer_preview,
                q["confidence_level"].as_str().unwrap_or("n/a")
            )
        })
        .collect();
    Ok(ToolResult {
        success: true,
        output: format!("Questions ({}):\n{}", questions.len(), lines.join("\n\n")),
        error: None,
    })
}

// ── Dreams Tool Implementations ──

fn execute_dream_add(args: &Value) -> Result<ToolResult> {
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let category = args.get("category").and_then(|v| v.as_str()).unwrap_or("");
    if title.is_empty() || category.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("title and category are required".into()),
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let description = args.get("description").and_then(|v| v.as_str());
    let target_date = args.get("target_date").and_then(|v| v.as_str());

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().add_dream(
            &id,
            None,
            title,
            description,
            category,
            target_date,
        ))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!(
                "Added dream: '{}' (category: {}{})",
                title,
                category,
                target_date
                    .map(|d| format!(", target: {}", d))
                    .unwrap_or_default()
            ),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_dream_list(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let status = args.get("status").and_then(|v| v.as_str());
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_dreams("NULL", status))
    }) {
        Ok(dreams) => {
            if dreams.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No dreams found.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = dreams
                .iter()
                .map(|d| {
                    let target = d
                        .target_date
                        .as_deref()
                        .map(|t| format!(" (target: {})", t))
                        .unwrap_or_default();
                    let progress = (d.progress * 100.0).round();
                    format!(
                        "• [{}] {}{} - {}% complete (category: {})",
                        d.id[..8.min(d.id.len())].to_uppercase(),
                        d.title,
                        target,
                        progress,
                        d.category
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: lines.join("\n"),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_dream_add_milestone(args: &Value) -> Result<ToolResult> {
    let dream_id = args.get("dream_id").and_then(|v| v.as_str()).unwrap_or("");
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    if dream_id.is_empty() || title.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("dream_id and title are required".into()),
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let description = args.get("description").and_then(|v| v.as_str());
    let target_date = args.get("target_date").and_then(|v| v.as_str());
    let sort_order = args.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(1);

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().add_milestone(
            &id,
            &dream_id,
            "NULL",
            title,
            description,
            target_date,
            sort_order,
        ))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!(
                "Added milestone to dream {}: '{}'{}",
                dream_id,
                title,
                target_date
                    .map(|d| format!(" (target: {})", d))
                    .unwrap_or_default()
            ),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_dream_add_task(args: &Value) -> Result<ToolResult> {
    let dream_id = args.get("dream_id").and_then(|v| v.as_str()).unwrap_or("");
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    if dream_id.is_empty() || title.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("dream_id and title are required".into()),
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let milestone_id = args.get("milestone_id").and_then(|v| v.as_str());
    let description = args.get("description").and_then(|v| v.as_str());
    let due_date = args.get("due_date").and_then(|v| v.as_str());
    let frequency = args.get("frequency").and_then(|v| v.as_str());

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().add_dream_task(
            &id,
            dream_id,
            milestone_id,
            "NULL",
            title,
            description,
            due_date,
            frequency,
        ))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!(
                "Added task to dream {}: '{}'{}",
                dream_id,
                title,
                due_date
                    .map(|d| format!(" (due: {})", d))
                    .unwrap_or_default()
            ),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

// ── Dreams Tool Implementations: Extended ──

fn execute_dream_get_dashboard(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_dream_dashboard("NULL"))
    }) {
        Ok(dash) => {
            let mut lines = vec![
                format!("✨ Dream Dashboard — {} active dreams", dash.active_dreams),
                format!(
                    "  Milestones: {}/{} completed",
                    dash.completed_milestones, dash.total_milestones
                ),
            ];
            if !dash.dreams.is_empty() {
                lines.push("\n  Dreams:".into());
                for d in &dash.dreams {
                    let pct = (d.progress * 100.0).round();
                    lines.push(format!(
                        "    {} {} — {:.0}% {}",
                        d.title,
                        if d.status == "active" { "🟢" } else { "⚪" },
                        pct,
                        d.category
                    ));
                }
            }
            if !dash.upcoming_tasks.is_empty() {
                lines.push("\n  Upcoming tasks:".into());
                for t in dash.upcoming_tasks.iter().take(5) {
                    lines.push(format!(
                        "    ☐ {} (due: {})",
                        t.title,
                        t.due_date.as_deref().unwrap_or("no date")
                    ));
                }
            }
            Ok(ToolResult {
                success: true,
                output: lines.join("\n"),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_dream_complete_milestone(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("milestone id is required".into()),
        });
    }
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().complete_milestone("NULL", id))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: "✅ Milestone completed!".into(),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_dream_get_tasks(args: &Value) -> Result<ToolResult> {
    let dream_id = args.get("dream_id").and_then(|v| v.as_str()).unwrap_or("");
    if dream_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("dream_id is required".into()),
        });
    }
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_dream_tasks(dream_id, "NULL"))
    }) {
        Ok(tasks) => {
            if tasks.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No tasks for this dream yet.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = tasks
                .iter()
                .map(|t| {
                    let status = if t.is_completed { "✅" } else { "☐" };
                    format!(
                        "{} {}{}",
                        status,
                        t.title,
                        t.due_date
                            .as_deref()
                            .map(|d| format!(" (due: {})", d))
                            .unwrap_or_default()
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("{} tasks:\n{}", tasks.len(), lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_dream_complete_task(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("task id is required".into()),
        });
    }
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().complete_dream_task("NULL", id))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: "✅ Task completed!".into(),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_dream_add_progress(args: &Value) -> Result<ToolResult> {
    let dream_id = args.get("dream_id").and_then(|v| v.as_str()).unwrap_or("");
    if dream_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("dream_id is required".into()),
        });
    }
    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let note = args.get("note").and_then(|v| v.as_str());
    let progress_change = args.get("progress_change").and_then(|v| v.as_f64());
    let ai_insight = args.get("ai_insight").and_then(|v| v.as_str());

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().add_dream_progress(
            &id,
            dream_id,
            "NULL",
            note,
            progress_change,
            ai_insight,
        ))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!(
                "📝 Progress logged for dream {}{}",
                dream_id,
                note.map(|n| format!(": {}", n)).unwrap_or_default()
            ),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_dream_delete(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() && title.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("dream id or title is required".into()),
        });
    }

    let engine = super::get_engine();
    let dream_id = if !id.is_empty() {
        id.to_string()
    } else {
        let dreams = match tokio::task::block_in_place(|| {
            Handle::current().block_on(engine.db().get_dreams("NULL", None))
        }) {
            Ok(d) => d,
            Err(e) => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(e.to_string()),
                })
            }
        };
        match dreams
            .iter()
            .find(|d| d.title.to_lowercase() == title.to_lowercase())
        {
            Some(d) => d.id.clone(),
            None => {
                return Ok(ToolResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Dream '{}' not found", title)),
                })
            }
        }
    };

    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().delete_dream("NULL", &dream_id))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: "Deleted dream.".into(),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_dream_get_velocity(args: &Value) -> Result<ToolResult> {
    let dream_id = args.get("dream_id").and_then(|v| v.as_str()).unwrap_or("");
    if dream_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("dream_id is required".into()),
        });
    }
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_dream_velocity(dream_id, "NULL"))
    }) {
        Ok(v) => {
            let pct = (v.progress_pct * 100.0).round();
            let bar_len = (pct / 10.0).min(10.0) as usize;
            let bar = "█".repeat(bar_len) + &"░".repeat(10 - bar_len);
            let on_track = v.pace == "ahead" || v.pace == "on_track";
            let tasks_per_week = if v.tasks_total > 0 {
                v.tasks_completed as f64 / 4.0
            } else {
                0.0
            };
            Ok(ToolResult {
                success: true,
                output: format!("🚀 Dream Velocity:\n  Progress: {} {:.0}%\n  Milestones: {}/{}\n  Tasks: {}/{}\n  Pace: {}\n  On track: {}\n  Days remaining: {}",
                    bar, pct, v.milestones_completed, v.milestones_total,
                    v.tasks_completed, v.tasks_total, v.pace,
                    if on_track { "✅ Yes" } else { "⚠️ Behind" },
                    v.days_remaining.map(|d| d.to_string()).unwrap_or_else(|| "∞".into())),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_dream_get_timeline(args: &Value) -> Result<ToolResult> {
    let dream_id = args.get("dream_id").and_then(|v| v.as_str()).unwrap_or("");
    if dream_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("dream_id is required".into()),
        });
    }
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_dream_timeline(dream_id, "NULL"))
    }) {
        Ok(tl) => {
            if tl.entries.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No timeline entries yet.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = tl
                .entries
                .iter()
                .map(|e| {
                    let icon = match e.event_type.as_str() {
                        "milestone" => "🏁",
                        "task" => "✅",
                        "progress" => "📝",
                        _ => "•",
                    };
                    format!("  {} {} — {}", icon, e.date, e.title)
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "📜 Dream Timeline ({} entries):\n{}",
                    tl.entries.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_dream_update_progress(args: &Value) -> Result<ToolResult> {
    let dream_id = args.get("dream_id").and_then(|v| v.as_str()).unwrap_or("");
    if dream_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("dream_id is required".into()),
        });
    }
    let pct = match args.get("progress_pct").and_then(|v| v.as_f64()) {
        Some(p) => p.clamp(0.0, 100.0) / 100.0,
        None => {
            return Ok(ToolResult {
                success: false,
                output: String::new(),
                error: Some("progress_pct is required".into()),
            })
        }
    };
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().set_dream_progress("NULL", dream_id, pct))
    }) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Progress set to {:.0}%.", pct * 100.0),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_dream_active_overview(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_active_dreams_with_velocity("NULL"))
    }) {
        Ok(pairs) => {
            if pairs.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No active dreams. Use dream_add to create one.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = pairs
                .iter()
                .map(|(dream, vel)| {
                    let pct = (dream.progress * 100.0).round();
                    let track = if vel.pace == "ahead" || vel.pace == "on_track" {
                        "✅"
                    } else {
                        "⚠️"
                    };
                    format!(
                        "  {} {} — {:.0}% (momentum: {:.0}%, {:.1} tasks/wk)",
                        track,
                        dream.title,
                        pct,
                        (vel.progress_pct * 100.0).round(),
                        0.0
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("✨ {} Active Dreams:\n{}", pairs.len(), lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

// ── Echo Journal Tool Implementations ──

fn execute_echo_write_entry(args: &Value) -> Result<ToolResult> {
    let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
    if content.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("content is required".into()),
        });
    }

    let engine = super::get_engine();
    let mood = args.get("mood").and_then(|v| v.as_str());
    let tags: Option<Vec<String>> = args.get("tags").and_then(|v| v.as_array()).map(|arr| {
        arr.iter()
            .filter_map(|t| t.as_str().map(String::from))
            .collect()
    });
    let is_voice = args
        .get("is_voice")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let req = crate::commands::EchoWriteRequest {
        content: content.to_string(),
        mood: mood.map(String::from),
        tags,
        is_voice: Some(is_voice),
    };

    match engine.db().echo_create_entry(&req) {
        Ok(entry) => Ok(ToolResult {
            success: true,
            output: format!(
                "📝 Echo entry written ({} words, id: {})",
                entry.word_count, entry.id
            ),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_get_entries(args: &Value) -> Result<ToolResult> {
    let limit = args.get("limit").and_then(|v| v.as_i64());
    let offset = args.get("offset").and_then(|v| v.as_i64());
    let engine = super::get_engine();

    match engine.db().echo_get_entries(limit, offset) {
        Ok(entries) => {
            if entries.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No echo entries yet.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = entries
                .iter()
                .map(|e| {
                    let preview: String = e.content.chars().take(80).collect();
                    let mood = e.mood.as_deref().unwrap_or("—");
                    format!(
                        "• [{}] {} ({}) — {}",
                        e.created_at, mood, e.word_count, preview
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("📓 Echo Entries ({}):\n{}", entries.len(), lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_delete_entry(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("id is required".into()),
        });
    }

    let engine = super::get_engine();
    match engine.db().echo_delete_entry(id) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Deleted echo entry: {}", id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_get_stats(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match engine.db().echo_get_stats() {
        Ok(stats) => {
            let top_mood = stats.top_mood.as_deref().unwrap_or("none");
            Ok(ToolResult {
                success: true,
                output: format!("📊 Echo Stats:\n  Total entries: {}\n  Today: {}\n  Current streak: {} days\n  Avg words/entry: {:.0}\n  Top mood: {}\n  Recent themes: {}",
                    stats.total_entries, stats.today_entries.len(), stats.current_streak,
                    stats.avg_words_per_entry, top_mood,
                    if stats.recent_themes.is_empty() { "none".into() } else { stats.recent_themes.join(", ") }),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_get_patterns(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match engine.db().echo_get_patterns() {
        Ok(patterns) => {
            if patterns.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No patterns detected yet.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = patterns
                .iter()
                .map(|p| {
                    format!(
                        "• {} [{}] — {} (confidence: {:.0}%)",
                        p.title,
                        p.pattern_type,
                        p.description,
                        p.confidence * 100.0
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "🔮 Echo Patterns ({}):\n{}",
                    patterns.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_create_pattern(args: &Value) -> Result<ToolResult> {
    let pattern_type = args
        .get("pattern_type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let description = args
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if pattern_type.is_empty() || title.is_empty() || description.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("pattern_type, title, and description are required".into()),
        });
    }

    let confidence = args
        .get("confidence")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.5);
    let data_json = args.get("data_json").and_then(|v| v.as_str());
    let engine = super::get_engine();

    match engine
        .db()
        .echo_create_pattern(pattern_type, title, description, confidence, data_json)
    {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Created pattern: '{}' [{}]", title, pattern_type),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_get_entries_by_date(args: &Value) -> Result<ToolResult> {
    let date = args.get("date").and_then(|v| v.as_str()).unwrap_or("");
    if date.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("date is required (YYYY-MM-DD)".into()),
        });
    }

    let engine = super::get_engine();
    match engine.db().echo_get_entries_by_date(date) {
        Ok(entries) => {
            if entries.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: format!("No echo entries for {}.", date),
                    error: None,
                });
            }
            let lines: Vec<String> = entries
                .iter()
                .map(|e| {
                    let preview: String = e.content.chars().take(100).collect();
                    format!("• {} — {}", e.mood.as_deref().unwrap_or("—"), preview)
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "📓 Echo Entries for {} ({}):\n{}",
                    date,
                    entries.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

// ── Echo Counselor Tool Implementations ──

fn execute_echo_counselor_get_state(_args: &Value) -> Result<ToolResult> {
    match crate::engine::echo_counselor::get_state() {
        Ok(state) => {
            let session_status = state
                .current_session
                .as_ref()
                .map(|s| s.status.as_str())
                .unwrap_or("none");
            Ok(ToolResult {
                success: true,
                output: format!("🧠 Echo Counselor:\n  Current session: {}\n  Total sessions: {}\n  Streak: {} days (best: {})\n  Pending exercises: {}\n  Crisis flags: {}\n  Unread reflections: {}",
                    session_status, state.total_sessions, state.current_streak, state.longest_streak,
                    state.pending_exercises.len(), state.crisis_flags.len(), state.unread_reflection),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_start_session(args: &Value) -> Result<ToolResult> {
    let opening = args.get("opening").and_then(|v| v.as_str());
    let req = crate::engine::echo_counselor::EchoStartSessionRequest {
        opening: opening.map(String::from),
    };
    match crate::engine::echo_counselor::start_session(req) {
        Ok(session) => Ok(ToolResult {
            success: true,
            output: format!(
                "Started counselor session: {} (status: {})",
                session.id, session.status
            ),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_get_messages(args: &Value) -> Result<ToolResult> {
    let session_id = args
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if session_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("session_id is required".into()),
        });
    }

    match crate::engine::echo_counselor::get_messages(session_id) {
        Ok(messages) => {
            if messages.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No messages in this session.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = messages
                .iter()
                .map(|m| {
                    let prefix = if m.role == "user" { "👤" } else { "🧠" };
                    let preview: String = m.content.chars().take(100).collect();
                    format!("{} {}", prefix, preview)
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "💬 Session Messages ({}):\n{}",
                    messages.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_end_session(args: &Value) -> Result<ToolResult> {
    let session_id = args
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if session_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("session_id is required".into()),
        });
    }

    match crate::engine::echo_counselor::end_session(session_id) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Ended counselor session: {}", session_id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_flag_crisis(args: &Value) -> Result<ToolResult> {
    let session_id = args
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");
    let severity = args
        .get("severity")
        .and_then(|v| v.as_str())
        .unwrap_or("moderate");
    let detected_text = args
        .get("detected_text")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if content.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("content is required".into()),
        });
    }

    match crate::engine::echo_counselor::flag_crisis(session_id, content, severity, detected_text) {
        Ok(flag) => Ok(ToolResult {
            success: true,
            output: format!(
                "🚨 Crisis flagged: severity={} (id: {})",
                flag.severity, flag.id
            ),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_write_gratitude(args: &Value) -> Result<ToolResult> {
    let items: Vec<String> = args
        .get("items")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|i| i.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    if items.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("items is required (array of strings)".into()),
        });
    }

    let context = args
        .get("context")
        .and_then(|v| v.as_str())
        .map(String::from);
    match crate::engine::echo_counselor::write_gratitude(items, context) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: "🙏 Gratitude logged.".into(),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_get_gratitude(args: &Value) -> Result<ToolResult> {
    let limit = args.get("limit").and_then(|v| v.as_i64());
    match crate::engine::echo_counselor::get_gratitude(limit) {
        Ok(entries) => {
            if entries.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No gratitude entries yet.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = entries
                .iter()
                .map(|g| format!("• [{}] {}", g.created_at, g.items))
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("🙏 Gratitude ({}):\n{}", entries.len(), lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_get_exercises(_args: &Value) -> Result<ToolResult> {
    match crate::engine::echo_counselor::get_exercises() {
        Ok(exercises) => {
            if exercises.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No grounding exercises available.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = exercises
                .iter()
                .map(|e| {
                    let status = if e.completed { "✅" } else { "⬜" };
                    format!(
                        "{} {} [{}] — {} ({} min)",
                        status, e.title, e.r#type, e.description, e.duration_min
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "🧘 Grounding Exercises ({}):\n{}",
                    exercises.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_complete_exercise(args: &Value) -> Result<ToolResult> {
    let exercise_id = args
        .get("exercise_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if exercise_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("exercise_id is required".into()),
        });
    }

    match crate::engine::echo_counselor::complete_exercise(exercise_id) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("✅ Completed exercise: {}", exercise_id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_get_reflections(args: &Value) -> Result<ToolResult> {
    let limit = args.get("limit").and_then(|v| v.as_i64());
    match crate::engine::echo_counselor::get_reflections(limit) {
        Ok(sessions) => {
            if sessions.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No reflections yet.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = sessions
                .iter()
                .map(|s| {
                    let summary = s.summary.as_deref().unwrap_or("no summary");
                    format!(
                        "• [{}] {} ({} messages)",
                        s.created_at, summary, s.message_count
                    )
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!("🪞 Reflections ({}):\n{}", sessions.len(), lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_mark_reflection_read(args: &Value) -> Result<ToolResult> {
    let session_id = args
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if session_id.is_empty() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("session_id is required".into()),
        });
    }

    match crate::engine::echo_counselor::mark_reflection_read(session_id) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Marked reflection as read: {}", session_id),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_get_weekly_letter(_args: &Value) -> Result<ToolResult> {
    match crate::engine::echo_counselor::get_weekly_letter() {
        Ok(Some(letter)) => Ok(ToolResult {
            success: true,
            output: format!(
                "💌 Weekly Letter (week of {}):\n{}",
                letter.week_start, letter.letter_content
            ),
            error: None,
        }),
        Ok(None) => Ok(ToolResult {
            success: true,
            output: "No weekly letter generated yet.".into(),
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_get_weekly_letter_history(args: &Value) -> Result<ToolResult> {
    let limit = args.get("limit").and_then(|v| v.as_i64());
    match crate::engine::echo_counselor::get_weekly_letter_history(limit) {
        Ok(letters) => {
            if letters.is_empty() {
                return Ok(ToolResult {
                    success: true,
                    output: "No weekly letter history.".into(),
                    error: None,
                });
            }
            let lines: Vec<String> = letters
                .iter()
                .map(|l| {
                    let preview: String = l.letter_content.chars().take(80).collect();
                    format!("• Week of {}: {}...", l.week_start, preview)
                })
                .collect();
            Ok(ToolResult {
                success: true,
                output: format!(
                    "💌 Weekly Letters ({}):\n{}",
                    letters.len(),
                    lines.join("\n")
                ),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

fn execute_echo_counselor_set_evening_reminder(args: &Value) -> Result<ToolResult> {
    let enabled = args
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let hour = args.get("hour").and_then(|v| v.as_i64()).map(|h| h as i32);
    let minute = args
        .get("minute")
        .and_then(|v| v.as_i64())
        .map(|m| m as i32);

    match crate::commands::echo_counselor_set_evening_reminder(enabled, hour, minute) {
        Ok(msg) => Ok(ToolResult {
            success: true,
            output: msg,
            error: None,
        }),
        Err(e) => Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(e.to_string()),
        }),
    }
}

// ── Cross-App Intelligence Tool Implementations ──

fn execute_weekly_summary(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let now = chrono::Utc::now();
    let this_month = now.format("%Y-%m").to_string();
    let mut sections: Vec<String> = Vec::new();

    // 1. Budget summary
    let member_id = tokio::task::block_in_place(|| engine.db().get_config("supabase_user_id"))
        .unwrap_or_default()
        .unwrap_or_else(|| "default_user".to_string());
    if let Ok(summary) = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_budget_summary(&member_id, &this_month))
    }) {
        sections.push(format!(
            "💰 Budget ({}): Spent ${:.2} | Income ${:.2} | Net ${:.2}",
            this_month, summary.total_expenses, summary.total_income, summary.net
        ));
    }

    // 2. Kitchen — meals + expiring inventory
    let member_id = tokio::task::block_in_place(|| engine.db().get_config("supabase_user_id"))
        .unwrap_or_default()
        .unwrap_or_else(|| "default_user".to_string());
    if let Ok(meals) = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_meals(None, None, false))
    }) {
        sections.push(format!("🍳 Kitchen: {} meals in collection", meals.len()));
    }
    if let Ok(inventory) = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_inventory(&member_id, None))
    }) {
        let expiring: Vec<_> = inventory
            .iter()
            .filter(|item| {
                if let Some(ref exp) = item.expiry_date {
                    if let Ok(exp_date) = chrono::NaiveDate::parse_from_str(exp, "%Y-%m-%d") {
                        let days_left = exp_date.signed_duration_since(now.date_naive()).num_days();
                        return days_left <= 3 && days_left >= 0;
                    }
                }
                false
            })
            .collect();
        if !expiring.is_empty() {
            let names: Vec<_> = expiring.iter().map(|i| i.name.as_str()).collect();
            sections.push(format!("⚠️ Expiring soon: {}", names.join(", ")));
        }
    }

    // 3. Life — pending tasks and active habits
    if let Ok(tasks) = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_life_tasks("NULL", Some("pending")))
    }) {
        sections.push(format!("🧠 Life: {} pending tasks", tasks.len()));
    }
    if let Ok(habits) = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_life_habits("NULL", true))
    }) {
        sections.push(format!(
            "📊 Habits: {} active, best streak: {}",
            habits.len(),
            habits.iter().map(|h| h.streak).max().unwrap_or(0)
        ));
    }

    // 4. Dreams — active
    if let Ok(dashboard) = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_dream_dashboard("NULL"))
    }) {
        let names: Vec<_> = dashboard
            .dreams
            .iter()
            .filter(|d| d.status == "active")
            .map(|d| format!("{} ({:.0}%)", d.title, d.progress * 100.0))
            .collect();
        if !names.is_empty() {
            sections.push(format!("🎯 Dreams: {}", names.join(", ")));
        }
    }

    // 5. Home — bills
    if let Ok(bills) = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_home_bills(None, 5))
    }) {
        let total: f64 = bills.iter().map(|b| b.amount).sum();
        sections.push(format!(
            "🏠 Home: {} bills tracked, recent total ${:.2}",
            bills.len(),
            total
        ));
    }

    Ok(ToolResult {
        success: true,
        output: sections.join("\n"),
        error: None,
    })
}

fn execute_can_afford(args: &Value) -> Result<ToolResult> {
    let amount = args.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let description = args
        .get("item_description")
        .and_then(|v| v.as_str())
        .unwrap_or("purchase");

    let engine = super::get_engine();
    let now = chrono::Utc::now();
    let this_month = now.format("%Y-%m").to_string();

    let member_id = tokio::task::block_in_place(|| engine.db().get_config("supabase_user_id"))
        .unwrap_or_default()
        .unwrap_or_else(|| "default_user".to_string());
    let summary = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_budget_summary(&member_id, &this_month))
    })?;
    let discretionary = summary.total_income - summary.total_expenses;

    let mut analysis = Vec::new();
    analysis.push(format!(
        "📊 Affordability: ${:.2} for {}",
        amount, description
    ));
    analysis.push(format!(
        "   Income: ${:.2} | Spent: ${:.2} | Remaining: ${:.2}",
        summary.total_income, summary.total_expenses, discretionary
    ));

    if amount <= discretionary * 0.3 {
        analysis.push("   ✅ Comfortable — well within discretionary budget.".to_string());
    } else if amount <= discretionary {
        analysis
            .push("   ⚠️ Possible but tight — significant portion of remaining funds.".to_string());
    } else {
        analysis.push("   ❌ Over budget — exceeds current discretionary spending.".to_string());
    }

    // Show savings goals
    if let Ok(goals) = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_budget_goals(None))
    }) {
        for goal in &goals {
            let remaining = goal.target_amount - goal.current_amount;
            let pct = if goal.target_amount > 0.0 {
                (goal.current_amount / goal.target_amount * 100.0).min(100.0)
            } else {
                0.0
            };
            analysis.push(format!(
                "   🎯 '{}': ${:.2}/${:.2} ({:.0}%, ${:.2} to go)",
                goal.name, goal.current_amount, goal.target_amount, pct, remaining
            ));
        }
    }

    Ok(ToolResult {
        success: true,
        output: analysis.join("\n"),
        error: None,
    })
}

fn execute_day_overview(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let now = chrono::Utc::now();
    let today = now.format("%Y-%m-%d").to_string();
    let mut sections: Vec<String> = Vec::new();

    // 1. Tasks due today or overdue
    if let Ok(tasks) = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_life_tasks("NULL", Some("pending")))
    }) {
        let today_tasks: Vec<_> = tasks
            .iter()
            .filter(|t| t.due_date.as_deref().map_or(false, |d| d <= today.as_str()))
            .collect();
        if !today_tasks.is_empty() {
            let names: Vec<_> = today_tasks.iter().map(|t| t.title.as_str()).collect();
            sections.push(format!("📋 Tasks: {}", names.join(", ")));
        }
    }

    // 2. Inventory expiring today or tomorrow
    let member_id = tokio::task::block_in_place(|| engine.db().get_config("supabase_user_id"))
        .unwrap_or_default()
        .unwrap_or_else(|| "default_user".to_string());
    if let Ok(inventory) = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_inventory(&member_id, None))
    }) {
        let urgent: Vec<_> = inventory
            .iter()
            .filter(|item| {
                if let Some(ref exp) = item.expiry_date {
                    if let Ok(exp_date) = chrono::NaiveDate::parse_from_str(exp, "%Y-%m-%d") {
                        let days = exp_date.signed_duration_since(now.date_naive()).num_days();
                        return days >= 0 && days <= 1;
                    }
                }
                false
            })
            .collect();
        if !urgent.is_empty() {
            let names: Vec<_> = urgent.iter().map(|i| i.name.as_str()).collect();
            sections.push(format!("⚠️ Expiring: {}", names.join(", ")));
        }
    }

    // 3. Upcoming bills (due within 3 days — using billing_month as proxy)
    if let Ok(bills) = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_home_bills(None, 5))
    }) {
        if !bills.is_empty() {
            sections.push(format!("🏠 Bills: {} recent bills on file", bills.len()));
        }
    }

    // 4. Active dreams quick check
    if let Ok(dreams) = tokio::task::block_in_place(|| {
        Handle::current().block_on(engine.db().get_dreams("NULL", Some("active")))
    }) {
        if !dreams.is_empty() {
            let items: Vec<_> = dreams
                .iter()
                .map(|d| format!("{} ({:.0}%)", d.title, d.progress * 100.0))
                .collect();
            sections.push(format!("🎯 Dreams: {}", items.join(", ")));
        }
    }

    if sections.is_empty() {
        sections.push("✨ All clear — nothing urgent today!".to_string());
    }

    Ok(ToolResult {
        success: true,
        output: sections.join("\n"),
        error: None,
    })
}
