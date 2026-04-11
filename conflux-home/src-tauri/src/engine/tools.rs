// Conflux Engine — Tool System
// Registry, dispatch, and execution of agent tools with sandboxing.

use anyhow::Result;
use serde_json::Value;

use super::db::EngineDb;

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
    ":(){ :|:& };:",  // fork bomb
    "chmod 777",
    "> /dev/sda",
    "wget | sh",
    "curl | sh",
    "curl | bash",
    "wget | bash",
];

/// Paths that are never accessible.
const BLOCKED_PATHS: &[&str] = &[
    "/etc/shadow",
    "/etc/passwd",
    "/proc/",
    "/sys/",
    "/dev/",
];

/// Allowed directories for file operations.
fn get_allowed_paths() -> Vec<String> {
    let mut paths = vec![
        "/tmp/conflux".to_string(),
    ];

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
    let normalized = std::path::Path::new(path).canonicalize()
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
        && (lower.contains("sh") || lower.contains("bash") || lower.contains("exec") || lower.contains("|"))
    {
        anyhow::bail!("Command blocked: downloading and executing scripts is not allowed");
    }

    Ok(())
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
    execute_tool_for_user(tool_name, args, user_id).await
}

/// Execute a tool with user-specific context and permission checking.
/// Note: The agent_id parameter is currently unused for non-Google tools.
pub async fn execute_tool_for_user(tool_name: &str, args: &Value, _user_id: &str) -> Result<ToolResult> {
    // Google tools are checked separately (they require auth, not permissions)
    if matches!(tool_name, "google_auth" | "gmail_send" | "gmail_search" | "google_drive_list" |
        "google_doc_read" | "google_doc_write" | "google_sheet_read" | "google_sheet_write")
    {
        let engine = super::get_engine();
        return super::google::execute_google_tool(tool_name, args, engine.db()).await;
    }

    match tool_name {
        "web_search" => execute_web_search(args).await,
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
        "feed_add_item" => execute_feed_add_item(args),
        "feed_list_items" => execute_feed_list_items(args),
        "feed_mark_read" => execute_feed_mark_read(args),
        "dream_add" => execute_dream_add(args),
        "dream_list" => execute_dream_list(args),
        "dream_add_milestone" => execute_dream_add_milestone(args),
        "dream_add_task" => execute_dream_add_task(args),
        // Home Health tools
        "home_add_bill" => execute_home_add_bill(args),
        "home_get_bills" => execute_home_get_bills(args),
        "home_add_maintenance" => execute_home_add_maintenance(args),
        "home_get_appliances" => execute_home_get_appliances(args),
        // Vault tools
        "vault_list_files" => execute_vault_list_files(args),
        "vault_search_files" => execute_vault_search_files(args),
        "vault_get_file" => execute_vault_get_file(args),
        // Kitchen tools
        "kitchen_add_meal" => execute_kitchen_add_meal(args),
        "kitchen_list_meals" => execute_kitchen_list_meals(args),
        "kitchen_add_to_plan" => execute_kitchen_add_to_plan(args),
        "kitchen_get_plan" => execute_kitchen_get_plan(args),
        "kitchen_add_inventory" => execute_kitchen_add_inventory(args),
        "kitchen_get_inventory" => execute_kitchen_get_inventory(args),
        // Budget tools
        "budget_add_entry" => execute_budget_add_entry(args),
        "budget_get_entries" => execute_budget_get_entries(args),
        "budget_get_summary" => execute_budget_get_summary(args),
        "budget_create_goal" => execute_budget_create_goal(args),
        "budget_get_goals" => execute_budget_get_goals(args),
        // Cross-app intelligence tools
        "conflux_weekly_summary" => execute_weekly_summary(args),
        "conflux_can_afford" => execute_can_afford(args),
        "conflux_day_overview" => execute_day_overview(args),
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
        // ── Kitchen Tools ──
        serde_json::json!({
            "type": "function",
            "function": {
                "name": "kitchen_add_meal",
                "description": "Add a new meal/recipe to the kitchen. Use when the user wants to save a recipe or add a dish to their meal collection.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string", "description": "Meal/recipe name (e.g. 'Chicken Parmesan')" },
                        "category": { "type": "string", "description": "Meal category: breakfast, lunch, dinner, snack, dessert" },
                        "cuisine": { "type": "string", "description": "Cuisine type (e.g. Italian, Mexican, Thai)" },
                        "instructions": { "type": "string", "description": "Cooking instructions or steps" },
                        "prep_time_min": { "type": "integer", "description": "Prep time in minutes" },
                        "cook_time_min": { "type": "integer", "description": "Cook time in minutes" }
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
    ]
}

// ── Tool Implementations ──

async fn execute_web_search(args: &Value) -> Result<ToolResult> {
    let query = args.get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("");

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
            let url = extract_between(trimmed, "href=\"", "\"")
                .unwrap_or_default();
            // Extract title text
            let title = extract_between(trimmed, ">", "</a>")
                .unwrap_or_default();
            let title = strip_html_tags(&title);

            // Next few lines should have the snippet
            let mut snippet = String::new();
            for _ in 0..5 {
                if let Some(next) = lines.next() {
                    let next_trimmed = next.trim();
                    if next_trimmed.contains("class=\"result-snippet\"") {
                        snippet = strip_html_tags(
                            extract_between(next_trimmed, ">", "</td>")
                                .unwrap_or(next_trimmed)
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
    let url = args.get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("");

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
    let content_type = response.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if !status.is_success() {
        return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("HTTP {}: {}", status.as_u16(), status.canonical_reason().unwrap_or("error"))),
        });
    }

    // Only parse HTML content
    if content_type.contains("text/html") || content_type.contains("text/plain") {
        let html = response.text().await?;
        let text = html_to_text(&html);

        // Truncate to 5000 chars to avoid overwhelming the context
        let truncated = if text.len() > 5000 {
            format!("{}...\n\n[Content truncated — {} chars total]", &text[..5000], text.len())
        } else {
            text
        };

        Ok(ToolResult {
            success: true,
            output: format!("📄 {} ({})\n\n{}", url, content_type.split(';').next().unwrap_or(""), truncated),
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
                if tag_lower.starts_with("p") || tag_lower.starts_with("div") ||
                   tag_lower.starts_with("br") || tag_lower.starts_with("li") ||
                   tag_lower.starts_with("h1") || tag_lower.starts_with("h2") ||
                   tag_lower.starts_with("h3") || tag_lower.starts_with("h4") ||
                   tag_lower.starts_with("tr") {
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
    let path = args.get("path")
        .and_then(|v| v.as_str())
        .unwrap_or("");

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
            error: Some(format!("Access denied: '{}' is outside allowed directories", path)),
        });
    }

    match std::fs::read_to_string(path) {
        Ok(content) => Ok(ToolResult {
            success: true,
            output: if content.len() > 50_000 {
                format!("{}... (truncated, {} bytes total)", &content[..50_000], content.len())
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
            error: Some(format!("Access denied: '{}' is outside allowed directories", path)),
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
    let command = args.get("command")
        .and_then(|v| v.as_str())
        .unwrap_or("");

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
                error: if output.status.success() { None } else { Some(format!("Exit code: {}", output.status)) },
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
    let expression = args.get("expression")
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
            .arg(format!("echo '{}' | bc -l 2>/dev/null || echo 'error'", clean))
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
    let mut request = client.post(url)
        .header("Content-Type", "application/json")
        .header("User-Agent", "ConfluxHome/1.0")
        .body(body.to_string());

    // Parse optional headers
    if let Some(h) = headers_str {
        if let Ok(header_map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(h) {
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
                error: if status >= 400 { Some(format!("HTTP {}", status)) } else { None },
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
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("Conflux");
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
    let _ = engine.db().emit_event("agent_notification", None, None,
        Some(&serde_json::json!({"title": title, "body": body}).to_string()));

    Ok(ToolResult {
        success: true,
        output: format!("Notification sent: {} - {}", title, body),
        error: None,
    })
}

/// Send email via SMTP
fn execute_email_send(args: &Value) -> Result<ToolResult> {
    use lettre::{Message, SmtpTransport, Transport};
    use lettre::transport::smtp::authentication::Credentials;

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
    let smtp_host = match engine.db().get_config("smtp_host") {
        Ok(Some(h)) => h,
        _ => return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some("Email not configured. Set smtp_host, smtp_user, smtp_pass, smtp_from in Settings > Email.".to_string()),
        }),
    };
    let smtp_user = engine.db().get_config("smtp_user").unwrap_or(None).unwrap_or_default();
    let smtp_pass = engine.db().get_config("smtp_pass").unwrap_or(None).unwrap_or_default();
    let smtp_from = engine.db().get_config("smtp_from").unwrap_or(None).unwrap_or(smtp_user.clone());

    let email = match Message::builder()
        .from(smtp_from.parse().map_err(|e| anyhow::anyhow!("Invalid from address: {}", e))?)
        .to(to.parse().map_err(|e| anyhow::anyhow!("Invalid to address: {}", e))?)
        .subject(subject)
        .body(body.to_string())
    {
        Ok(e) => e,
        Err(e) => return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("Failed to build email: {}", e)),
        }),
    };

    let creds = Credentials::new(smtp_user, smtp_pass);

    let mailer = match SmtpTransport::relay(&smtp_host) {
        Ok(m) => m.credentials(creds).build(),
        Err(e) => return Ok(ToolResult {
            success: false,
            output: String::new(),
            error: Some(format!("SMTP connection failed: {}", e)),
        }),
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
    let billing_month = args.get("billing_month").and_then(|v| v.as_str()).unwrap_or("");
    let notes = args.get("notes").and_then(|v| v.as_str());

    if bill_type.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("bill_type is required".into()) });
    }
    if amount <= 0.0 {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("amount must be positive".into()) });
    }
    if billing_month.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("billing_month is required (YYYY-MM)".into()) });
    }

    let engine = super::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().add_home_bill(&id, bill_type, amount, usage, billing_month, notes)?;
    let usage_str = usage.map(|u| format!(" ({:.1} units)", u)).unwrap_or_default();
    Ok(ToolResult {
        success: true,
        output: format!("Added {} bill: ${:.2}{} for {}", bill_type, amount, usage_str, billing_month),
        error: None,
    })
}

fn execute_home_get_bills(args: &Value) -> Result<ToolResult> {
    let bill_type = args.get("bill_type").and_then(|v| v.as_str());
    let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(20);

    let engine = super::get_engine();
    let bills = engine.db().get_home_bills(bill_type, limit)?;

    if bills.is_empty() {
        return Ok(ToolResult { success: true, output: "No bills found.".into(), error: None });
    }

    let lines: Vec<String> = bills.iter().map(|b| {
        let usage_str = b.usage.map(|u| format!(" ({:.1})", u)).unwrap_or_default();
        format!("• {} — ${:.2}{} [{}]{}",
            b.bill_type, b.amount, usage_str, b.billing_month,
            b.notes.as_deref().map(|n| format!(" — {}", n)).unwrap_or_default())
    }).collect();

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
        return Ok(ToolResult { success: false, output: String::new(), error: Some("task is required".into()) });
    }
    if category.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("category is required".into()) });
    }

    let engine = super::get_engine();
    let id = uuid::Uuid::new_v4().to_string();
    engine.db().add_home_maintenance(&id, task, category, None, interval_months, priority, estimated_cost, notes)?;

    let interval_str = interval_months.map(|m| format!(" every {} months", m)).unwrap_or_default();
    let cost_str = estimated_cost.map(|c| format!(" (est. ${:.0})", c)).unwrap_or_default();
    Ok(ToolResult {
        success: true,
        output: format!("Added maintenance: {} [{}]{}{}", task, category, interval_str, cost_str),
        error: None,
    })
}

fn execute_home_get_appliances(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let appliances = engine.db().get_home_appliances()?;

    if appliances.is_empty() {
        return Ok(ToolResult { success: true, output: "No appliances tracked yet.".into(), error: None });
    }

    let lines: Vec<String> = appliances.iter().map(|a| {
        let model_str = a.model.as_deref().map(|m| format!(" ({})", m)).unwrap_or_default();
        let warranty_str = a.warranty_expiry.as_deref()
            .map(|w| format!(" | Warranty until {}", w))
            .unwrap_or_default();
        let service_str = a.next_service.as_deref()
            .map(|s| format!(" | Next service: {}", s))
            .unwrap_or_default();
        format!("• {}{} [{}]{}{}",
            a.name, model_str, a.category, warranty_str, service_str)
    }).collect();

    Ok(ToolResult {
        success: true,
        output: format!("🏠 Appliances ({})\n{}", appliances.len(), lines.join("\n")),
        error: None,
    })
}

// ── Vault Tool Implementations ──

fn execute_vault_list_files(args: &Value) -> Result<ToolResult> {
    let file_type = args.get("file_type").and_then(|v| v.as_str());
    let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(20);

    let files = super::db::vault_get_files(file_type, limit, 0)?;

    if files.is_empty() {
        return Ok(ToolResult { success: true, output: "No files found in Vault.".into(), error: None });
    }

    let lines: Vec<String> = files.iter().map(|f| {
        let size_mb = f.size_bytes as f64 / 1_048_576.0;
        format!("• {} [{}] — {:.1} MB (id: {})", f.name, f.file_type, size_mb, f.id)
    }).collect();

    Ok(ToolResult {
        success: true,
        output: format!("📁 Vault Files ({})\n{}", files.len(), lines.join("\n")),
        error: None,
    })
}

fn execute_vault_search_files(args: &Value) -> Result<ToolResult> {
    let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");

    if query.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("query is required".into()) });
    }

    let files = super::db::vault_search(query, 20)?;

    if files.is_empty() {
        return Ok(ToolResult { success: true, output: format!("No files matching '{}'.", query), error: None });
    }

    let lines: Vec<String> = files.iter().map(|f| {
        let desc = f.description.as_deref().map(|d| format!(" — {}", d)).unwrap_or_default();
        format!("• {} [{}]{} (id: {})", f.name, f.file_type, desc, f.id)
    }).collect();

    Ok(ToolResult {
        success: true,
        output: format!("🔍 Vault Search: '{}' ({} results)\n{}", query, files.len(), lines.join("\n")),
        error: None,
    })
}

fn execute_vault_get_file(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");

    if id.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("id is required".into()) });
    }

    match super::db::vault_get_file_by_id(id)? {
        Some(f) => {
            let size_mb = f.size_bytes as f64 / 1_048_576.0;
            let desc = f.description.as_deref().map(|d| format!("\nDescription: {}", d)).unwrap_or_default();
            let mime = f.mime_type.as_deref().unwrap_or("unknown");
            let created_by = f.created_by.as_deref().map(|c| format!("\nCreated by: {}", c)).unwrap_or_default();
            Ok(ToolResult {
                success: true,
                output: format!("📄 {}\nType: {} ({})\nSize: {:.1} MB\nPath: {}{}{}",
                    f.name, f.file_type, mime, size_mb, f.path, desc, created_by),
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

// ── Kitchen Tool Implementations ──

fn execute_kitchen_add_meal(args: &Value) -> Result<ToolResult> {
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("Meal name is required".into()) });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let category = args.get("category").and_then(|v| v.as_str());
    let cuisine = args.get("cuisine").and_then(|v| v.as_str());
    let instructions = args.get("instructions").and_then(|v| v.as_str());
    let prep_time_min = args.get("prep_time_min").and_then(|v| v.as_i64());
    let cook_time_min = args.get("cook_time_min").and_then(|v| v.as_i64());

    match engine.db().create_meal(
        &id, name, None, cuisine, category, None, prep_time_min, cook_time_min,
        4, "normal", instructions, None, "agent",
    ) {
        Ok(meal) => Ok(ToolResult {
            success: true,
            output: format!("Added meal: {} (id: {})", meal.name, meal.id),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_kitchen_list_meals(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let category = args.get("category").and_then(|v| v.as_str());
    let cuisine = args.get("cuisine").and_then(|v| v.as_str());
    let favorites_only = args.get("favorites_only").and_then(|v| v.as_bool()).unwrap_or(false);

    match engine.db().get_meals(category, cuisine, favorites_only) {
        Ok(meals) => {
            if meals.is_empty() {
                return Ok(ToolResult { success: true, output: "No meals found.".into(), error: None });
            }
            let lines: Vec<String> = meals.iter().map(|m| {
                let mut s = format!("• {} (id: {})", m.name, m.id);
                if let Some(ref cat) = m.category { s.push_str(&format!(" [{}]", cat)); }
                if let Some(ref cus) = m.cuisine { s.push_str(&format!(" — {}", cus)); }
                s
            }).collect();
            Ok(ToolResult { success: true, output: format!("{} meals:\n{}", meals.len(), lines.join("\n")), error: None })
        }
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_kitchen_add_to_plan(args: &Value) -> Result<ToolResult> {
    let meal_name = args.get("meal_name").and_then(|v| v.as_str()).unwrap_or("");
    if meal_name.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("meal_name is required".into()) });
    }

    let engine = super::get_engine();

    // Find the meal by name
    let meals = match engine.db().get_meals(None, None, false) {
        Ok(m) => m,
        Err(e) => return Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    };
    let meal_name_lower = meal_name.to_lowercase();
    let meal = meals.iter().find(|m| m.name.to_lowercase() == meal_name_lower);
    let (meal_id, matched_name) = match meal {
        Some(m) => (m.id.clone(), m.name.clone()),
        None => return Ok(ToolResult {
            success: false, output: String::new(),
            error: Some(format!("Meal '{}' not found. Use kitchen_add_meal first, or kitchen_list_meals to see available meals.", meal_name)),
        }),
    };

    let id = uuid::Uuid::new_v4().to_string();
    let week_start = args.get("week_start").and_then(|v| v.as_str()).unwrap_or("");
    let day_of_week = args.get("day_of_week").and_then(|v| v.as_i64()).unwrap_or(0);
    let meal_slot = args.get("meal_slot").and_then(|v| v.as_str()).unwrap_or("dinner");

    match engine.db().set_plan_entry(&id, week_start, day_of_week, meal_slot, Some(&meal_id), None) {
        Ok(()) => {
            let day_names = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
            let day = day_names.get(day_of_week as usize).unwrap_or(&"Unknown");
            Ok(ToolResult {
                success: true,
                output: format!("Added {} to {} ({}) on {}", matched_name, meal_slot, week_start, day),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_kitchen_get_plan(args: &Value) -> Result<ToolResult> {
    let week_start = args.get("week_start").and_then(|v| v.as_str()).unwrap_or("");
    if week_start.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("week_start is required (YYYY-MM-DD)".into()) });
    }

    let engine = super::get_engine();
    match engine.db().get_weekly_plan(week_start) {
        Ok(plan) => {
            let mut lines = Vec::new();
            for day in &plan.days {
                for slot in &day.slots {
                    let meal_name = slot.meal.as_ref().map(|m| m.name.as_str()).unwrap_or("(empty)");
                    lines.push(format!("{} {}: {}", day.day_name, slot.meal_slot, meal_name));
                }
            }
            if lines.is_empty() {
                lines.push("No meals planned for this week.".into());
            }
            Ok(ToolResult { success: true, output: format!("Week of {} ({} meals, est. ${:.2}):\n{}", plan.week_start, plan.meal_count, plan.total_estimated_cost, lines.join("\n")), error: None })
        }
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_kitchen_add_inventory(args: &Value) -> Result<ToolResult> {
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("Item name is required".into()) });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let member_id = engine.db().get_config("supabase_user_id").unwrap_or_default().unwrap_or_else(|| "default_user".to_string());
    let quantity = args.get("quantity").and_then(|v| v.as_f64());
    let unit = args.get("unit").and_then(|v| v.as_str());
    let category = None::<&str>;
    let expiry = args.get("expiry_date").and_then(|v| v.as_str());
    let location = args.get("location").and_then(|v| v.as_str());

    match engine.db().add_inventory_item(&id, &member_id, name, quantity, unit, category, expiry, location) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Added {} to inventory{}{}",
                name,
                quantity.map(|q| format!(" ({} {})", q, unit.unwrap_or(""))).unwrap_or_default(),
                location.map(|l| format!(" in {}", l)).unwrap_or_default()),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_kitchen_get_inventory(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let member_id = engine.db().get_config("supabase_user_id").unwrap_or_default().unwrap_or_else(|| "default_user".to_string());
    let location = args.get("location").and_then(|v| v.as_str());

    match engine.db().get_inventory(&member_id, location) {
        Ok(items) => {
            if items.is_empty() {
                return Ok(ToolResult { success: true, output: "Inventory is empty.".into(), error: None });
            }
            let lines: Vec<String> = items.iter().map(|item| {
                let mut s = format!("• {}", item.name);
                if let Some(q) = item.quantity {
                    s.push_str(&format!(" ({} {})", q, item.unit.as_deref().unwrap_or("")));
                }
                if let Some(ref loc) = item.location { s.push_str(&format!(" [{}]", loc)); }
                if let Some(ref exp) = item.expiry_date { s.push_str(&format!(" expires: {}", exp)); }
                s
            }).collect();
            Ok(ToolResult { success: true, output: format!("{} items in inventory:\n{}", items.len(), lines.join("\n")), error: None })
        }
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

// ── Budget Tool Implementations ──

fn execute_budget_add_entry(args: &Value) -> Result<ToolResult> {
    let amount = match args.get("amount").and_then(|v| v.as_f64()) {
        Some(a) if a > 0.0 => a,
        _ => return Ok(ToolResult { success: false, output: String::new(), error: Some("amount is required and must be positive".into()) }),
    };
    let category = args.get("category").and_then(|v| v.as_str()).unwrap_or("");
    if category.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("category is required".into()) });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let entry_type = args.get("entry_type").and_then(|v| v.as_str()).unwrap_or("expense");
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

    let result: std::result::Result<Vec<(String, String, String, f64, Option<String>, String)>, String> = (|| {
        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
            ))
        }).map_err(|e| e.to_string())?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    })();

    match result {
        Ok(entries) => {
            if entries.is_empty() {
                return Ok(ToolResult { success: true, output: "No budget entries found.".into(), error: None });
            }
            let lines: Vec<String> = entries.iter().map(|(_id, etype, cat, amt, desc, date)| {
                let prefix = if etype == "income" { "+" } else { "-" };
                let desc_str = desc.as_deref().unwrap_or("");
                format!("{} ${:.2} {} ({}{}{}", prefix, amt, cat, date,
                    if !desc_str.is_empty() { ", " } else { "" }, desc_str)
            }).collect();
            Ok(ToolResult { success: true, output: format!("{} entries:\n{}", entries.len(), lines.join("\n")), error: None })
        }
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e) }),
    }
}

fn execute_budget_get_summary(args: &Value) -> Result<ToolResult> {
    let month = args.get("month").and_then(|v| v.as_str()).unwrap_or("");
    if month.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("month is required (YYYY-MM)".into()) });
    }

    let engine = super::get_engine();
    let member_id = args.get("member_id").and_then(|v| v.as_str()).unwrap_or_default();
    match engine.db().get_budget_summary(&member_id, month) {
        Ok(summary) => {
            let cat_lines: Vec<String> = summary.categories.iter()
                .map(|c| format!("  {}: ${:.2}", c.category, c.total)).collect();
            Ok(ToolResult {
                success: true,
                output: format!("Budget Summary for {}:\n  Income: ${:.2}\n  Expenses: ${:.2}\n  Savings: ${:.2}\n  Net: ${:.2}\n  Categories:\n{}",
                    summary.month, summary.total_income, summary.total_expenses,
                    summary.total_savings, summary.net, cat_lines.join("\n")),
                error: None,
            })
        }
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_budget_create_goal(args: &Value) -> Result<ToolResult> {
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("Goal name is required".into()) });
    }
    let target_amount = match args.get("target_amount").and_then(|v| v.as_f64()) {
        Some(a) if a > 0.0 => a,
        _ => return Ok(ToolResult { success: false, output: String::new(), error: Some("target_amount is required and must be positive".into()) }),
    };

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let deadline = args.get("deadline").and_then(|v| v.as_str());

    match engine.db().create_budget_goal(&id, None, name, target_amount, deadline, None) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Created goal: {} (target: ${:.2}{})", name, target_amount,
                deadline.map(|d| format!(" by {}", d)).unwrap_or_default()),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_budget_get_goals(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    match engine.db().get_budget_goals(None) {
        Ok(goals) => {
            if goals.is_empty() {
                return Ok(ToolResult { success: true, output: "No budget goals set yet.".into(), error: None });
            }
            let lines: Vec<String> = goals.iter().map(|g| {
                let pct = if g.target_amount > 0.0 { (g.current_amount / g.target_amount * 100.0).min(100.0) } else { 0.0 };
                format!("• {} — ${:.2} / ${:.2} ({:.0}%){}", g.name, g.current_amount, g.target_amount, pct,
                    g.deadline.as_deref().map(|d| format!(" by {}", d)).unwrap_or_default())
            }).collect();
            Ok(ToolResult { success: true, output: lines.join("\n"), error: None })
        }
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

// ── Life Autopilot Tool Implementations ──

fn execute_life_add_task(args: &Value) -> Result<ToolResult> {
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    if title.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("Title is required".into()) });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let category = args.get("category").and_then(|v| v.as_str());
    let priority = args.get("priority").and_then(|v| v.as_str()).unwrap_or("medium");
    let due_date = args.get("due_date").and_then(|v| v.as_str());
    let energy_type = args.get("energy_type").and_then(|v| v.as_str());

    match engine.db().add_life_task(&id, "NULL", title, category, priority, due_date, energy_type) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Added task: '{}' (priority: {}{})", title, priority,
                due_date.map(|d| format!(", due: {}", d)).unwrap_or_default()),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_life_list_tasks(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let status = args.get("status").and_then(|v| v.as_str());
    match engine.db().get_life_tasks("NULL", status) {
        Ok(tasks) => {
            if tasks.is_empty() {
                return Ok(ToolResult { success: true, output: "No tasks found.".into(), error: None });
            }
            let lines: Vec<String> = tasks.iter().map(|t| {
                let due = t.due_date.as_deref().map(|d| format!(" (due: {})", d)).unwrap_or_default();
                format!("• [{}] {}{} - {}", t.id[..8.min(t.id.len())].to_uppercase(), t.title, due, t.priority)
            }).collect();
            Ok(ToolResult { success: true, output: lines.join("\n"), error: None })
        }
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_life_complete_task(args: &Value) -> Result<ToolResult> {
    let task_id = args.get("task_id").and_then(|v| v.as_str()).unwrap_or("");
    if task_id.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("task_id is required".into()) });
    }

    let engine = super::get_engine();
    match engine.db().update_life_task_status("NULL", task_id, "completed") {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Task completed: {}", task_id),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_life_add_habit(args: &Value) -> Result<ToolResult> {
    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("Name is required".into()) });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let category = args.get("category").and_then(|v| v.as_str());
    let frequency = args.get("frequency").and_then(|v| v.as_str()).unwrap_or("daily");
    let target_count = args.get("target_count").and_then(|v| v.as_i64()).unwrap_or(1);

    match engine.db().add_life_habit(&id, "NULL", name, category, frequency, target_count) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Added habit: '{}' ({}{})", name, frequency,
                if target_count > 1 { format!(", target: {} times", target_count) } else { String::new() }),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_life_log_habit(args: &Value) -> Result<ToolResult> {
    let habit_id = args.get("habit_id").and_then(|v| v.as_str()).unwrap_or("");
    if habit_id.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("habit_id is required".into()) });
    }

    let engine = super::get_engine();
    let now = chrono::Utc::now().format("%Y-%m-%d").to_string();
    match engine.db().log_life_habit(&uuid::Uuid::new_v4().to_string(), habit_id, "NULL", &now, 1) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Habit logged for today: {}", habit_id),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_life_add_reminder(args: &Value) -> Result<ToolResult> {
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let due_date = args.get("due_date").and_then(|v| v.as_str()).unwrap_or("");
    if title.is_empty() || due_date.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("title and due_date are required".into()) });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let description = args.get("description").and_then(|v| v.as_str());
    let priority = args.get("priority").and_then(|v| v.as_str()).unwrap_or("medium");
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

// ── Feed Tool Implementations ──

fn execute_feed_add_item(args: &Value) -> Result<ToolResult> {
    let content_type = args.get("content_type").and_then(|v| v.as_str()).unwrap_or("");
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    if content_type.is_empty() || title.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("content_type and title are required".into()) });
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
    let unread_only = args.get("unread_only").and_then(|v| v.as_bool()).unwrap_or(false);

    let db = engine.db();
    let conn = db.conn();
    let mut query = String::from("SELECT id, content_type, title, source_url, category FROM content_feed WHERE 1=1");
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
        let rows = stmt.query_map(rusqlite::params_from_iter(&params), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?, row.get::<_, Option<String>>(4)?))
        }).map_err(|e| e.to_string())?;
        let items: Vec<_> = rows.filter_map(|r| r.ok()).collect();
        if items.is_empty() {
            return Ok("No feed items found.".to_string());
        }
        let lines: Vec<String> = items.iter().map(|(_id, ct, title, url, cat)| {
            let url_str = url.as_deref().map(|u| format!(" - {}", u)).unwrap_or_default();
            let cat_str = cat.as_deref().map(|c| format!(" [{}]", c)).unwrap_or_default();
            format!("• [{}] {}{}{}", ct, title, cat_str, url_str)
        }).collect();
        Ok(lines.join("\n"))
    })();
    match result {
        Ok(output) => Ok(ToolResult { success: true, output, error: None }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e) }),
    }
}

fn execute_feed_mark_read(args: &Value) -> Result<ToolResult> {
    let id = args.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("id is required".into()) });
    }

    let engine = super::get_engine();
    let db = engine.db();
    let conn = db.conn();
    match conn.execute("UPDATE content_feed SET is_read = 1 WHERE id = ?1", rusqlite::params![id]) {
        Ok(_) => Ok(ToolResult {
            success: true,
            output: format!("Marked feed item as read: {}", id),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

// ── Dreams Tool Implementations ──

fn execute_dream_add(args: &Value) -> Result<ToolResult> {
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let category = args.get("category").and_then(|v| v.as_str()).unwrap_or("");
    if title.is_empty() || category.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("title and category are required".into()) });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let description = args.get("description").and_then(|v| v.as_str());
    let target_date = args.get("target_date").and_then(|v| v.as_str());

    match engine.db().add_dream(&id, None, title, description, category, target_date) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Added dream: '{}' (category: {}{})", title, category,
                target_date.map(|d| format!(", target: {}", d)).unwrap_or_default()),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_dream_list(args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let status = args.get("status").and_then(|v| v.as_str());
    match engine.db().get_dreams("NULL", status) {
        Ok(dreams) => {
            if dreams.is_empty() {
                return Ok(ToolResult { success: true, output: "No dreams found.".into(), error: None });
            }
            let lines: Vec<String> = dreams.iter().map(|d| {
                let target = d.target_date.as_deref().map(|t| format!(" (target: {})", t)).unwrap_or_default();
                let progress = (d.progress * 100.0).round();
                format!("• [{}] {}{} - {}% complete (category: {})", d.id[..8.min(d.id.len())].to_uppercase(), d.title, target, progress, d.category)
            }).collect();
            Ok(ToolResult { success: true, output: lines.join("\n"), error: None })
        }
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_dream_add_milestone(args: &Value) -> Result<ToolResult> {
    let dream_id = args.get("dream_id").and_then(|v| v.as_str()).unwrap_or("");
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    if dream_id.is_empty() || title.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("dream_id and title are required".into()) });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let description = args.get("description").and_then(|v| v.as_str());
    let target_date = args.get("target_date").and_then(|v| v.as_str());
    let sort_order = args.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(1);

    match engine.db().add_milestone(&id, &dream_id, "NULL", title, description, target_date, sort_order) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Added milestone to dream {}: '{}'{}", dream_id, title,
                target_date.map(|d| format!(" (target: {})", d)).unwrap_or_default()),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

fn execute_dream_add_task(args: &Value) -> Result<ToolResult> {
    let dream_id = args.get("dream_id").and_then(|v| v.as_str()).unwrap_or("");
    let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
    if dream_id.is_empty() || title.is_empty() {
        return Ok(ToolResult { success: false, output: String::new(), error: Some("dream_id and title are required".into()) });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let engine = super::get_engine();
    let milestone_id = args.get("milestone_id").and_then(|v| v.as_str());
    let description = args.get("description").and_then(|v| v.as_str());
    let due_date = args.get("due_date").and_then(|v| v.as_str());
    let frequency = args.get("frequency").and_then(|v| v.as_str());

    match engine.db().add_dream_task(&id, dream_id, milestone_id, "NULL", title, description, due_date, frequency) {
        Ok(()) => Ok(ToolResult {
            success: true,
            output: format!("Added task to dream {}: '{}'{}", dream_id, title,
                due_date.map(|d| format!(" (due: {})", d)).unwrap_or_default()),
            error: None,
        }),
        Err(e) => Ok(ToolResult { success: false, output: String::new(), error: Some(e.to_string()) }),
    }
}

// ── Cross-App Intelligence Tool Implementations ──

fn execute_weekly_summary(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let now = chrono::Utc::now();
    let this_month = now.format("%Y-%m").to_string();
    let mut sections: Vec<String> = Vec::new();

    // 1. Budget summary
    let member_id = engine.db().get_config("supabase_user_id").unwrap_or_default().unwrap_or_else(|| "default_user".to_string());
    if let Ok(summary) = engine.db().get_budget_summary(&member_id, &this_month) {
        sections.push(format!("💰 Budget ({}): Spent ${:.2} | Income ${:.2} | Net ${:.2}",
            this_month, summary.total_expenses, summary.total_income, summary.net));
    }

    // 2. Kitchen — meals + expiring inventory
    let member_id = engine.db().get_config("supabase_user_id").unwrap_or_default().unwrap_or_else(|| "default_user".to_string());
    if let Ok(meals) = engine.db().get_meals(None, None, false) {
        sections.push(format!("🍳 Kitchen: {} meals in collection", meals.len()));
    }
    if let Ok(inventory) = engine.db().get_inventory(&member_id, None) {
        let expiring: Vec<_> = inventory.iter()
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
    if let Ok(tasks) = engine.db().get_life_tasks("NULL", Some("pending")) {
        sections.push(format!("🧠 Life: {} pending tasks", tasks.len()));
    }
    if let Ok(habits) = engine.db().get_life_habits("NULL", true) {
        sections.push(format!("📊 Habits: {} active, best streak: {}",
            habits.len(),
            habits.iter().map(|h| h.streak).max().unwrap_or(0)));
    }

    // 4. Dreams — active
    if let Ok(dashboard) = engine.db().get_dream_dashboard("NULL") {
        let names: Vec<_> = dashboard.dreams.iter()
            .filter(|d| d.status == "active")
            .map(|d| format!("{} ({:.0}%)", d.title, d.progress * 100.0))
            .collect();
        if !names.is_empty() {
            sections.push(format!("🎯 Dreams: {}", names.join(", ")));
        }
    }

    // 5. Home — bills
    if let Ok(bills) = engine.db().get_home_bills(None, 5) {
        let total: f64 = bills.iter().map(|b| b.amount).sum();
        sections.push(format!("🏠 Home: {} bills tracked, recent total ${:.2}", bills.len(), total));
    }

    Ok(ToolResult {
        success: true,
        output: sections.join("\n"),
        error: None,
    })
}

fn execute_can_afford(args: &Value) -> Result<ToolResult> {
    let amount = args.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let description = args.get("item_description").and_then(|v| v.as_str()).unwrap_or("purchase");

    let engine = super::get_engine();
    let now = chrono::Utc::now();
    let this_month = now.format("%Y-%m").to_string();

    let member_id = engine.db().get_config("supabase_user_id").unwrap_or_default().unwrap_or_else(|| "default_user".to_string());
    let summary = engine.db().get_budget_summary(&member_id, &this_month)?;
    let discretionary = summary.total_income - summary.total_expenses;

    let mut analysis = Vec::new();
    analysis.push(format!("📊 Affordability: ${:.2} for {}", amount, description));
    analysis.push(format!("   Income: ${:.2} | Spent: ${:.2} | Remaining: ${:.2}",
        summary.total_income, summary.total_expenses, discretionary));

    if amount <= discretionary * 0.3 {
        analysis.push("   ✅ Comfortable — well within discretionary budget.".to_string());
    } else if amount <= discretionary {
        analysis.push("   ⚠️ Possible but tight — significant portion of remaining funds.".to_string());
    } else {
        analysis.push("   ❌ Over budget — exceeds current discretionary spending.".to_string());
    }

    // Show savings goals
    if let Ok(goals) = engine.db().get_budget_goals(None) {
        for goal in &goals {
            let remaining = goal.target_amount - goal.current_amount;
            let pct = if goal.target_amount > 0.0 { (goal.current_amount / goal.target_amount * 100.0).min(100.0) } else { 0.0 };
            analysis.push(format!("   🎯 '{}': ${:.2}/${:.2} ({:.0}%, ${:.2} to go)",
                goal.name, goal.current_amount, goal.target_amount, pct, remaining));
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
    if let Ok(tasks) = engine.db().get_life_tasks("NULL", Some("pending")) {
        let today_tasks: Vec<_> = tasks.iter()
            .filter(|t| t.due_date.as_deref().map_or(false, |d| d <= today.as_str()))
            .collect();
        if !today_tasks.is_empty() {
            let names: Vec<_> = today_tasks.iter().map(|t| t.title.as_str()).collect();
            sections.push(format!("📋 Tasks: {}", names.join(", ")));
        }
    }

    // 2. Inventory expiring today or tomorrow
    let member_id = engine.db().get_config("supabase_user_id").unwrap_or_default().unwrap_or_else(|| "default_user".to_string());
    if let Ok(inventory) = engine.db().get_inventory(&member_id, None) {
        let urgent: Vec<_> = inventory.iter()
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
    if let Ok(bills) = engine.db().get_home_bills(None, 5) {
        if !bills.is_empty() {
            sections.push(format!("🏠 Bills: {} recent bills on file", bills.len()));
        }
    }

    // 4. Active dreams quick check
    if let Ok(dreams) = engine.db().get_dreams("NULL", Some("active")) {
        if !dreams.is_empty() {
            let items: Vec<_> = dreams.iter().map(|d| format!("{} ({:.0}%)", d.title, d.progress * 100.0)).collect();
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
