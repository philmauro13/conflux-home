# 🎯 Life Orbit — "Mission Control" Redesign Spec
**Version:** 1.0
**Date:** 2026-04-05
**Target:** Life Autopilot (Orbit) App
**Aesthetic:** "Mission Control" / "Flight Cockpit"

---

## 🎯 Core Metaphor: "Mission Control" Dashboard

Life Orbit is the **central nervous system** of Conflux Home. It's not a to-do list — it's the **flight deck** where you monitor your life's trajectory.

### The Metaphor Breakdown:
- **Altitude Gauge** = Daily Momentum / Streak Strength
- **Horizon Line** = Today's Focus Tasks (visual priority)
- **Telemetry Grid** = Task & Habit Data
- **Fuel Meters** = Energy Levels & Progress
- **Alert Console** = Nudges & Smart Suggestions

---

## 🎨 Visual Identity: "Mission Control"

### Color Palette
- **Background:** `#0b0f14` (Deep Space Black) to `#121724` (Midnight Blue)
- **Primary Accent:** `#3b82f6` (Sky Blue) — altitude, flight path, focus
- **Secondary Accent:** `#10b981` (Emerald Green) — completion, success, streaks
- **Tertiary Accent:** `#f59e0b` (Amber) — warnings, due dates, priority indicators
- **Alert Color:** `#ef4444` (Red) — urgent tasks, overdue, critical alerts
- **Text:** `#e2e8f0` (Slate 200) for primary, `#94a3b8` (Slate 400) for labels

### Typography
- **Headings:** `Orbitron` (Space/sci-fi monospace) for headers, metrics
- **Body:** `Inter` (Clean sans-serif) for task descriptions
- **Data/Metrics:** `JetBrains Mono` (Monospace) for numbers and timestamps

### Effects
- **Glassmorphism:** Dark glass panels with subtle blue/green tints
- **Neon Glows:** Subtle box-shadows for active/focused elements
- **Animations:** Smooth transitions for state changes (hover, completion, nudges)

---

## 📐 Layout Structure

### Top Header Bar
```
┌────────────────────────────────────────────────────────────────────────────┐
│ 🌀 LIFE ORBIT              ✅ 4 today  🔥 12 streak  📋 8 tasks            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Middle: Altitude & Focus Section
```
┌────────────────────────────────────────────────────────────────────────────┐
│ [MORNING BRIEF CARD]  ☀️ Generated insights for the day                   │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ALTITUDE         │  TODAY'S FOCUS (Horizon Line)                         │
│   ┌───────────┐    │  ┌───────────────────────────────────────────────┐   │
│   │   84%     │    │  │ 1. [🚀] Finalize presentation deck            │   │
│   │   ████▌   │    │  │ 2. [⚡] Call dentist (Energy: High)          │   │
│   │   streak  │    │  │ 3. [🌙] Evening jog (Energy: Low)            │   │
│   └───────────┘    │  └───────────────────────────────────────────────┘   │
│                    │                                                       │
│   Completion Rate  │  🔼 2/3 focused tasks scheduled for today            │
│   This Week        │                                                       │
└────────────────────────────────────────────────────────────────────────────┘
```

### Bottom: Telemetry Grid (Tasks + Habits)
```
┌────────────────────────────────────────────────────────────────────────────┐
│ MISSION MANIFEST                                                          │
├────────────────────────────┬───────────────────────────────────────────────┤
│  PENDING TASKS (8)         │  HABIT TELEMETRY (4 active)                   │
│  ───────────────────────── │  ───────────────────────────────────────────  │
│  [🟠] Email client re      │  [💪] Gym — 🔥 14 streak                     │
│  [🟡] Grocery shopping     │  [📖] Reading — 🔥 3 streak                  │
│  [🟢] Water plants         │  [💧] Hydration — 📊 80% daily               │
│  [🔴] Pay rent (due: 4/7)  │  [🎨] Creative — 🔥 0 streak (new)           │
│  ...                       │                                               │
│                            │  📊 Weekly Activity Heatmap                  │
│  [+ ADD TASK]              │  M T W T F S S                              │
│                            │  ▓ ▓ ▓ ▓ ░ ▓ ▓                               │
└────────────────────────────┴───────────────────────────────────────────────┘
```

---

## 🎛️ UI Components

### 1. Altitude Gauge (Momentum Meter)
- **Visual:** Circular or vertical gauge showing daily completion rate
- **Metric:** "84% altitude = 12/15 planned items completed today"
- **Color:** Blue (base) → Green (high altitude) → Amber (declining) → Red (critical)

### 2. Horizon Line (Today's Focus)
- **Visual:** 3 vertical cards in a row, stacked by priority
- **Each card shows:**
  - Priority badge (emoji + color)
  - Energy level indicator (⚡ High / 🔋 Medium / 🌙 Low)
  - Category icon (💼 Work, 🏠 Home, 🎨 Creative, etc.)
  - Due date / "Today" / "Tomorrow"
- **Interactions:** Click to complete, swipe left to reschedule

### 3. Telemetry Grid
**Left: Task Manifest**
- Sortable by Priority → Due Date → Energy Level
- Each row: Checkbox + Title + Meta tags
- Quick-add input at bottom

**Right: Habit Dashboard**
- Streak counters with fire emoji
- Progress bars for daily/weekly targets
- "Log" button for each habit

### 4. Alert Console (Nudges)
- **Visual:** Slide-out panel or top banner
- **Types:**
  - 🔥 Streak maintenance ("Don't break your 14-day gym streak!")
  - ⚡ Energy mismatch ("You scheduled 3 high-energy tasks today — consider rescheduling one")
  - 🚨 Overdue alert ("Buy groceries was due yesterday")
  - 💡 Suggestion ("Based on your patterns, schedule creative work in the evening")

### 5. Morning Brief Card
- **Visual:** Collapsible card at top of view
- **Content:** AI-generated summary of day's plan, recent patterns, nudges
- **Action:** "Regenerate" button to refresh

### 6. Quick Log Modal
- **Trigger:** Floating action button or keyboard shortcut (Cmd+L)
- **Purpose:** Rapid task/habit entry via natural language
- **Flow:** Type → AI parses → Confirm → Add to manifest

---

## 🔧 Component Breakdown

### Existing → New Mapping
| Old Component | New Component | Notes |
|---------------|---------------|-------|
| `orbit-header` | `MissionControlHeader` | Add altitude gauge, streak metrics |
| `orbit-brief-section` | `MorningBriefCard` | Rename, add regenerate button |
| `orbit-focus-list` | `HorizonLine` | Visual priority stack, energy indicators |
| `orbit-task-list` | `TelemetryGrid` (Tasks) | Grid layout, sortable headers |
| `orbit-habit-grid` | `TelemetryGrid` (Habits) | Streak visualization, progress bars |
| `orbit-nudges-section` | `AlertConsole` | Slide-out or banner, priority sorting |
| `orbit-heatmap` | `ActivityHeatmap` | Keep, but style as "telemetry display" |

---

## ⚙️ Data Layer Updates (Post-Auth)

### DB Schema Additions
- `life_tasks.energy_type` → Already exists ✅
- `life_tasks.category` → Already exists ✅
- `life_tasks.priority` → Already exists ✅
- **New fields to consider:**
  - `life_tasks.estimated_duration` (minutes) — for energy-aware scheduling
  - `life_habits.target_type` (count / time / boolean) — for progress visualization

### API Updates (Rust Commands)
- `life_get_orbit_dashboard` → Add `user_id` param for data isolation
- `life_smart_reschedule` → Add `user_id` param
- **No new commands needed** — just user_id propagation

---

## 🚀 Implementation Order

1. **Phase 1: Visual Structure (2 hours)**
   - Build `MissionControlHeader` with altitude gauge
   - Build `HorizonLine` component
   - Build `TelemetryGrid` container
   - Wire existing data to new components

2. **Phase 2: Styling & Animation (1.5 hours)**
   - Apply "Mission Control" color palette
   - Add glassmorphism to panels
   - Add subtle animations (hover, focus, completion)
   - Style the altitude gauge

3. **Phase 3: Component Polish (1 hour)**
   - Refine `AlertConsole` (nudge display)
   - Add `MorningBriefCard` styling
   - Add keyboard shortcuts (Cmd+L for quick log)
   - Mobile responsiveness

4. **Phase 4: Auth Integration (Parallel)**
   - All Tauri commands accept `user_id`
   - DB queries filter by `member_id`
   - React hooks pass `user.id`

---

## 📝 Success Criteria

- [ ] Header shows altitude gauge with completion rate
- [ ] Focus tasks displayed in priority stack (Horizon Line)
- [ ] Tasks & habits in grid layout with proper headers
- [ ] Nudges appear in alert console (priority-sorted)
- [ ] Morning Brief card generates AI summary
- [ ] Quick Log modal accessible via keyboard shortcut
- [ ] All components styled with "Mission Control" aesthetic
- [ ] Auth wired (data isolated per user)
- [ ] Committed + pushed

---

## 🎯 Inspiration Sources

1. **NASA Mission Control** — Telemetry displays, alert consoles, status indicators
2. **Cockpit Instruments** — Altitude gauges, horizon indicators, fuel meters
3. **Productivity Dashboards** — Linear, Notion, Superhuman's command palette
4. **Sci-Fi Interfaces** — Minority Report, Interstellar HUD, The Expanse

---

## 🔗 Related Files

- **Current View:** `/home/calo/.openclaw/workspace/conflux-home/src/components/LifeAutopilotView.tsx`
- **Hook:** `/home/calo/.openclaw/workspace/conflux-home/src/hooks/useOrbit.ts`
- **Rust Commands:** `/home/calo/.openclaw/workspace/conflux-home/src-tauri/src/commands.rs`
- **DB Layer:** `/home/calo/.openclaw/workspace/conflux-home/src-tauri/src/engine/db.rs`
- **Blueprint Reference:** `/home/calo/.openclaw/workspace/conflux-home/docs/BUDGET_MATRIX_BLUEPRINT.md`

---

**Spec complete. Ready for Forge to finish auth rewire, then implement.**
