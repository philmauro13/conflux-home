# Session — 2026-04-13: Onboarding Sprint

## What We Did

**Full onboarding redesign for 4 apps — each with a completely unique visual identity:**

### Kitchen → Hearth 🔥
- `KitchenBoot.tsx`: heat shimmer canvas + floating embers + SVG flame, Orbitron logo breathes
- `HearthOnboarding.tsx`: one question "What would you like to cook?" → recipe card preview → saves to DB
- `HearthTour.tsx`: 4-step spotlight (Today's Menu → Nudges → Library → Week Plan)
- `hearth-onboarding.css`: warm amber design system
- Commit: `20cc689`

### Budget → Pulse 💚
- `PulseBoot.tsx`: emerald floating particles + breathing heart SVG + glow ring
- `PulseOnboarding.tsx`: one question "What's your monthly income?" → budget preview with categories → saves to DB
- `PulseTour.tsx`: 4-step spotlight (Cockpit → Buckets → Log → Navigate)
- `pulse-onboarding-v2.css`: emerald design system
- Commit: `6ff7efc`

### Life → Orbit 🚀
- `OrbitBoot.tsx`: CRT terminal typewriter boot lines → countdown 3→2→1→GO → status chips
- `OrbitOnboarding.tsx`: 4-card mission briefing (Tasks → Habits → Briefing → Reschedule), keyboard navigable, no data required
- `orbit-boot.css`: CRT scanline + crosshatch grid, JetBrains Mono, electric blue
- Commit: `34a1e2b`

### Feed → Radar 📡
- `RadarBoot.tsx`: SVG radar dish activates, sweep arm rotates, blips appear one by one, tactical readouts
- `RadarOnboarding.tsx`: 4-card intelligence briefing (Ripples → Categories → Briefing → Threads), each with unique visual
- `radar-boot.css`: pitch black, cyan precision, rotating sweep animation
- Commit: `8aed695`

### Feed/Radar Backend (Don wired)
- `feed_get_ripples` — reads ripples from DB by category
- `feed_signal_threads` — tracked topics with predictions + confidence
- `feed_get_questions` — Q&A history from intelligence layer
- LLM commands (UI-only, not agent-toolified): current_detect_ripples, current_daily_briefing, current_cognitive_patterns, current_ask
- Commit: `e80f15a`

## Design Philosophy Established

Each app now has a completely distinct identity:

| App | Metaphor | Background | Key Animation |
|-----|---------|------------|---------------|
| Hearth 🔥 | Kitchen fire | Heat shimmer | Flame flicker |
| Pulse 💚 | Heartbeat | Emerald glow | Heart pulse |
| Orbit 🚀 | Space launch | CRT grid | Countdown |
| Radar 📡 | Radar sweep | Pitch black | Sweep rotation |

## Files Created This Session

```
src/components/KitchenBoot.tsx
src/components/HearthOnboarding.tsx
src/components/HearthTour.tsx
src/components/PulseBoot.tsx
src/components/PulseOnboarding.tsx
src/components/PulseTour.tsx
src/components/OrbitBoot.tsx
src/components/OrbitOnboarding.tsx
src/components/RadarBoot.tsx
src/components/RadarOnboarding.tsx
src/styles/hearth-onboarding.css
src/styles/pulse-onboarding-v2.css
src/styles/orbit-boot.css
src/styles/radar-boot.css
```

## All 5 Commits Pushed to origin/main
- `20cc689` — Kitchen/Hearth redesign
- `6ff7efc` — Budget/Pulse redesign
- `34a1e2b` — Life/Orbit redesign
- `8aed695` — Feed/Radar redesign
- `e80f15a` — Echo backend tool wiring + Feed/Radar backend

## GitHub SSH Fix
- Remote was HTTPS → switched to SSH: `git@github.com:TheConflux-Core/conflux-home.git`
- Works because SSH key is authenticated on this machine

## Next Session
- Remaining onboarding: Studio, Vault, Games Hub, Agents/Marketplace
- Feed/Radar intelligence backend (Rust signal detection)
- Life/Orbit unique value proposition clarification
