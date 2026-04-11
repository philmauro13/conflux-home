# Conflux Home — Frontend Audit Report

**Date:** 2026-03-24  
**Auditor:** Subagent (React/TypeScript frontend auditor)

---

## File-by-File Review

### 1. `src/main.tsx` — CLEAN

No issues. Standard React 18 entry point. Renders `<App />` in `StrictMode`. Imports 12 CSS files — all verified to exist at their expected paths (`index.css`, `styles-family.css`, `styles-story.css`, etc.).

---

### 2. `src/App.tsx` — WARNINGs

**⚠️ WARNING — `useConfluxChat` imported but never called.**  
`useConfluxChat` is imported from `./hooks/useConfluxChat` on line ~29 but is never invoked anywhere in the component. Dead import. Won't crash, but indicates incomplete wiring.

**⚠️ WARNING — `Agent` type imported but unused as a type.**  
`import { Agent, View } from './types'` — `Agent` is imported but the component uses `invoke<any[]>` and `agents` from `useEngine()` (which returns its own type). The `Agent` import is dead.

**⚠️ WARNING — `useEngine` hook returns agents with implicit typing.**  
`const { connected, agents, refresh } = useEngine()` — The `agents` array type comes from `useEngine`, not from the imported `Agent` type. Should be verified that `useEngine`'s return type matches `Agent` from `types.ts`.

**ℹ️ NOTE — `getDefaultWallpaper()` runs at module level via `useState` initializer.**  
`useState(() => getDefaultWallpaper())` — this calls `getSavedWallpaper()` and reads `document.body.classList` on first render. Safe in a Tauri context but would throw in SSR (not applicable here).

**ℹ️ NOTE — `handleVoiceSend` has an empty catch block.**  
The `learning_log_activity` call is wrapped in `try/catch { /* non-critical */ }` — this is intentional and fine.

---

### 3. `src/components/Desktop.tsx` — CLEAN

No issues. Properly typed props interface (`DesktopProps`). Uses `invoke` from `@tauri-apps/api/core` (correct Tauri import). Imports `Avatar`, `DesktopWidgets` — both exist. Uses `AGENT_COLORS` and `View` from `../types` — both exported. The `useEffect` for fetching stats has a silent catch, which is appropriate.

---

### 4. `src/components/Onboarding.tsx` — WARNINGs

**⚠️ WARNING — Uses `window.__TAURI__?.invoke` with a no-op fallback instead of `@tauri-apps/api/core`.**  
```typescript
const invoke = window.__TAURI__?.invoke || (async () => { /* no-op */ });
```
This is different from every other component which imports `{ invoke } from '@tauri-apps/api/core'`. If `window.__TAURI__` is undefined (e.g., running in browser dev mode), the fallback `async () => {}` returns `undefined` for all Tauri calls. This means:
- Step 4 (Google Connect) will silently fail
- `await invoke('engine_google_get_credentials')` returns `undefined`
- `creds.has_credentials` will throw `TypeError: Cannot read properties of undefined` → caught by try/catch → sets `googleStatus = 'error'`

This won't cause a white screen (errors are caught), but Google integration in onboarding will silently fail outside Tauri.

**⚠️ WARNING — Redundant `declare global` for `window.__TAURI__`.**  
The file declares `Window.__TAURI__` globally but only uses it locally. Not harmful, but inconsistent with the rest of the codebase that uses `@tauri-apps/api/core` directly.

**ℹ️ NOTE — All 10 agents in `ALL_AGENTS` match the `AGENT_COLORS` in `types.ts`.**  
Verified: zigbot, helix, forge, vector, pulse, quanta, prism, spectra, luma, catalyst — all present in both.

---

### 5. `src/components/SplashScreen.tsx` — CLEAN

No issues. Simple component with a 1.5s timer that calls `onComplete()`. `onComplete` is in the `useEffect` dependency array (correct). The `clearTimeout` cleanup handles both timers. No crash risk.

---

### 6. `src/components/WelcomeOverlay.tsx` — CLEAN

No issues. Imports `Avatar` (exists) and `AGENT_PROFILE_MAP` from `../data/agent-descriptions` (verified exists and exports the map). Uses `localStorage` to persist `conflux-welcomed`. Auto-dismisses after 10s. Proper ref guard against double-dismiss. CSS-in-JS style block is valid.

---

### 7. `src/components/settings/GoogleSettings.tsx` — CLEAN

No issues. Uses `import { invoke } from '@tauri-apps/api/core'` (correct Tauri import, unlike Onboarding.tsx). All Tauri commands are:
- `engine_google_is_connected` → returns boolean
- `engine_google_get_email` → returns string
- `engine_google_get_credentials` → returns object with `has_credentials`, `client_id`, `client_secret`
- `engine_google_connect` → returns string (email)
- `engine_google_disconnect` → void
- `engine_google_set_credentials` → void

All wrapped in try/catch. Loading states handled properly. `useCallback` for `loadStatus` with empty dep array is correct (stable reference).

---

### 8. `src/types.ts` — CLEAN

No issues. Comprehensive type definitions. All types used across the codebase are exported:
- `Agent`, `View`, `AGENT_COLORS` — used by Desktop, App
- `FamilyMember`, `CreateFamilyMemberRequest`, `AgeGroup`, `AGE_GROUP_CONFIG` — used by family components
- Story game types, learning types, kitchen types, budget types, etc. — all properly exported

The `View` type union includes all 14 views: `'dashboard' | 'chat' | 'marketplace' | 'settings' | 'onboarding' | 'games' | 'agents' | 'kitchen' | 'budget' | 'feed' | 'life' | 'home' | 'dreams' | 'diary'`.

**ℹ️ NOTE:** `lib/shortcuts.ts` has its own `View` type with only 4 values (`'dashboard' | 'chat' | 'marketplace' | 'settings'`). This is a separate, narrower type — not a conflict, but could be confusing. The callback from App.tsx passes the broader `View` type which is compatible (subset relationship).

---

### 9. `tsconfig.json` — CLEAN

No issues. Standard Vite + React config. `strict: true` is enabled. `noUnusedLocals: false` and `noUnusedParameters: false` suppress the unused import warnings noted above. `moduleResolution: "bundler"` is correct for Vite.

---

## Routing Flow Explanation

**There is NO react-router.** The app uses **pure state-based routing** via React `useState`.

### Component Tree

```
main.tsx
  └── App.tsx
        ├── [Gate 1] SplashScreen (1.5s, then sets loaded=true)
        ├── [Gate 2] Onboarding (if !isOnboarded)
        ├── [Gate 3] WelcomeOverlay (if onboarded && !welcomed)
        └── [Main Shell] desktop-shell div
              ├── TopBar
              ├── Desktop (agent avatars, widgets)
              ├── FamilySwitcher (if family members exist)
              ├── ImmersiveView (conditional, wraps one of):
              │     ├── KitchenView
              │     ├── BudgetView
              │     ├── FeedView
              │     ├── LifeAutopilotView
              │     ├── HomeHealthView
              │     ├── DreamBuilderView
              │     ├── AgentDiaryView
              │     ├── Marketplace
              │     ├── Settings
              │     ├── AgentTemplateBrowser
              │     ├── [Dashboard stats]
              │     └── [Story games list]
              ├── ChatPanel (slide-in)
              ├── VoiceChat (for toddler/preschool)
              ├── StoryGameReader (full-screen overlay)
              ├── GameLauncher (modal)
              ├── FamilySetup (modal)
              ├── ParentDashboard (modal)
              ├── ConfluxBar (bottom bar)
              ├── AgentDetail (modal, event-driven)
              └── ToastContainer
```

### Flow: Onboarding → Desktop

1. **SplashScreen** renders for 1.5 seconds → calls `setLoaded(true)`
2. **Onboarding check:** reads `localStorage.getItem('conflux-onboarded')`
   - If not `'true'` → shows `<Onboarding>` component (4-step wizard)
   - On completion: sets `conflux-onboarded = 'true'` in localStorage, calls `onComplete(goals, agentIds)`
3. **Welcome check:** if onboarded but `conflux-welcomed` ≠ `'true'` → shows `<WelcomeOverlay>` (one-time greeting)
   - On dismiss: sets `conflux-welcomed = 'true'`, calls `onComplete()`
4. **Desktop shell** renders — the main app with TopBar, Desktop, ConfluxBar, and all overlays

### Navigation After Onboarding

- `view` state drives what's shown in the ImmersiveView overlay
- `immersiveView` state is separate from `view` — Desktop widget clicks set `immersiveView` directly
- `handleNavigate(v)` sets both `view` and `immersiveView` (for ConfluxBar navigation)
- Chat opens via `chatOpen` state; voice chat via `voiceChatOpen`
- Agent detail modal listens for `conflux:agent-detail` custom events
- All navigation is event-driven via `window.dispatchEvent(new CustomEvent(...))`

---

## Summary

| Severity | Count | Details |
|----------|-------|---------|
| **CRITICAL** | **0** | No white-screen or crash-causing issues found |
| **WARNING** | **4** | See below |
| **INFO** | **3** | Minor code quality notes |

### WARNING Issues

1. **`useConfluxChat` imported but never called** in `App.tsx` — dead import, suggests incomplete feature wiring
2. **`Agent` type imported but unused** in `App.tsx` — dead import
3. **Onboarding.tsx uses `window.__TAURI__?.invoke`** with silent no-op fallback instead of `@tauri-apps/api/core` — Google integration step will silently fail in browser dev mode (errors are caught, no crash)
4. **Duplicate `View` type** — `types.ts` has 14-value union, `lib/shortcuts.ts` has 4-value union with same name — not a runtime issue but source of confusion

### Conclusion

**No issues found that would cause a white screen or routing crash.** The routing flow (Splash → Onboarding → Welcome → Desktop) is correctly gated with localStorage checks. All imported components and hooks exist. The Onboarding.tsx `invoke` pattern is the only real concern — it will silently degrade rather than crash.
