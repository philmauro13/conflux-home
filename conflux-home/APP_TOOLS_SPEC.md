# App Database Tools — Implementation Spec

## Overview

Conflux agents (Conflux, Helix, Forge, etc.) can chat with users but currently **cannot interact with any of the 16 built-in applications**. When a user says "add chicken parm to my kitchen" or "log $25 on food", the LLM generates a confident text response but nothing actually happens.

**Root cause:** The tool system in `src-tauri/src/engine/tools.rs` only exposes generic tools (web search, file ops, shell exec, Google Workspace). No tools map to the app-specific Tauri commands that read/write SQLite databases.

**Goal:** Add app-specific tools so agents can read and write to Kitchen, Budget, Life Autopilot, Feed, Dreams, Home Health, and Vault databases.

---

## Architecture

### Current Flow
```
User message → runtime.rs → cloud_chat() (with tool defs) → Cloud LLM
  → LLM returns tool_calls → runtime.rs → tools::execute_tool() → Result
  → Feed result back to LLM → Final text response
```

### What We're Adding
New tool definitions in `tools.rs` that map to existing Tauri commands. The tool execution happens **client-side** in Rust — it calls the same functions the React frontend calls via `invoke()`.

### Key Constraint
Tools are called from the Rust engine, not from the frontend. So we need to call the underlying Rust functions directly, NOT Tauri commands. Look at `commands.rs` for the function signatures, but call the `engine::` module functions directly where possible, or create thin wrappers.

Actually — the simplest approach: **call `invoke()` from the frontend is NOT possible from Rust**. We need to call the Rust functions directly. Most commands in `commands.rs` call into `engine::db` or other engine modules. We should create tool functions in `tools.rs` that do the same thing.

---

## Tool Registry (One Per App)

### 🍳 Kitchen Tools (6 tools)

| Tool Name | Description | Parameters | Maps To |
|-----------|-------------|------------|---------|
| `kitchen_add_meal` | Add a meal/recipe to the kitchen | `name: str`, `category: str?`, `cuisine: str?`, `instructions: str?` | `kitchen_create_meal()` |
| `kitchen_list_meals` | List meals in the kitchen | `category: str?`, `favorites_only: bool?` | `kitchen_get_meals()` |
| `kitchen_add_to_plan` | Add a meal to the weekly meal plan | `meal_id: str`, `week_start: str`, `day_of_week: i64`, `meal_slot: str` | `kitchen_set_plan_entry()` |
| `kitchen_get_plan` | Get the weekly meal plan | `week_start: str` | `kitchen_get_weekly_plan()` |
| `kitchen_add_inventory` | Add an item to kitchen inventory/pantry | `name: str`, `location: str?`, `quantity: str?`, `expiry_date: str?` | `kitchen_add_inventory()` |
| `kitchen_get_inventory` | List pantry/inventory items | `location: str?` | `kitchen_get_inventory()` |

### 💰 Budget Tools (5 tools)

| Tool Name | Description | Parameters | Maps To |
|-----------|-------------|------------|---------|
| `budget_add_entry` | Log an expense or income entry | `amount: f64`, `category: str`, `description: str?`, `entry_type: str?` ("expense"/"income"), `month: str?` | `budget_add_entry()` |
| `budget_get_entries` | List budget entries for a month | `month: str?`, `member_id: str?` | `budget_get_entries()` |
| `budget_get_summary` | Get monthly budget summary with totals | `month: str` | `budget_get_summary()` |
| `budget_create_goal` | Create a savings goal | `name: str`, `target_amount: f64`, `deadline: str?`, `monthly_allocation: f64?` | `budget_create_goal()` |
| `budget_get_goals` | List budget/savings goals | `member_id: str?` | `budget_get_goals()` |

### 🧠 Life Autopilot Tools (6 tools)

| Tool Name | Description | Parameters | Maps To |
|-----------|-------------|------------|---------|
| `life_add_task` | Add a task to the task list | `title: str`, `category: str?`, `priority: str?`, `due_date: str?`, `energy_type: str?` | `life_add_task()` |
| `life_list_tasks` | List tasks, optionally filtered by status | `status: str?` ("pending"/"completed") | `life_get_tasks()` |
| `life_complete_task` | Mark a task as completed | `task_id: str` | `life_complete_task()` |
| `life_add_habit` | Create a new habit to track | `name: str`, `category: str?`, `frequency: str?`, `target_count: i64?` | `life_add_habit()` |
| `life_log_habit` | Log a habit completion | `habit_id: str` | `life_log_habit()` |
| `life_add_reminder` | Set a reminder | `title: str`, `description: str?`, `due_date: str`, `priority: str?` | `life_add_reminder()` |

### 📰 Feed Tools (3 tools)

| Tool Name | Description | Parameters | Maps To |
|-----------|-------------|------------|---------|
| `feed_add_item` | Save content to the feed | `content_type: str`, `title: str`, `body: str`, `source_url: str?` | `feed_add_item()` |
| `feed_list_items` | List feed items | `content_type: str?`, `unread_only: bool?` | `feed_get_items()` |
| `feed_mark_read` | Mark a feed item as read | `id: str` | `feed_mark_read()` |

### 🎯 Dreams Tools (4 tools)

| Tool Name | Description | Parameters | Maps To |
|-----------|-------------|------------|---------|
| `dream_add` | Create a new dream/goal | `title: str`, `description: str?`, `category: str`, `target_date: str?` | `dream_add()` |
| `dream_list` | List all dreams | `status: str?` | `dream_get_all()` |
| `dream_add_milestone` | Add a milestone to a dream | `dream_id: str`, `title: str`, `description: str?`, `target_date: str?` | `dream_add_milestone()` |
| `dream_add_task` | Add a task under a dream/milestone | `dream_id: str`, `milestone_id: str?`, `title: str`, `description: str?`, `due_date: str?` | `dream_add_task()` |

### 🔧 Home Health Tools (4 tools)

| Tool Name | Description | Parameters | Maps To |
|-----------|-------------|------------|---------|
| `home_add_bill` | Record a utility/rent/mortgage bill | `bill_type: str`, `amount: f64`, `usage: f64?`, `billing_month: str`, `notes: str?` | `home_add_bill()` |
| `home_get_bills` | List recorded bills | `bill_type: str?`, `limit: i64?` | `home_get_bills()` |
| `home_add_maintenance` | Add a home maintenance task | `task: str`, `category: str`, `interval_months: i64?`, `priority: str?`, `estimated_cost: f64?` | `home_add_maintenance()` |
| `home_get_appliances` | List tracked home appliances | — | `home_get_appliances()` |

### 🔐 Vault Tools (3 tools)

| Tool Name | Description | Parameters | Maps To |
|-----------|-------------|------------|---------|
| `vault_list_files` | List files in the vault | `file_type: str?`, `limit: i64?` | `vault_get_files()` |
| `vault_search_files` | Search files by name/content | `query: str` | `vault_search_files()` |
| `vault_get_file` | Get details of a specific file | `id: str` | `vault_get_file()` |

---

## Files to Modify

### 1. `src-tauri/src/engine/tools.rs` — Add Tool Definitions + Implementations

- Add 31 new tool definitions to `get_app_tool_definitions()` (new function)
- Add 31 new match arms to `execute_tool_for_agent()`
- Add 31 new implementation functions
- Extend `get_tool_definitions()` OR create a separate `get_app_tool_definitions()` that gets merged in `runtime.rs`

### 2. `src-tauri/src/engine/runtime.rs` — Include App Tools in Tool List

- In both `process_turn()` and `process_turn_stream()`, add:
  ```rust
  tool_defs.extend(tools::get_app_tool_definitions());
  ```

### 3. `src-tauri/src/engine/db.rs` — May Need New Query Methods

- Some tools need DB queries that don't exist yet (check each command's implementation)
- Most should reuse existing methods

### 4. Frontend Chat Button Fix — `src/App.tsx`

- In `handleNavigate`, when `v === 'chat'`, do NOT set `immersiveView` to null
- Chat should open as an overlay on top of whatever view is active

---

## Implementation Notes

1. **All tool functions are async** — they call DB methods that may be sync, but the tool execution framework is async
2. **Error handling** — return `ToolResult { success: false, error: ... }` on failure, never panic
3. **Parameter validation** — check required params before calling DB functions
4. **The `id` parameter** — many commands require a pre-generated `id`. Use `uuid::Uuid::new_v4().to_string()` to generate one
5. **Date formats** — use `YYYY-MM-DD` for dates, `YYYY-MM` for months
6. **Default user context** — tools run in the agent context, not a specific family member. Pass `None` for `member_id` where optional.

---

## Testing

After implementation:
1. `cargo build` in `src-tauri/` — must compile
2. Open Conflux Home → Chat → Send "add chicken parm to my kitchen" → Should call `kitchen_add_meal` tool
3. Send "log $25 on food" → Should call `budget_add_entry` tool
4. Verify data appears in the respective app views

---

## Chat Button Fix

In `App.tsx`, `handleNavigate` function, the `chat` case:

**Current (broken):**
```tsx
} else if (v === 'chat') {
  setImmersiveView(null);  // ← kills current app
  setChatOpen(true);
}
```

**Fixed:**
```tsx
} else if (v === 'chat') {
  // Don't close immersive view — chat opens as overlay
  if (!selectedAgent) {
    const lastAgentId = localStorage.getItem('conflux-last-chat-agent');
    const byLast = lastAgentId ? agents.find(a => a.id === lastAgentId) : null;
    const byConflux = agents.find(a => a.id === 'conflux' || a.name.toLowerCase() === 'conflux');
    const byActive = agents.find(a => a.status !== 'offline');
    const pick = byLast || byConflux || byActive || agents[0];
    if (pick) setSelectedAgent(pick);
  }
  setChatOpen(true);
}
```
