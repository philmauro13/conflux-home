# ORBIT — Full Build Plan

> Life Autopilot — The Conflux Home
> Started: 2026-03-24

---

## Overview

Transform the Life tab from a functional document/reminder manager into **Orbit** — a soft violet, proactive life intelligence engine with its own visual identity, AI hero features, and mobile-first design.

**Core philosophy:** Your life, on autopilot. The AI doesn't wait for you to ask — it notices, prioritizes, and nudges. It sees your patterns, protects your time, and tells you what matters before you know to ask.

**The NEED test:** "I can't manage my life without Orbit anymore. It tells me what to focus on before I even open the app. It knows my patterns. It reschedules things when I fall behind. Going back to a regular to-do list feels broken."

---

## Why This App Creates NEED

Every other life management app is a list you fill in. Orbit is different:

1. **It tells YOU what to do.** You don't sort your own priorities — the AI does, based on urgency, importance, habits, energy patterns, and time of day.
2. **It notices what you miss.** Haven't called your mom in 3 weeks? Haven't exercised in 4 days? Orbit sees it and nudges you. No input required.
3. **It reschedules around you.** Missed a task? Orbit doesn't just move it to tomorrow — it finds the optimal slot based on your patterns, schedule, and task type.
4. **It connects the dots across your life.** Budget app shows you're eating out more? Orbit suggests meal planning. Kitchen app says you're low on groceries? Orbit adds it to your task list.
5. **It gives you a 30-second morning briefing.** Open Orbit, see your entire day in one visual. What matters. What's urgent. What you almost forgot.

---

## Design Identity

| Element | Specification |
|---------|--------------|
| **Name** | Orbit |
| **Primary palette** | Violet 50→950 scale (#F5F3FF → #1E1B4B) |
| **Hero accent** | `#8B5CF6` (violet-500), `#7C3AED` (violet-600) |
| **Urgency glow** | `#EF4444` (red-500) for overdue/critical |
| **Success** | `#22C55E` (green-500) for completed/healthy |
| **Warning** | `#F59E0B` (amber-500) for habit streaks breaking |
| **Background** | `#0F0D1A` (near-black with violet undertone) |
| **Card style** | Floating glass — `backdrop-filter: blur(12px)`, subtle violet border, soft shadow |
| **Hero element** | The Orbit Visualization — radial priority map with items orbiting the user |
| **AI input glow** | Violet ring glow (Pulse green → Hearth amber → Orbit violet) |
| **Typography** | System sans for UI, monospace for dates/countdowns |
| **Animations** | Gentle orbital drift, pulse on priority items, fade-in nudges |
| **Mobile-first** | All layouts start at 375px, expand up |

---

## AI Hero Features

### H1. Focus Score — "What Should I Focus On?"

**The centerpiece.** Every task, reminder, and habit gets a dynamic Focus Score (0-100) computed by AI based on:

- **Urgency** — Due date proximity, overdue status
- **Importance** — User-set priority, recurring patterns
- **Energy fit** — Task complexity vs. time of day (deep work in morning, admin in afternoon)
- **Habit streak** — Breaking a 20-day streak? Score spikes.
- **Context** — Related documents, family members involved
- **Historical patterns** — You always reschedule this task on Mondays? Score adjusts.

The Focus Engine produces a ranked "Today's Top 5" that appears as the hero section. Not a to-do list — a prioritized life map.

### H2. The Morning Brief — "Your Day in 30 Seconds"

When you open Orbit, the hero shows:

```
🌅 Good morning, Don.

🔴 2 things overdue — Insurance renewal (3 days), HVAC filter (yesterday)
🟡 3 habits need attention — Exercise (4 days), Reading (6 days)
🟢 1 thing on track — Mortgage payment (auto-drafted)
📅 Next up — Dentist appointment Thursday at 2pm
💡 Insight — You've been most productive on Tuesdays this month
```

No scrolling. No lists. Just: here's your life right now.

### H3. Habit Nudges — "You Haven't Exercised in 4 Days"

Define habits with:
- Name, description, frequency (daily/weekly/custom)
- Streak tracking (current streak, longest streak)
- Soft/hard mode (soft = nudge, hard = escalating alert)

Orbit proactively generates nudge cards:
- "You're on a 12-day reading streak 🔥 Keep it going!"
- "You haven't exercised in 4 days. Your average is every 2 days."
- "You're slipping on water intake — 3 of last 7 days missed."

### H4. Smart Reschedule — "I Found a Better Slot"

When you miss a task or mark "snooze," the AI:
1. Analyzes your calendar for open slots
2. Considers task type (deep work → morning, admin → afternoon)
3. Checks for batching opportunities (group similar tasks)
4. Suggests the optimal time, not just "tomorrow"

User experience: "Moved 'Call insurance' to Wednesday 10am — your lightest meeting day this week."

### H5. Life Radar — "I Noticed Something"

Orbit monitors patterns across ALL Conflux apps:
- Budget: spending spike on dining → "Want to add meal planning to your week?"
- Kitchen: low pantry items → "Add grocery run to your tasks?"
- Calendar: back-to-back meetings → "Block 2pm-3pm for deep work?"
- Habits: exercise streak breaking → "Quick 20-min workout before your 3pm?"

The nudge is a card that appears without being asked. The agent is watching.

### H6. Relationship Tracker — "Last Contacted"

Optional feature: track important people and when you last connected.
- "You haven't called Mom in 22 days"
- "Last text to Sarah was 2 weeks ago"
- Nudges based on relationship importance and contact frequency

### H7. Decision Helper — "Let's Think Through This"

Natural language input: "Should I take the freelance project or focus on Conflux?"
AI response: structured analysis considering:
- Your current commitments and workload
- Financial impact (pulls from Budget app if connected)
- Historical decisions (what you chose before in similar situations)
- Energy and time availability
- Alignment with your stated goals

### H8. Progress Heatmap — "Your Consistency Map"

A calendar heatmap showing life admin activity:
- Days you completed tasks = green intensity
- Days you missed habits = red tint
- AI overlay: "Your best weeks are when you start Monday strong"
- Streak visualization for habits

---

## New Database Tables

### life_tasks
```sql
CREATE TABLE IF NOT EXISTS life_tasks (
    id TEXT PRIMARY KEY,
    member_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',       -- 'work', 'personal', 'health', 'admin', 'social'
    priority TEXT DEFAULT 'normal',        -- 'urgent', 'high', 'normal', 'low'
    focus_score REAL DEFAULT 50.0,         -- AI-computed 0-100
    due_date TEXT,                         -- ISO date
    estimated_minutes INTEGER,             -- time estimate
    energy_type TEXT DEFAULT 'any',        -- 'deep', 'shallow', 'creative', 'admin', 'any'
    status TEXT DEFAULT 'active',          -- 'active', 'completed', 'snoozed', 'archived'
    snoozed_until TEXT,                     -- when snoozed task becomes active again
    completed_at TEXT,
    source TEXT DEFAULT 'manual',          -- 'manual', 'ai-parsed', 'doc-extracted', 'nudge'
    source_doc_id TEXT REFERENCES life_documents(id),
    recurring BOOLEAN DEFAULT 0,
    frequency TEXT,                        -- 'daily', 'weekly', 'monthly', custom
    batch_group TEXT,                      -- for smart batching (e.g., 'calls', 'errands')
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### life_habits
```sql
CREATE TABLE IF NOT EXISTS life_habits (
    id TEXT PRIMARY KEY,
    member_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    frequency TEXT NOT NULL,               -- 'daily', '3x_week', 'weekly', custom
    target_days TEXT,                      -- JSON: ["mon","wed","fri"] for custom
    streak_current INTEGER DEFAULT 0,
    streak_longest INTEGER DEFAULT 0,
    last_completed TEXT,                    -- ISO date
    total_completions INTEGER DEFAULT 0,
    mode TEXT DEFAULT 'soft',              -- 'soft' (nudge) or 'hard' (escalating alert)
    importance TEXT DEFAULT 'normal',      -- affects Focus Score weighting
    category TEXT DEFAULT 'health',        -- 'health', 'productivity', 'social', 'creative'
    is_active BOOLEAN DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### life_habit_logs
```sql
CREATE TABLE IF NOT EXISTS life_habit_logs (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL REFERENCES life_habits(id) ON DELETE CASCADE,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    note TEXT                              -- optional context ("ran 3 miles", "20 min meditation")
);
```

### life_daily_focus
```sql
CREATE TABLE IF NOT EXISTS life_daily_focus (
    id TEXT PRIMARY KEY,
    member_id TEXT,
    focus_date TEXT NOT NULL,              -- ISO date
    priorities TEXT NOT NULL,              -- JSON: [{task_id, title, focus_score, reason}]
    morning_brief TEXT,                    -- AI-generated morning summary
    insights TEXT,                         -- JSON: [{type, message}]
    generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### life_schedules
```sql
CREATE TABLE IF NOT EXISTS life_schedules (
    id TEXT PRIMARY KEY,
    member_id TEXT,
    title TEXT NOT NULL,
    event_type TEXT DEFAULT 'event',       -- 'event', 'meeting', 'deadline', 'block'
    start_time TEXT NOT NULL,              -- ISO datetime
    end_time TEXT NOT NULL,                -- ISO datetime
    location TEXT,
    description TEXT,
    is_recurring BOOLEAN DEFAULT 0,
    source TEXT DEFAULT 'manual',          -- 'manual', 'ai-parsed', 'synced'
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### life_nudges
```sql
CREATE TABLE IF NOT EXISTS life_nudges (
    id TEXT PRIMARY KEY,
    member_id TEXT,
    nudge_type TEXT NOT NULL,              -- 'habit_break', 'overdue', 'suggestion', 'insight', 'radar'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',
    related_task_id TEXT REFERENCES life_tasks(id),
    related_habit_id TEXT REFERENCES life_habits(id),
    action_label TEXT,                     -- e.g., "Add to tasks", "Reschedule", "Dismiss"
    action_command TEXT,                   -- JSON: what the action does
    is_dismissed BOOLEAN DEFAULT 0,
    is_acted BOOLEAN DEFAULT 0,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Rust Commands (Track A)

### Core CRUD

| Command | Purpose |
|---------|---------|
| `life_add_task` | Create task (NL or manual) |
| `life_update_task` | Update status, priority, due date |
| `life_complete_task` | Mark complete, update streaks |
| `life_snooze_task` | Snooze + smart reschedule |
| `life_delete_task` | Archive a task |
| `life_add_habit` | Define a new habit |
| `life_log_habit` | Log habit completion, update streak |
| `life_update_habit` | Edit habit settings |
| `life_add_schedule_event` | Add calendar event |
| `life_get_schedule` | Get events for date range |
| `life_dismiss_nudge` | Dismiss a nudge |

### AI-Powered (The Hero Features)

| Command | Purpose |
|---------|---------|
| `life_get_focus` | **THE HERO** — AI generates Today's Top 5 with Focus Scores |
| `life_get_morning_brief` | AI generates morning summary |
| `life_parse_natural_input` | "Remind me to call dentist Thursday" → task + reminder |
| `life_smart_reschedule` | AI finds optimal slot for missed task |
| `life_get_nudges` | Generate proactive nudge cards |
| `life_analyze_productivity` | AI analyzes patterns, streaks, consistency |
| `life_decide` | Decision helper — structured analysis |
| `life_get_life_radar` | Cross-app pattern detection |
| `life_get_heatmap` | Generate consistency heatmap data |

### Dashboard (Enhanced)

| Command | Purpose |
|---------|---------|
| `life_get_orbit_dashboard` | Full Orbit dashboard: focus, habits, nudges, stats |
| `life_get_tasks` | Get tasks with filters |
| `life_get_habits` | Get habits with status |
| `life_get_habit_streaks` | Get streak data for heatmap |

---

## React Components (Track B)

### Hero Components

1. **OrbitVisualization** — The radial priority map
   - SVG-based concentric rings
   - Items orbit at different distances based on urgency/importance
   - Larger items = higher Focus Score
   - Click to expand task detail
   - Gentle continuous rotation animation

2. **MorningBrief** — "Your Day in 30 Seconds"
   - Card with colored sections (overdue, habits, schedule, insight)
   - Animated entrance (staggered fade-in)
   - Compact, scannable layout

3. **FocusList** — Today's Top 5
   - Ranked list with Focus Score bars
   - Color-coded by urgency
   - Tap to complete, swipe to snooze
   - Animated score transitions

### Core Components

4. **NLTaskInput** — "Tell me what to do"
   - Glowing violet input field
   - AI parsing feedback (shows what it understood)
   - Quick-add buttons for common categories

5. **HabitTracker** — Streak visualization
   - Weekly grid (7 dots per habit, filled/empty)
   - Streak flame for consecutive days
   - Nudge indicators

6. **NudgeCard** — Proactive insight cards
   - Color-coded by type
   - Action button (Add to tasks, Reschedule, Dismiss)
   - Animated entrance

7. **SmartRescheduleModal** — When you miss something
   - Shows 3 AI-suggested time slots
   - Reason for each suggestion
   - One-tap to accept

8. **ProgressHeatmap** — Consistency calendar
   - GitHub-style contribution grid
   - Monthly view with day colors
   - AI insight overlay

9. **DecisionHelper** — "Let's think through this"
   - NL input for decisions
   - Structured pro/con/consequence analysis
   - Pulls context from other apps

10. **TaskDetail** — Expanded task view
    - Full info, Focus Score breakdown
    - Related documents
    - Suggested subtasks

11. **ScheduleTimeline** — Day/week view
    - Time blocks with tasks/events
    - Conflict highlighting
    - Available slot highlighting

---

## Prompt Templates (Track C)

### P1. Focus Engine Prompt
Analyzes all tasks, habits, reminders, schedule to produce ranked priorities with reasoning.

### P2. Morning Brief Prompt
Generates a 30-second life summary from all active data.

### P3. Natural Language Parser
Parses free-form input into structured task/reminder/habit/schedule event.

### P4. Smart Reschedule Prompt
Considers task type, calendar, energy patterns to suggest optimal time slots.

### P5. Nudge Generator Prompt
Detects patterns across habits, tasks, and cross-app data to generate proactive nudges.

### P6. Decision Helper Prompt
Structured analysis framework for life decisions with context awareness.

### P7. Productivity Analyzer Prompt
Analyzes completion patterns, streaks, and consistency for insights.

### P8. Life Radar Prompt
Cross-app pattern detection and suggestion generation.

---

## Build Phases

### Phase 1: Foundation (Batch 1 — Parallel)
- CSS design system (`orbit-design.css`)
- Prompt templates (`orbit-prompts.ts`)
- TypeScript types (`types.ts` additions)

### Phase 2: Backend + DB (Batch 2 — Parallel)
- Rust types for all new structs
- DB migration (schema.sql additions)
- Basic CRUD Rust commands

### Phase 3: Components (Batch 2 — Parallel)
- Core React components (FocusList, NLTaskInput, HabitTracker, NudgeCard)
- OrbitVisualization (SVG hero)
- MorningBrief

### Phase 4: AI Commands (Batch 3 — Parallel)
- Focus Engine command
- Morning Brief command
- Natural Language Parser command
- Smart Reschedule command
- Nudge Generator command

### Phase 5: Integration (Batch 3 — Parallel)
- React hooks (`useOrbit.ts`)
- LifeAutopilotView.tsx full rewrite
- lib.rs registration

### Phase 6: Polish (Batch 4)
- Compile verification (TypeScript + Rust)
- Animation polish
- Mobile responsive check
- Edge cases and empty states

---

## Component Layout — Mobile-First

```
┌─────────────────────────────┐
│ ◉ Orbit                     │ ← Header with orbit icon
├─────────────────────────────┤
│                             │
│  ┌─── Morning Brief ────┐  │ ← Hero card: today's summary
│  │ 🔴 2 overdue          │  │
│  │ 🟡 3 habits need you  │  │
│  │ 📅 Dentist Thu 2pm    │  │
│  └───────────────────────┘  │
│                             │
│  ┌─── Focus Top 5 ──────┐  │ ← Ranked priorities
│  │ 1. ████████░░ 87      │  │    with Focus Score bars
│  │ 2. ██████░░░░ 65      │  │
│  │ 3. █████░░░░░ 52      │  │
│  │ 4. ████░░░░░░ 43      │  │
│  │ 5. ███░░░░░░░ 31      │  │
│  └───────────────────────┘  │
│                             │
│  ┌─── Tell me what ──────┐  │ ← Violet glowing NL input
│  │ Remind me to...       │  │
│  └───────────────────────┘  │
│                             │
│  ┌─── Habits ────────────┐  │ ← Weekly dot grid
│  │ Exercise  ●●●○●●● 🔥7 │  │
│  │ Reading   ●●○○●●● 🔥3 │  │
│  │ Meditate  ●●●●●●● 🔥12│  │
│  └───────────────────────┘  │
│                             │
│  ┌─── Nudges ────────────┐  │ ← Proactive cards
│  │ 💡 You called Mom 22d  │  │
│  │    ago. Want to chat?  │  │
│  └───────────────────────┘  │
│                             │
│  ┌─── Schedule ──────────┐  │ ← Timeline
│  │ 9am  Deep work block  │  │
│  │ 11am Team standup     │  │
│  │ 2pm  Dentist (Thu)    │  │
│  └───────────────────────┘  │
│                             │
└─────────────────────────────┘
```

---

## Color Tokens (CSS Variables)

```css
--orbit-bg: #0F0D1A;
--orbit-surface: rgba(139, 92, 246, 0.08);
--orbit-surface-hover: rgba(139, 92, 246, 0.12);
--orbit-border: rgba(139, 92, 246, 0.2);
--orbit-accent: #8B5CF6;
--orbit-accent-dim: #7C3AED;
--orbit-text: #F5F3FF;
--orbit-text-secondary: #A78BFA;
--orbit-text-muted: #6D28D9;
--orbit-urgent: #EF4444;
--orbit-warning: #F59E0B;
--orbit-success: #22C55E;
--orbit-glow: 0 0 20px rgba(139, 92, 246, 0.3);
--orbit-glass: backdrop-filter: blur(12px); background: rgba(15, 13, 26, 0.7);
```

---

## What Makes Orbit Irreplaceable

1. **Proactive, not reactive.** Every other to-do app waits for input. Orbit generates insights without being asked.
2. **Cross-app intelligence.** Budget shows dining spike → Orbit suggests cooking. Kitchen shows low groceries → Orbit adds errand. No other app can do this because no other app has an integrated ecosystem.
3. **Focus Score.** Not just "due soonest" — a computed priority that considers YOUR patterns, energy, habits, and history.
4. **Smart Reschedule.** Not "move to tomorrow" — find the optimal slot based on your actual life.
5. **Habit streaks with consequences.** Breaking a 20-day streak hits different than missing day 1. Orbit knows this.
6. **30-second morning briefing.** You don't scroll through lists. You see your life in one glance.
7. **Decision helper with memory.** Paste a dilemma, get structured analysis that references your own patterns and commitments.
8. **The Orbit Visualization.** Your priorities literally orbit around you. It's beautiful and functional. You see what's close (urgent) and what's big (important) at a glance.

**The gap test:** Remove Orbit and try to manage your life with Apple Reminders. It will feel like going from a smartphone to a flip phone.

---

*Build with the same speed and ambition as Hearth. One app at a time. Ship before polishing.*
