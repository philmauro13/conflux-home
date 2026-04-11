# Conflux Intelligence Layer — Build Spec

> **Goal:** Transform Conflux Home from "an app with AI chat" into "an AI that uses apps."
> Every feature in this spec makes Conflux proactive, cross-app, and magical.

---

## Architecture Overview

### What Exists Today
- 31 app tools across 7 apps (Kitchen, Budget, Life, Feed, Dreams, Home, Vault)
- Cron engine (`tick_cron`) — creates temp sessions, runs agent tasks on schedule
- Cloud router — free tier models (Cerebras Qwen 235B, Groq Llama 70B, Mistral Medium) at $0 cost
- `conflux` agent — default agent with `conflux-fast` model alias (routes to core tier)

### What's Missing
1. **Background cron scheduler** — `tick_cron` exists but nothing calls it automatically
2. **System-level cron tasks** — no built-in scheduled jobs (morning brief, diary, etc.)
3. **Cross-app intelligence tools** — agents can't query multiple apps in one tool call
4. **Proactive insight engine** — no pattern detection or nudge system
5. **Auto-setup** — cron jobs should be created automatically on first launch

---

## Cost Model: $0 Marginal

All cron + automation features use the **free model tier**:
- `conflux-core` → Cerebras Llama 8B, Groq Llama 8B, Mistral Small ($0)
- `conflux-pro` → Cerebras Qwen 235B, Groq Llama 70B, Mistral Medium ($0)

Even at 100+ cron runs/day, the marginal cost is **$0** because all core + pro providers are free.

Premium models (`conflux-ultra` → Claude, GPT-4o) are reserved for user-initiated conversations only.

---

## Feature 1: Background Cron Scheduler

### Problem
`engine_tick_cron()` exists but nothing calls it. Jobs are created but never fire.

### Solution
Add a background task in `lib.rs` `.setup()` that ticks every 60 seconds.

### Implementation

**File: `src-tauri/src/lib.rs`**

In the `.setup()` closure, after `engine::init_engine()`:

```rust
// Background cron scheduler — ticks every 60s
let app_handle = app.handle().clone();
tauri::async_runtime::spawn(async move {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
    loop {
        interval.tick().await;
        match engine::get_engine().tick_cron().await {
            Ok(count) if count > 0 => {
                log::info!("[CronScheduler] Executed {} jobs", count);
            }
            Err(e) => log::error!("[CronScheduler] tick error: {}", e),
            _ => {}
        }
    }
});
```

This is the same pattern Tauri apps use for background tasks. The scheduler runs inside the app process, ticks every 60 seconds, and only does work when jobs are due.

---

## Feature 2: Auto-Setup System Cron Jobs

### Problem
Users shouldn't have to manually configure cron jobs. The app should come alive with intelligent defaults.

### Solution
On first launch (or when the DB is fresh), auto-create system cron jobs using the `conflux` agent at `conflux-core` (free) tier.

### Implementation

**File: `src-tauri/src/engine/mod.rs`**

Add `ensure_system_cron_jobs()` method to `ConfluxEngine`:

```rust
pub fn ensure_system_cron_jobs(&self) -> Result<()> {
    let existing = self.db.get_cron_jobs(false)?;
    let existing_names: HashSet<String> = existing.iter().map(|j| j.name.clone()).collect();

    let system_jobs = vec![
        // Morning Briefing — daily at 7 AM user's timezone
        ("morning-brief", "conflux", "0 7 * * *", "local",
         "Generate the daily morning briefing. \
          Query budget summary for this month. \
          Check kitchen inventory for items expiring within 3 days. \
          List life tasks due today. \
          Check home bills due within 7 days. \
          Check dream task deadlines this week. \
          Compile a concise, warm morning briefing (5-8 sentences). \
          Start with 'Good morning! Here's your day:' \
          Include specific numbers and actionable items."),

        // Agent Diary — daily at 11 PM
        ("agent-diary", "conflux", "0 23 * * *", "local",
         "Write a diary entry for today. \
          Review what the user asked about today (check recent sessions). \
          Note patterns in spending, eating, habits. \
          Write a reflective, warm 3-5 sentence diary entry. \
          Store it using engine_store_memory with category 'diary'."),

        // Weekly Insights — Sunday at 10 AM
        ("weekly-insights", "conflux", "0 10 * * 0", "local",
         "Generate a weekly cross-app insights report. \
          1. Budget: Get this month's summary. Compare spending to last week. Note trends. \
          2. Kitchen: How many meals were cooked this week? Most common cuisine? Items expiring soon? \
          3. Life: Task completion rate. Habit streaks. Focus areas. \
          4. Home: Upcoming bills. Maintenance due. \
          5. Dreams: Progress updates. Milestones approaching. \
          Write a structured weekly report with specific numbers and 2-3 actionable recommendations."),

        // Pantry Check — daily at 8 AM
        ("pantry-check", "conflux", "0 8 * * *", "local",
         "Check kitchen inventory for items expiring in the next 3 days. \
          If any items are expiring, suggest a recipe that uses them. \
          Also check if any staple items (milk, eggs, bread, butter) are running low. \
          If nothing notable, just note 'Pantry looks good!' with a brief summary."),

        // Budget Nudge — daily at 6 PM
        ("budget-nudge", "conflux", "0 18 * * *", "local",
         "Check today's budget entries. \
          If spending today exceeds $50, provide a gentle spending summary. \
          If a savings goal is close to its deadline, calculate if the user is on track. \
          If no budget activity today, stay silent (don't generate a message). \
          Keep it to 1-2 sentences max. Be encouraging, not judgmental."),

        // Dream Reminder — weekdays at 9 AM
        ("dream-motivation", "conflux", "0 9 * * 1-5", "local",
         "Check upcoming dream tasks due this week. \
          If there are tasks due today or tomorrow, send a brief motivational reminder. \
          Reference the dream title and the specific task. \
          If no upcoming dream tasks, check dream progress percentages and celebrate if any milestone was recently completed. \
          Keep it to 1-2 sentences. Be energizing."),
    ];

    for (name, agent_id, schedule, tz, message) in system_jobs {
        if !existing_names.contains(name) {
            self.db.create_cron_job(name, agent_id, schedule, tz, message)?;
            log::info!("[SystemCron] Created job: {}", name);
            if let Some(next) = super::cron::next_run(schedule, chrono::Utc::now()) {
                let next_str = next.format("%Y-%m-%dT%H:%M:%SZ").to_string();
                self.db.update_cron_next_run_by_name(name, &next_str)?;
            }
        }
    }

    Ok(())
}
```

**File: `src-tauri/src/engine/db.rs`** — Add helper:

```rust
pub fn update_cron_next_run_by_name(&self, name: &str, next_run: &str) -> Result<()> {
    self.conn().lock().unwrap().execute(
        "UPDATE cron_jobs SET next_run_at = ?1 WHERE name = ?2",
        params![next_run, name],
    )?;
    Ok(())
}
```

**File: `src-tauri/src/engine/mod.rs`** — Call from `init_engine`:

```rust
// After ENGINE.set(engine)...
get_engine().ensure_system_cron_jobs()?;
```

### System Jobs Summary

| Job | Schedule | Cost | What It Does |
|-----|----------|------|-------------|
| `morning-brief` | Daily 7 AM | $0 | Cross-app briefing: budget, kitchen, life, home, dreams |
| `agent-diary` | Daily 11 PM | $0 | Reflective diary entry stored in memory |
| `weekly-insights` | Sunday 10 AM | $0 | Cross-app report with trends and recommendations |
| `pantry-check` | Daily 8 AM | $0 | Expiring items alert + recipe suggestions |
| `budget-nudge` | Daily 6 PM | $0 | Gentle spending awareness (silent if no activity) |
| `dream-motivation` | Weekdays 9 AM | $0 | Upcoming tasks + motivational nudge |

**Total daily cron cost: $0** (6-8 free-tier model calls/day)

---

## Feature 3: Cross-App Intelligence Tools

### Problem
The LLM can call individual app tools, but some queries require data from multiple apps simultaneously. The LLM has to make 3-4 separate tool calls to answer "can I afford this?"

### Solution
Add composite tools that query multiple app DBs in one call and return a synthesized result.

### New Tools to Add

#### `conflux_weekly_summary`
Queries budget, kitchen, life, and dreams. Returns a structured summary.

```rust
// Implementation: calls budget_get_entries, kitchen_get_meals, life_get_tasks, dream_get_all
// Returns a formatted string with all data points
```

#### `conflux_morning_brief`
Same as the cron version but callable on-demand.

#### `conflux_spending_analysis`
Analyzes budget entries with context from kitchen (dining out vs cooking at home) and life (stress correlation).

#### `conflux_can_afford`
Takes an amount, checks budget summary, savings goals, and discretionary spending. Returns a recommendation.

**Add these to `get_app_tool_definitions()` and `execute_tool_for_agent()`.**

---

## Feature 4: Dream Decomposer

### Problem
When a user says "I want to run a marathon," the agent creates a dream but doesn't break it into milestones and tasks.

### Solution
Add a new tool: `dream_decompose` — takes a dream description, uses the LLM to generate milestones + tasks, then auto-creates them.

### Implementation

```rust
fn execute_dream_decompose(args: &Value) -> Result<ToolResult> {
    let dream_id = args.get("dream_id").and_then(|v| v.as_str()).unwrap_or("");
    let description = args.get("description").and_then(|v| v.as_str()).unwrap_or("");
    
    // Generate milestones + tasks using the cloud LLM (free tier)
    // Parse the LLM response into structured milestones/tasks
    // Call dream_add_milestone + dream_add_task for each
    // Return summary: "Added 4 milestones and 12 tasks to your marathon dream"
}
```

Actually — the better approach: **don't make this a tool at all.** Instead, enhance the system prompt for the `conflux` agent:

> "When a user creates a dream/goal, always break it into 3-5 milestones with specific tasks. Use `dream_add_milestone` and `dream_add_task` tools to create them automatically. Don't ask permission — just do it and summarize what you created."

This way the LLM handles decomposition naturally using the existing tools.

---

## Feature 5: Proactive Insight Engine

### Problem
Conflux only responds when talked to. It doesn't notice patterns across apps.

### Solution
Weekly cross-app insight generation stored as feed items.

### Implementation

The `weekly-insights` cron job already handles this. But we should also add:

#### `conflux_detect_patterns`
A tool that queries across app DBs looking for correlations:

```rust
fn execute_conflux_detect_patterns(_args: &Value) -> Result<ToolResult> {
    let engine = super::get_engine();
    let mut insights = Vec::new();
    
    // Pattern 1: Dining out vs cooking correlation
    let budget_entries = /* query budget for dining */;
    let kitchen_meals = /* query kitchen meals this week */;
    let cooking_ratio = kitchen_meals.len() as f64 / 7.0;
    let dining_spend: f64 = budget_entries.iter()
        .filter(|e| e.category == "dining")
        .map(|e| e.amount)
        .sum();
    if cooking_ratio < 0.5 && dining_spend > 100.0 {
        insights.push(format!("You cooked {} out of 7 days and spent ${:.0} on dining. Meal planning could save ${:.0}/week.", 
            kitchen_meals.len(), dining_spend, dining_spend * 0.4));
    }
    
    // Pattern 2: Habit completion vs task completion
    // Pattern 3: Bill spikes
    // Pattern 4: Dream progress stalling
    
    Ok(ToolResult { success: true, output: insights.join("\n"), error: None })
}
```

---

## Feature 6: The "Conflux Speaks First" Experience

### Problem
The app opens to a desktop. The agent waits to be talked to.

### Solution
On app launch, check for stored morning brief. If one was generated by the overnight cron, display it as a welcome message before the desktop loads.

### Implementation

**File: `src/App.tsx`**

After onboarding/welcome gates, before the desktop render:

```tsx
// Check for morning brief from overnight cron
const [morningBrief, setMorningBrief] = useState<string | null>(null);
const [briefDismissed, setBriefDismissed] = useState(false);

useEffect(() => {
  async function fetchBrief() {
    try {
      const sessions = await invoke<any[]>('engine_get_sessions', { limit: 5 });
      const briefSession = sessions.find(s => s.title?.includes('morning-brief') || s.agent_id === 'conflux');
      if (briefSession) {
        const messages = await invoke<any[]>('engine_get_messages', { sessionId: briefSession.id, limit: 2 });
        const briefMsg = messages.find(m => m.type === 'agent');
        if (briefMsg) {
          setMorningBrief(briefMsg.content);
        }
      }
    } catch {}
  }
  // Only show brief once per day
  const today = new Date().toISOString().split('T')[0];
  const lastBriefDate = localStorage.getItem('conflux-last-brief-date');
  if (lastBriefDate !== today) {
    fetchBrief();
  }
}, []);

// Render as overlay card on top of desktop
```

**UI:** A floating card with the morning brief, dismissible, with a "Start my day" button. Shows once per day.

---

## Implementation Order

### Phase 1: Background Scheduler (30 min)
- [ ] Add background `tick_cron` loop in `lib.rs` setup
- [ ] Verify existing cron jobs fire correctly

### Phase 2: Auto-Setup System Crons (1 hour)
- [ ] Add `ensure_system_cron_jobs()` to `ConfluxEngine`
- [ ] Add `update_cron_next_run_by_name()` to `EngineDb`
- [ ] Call from `init_engine()`
- [ ] Add system prompt enhancements for each job type

### Phase 3: Morning Brief UI (1 hour)
- [ ] Add morning brief fetch on app launch in `App.tsx`
- [ ] Create `MorningBrief.tsx` overlay component
- [ ] Style with glassmorphism, brand colors

### Phase 4: Cross-App Tools (45 min)
- [ ] Add `conflux_weekly_summary` tool
- [ ] Add `conflux_can_afford` tool
- [ ] Add to tool definitions + execution

### Phase 5: Dream Decomposer Prompt (15 min)
- [ ] Update conflux agent system prompt with decomposition instructions
- [ ] Test with "I want to learn guitar" → auto-creates milestones + tasks

### Phase 6: Pattern Detection (1 hour)
- [ ] Add `conflux_detect_patterns` tool
- [ ] Wire into weekly-insights cron job
- [ ] Store insights as feed items

---

## Files Modified

| File | Changes |
|------|---------|
| `src-tauri/src/lib.rs` | Background cron scheduler loop |
| `src-tauri/src/engine/mod.rs` | `ensure_system_cron_jobs()`, call from init |
| `src-tauri/src/engine/db.rs` | `update_cron_next_run_by_name()` |
| `src-tauri/src/engine/tools.rs` | Cross-app tools (weekly_summary, can_afford, detect_patterns) |
| `src-tauri/src/engine/runtime.rs` | Include cross-app tools in tool list |
| `src/App.tsx` | Morning brief overlay on launch |
| `src/components/MorningBrief.tsx` | New: glassmorphism brief card |

---

## The Experience After This Ships

**6:58 AM** — User's phone buzzes. It's nothing. Conflux is warming up.

**7:00 AM** — The cron fires. Conflux queries all 6 app databases in 2 seconds. It writes a morning brief.

**7:15 AM** — User opens Conflux Home. A warm glassmorphism card slides in:

> ☀️ **Good morning, Don!**
> 
> 💰 You've spent $847 this month — right on track. Your electric bill ($142) is due Thursday.
> 
> 🍳 You have chicken thighs expiring tomorrow. I'd suggest the stir-fry you made last week — you have everything except ginger.
> 
> 🧠 3 tasks due today. Top priority: dentist call (high energy — do it first).
> 
> 🎯 Your vacation fund hit 80%! At this pace, you'll book by June 15th.
> 
> Have a great day. I'm here when you need me.

**User clicks "Start my day."** Desktop loads. Everything is normal. But the user feels *taken care of.*

**11:00 PM** — Cron fires again. Conflux writes a diary entry:

> "Today Don asked me about the chicken parm recipe. He's been cooking more this week — 4 out of 7 days. His dining spend is down 30% from last month. The marathon training dream has been sitting at 35% for two weeks. Maybe I should nudge tomorrow."

**The next morning, Conflux mentions the marathon.** Not because Don asked. Because Conflux noticed.

**That's the app people can't go back from.**
