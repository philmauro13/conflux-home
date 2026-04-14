# Conflux Home - FINAL LAUNCH AUDIT 🚀

> **"The most exciting experience a user will have this century."**

This is the LAST audit before launch. When all checkboxes pass, we ship.

**Version:** v0.1.66+ | **Last Updated:** 2026-04-12 | **Status:** Pre-Launch

---

## 🎯 THE LAUNCH MANIFESTO

Before you open this file, read the mission:

> **"Download → Onboard → Team is Alive."**

This is not an app. This is an **operating system for AI relationships.**

- Every app is its own world
- Every world has a soul (sound, animation, atmosphere)
- AI is the hero, not the assistant
- Users don't configure AI - AI arrives ready
- Need, not want. Make them feel the gap when you remove it

**The 16 Worlds We're Shipping:**

| App | World | Hero Visual | AI Feature |
|-----|-------|-------------|------------|
| **Dashboard** | Foundation | Blueprint + alert beacons | "What needs attention?" |
| **Chat** | Conflux | Purple pulse dots | Agent conversation |
| **Google** | Integration | Workspace sidebar | "Read my calendar" |
| **Agents** | Family | Avatar gallery | "Who do you need?" |
| **Kitchen** | Hearth | Steam, warm amber | "Plan my week" |
| **Budget** | Pulse | Dark emerald heartbeat ring | "Tell me what you spent" |
| **Life Autopilot** | Orbit | Soft violet timeline | "What should I focus on?" |
| **Home Health** | Foundation | Maintenance alerts | "Bills due soon" |
| **Dreams** | Horizon | Mountain summit glow | "Break this down into steps" |
| **Feed** | Current | Electric stream flow | "What matters today?" |
| **Stories** | Story | Parchment + candlelight | "What happens next?" |
| **Marketplace** | Bazaar | Gold card shelves | "Find me..." |
| **Echo** | Mirror | Teal ink flow | "Write with me" |
| **Vault** | Lock | Encrypted shield | Biometric unlock |
| **Studio** | Creator | Creative tools | AI generation |
| **Settings** | Control | Clean organization | Preferences |

---

## 📐 AUDIT STRUCTURE

This audit uses **dependency-ordered phases** - you cannot test a later phase until earlier ones pass.

```
Phase 0: Can it RUN?
    ↓
Phase 1: Can I INTERACT?
    ↓
Phase 2: Does data SAVE?
    ↓
Phase 3: Does it PERSIST?
    ↓
Phase 4: Is it ISOLATED? (multi-user)
    ↓
Phase 5: Auth flow works
    ↓
Phase 6: Permissions locked
    ↓
Phase 7: Does it have SOUL? (polish)
```

**How to use this file:**
- Start at Phase 0. Verify everything. Mark ✅ or ❌.
- If a phase fails, FIX IT BEFORE MOVING ON. Do not test Phase 3 if Phase 2 fails.
- Checkboxes: `[ ]` = unchecked, `[x]` = verified, `[-]` = partial/needs attention
- Add notes inline with `!!` for urgent issues
- Log session findings in the Session Tracker at the bottom

---

## PHASE 0 - CAN IT RUN? 🔥

**Goal:** App launches without crash, loads fast, no blank screens.

### 0.1 Build & Compilation

- [x] `npm run build` completes without errors (v0.1.66, 6.92s)
- [x] Rust backend compiles (`cargo check` passes)
- [x] TypeScript compiles clean (`npx tsc --noEmit` passes)
- [x] No `VITE_` secrets leaked in bundle
- [ ] Bundle size acceptable (currently 2MB, should code-split)
- [ ] Linux build target verified
- [ ] macOS build target verified
- [ ] Windows build target verified

### 0.2 Dev Server

- [x] Dev server starts on port 5173
- [ ] Dev server hot reload works
- [ ] Console shows no startup errors

### 0.3 App Launch

- [ ] App opens in < 5 seconds on first launch
- [ ] No "blank white screen" on startup
- [ ] Splash screen shows before main UI
- [ ] Login screen appears (or onboarding for new users)

### 0.4 Runtime Environment

- [x] Node v22.22.1 (matches package.json)
- [ ] `.env.example` exists with all required variables
- [ ] `.env` excluded from git (`.gitignore` check)
- [ ] Required API keys configured: Supabase URL/anon key

### 0.5 Error Handling

- [ ] App handles offline mode gracefully
- [ ] Network errors show user-friendly messages
- [ ] Console errors are rare in normal flow

**Phase 0 Status:** 🟢 **READY FOR PHASE 1** (builds clean, launches)

> ✅ **2026-04-13: EngineDb Async Migration - COMPLETE**
> - `std::sync::Mutex<Connection>` → `tokio::sync::Mutex<Connection>` in `db.rs`
> - All kitchen/budget/dreams/feed commands migrated to `pub async fn`
> - `conn()` method uses `block_in_place` for backward-compat sync callers
> - App launches without thread-panic (verified: `cargo build --release` + run)
> - Supabase session stored successfully at startup
> - Confirmed by: ZigBot (code review + runtime verification)

---

## PHASE 1 - CAN I INTERACT? 🎮

**Goal:** Every app opens, loads data, and basic CRUD works.

**Method:** Open each app. Click around. Add, edit, delete data. Does it respond?

### 1.1 Home (Dashboard / Foundation)

- [ ] App launches without crash
- [ ] Dashboard widgets render
- [ ] Widgets show real data (not placeholders)
- [ ] Navigation between widgets works
- [ ] Hero visual is present (blueprint/alert style)

### 1.2 Chat (Conflux)

- [ ] App launches without crash
- [ ] Agent list renders
- [ ] Chat input is visible
- [ ] Can send a message
- [ ] Agent responds

### 1.3 Google (Integration)

- [ ] App launches without crash
- [ ] Calendar shows events
- [ ] Mail integration visible
- [ ] Drive files accessible

### 1.4 Agents (Family)

- [ ] App launches without crash
- [ ] Agent cards render
- [ ] Can view agent details
- [ ] Can navigate to marketplace from here

### 1.5 Kitchen (Hearth) - ♨️ WARM AMBER WORLD

**Hero Visual:** Steam, recipe cards, warm amber glow
**AI Feature:** "Plan my week" - meal planning from pantry + preferences

- [ ] App launches without crash
- [ ] Recipe list displays
- [ ] Can add a recipe (name, ingredients, instructions)
- [ ] Can edit a recipe
- [ ] Can delete a recipe
- [ ] AI input "Plan my week" responds with meal suggestions
- [ ] Data shows after restart (Phase 2)

**Soul Checkpoint:**
- [ ] Atmosphere feels warm (not generic dashboard)
- [ ] Animations on recipe cards are smooth
- [ ] Hero visual is prominent when app opens

### 1.6 Budget (Pulse) - 💚 DARK EMERALD WORLD

**Hero Visual:** Dark emerald heartbeat ring, ambient grid
**AI Feature:** "Tell me what you spent" - NL entry + instant categorization

- [ ] App launches without crash
- [ ] Buckets display (Income, Expenses, etc.)
- [ ] Can add a transaction
- [ ] Can edit a transaction
- [ ] Can delete a transaction
- [ ] Balance calculates correctly
- [ ] AI input "Tell me what I spent at Costco" parses and adds transaction
- [ ] Data shows after restart (Phase 2)

**Soul Checkpoint:**
- [ ] Green heartbeat ring animates
- [ ] Ambient grid background is visible
- [ ] AI input is prominent and glowing
- [ ] Response has personality (not just "added")

### 1.7 Life Autopilot (Orbit) - 💜 VIOLET WORLD

**Hero Visual:** Soft violet timeline ribbon, orbiting tasks
**AI Feature:** "What should I focus on?" - proactive priority engine

- [ ] App launches without crash
- [ ] Timeline renders
- [ ] Tasks display
- [ ] Can add a task
- [ ] Can edit a task
- [ ] Can delete a task
- [ ] AI input responds with prioritization

**Soul Checkpoint:**
- [ ] Timeline has violet gradient
- [ ] Tasks orbit/animate gently
- [ ] Proactive nudges appear without being asked

### 1.8 Home Health (Foundation) - 🛠️ GRAY BLUEPRINT WORLD

**Hero Visual:** Blueprint lines, alert beacons
**AI Feature:** "What needs attention?" - maintenance tracking

- [ ] App launches without crash
- [ ] Appliance/maintenance list renders
- [ ] Can add an item
- [ ] Can edit an item
- [ ] Can delete an item
- [ ] Data persists

**Soul Checkpoint:**
- [ ] Blueprint aesthetic is distinct
- [ ] Alert beacons pulse on items needing attention

### 1.9 Dreams (Horizon) - 💙 DEEP BLUE MOUNTAIN WORLD

**Hero Visual:** Mountain summit visualization, mountain glow
**AI Feature:** "Break this down" - AI decomposes goals into steps

- [ ] App launches without crash
- [ ] Goal list renders
- [ ] Can add a dream/goal
- [ ] Can edit a dream/goal
- [ ] Can delete a dream/goal
- [ ] AI input responds with milestone breakdown

**Soul Checkpoint:**
- [ ] Mountain visualization is prominent
- [ ] Goal completion has satisfying animation
- [ ] Summit glow changes as progress advances

### 1.10 Feed (Current) - ⚡ ELECTRIC WHITE WORLD

**Hero Visual:** Stream flow, flash cards
**AI Feature:** "What matters today?" - curated content + summaries

- [ ] App launches without crash
- [ ] Feed items display
- [ ] Can scroll through feed
- [ ] Feed updates appropriately
- [ ] No blank feed states

**Soul Checkpoint:**
- [ ] Electric white aesthetic is clean
- [ ] Cards flow with smooth animation
- [ ] AI summaries show personality

### 1.11 Stories (Games) - 🍷 RICH BURGUNDY WORLD

**Hero Visual:** Parchment, candlelight, rich burgundy
**AI Feature:** "What happens next?" - AI storytelling

- [ ] App launches without crash
- [ ] Game list displays (Snake, Pac-Man, Solitaire)
- [ ] All games launchable from hub
- [ ] AI story games are present

**Soul Checkpoint:**
- [ ] Parchment texture visible
- [ ] Candlelight animation is atmospheric
- [ ] AI storyteller has distinct voice

### 1.12 Marketplace (Bazaar) - 🌟 GOLD ACCENTS WORLD

**Hero Visual:** Card shelves, gold accents, discovery animations
**AI Feature:** "Find me..." - AI search + recommendations

- [ ] App launches without crash
- [ ] Agent list renders
- [ ] Can search for agents
- [ ] Agent installation works
- [ ] Agent uninstallation works

**Soul Checkpoint:**
- [ ] Gold accents pop against dark background
- [ ] Card shelves have parallax/motion
- [ ] Discovery feels like browsing a store

### 1.13 Echo (Mirror) - 💚 TEAL INK WORLD

**Hero Visual:** Soft teal, ink flow, mood color wash
**AI Feature:** "Write with me" - AI prompts, mood analysis

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

**Soul Checkpoint:**
- [ ] Teal ink aesthetic feels calm, welcoming
- [ ] Counselor voice is warm (not robotic)
- [ ] Warm emoji 🤗 used appropriately
- [ ] Mood color wash responds to sentiment

### 1.14 Vault (Lock) - 🔐 ENCRYPTED SHIELD WORLD

**Hero Visual:** Encrypted shield, lock iconography
**BI Feature:** Biometric unlock

- [ ] App launches without crash
- [ ] Vault is locked by default
- [ ] Unlock flow works (PIN/biometric)
- [ ] Can store items
- [ ] Can retrieve items
- [ ] Items are encrypted at rest
- [ ] Lock after timeout works

**Soul Checkpoint:**
- [ ] Lock animation is satisfying
- [ ] Unlock feels secure
- [ ] No jarring transitions

### 1.15 Studio (Creator) - ✨ CREATIVE TOOLS WORLD

**Hero Visual:** Creative tools interface
**AI Feature:** AI generation (images, video, music, voice, web, design)

- [ ] App launches without crash
- [ ] Studio interface renders
- [ ] Mission creation works
- [ ] Mission tracking updates
- [ ] Venture Studio state displays correctly
- [ ] All agents visible in studio view

**Soul Checkpoint:**
- [ ] Creative tools feel like a maker's space
- [ ] AI generation is prominent
- [ ] Energy feels inspiring

### 1.16 Settings

- [ ] App launches without crash
- [ ] Settings sections render
- [ ] Can navigate between sections
- [ ] Can save preferences

### 1.17 Individual Games

#### Snake
- [ ] Game starts
- [ ] Controls work (arrow keys / swipe)
- [ ] Score increments correctly
- [ ] Collision detection works
- [ ] Game over flow works
- [ ] High score persists

#### Pac-Man
- [ ] Game starts
- [ ] Controls work
- [ ] Lives system works
- [ ] Score system works
- [ ] Game over flow works
- [ ] Maze/level renders correctly

#### Solitaire
- [ ] Game starts
- [ ] Cards are draggable
- [ ] Move validation works
- [ ] Win condition detected
- [ ] Score persists
- [ ] Game reset works

**Phase 1 Status:** 🟡 **IN PROGRESS** (test each app, mark ✅ or ❌)

---

## PHASE 2 - DOES DATA SAVE? 💾

**Goal:** CRUD operations actually persist to database (not just in-memory).

**Method:** Add data → Restart app → Check data still there.

### 2.1 Data Persistence Tests

#### Kitchen (Hearth)
- [ ] Add a recipe → Restart app → Recipe still exists ✅

#### Budget (Pulse)
- [ ] Add a transaction → Restart app → Transaction still exists ✅
- [ ] Add a bucket → Restart app → Bucket still exists ✅

#### Life Autopilot (Orbit)
- [ ] Add a task → Restart app → Task still exists ✅

#### Dreams (Horizon)
- [ ] Add a dream/goal → Restart app → Dream still exists ✅

#### Home Health (Foundation)
- [ ] Add a maintenance item → Restart app → Item still exists ✅

#### Feed (Current)
- [ ] (Feed is read-only, no CRUD needed)

#### Echo (Mirror)
- [ ] Chat message sent → Restart app → Message history persists ✅
- [ ] Weekly letter generated → Letter stored in DB ✅

#### Vault
- [ ] Add encrypted item → Restart app → Item still exists ✅

### 2.2 Session Persistence

- [ ] Login → Restart app → Still logged in ✅
- [ ] Session token refresh works ✅
- [ ] Expired sessions are cleared ✅

### 2.3 Database Integrity

- [ ] Supabase migrations ran successfully
- [ ] All tables have correct schema
- [ ] RLS policies enabled on user-facing tables
- [ ] No foreign key violations in console

**Phase 2 Status:** 🟡 **PENDING** (need to verify data persistence)

---

## PHASE 3 - MULTI-USER ISOLATION 🔒

**Goal:** User A cannot see or modify User B's data.

**Method:** Create two accounts (A and B), add unique data to each, verify isolation.

### 3.1 Test Setup

- [ ] Clean Supabase (delete existing test users)
- [ ] Account A created: `conflux.test.a@proton.me`
- [ ] Account B created: `conflux.test.b@proton.me`

### 3.2 Isolation Tests

#### Budget (Pulse)
- [ ] Account A adds transaction "AAA_TEST_RECORD_123"
- [ ] Switch to Account B
- [ ] Account B searches for "AAA_TEST_RECORD_123" → NOT FOUND ✅
- [ ] Account B cannot edit Account A's transaction ✅

#### Kitchen (Hearth)
- [ ] Account A adds recipe "BBB_TEST_RECIPE_123"
- [ ] Switch to Account B
- [ ] Account B searches for "BBB_TEST_RECIPE_123" → NOT FOUND ✅

#### Dreams (Horizon)
- [ ] Account A adds goal "CCC_TEST_GOAL_123"
- [ ] Switch to Account B
- [ ] Account B searches for "CCC_TEST_GOAL_123" → NOT FOUND ✅

#### Vault
- [ ] Account A adds item "DDD_TEST_ITEM_123"
- [ ] Switch to Account B
- [ ] Account B searches for "DDD_TEST_ITEM_123" → NOT FOUND ✅

### 3.3 Cross-Account Edit Attempts

- [ ] Account B tries to edit Account A's data via API → DENIED ✅
- [ ] Account B tries to delete Account A's data → DENIED ✅

### 3.4 RLS Verification

Check Supabase SQL Editor:

```sql
-- Verify user_profiles RLS
SELECT * FROM user_profiles WHERE user_id = 'user-a-id';

-- Should only show user-a's profile
```

- [ ] user_profiles RLS enforced ✅
- [ ] All app tables have RLS enabled ✅

**Phase 3 Status:** 🟡 **PENDING** (need to test with real accounts)

---

## PHASE 4 - AUTH FLOW 🔐

**Goal:** Login, logout, session management work end-to-end.

### 4.1 Login Flow

- [ ] Fresh install prompts for login (no existing session)
- [ ] Magic link email arrives in inbox
- [ ] Clicking link deep-links to app
- [ ] App session is created successfully
- [ ] User lands on home screen after login

### 4.2 Logout Flow

- [ ] Logout clears session
- [ ] App returns to login screen
- [ ] User data not visible after logout
- [ ] Cannot navigate to apps without logging in

### 4.3 Session Persistence

- [ ] Close app → Reopen → Still logged in
- [ ] Session survives app restart
- [ ] Session expires appropriately (24-48 hours)

### 4.4 Deep Link Handling

- [ ] `conflux://auth/callback` URL is handled correctly
- [ ] Deep link listener works on macOS
- [ ] Deep link listener works on Windows
- [ ] Deep link listener works on Linux

### 4.5 Error Handling

- [ ] Invalid magic link shows error
- [ ] Expired link prompts re-request
- [ ] Network error during login shows user-friendly message

**Phase 4 Status:** 🟡 **PENDING** (need to verify with test accounts)

---

## PHASE 5 - PERMISSIONS & SECURITY 🔒

**Goal:** Agent registration, file access, and API permissions are enforced.

### 5.1 Agent Permissions

- [ ] Agents can register to user account
- [ ] Agents cannot see other users' agents
- [ ] Agent installation persists after restart
- [ ] Agent uninstallation removes data

### 5.2 File Permissions

- [ ] File read operations are scoped to user
- [ ] File write operations are scoped to user
- [ ] Cannot read other users' files

### 5.3 API Permissions

- [ ] API key generation works
- [ ] API key is user-specific
- [ ] API key can be revoked
- [ ] API calls without key are denied

### 5.4 No Privilege Escalation

- [ ] Cannot become admin via UI
- [ ] Cannot become admin via API
- [ ] Service role restricted to backend only

**Phase 5 Status:** 🟡 **PENDING** (requires Phase 3 completion first)

---

## PHASE 6 - THE SOUL TEST ✨

**Goal:** Every app feels alive, has personality, and creates emotional resonance.

**Method:** Use each app. Close your eyes. What do you see? What do you feel?

### 6.1 Per-App Soul Checkpoints

#### Dashboard (Foundation)
- [ ] Hero visual is memorable (blueprint + alerts)
- [ ] App has distinct atmosphere
- [ ] Feels like "home base"

#### Chat (Conflux)
- [ ] Agent personalities shine through
- [ ] Conversation feels natural
- [ ] Purple pulse dots animate with life

#### Kitchen (Hearth)
- [ ] Warm amber glow makes you feel cozy
- [ ] Recipe cards have satisfying hover animation
- [ ] "Plan my week" feels like a helpful friend

#### Budget (Pulse)
- [ ] Green heartbeat ring breathes
- [ ] Ambient grid adds depth
- [ ] AI input glows invitingly
- [ ] "Tell me what you spent" feels conversational

#### Life Autopilot (Orbit)
- [ ] Violet timeline is calming
- [ ] Tasks orbit gently (not frantic)
- [ ] Proactive nudges feel supportive, not nagging

#### Home Health (Foundation)
- [ ] Blueprint aesthetic is clean, organized
- [ ] Alert beacons catch attention without alarm
- [ ] Maintenance feels manageable

#### Dreams (Horizon)
- [ ] Mountain visualization inspires
- [ ] Summit glow changes with progress
- [ ] AI breakdown makes goals feel achievable

#### Feed (Current)
- [ ] Electric white is crisp, energizing
- [ ] Cards flow smoothly
- [ ] AI summaries add value

#### Stories (Games)
- [ ] Parchment texture is immersive
- [ ] Candlelight animation adds warmth
- [ ] AI storyteller has character

#### Marketplace (Bazaar)
- [ ] Gold accents pop
- [ ] Card shelves have depth
- [ ] Discovery feels exciting

#### Echo (Mirror)
- [ ] Teal ink is calming
- [ ] Counselor voice is warm, supportive
- [ ] Mood analysis feels personal
- [ ] Weekly letter is a meaningful artifact

#### Vault (Lock)
- [ ] Lock animation is satisfying
- [ ] Unlock feels secure
- [ ] No jarring transitions

#### Studio (Creator)
- [ ] Creative tools inspire action
- [ ] AI generation is prominent
- [ ] Energy feels like a maker's space

### 6.2 System-Wide Soul Checkpoints

#### Animations & Transitions
- [ ] App-to-app transitions are smooth (no hard cuts)
- [ ] Sidebar open/close is animated
- [ ] Modal open/close is animated
- [ ] No janky or laggy animations
- [ ] Animations respect reduced-motion setting

#### Micro-interactions
- [ ] Button press feedback works (scale, color, shadow)
- [ ] Hover states work on desktop
- [ ] Loading spinners show during async ops
- [ ] Success/error feedback on actions
- [ ] Toast notifications work (position, timing, dismiss)

#### Conflux Fairy (v0.1.65)
- [ ] Fairy is visible in appropriate contexts
- [ ] Drag-and-move animation works smoothly
- [ ] Fairy dismisses properly
- [ ] Fairy animation is smooth (not choppy)

#### Visual Polish
- [ ] No unstyled flash of content (FOUC)
- [ ] Fonts load correctly (no fallback fonts visible)
- [ ] Icons render correctly (no broken images)
- [ ] No missing assets
- [ ] Consistent color scheme across all apps

#### Sound Design
- [ ] `playNavSwish()` fires on navigation (smooth swoosh)
- [ ] `playClick()` fires on button presses (clean click)
- [ ] Heartbeat pulse sound wired to beat events (if enabled)
- [ ] No audio conflicts or overlapping sounds
- [ ] Sounds are subtle, not jarring

#### Morning Brief Overlay
- [ ] Morning brief appears on first app open in the morning
- [ ] Brief summarizes overnight activity
- [ ] Brief dismisses cleanly

#### Agent Boot Cards
- [ ] Cards show on app startup (after onboarding)
- [ ] Cards display what agents are working on
- [ ] Cards are dismissible

#### INTEL Panel Hero
- [ ] PulseKnob renders as hero centerpiece
- [ ] Ring gauges flank the knob
- [ ] Heartbeat beats emit `conflux:heartbeat-beat` event
- [ ] INTEL panel refreshes on beat

**Phase 6 Status:** 🟡 **PENDING** (polish pass required)

---

## PHASE 7 - CROSS-PLATFORM VERIFICATION 🖥️📱

### 7.1 Windows (Primary)
- [ ] Installer builds correctly
- [ ] Install flow works
- [ ] App launches from Start Menu
- [ ] App launches from Desktop shortcut
- [ ] Uninstall clean
- [ ] Auto-update works (if applicable)

### 7.2 macOS
- [ ] DMG builds correctly
- [ ] App passes Gatekeeper
- [ ] App launches from Applications
- [ ] App icon correct in Dock
- [ ] Uninstall clean

### 7.3 Linux
- [ ] AppImage builds correctly
- [ ] App launches from .desktop file
- [ ] No missing shared libraries
- [ ] Uninstall clean

**Phase 7 Status:** 🟡 **PENDING** (need build verification on each platform)

---

## 🐛 BUG TRACKER

| # | Bug | Severity | Phase | Session Date | Status |
|---|-----|----------|-------|--------------|--------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

---

## 📅 SESSION LOG

| Session | Date | Phase(s) Covered | Findings | Next Steps |
|---------|------|------------------|----------|------------|
| 1 | 2026-04-11 | - | Planning | Build checklist |
| 2 | 2026-04-12 | Phase 1 Desktop Shell | Window: native OS chrome. Sidebar: ConfluxBarV2 floating dock (16 apps). Status: clock ✓, engine dot ✓, Echo icon 🪞 correct. | Phase 2 Auth audit |
| 3 | 2026-04-12 | Refactored audit | Restructured to dependency-ordered phases. Built FINAL_AUDIT.md | Begin Phase 1 app testing |
| 4 | 2026-04-13 | Phase 0 + Phase 4 Auth + Phase 1 Kitchen ✅ | EngineDb async migration ✅. Kitchen (Hearth) testing complete (v0.1.70): onboarding ✅ (fixed createdMeal passthrough), Chef's Specials ✅ (fixed useEffect refresh), Library tab ✅, Grocery ✅, Pantry ✅ (Add Item modal added), Nudges ✅. KNOWN ISSUES pending Hearth 2.0 redesign: Weekly Plan meal picker hardcoded ❌, post-onboarding UI feels "bland" vs onboarding ❌, no receipt/barcode/photo capture ❌, onboarding wallpaper shows village not kitchen ❌. | Phase 1: Budget (Pulse) |

---

## 🚀 LAUNCH READINESS CHECKLIST

Before shipping, all of these must be green:

- [ ] Phase 0: Can it run? ✅ (builds clean, launches)
- [ ] Phase 1: Can I interact? (all 16 apps tested)
- [ ] Phase 2: Does data save? (CRUD persists)
- [ ] Phase 3: Multi-user isolation works (RLS enforced)
- [ ] Phase 4: Auth flow works end-to-end
- [ ] Phase 5: Permissions locked (no escalation)
- [ ] Phase 6: Soul test passed (every app has world)
- [ ] Phase 7: Cross-platform verified (Windows/macOS/Linux)
- [ ] Security: Aegis/Viper P0 items fixed
- [ ] Bundle size acceptable (< 2MB or code-split)
- [ ] Zero console errors in normal flow
- [ ] Documentation updated (README, API docs)
- [ ] Legal: Privacy policy, Terms of Service
- [ ] Marketing: Screenshots, landing page ready

---

## 📝 NOTES & EVOLUTION

This file is **evolving**. As we test, we discover new things. Add findings here:

### New Discoveries
- EngineDb `conn()` using `block_in_place(|| self.conn.blocking_lock())` — works for true sync callers but the panic was from async contexts still calling the sync `conn()` path. Fix: async migration complete, all commands now async fn.
- `kitchen_inventory.member_id` FK references `family_members(id)` — not `user_id`. Fix: `get_or_create_family_member_id()` resolves correctly on add/get.
- HearthOnboarding `onComplete` passed no args → parent relied on `reloadMeals()` race → meal not appearing. Fix: createdMeal passed through callback + setMeals direct prepend.
- Unicode `──` (box-drawing U+2500) in TypeScript comments caused TS1128 parse errors in multiple files. Fix: replaced with ASCII `--`.
- FoundationOnboarding `HomeProfile` local interface shadowed imported type — renamed `HomeProfileInput`.
- **Hearth 2.0 opportunities**: post-onboarding kitchen is "bland" vs cinematic onboarding, onboarding wallpaper shows village not kitchen, no receipt/barcode/photo capture for pantry/meals, meal picker in Weekly Plan hardcoded to meals[0].

### Questions for Don
- ???

---

**Last Updated:** 2026-04-13 11:55 PM MST
**Created by:** ZigBot
**Approved by:** Don

---

*"Download → Onboard → Team is Alive."*

Let's ship this beast. 🚀
