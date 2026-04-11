# Conflux Home — Rebuild Specification

> **Status:** RECOVERY — Restoring lost work from uncommitted changes  
> **Date:** 2026-03-24  
> **Root Cause:** `git reset --hard` wiped uncommitted overhauls (Pulse, Hearth, Orbit, Horizon)  
> **Rule Going Forward:** Every agent MUST commit after each verified checkpoint.

---

## What Was Lost

| Build | Features Lost | Estimated Scope |
|-------|--------------|----------------|
| Desktop Polish | Welcome screen centering, agents-bottom-bar removal, ConnectivityWidget → TopBar popup, chat widget fix | ~4 files modified |
| Budget (Pulse) | 9 Rust commands, budget_goals table, emerald CSS, NL entry, pattern detection, goals | ~8 files |
| Kitchen (Hearth) | 12 Rust commands, 10 types, meal_photos table, amber CSS, 7 components, 5 hooks, 7 LLM prompts, KitchenView rewrite | ~15 files |
| Life Autopilot (Orbit) | 15 Rust commands, 6 DB tables, violet CSS, focus engine, morning brief, habit tracking, NL input, orbit prompts | ~10 files |
| Dreams (Horizon) | 5 Rust commands, 4 DB methods, 3 types, deep blue CSS, 6 components, 6 hooks, DreamBuilderView rewrite, horizon prompts | ~12 files |

**Total:** ~41 Rust commands, ~11 DB tables, ~4 design systems, ~13 React components, ~11 hooks, ~13 LLM prompt templates, 4 view rewrites.

---

## What Survived (Do NOT Rebuild)

These files exist as untracked artifacts on disk and can be directly re-integrated:

| File | Lines | Status |
|------|-------|--------|
| `src/styles/kitchen-hearth.css` | 954 | ✅ Ready |
| `src/lib/kitchen-prompts.ts` | 295 | ✅ Ready |
| `src/lib/budget-prompts.ts` | 89 | ✅ Ready |
| `src/styles-orbit.css` | 1,550 | ✅ Ready |
| `src-tauri/src/engine/orbit_prompts.rs` | 818 | ✅ Ready |

---

## Rebuild Strategy — 5 Workloads

Each workload follows this protocol:
1. **Build** — Spawn parallel agents on Mimo V2 Pro
2. **Verify** — TypeScript + Rust compile check
3. **Test** — Launch dev server, test affected features
4. **Approve** — Don reviews and approves
5. **Commit** — `git add -A && git commit -m "..."` BEFORE moving on

---

## WORKLOAD 1: Desktop Polish + Google Taskbar

**Priority:** FIRST — restores the UI shell that everything else sits inside

### Scope
1. Welcome screen centering (all 6 onboarding screens)
2. Remove agents-bottom-bar, move ConnectivityWidget to TopBar popup
3. Chat widget fix (ensure it opens/closes properly)
4. Google menu integration in taskbar (from memory: Google Connect was in onboarding, need taskbar placement)
5. Master backlog creation

### Files to Modify
- `src/components/Onboarding.tsx` — center screens
- `src/components/DesktopWidgets.tsx` — remove bottom bar
- `src/components/TopBar.tsx` — add ConnectivityWidget popup
- `src/App.tsx` — chat widget wiring

### Acceptance Criteria
- [ ] All 6 onboarding screens visually centered
- [ ] No agents-bottom-bar visible
- [ ] ConnectivityWidget accessible from TopBar
- [ ] Chat widget opens/closes without crash
- [ ] Google services accessible from taskbar/dock area

### Checkpoint
```
git add -A && git commit -m "feat: Desktop polish — centered onboarding, TopBar connectivity, chat fix"
```

---

## WORKLOAD 2: Budget (Pulse) Overhaul

**Priority:** SECOND — financial tracking is core functionality

### Scope
1. **Rust commands (9):** budget_parse_natural, budget_detect_patterns, budget_can_afford, budget_create_goal, budget_get_goals, budget_update_goal, budget_delete_goal, budget_goal_status, budget_generate_report
2. **DB:** budget_goals table in schema.sql + DB methods in db.rs
3. **Rust types:** BudgetGoal in types.rs
4. **Frontend:** Styles (emerald palette, SVG ring, ambient grid), LLM prompts, BudgetView rewrite
5. **lib.rs:** Register all new commands

### Survived Files (re-integrate directly)
- `src/lib/budget-prompts.ts` (89 lines) — LLM prompt templates
- Styles will need to be rebuilt (no CSS survived)

### Files to Modify
- `src-tauri/src/commands.rs` — append 9 commands
- `src-tauri/src/engine/db.rs` — append DB methods
- `src-tauri/src/engine/types.rs` — add BudgetGoal type
- `src-tauri/schema.sql` — add budget_goals table
- `src-tauri/src/lib.rs` — register commands
- `src/components/BudgetView.tsx` — rewrite with Pulse design
- `src/types.ts` — add TypeScript types
- `src/hooks/useBudget.ts` — extend with goal/pattern methods

### New Files to Create
- `src/styles/budget-pulse.css` — emerald design system

### Acceptance Criteria
- [ ] Natural language budget entry works ("spent $45 on groceries")
- [ ] Pattern detection identifies spending trends
- [ ] Budget goals CRUD works
- [ ] Monthly report generates
- [ ] Emerald design system applied (dark emerald, SVG ring, ambient grid)
- [ ] TypeScript: zero errors
- [ ] Rust: compiles clean

### Checkpoint
```
git add -A && git commit -m "feat: Budget Pulse overhaul — NL entry, patterns, goals, emerald design"
```

---

## WORKLOAD 3: Kitchen (Hearth) Full Build

**Priority:** THIRD — most complex build, 12 commands + 7 components

### Scope
1. **Rust commands (12):** kitchen_home_menu, kitchen_upload_meal_photo, kitchen_identify_meal_from_photo, kitchen_plan_week_natural, kitchen_suggest_meal_natural, kitchen_pantry_heatmap, kitchen_use_expiring, kitchen_get_cooking_steps, kitchen_weekly_digest, kitchen_get_nudges, kitchen_smart_grocery, kitchen_get_meal_photos
2. **Rust types (10):** HomeMenuItem, MealPhoto, PantryHeatItem, CookingStep, KitchenDigest, KitchenNudge, SmartGroceryList, etc.
3. **DB:** meal_photos table + 7 DB helper methods
4. **React components (7):** HearthHero, HomeMenu, CookingMode, KitchenDigest, KitchenNudges, PantryHeatmap, SmartGrocery
5. **React hooks (5):** useHomeMenu, useCookingMode, useKitchenDigest, useKitchenNudges, useMealPhotos
6. **KitchenView.tsx:** Full rewrite, 5-tab layout
7. **LLM prompts (7):** plan week, suggest meal, identify photo, nutrition, cooking tips, smart grocery, home menu

### Survived Files (re-integrate directly)
- `src/styles/kitchen-hearth.css` (954 lines) — amber palette, ember particles
- `src/lib/kitchen-prompts.ts` (295 lines) — 7 LLM prompts

### Files to Modify
- `src-tauri/src/commands.rs` — append 12 commands
- `src-tauri/src/engine/db.rs` — append 7 methods
- `src-tauri/src/engine/types.rs` — add 10 types
- `src-tauri/schema.sql` — add meal_photos table
- `src-tauri/src/lib.rs` — register commands
- `src/components/KitchenView.tsx` — full rewrite
- `src/types.ts` — add TypeScript interfaces

### New Files to Create
- `src/components/HearthHero.tsx`
- `src/components/HomeMenu.tsx`
- `src/components/CookingMode.tsx`
- `src/components/KitchenDigest.tsx`
- `src/components/KitchenNudges.tsx`
- `src/components/PantryHeatmap.tsx`
- `src/components/SmartGrocery.tsx`
- `src/hooks/useHomeMenu.ts`
- `src/hooks/useCookingMode.ts`
- `src/hooks/useKitchenDigest.ts`
- `src/hooks/useKitchenNudges.ts`
- `src/hooks/useMealPhotos.ts`
- `src/styles/kitchen-hearth.css` (survived, re-add)
- `src/lib/kitchen-prompts.ts` (survived, re-add)

### Acceptance Criteria
- [ ] "What can I cook RIGHT NOW?" home menu works
- [ ] Photo upload + AI meal identification works
- [ ] Natural language meal planning works
- [ ] Pantry heatmap shows freshness scoring
- [ ] Cooking mode with step-by-step + timers works
- [ ] Weekly digest with insights generates
- [ ] Proactive nudge cards display
- [ ] Smart grocery with aisle sorting works
- [ ] Amber design system applied (ember particles, recipe cards)
- [ ] 5-tab layout functional
- [ ] TypeScript: zero errors
- [ ] Rust: compiles clean

### Checkpoint
```
git add -A && git commit -m "feat: Kitchen Hearth overhaul — 12 commands, 7 components, amber design"
```

---

## WORKLOAD 4: Life Autopilot (Orbit) Full Build

**Priority:** FOURTH — productivity engine

### Scope
1. **Rust commands (15):** focus engine, morning brief, habit tracking, smart reschedule, NL input, decision helper, heatmap, etc.
2. **DB tables (6):** life_tasks, life_habits, life_habit_logs, life_daily_focus, life_schedules, life_nudges
3. **Design system:** Violet glassmorphism, orbit timeline ribbon
4. **Features:** Focus engine with priority scoring, morning brief, proactive nudges, habit tracking, smart reschedule

### Survived Files (re-integrate directly)
- `src/styles-orbit.css` (1,550 lines) — violet glassmorphism
- `src-tauri/src/engine/orbit_prompts.rs` (818 lines) — AI prompts

### Files to Modify
- `src-tauri/src/commands.rs` — append 15 commands
- `src-tauri/src/engine/db.rs` — append DB methods for 6 tables
- `src-tauri/src/engine/types.rs` — add orbit types
- `src-tauri/schema.sql` — add 6 tables
- `src-tauri/src/lib.rs` — register commands
- `src/components/LifeAutopilotView.tsx` — full rewrite
- `src/types.ts` — add TypeScript types

### Acceptance Criteria
- [ ] Focus engine prioritizes daily tasks
- [ ] Morning brief generates with context
- [ ] Habit tracking (create, log, streaks) works
- [ ] Smart reschedule suggests optimal task timing
- [ ] Natural language input parses tasks
- [ ] Decision helper analyzes options
- [ ] Activity heatmap displays
- [ ] Violet glassmorphism applied
- [ ] TypeScript: zero errors
- [ ] Rust: compiles clean

### Checkpoint
```
git add -A && git commit -m "feat: Life Autopilot Orbit overhaul — 15 commands, 6 tables, violet design"
```

---

## WORKLOAD 5: Dreams (Horizon) Full Build

**Priority:** FIFTH — goal tracking and motivation

### Scope
1. **Rust commands (5):** dream_get_velocity, dream_get_timeline, dream_update_progress_manual, dream_get_all_active_with_velocity, dream_ai_narrate
2. **DB methods (4):** get_dream_velocity, get_dream_timeline, set_dream_progress, get_active_dreams_with_velocity
3. **Rust types (3):** DreamVelocity, DreamTimeline, TimelineEntry
4. **React components (6):** HorizonHero, HorizonGoalCard, HorizonMilestonePath, HorizonInsightCard, HorizonVelocity + barrel export
5. **React hooks (6):** useDreams extended
6. **DreamBuilderView.tsx:** Full rewrite to HorizonView
7. **Design system:** Deep midnight blue, dawn gradient sky, mountain silhouettes, summit glow, star particles, fog drift

### Files to Modify
- `src-tauri/src/commands.rs` — append 5 commands
- `src-tauri/src/engine/db.rs` — append 4 methods
- `src-tauri/src/engine/types.rs` — add 3 types
- `src-tauri/src/lib.rs` — register commands
- `src/components/DreamBuilderView.tsx` — full rewrite
- `src/hooks/useDreams.ts` — extend with velocity/timeline/narrate
- `src/types.ts` — add TypeScript types

### New Files to Create
- `src/styles/horizon-hopes.css` — deep blue mountain design system
- `src/prompts/horizon-prompts.ts` — 6 AI prompt templates
- `src/components/horizon/HorizonHero.tsx`
- `src/components/horizon/HorizonGoalCard.tsx`
- `src/components/horizon/HorizonMilestonePath.tsx`
- `src/components/horizon/HorizonInsightCard.tsx`
- `src/components/horizon/HorizonVelocity.tsx`
- `src/components/horizon/index.ts`

### Acceptance Criteria
- [ ] AI goal decomposition breaks dreams into milestones
- [ ] Velocity tracking shows pace toward goals
- [ ] Milestone trail visualization works
- [ ] Altitude gauge shows progress
- [ ] Motivational AI narratives generate
- [ ] Mountain hero scene with stars/glow renders
- [ ] Summit glow animation (3-layer pulse) works
- [ ] TypeScript: zero errors
- [ ] Rust: compiles clean

### Checkpoint
```
git add -A && git commit -m "feat: Dreams Horizon overhaul — 5 commands, mountain design, velocity tracking"
```

---

## Execution Rules

1. **One workload at a time.** No parallel workloads.
2. **Mimo V2 Pro only.** No model overrides without Don approval.
3. **Commit after every checkpoint.** Non-negotiable.
4. **Don approves before next workload.** Stop and verify.
5. **Agents must verify before reporting.** TypeScript + Rust compile check mandatory.
6. **All agents commit their work.** Each agent ends with `git add` + `git commit`.

---

## Progress Tracker

| # | Workload | Status | Committed |
|---|----------|--------|-----------|
| 1 | Desktop Polish + Google Taskbar | ⬜ NOT STARTED | — |
| 2 | Budget (Pulse) Overhaul | ⬜ NOT STARTED | — |
| 3 | Kitchen (Hearth) Full Build | ⬜ NOT STARTED | — |
| 4 | Life Autopilot (Orbit) Full Build | ⬜ NOT STARTED | — |
| 5 | Dreams (Horizon) Full Build | ⬜ NOT STARTED | — |

---

*Created: 2026-03-24 18:33 MST*
