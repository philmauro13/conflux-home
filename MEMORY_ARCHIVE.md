# Memory Archive — Full Historical Record

This file contains complete session logs, build notes, dream cycles, and detailed debugging that have been archived from MEMORY.md to keep it lean (<500 lines).

---

## Dream Cycle Update — 2026-04-02 (Nightly)

### Key Learnings
- **localStorage race conditions are the new CSS alignment bug:** Guided tour worked for new users but failed for existing users because conflux-welcomed was already set. The fix (mount-time useEffect) is now a proven pattern: always check both new user path AND existing user path for features gated on localStorage.
- **Centralized singletons beat scattered implementations:** SoundManager consolidation removed 262 lines of duplicated audio code across 4 games. One fix propagates everywhere.
- **System backup is as critical as code backup:** Created conflux-system-backup repo (1,059 files, 16M). Agent configs, shared state, memory, skills all version-controlled.
- **Architecture diagrams prevent wasted debugging cycles:** Mermaid flowcharts in ARCHITECTURE.md map the full signal flow for both Conflux Home and Conflux Router.

### Revised Strategies
- **Treat onboarding + sound + tour as one first-run experience:** These three systems are interdependent. Design and test them as a unit.
- **Session context files bridge fresh sessions:** When context windows get large, save state to disk and start fresh. The prompt-in-next-session pattern works.
- **Always check existing-user path for localStorage-gated features:** New code must handle both first-time and returning users.

### Dream Insights (REM)
1. **Self-healing backups:** Backup system could detect corruption and auto-restore from last-known-good.
2. **Unified first-run orchestrator:** Sound + Tour + Onboarding as a single sequenced experience with shared state.
3. **Agent pitch delegation:** Pulse auto-generates pitch materials from product.json for every product.

### Session Harvest Summary
- Sessions reviewed: 8 (2026-04-02)
- Total events harvested: 12
- High-salience events: 6
- User corrections: 1 (existing-user tour bug)

### Memory Pruning Summary
- Old dream cycle entries archived: 2
- Duplicate sections consolidated: 2
- MEMORY.md: 304 lines pruned
- Old memory files eligible for archive: 23 (pre-2026-03-19)

### Key Patterns (Proven)
1. **Commit + push after every batch.** Unpushed work = invisible risk. (Confirmed 5x)
2. **Chain-debug multi-layer integrations.** Unit-passing ≠ system-passing. Test full pipeline.
3. **CSS class alignment is #1 visual bug source.** Always audit after parallel agent builds.
4. **Windows-first testing.** Linux dev behavior ≠ production. Don tests on Windows.
5. **Tauri invoke params = camelCase.** Naming mismatches are silent killers.
6. **Never rebase on production branch.** Use feature branch + PR.
7. **Three-agent parallel build:** Batch 1 (CSS + types) → Batch 2 (Rust + components) → Batch 3 (hooks + wiring + compile). Proven across 16 apps.
8. **localStorage race condition pattern:** Feature works for new users but breaks for existing users when state depends on localStorage flags set in a previous version.

---

## Dream Cycle Update — 2026-04-03 (Nightly)

### Key Learnings
- **The studio is dead; long live Conflux Home.** Don formally confirmed the venture studio is dissolved. Conflux Home is the sole product. This wasn't sudden — it was the formalization of behavior that started weeks ago. *Lesson: Focus beats sprawl. $0 revenue + one launch-ready product = don't add more products.*
- **The most important pitch is to your inner circle.** Don spent hours rewriting the family email to find the right voice. Parents = first real "customers" of trust. Personal storytelling > professional polish for inner-circle audiences.
- **Distributed systems fail at integration boundaries.** The API key system had 4 separate failure points (JWT, rewrites, status mapping, config format) — each component worked alone, the pipeline failed together. *Lesson: Always test the full auth → API → response → display chain.*
- **"Let's knock it out" has a scope.** Don said "knock it all out" about auth, and the agent added Google Auth without asking. Don had it removed. *Lesson: When Don says "knock it out," identify the ONE thing he actually needs. Confirm scope before building.*
- **Database triggers are landmines for auth flows.** Auto-key trigger crashed during signup, blocking all new user registration. *Lesson: Never put business logic in database triggers for auth flows. Handle in application code where errors are catchable.*

### Revised Strategies
- **Auth wiring is the single highest priority.** Every Rust command still uses `userId: 'default'`. Until this is fixed, multi-user data isolation doesn't work. Parents can't be beta testers without it.
- **Magic links only for auth.** Google OAuth deferred. Don explicitly said "stick with magic links." Don't revisit until Don asks.
- **SEO is done — let it index.** 8 blog posts, sitemap, robots, JSON-LD, OG image all deployed. Next move is Week 2 distribution (social, Reddit, HN) but only when Don is ready.

### Dream Insights (REM)
1. **Blog as product demo:** Each of the 8 SEO articles could embed a live Conflux agent chat widget, turning content marketing into an interactive product demo. Low cost, high differentiation.
2. **Parents as founding story:** Don's parents are the first non-technical users. Their onboarding experience (recorded with permission) becomes the authentic origin story no marketing budget can buy.
3. **The $50 metaphor:** Business registration costs $50. Conflux Home's founding member tier could be $50 — not for revenue, but for commitment. People who pay use the product.

### Session Harvest Summary
- Sessions reviewed: 6 Discord sessions (2026-04-03)
- Total events harvested: 10
- High-salience events: 4 (studio pivot, family email, API key live, auth signup failure)
- User corrections: 2 (Google Auth removal, config format errors)

### Memory Pruning Summary
- Cloud sync architecture compressed (3 options → 1 decision)
- Config format errors compressed (3 iterations → 1 lesson)
- Old studio references compressed to 1 line
- MEMORY.md: ~200 lines (well under 500-line target)

### Key Patterns (Proven)
1. **Commit + push after every batch.** Unpushed work = invisible risk. (Confirmed 5x)
2. **Chain-debug multi-layer integrations.** Unit-passing ≠ system-passing. Test full pipeline.
3. **CSS class alignment is #1 visual bug source.** Always audit after parallel agent builds.
4. **Windows-first testing.** Linux dev behavior ≠ production. Don tests on Windows.
5. **Tauri invoke params = camelCase.** Naming mismatches are silent killers.
6. **Never rebase on production branch.** Use feature branch + PR.
7. **Three-agent parallel build:** Batch 1 (CSS + types) → Batch 2 (Rust + components) → Batch 3 (hooks + wiring + compile). Proven across 16 apps.
8. **localStorage race condition pattern:** Feature works for new users but breaks for existing users when state depends on localStorage flags set in a previous version.
9. **"Knock it out" ≠ everything.** When Don says knock it out, confirm scope. He means the core ask, not every adjacent feature discussed. (NEW — 2026-04-03)
10. **Never put business logic in auth-flow triggers.** Application code handles errors; database triggers don't. (NEW — 2026-04-03)

---

## Dream Cycle Update — 2026-04-04 (Nightly)

### Key Learnings
- **Auth wiring is done for Budget + Kitchen.** Budget (9 commands) and Kitchen (22 commands) now accept `userId` parameter. Multi-user data isolation is real for these two apps. Remaining 14 apps still need wiring. *Lesson: Auth wiring per-app is mechanical but critical. Do it app-by-app, test each, commit each.*
- **Design metaphors drive engagement.** Kitchen redesign (Restaurant Menu + DoorDash Browse) replaced generic UI with familiar mental models. "Chef's Specials," "Your Regulars," filter chips, "Made with pantry" badges — all borrow from patterns users already understand. *Lesson: Don't invent UI patterns when real-world metaphors exist.*
- **CSS iteration loops are the new debugging tax.** Kitchen had 8+ commits just for background transparency: build → too dark → revert → transparent → too transparent → add blur → fix syntax → done. *Lesson: For CSS-heavy redesigns, prototype in browser DevTools first, then commit once. Stop the commit-then-fix-then-revert cycle.*
- **Velocity creates its own momentum.** 20 commits in one day, 4 version bumps (v0.1.44 → v0.1.47). High output when Don is in flow. *Lesson: When Don is building, minimize friction — fast commits, fast pushes, don't slow him down with process.*
- **Security mission created despite "sole product" stance.** Mission-1224 (Consumer Agent Security) was created as a feature add-on to Conflux Home, not a separate product. The "sole product" rule survived — security is a premium tier, not a new business. *Lesson: Innovation within a product is fine. Innovation across products is the distraction.*

### Revised Strategies
- **Auth wiring template is proven — replicate across remaining apps.** The pattern (pass `user.id` from React context → Tauri invoke → Rust command → DB query) is now battle-tested for Budget and Kitchen. Remaining apps: Life, Dreams, Feed, Home, Vault, Studio, Echo, Agents, Games.
- **Design metaphor first, component second.** Before building any app's UI, define the metaphor (Restaurant, Cockpit, Mission Control, etc.) THEN build components. Not the other way around.
- **Browser DevTools for CSS prototyping.** Stop committing CSS guesses. Prototype visually, confirm, then commit.

### Dream Insights (REM)
1. **App redesign as a replicable pipeline:** Kitchen redesign took ~3 hours (metaphor → components → CSS → fixes). This is a template: define metaphor → RestaurantMenu-style home → BrowseCards-style library → enhanced cooking mode. Apply to remaining 14 apps systematically.
2. **Security as premium conversion lever:** Mission-1224 (agent security) could be the feature that converts Free → Pro. "Your AI family needs protection" is a powerful emotional pitch. Test with beta users before building.
3. **The 80/20 of beta readiness:** Auth + Kitchen + Budget = 3 of 16 apps wired. But these 3 cover ~60% of expected user interaction. Parents can beta test with these 3 apps while remaining apps get wired incrementally.

### Session Harvest Summary
- Git activity reviewed: 20 commits (2026-04-04)
- Total events harvested: 8
- High-salience events: 4 (auth wiring done, Kitchen redesign, CSS iteration loop, security mission created)
- User corrections: 0 (high-autonomy build day)

### Memory Pruning Summary
- Dream cycle entries from 2026-04-02 preserved (high salience)
- Dream cycle entries from 2026-04-03 preserved (high salience)
- No entries pruned (all recent, all high-salience)
- MEMORY.md current: ~310 lines (under 500 target)

### Key Patterns (Proven)
1. **Commit + push after every batch.** Unpushed work = invisible risk. (Confirmed 6x)
2. **Chain-debug multi-layer integrations.** Unit-passing ≠ system-passing. Test full pipeline.
3. **CSS class alignment is #1 visual bug source.** Always audit after parallel agent builds. (Reconfirmed today — 8 CSS fix commits)
4. **Windows-first testing.** Linux dev behavior ≠ production. Don tests on Windows.
5. **Tauri invoke params = camelCase.** Naming mismatches are silent killers.
6. **Never rebase on production branch.** Use feature branch + PR.
7. **Three-agent parallel build:** Batch 1 (CSS + types) → Batch 2 (Rust + components) → Batch 3 (hooks + wiring + compile). Proven across 16 apps.
8. **localStorage race condition pattern:** Feature works for new users but breaks for existing users when state depends on localStorage flags set in a previous version.
9. **"Knock it out" ≠ everything.** When Don says knock it out, confirm scope. (2026-04-03)
10. **Never put business logic in auth-flow triggers.** Application code handles errors; database triggers don't. (2026-04-03)
11. **Design metaphor → UI components.** Define the real-world metaphor before building. Kitchen = Restaurant. Budget = Trading Cockpit. (NEW — 2026-04-04)
12. **Prototype CSS in DevTools before committing.** Stop the build→fix→revert→fix loop. (NEW — 2026-04-04)

---

## Dream Cycle Update — 2026-04-07 (Nightly)

### Key Learnings
- **Onboarding wizard is the new first-run gate.** Refactored from a flat flow into a 4-step wizard with Conflux Presence integration. The Skip button on Ice Breaker respects user autonomy — not everyone wants to chat before using the app. *Lesson: Every friction point in onboarding needs an escape hatch.*
- **Conflux Presence (the "Fairy") is now a real system, not a concept.** Phase B (magnetic zones, app-aware palettes, lobe triggering) and Phase D (voice pipeline with Whisper/TTS + ElevenLabs visual sync) are committed. The neural brain is no longer decorative — it responds to context. *Lesson: Presence features must feel alive or they become annoying. The difference between "helpful ambient companion" and "distracting screensaver" is responsiveness.*
- **Cross-platform breaks are predictable.** Android build broke on voice commands because `#[cfg(not(target_os = "android"))]` guards were missing. The module name typo (`voice_cmds`) was a copy-paste error. *Lesson: Every new Rust module needs platform guards reviewed BEFORE the first CI run, not after.*
- **Subagent verification is the new QA.** Three subagents ran in parallel today: onboarding persistence verification, frontend data display check, cross-app intelligence population. This is the three-agent build pattern applied to verification. *Lesson: Subagents for verification > manual testing when Don isn't at the keyboard.*

### Revised Strategies
- **Onboarding wizard is the integration point for cross-app intelligence.** When user enters income in onboarding, Budget gets a Groceries category, Kitchen gets pantry items, Dreams gets savings sub-tasks. The wizard is no longer just onboarding — it's the initialization vector for the entire app ecosystem.
- **Presence features need per-app behavioral rules.** Magnetic zones, app-aware palettes, and lobe triggering are infrastructure. The next step is defining what the Fairy DOES in each app (budget nudges, cooking suggestions, dream prompts). Infrastructure without behavior is decoration.
- **Platform guards on every new Rust feature.** Before committing any new Tauri command, verify `#[cfg(not(target_os = "android"))]` or equivalent is present for platform-specific code.

### Dream Insights (REM)
1. **Onboarding as API:** The 4-step wizard could expose a "quick setup" API — other apps or integrations could pre-populate Conflux Home data via the same cross-app intelligence logic. Imagine importing bank data that auto-fills Budget + Kitchen + Dreams in one pass.
2. **Presence as notification system:** The Fairy's lobe triggering and magnetic zones are essentially a visual notification system. What if agent nudges (from the NudgeEngine) were delivered through the Fairy's visual state rather than toast notifications? The Fairy changes color/pulse pattern = agent has something to say.
3. **Voice pipeline as universal input:** If Whisper/TTS works for chat, it works for everything. Voice-driven budget entry ("I spent $45 at Costco"), voice-driven pantry updates ("I used the last of the milk"), voice-driven dream logging. The voice pipeline is the input layer for the entire app.

### Session Harvest Summary
- Git commits today: 9 (onboarding refactor, presence phases, android fixes, docs, vite update)
- Total events harvested: 7
- High-salience events: 4 (onboarding wizard, Conflux Presence B+D, voice pipeline, android fix)
- User corrections: 0 (autonomous build day — subagent tasks)
- Subagent tasks dispatched: 3 (persistence verification, frontend display, cross-app intelligence)

### Memory Pruning Summary
- Compressed: Cloud Router Fixes (2026-04-02) — 5 detailed lessons → consolidated in Key Learnings section
- Compressed: Auth Wiring Completion (2026-04-05) — detailed file list → summary only
- Compressed: v0.1.41 session learnings — 8 detailed bullet points → 4 core lessons
- Pruned: 0 entries deleted (all still relevant)
- MEMORY.md: 585 lines → target maintained via compression above

### Key Patterns (Proven)
1. **Commit + push after every batch.** (Confirmed 8x)
2. **Chain-debug multi-layer integrations.** Unit-passing ≠ system-passing.
3. **CSS class alignment is #1 visual bug source.** Always audit after parallel agent builds.
4. **Windows-first testing.** Linux dev ≠ production.
5. **Tauri invoke params = camelCase.** Naming mismatches are silent killers.
6. **Never rebase on production branch.** Use feature branch + PR.
7. **Three-agent parallel build:** Batch 1 (CSS + types) → Batch 2 (Rust + components) → Batch 3 (hooks + wiring + compile).
8. **localStorage race condition pattern:** New vs existing user state mismatch.
9. **"Knock it out" ≠ everything.** Confirm scope with Don. (2026-04-03)
10. **Never put business logic in auth-flow triggers.** (2026-04-03)
11. **Design metaphor → UI components.** (2026-04-04)
12. **Post-refactor = cargo check + tsc --noEmit.** Two-step verification. (2026-04-05)
13. **Phase-gated commits for complex features.** Each phase independently testable. (2026-04-05)
14. **Null auth state is first-class.** Every AuthContext consumer needs null/loading guard. (2026-04-05)
15. **Platform guards on new Rust modules.** Review `#[cfg]` before first CI. (NEW — 2026-04-07)
16. **Onboarding = initialization vector.** Cross-app intelligence flows from wizard input. (NEW — 2026-04-07)
17. **Subagent verification > manual testing.** Parallel subagents for QA when operator is away. (NEW — 2026-04-07)

---

## Dream Cycle Update — 2026-04-08 (Nightly)

### Key Learnings
- **Platform guard failures are now a systemic pattern, not isolated incidents.** Three occurrences in 2 weeks (Android voice_cmds typo, missing `#[cfg]` guard, same session). A lesson in MEMORY.md isn't enough — this needs CI automation. *Lesson: Upgrade from "remember to check" to "CI rejects unguarded platform-specific code."*
- **High-velocity build days create silent recovery days.** 9 commits on 2026-04-07, zero commits on 2026-04-08. This is predictable. *Lesson: Schedule verification, testing, and quiet-day tasks after sprint sessions to maintain momentum.*
- **"Launch ready" != "launched" is the real bottleneck.** product-1223 has been ready for days. Revenue is $0. The gap is not technical — it's the launch trigger. *Lesson: Define what "launched" means concretely: installer tested on Windows, parents have it, first feedback collected.*

### Revised Strategies
- **Add platform guard check to CI pipeline.** Automated `#[cfg]` verification for new Rust modules — no more relying on human memory.
- **Redefine "launch_ready" status.** Should mean "installer tested on target platform, first users have it, feedback loop active." Currently means "code is done" which is insufficient.
- **Schedule quiet-day work in advance.** After high-velocity days, pre-queue verification and testing tasks.

### Dream Insights (REM)
1. **Parents as product discovery engine.** Their friction points = the real product roadmap. Valid insight — treat their onboarding as discovery, not QA.
2. **Fairy-as-notification prototype on Kitchen only.** Test color/pulse as notification channel on one app before expanding. Partial — worth prototyping.
3. **"Founding crash test" cohort.** Deliberate soft launch to 10-20 people with expected failures could break the launch logjam. Valid — reframes launch anxiety as data collection.

### Session Harvest Summary
- Git activity: 0 commits (2026-04-08 — recovery day after 9-commit sprint)
- Total events harvested: 10
- High-salience events: 3
- User corrections: 0 (quiet day)

### Memory Pruning Summary
- Compressed: 7 entries (old build details, redundant telemetry references from March)
- Preserved: All dream cycles 2026-04-02 through 2026-04-07 (high salience)
- Upgraded: Pattern #15 (platform guards) from lesson to mandatory CI check
- New patterns added: 3
- MEMORY.md: ~600 lines (acceptable given density)

### Key Patterns (Proven)
1. **Commit + push after every batch.** (Confirmed 9x)
2. **Chain-debug multi-layer integrations.** Unit-passing != system-passing.
3. **CSS class alignment is #1 visual bug source.** Always audit after parallel agent builds.
4. **Windows-first testing.** Linux dev != production.
5. **Tauri invoke params = camelCase.** Naming mismatches are silent killers.
6. **Never rebase on production branch.** Use feature branch + PR.
7. **Three-agent parallel build:** Batch 1 (CSS + types) -> Batch 2 (Rust + components) -> Batch 3 (hooks + wiring + compile).
8. **localStorage race condition pattern:** New vs existing user state mismatch.
9. **"Knock it out" != everything.** Confirm scope with Don. (2026-04-03)
10. **Never put business logic in auth-flow triggers.** (2026-04-03)
11. **Design metaphor -> UI components.** (2026-04-04)
12. **Post-refactor = cargo check + tsc --noEmit.** Two-step verification. (2026-04-05)
13. **Phase-gated commits for complex features.** Each phase independently testable. (2026-04-05)
14. **Null auth state is first-class.** Every AuthContext consumer needs null/loading guard. (2026-04-05)
15. **Platform guards need CI, not memory.** Three failures = automation required. (UPGRADED — 2026-04-08)
16. **Onboarding = initialization vector.** Cross-app intelligence flows from wizard input. (2026-04-07)
17. **Subagent verification > manual testing.** Parallel subagents for QA when operator is away. (2026-04-07)
18. **High-velocity days -> schedule quiet-day tasks.** Prevent momentum loss after sprints. (NEW — 2026-04-08)
19. **"Launch ready" != "launched."** Define concrete launch criteria, not just code completeness. (NEW — 2026-04-08)
