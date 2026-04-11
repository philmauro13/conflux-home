# Audit: Tauri v2 Blank Page on `cargo tauri dev`

## Summary

When `cargo tauri dev` runs, the Tauri webview opens but shows a blank/white page. The root cause is a **Content Security Policy (CSP) `connect-src` mismatch** — the CSP in `tauri.conf.json` does not explicitly allow `http://localhost:5173`, which the dev webview needs to load HMR assets and the Vite dev server response.

---

## Investigation Results

### 1. Vite Port Configuration ✅ MATCH

**File:** `vite.config.ts`

- Vite is configured to run on **port 5173** with `strictPort: true`.
- The Tauri `devUrl` is `http://localhost:5173`.
- **Verdict:** Ports match. No mismatch here.

### 2. package.json `dev` Script ✅ CLEAN

**File:** `package.json`

- `"dev": "vite"` — just runs Vite directly, no port override.
- No `--port` flag that could cause a conflict.
- **Verdict:** Script is correct and will serve on port 5173 as configured.

### 3. index.html Script Path ✅ VALID

**File:** `index.html`

- Loads `<script type="module" src="/src/main.tsx"></script>`.
- Vite's dev server handles `.tsx` module transforms natively — this path is valid.
- Root element: `<div id="root"></div>` — standard React mount point.
- **Verdict:** Entry point is correct.

### 4. Vite CORS Configuration ⚠️ NO CORS BLOCK

- Vite's default CORS policy is permissive (`cors: true` by default).
- No `server.cors` restriction is set in `vite.config.ts`.
- **Verdict:** Vite won't block the Tauri webview on CORS grounds.

### 5. main.tsx Root Element ✅ MATCHES

**File:** `src/main.tsx`

- Calls `ReactDOM.createRoot(document.getElementById('root')!)` targeting `<div id="root">`.
- Renders `<App />` inside `<React.StrictMode>`.
- App.tsx imports many components and uses `@tauri-apps/api/core` invoke — the app does render real content.
- **Verdict:** No root element mismatch. The app will render if it can load.

### 6. Timing / Race Condition ⚠️ POSSIBLE CONTRIBUTING FACTOR

- `beforeDevCommand: "npm run dev"` starts Vite before the Tauri window opens.
- Tauri v2 waits for the `beforeDevCommand` to be "ready" before loading the URL, but if Vite takes longer than expected (cold start, dependency resolution), the webview may load before Vite responds — showing a blank page.
- `strictPort: true` helps here: if port 5173 is occupied, Vite exits immediately rather than picking a random port.
- **Verdict:** Possible contributor but unlikely to be the primary cause if `npm run dev` already works standalone.

### 7. CSP — `connect-src` 🚨 **PRIMARY CULPRIT**

**File:** `src-tauri/tauri.conf.json` → `app.security.csp`

Current CSP:
```
default-src 'self';
connect-src 'self' http://localhost:18789 ws://localhost:18789 http://localhost:8899;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
script-src 'self' 'unsafe-inline' 'unsafe-eval'
```

**Problem:** The `connect-src` directive lists:
- `'self'`
- `http://localhost:18789` / `ws://localhost:18789` (likely a backend/AI service)
- `http://localhost:8899` (likely another service)

**Missing:** `http://localhost:5173` and `ws://localhost:5173`.

In Tauri v2 dev mode, the webview loads from `http://localhost:5173`. While `'self'` in `connect-src` should technically match the dev URL origin, Tauri's CSP enforcement can be stricter than a regular browser. Vite's HMR (Hot Module Replacement) also uses a WebSocket connection to `ws://localhost:5173`, which would be blocked by the CSP.

Additionally, `script-src 'self'` without the dev URL can block inline/module scripts loaded from the Vite dev server in some Tauri webview configurations.

**This is the most likely cause of the blank page.**

---

## What SHOULD Happen When `cargo tauri dev`

1. Tauri reads `tauri.conf.json` and executes `beforeDevCommand: "npm run dev"`.
2. Vite starts on port 5173 (confirmed by `strictPort: true`).
3. Tauri opens the native webview window pointing to `http://localhost:5173`.
4. The webview loads `index.html`, which loads `/src/main.tsx` via Vite's module transform.
5. React mounts the `<App />` component inside `<div id="root">`.
6. Vite's HMR WebSocket connects to `ws://localhost:5173` for live reload.

## Why It Shows a Blank Page

**Primary cause: CSP `connect-src` does not include `http://localhost:5173` or `ws://localhost:5173`.**

When the Tauri webview navigates to `http://localhost:5173`, it loads the HTML shell. But:
- Vite HMR WebSocket to `ws://localhost:5173` is blocked by CSP → no hot module replacement.
- Any fetch/XHR from the page may be blocked if they're seen as cross-origin relative to the Tauri security context.
- The module scripts (`/src/main.tsx`) may fail to load if Tauri treats them as cross-origin resources.

The result: the HTML shell loads (the white page you see), but the React app never mounts because the JS modules fail CSP checks.

---

## Recommended Fix

Update the CSP in `tauri.conf.json` to include the Vite dev server URL:

```json
"security": {
  "csp": "default-src 'self' http://localhost:5173; connect-src 'self' http://localhost:5173 ws://localhost:5173 http://localhost:18789 ws://localhost:18789 http://localhost:8899; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173"
}
```

Key additions:
- `default-src`: add `http://localhost:5173` as fallback for all resource types
- `connect-src`: add `http://localhost:5173 ws://localhost:5173` for HMR
- `script-src`: add `http://localhost:5173` for module scripts

**Alternative:** For dev-only convenience, some projects use environment-based CSP or use `'unsafe-inline' 'unsafe-eval'` more broadly during development and tighten for production builds.

---

## Files Checked

| File | Status |
|------|--------|
| `vite.config.ts` | ✅ Port 5173, strictPort:true — correct |
| `package.json` | ✅ `"dev": "vite"` — correct |
| `index.html` | ✅ Loads `/src/main.tsx`, `<div id="root">` — correct |
| `src/main.tsx` | ✅ Renders `<App />` into `#root` — correct |
| `src/App.tsx` | ✅ Imports components, uses Tauri API — functional |
| `tauri.conf.json` CSP | 🚨 Missing `localhost:5173` in `connect-src` and other directives |

---

*Generated: 2026-03-24T07:56 UTC*
