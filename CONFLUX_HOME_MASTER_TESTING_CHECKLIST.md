# 🚀 CONFLUX HOME — MASTER TESTING CHECKLIST

> **Version:** v0.1.50 | **Date:** 2026-04-05
> **Status:** Ready for pre-launch QA
> **Platform Priority:** Windows first (Don's primary test platform)

---

## 📱 App-Level Testing (16 Apps)

### 1. Budget (Pulse) — Emerald Design
- [ ] **Auth Isolation**: Create two users, verify data doesn't cross-contaminate
- [ ] **NL Entry**: Natural language input works ("spend $50 on groceries")
- [ ] **Pattern Detection**: App auto-categorizes transactions
- [ ] **Goals**: Create, edit, delete budget goals
- [ ] **AI Insights**: AI provides spending analysis
- [ ] **Monthly Report**: Generate and view monthly report
- [ ] **Goals Tracking**: Visual progress on goals
- [ ] **Tauri Commands**: All 9 budget commands accept member_id

### 2. Kitchen (Hearth) — Amber Design
- [ ] **Home Menu**: Restaurant Menu displays "Chef's Specials" and "Your Regulars"
- [ ] **Browse Cards**: Library tab shows filter chips and card grid
- [ ] **Cooking Mode**: Full-screen mode works with timer and progress dots
- [ ] **AI Prompts**: Meal planner, photo ID, cooking tips, smart grocery
- [ ] **OCR/Photo Upload**: Placeholders ready for backend wiring
- [ ] **Tauri Commands**: All 22 kitchen commands accept userId

### 3. Life Autopilot (Orbit) — Violet Glassmorphism
- [ ] **Focus Engine**: Focus sessions start/stop correctly
- [ ] **Habits**: Create and track habits
- [ ] **Smart Reschedule**: Automatic scheduling based on priorities
- [ ] **Morning Brief**: Daily briefing displays on startup
- [ ] **Cognitive Patterns**: Analyze patterns across apps

### 4. Dreams (Horizon) — Deep Blue Mountains
- [ ] **Goal Decomposition**: Break goals into sub-tasks
- [ ] **Velocity Tracking**: Track progress toward goals
- [ ] **AI Plan**: AI generates step-by-step plans
- [ ] **AI Narrate**: AI narrates dream journal entries

### 5. Feed (Current) — Electric White
- [ ] **Daily Briefing**: Personalized briefing displays
- [ ] **Ripple Radar**: Detect ripples/changes across data
- [ ] **Signal Threads**: Create and track signal threads
- [ ] **Cognitive Patterns**: Pattern analysis

### 6. Games Hub + Minesweeper
- [ ] **Minesweeper**: Three difficulty levels work
- [ ] **Sound Effects**: Flag, reveal, explode, cascade, win sounds
- [ ] **High Score Tracking**: Scores save correctly
- [ ] **Win Detection**: Game detects wins properly

### 7. Snake
- [ ] **Four Modes**: Classic, Speed, Tunnel, Wrap work
- [ ] **60fps Canvas**: Smooth rendering
- [ ] **Sound Effects**: Eat, turn, death, newBest, speedUp
- [ ] **High Score**: Scores persist across sessions

### 8. Home (Foundation) — Blueprint Gray
- [ ] **5 Tabs**: All tabs accessible
- [ ] **48 Seasonal Seed Tasks**: Tasks display correctly
- [ ] **Navigation**: Switching between tabs works

### 9. Pac-Man
- [ ] **4 Ghosts**: Blinky, Pinky, Inky, Clyde AI works
- [ ] **Classic AI**: Ghost behavior matches original
- [ ] **Sound Effects**: Chomp, power, eatGhost, death, levelClear
- [ ] **Level Progression**: Levels increase difficulty

### 10. Solitaire — Golden Deck
- [ ] **Full Klondike**: All rules implemented
- [ ] **Drag-and-Drop**: Card movement works
- [ ] **Sound Effects**: Flip, place, foundation, win, shuffle, invalid

### 11. Agents + Market (Family/Bazaar) — Purple + Gold
- [ ] **Agent Discovery**: Browse agents in marketplace
- [ ] **Agent Installation**: Install agents to team
- [ ] **Agent Management**: Configure agent settings
- [ ] **Discovery AI**: AI suggests agents

### 12. Echo — Electric Blue
- [ ] **Communication Hub**: Central messaging interface
- [ ] **Message Sending**: Send messages to agents
- [ ] **Message Receiving**: Receive agent responses

### 13. Vault — Obsidian Glassmorphism
- [ ] **File Browser**: Navigate files and folders
- [ ] **18 Commands**: All file operations work
- [ ] **Search**: Search files by name/content

### 14. Studio — Gradient Mesh
- [ ] **Replicate Image Gen**: Image generation works
- [ ] **ElevenLabs TTS**: Text-to-speech works
- [ ] **Prompt Bar**: Enter prompts and generate

### 15. Desktop Redesign v2
- [ ] **ConfluxBarV2**: 3-point dock works
- [ ] **Intel Cockpit**: Information dashboard displays
- [ ] **Category Portals**: Quick access to app categories

### 16. Voice Input
- [ ] **Whisper STT**: Local speech-to-text works
- [ ] **Push-to-Talk**: Voice input activates correctly
- [ ] **8 Commands**: Voice commands execute

---

## 🔐 Authentication & Multi-User Testing

### Multi-User Data Isolation
- [ ] **Create User A**: Sign up with magic link
- [ ] **Create User B**: Sign up with different email
- [ ] **Verify Isolation**: User A data not visible to User B
- [ ] **Switch Users**: Logout and login as different user
- [ ] **Data Persistence**: User data persists across sessions
- [ ] **Budget Isolation**: Separate budgets per user
- [ ] **Kitchen Isolation**: Separate meal plans per user
- [ ] **Dreams Isolation**: Separate goals per user

### Auth Flow
- [ ] **Magic Link Signup**: Works end-to-end
- [ ] **Deep Link**: `conflux://` deep link works
- [ ] **Session Persistence**: Stay logged in after restart
- [ ] **Logout**: Properly clears session data

---

## 🎨 Sound Design Testing (39 Effects)

### UI Sounds (8)
- [ ] **click**: Button clicks
- [ ] **toggleOn/off**: Toggle switches
- [ ] **navSwish**: Navigation sounds
- [ ] **notification**: Alert notifications
- [ ] **modalOpen/Close**: Modal dialogs
- [ ] **error/success**: Error and success confirmations

### Agent Sounds (6)
- [ ] **agentWake**: 10 unique melodies play
- [ ] **messageSent**: Send message sound
- [ ] **messageReceived**: Receive message sound
- [ ] **taskComplete**: Task completion sound
- [ ] **thinkingAmbient**: Ambient thinking loop

### Onboarding Sounds (4)
- [ ] **welcomeChime**: First launch welcome
- [ ] **heartbeat**: Heartbeat animation sound
- [ ] **teamAlive**: Agent team activation
- [ ] **tourBlip**: Guided tour progress

### Game Sounds
- [ ] **Minesweeper**: 5 effects tested
- [ ] **Snake**: 5 effects tested
- [ ] **Pac-Man**: 5 effects tested
- [ ] **Solitaire**: 6 effects tested

### Settings
- [ ] **Master Volume**: Slides correctly
- [ ] **Category Sliders**: UI/Agents/Games/Onboarding
- [ ] **Mute Toggle**: Works and persists
- [ ] **localStorage Persistence**: Settings survive restart

---

## 🎯 Guided Tour Testing

- [ ] **7-Step Walkthrough**: Welcome → Dock → Apps → Intel → Chat → Home → Complete
- [ ] **SVG Spotlight**: Cutout animation works
- [ ] **Glassmorphism Tooltip**: Displays correctly
- [ ] **Auto-Start**: Runs on first launch
- [ ] **Replay in Settings**: Can replay tour
- [ ] **Viewport Clamping**: No tooltip overflow

---

## ⚙️ Infrastructure Testing

### Supabase Auth
- [ ] **Magic Link**: Sends and works
- [ ] **Deep Link**: `conflux://` route works
- [ ] **Resend SMTP**: Emails deliver

### Stripe Billing
- [ ] **E2E Checkout**: Complete purchase flow
- [ ] **Subscription Price IDs**: All 4 tiers work
- [ ] **Credit Pack IDs**: All 4 packs work

### Conflux Router
- [ ] **27 Models**: All models accessible
- [ ] **Credit Billing**: Charges work correctly
- [ ] **Usage Tracking**: Usage logged properly

### Admin Panel (Local)
- [ ] **8 Pages**: All pages accessible via Twingate
- [ ] **Cost Tracking**: Shows costs correctly
- [ ] **Routing**: Model routing works
- [ ] **Analytics**: Displays metrics

### Website (theconflux.com)
- [ ] **Docs**: Documentation loads
- [ ] **Dashboard**: User dashboard accessible
- [ ] **Signup**: Signup flow works
- [ ] **Unified Nav**: Navigation consistent

### CI Pipeline
- [ ] **All 4 Platforms**: Linux, Windows, macOS, Android build
- [ ] **Whisper Download**: Model downloads automatically
- [ ] **Ubuntu 22.04 Pin**: Correct version used

### Auto-Updater
- [ ] **NSIS .exe**: Windows installer works
- [ ] **Passive Install**: No user interaction required
- [ ] **No UAC**: Doesn't trigger admin prompt

### Agent Themes
- [ ] **10 Themes**: All color themes available
- [ ] **Wallpapers**: Theme wallpapers load

---

## 🔒 Security & Performance Testing

### Security Features
- [ ] **Permission Gates**: Granular access controls
- [ ] **Agent Sandboxing**: Isolated execution
- [ ] **Activity Monitoring**: Real-time dashboard
- [ ] **Anomaly Alerts**: Unusual pattern detection

### Performance
- [ ] **Startup Time**: < 5 seconds to usable state
- [ ] **Memory Usage**: < 500MB at idle
- [ ] **CPU Usage**: < 10% at idle
- [ ] **60fps Rendering**: Games and animations smooth

---

## 📦 Release Checklist

### Before Launch
- [ ] **Auth Isolation Verified**: Multi-user data separation working
- [ ] **All 16 Apps Tested**: Each app functional
- [ ] **Sound Design Complete**: All 39 effects working
- [ ] **Guided Tour Works**: 7-step walkthrough tested
- [ ] **Installation Works**: Windows installer installs correctly
- [ ] **Auto-Update Works**: New version detection and install
- [ ] **Website Live**: theconflux.com accessible
- [ ] **Payment Flow Works**: Stripe checkout successful
- [ ] **Beta Testers**: Parents have installed and tested

### Post-Launch Monitoring
- [ ] **Error Tracking**: Errors logged to telemetry
- [ ] **Usage Metrics**: Tracks user sessions
- [ ] **Performance Monitoring**: Tracks load times
- [ ] **Feedback Loop**: Easy way for users to report issues

---

## 🧪 Manual Test Scenarios

### Scenario 1: New User Onboarding
1. Download installer from website
2. Install Conflux Home
3. Launch app, see guided tour
4. Sign up with magic link
5. Complete onboarding wizard
6. Install first agent from marketplace
7. Have first conversation with agent

### Scenario 2: Multi-User Switching
1. User A signs up and adds budget entries
2. User A adds dream goals
3. User B signs up with different email
4. Verify User B sees no data from User A
5. User A logs back in, sees their data

### Scenario 3: Game Session
1. Launch Minesweeper
2. Play and win game
3. Verify sound effects play
4. Check high score saved
5. Switch to Snake, play game
6. Verify Snake sounds work

### Scenario 4: AI Agent Interaction
1. Open Agents app
2. Browse marketplace
3. Install an agent
4. Have a conversation
5. Verify message sounds
6. Check agent memory persists

---

## 📊 Success Criteria

For launch, we need:
- ✅ Auth isolation verified with 2+ test users
- ✅ All 16 apps functional with no critical bugs
- ✅ Windows installer works for beta testers
- ✅ Payment flow completes successfully
- ✅ Guided tour works for new users
- ✅ Sound effects play in all apps
- ✅ Auto-updater delivers new versions

---

## ✅ Results Tracking

| Date | Tester | Platform | Apps Tested | Pass | Fail | Notes |
|------|--------|----------|-------------|------|------|-------|
| 2026-04-05 | Don | Windows | - | - | - | Checklist created |
