# Hook Audit — React Mount Crash Investigation

**Date:** 2026-03-24
**Context:** React app crashes silently on mount (blank white screen) inside Tauri v2 webview. Minimal HTML works fine.

## Summary

**All 23 hooks are CLEAN.** None of them cause an uncaught crash on mount.

Every `invoke()` call that fires on mount is wrapped in try/catch (or `.catch()`). All Tauri commands called by hooks are registered in `lib.rs` invoke_handler. No module-level side effects exist in any hook file.

**The crash is NOT in the hooks.** Look elsewhere (see Recommendations at bottom).

---

## Hook-by-Hook Findings

### useEngine.ts — ✅ CLEAN
- **On mount:** Calls `engine_health` (with `.catch(() => null)`) and `engine_get_agents` — both wrapped in try/catch
- **Commands registered:** `engine_health` ✅, `engine_get_agents` ✅
- **Error handling:** Full try/catch in `fetchAgents`, sets `connected=false` and `error` on failure
- **Module-level:** No side effects

### useGateway.ts — ✅ CLEAN
- **On mount:** Creates `GatewayClient` from stored token — no `invoke()` calls
- **Commands registered:** N/A (uses HTTP, not Tauri invoke)
- **Error handling:** Checks for missing token gracefully
- **Module-level:** No side effects. Imports `GatewayClient` from `../gateway-client` (pure class, no side effects)

### useFamily.ts — ✅ CLEAN
- **On mount:** Calls `family_list` — wrapped in try/catch
- **Commands registered:** `family_list` ✅
- **Error handling:** Sets error state on catch
- **Module-level:** No side effects

### useConfluxChat.ts — ✅ CLEAN
- **On mount:** Only creates `ConfluxRouter` and calls `router.start()` when `agentId` is provided — guarded
- **Commands registered:** N/A (no Tauri invoke on mount)
- **Error handling:** sendMessage has try/catch for QuotaExceeded and general errors
- **Module-level:** `messageCounter` (harmless integer), `AGENT_PERSONAS` (static object), `hasConfluxKeys()` and `getUserId()` are functions (not called at import)
- **Note:** `router.start()` calls `startHealthMonitor()` which fires `fetch()` to external APIs — these are fire-and-forget with their own error handling

### useDiary.ts — ✅ CLEAN
- **On mount:** NO auto-load. Exposes `loadDashboard`, `loadEntries` etc. as manual callbacks
- **Commands registered:** All diary commands ✅
- **Error handling:** All loads have try/catch
- **Module-level:** No side effects

### useCron.ts — ✅ CLEAN
- **On mount:** Calls `engine_get_crons({ enabledOnly: null })` — wrapped in try/catch
- **Commands registered:** `engine_get_crons` ✅
- **Error handling:** console.error on failure, sets loading=false
- **Module-level:** No side effects

### useWebhooks.ts — ✅ CLEAN
- **On mount:** Calls `engine_get_webhooks` — wrapped in try/catch
- **Commands registered:** `engine_get_webhooks` ✅
- **Error handling:** console.error on failure
- **Module-level:** No side effects

### useBudget.ts — ✅ CLEAN
- **On mount:** Calls `budget_get_entries` and `budget_get_summary` — both wrapped in try/catch
- **Commands registered:** `budget_get_entries` ✅, `budget_get_summary` ✅
- **Error handling:** console.error on failure
- **Module-level:** No side effects

### useFeed.ts (useContentFeed) — ✅ CLEAN
- **On mount:** Calls `feed_get_items` — wrapped in try/catch
- **Commands registered:** `feed_get_items` ✅
- **Error handling:** console.error on failure
- **Module-level:** No side effects

### useKitchen.ts — ✅ CLEAN (3 hooks)
- **useMeals:** Calls `kitchen_get_meals` on mount — try/catch ✅
- **useMealDetail:** Calls `kitchen_get_meal` on mount (guarded by `mealId`) — try/catch ✅
- **useWeeklyPlan:** Calls `kitchen_get_weekly_plan` on mount — try/catch ✅
- **useGroceryList:** Calls `kitchen_get_grocery` on mount — try/catch ✅
- **Commands registered:** All kitchen commands ✅
- **Module-level:** No side effects

### useFridgeScanner.ts — ✅ CLEAN
- **On mount:** NO auto-load. All methods are manual calls
- **Commands registered:** `fridge_scan`, `fridge_what_can_i_make`, `fridge_expiring_soon`, `fridge_shopping_for_meals` ✅
- **Module-level:** No side effects

### useLifeAutopilot.ts — ✅ CLEAN
- **On mount:** Calls `life_get_dashboard` — wrapped in try/catch
- **Commands registered:** `life_get_dashboard` ✅
- **Error handling:** console.error on failure
- **Module-level:** No side effects

### useHomeHealth.ts — ✅ CLEAN
- **On mount:** NO auto-load. Exposes `load` and `loadInsights` as manual callbacks
- **Commands registered:** All home commands ✅
- **Error handling:** try/catch in load functions
- **Module-level:** No side effects

### useDreams.ts — ✅ CLEAN
- **On mount:** Calls `dream_get_dashboard` — wrapped in try/catch
- **Commands registered:** `dream_get_dashboard` ✅
- **Error handling:** Sets dashboard=null on error
- **Module-level:** No side effects

### useStoryGame.ts — ✅ CLEAN (3 hooks)
- **useStoryGames:** Calls `story_games_list` on mount — try/catch, guarded by `isTauri()` ✅
- **useStoryGame:** Calls `story_game_get` + `story_chapters_list` on mount — try/catch, guarded by `isTauri()` ✅
- **useStorySeeds:** Calls `story_seeds_list` on mount — try/catch, guarded by `isTauri()` ✅
- **Commands registered:** All story commands ✅
- **Module-level:** `isTauri()` function definition (no side effects)

### useLearning.ts — ✅ CLEAN (3 hooks)
- **useLearningProgress:** Calls `learning_get_progress` on mount — try/catch, guarded by `memberId` ✅
- **useLearningActivities:** Calls `learning_get_activities` on mount — try/catch, guarded by `memberId` ✅
- **useLearningGoals:** Calls `learning_get_goals` on mount — try/catch, guarded by `memberId` ✅
- **Commands registered:** All learning commands ✅
- **Module-level:** No side effects

### useSkills.ts — ✅ CLEAN
- **On mount:** Calls `engine_get_skills({ activeOnly: null })` — wrapped in try/catch
- **Commands registered:** `engine_get_skills` ✅
- **Module-level:** No side effects

### useTasks.ts — ✅ CLEAN
- **On mount:** Calls `engine_get_tasks_for_agent({ agentId: '', status: null })` — wrapped in try/catch
- **Commands registered:** `engine_get_tasks_for_agent` ✅
- **Module-level:** No side effects

### useToast.ts — ✅ CLEAN
- **On mount:** Pure state management. No invoke, no side effects
- **Module-level:** `nextId` counter (harmless)

### useTTS.ts — ✅ CLEAN
- **On mount:** Browser SpeechSynthesis only. No Tauri invoke
- **Module-level:** No side effects

### useVoiceInput.ts — ✅ CLEAN
- **On mount:** Checks for SpeechRecognition availability — browser-only
- **Module-level:** No side effects

### useNotificationListener.ts — ✅ CLEAN
- **On mount:** Calls `isPermissionGranted()` and `listen()` from Tauri plugins — both plugins registered
- **Plugins registered:** `tauri_plugin_notification` ✅, event system (core) ✅
- **Error handling:** async setup with permission check; inner JSON.parse has try/catch
- **Module-level:** No side effects

### useEmail.ts — ✅ CLEAN
- **On mount:** Calls `engine_get_email_config` — wrapped in try/catch
- **Commands registered:** `engine_get_email_config` ✅
- **Module-level:** No side effects

---

## App.tsx — Also Clean

- `initTheme()` — reads localStorage, applies CSS class. No crash risk.
- Dashboard `useEffect` — calls `engine_get_agents` and `engine_health` — both in `try {} catch {}` (empty catch, safe)
- `getDefaultWallpaper()` — reads localStorage + `matchMedia`. No crash risk.
- All components imported exist on disk ✅
- All CSS files imported exist on disk ✅

## Gateway Client & Conflux Router — Clean

- `gateway-client/index.ts` — Pure class definition, no top-level side effects
- `conflux-router/index.ts` — Re-exports only, no side effects
- `conflux-router/providers.ts` — Static data arrays + functions (no execution at import)
- `conflux-router/health.ts` — In-memory Map + functions (no execution at import)
- `conflux-router/quota.ts` — localStorage read/write functions (no execution at import)

---

## Recommendations

Since the hooks are all clean, the crash likely comes from one of:

1. **Rust-side panic in a Tauri command** — A command that's registered but panics on first call (e.g., database init failure, missing table, schema mismatch). Check `src-tauri/src/engine/` and `src-tauri/src/commands/` for unwrap/expect calls.

2. **Database initialization failure** — `engine::init_engine(&db_path)` in `lib.rs` setup could panic if the DB schema migration fails. The `.expect()` would crash the whole app before React even mounts.

3. **Component render crash** — A component (not a hook) that throws during render. Check components that render unconditionally on first paint: `TopBar`, `Desktop`, `ConfluxBar`, `ToastContainer`.

4. **React error boundary missing** — No error boundary wraps the app in `main.tsx`. Any uncaught render error produces a white screen. Adding `<ErrorBoundary>` would surface the real error.

5. **CSS variable dependency** — The app uses `var(--bg-primary)`, `var(--text-primary)`, etc. If `index.css` doesn't define these variables in the Tauri webview context, visual elements might be invisible (not a crash, but looks like one).
