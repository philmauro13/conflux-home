# Conflux Home — Dependency & Import Audit

**Date:** 2026-03-24  
**Goal:** Find missing/broken imports causing blank white screen on mount in Tauri v2 webview.

## Verdict: ALL IMPORTS RESOLVE CORRECTLY ✅

Every import in `App.tsx` and its transitive dependencies resolves to a real file with the expected exports. **No missing modules, no missing exports, no broken import paths.**

TypeScript compiles cleanly (`tsc --noEmit` — zero errors).

---

## Detailed Findings

### Files Checked (App.tsx imports)

| Import | File | Export Match | Status |
|---|---|---|---|
| `Agent`, `View` | `src/types.ts` | ✅ Named exports | ✅ |
| `TopBar` | `src/components/TopBar.tsx` | ✅ `export default` | ✅ |
| `Desktop` | `src/components/Desktop.tsx` | ✅ `export default` | ✅ |
| `ConfluxBar` | `src/components/ConfluxBar.tsx` | ✅ `export default` | ✅ |
| `ChatPanel` | `src/components/ChatPanel.tsx` | ✅ `export default` | ✅ |
| `Marketplace` | `src/components/Marketplace.tsx` | ✅ `export default` | ✅ |
| `AgentDetail` | `src/components/AgentDetail.tsx` | ✅ `export default` | ✅ |
| `Onboarding` | `src/components/Onboarding.tsx` | ✅ `export default` | ✅ |
| `WelcomeOverlay` | `src/components/WelcomeOverlay.tsx` | ✅ `export default` | ✅ |
| `Settings` | `src/components/Settings.tsx` | ✅ `export default` | ✅ |
| `SplashScreen` | `src/components/SplashScreen.tsx` | ✅ `export default` | ✅ |
| `ToastContainer` | `src/components/Toast.tsx` | ✅ `export default function ToastContainer` | ✅ |
| `FamilySwitcher` | `src/components/FamilySwitcher.tsx` | ✅ `export default` | ✅ |
| `FamilySetup` | `src/components/FamilySetup.tsx` | ✅ `export default` | ✅ |
| `GameLauncher` | `src/components/GameLauncher.tsx` | ✅ `export default` | ✅ |
| `StoryGameReader` | `src/components/StoryGameReader.tsx` | ✅ `export default` | ✅ |
| `AgentTemplateBrowser` | `src/components/AgentTemplateBrowser.tsx` | ✅ `export default` | ✅ |
| `ParentDashboard` | `src/components/ParentDashboard.tsx` | ✅ `export default` | ✅ |
| `VoiceChat` | `src/components/VoiceChat.tsx` | ✅ `export default` | ✅ |
| `KitchenView` | `src/components/KitchenView.tsx` | ✅ `export default` | ✅ |
| `BudgetView` | `src/components/BudgetView.tsx` | ✅ `export default` | ✅ |
| `FeedView` | `src/components/FeedView.tsx` | ✅ `export default` | ✅ |
| `LifeAutopilotView` | `src/components/LifeAutopilotView.tsx` | ✅ `export default` | ✅ |
| `HomeHealthView` | `src/components/HomeHealthView.tsx` | ✅ `export default` | ✅ |
| `DreamBuilderView` | `src/components/DreamBuilderView.tsx` | ✅ `export default` | ✅ |
| `AgentDiaryView` | `src/components/AgentDiaryView.tsx` | ✅ `export default` | ✅ |
| `ImmersiveView` | `src/components/ImmersiveView.tsx` | ✅ `export default` | ✅ |
| `useEngine` | `src/hooks/useEngine.ts` | ✅ `export function useEngine` | ✅ |
| `useToast` | `src/hooks/useToast.ts` | ✅ `export function useToast` | ✅ |
| `useFamily` | `src/hooks/useFamily.ts` | ✅ `export function useFamily` | ✅ |
| `useStoryGames` | `src/hooks/useStoryGame.ts` | ✅ `export function useStoryGames` | ✅ |
| `useStoryGame` | `src/hooks/useStoryGame.ts` | ✅ `export function useStoryGame` | ✅ |
| `useStorySeeds` | `src/hooks/useStoryGame.ts` | ✅ `export function useStorySeeds` | ✅ |
| `useLearningProgress` | `src/hooks/useLearning.ts` | ✅ `export function useLearningProgress` | ✅ |
| `useLearningGoals` | `src/hooks/useLearning.ts` | ✅ `export function useLearningGoals` | ✅ |
| `initTheme`, `getSavedWallpaper` | `src/lib/theme.ts` | ✅ Both exported | ✅ |
| `registerShortcuts` | `src/lib/shortcuts.ts` | ✅ `export function registerShortcuts` | ✅ |
| `./styles/animations.css` | `src/styles/animations.css` | ✅ File exists | ✅ |

### Transitive Dependencies

| File | Imports From | Status |
|---|---|---|
| `src/components/Desktop.tsx` | `./Avatar` | ✅ Exists, exports default |
| `src/components/Desktop.tsx` | `./DesktopWidgets` | ✅ Exists, exports default |
| `src/components/DesktopWidgets.tsx` | `./ConnectivityWidget` | ✅ Exists, exports default |
| `src/data/agent-descriptions.ts` | `../types` (`AGENT_COLORS`) | ✅ Exported in types.ts |

### `main.tsx` CSS Imports — All Present ✅

`index.css`, `styles-family.css`, `styles-story.css`, `styles-voice.css`, `styles-kitchen.css`, `styles-budget.css`, `styles-feed.css`, `styles-life.css`, `styles-home.css`, `styles-diary.css`, `styles-desktop.css` — all exist.

### `package.json` Dependencies

| Package | Version | Used In | Status |
|---|---|---|---|
| `@tauri-apps/api` | ^2.10.1 | hooks, components | ✅ |
| `react` | ^19.1.0 | everywhere | ✅ |
| `react-dom` | ^19.1.0 | main.tsx | ✅ |
| `marked` | ^15.0.12 | Not imported in checked files | ⚠️ Unused? |
| `@tauri-apps/plugin-notification` | ^2.3.3 | Not seen in checked files | ⚠️ May be unused |

---

## Possible Non-Import Causes of Blank Screen

Since all imports are valid, the crash is likely **runtime**, not import-related:

### 1. **No Error Boundary**
App.tsx has zero error boundaries. Any unhandled runtime exception in any child component will crash the entire React tree silently → white screen.

### 2. **Tauri Command Failures at Mount**
Multiple components invoke Tauri commands on mount:
- `useEngine()` → `engine_health`, `engine_get_agents`
- `useFamily()` → `family_list`
- `ConnectivityWidget` → `engine_google_is_connected`, `engine_get_email_config`
- `Desktop` → `engine_get_agents` (duplicate fetch)

All have `try/catch` or `isTauri()` guards, **but** if `invoke()` itself throws synchronously before the promise is created (e.g., Tauri runtime partially initialized), the error propagates uncaught.

### 3. **React Strict Mode Double-Mount**
`main.tsx` uses `<React.StrictMode>` which double-invokes effects in development. If any effect has side effects that don't tolerate being called twice (e.g., AudioContext creation, duplicate event listeners), this could cause issues.

### 4. **Type Duplication (Non-Fatal)**
`shortcuts.ts` defines its own `View` type as `'dashboard' | 'chat' | 'marketplace' | 'settings'` (4 values), while `types.ts` exports a `View` with 14 values. `App.tsx` imports `View` from `types.ts` and passes it to `registerShortcuts` which expects its narrower type. This works in TS due to structural typing but is a maintenance hazard.

### 5. **Potential Missing: Tauri Commands on Rust Side**
If the Rust backend hasn't registered commands like `engine_get_agents`, `engine_health`, `family_list`, etc., the `invoke()` calls will reject. The hooks catch these, but unhandled rejections in edge cases can still crash.

---

## Recommendations

1. **Add an Error Boundary** wrapping `<App />` in `main.tsx` to catch render errors and display them instead of a white screen.
2. **Add a global `window.onerror` / `unhandledrejection` handler** in `main.tsx` to log runtime errors to console (visible in Tauri devtools).
3. **Check Tauri Rust side** to ensure all `engine_*`, `family_*`, `story_*`, `learning_*` commands are registered.
4. **Test with `__TAURI_INTERNALS__` check** — if running outside Tauri webview, the app should degrade gracefully (currently most hooks have this guard, but not `useEngine`).
5. **Remove duplicate `View` type** from `shortcuts.ts` — import from `types.ts` instead.
