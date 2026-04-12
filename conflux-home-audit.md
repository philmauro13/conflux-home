# Conflux Home — Launch Audit Checklist

> **Purpose:** Comprehensive audit of Conflux Home v0.1.66+ across all apps, intelligence layers, desktop shell, and infrastructure. Built for multi-session endurance without context bloat.
> **Status:** Raw audit — not yet reviewed
> **Last updated:** 2026-04-11

---

## How to Use This File

- Checkboxes `[ ]` = not started
- Checkboxes `[x]` = verified working
- Checkboxes `[-]` = partially working / needs attention
- Each section is self-contained. Review one section per session to keep context lean.
- Add notes under each item inline. Use `!!` prefixes for findings that need immediate attention.
- Found bugs go in BUG_TRACKER.md (create if missing)

---

## PHASE 0 — Infrastructure & System Health

> _Before auditing apps, verify the foundation everything else depends on._

### 0.1 Conflux Home Heartbeat System

> _The app-level autonomous heartbeat that drives the INTEL panel and AI team activity. This is Conflux Home's own system — separate from the OpenClaw studio heartbeat (`HEARTBEAT.md`) which monitors the venture studio._

**PulseKnob Component** (`src/components/PulseKnob.tsx`):
- [x] Knob renders in INTEL panel above ring gauges
- [x] 6 detents: Off / 30s / 1m / 5m / 30m / 60m
- [x] Circular drag interaction with snap-to-detent
- [x] Countdown arc depletes in real time (requestAnimationFrame)
- [x] Breathing center animation (3 concentric pulsing rings)
- [x] Active preset dot indicators around ring perimeter
- [x] Color: amber at fast intervals, indigo at normal, muted gray at Off
- [x] Snap flash effect on detent selection
- [x] Drag hint ("release to set") while dragging

**Rust Backend** (`commands.rs`):
- [x] `engine_get_heartbeat_interval` — reads from `config` table, default 30m
- [x] `engine_set_heartbeat_interval` — persists to `config` table

**Scheduler** (`lib.rs`):
- [x] Reads interval from engine config on startup
- [x] Falls back to 30m if not set
- [x] Emits `conflux:heartbeat-beat` Tauri event on each tick
- [x] Skips silently when set to Off (0)

**INTEL Panel Integration** (`DesktopQuadrants.tsx`):
- [x] PulseKnob hero-center flanked by 2 ring gauges (online + health %)
- [x] Listens for `conflux:heartbeat-beat` events from Rust
- [x] Resets countdown arc on each beat
- [x] Triggers panel data refresh on each beat

**Pending / Deferred:**
- [ ] `playHeartbeatPulse()` sound wired to beat events
- [ ] ConfluxOrbit fairy pulses on beat
- [ ] Morning brief overlay triggered by morning beat
- [ ] Boot agent cards triggered by beat
- [ ] Heartbeat interval shown in settings panel as a preference

---

### 0.1b OpenClaw Studio Heartbeat

> ⚠️ _Separate system._ The `HEARTBEAT.md` file in the workspace monitors the **venture studio** (missions, opportunities, run queue, studio crons) — not Conflux Home the app. Keep these systems conceptually separate. Don's Discord server is the studio's reporting channel; Conflux Home has its own in-app INTEL panel.

- [ ] `HEARTBEAT.md` exists and is configured for OpenClaw studio monitoring
- [ ] Posts to Discord `#mission-control` (channel ID: 1479285742915031080)
- [ ] Uses model `ollama/gemma3:1b`
- [ ] Runs on schedule via OpenClaw cron
- [ ] All 6 health checks implemented (TASKBOARD, RUN_LOG, product queue, etc.)
- [ ] Healthy output returns `HEARTBEAT_OK` only
- [ ] Alert output format correct

### 0.2 CI/CD & Build

- [x] `npm run build` completes without errors (v0.1.66, 6.92s)
- [x] Bundle clean — no `VITE_` secrets leaked
- [x] Dev server starts on port 5173
- [x] Bundle size warning noted (2MB, should code-split before launch)
- [ ] Linux build target verified
- [ ] macOS build target verified
- [ ] Windows build target verified
- [ ] Code signing pipeline documented (EV certs pending funding)

### 0.3 Logging & Error Reporting (Conflux Home App)

- [ ] App-level logs written to stdout / log file
- [ ] Errors include stack traces in log output
- [ ] Startup path has no silent failures
- [ ] `conflux:toast` events fire correctly for user-facing errors

### 0.4 Runtime Environment

- [x] Node v22.22.1 — matches package.json engine
- [ ] All env vars documented in a `.env.example`
- [ ] `.env` files excluded from git (check `.gitignore`)
- [ ] Required API keys accounted for (Supabase, ElevenLabs, etc.)

---

## PHASE 0.5 — Heartbeat + Autonomous Mode (Conflux Home)

> _Deepens the "autonomous driving" heartbeat into a full product experience. Deferred until after app audit per Don's direction._

### 0.5.1 Beat Actions — What Fires on Each Tick

| Action | Agent | Free Tier | Status |
|--------|-------|-----------|--------|
| Morning brief (if morning, no brief today) | Conflux | `conflux-core` | Deferred |
| Pantry check (expiring items → recipe suggestion) | Hearth | `conflux-core` | Deferred |
| Budget nudge (if spending > threshold) | Pulse | `conflux-core` | Deferred |
| Dream nudge (tasks due soon) | Horizon | `conflux-core` | Deferred |
| Feed refresh (cross-app pattern scan) | Current | `conflux-core` | Deferred |
| Agent diary (end of day entry) | Conflux | `conflux-core` | Deferred |

### 0.5.2 Autonomous UX Polish

- [ ] `playHeartbeatPulse()` fires on each beat (see `src/lib/sound.ts`)
- [ ] ConfluxOrbit fairy pulses with wave on beat
- [ ] Morning Brief overlay slides in before desktop (once per day)
- [ ] Agent Boot Cards show "what I'm working on" on app startup
- [ ] Nudge card slides in when user idle 2+ minutes
- [ ] INTEL "LIVE" dot synced to actual beat timing

### 0.5.3 Scale Planning

- [ ] Load test at 30m interval with 100 concurrent users
- [ ] Verify free-tier model rate limits not hit at 30m interval
- [ ] Confirm beat queue doesn't backlog if app backgrounded
- [ ] Test behavior when laptop sleeps and resumes (beat catchup)


---

## PHASE 1 — Desktop Shell & Navigation

> _The desktop wrapper everything runs inside._

### 1.1 INTEL Section Redesign (new)

- [ ] INTEL section exists in desktop UI
- [ ] INTEL section has clear purpose and use case
- [ ] INTEL section displays relevant data
- [ ] INTEL section refreshes appropriately
- [ ] INTEL section is not blank or unpopulated
- [ ] INTEL section copy is clear and contextual
- [ ] INTEL section navigates to related content correctly

### 1.2 Desktop Window Chrome

- [ ] Window controls work (minimize, maximize, close)
- [ ] Window drag works
- [ ] Window resize works
- [ ] Window title bar shows correct context
- [ ] Desktop app icon/name correct in taskbar/dock
- [ ] Window appears on primary monitor by default

### 1.3 Navigation & Sidebar

- [ ] Sidebar renders all 16 app icons
- [ ] Sidebar icons are clickable and navigate correctly
- [ ] Active app is visually highlighted in sidebar
- [ ] Sidebar collapses on smaller screens
- [ ] No dead icons in sidebar

### 1.4 Desktop Status Bar

- [ ] Status bar shows connection state
- [ ] Status bar shows current user
- [ ] Status bar shows model in use
- [ ] Status bar clock/time accurate
- [ ] Status bar notifications badge works

---

## PHASE 2 — Authentication & Multi-User

> _v0.1.49 auth wiring needs full verification._

### 2.1 Auth Flow

- [ ] Fresh install prompts for login/account creation
- [ ] Login flow completes without errors
- [ ] Logout flow completes without errors
- [ ] Session persists across app restart
- [ ] Session expires appropriately

### 2.2 Multi-User Isolation

- [ ] User A cannot read User B's data
- [ ] User A cannot modify User B's data
- [ ] Admin user can see all users
- [ ] User list in admin is accurate
- [ ] User deletion removes all user data

### 2.3 Permissions

- [ ] Agent registration permissions enforced
- [ ] File read permissions enforced
- [ ] File write permissions enforced
- [ ] No privilege escalation possible through UI
- [ ] No privilege escalation possible through API

---

## PHASE 3 — Onboarding

> _Narrative onboarding shipped in v0.1.64. Verify the full flow._

### 3.1 Narrative Onboarding Flow

- [ ] Step 1: Name entry → saves correctly
- [ ] Step 2: Meet Team → all agents render with names
- [ ] Step 3: Ice Breaker → interaction works
- [ ] Step 4: Build World → saves preferences
- [ ] Onboarding completes and lands on home screen
- [ ] Onboarding does not re-trigger for returning users
- [ ] Back navigation works during onboarding
- [ ] Skip option available (if intended)

### 3.2 Agent Registration

- [ ] Aegis registered as protector
- [ ] Viper registered as protector
- [ ] All other agents registered with correct roles
- [ ] Agent registration persists after onboarding

### 3.3 First-Run Experience

- [ ] First-run is visually polished
- [ ] No blank screens during first-run
- [ ] No console errors during first-run
- [ ] Tooltips/help available after onboarding

---

## PHASE 4 — App-by-App Audit (All 16)

> _Verify each app independently. Test happy path + edge cases._

### 4.1 Budget (Pulse)

- [ ] App launches without crash
- [ ] Can add a transaction
- [ ] Can edit a transaction
- [ ] Can delete a transaction
- [ ] Balance calculates correctly
- [ ] Data persists after restart
- [ ] Categories work
- [ ] Reports/charts render (if applicable)

### 4.2 Kitchen (Hearth)

- [ ] App launches without crash
- [ ] Can add a recipe/item
- [ ] Can edit recipe/item
- [ ] Can delete recipe/item
- [ ] Data persists after restart
- [ ] List displays correctly

### 4.3 Life Autopilot (Orbit)

- [ ] App launches without crash
- [ ] Task automation runs on trigger
- [ ] Can create new automation
- [ ] Can edit automation
- [ ] Can delete automation
- [ ] Automation history logged
- [ ] No infinite loops or stuck jobs

### 4.4 Dreams (Horizon)

- [ ] App launches without crash
- [ ] Can log a dream
- [ ] Can edit dream entry
- [ ] Can delete dream entry
- [ ] Dreams list renders
- [ ] Data persists after restart

### 4.5 Feed (Current)

- [ ] App launches without crash
- [ ] Feed displays content
- [ ] Can scroll through feed
- [ ] Feed updates appropriately
- [ ] No blank feed states
- [ ] Pull-to-refresh works (if applicable)

### 4.6 Games Hub

- [ ] App launches without crash
- [ ] Game list displays
- [ ] All games launchable from hub
- [ ] Game selection persists

### 4.7 Snake

- [ ] Game starts
- [ ] Controls work (arrow keys / swipe)
- [ ] Score increments correctly
- [ ] Collision detection works
- [ ] Game over flow works
- [ ] High score persists

### 4.8 Home (Foundation)

- [ ] App launches without crash
- [ ] Home dashboard renders correctly
- [ ] All widgets display data
- [ ] Widgets are interactive
- [ ] Data updates in real-time (if applicable)

### 4.9 Pac-Man

- [ ] Game starts
- [ ] Controls work
- [ ] Lives system works
- [ ] Score system works
- [ ] Game over flow works
- [ ] Maze/level renders correctly

### 4.10 Solitaire

- [ ] Game starts
- [ ] Cards are draggable
- [ ] Move validation works
- [ ] Win condition detected
- [ ] Score persists
- [ ] Game reset works

### 4.11 Agents + Market

- [ ] App launches without crash
- [ ] Agent list renders
- [ ] Agent cards show correct info
- [ ] Can navigate to agent detail
- [ ] Market section loads
- [ ] Agent installation works
- [ ] Agent uninstallation works

### 4.12 Echo (Counselor)

- [ ] App launches without crash
- [ ] Echo welcome screen renders
- [ ] Chat input works
- [ ] Chat history displays
- [ ] Weekly Letter tab works
- [ ] Weekly letter generates correctly
- [ ] Weekly letter displays formatted content
- [ ] Evening Ritual reminder toggle works (Settings → Tools)
- [ ] Evening Ritual notification fires correctly
- [ ] Voice Input mic button present
- [ ] Voice Input records on tap
- [ ] Voice Input transcribes correctly
- [ ] Text streams to input field after transcription

### 4.13 Vault

- [ ] App launches without crash
- [ ] Vault is locked by default
- [ ] Unlock flow works (PIN/biometric)
- [ ] Can store items
- [ ] Can retrieve items
- [ ] Items are encrypted at rest
- [ ] Lock after timeout works

### 4.14 Studio

- [ ] App launches without crash
- [ ] Studio interface renders
- [ ] Mission creation works
- [ ] Mission tracking updates
- [ ] Venture Studio state displays correctly
- [ ] All agents visible in studio view

### 4.15 Desktop Redesign v2

- [ ] App launches without crash
- [ ] Redesigned UI renders correctly
- [ ] All features from previous version present
- [ ] Navigation works
- [ ] No layout breaks

### 4.16 Voice Input

- [ ] App launches without crash
- [ ] Mic permission requested
- [ ] Recording indicator shows
- [ ] Recording stops on tap
- [ ] Transcription returns text
- [ ] Text can be sent as message
- [ ] Works on all platforms (Windows primary)

---

## PHASE 5 — Intelligence Layer (51 Tools)

> _v0.1.41 shipped with 51 tools. Verify tool access and functionality._

### 5.1 Tool Registry

- [ ] All 51 tools are registered in the system
- [ ] Tool list is accessible (admin/debug view)
- [ ] No duplicate tool names
- [ ] No orphaned/unreachable tools

### 5.2 Core Tools

- [ ] File read tool works
- [ ] File write tool works
- [ ] File edit tool works
- [ ] Shell exec tool works
- [ ] Web fetch tool works
- [ ] Web search tool works

### 5.3 Agent Tools

- [ ] Agent spawn tool works
- [ ] Agent list tool works
- [ ] Agent kill tool works
- [ ] Sessions list tool works
- [ ] Sessions send tool works

### 5.4 Utility Tools

- [ ] TTS/text-to-speech works
- [ ] Image generation works
- [ ] Browser control works
- [ ] Message send works
- [ ] Calendar access works (if applicable)
- [ ] Gmail access works (if applicable)

### 5.5 Tool Permissions

- [ ] Tools respect user permissions
- [ ] Dangerous tools (exec, shell) require elevation
- [ ] Tool audit log captures invocations
- [ ] Tool failures are gracefully handled

---

## PHASE 6 — Inter-Agent Communication

> _v0.1.50 shipped the communication layer._

### 6.1 Message Routing

- [ ] Agent can send message to another agent
- [ ] Message delivery works
- [ ] No lost messages
- [ ] Message ordering preserved

### 6.2 Mission Passing

- [ ] Mission can be passed between agents
- [ ] Mission state transfers correctly
- [ ] No mission data loss during handoff

### 6.3 Shared State

- [ ] Shared files accessible across agents
- [ ] No race conditions on shared state writes
- [ ] State contract enforced

---

## PHASE 7 — Cron Jobs & Background Tasks

> _Verify all scheduled tasks fire and complete correctly._

### 7.1 Echo Evening Ritual

- [ ] Cron fires at configured time
- [ ] Notification sent if no session today
- [ ] Notification respects disable setting
- [ ] No double-fire or missed fires

### 7.2 Heartbeat

- [ ] Heartbeat cron fires on schedule
- [ ] Heartbeat output posted to Discord
- [ ] Heartbeat failures alert correctly

### 7.3 Weekly Letter Generation

- [ ] Weekly cron generates letter
- [ ] Letter saved to `echo_weekly_letters` table
- [ ] Letter timestamp correct
- [ ] No duplicate letters generated

### 7.4 Background Sync

- [ ] Data sync jobs run on schedule
- [ ] Sync failures are logged
- [ ] Retry logic works
- [ ] No data corruption on sync

### 7.5 Generic Cron Health

- [ ] All crons have defined schedules
- [ ] All crons have error handlers
- [ ] Crons do not overlap
- [ ] Crons survive app restart

---

## PHASE 8 — Animations & Polish

> _Polish differentiates good from great._

### 8.1 Transition Animations

- [ ] App-to-app transitions smooth (no hard cuts)
- [ ] Sidebar open/close animated
- [ ] Modal open/close animated
- [ ] No janky or laggy animations
- [ ] Animations respect reduced-motion setting

### 8.2 Micro-interactions

- [ ] Button press feedback works
- [ ] Hover states work (desktop)
- [ ] Loading spinners show during async ops
- [ ] Success/error feedback on actions
- [ ] Toast notifications work

### 8.3 Conflux Fairy

- [ ] Drag-and-move animation works (v0.1.65)
- [ ] Fairy is visible in context
- [ ] Fairy dismisses properly
- [ ] Fairy animation is smooth

### 8.4 Visual Polish

- [ ] No unstyled flash of content (FOUC)
- [ ] Fonts load correctly
- [ ] Icons render correctly
- [ ] No broken images or missing assets
- [ ] Consistent color scheme across apps

---

## PHASE 9 — Security (Aegis/Viper)

> _Registered in v0.1.52 but NOT YET IMPLEMENTED. These are P0 launch blockers._

### 9.1 Aegis (Blue Team — Hardening)

- [ ] Rotate exposed keys/secrets
- [ ] Enable CSP (Content Security Policy)
- [ ] Remove VITE_ secrets from env
- [ ] Kill math shell fallback
- [ ] Input sanitization on all user inputs
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] Rate limiting on auth endpoints
- [ ] Session fixation prevention
- [ ] Secure cookie flags set

### 9.2 Viper (Red Team — Pen Testing)

- [ ] Permission gate audit
- [ ] Sandbox isolation verified
- [ ] Activity monitoring active
- [ ] Anomaly detection running
- [ ] No privilege escalation vectors
- [ ] No data leakage between users
- [ ] No admin escalation to system level

### 9.3 Security UI

- [ ] Security settings panel exists
- [ ] User can view active permissions
- [ ] User can revoke agent permissions
- [ ] Security events logged and visible

---

## PHASE 10 — Echo/Counselor Deep Dive

> _Already partially tested in 4.12, but go deeper._

### 10.1 Weekly Letter

- [ ] Letter generates for current week
- [ ] Letter summarizes all sessions
- [ ] Letter date range correct
- [ ] Letter stored in database
- [ ] Letter accessible from UI
- [ ] Letter formatted and readable
- [ ] No empty letters if sessions exist
- [ ] Generation does not duplicate letters

### 10.2 Conversation Memory

- [ ] Echo remembers session context
- [ ] Context window behaves correctly
- [ ] Old context does not leak
- [ ] Context reset works

### 10.3 Counselor Tone

- [ ] Echo responds in counselor voice
- [ ] Warm emoji 🤗 used appropriately
- [ ] Not robotic or generic
- [ ] Reflects user's name in conversation

---

## PHASE 11 — Performance & Memory

### 11.1 Startup Performance

- [ ] Cold start < 5 seconds
- [ ] No blank screens during startup
- [ ] Startup errors surface clearly

### 11.2 Runtime Performance

- [ ] No memory leaks on extended use
- [ ] CPU usage reasonable (not spiking)
- [ ] Disk I/O not excessive
- [ ] Network requests batched/compressed

### 11.3 Bundle Size

- [ ] Initial bundle < appropriate threshold
- [ ] Lazy loading works for all apps
- [ ] No duplicate dependencies

---

## PHASE 12 — Cross-Platform

### 12.1 Windows (Primary)

- [ ] Installer builds correctly
- [ ] Install flow works
- [ ] App launches from Start Menu
- [ ] App launches from Desktop shortcut
- [ ] Uninstall clean
- [ ] Auto-update works (if applicable)

### 12.2 macOS

- [ ] DMG builds correctly
- [ ] App passes Gatekeeper
- [ ] App launches from Applications
- [ ] App icon correct in Dock
- [ ] Uninstall clean

### 12.3 Linux

- [ ] AppImage builds correctly
- [ ] App launches from .desktop file
- [ ] No missing shared libraries
- [ ] Uninstall clean

---

## PHASE 13 — Data & Persistence

### 13.1 Local Storage

- [ ] User data persists across restarts
- [ ] No data loss on abnormal shutdown
- [ ] Storage quota respected
- [ ] Old data cleanup works

### 13.2 Database

- [ ] All tables schema-correct
- [ ] Migrations run cleanly
- [ ] No stale/missing migrations
- [ ] Indexes in place for performance

### 13.3 Import/Export

- [ ] User can export their data
- [ ] Export format is portable
- [ ] User can import their data
- [ ] Import validates correctly

---

## PHASE 14 — Accessibility & Localization

### 14.1 Accessibility

- [ ] Keyboard navigation works
- [ ] Screen reader labels present
- [ ] Color contrast sufficient
- [ ] Focus indicators visible
- [ ] No keyboard traps

### 14.2 Localization (Future)

- [ ] String externalization in place
- [ ] RTL layout support ready (if planned)
- [ ] Timezone handling correct

---

## PHASE 15 — Edge Cases & Error States

### 15.1 Empty States

- [ ] All lists show helpful empty state when empty
- [ ] Empty states have actionable next step
- [ ] No blank white sections

### 15.2 Error States

- [ ] Network error shown when offline
- [ ] API error shows user-friendly message
- [ ] 404 handling in-app
- [ ] 500 handling in-app
- [ ] No console errors in normal use

### 15.3 Race Conditions

- [ ] Double-submit prevention on forms
- [ ] Concurrent edits handled
- [ ] Optimistic UI reverts correctly on failure

---

## BUG TRACKER

> _Found bugs get logged here with severity and session found._

| # | Bug | Severity | Phase | Session Date | Status |
|---|-----|----------|-------|--------------|--------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | | |

---

## SESSION LOG

> _Append at end of each session._

| Session | Date | Phase(s) Covered | Findings | Next Steps |
|---------|------|-------------------|----------|------------|
| 1 | 2026-04-11 | — | Planning | Build checklist |
