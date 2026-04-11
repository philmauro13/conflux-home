# Tauri v2 Build Audit — Conflux Home

**Date:** 2026-03-24
**Auditor:** Automated subagent review
**Project:** `/home/calo/.openclaw/workspace/conflux-home`
**Goal:** Identify issues that could cause a white screen on `cargo tauri dev`

---

## File-by-File Review

### 1. `src-tauri/tauri.conf.json`

**Issues Found:**

| Severity | Issue |
|----------|-------|
| ⚠️ WARNING | CSP `script-src` lacks `'unsafe-eval'`. Vite dev mode HMR and React Fast Refresh inject code via eval-like mechanisms. Without `'unsafe-eval'`, scripts may fail to load silently, causing a white screen. |
| ⚠️ WARNING | `dangerousDisableAssetCspModification: true` disables Tauri's automatic nonce injection for scripts/styles. Combined with CSP, this means ALL inline scripts must match `'unsafe-inline'`. This is fragile — any Vite-injected script that doesn't match will silently fail. |
| ℹ️ INFO | `$schema` URL points to `nicehash/tauri-schema` (a community fork). Official is `https://raw.githubusercontent.com/nicedayzhu/tauri-schema/v2/schema.json` or use the npm package. Not a functional issue. |
| ✅ CLEAN | Uses `app.windows` (correct v2 syntax, not `tauri.windows`) |
| ✅ CLEAN | Uses `devUrl` (correct v2 syntax, not `devPath`) |
| ✅ CLEAN | `beforeDevCommand: "npm run dev"` is correct |
| ✅ CLEAN | `beforeBuildCommand: "npm run build"` is correct |
| ✅ CLEAN | `frontendDist: "../dist"` matches vite `outDir` |
| ✅ CLEAN | `connect-src` allows `localhost:18789` for backend communication |
| ✅ CLEAN | `style-src 'self' 'unsafe-inline'` is sufficient for Vite CSS |

**Recommended fix for CSP:**
```
"default-src 'self'; connect-src 'self' http://localhost:18789 ws://localhost:18789; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'"
```
Or better: remove `dangerousDisableAssetCspModification: true` and let Tauri inject nonces.

---

### 2. `src-tauri/Cargo.toml`

**Issues Found:**

| Severity | Issue |
|----------|-------|
| ℹ️ INFO | `package.name = "app"` is generic but not a build issue. Library crate is `app_lib` (matches `[lib] name`). |
| ℹ️ INFO | `rust-version = "1.77.2"` — verify this matches your installed Rust toolchain. |
| ✅ CLEAN | `tauri = "2.10.3"` — consistent with v2 |
| ✅ CLEAN | `tauri-build = "2.5.6"` — consistent |
| ✅ CLEAN | All plugins use `"2"` (shell, dialog, fs, log, notification) — correct v2 versions |
| ✅ CLEAN | `crate-type = ["staticlib", "cdylib", "rlib"]` — correct for Tauri v2 (needs staticlib for desktop) |
| ✅ CLEAN | `rusqlite` has `bundled` feature — no system SQLite dependency |
| ✅ CLEAN | `reqwest` uses `rustls-tls` — avoids OpenSSL build issues |

---

### 3. `src-tauri/src/main.rs`

**Issues Found:**

| Severity | Issue |
|----------|-------|
| ✅ CLEAN | Calls `app_lib::run()` — matches `[lib] name = "app_lib"` in Cargo.toml |
| ✅ CLEAN | `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` — standard Windows release fix |

---

### 4. `src-tauri/src/lib.rs`

**Issues Found:**

| Severity | Issue |
|----------|-------|
| ⚠️ WARNING | `pub mod engine;` — the `engine` module directory exists but we cannot verify all referenced types/functions compile. The massive `invoke_handler` list will cause a compile error if **any single command** is missing from `commands.rs`. |
| ✅ CLEAN | All plugins properly initialized with `.plugin()` |
| ✅ CLEAN | `tauri_plugin_notification::init()` is registered — matches Cargo.toml dependency |
| ✅ CLEAN | `.setup()` creates app data dir and initializes engine — proper initialization order |
| ✅ CLEAN | `tauri::generate_handler![]` and `tauri::generate_context!()` — correct v2 macros |
| ✅ CLEAN | `#[cfg_attr(mobile, tauri::mobile_entry_point)]` — correct v2 mobile support |

---

### 5. `src-tauri/src/commands.rs`

**Issues Found:**

| Severity | Issue |
|----------|-------|
| ⚠️ WARNING | Uses `tauri::Emitter` trait (v2 API) — this is correct, but if any code path tries to use `window.emit_all()` (v1 API), it won't compile. The file correctly uses `window.emit()` (v2). |
| ✅ CLEAN | All `#[tauri::command]` functions match the `invoke_handler` declarations in lib.rs |
| ✅ CLEAN | Uses `super::engine` — matches `pub mod engine` in lib.rs |
| ✅ CLEAN | `serde` and `chrono::Datelike` imports are used |
| ✅ CLEAN | No v1 API usage detected (`emit_all`, `AppHandle::emit_all`, etc.) |

---

### 6. `src-tauri/capabilities/default.json`

**Issues Found:**

| Severity | Issue |
|----------|-------|
| ⚠️ WARNING | `fs:allow-scope-home-recursive` is **NOT a valid Tauri v2 permission**. Valid fs permissions include `fs:default`, `fs:allow-read-text-file`, `fs:allow-read-file`, `fs:allow-read-dir`, `fs:allow-exists`, `fs:allow-all`, etc. Scope configuration goes under a `scopes` object, not as a permission name. **This will cause a capabilities validation error at startup**, which could manifest as a white screen. |
| ⚠️ WARNING | `notification` plugin is initialized in lib.rs but no `notification:*` permissions are listed. The `engine_send_notification` command uses `engine.db().emit_event()` directly (not the Tauri notification plugin), so this may not matter functionally — but if any frontend code tries `@tauri-apps/plugin-notification`, it will fail. |
| ℹ️ INFO | `shell:allow-open` — valid, enables `open::that()` in commands.rs |
| ℹ️ INFO | `dialog:allow-save`, `dialog:allow-message` — valid dialog permissions |
| ℹ️ INFO | `fs:default` — grants base read permissions (readTextFile, readFile, readDir, exists, statFile) |
| ℹ️ INFO | `log:default` — enables log plugin |
| ℹ️ INFO | `windows: ["main"]` — matches the default window config |

**Recommended fix — replace `fs:allow-scope-home-recursive`:**
```json
"fs:default",
"fs:allow-read-text-file",
"fs:allow-read-file",
"fs:allow-read-dir",
"fs:allow-exists"
```
If you need broader FS access, add `fs:allow-all` or use scopes in the capabilities.

---

### 7. `index.html`

**Issues Found:**

| Severity | Issue |
|----------|-------|
| ✅ CLEAN | `<div id="root">` — standard React mount point |
| ✅ CLEAN | `<script type="module" src="/src/main.tsx">` — correct for Vite dev mode |
| ✅ CLEAN | No external CDN resources that would be blocked by CSP |
| ✅ CLEAN | `favicon` uses `/vite.svg` — relative, will resolve from dev server or dist |

---

### 8. `vite.config.ts`

**Issues Found:**

| Severity | Issue |
|----------|-------|
| ⚠️ WARNING | `base: './'` uses relative paths. This is correct for Tauri production builds (loading from `tauri://` protocol), but during dev mode with `devUrl: "http://localhost:5173"`, `'./'` should still work. However, if there's a mismatch between how assets resolve, it could cause 404s. Generally safe. |
| ✅ CLEAN | `server.port: 5173` matches `devUrl` port in tauri.conf.json |
| ✅ CLEAN | `server.strictPort: true` — prevents silent port fallback |
| ✅ CLEAN | `build.outDir: 'dist'` matches `frontendDist: "../dist"` |
| ✅ CLEAN | `emptyOutDir: true` — clean builds |
| ✅ CLEAN | `@vitejs/plugin-react` — standard React support |

---

### 9. `package.json`

**Issues Found:**

| Severity | Issue |
|----------|-------|
| ℹ️ INFO | `react: "^19.1.0"` — React 19 is very new. Verify all dependencies support it (especially `@vitejs/plugin-react` and `marked`). |
| ✅ CLEAN | `@tauri-apps/api: "^2.10.1"` — correct v2 |
| ✅ CLEAN | `@tauri-apps/cli: "^2.10.1"` — correct v2 |
| ✅ CLEAN | `@tauri-apps/plugin-notification: "^2.3.3"` — correct v2 |
| ✅ CLEAN | `type: "module"` — ESM, needed for Vite |
| ✅ CLEAN | Scripts: `dev`, `build`, `preview`, `tauri` — all standard |

---

## Summary

### 🔴 CRITICAL Issues (will cause white screen or build failure)

| # | File | Issue |
|---|------|-------|
| 1 | `capabilities/default.json` | **`fs:allow-scope-home-recursive` is not a valid Tauri v2 permission.** This will cause a capabilities validation error on startup, potentially resulting in a white screen. Replace with valid fs permissions. |

### 🟡 WARNING Issues (may cause runtime problems)

| # | File | Issue |
|---|------|-------|
| 2 | `tauri.conf.json` | CSP `script-src` lacks `'unsafe-eval'`. Vite dev mode may need eval for HMR. Add `'unsafe-eval'` or remove `dangerousDisableAssetCspModification`. |
| 3 | `tauri.conf.json` | `dangerousDisableAssetCspModification: true` disables automatic nonce injection, making CSP enforcement fragile. |
| 4 | `capabilities/default.json` | No `notification:*` permissions listed, though notification plugin is initialized. May cause issues if frontend uses the notification plugin directly. |

### ℹ️ INFO Items (not blocking)

| # | File | Issue |
|---|------|-------|
| 5 | `tauri.conf.json` | Schema URL is a community fork (cosmetic) |
| 6 | `Cargo.toml` | Generic package name `app` (cosmetic) |
| 7 | `package.json` | React 19 is bleeding-edge (verify compat) |

---

## Root Cause Analysis for White Screen

The **most likely cause** of a white screen on `cargo tauri dev` is:

1. **Invalid capabilities permission** (`fs:allow-scope-home-recursive`) causes Tauri to reject the capability file, preventing the app from initializing with any permissions. This can silently fail.

2. **CSP blocking scripts** — if `dangerousDisableAssetCspModification` prevents nonce injection AND `'unsafe-eval'` is missing, Vite-injected scripts may be blocked by CSP, causing a white screen with no visible errors.

**Recommended immediate fix:**
```bash
# Fix capabilities
# Replace "fs:allow-scope-home-recursive" with valid permissions

# Fix CSP in tauri.conf.json
# Option A: Add 'unsafe-eval' to script-src
# Option B: Remove dangerousDisableAssetCspModification and let Tauri handle nonces
```
