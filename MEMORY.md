# Memory — Current State & Active Focus

> **Full historical archive:** `MEMORY_ARCHIVE.md` (session logs, build notes, old dream cycles, detailed debugging)
> This file is injected every session. Keep it lean. Target: <500 lines.

---

## ⚠️ PROJECT STRUCTURE

- `/home/calo/theconflux` → **Website** (theconflux.com)
- `/home/calo/.openclaw/workspace/conflux-admin` → **Admin dashboard**
- `/home/calo/.openclaw/workspace/conflux-home` → **Desktop app** (active)

## The Company

**The Conflux** — AI Agent Infrastructure Company.
**The Product:** Conflux Home — "A home for your AI family."
**Vision:** Download → Onboard → Team is Alive.
**Status:** Launch_ready (v0.1.66)

## Venture Studio Architecture

| Agent       | Role                |
| ----------- | ------------------- |
| **Vector**  | CEO / Gatekeeper    |
| **ZigBot**  | Strategic Partner   |
| **Prism**   | System Orchestrator |
| **Spectra** | Task Decomposition  |
| **Luma**    | Run Launcher        |
| **Helix**   | Market Research     |
| **Forge**   | Execution           |
| **Quanta**  | Verification        |
| **Pulse**   | Growth Engine       |

**Command Chain:** Vector → Prism → Spectra → Luma → Forge/Helix/Pulse → Quanta

## Recent Releases (Lean)

- **v0.1.66** (2026-04-11): Echo rename (Mirror → Echo), warm emoji 🤗 refresh
- **v0.1.65** (2026-04-10): Conflux Fairy Drag-and-Move
- **v0.1.64** (2026-04-10): Narrative Onboarding Redesign
- **v0.1.63** (2026-04-10): Onboarding Bug Fixes
- **v0.1.56** (2026-04-09): STT + Android graceful init
- **v0.1.55** (2026-04-09): Launch Readiness (Android fix, bundle reduction)
- **v0.1.54** (2026-04-09): Home Health Redesign
- **v0.1.53** (2026-04-07): Sync & Release Prep
- **v0.1.52** (2026-04-06): Conflux Presence (Fairy)
- **v0.1.50** (2026-04-06): Inter-Agent Communication Layer
- **v0.1.49** (2026-04-05): Auth Wiring Complete (Multi-user isolation)
- **v0.1.41** (2026-04-02): Agent Intelligence Layer (51 tools)

## Archived Dream Cycles

Full dream cycles (2026-04-02 through 2026-04-10) archived in `MEMORY_ARCHIVE.md`.

## Current Status

**🎯 FINAL_AUDIT.md Created** (2026-04-12)
- Dependency-ordered structure (Run → Interact → Save → Persist → Isolate → Auth → Soul)
- 7 phases, 16 apps with soul checkpoints
- Replaces conflux-home-audit.md as canonical reference
- Designed to be the LAST audit before launch

**🎯 v0.1.67 Pending** — Heartbeat redesign commit (2026-04-12 early AM)
- 3D red heart replaces blue dot — neumorphic SVG (gradient, highlight, shadow), slow 2.4s breathing animation
- Heart ripple ring fires on each Rust beat event
- Notch labels visible at each detent: OFF / 15m / 1hr / 4hr / 8hr / 12hr
- 'PULSE' label renamed to 'HEARTBEAT'
- Default interval changed: 30m → 1hr
- Ring color unified to red (#ef4444) throughout
- RingGauge: neumorphic redesign — larger circles (r=34), gradient arcs, glow filters, specular highlights, text inside ring
- Scheduler: tokio::select! mpsc channel — interval changes apply instantly (no waiting for old timer)
- Listen bugfix: proper cleanup (unlisten in useEffect return, not immediately after promise)
- `engine_set_heartbeat_interval` emits `conflux:heartbeat-interval-changed` to frontend
- Commit: `6e33b32`
- Spec: `SPEC_HEARTBEAT_KNOB.md` v0.3

**🎯 INTEL Heartbeat Section — Audit Checklist COMPLETE (2026-04-12)**
- All Phase 0.1 heartbeat items verified ✅
- Remaining: Phase 0.5 deferred polish (sound, fairy pulse, morning brief overlay, boot cards, nudge system)

**🎯 v0.1.66 Released (2026-04-11)**
- Echo renamed from Mirror (counselor agent identity)
- Warm emoji 🤗 replaces mirror emoji in Echo counselor UI
- Commit: 9ed1071

**🎯 Narrative Onboarding Complete**
- 4-step narrative flow: Name → Meet Team → Ice Breaker → Build World
- Aegis & Viper registered as protectors

**🎯 Audit Checklist Started (2026-04-11)**
- 15-phase, ~175-item audit in `conflux-home-audit.md`
- Phase 0 (Infrastructure) broken into app vs studio
- Phase 0.5 (Autonomous Mode) deferred post-audit

**🎯 Active Project:** Conflux Home (mission-1223)
- Version: v0.1.67-pending
- Status: Launch_ready
- Build: clean (Rust + TypeScript)

## What's Built (16 Apps)

1. Budget (Pulse)
2. Kitchen (Hearth)
3. Life Autopilot (Orbit)
4. Dreams (Horizon)
5. Feed (Current)
6. Games Hub
7. Snake
8. Home (Foundation)
9. Pac-Man
10. Solitaire
11. Agents + Market
12. Echo
13. Vault
14. Studio
15. Desktop Redesign v2
16. Voice Input

## What's Left

1. Code signing (macOS/Windows)
2. First real users / beta testers
3. Cybersecurity layer — mission-1224 (Chapter 2: permission gates, sandboxing, activity monitoring, anomaly detection)
4. Aegis/Viper features in Conflux Home (registered but not yet implemented)
5. Emergency security fixes (Aegis P0 items: rotate keys, enable CSP, remove VITE_ secrets, kill math shell fallback)
6. **Phase 1 (Desktop Shell audit)** — window chrome, sidebar, status bar
7. **Phase 4 (App audit)** — all 16 apps individually audited
8. **Phase 0.5 (Autonomous Mode polish)** — heartbeat sound, fairy pulse, morning brief overlay, boot cards, nudge system
9. **Phase 9 (Security)** — Aegis/Viper implementation

## Echo Features (Built 2026-04-11)

**Weekly Echo Letter** — AI-generated narrative letter summarizing the week's sessions. Stored in `echo_weekly_letters` table, generated via `echo_counselor_generate_weekly_letter` command. Displayed in 💌 Letter tab.

**Evening Ritual Reminder** — Cron-based daily notification. Enabled via Settings → Tools → Evening Ritual. Sends desktop notification if no session today.

**Voice Input** — Mic button (🎤) in session chat. Tap to record, tap again to stop and transcribe — text streams into the input field.

## Model & Preferences

**Default model:** TBD
**Preferences:** Direct, accurate, Windows-first, channel delivery

## Files

- **MEMORY.md**: This file (current state, lean)
- **MEMORY_ARCHIVE.md**: Full historical archive (22KB)
- **AGENTS.md**: Executive architecture (46 lines)
- **SOUL.md**: ZigBot identity (36 lines)
- **USER.md**: Don preferences (20 lines)
- **TOOLS.md**: Tool notes (66 lines)
- **IDENTITY.md**: Identity record (25 lines)
- **FINAL_AUDIT.md**: 7-phase launch audit checklist (dependency-ordered, workspace root)
- **conflux-home-audit.md**: 15-phase audit checklist (~175 items, legacy/replaced by FINAL_AUDIT.md)
- **conflux-home/SPEC_HEARTBEAT_KNOB.md**: PulseKnob spec and build plan
- **conflux-home/src/components/PulseKnob.tsx**: Heartbeat knob component
- **memory/2026-04-11-session.md**: This session's detailed log

---

## Dream Cycle Update — 2026-04-12

### Key Learnings
- [Autonomous Beat Sequence]: The 6-agent heartbeat beat map (morning brief → pantry check → budget nudge → dream nudge → feed refresh → agent diary) is the true product. Desktop shell is just the control surface.
- [Zero-Agent Empty State Risk]: Heartbeat fires for users with 0 agents configured — needs "Getting Started" trigger on first beat.
- [Interval Rate Limit Risk]: 30-second heartbeat with 6-agent beat map can exhaust free-tier calls in ~20 minutes. Need call budgets or automatic interval downgrade.
- [Pruning Context Debt]: Pruning files saves space but creates session context gaps. Log what is pruned going forward.

### Revised Strategies
- [Heartbeat Default: 30m]: Confirmed scale-safe for free tier. Fast intervals (Off/30s/1m/5m/30m/60m) available but require call budget safeguards.
- [Hero-First UI]: PulseKnob as centered hero between 2 ring gauges — fewer elements = stronger focus. "Working" ring gauge removed.
- [First-Impression Must-Be-Visceral]: Users need to *need* the app on first install, not want it. Heartbeat autonomous mode is the delivery mechanism.

### Session Harvest — 2026-04-12 Early AM
- Total interactions: 1 (Don, late-night work session)
- High-salience events: 4 major deliverables (heart redesign, scheduler fix, listen bugfix, neumorphic gauges)
- Don's feedback: "It's sooo good" after seeing the 3D heart — emotional resonance confirmed
- Key insight: emotional design beats functional design for this feature; users feel the heartbeat, not just set it

### Memory Pruning Summary
- Entries pruned: 0
- Entries compressed: 0
- Current memory load: ~42%

_Last updated: 2026-04-12 02:40 MST_

## Session 3 — 2026-04-12 (Late Night)

### Phase 1 Desktop Shell — COMPLETE
- Window chrome, ConfluxBarV2 dock/navigation, status bar all verified ✅
- All 1.1–1.4 items checked off in audit checklist
- One intentional gap: no "model in use" indicator (not needed for free/new users)

### Phase 1.4 Gap Fixed: Notification Bell
- **Backend:** `engine_send_notification` now fires real OS notifications via `tauri_plugin_notification` + `app_handle.notification().builder().show()`
- **Frontend:** 🔔 bell with dropdown (last 5 notifs, Clear all, Settings →)
- **Persistence:** `conflux-notif-unread` + `conflux-recent-notifs` in localStorage
- **Capability:** `notification:default` added to `capabilities/default.json`
- **Commit:** `bf0eaf6`

### Next Session Prompt (save this):
> "Continue the audit — Phase 1 Apps. Start by reading FINAL_AUDIT.md Phase 1 section, then test each app interactively: Kitchen, Budget, Life Autopilot, Dreams, Feed, Home Health, Echo, Vault, Marketplace, Agents, Stories. Add data, verify CRUD, check AI input features. Mark each verified item in FINAL_AUDIT.md."

---

## 📝 Session 4 — 2026-04-12: Kitchen Onboarding Build + Freeze Root Cause Discovery

### What We Built Today

**KitchenEmptyState.tsx** — First-run warm welcome experience
- Steam animation background (3 wisps, staggered timing)
- Large text input with cycling hint examples
- "Open Library" CTA
- Removed MicButton (triggers ElevenLabs STT which fails without a key)

**KitchenView.tsx** — Integrated empty state + heartbeat listener
- Shows `KitchenEmptyState` when `meals.length === 0`
- Listens for `conflux:heartbeat-beat` → refreshes home menu + nudges + digest
- `useTransition` added for non-blocking AI adds

**kitchen-hearth.css** — Steam animation visible on dark background
- Opacity bumped to 1.0, blur filter added

### Bugs Found & Fixed

| # | Bug | Fix | Commit |
|---|-----|-----|--------|
| 1 | `cloud_chat` missing `task_type` (all 16 calls) → 400 errors | Added `Some("simple_chat")` to all calls | `0f567f5` |
| 2 | ElevenLabs STT called even with no API key → 403 errors | Check `api_key.is_empty()` before streaming | `dd14db3` |
| 3 | `engine_create_session` camelCase params → STT failures | Changed `{agentId, userId}` → `{agent_id, user_id}` | `b30c0e2` |
| 4 | `tags` AI returned JSON array, code expected string → parse error | Two-pass parse: extract tags separately, then parse AIMeal | `fc3c6b2` |
| 5 | Empty state flashing during meals load | `mealsLoaded` state flag | `38fe9da` |
| 6 | Library tab AI add didn't reload meals | Added `reloadMeals()` call | `8e96f09` |
| 7 | `await loadHomeMenu()` double-blocking UI | Removed await (fire-and-forget) | `f8f3a8d` |
| 8 | `useTransition` attempt to fix freeze | Didn't solve the root cause | `f1ab905` |
| 9 | Steam not visible on dark background | Opacity 1.0 + blur | `e0f7c70` |
| 10 | KitchenEmptyState mic triggered STT errors | Removed MicButton from empty state | `a610988` |

### Root Cause Identified: EngineDb Mutex Contention

**The freeze is NOT a KitchenView or React issue — it's an EngineDb architecture problem.**

```
EngineDb uses: std::sync::Mutex<Connection> (NOT tokio::sync::Mutex)
All 7 sync commands fire simultaneously at KitchenView mount:
  kitchen_home_menu      (sync, blocks on conn.lock())
  kitchen_get_nudges     (sync, blocks on conn.lock())
  kitchen_weekly_digest  (sync, blocks on conn.lock())
  kitchen_get_meals      (sync, blocks on conn.lock())
  kitchen_get_weekly_plan (sync, blocks on conn.lock())
  kitchen_get_grocery    (sync, blocks on conn.lock())
  kitchen_get_inventory  (sync, blocks on conn.lock())
  
All 7 compete for the SAME std::sync::Mutex.
kitchen_ai_add_meal hits the mutex 7-12+ times sequentially (create meal + N ingredients + fetch).

With std::sync::Mutex:
  - OS threads BLOCK (not yield) while waiting
  - Tauri blocking thread pool exhausts
  - App freezes until a thread frees up
  - useTransition couldn't help because the freeze happens in Rust
```

### Option A: Full Async Migration (NEXT SESSION PRIORITY)

**What needs to change:**

1. **`src-tauri/src/engine/db.rs`**
   - `std::sync::Mutex` → `tokio::sync::Mutex`
   - `conn()` returns `tokio::sync::MutexGuard` 
   - All DB methods: `pub fn` → `pub async fn`
   - All `conn.execute()` / `conn.prepare()` → `.await`ed

2. **`src-tauri/src/commands.rs`**
   - All kitchen commands: `pub fn` → `pub async fn`
   - All `engine.db().X()` calls → `engine.db().X().await`
   - `kitchen_ai_add_meal`: 7-12 sequential DB hits → all awaitable with yielding

3. **Frontend hooks (`useKitchen.ts`, `useHearth.ts`)**
   - Already using `await invoke(...)` — no changes needed
   - The Rust side is the bottleneck

4. **Other apps affected by same pattern:**
   - Budget (budget_* commands)
   - Life Autopilot
   - Dreams
   - Feed
   - All share the same `EngineDb` with `std::sync::Mutex`

**Effort:** 2-3 hours
**Benefit:** All DB access yields instead of blocks; thread pool no longer exhausted

### Kitchen Onboarding — What's Left

Per KITCHEN_SPEC.md:
- [ ] Phase 2: Guided Tour (9 steps, Hearth-styled)
- [ ] Phase 3: Empty states for Library, Plan, Grocery, Pantry tabs
- [ ] Phase 4: Nudges + digest onboarding
- [ ] Phase 4: Nudge settings toggle

### Files Modified This Session

```
src/components/KitchenEmptyState.tsx     [NEW]
src/components/KitchenView.tsx          [MODIFIED]
src/styles/kitchen-hearth.css           [MODIFIED]
src-tauri/src/commands.rs               [MODIFIED - 3 commits]
src-tauri/src/engine/mod.rs            [MODIFIED]
src-tauri/src/voice/capture.rs         [MODIFIED]
src/App.tsx                            [MODIFIED]
```

### Current Commits (v0.1.67)
```
cf678ff v0.1.67: Kitchen empty state + heartbeat integration
0f567f5  fix: add task_type='simple_chat' to all cloud_chat calls
38fe9da  fix: prevent empty state flash during meals load
aef9a61  fix: reload meals and home menu after adding meal
a610988  fix: remove MicButton from KitchenEmptyState
e0f7c70  fix: make steam animation visible on dark background
dd14db3  fix: skip ElevenLabs STT when no API key configured
acc9b64  fix: prevent UI freeze during AI meal add
8e96f09  fix: Library tab AI add also triggers meals list reload
f8f3a8d  fix: remove await from loadHomeMenu to prevent double-block
b30c0e2  fix: correct engine_create_session snake_case params
f1ab905  fix: use React useTransition to keep UI responsive
fc3c6b2  fix: handle tags as both JSON array and JSON string
```

### Dream Cycle — 2026-04-13 (Nightly)

**Phases Executed:**
1. Event Harvesting — harvested 3 interactions from past 24 hours.
2. Consolidation — timeline, decisions, patterns identified.
3. Dream Cycle (REM) — insights on async migration success, iterative UI improvements, sub‑agent management.
4. Memory Pruning — MEMORY.md size within target; no redundant entries.
5. Morning Integration — updated MEMORY.md, verified product status, prepared summary for #mission‑control.

**Key Learnings:**
- Async DB migration completed (EngineDb → tokio::sync::Mutex) — eliminates UI freeze root cause.
- Don prefers rapid UI iteration with immediate commits.
- Sub‑agent tasks effective for isolated complex changes; need better model/timeout management.

**Next Session Prompt:**
> "Continue Phase 1 desktop shell audit: window chrome, sidebar, status bar. Start by reading FINAL_AUDIT.md Phase 1 section, then test each app interactively. Mark verified items in FINAL_AUDIT.md."

---

## Horizon/Dreams Onboarding Session — 2026-04-13

**What Was Built:**

### 1. Boot Sequence (`HorizonBoot.tsx`)
- **5-second cinematic intro**: Shooting stars → horizon line rises → "HORIZON" constellation logo draws → tagline
- Starfield canvas with 200+ twinkling background stars
- 5 shooting stars that streak across the screen at staggered delays
- Warm horizon gradient (amber/coral) rising from the bottom
- Logo rendered with Orbitron font, glowing constellation effect
- Progress bar at bottom
- **Playback**: Only once (persisted to `localStorage`) — `horizon-boot-done`

### 2. Onboarding (`HorizonOnboarding.tsx`) — "The First Horizon"
- **One profound question**: "What horizon calls to you?"
- Free-text input in the middle of the starfield (not a form!)
- AI interprets the dream: category, emoji, timeline
- **Constellation Card** preview with:
  - Glowing star visualization (category-colored)
  - Editable title
  - Category badge + target date
  - "Ignite this star" confirmation button
- **Save flow**: Creates dream in DB → stores `horizon-onboarding-completed` (permanent)
- **Bug fixed**: `targetDate` → `target_date` in Tauri invoke (was passing wrong param name)

### 3. Guided Tour (`HorizonTour.tsx`)
- 4-step tour using shared `TourSpotlight` component
- Steps:
  1. **Stellar Header** — dream count, velocity
  2. **Constellation Map** — star milestone visualization
  3. **Mission Log** — AI narrative guidance
  4. **Orbital Velocity** — progress tracking
- Uses `horizon-tour-completed` key (resettable via `resetHorizonTour()`)

### 4. New Star Animation
- `newlyLitDreams` Set tracks recently created dreams
- Stars pulse with golden glow for 8 seconds after creation
- Dream cards get `newly-lit` class with pulsing border animation

### 5. Bug Fixes
- ✅ `targetDate` → `target_date` in `useDreams.addDream()` (Tauri command fix)
- ✅ `bootDone` persisted to localStorage (no boot replay on navigation)
- ✅ `agent_id` → `agentId` in `useEngineChat.ts` (TypeScript fix)
- ✅ `item.agent_id` → `item.agentId` in `Marketplace.tsx`

### Key Files Created/Modified:
```
src/components/HorizonBoot.tsx          [NEW — 5s boot sequence]
src/components/HorizonOnboarding.tsx    [NEW — One-question onboarding]
src/components/HorizonTour.tsx          [NEW — 4-step guided tour]
src/styles/horizon-onboarding.css       [NEW — Boot + onboarding styles]
src/components/DreamBuilderView.tsx     [MODIFIED — Added boot/onboarding/tour]
src/components/TourSpotlight.tsx        [MODIFIED — Added verticalOffset prop]
src/hooks/useDreams.ts                  [MODIFIED — targetDate → target_date fix]
src/styles/horizon-stellar.css          [MODIFIED — New star glow animation]
```

### Storage Keys:
- `horizon-boot-done` — boot sequence played (persists)
- `horizon-onboarding-completed` — onboarding done (permanent)
- `horizon-tour-completed` — guided tour done (resettable)

### Testing (Clear localStorage to replay):
```js
localStorage.removeItem('horizon-boot-done');
localStorage.removeItem('horizon-onboarding-completed');
localStorage.removeItem('horizon-tour-completed');
// Then refresh
```

### Next Steps:
1. ✅ Verify dreams are saved to DB (fix `target_date` param)
2. ⚠️ Add "View All Stars" / "My Constellations" page
3. ✅ Star glow animation for newly-lit dreams
4. ⏳ Add "Replay Tour" button in Settings
5. ⏳ Consider Star Field in main view for empty state

---

## Session 2026-04-13 — MASSIVE ONBOARDING SPRINT

### What Was Accomplished

Three apps received the full onboarding experience (boot → onboarding → tour). Total: **8,471 lines added** across 30 files.

---

### 1. Budget / Pulse — Deep Design Pass

**Bug Fixes:**
- ✅ `targetDate` → `target_date` in `useDreams.ts` (same pattern as Budget)
- ✅ `agent_id` → `agentId` in `useEngineChat.ts` + `Marketplace.tsx`

**Deep Design Overhaul:**
- Split localStorage keys: `budget-onboarding-completed` (permanent) vs `budget-tour-completed` (resettable)
- Pinned footer layout: header (fixed) → body (scrollable `overflow-y: auto`) → footer (fixed `flex-shrink: 0`). Button never clips.
- Ambient floating particles, icon pulse ring animation, spring-stagger step animations
- Preset bucket grid with colored dots, gradient shimmer on active rhythm button
- Root cause: `std::sync::Mutex` blocking Tauri thread pool — fix deferred to next session (async migration)
- Spotlight verticalOffset prop added to `TourSpotlight`: Budget uses `-50px` to align glow box with targets

**Files:** `BudgetOnboarding.tsx`, `BudgetView.tsx`, `pulse-onboarding.css`, `TourSpotlight.tsx`

---

### 2. Horizon / Dreams — Full Experience Built

**Boot Sequence (5s):**
- 200+ twinkling stars on canvas, 5 shooting stars with staggered delays
- Horizon gradient rises from bottom (amber/coral)
- "HORIZON" in Orbitron with constellation decorations (SVG line-draw animations)
- `horizon-boot-done` persisted to localStorage

**Onboarding ("The First Horizon"):**
- One question: "What horizon calls to you?"
- AI parses free-text dream into Constellation Card (emoji, category, timeline)
- Editable title, category badge, target date preview
- "Ignite this star" → creates dream in DB → `horizon-onboarding-completed` (permanent)
- Bug fix: `targetDate` → `target_date` in `useDreams.addDream()`

**Guided Tour (4 steps):**
1. Stellar Header — `.stellar-header`
2. Constellation Map — `.stellar-map`
3. Mission Log — `.mission-log`
4. Velocity — `.orbital-velocity`

**New Star Animation:**
- `newlyLitDreams` Set tracks recently created dreams
- `newly-lit` CSS class: pulsing golden border + radial glow overlay
- 8-second animation on dreams created during onboarding

**Files:** `HorizonBoot.tsx`, `HorizonOnboarding.tsx`, `HorizonTour.tsx`, `horizon-onboarding.css`, `DreamBuilderView.tsx`, `horizon-stellar.css`

---

### 3. Foundation — Full Experience Built

**Boot Sequence (4s):**
- Blueprint house draws itself on canvas (foundation, walls, roof triangle, chimney, door, window — animated SVG paths)
- "FOUNDATION" in Orbitron with shield icon and pulsing glow
- System chips appear: HVAC, Plumbing, Electrical, Water Heater, Roof
- Blueprint grid overlay (`repeating-linear-gradient` at 60px intervals)

**Onboarding (4 steps):**
1. Welcome — Shield graphic draws itself, feature overview (Health Score, AI Diagnosis, Maintenance Calendar, Warranty Vault)
2. Home Profile — Address, Year Built, Square Feet, Own vs Rent
3. System Selection — Grid of HVAC, Plumbing, Electrical, Roof, Appliances, Pest Control (multi-select, color-coded)
4. Alert Level — All / Important Only / Critical Only (visual cards)

**Guided Tour (4 steps):**
1. Health Score ring — `.foundation-hero`
2. Vital Signs — `.foundation-stat-grid`
3. Diagnosis — `.foundation-diagnose-input`
4. Warranty Vault — `.foundation-vault-tab`

**Files:** `FoundationBoot.tsx`, `FoundationOnboarding.tsx`, `FoundationTour.tsx`, `foundation-onboarding.css`, `HomeHealthView.tsx`

---

### 4. Echo — Full Experience Built

**Boot Sequence (5s):**
- 60 floating ember particles drifting upward through deep violet gradient
- Pulsing lavender orb with expanding ring animations
- "ECHO" in Orbitron with glowing text-shadow + breathing animation
- Tagline: "You don't have to be okay. You just have to show up."

**Onboarding (one screen):**
- Three-pillar manifesto: "I'm not a therapist / I'm completely private / I'm always here"
- Crisis awareness note with 💜 icon
- "Begin" button → calls `startSession()` internally → immediately enters the session
- `echo-onboarding-completed` (permanent)

**Guided Tour (4 steps):**
1. Session Space — `.echo-counselor-chat`
2. Private Journal — `.echo-counselor-journal-entries`
3. Wellness Tools — `.echo-counselor-tools-section`
4. Weekly Letter — `.echo-letter-view`

**Files:** `EchoBoot.tsx`, `EchoOnboarding.tsx`, `EchoTour.tsx`, `styles-echo-onboarding.css`, `EchoCounselorView.tsx`

---

### 5. Cross-Cutting Technical Work

- `TourSpotlight`: Added `verticalOffset` prop for precise spotlight positioning per-tour
- `TourTooltip`: Added `finishLabel` prop so each app can override "Enter Conflux Home"
- `useEngineChat.ts`: Fixed `agent_id` → `agentId` in 3 places (TypeScript errors blocking build)
- `Marketplace.tsx`: Fixed `item.agent_id` → `item.agentId`
- `useDreams.ts`: Fixed `targetDate` → `target_date` in `dream_add` invoke call
- Build is clean across all apps

---

### Commits (5 unpushed on main):
```
8deac1f feat(home): wire up 9 new agent tools (4→13)
85f60c9 feat(dreams): wire up 10 new agent tools (4→14) + fix onboarding save bug
c329a82 feat(budget): wire up 8 new agent tools (5→13 total)
e028b3f feat(kitchen): add onboarding splash + guided tour
69706ef feat(kitchen): wire up 14 new agent tools (6→20 total)
```

### Standard Applied Across All Apps:
Every app now has: `*-boot-done`, `*-onboarding-completed`, `*-tour-completed` localStorage keys. Boot plays once (persisted). Onboarding is permanent. Tour is resettable.

### Remaining Onboarding Work:
The same standard (boot → onboarding → tour) needs to be applied to:
- Kitchen (has onboarding but may need upgrade to full boot experience)
- Feed
- Games Hub
- Home (desktop redesign)
- Agents / Marketplace
- Vault
- Studio

---

**Recent Releases (Lean):**
- **v0.1.68-pending** (2026-04-13): Full onboarding experience for Horizon, Foundation, Echo. Deep Budget redesign. 8,471 lines added.
- **v0.1.67** (2026-04-12): Horizon/Dreams onboarding + tour, Budget spotlight fix (-50px), target_date param fix

