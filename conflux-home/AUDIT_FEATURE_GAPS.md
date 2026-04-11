# Conflux Home — Feature Gap Audit

> **Agent:** Helix (Market Research & Intelligence)
> **Date:** 2026-04-09
> **Thesis:** Conflux Home has strong **data infrastructure** — hooks fetch, backends compute, tools exist. The gap is between **showing** data and **acting** on it. The Intelligence Layer spec says agents should be proactive. Most apps are still reactive dashboards.

---

## Executive Summary

**Backend status: Surprisingly complete.** The Rust engine has:
- ✅ Background cron scheduler (60s ticks in `lib.rs`)
- ✅ 6 system cron jobs auto-installed (`ensure_system_cron_jobs()`)
- ✅ Cross-app tools: `conflux_weekly_summary`, `conflux_can_afford`, `conflux_day_overview`
- ✅ Budget pattern detection (`budget_detect_patterns`)
- ✅ 51+ app tools across all domains
- ✅ MorningBrief UI component
- ✅ Agent status polling (ConfluxBarV2 badges)

**The gap:** The frontend mostly **displays** what the backend computes. Very few features make the agent **proactive** — acting without being asked. The spec says "Conflux speaks first." Reality: Conflux waits for a click.

---

## Feature Gap Table

| App | Feature | Displays? | AI Acts? | Gap | Priority |
|-----|---------|-----------|----------|-----|----------|
| **Budget** | Pattern detection | ✅ Loaded in hook (`useBudget.ts:patterns`) | ❌ Never rendered in `BudgetView.tsx` | Patterns computed but invisible to user | 🔴 HIGH |
| **Budget** | Goals progress | ✅ Goals loaded, progress bars shown | ❌ No "on track" / "behind" auto-analysis | Shows numbers, doesn't interpret them | 🔴 HIGH |
| **Budget** | Surplus calculation | ✅ Cockpit gauge shows surplus | ❌ No nudge when surplus is negative | Displays math, doesn't warn | 🟡 MEDIUM |
| **Budget** | `can_afford` tool | ✅ Backend ready, hook exposed | ❌ Never called from UI | Tool exists, no frontend integration | 🔴 HIGH |
| **Budget** | Natural language input | ✅ `parseNatural` in hook | ❌ Not in BudgetView | API exists, no UI surface | 🟡 MEDIUM |
| **Kitchen** | Expiring items | ✅ Nudges component renders | ❌ Click navigates only | No auto-suggest recipes for expiring items | 🟡 MEDIUM |
| **Kitchen** | Weekly digest | ✅ `KitchenDigest` component | ❌ Manual load only | No auto-display on home tab | 🟡 MEDIUM |
| **Kitchen** | Grocery cost | ✅ `totalCost` computed | ❌ No budget cross-reference | Kitchen doesn't ask Budget "can we afford this?" | 🔴 HIGH |
| **Kitchen** | Meal planning | ✅ Grid shows plan | ❌ No AI auto-fill | User must manually slot every meal | 🟡 MEDIUM |
| **Life** | Smart reschedule | ✅ `smartReschedule` in hook | ❌ Button-triggered only | Agent doesn't auto-reschedule overdue tasks | 🔴 HIGH |
| **Life** | Morning brief | ✅ `morningBrief()` function | ❌ Manual button click | User must initiate — spec says agent speaks first | 🔴 HIGH |
| **Life** | Nudges | ✅ `AlertConsole` renders nudges | ❌ No nudge generation logic | Frontend exists, backend nudge engine missing | 🔴 HIGH |
| **Life** | Cross-app insights | ✅ `InsightCards` component + hook | ❌ Hook returns empty (backend TBD) | UI built, intelligence not wired | 🔴 HIGH |
| **Life** | Energy-aware scheduling | ❌ Not implemented | ❌ Not implemented | Spec says tasks should match energy levels | 🟠 SPEC-GAP |
| **Dreams** | Velocity tracking | ✅ Loaded per dream | ❌ Display only — no action | Stalling dreams don't auto-nudge | 🟡 MEDIUM |
| **Dreams** | AI narration | ✅ `narrate()` button | ❌ Manual trigger only | Agent doesn't narrate proactively | 🟡 MEDIUM |
| **Dreams** | Dream decomposition | ❌ Not implemented | ❌ Not implemented | Spec says "create dream → auto-break into milestones" | 🔴 HIGH |
| **Dreams** | Goal sync to other apps | ❌ Not implemented | ❌ Not implemented | Spec says Dreams should influence Kitchen, Life, Budget | 🟠 SPEC-GAP |
| **Feed** | Signal detection | ✅ "Scan for Signals" button | ❌ Manual trigger | No continuous/background signal scanning | 🟡 MEDIUM |
| **Feed** | Cognitive patterns | ✅ `CognitiveSidebar` renders | ❌ Patterns don't influence content | Analysis happens but doesn't change behavior | 🟡 MEDIUM |
| **Feed** | Content generation | ✅ `generate()` in hook | ❌ No auto-generation | User must click "generate" to get content | 🟡 MEDIUM |
| **Home** | Predictions | ✅ `FoundationPredictionsGrid` | ❌ Display only | No proactive "schedule this now" from predictions | 🟡 MEDIUM |
| **Home** | Diagnosis | ✅ `FoundationDiagnosisCard` | ❌ Manual symptom entry | Agent doesn't check home health proactively | 🟡 MEDIUM |
| **Home** | Seasonal tasks | ✅ Calendar renders tasks | ❌ No auto-reminders | Tasks shown but not surfaced as nudges | 🟡 MEDIUM |
| **Home** | Warranty alerts | ✅ `FoundationVault` renders | ❌ Only when tab opened | No proactive warranty expiry warnings | 🟡 MEDIUM |
| **Vault** | File management | ✅ Grid/list/timeline views | ❌ Pure CRUD | No AI organization, tagging, or cleanup suggestions | 🟡 MEDIUM |
| **Echo** | Pattern detection | ✅ Mirror tab shows patterns | ❌ Patterns don't trigger prompts | Agent doesn't say "you seem stressed lately" | 🟡 MEDIUM |
| **Echo** | Mood tracking | ✅ Mood selector + timeline | ❌ No mood-based interventions | Mood data collected but not acted on | 🟡 MEDIUM |
| **Studio** | Generation | ✅ Prompt bar + output | ❌ Manual generation only | No auto-suggestions based on context | 🟢 LOW |
| **Agents** | Persona editing | ✅ Full editor | ❌ Static | No agent learning or self-improvement | 🟢 LOW |
| **Cross-App** | `conflux_weekly_summary` | ✅ Backend tool exists | ❌ No UI component | Tool can be called by agent but has no dedicated view | 🔴 HIGH |
| **Cross-App** | Agent-to-agent messaging | ❌ Not implemented | ❌ Not implemented | Spec's Phase 2 — agents can't communicate | 🟠 SPEC-GAP |
| **Cross-App** | Morning Brief overlay | ✅ `MorningBrief.tsx` built | ⚠️ Partial | Only searches 20 sessions for brief; may miss cron-generated briefs | 🟡 MEDIUM |
| **Cross-App** | ConfluxBarV2 badges | ✅ `useAgentStatus` polls data | ⚠️ Partial | Shows counts, not actionable insights (no "+$47 saved") | 🟡 MEDIUM |
| **Cross-App** | Nudge engine | ❌ `useNudgeEngine.ts` missing | ❌ No nudge generation | Spec defines nudges; implementation doesn't exist | 🔴 HIGH |
| **Cross-App** | Weekly Insights UI | ❌ No `WeeklyInsights.tsx` | ❌ No insights card | Cron generates data; no view to display it | 🔴 HIGH |
| **Cross-App** | Agent boot cards | ✅ `AgentBootCards.tsx` exists | ❓ Unclear if wired | Component exists; may not be in App.tsx render path | 🟡 MEDIUM |
| **Cross-App** | Agent introductions | ✅ `AgentIntroductions.tsx` exists | ❓ Unclear if wired | Component exists; cold-start flow status unknown | 🟡 MEDIUM |
| **Cross-App** | Inter-agent comms | ❌ Not implemented | ❌ Not implemented | `agent_messages` table doesn't exist | 🟠 SPEC-GAP |
| **Security** | Permission gate UI | ❌ Not implemented | ❌ Not implemented | No way to see/control what agents access | 🟠 SPEC-GAP |
| **Security** | Activity log | ❌ Not implemented | ❌ Not implemented | No audit trail visible to user | 🟠 SPEC-GAP |

---

## Top 5 Gaps (Highest Impact)

### 1. 🔴 Budget Patterns: Computed but Invisible
**The Problem:** `budget_detect_patterns` runs on every Budget load. The data arrives in `useBudget.ts` as `patterns`. But `BudgetView.tsx` **never renders it.** The patterns array sits unused in state.

**The Impact:** The most expensive computation (pattern detection across all entries) produces nothing the user can see. This is the clearest "does work but doesn't show it" gap.

**The Fix:** Add a `PatternInsights` section to `BudgetView.tsx` that renders the patterns array. 1-2 hours of frontend work for immediate visible value.

---

### 2. 🔴 Life Nudges: Frontend Exists, Backend Doesn't Generate
**The Problem:** `AlertConsole` component renders `nudges` from the dashboard. But the backend doesn't actually generate nudges — there's no `nudges.rs` or nudge generation logic. The `useNudgeEngine.ts` hook doesn't exist (file missing).

**The Impact:** The spec's most user-facing feature ("agent taps your shoulder") is a shell. Nudges arrive empty because nothing produces them.

**The Fix:** Create `src-tauri/src/engine/nudges.rs` with logic to generate nudges from:
- Overdue tasks → "3 tasks overdue, want me to reschedule?"
- Budget overspend → "You've spent 80% of budget with 10 days left"
- Kitchen expiring → "Chicken expires tomorrow, here's a recipe"
- Dream stalling → "No progress on marathon in 14 days"

---

### 3. 🔴 Cross-App Insights: UI Built, Intelligence Not Wired
**The Problem:** `InsightCards.tsx` renders beautifully with staggered animations, confidence bars, source badges. `useCrossAppInsights.ts` calls `orbit_get_cross_app_insights`. But the backend command likely returns empty or doesn't exist — there's no cross-app correlation engine.

**The Impact:** The most spec-aligned feature ("agents talk to each other") is a beautiful empty state.

**The Fix:** Implement `orbit_get_cross_app_insights` to actually correlate data:
- Budget dining spend + Kitchen cooking frequency → "Cooking saves you $X/week"
- Life task completion + Dream progress → "You're 2x more productive on days you work on goals"
- Home bill spike + Budget surplus → "Electric bill up 40%, discretionary budget tight"

---

### 4. 🔴 Dream Decomposition: Spec Says Auto, Reality Says Manual
**The Problem:** The Intelligence Layer spec explicitly says: "When a user creates a dream/goal, always break it into 3-5 milestones with specific tasks. Don't ask permission — just do it." But `DreamBuilderView.tsx` creates a bare dream with no milestones or tasks. The user must manually add every milestone and task.

**The Impact:** Dreams are the most aspirational feature. Without auto-decomposition, they feel like empty progress bars.

**The Fix:** After `addDream()` succeeds, automatically invoke an AI pass that generates milestones + tasks. This can be done by:
1. Triggering a cron-like agent call after dream creation
2. Or enhancing the `dream_add` backend to call the LLM and create milestones inline

---

### 5. 🔴 Weekly Insights: Cron Generates, No UI Shows
**The Problem:** The `weekly-insights` cron job exists and runs Sunday at 10 AM. It queries all apps and generates a report. But there's no `WeeklyInsights.tsx` component and no way to see the report in the app. The data is generated into a session that may never be read.

**The Impact:** The spec's most compelling "Conflux speaks first" moment — a weekly review with specific numbers and recommendations — is backend-only.

**The Fix:** Create `WeeklyInsights.tsx` that:
1. On Sunday (or any day after Sunday), fetches the latest weekly-insights session
2. Renders a structured card like the spec describes
3. Shows on app launch if insights were generated that week

---

## Quick Wins (< 2 hours each)

| # | What | Effort | Impact |
|---|------|--------|--------|
| 1 | Render `patterns` in `BudgetView.tsx` | 1-2h | Users see pattern detection working |
| 2 | Wire `canAfford()` into BudgetView — "Can I afford X?" input | 1h | Tool exists, just needs UI |
| 3 | Wire `parseNatural` into BudgetView — NL transaction entry | 1h | Hook exists, UI missing |
| 4 | Add Kitchen → Budget cross-ref: show grocery cost vs budget | 2h | `totalCost` exists, budget data accessible |
| 5 | Auto-trigger morning brief on Life tab open (if not shown today) | 1h | Function exists, just needs auto-call |
| 6 | Render kitchen digest auto on home tab load | 30min | Hook loads data, just not always rendered |
| 7 | Make `smartReschedule` auto-trigger for overdue tasks | 2h | Function exists, needs auto-call logic |

---

## Missing Features from Spec

### Not Built At All (Spec Phase 1+)

| Feature | Spec Reference | Status |
|---------|---------------|--------|
| **Nudge engine** (`nudges.rs`) | Spec §1.3, Roadmap Phase 1.3 | ❌ File doesn't exist |
| **Weekly Insights UI** | Spec §1.4, Roadmap Phase 1.4 | ❌ No component |
| **Dream decomposer** | Spec §Feature 4 | ❌ Not implemented |
| **Conflux detect patterns** (cross-app) | Spec §Feature 5 | ❌ Tool doesn't exist |
| **Agent boot status** (`agent_get_boot_status`) | Roadmap Phase 0.2 | ❌ Rust command missing |
| **Energy-aware scheduling** | Roadmap Phase 1 | ❌ Not implemented |

### Not Built At All (Spec Phase 2+)

| Feature | Spec Reference | Status |
|---------|---------------|--------|
| **Inter-agent communication** (`agent_messages` table) | Roadmap Phase 2.1 | ❌ Not started |
| **Cross-app goal alignment** | Roadmap Phase 2.2 | ❌ Not started |
| **Family intelligence network** | Roadmap Phase 2.3 | ❌ Partial (profiles exist, intelligence doesn't) |

### Not Built At All (Spec Phase 4)

| Feature | Spec Reference | Status |
|---------|---------------|--------|
| **Permission gate UI** | Roadmap Phase 4.1 | ❌ Not started |
| **Activity log** | Roadmap Phase 4.1 | ❌ Not started |

---

## What's Actually Proactive (Working Today)

To be fair, some proactive features DO work:

1. **Cron scheduler** — 60s tick loop running in background ✅
2. **6 system cron jobs** — morning-brief, agent-diary, weekly-insights, pantry-check, budget-nudge, dream-motivation ✅
3. **Agent status badges** — ConfluxBarV2 polls every 5 min, shows expiring items, pending tasks ✅
4. **Kitchen nudges** — Backend generates nudges, frontend renders them ✅
5. **Morning brief UI** — Component fetches and displays overnight cron output ✅
6. **Intent router** — Keyword-based routing to correct app/agent ✅

But these are all **infrastructure.** The user experience still requires:
- Opening the app
- Clicking an app
- Clicking a button to trigger insight/brief/action

The spec's vision of "Conflux speaks first" — where the agent surfaces value before the user asks — is **~20% implemented.**

---

## Recommendations

### Phase 1: Close the Visibility Gap (1 week)
1. Render budget patterns in BudgetView
2. Wire cross-app insights backend (make `orbit_get_cross_app_insights` actually correlate data)
3. Create WeeklyInsights.tsx component
4. Auto-trigger morning brief on Life tab

### Phase 2: Build the Nudge Engine (1 week)
1. Create `nudges.rs` with pattern-based nudge generation
2. Create `useNudgeEngine.ts` hook
3. Add timed nudges (budget in evening, kitchen near mealtime, dreams Monday AM)
4. Wire nudges to ConfluxBarV2 as dismissible cards

### Phase 3: Make Dreams Self-Driving (3 days)
1. Auto-decompose dreams on creation
2. Auto-nudge on stalling (14 days no progress)
3. Goal sync: broadcast active dreams to Kitchen, Life, Budget

### Phase 4: Cross-App Intelligence (1 week)
1. Implement inter-agent message bus
2. Add cross-app pattern detection (`conflux_detect_patterns`)
3. Make agents influence each other (e.g., Kitchen savings → Budget surplus update)

---

## Conclusion

Conflux Home has a **remarkably complete backend** — the engine, tools, cron, and data layer are solid. The gap is entirely in the **frontend intelligence layer**: connecting computed data to visible, actionable user experiences.

The app **does the math** but doesn't **show the answer.** It **detects patterns** but doesn't **act on them.** It **runs cron jobs** but the results often go nowhere visible.

The fastest path to the "Conflux speaks first" vision: **close the visibility gap first, then build the nudge engine.** Everything else follows.
