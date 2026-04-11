# App Tree Audit — Conflux Home (React + Tauri v2)

**Symptom:** App crashes silently on mount — blank white screen in Tauri v2 webview.
**Date:** 2026-03-24

---

## Render Flow

```
main.tsx → ReactDOM.createRoot('#root').render(<App />)
App.tsx → SplashScreen (gate, 1.5s) → Onboarding (gate) → WelcomeOverlay (gate) → Desktop shell
```

### What Renders First

1. `main.tsx` — mounts `<App />` inside `<React.StrictMode>`
2. `App.tsx` — the `loaded` state starts `false`, so the **first thing rendered is `<SplashScreen>`**
3. After 1.5s, `onComplete` fires → `loaded = true` → `App` re-renders
4. If `isOnboarded` is false → `<Onboarding>` renders
5. Otherwise → full desktop shell (TopBar, Desktop, ConfluxBar, all the overlays)

---

## Critical Findings

### 🔴 CRITICAL: No Error Boundary

**This is the #1 cause of blank white screens in React.**

React 18/19 has **no built-in error boundary**. If ANY component in the tree throws during render, React unmounts the entire tree and renders nothing. Without an explicit `<ErrorBoundary>` wrapper, you get a white screen with no error visible in the UI (errors only show in DevTools console, which is inaccessible in Tauri v2 release builds by default).

**Fix:** Wrap `<App />` in `main.tsx` with an error boundary that renders a fallback UI and logs the error.

```tsx
// main.tsx
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error(error, info); }
  render() {
    if (this.state.error) return <div style={{padding:40}}>Error: {String(this.state.error)}</div>;
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
```

### 🟡 HIGH: `invoke()` Called Without Tauri Runtime Guard in Multiple Hooks

The following hooks call `invoke()` inside `useEffect` **without checking if Tauri is available first**:

| Hook | Command(s) | Guard? |
|------|-----------|--------|
| `useEngine` | `engine_health`, `engine_get_agents` | ❌ No — has try/catch only |
| `useFamily` | `family_list` | ❌ No — has try/catch only |
| `useStoryGames` | `story_games_list` | ✅ Yes — `isTauri()` check |
| `useStoryGame` | `story_game_get`, `story_chapters_list` | ✅ Yes |
| `useStorySeeds` | `story_seeds_list` | ✅ Yes |
| `useLearningProgress` | `learning_get_progress` | ❌ No (but guarded by `!memberId`) |
| `useLearningGoals` | `learning_get_goals` | ❌ No (but guarded by `!memberId`) |

Since `useEngine` and `useFamily` do have try/catch, and the invoke calls are in `useEffect` (not during render), they **should not crash**. But if `invoke` itself throws synchronously before returning a Promise (possible if the Tauri IPC bridge is broken), it would propagate up.

**The `isTauri()` function from `useStoryGame.ts` checks:**
```ts
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
```

**Recommendation:** Add this guard to ALL hooks that call `invoke()`, or create a shared `safeInvoke()` wrapper.

### 🟡 HIGH: App.tsx Calls `invoke()` Inside Multiple useEffect Hooks (During First Render Cycle)

These `invoke()` calls fire immediately after the first render (in `useEffect` with `[]` deps):

1. **`App.tsx` line ~fetchDashboard** — `invoke('engine_get_agents')` and `invoke('engine_health')`
2. **`App.tsx` line ~handleVoiceSend** — `invoke('engine_create_session')` and `invoke('engine_chat')` (only on user action)
3. **`Desktop.tsx` — `invoke('engine_get_agents')`** — fires immediately on mount

These are all wrapped in try/catch, so they shouldn't crash. But if the Tauri IPC bridge throws synchronously (not as a rejected Promise), they **will** crash.

### 🟢 LOW: `getDefaultWallpaper()` Runs During Render (Lazy State Init)

```ts
const [wallpaper, setWallpaper] = useState(() => getDefaultWallpaper());
```

This calls:
- `getSavedWallpaper()` → `localStorage.getItem()` — **safe**
- `document.body.classList.contains('dark')` — **safe**
- `window.matchMedia('(prefers-color-scheme: dark)').matches` — **safe**

**Not a crash risk.**

### 🟢 LOW: Top-Level Module Side Effects

Searched for any `invoke()` or `window.*` calls at module scope (outside functions). Found **none**. All `invoke()` calls are inside functions, callbacks, or `useEffect`.

### 🟢 LOW: Import Chain

All imported components exist on disk:
- `App.tsx` imports 24 components — all files verified present in `src/components/`
- `main.tsx` imports 11 CSS files — all verified present
- `@tauri-apps/api` v2.10.1 is in `package.json` — correct version for Tauri v2

**No missing imports detected.**

### 🟢 LOW: CSS Hiding Content

`index.css` sets:
```css
body { overflow: hidden; height: 100vh; }
#root { height: 100vh; display: flex; }
```

These are normal for a desktop app shell. No CSS that would hide the entire app.

---

## Onboarding.tsx — Mount Behavior

**Does NOT call `invoke()` during initial render.** The Google credentials fetch only runs when `step === 4`:
```ts
useEffect(() => {
  if (step === 4) {
    // invoke('engine_google_get_credentials') — only on step 4
  }
}, [step]);
```

Since the app starts at step 0 (Welcome), this hook is inert on mount.

---

## SplashScreen.tsx — Mount Behavior

Simple component. Two timers (1200ms fade, 1500ms complete). No `invoke()`, no Tauri calls, no side effects. **Not a crash risk.**

---

## Desktop.tsx — Mount Behavior

Calls `invoke('engine_get_agents')` in a `useEffect` with try/catch. **Should not crash.**

---

## Summary — Most Likely Cause

| Priority | Issue | Impact |
|----------|-------|--------|
| 🔴 **#1** | **No Error Boundary** — any unhandled render error produces a white screen | Crash = white screen |
| 🟡 **#2** | `invoke()` in useEffect without `isTauri()` guard — if IPC bridge is broken, synchronous throw crashes the tree | Crash = white screen |
| 🟡 **#3** | React 19 StrictMode double-renders — could expose a race condition or duplicate `invoke()` call | Intermittent crash |

---

## Recommended Fix (Do All Three)

### 1. Add Error Boundary to `main.tsx`
This alone will reveal the actual error instead of showing a white screen.

### 2. Add `isTauri()` Guard to `useEngine` and `useFamily`
```ts
if (!isTauri()) { setLoading(false); return; }
```

### 3. Wrap All `invoke()` Calls in Async-Only Pattern
Ensure `invoke()` never throws synchronously by wrapping in:
```ts
try { await invoke(...); } catch(e) { /* safe */ }
```
This is already done in most places, but verify it's consistent.

---

## Additional Files to Check If Fix Above Doesn't Resolve It

If adding an error boundary still shows a white screen (meaning the error is in module loading, not rendering):

1. **Check if `@tauri-apps/api` v2.10.1 is compatible with the Tauri CLI version** (`@tauri-apps/cli` v2.10.1)
2. **Check `src-tauri/Capabilities` and permissions** — Tauri v2 uses a capabilities system; if commands aren't registered, `invoke` will fail
3. **Run `tauri dev` and check the Rust-side logs** for panics or command registration failures
4. **Check if `marked` v15 import works** — it's used in ChatPanel (not in the initial render path though)
