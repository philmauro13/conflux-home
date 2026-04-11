# Conflux Home — Intelligence Roadmap

> **Date:** 2026-04-05
> **Status:** Draft — awaiting Don's review
> **Goal:** Transform Conflux Home from "beautiful desktop with AI chat" into "an AI that uses apps — proactively, cross-app, and unforgettably."

---

## The Core Thesis

**Today:** User opens app → sees beautiful desktop → clicks an app → chats with an agent.
**After this roadmap:** User opens app → agents have already been working overnight → brief slides in → "your team is alive and here's what they did while you slept."

The difference between a product people want and a product people *need* is **proactive value delivered before the user asks.**

---

## What Already Exists (Don't Rebuild)

| Feature | Status | Location |
|---------|--------|----------|
| Background cron scheduler | ✅ Running | `lib.rs` setup loop, ticks every 60s |
| 6 system cron jobs | ✅ Auto-installed | `mod.rs:ensure_system_cron_jobs()` |
| 51 app tools (31 app + 3 cross-app + 17 original) | ✅ Built | `tools.rs` |
| Cross-app tools (`weekly_summary`, `can_afford`) | ✅ Implemented | `tools.rs` |
| Budget pattern detection | ✅ Backend ready | `budget_detect_patterns` |
| Morning Brief UI component | ✅ Built | `MorningBrief.tsx` |
| Morning Brief overlay in App.tsx | ✅ Wired | `App.tsx` |
| Sound system (39 effects) | ✅ Complete | `sound.ts` |
| Guided Tour | ✅ Complete | `GuidedTour.tsx` |
| Auth + multi-user isolation | ✅ Complete | v0.1.50 |
| Cloud router (27 models) | ✅ Running | Supabase Edge Function |
| Stripe billing | ✅ E2E verified | `stripe.rs` + Edge Function |
| Auto-updater | ✅ CI pipeline | GitHub Actions |
| Family profiles + parent dashboard | ✅ Built | `FamilySetup`, `ParentDashboard` |
| Voice chat (toddler/preschool) | ✅ Wired | `VoiceChat.tsx` |
| Agent age-group filtering | ✅ Implemented | `App.tsx` filter logic |

---

## The Strategy: 4 Phases, Building Dependency

We build from **foundational infrastructure → proactive intelligence → relationship depth → brand moat.** Each phase unlocks the next. Skipping ahead creates orphan features nobody uses.

```
Phase 0: Cold-Start (make it feel alive for new users)
    ↓
Phase 1: Proactive Intelligence (agents act without being asked)
    ↓
Phase 2: Cross-App Relationships (agents talk to each other)
    ↓
Phase 3: Immersive Worlds (every app feels like its own space)
    ↓
Phase 4: Trust & Launch (security, signing, positioning)
```

---

## 🟢 Phase 0: Cold-Start Intelligence (Week 1)

**Problem:** New users open Conflux Home to empty apps. Empty Budget ring. Empty Kitchen pantry. Empty Dreams board. This is cold-start failure — and it kills retention.

**Principle:** Agents should *bootstrap themselves.* Don't ask users to fill apps. Pre-fill and refine.

### 0.1 — Agent Welcome Ceremony (Day 1-2)

**What:** On first launch after onboarding, before the desktop loads, each agent introduces itself with a *personalized starting point* — not generic "hi, I'm Pulse!" but actual state:

> "Hey, I'm Pulse. I noticed you picked Budget as a priority. I've set up a starter template with common categories. Tell me your monthly income and I'll allocate everything."

**Components:**
- `AgentIntroductions.tsx` — fullscreen ceremony, one agent at a time, swipe/click through
- Each agent has a *pre-built starter state* (not zero, not empty)
- Budget: template with default categories already populated
- Kitchen: pantries pre-loaded with common household staples
- Dreams: "What's one thing you want to achieve in the next 90 days?" → auto-decomposed
- Life: "What's keeping you up at night?" → auto-created as focus items

**Why first:** This is the "team is alive" moment. It converts the empty-app problem into "wow, they already know what to do."

**Files to create:**
- `src/components/AgentIntroductions.tsx`
- Agent-specific starter templates in `src/data/agent-templates.ts`
- Update `App.tsx` to show ceremony after WelcomeOverlay

### 0.2 — Boot-Time Agent Activity Cards (Day 3)

**What:** When the user opens the app (not just first launch, *every* launch), each agent shows a "what I'm working on" card for 3 seconds before the desktop loads:

> Hearth: "Meal plan ready for the week"
> Pulse: "Checked your transactions — 3 uncategorized items"
> Horizon: "Your vacation fund is +$47 this week"

**Implementation:** Each agent runs a quick query (cached from last cron or last session), assembles a one-liner, displays as a stack of cards. This is the *loading screen* — but the loading screen is *value.*

**Files to create:**
- `src/components/AgentBootCards.tsx`
- Rust: `agent_get_boot_status(agent_id)` — returns one-line agent summary

### 0.3 — The "What Do You Need?" Input (Day 4-5)

**What:** Replace the passive chat panel with a *global AI input* on the desktop. One glowing input at the bottom of the screen (ConfluxBarV2 area) that accepts natural language and routes to the right agent automatically:

> "Can I afford a $200 jacket?" → routes to Budget
> "What should I cook tonight?" → routes to Kitchen
> "Break down learning guitar into steps" → routes to Dreams
> "What's on my plate today?" → routes to Life

**Implementation:** The conflux agent classifies intent, routes to the right app, opens that app's immersive view with the AI response already populated.

**Files to modify:**
- `src/components/ConfluxBarV2.tsx` — add global input
- `src/hooks/useIntentRouter.ts` — new hook, classifies input intent
- `App.tsx` — handle routed navigation with pre-loaded response

---

## 🔵 Phase 1: Proactive Intelligence (Week 2-3)

**Problem:** Agents are reactive. They sit in the chat panel waiting to be clicked. The MASTER_INSPIRATION_PROMPT says "proactive, not reactive" — and we haven't fully achieved it.

**Principle:** The agent taps your shoulder. Not constantly (that's noise). *Intelligently* (that's value).

### 1.1 — ConfluxBarV2 as Intelligence Bar (Day 1-2)

**What:** Transform the dock from *navigation* to *agent status*. Instead of app icons, show *what agents are doing and what they found:*

Current: `[💰] [🍳] [🧠] [🎯] [📡] [🏠] [💬] [📁] [🎨] [⚙️]`

Target: `[💰 +$47 saved today] [🍳 3 items expiring] [🧠 3 tasks due] [🎯 80% to goal]`

**Implementation:**
- Keep icons (recognizable), but add status badges with *specific data*
- Badges are clickable → opens that immersive view with the insight already shown
- If nothing notable, shows a subtle dot (agent is healthy, no news)
- Animated pulse on items that need attention

**Files to modify:**
- `src/components/ConfluxBarV2.tsx` — add badge data layer
- `src/hooks/useAgentStatus.ts` — new hook, polls agent status

### 1.2 — Pattern Detection Expansion (Day 3-5)

**What:** `budget_detect_patterns` exists as a backend command but isn't surfaced in the UI. Extend it:

| Pattern | Trigger | Action |
|---------|---------|--------|
| Dining spend spike | >30% increase week-over-week | Nudge in ConfluxBar: "Dining up 30% this week" |
| Savings goal on track | >90% of monthly target met before day 20 | Celebration badge |
| Savings goal behind | <50% of target at day 20 | Gentle warning |
| Cooking frequency drop | <3 meals/week for 2 consecutive weeks | Suggest meal plan |
| Bill spike | New bill >2x previous month average | "Electric bill is unusually high" |
| Dream stalling | No tasks completed in 14 days | Motivational nudge with adjusted timeline |
| Habit streak milestone | 7/14/30 day streaks | Celebration animation |

**Implementation:** Patterns are computed on-demand (not background). Con fetches them when a relevant app is opened, or on a 5-minute poll cycle for ConfluxBar.

**Files to create:**
- `src/hooks/usePatterns.ts` — React hook for all pattern types
- `src/components/PatternBadge.tsx` — reusable badge component
- Extend `tools.rs` with additional cross-pattern tools

### 1.3 — The "Agent Nudge" System (Day 6-8)

**What:** Not notifications. Not alerts. *Nudges.* A small, dismissible card that slides in from the bottom-right when the user has been idle on the desktop for 2+ minutes:

> "Quick heads-up — you have 3 uncategorized transactions from yesterday. Want me to sort them?"

**Rules:**
- Max 1 nudge per 30 minutes
- User can dismiss with "don't remind me about this again"
- Nudges are *timed* — Budget nudge in the evening, Kitchen nudge near mealtime, Dreams nudge on Monday morning
- If user engages with the nudge → opens the relevant app with the AI already working

**Files to create:**
- `src/components/NudgeCard.tsx`
- `src/hooks/useNudgeEngine.ts`
- `src-tauri/src/engine/nudges.rs` — nudge generation logic

### 1.4 — Weekly Insights Report (Day 9-10)

**What:** The `weekly-insights` cron exists. Now we need a UI for it. Every Sunday at 10 AM, Conflux generates a structured report. When the user opens the app that day, they see a "Weekly Insights" card:

> 📊 **Your Week in Review**
>
> 💰 $312 spent — down 12% from last week. Dining dropped from $89 to $41.
> 🍳 Cooked 5 meals this week. Most popular: stir-fry (made 2x).
> 🧠 Completed 8 of 12 scheduled tasks (67%).
> 🎯 Vacation fund: 83% → +3% this week. On track for June 15th.
>
> 💡 **Recommendation:** You saved $48 by cooking more. If you maintain this pace, you'll hit your vacation goal 2 weeks early.

**Files to create:**
- `src/components/WeeklyInsights.tsx`
- `src/components/InsightsCard.tsx` — reusable insight display

---

## 🟣 Phase 2: Cross-App Relationships (Week 4-5)

**Problem:** Each app is its own world (good!). But the apps don't *talk to each other* (bad). The vision says "an AI that uses apps" — the current state is "9 separate AIs that each use one app."

**Principle:** Agent-to-agent collaboration creates value that no single app can deliver alone. This is the *moat.*

### 2.1 — Inter-Agent Communication Layer (Day 1-3)

**What:** A formal system for agents to send messages to each other. Not through the user. *Behind the scenes.*

Example flows:
- **Hearth → Pulse:** "User has chicken thighs expiring tomorrow. I'm suggesting a recipe, but if they buy additional ingredients, their weekly grocer budget might need adjustment."
- **Pulse → Horizon:** "User saved $200 this month — they're ahead on their vacation fund timeline. Update the milestone to +2 weeks early."
- **Orbit → Hearth:** "User has a high-focus work block Tuesday-Thursday. Suggest quick meals for those days."
- **Horizon → Orbit:** "User's dream goal deadline is in 2 weeks. Increase daily task recommendations to keep them on track."

**Implementation:**
- New Rust table: `agent_messages` — sender_id, receiver_id, message_type, payload, read_at, created_at
- Agents can read each other's messages during tool execution
- Cron jobs act as the "dispatcher" — when morning-brief runs, all agents have context from each other
- User can optionally *see* inter-agent messages in a "Team Chat" view (like watching your agents collaborate)

**Files to create:**
- `src-tauri/src/engine/agent_comms.rs` — message send/receive/storage
- SQL migration: `agent_messages` table
- `src/components/TeamChat.tsx` — optional "watch your agents collaborate" view

### 2.2 — Cross-App Goal Alignment (Day 4-6)

**What:** Goals in Dreams should influence everything. If the user's dream is "lose 20 pounds," then:
- Hearth defaults to healthy meal plans, tracks caloric intake, suggests recipes aligned with the goal
- Orbit prioritizes exercise habits and meal-prep tasks
- Pulse creates a "health/fitness" budget category

**Implementation:**
- `conflux_sync_goals_to_agents` tool — when a goal is created/updated, broadcasts to all agents
- Each agent has a `get_active_goals()` method that queries Dreams
- System prompt enhancement: agents should align their behavior with active goals

### 2.3 — Family Intelligence Network (Day 7-10)

**What:** The family system exists (profiles, parent dashboard, age groups). But family members' agents don't share intelligence. They should:

- Parent's Hearth + child's Hearth = shared pantry, shared grocery list, age-appropriate meal suggestions
- Child's Orbit learning progress → Parent's dashboard auto-populates
- Family budget vs individual budget — show the relationship

**Implementation:**
- Extend `agent_messages` to support `family_scope` messages
- New hook: `useFamilyIntelligence()` — aggregates cross-member insights
- Parent dashboard enhancement: "Your family's week at a glance"

---

## 🟠 Phase 3: Immersive Worlds Expansion (Week 6-7)

**Problem:** Budget/Pulse, Kitchen/Hearth, and Dreams/Horizon have strong visual identity. Feed, Echo, Vault, Studio, and Games feel like dashboard panels with CSS, not *worlds.*

**Principle:** Every app should be "close your eyes and see it" memorable. If an app doesn't have a distinct visual identity, it's dragging down the whole product.

### 3.1 — World-by-World Design Pass (Day 1-10)

Apply the MASTER_INSPIRATION_PROMPT design standard to remaining apps:

| App | Current State | Target Identity | Key Visual Metaphor |
|-----|--------------|-----------------|---------------------|
| **Feed (Current)** | Clean card list | Electric information stream | Newsroom ticker + signal waterfall |
| **Echo** | Communication panel | Personal communications nervous system | Neural pulse network |
| **Vault** | File browser | Digital fortress | Obsidian vault with animated lock mechanism |
| **Studio** | Creative tools | Creative laboratory | Gradient mesh workspace with live previews |
| **Settings** | Functional | Control center | Cockpit with system health indicators |
| **Games Hub** | Game list | Arcade room | Neon-lit cabinet hallway |
| **Marketplace** | Card grid | Grand bazaar | Gold-accented market stalls with discovery flow |

**Methodology per app:**
1. Read existing code
2. Define the metaphor (what real-world space does this feel like?)
3. Build the design system (color palette, animations, typography, spacing)
4. Add one AI hero feature per app (the "tell me..." moment)
5. Polish: empty states, loading states, error states, transitions

### 3.2 — The Story Game Renaissance (Day 11-14)

**What:** Story games are our most innovative feature (AI-generated interactive fiction, chapter-based, with puzzles and choices) — but they're hidden inside the Games app. They should be a *first-class experience.*

**Implementation:**
- Dedicated "Stories" entry point in ConfluxBarV2
- Story seeds generated per family member age group (already wired!)
- Stories can be *themed* around the user's life: Hearth generates cooking stories, Horizon generates adventure stories aligned with their goals
- "Continue where you left off" card on boot if an active story exists

---

## 🔴 Phase 4: Trust & Launch Positioning (Week 8)

**Problem:** mission-1224 (agent security) exists but hasn't been touched. Code signing isn't funded yet. The website sells features, not the *feeling.*

**Principle:** Security is a *branding play,* not just a feature. Parents won't install software their computer warns them about. Trust is the gating factor for consumer AI.

### 4.1 — Agent Security Foundation (Day 1-4)

**Priority:** This is the highest-leverage build item. If we ship agent security *before* the market goes mainstream, we define the category.

**MVP features (scope-controlled):**
1. **Permission Gate UI** — Settings panel showing what each agent can/cannot access (files, network, browser, APIs) with toggle switches
2. **Activity Log** — "Here's what your agents accessed today" — a feed showing file reads, API calls, tool usage. Timestamped, searchable.
3. **First-run consent** — When an agent wants to access something new for the first time, show a consent prompt

**Files to create:**
- `src/components/SecurityDashboard.tsx`
- `src-tauri/src/engine/permissions.rs` — permission model
- SQL migration: `agent_permissions` table

### 4.2 — Landing Page Repositioning (Day 5-7)

**What:** theconflux.com currently lists features. It should lead with the *feeling* of coming home to an AI family.

**Key changes:**
- Hero: Screenshot of the actual desktop with live agents, not a generic illustration
- Tagline: "Your AI team is waiting" (emotional, not functional)
- Section 1: "Download → Onboard → Team is alive" (the onboarding flow, 3 steps, 3 screenshots)
- Section 2: Real agent interactions (not features — *moments*)
- Section 3: Pricing (keep it simple)
- Social proof section: "Built for families, not enterprises"

### 4.3 — Beta Tester Onboarding (Day 8-10)

**What:** Parents as first beta testers. This isn't a product hunt launch — it's a *controlled family rollout.*

**Requirements:**
- Windows installer with code signing (waiting on funding — $250/yr EV cert)
- Magic link onboarding (already wired in `LoginScreen.tsx`)
- Welcome email explaining what to expect
- Feedback mechanism: "Report issue" button in Settings that opens a pre-filled email

### 4.4 — The "Need" Test Audit (Day 11-14)

**What:** A systematic review of every app against the "Need, Not Want" test:

> If I removed this app tomorrow, would the user notice? What gap would it create?

For each app, define the *killer behavior* that creates dependency:

| App | Killer Behavior (Need-Creating) |
|-----|---------------------------------|
| **Budget (Pulse)** | Auto-categorizes every transaction. "Tell me what you spent" → done. Manual budget apps feel broken by comparison. |
| **Kitchen (Hearth)** | Knows what's in your fridge. Plans meals from what you have. Reduces food waste. Going back to "what am I cooking tonight?" feels like losing time and money. |
| **Life (Orbit)** | Energy-aware scheduling. Knows when you're most productive. Reschedules automatically. Going back to a static to-do list feels blind. |
| **Dreams (Horizon)** | Breaks big goals into small steps. Tracks velocity. Nudges when you're stalling. Going back to a notebook feels like losing clarity. |
| **Feed (Current)** | AI-curated daily briefing. No scrolling, searching, doom-scrolling. Going back to RSS/Twitter feels like noise. |
| **Home (Foundation)** | Bills tracked, appliances monitored, seasonal tasks surfaced. Going back to remembering your own maintenance feels risky. |
| **Family System** | Household-level intelligence. Child agents that learn. Parent dashboard. Going back to individual apps feels fragmented. |

---

## Implementation Summary

| Phase | Duration | Effort | Risk | Dependency |
|-------|----------|--------|------|------------|
| **0: Cold-Start** | Week 1 | Medium | Low | None |
| **1: Proactive Intel** | Week 2-3 | High | Low | Phase 0 |
| **2: Cross-App Relations** | Week 4-5 | High | Medium | Phase 1 |
| **3: Immersive Worlds** | Week 6-7 | High | Low | Parallel with Phase 2 |
| **4: Trust & Launch** | Week 8 | Medium | Medium | Code signing funded |

**Total estimated timeline:** 8 weeks (assuming Don + agent team working evenings)

---

## The AI Intelligence Layer Architecture

```
┌─────────────────────────────────────────────────┐
│                   USER LAYER                    │
│                                                 │
│  Desktop → ConfluxBarV2 (Intelligence Bar)     │
│  Boot Cards → Morning Brief → Nudge System     │
│  Global AI Input → Intent Routing              │
└────────────────────────┬────────────────────────┘
                         │
┌────────────────────────▼────────────────────────┐
│              AGENT LAYER                        │
│                                                 │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │
│  │ Hearth │ │ Pulse  │ │ Orbit  │ │ Horizon  │ │
│  │ Kitchen│ │ Budget │ │ Life   │ │ Dreams   │ │
│  └───┬────┘ └───┬────┘ └───┬────┘ └────┬─────┘ │
│      │          │          │             │       │
│      └──────────┴──────────┴─────────────┘       │
│                         │                         │
│              Agent Communication Bus             │
│         (agent_messages table + hooks)           │
└────────────────────────┬────────────────────────┘
                         │
┌────────────────────────▼────────────────────────┐
│              INTELLIGENCE LAYER                 │
│                                                 │
│  Pattern Detection Engine (budget_detect)       │
│  Cross-App Tools (weekly_summary, can_afford)   │
│  Cron Engine (6 system jobs, $0 cost)          │
│  Intent Router (global AI input classification) │
│  Nudge Engine (timed, intelligent notifications)│
│  Goal Sync (Dreams → all agents)               │
└────────────────────────┬────────────────────────┘
                         │
┌────────────────────────▼────────────────────────┐
│              DATA LAYER                         │
│                                                 │
│  SQLite (local) + Supabase (cloud)             │
│  User-isolated, family-scoped, agent-tagged    │
│  Append-only for audit trail                   │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**
1. **Intelligence runs locally first, syncs to cloud** — privacy-first, fast response
2. **All cron/automation uses free model tier** — $0 marginal cost
3. **Cross-app communication through a formal message bus** — not hacks
4. **Pattern detection is deterministic first, AI enhancement second** — start with SQL queries, add LLM analysis on top
5. **Every proactive action has a "why"** — users can see *why* an agent nudged them

---

## What NOT to Build Yet

| Idea | Why Not Now |
|------|-------------|
| Full mission-1224 security suite | Scope-controlled MVP first |
| Conflux Cloud (business agents) | Nail consumer first |
| Agent Marketplace (third-party) | Built-in agents need to be great before opening the platform |
| Mobile app | Desktop experience needs to be undeniable before mobile |
| AI record label | Distraction from core product |
| Education platform (mixtechniques) | Valuable but secondary — use as marketing, not product |

---

## The Success Metric

We know this roadmap is working when a user says:

> "I opened my computer this morning and Conflux had already figured out what I needed to know today. I didn't have to ask anything. I just clicked through its suggestions. And when I was done, I realized I'd already solved 3 things before breakfast."

That's the "Need, Not Want" moment.

---

*This is the plan. It's ambitious but scoped. Every feature connects to making the user feel like their AI family is alive, working for them, and irreplaceable.*

*Review it when you're ready. We'll break it into individual missions and start with Phase 0.*
