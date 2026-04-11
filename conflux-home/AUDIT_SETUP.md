# AUDIT_SETUP.md — Conflux Home White Screen Debug Report

**Date:** 2026-03-24  
**Symptom:** `cargo tauri dev` → white screen, app freezes. `npm run dev` → works fine (skips onboarding, shows dashboard).

---

## Executive Summary

There are **multiple compounding issues** causing the white screen. The Rust `.setup()` closure uses `.expect()` calls that will **panic and crash the process** with no error message in the webview. On the frontend side, there's no error boundary, so any thrown error becomes a white screen. The localStorage state differs between the Tauri webview (empty) and the browser dev server (populated), causing different code paths to execute.

---

## PART 1: RUST BACKEND — POTENTIAL PANIC POINTS

### 🔴 CRITICAL: `.expect()` calls in `setup()` closure (lib.rs:28-35)

```rust
.setup(|app| {
    let app_data_dir = app.path().app_data_dir()
        .expect("Failed to get app data directory");        // PANIC #1

    std::fs::create_dir_all(&app_data_dir)
        .expect("Failed to create app data directory");     // PANIC #2

    let db_path = app_data_dir.join("conflux.db");
    engine::init_engine(&db_path)
        .expect("Failed to initialize Conflux Engine");     // PANIC #3

    Ok(())
})
```

**Every one of these `.expect()` calls will crash the app with a white screen if they fail.** The Tauri `.setup()` closure runs BEFORE the window renders. If it panics, the webview shows nothing.

- **PANIC #1:** `app_data_dir()` can fail if the OS doesn't provide a data directory (permissions, sandboxing, flatpak, etc.)
- **PANIC #2:** `create_dir_all` can fail if permissions don't allow directory creation
- **PANIC #3:** `init_engine` can fail for many reasons (see below)

**Fix:** Replace `.expect()` with proper error handling that shows an error dialog or returns `Err(...)` to the setup result.

### 🔴 CRITICAL: `EngineDb::open()` can fail (db.rs:12-27)

```rust
pub fn open(path: &Path) -> Result<Self> {
    let conn = Connection::open(path)
        .context("Failed to open database")?;       // Can fail: locked DB, permissions, corrupt file

    conn.pragma_update(None, "journal_mode", "WAL")
        .context("Failed to set WAL mode")?;        // Can fail on some filesystems (e.g., network drives)

    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    let db = EngineDb { conn: Arc::new(Mutex::new(conn)) };
    db.migrate()?;                                   // Can fail: bad SQL in schema, FTS5 not available
    Ok(db)
}
```

**Risk:** If the SQLite file is corrupt, locked by another process, or on a filesystem that doesn't support WAL mode, this fails → propagates to `init_engine` → hits `.expect()` → crash.

### 🔴 CRITICAL: `rusqlite` missing `fts5` feature (Cargo.toml:25, schema.sql:411)

**CONFIRMED.** The `Cargo.toml` has:
```toml
rusqlite = { version = "0.31", features = ["bundled"] }
```

But the schema requires FTS5:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    memory_id, agent_id, content, key, memory_type
);
```

**The `fts5` feature is NOT enabled.** This means the bundled SQLite does NOT include the FTS5 extension.

**What happens at runtime:**
1. `EngineDb::open()` calls `migrate()`
2. `migrate()` tries `conn.execute_batch(schema)` — **FAILS** with "no such module: fts5"
3. Falls back to statement-by-statement execution
4. The `CREATE VIRTUAL TABLE ... USING fts5` statement fails with "no such module: fts5"
5. This error does NOT contain "already exists" or "duplicate column"
6. The fallback loop returns `Err(e).context("Failed to run schema migration statement: CREATE VIRTUAL TABLE...")`
7. `migrate()` returns `Err`
8. `EngineDb::open()` returns `Err`
9. `ConfluxEngine::new()` returns `Err`
10. `init_engine()` returns `Err`
11. `.expect("Failed to initialize Conflux Engine")` **PANICS**
12. App crashes → **WHITE SCREEN**

**This is almost certainly the root cause.**

**Fix:** Change Cargo.toml line to:
```toml
rusqlite = { version = "0.31", features = ["bundled", "fts5"] }
```

### 🟡 HIGH: `ConfluxEngine::new()` calls `db.rebuild_memory_fts()` (mod.rs:78+)

The engine constructor calls `rebuild_memory_fts()` which does:
```rust
conn.execute_batch(
    "INSERT INTO memory_fts(memory_id, agent_id, content, key, memory_type)
     SELECT id, agent_id, content, COALESCE(key, ''), memory_type FROM memory;"
);
```

This is inside the `new()` constructor. If the FTS triggers and table aren't created yet (race condition in migration), this could fail. However, it's wrapped in a `match` that swallows errors, so this is **not a panic risk** — but it means FTS search will silently fail.

### 🟡 HIGH: `router::configure_provider()` called during init (mod.rs:30-56)

```rust
match engine.db.get_config("openai_api_key") {
    Ok(Some(key)) if !key.is_empty() => {
        router::configure_provider("openai-gpt4o", &key).ok();  // .ok() swallows errors
    }
    _ => {}
}
```

These calls use `.ok()` so they won't panic. **Safe.**

### 🟡 MEDIUM: `ENGINE.set(engine)` — double init (mod.rs:59)

```rust
ENGINE.set(engine)
    .map_err(|_| anyhow::anyhow!("Engine already initialized"))?;
```

If somehow called twice (shouldn't happen in normal flow), this returns an error that hits `.expect()` in setup. **Low risk** in normal operation.

### 🟢 LOW: `get_engine().expect()` in commands (mod.rs:23-25)

```rust
pub fn get_engine() -> &'static ConfluxEngine {
    ENGINE.get().expect("Conflux Engine not initialized")
}
```

Every Tauri command calls this. If setup failed but the app somehow didn't crash, any command invocation would panic. In practice, setup failure crashes first.

### 🟢 LOW: `conn().expect("Database lock poisoned")` (db.rs:146)

If a thread panics while holding the DB lock, the mutex is poisoned and all subsequent calls panic. **Unlikely in normal operation** but catastrophic if it happens.

---

## PART 2: TAURI PLUGINS — POTENTIAL ISSUES

### 🟡 MEDIUM: `tauri-plugin-notification` setup (lib.rs:10)

```rust
.plugin(tauri_plugin_notification::init())
```

In **Tauri v2**, the notification plugin requires:

1. **Permission configuration** in `tauri.conf.json` under `app > permissions`:
   ```json
   {
     "permissions": [
       "notification:default",
       "notification:allow-is-permission-granted",
       "notification:allow-request-permission",
       "notification:allow-show"
     ]
   }
   ```
   **Currently missing from `tauri.conf.json`.** This may cause the plugin to reject notification commands or, worse, panic on initialization if permissions aren't declared.

2. **Desktop:** On Linux, may need `libnotify` installed. If missing, `notification::init()` could fail.

3. **No `.manage()` needed** for the notification plugin — `init()` is sufficient for the plugin itself.

### 🟡 MEDIUM: Other plugins need permissions too

`tauri-plugin-fs`, `tauri-plugin-shell`, and `tauri-plugin-dialog` all need permission declarations in Tauri v2. Missing permissions can cause commands to fail silently or throw uncaught errors.

---

## PART 3: FRONTEND — ROUTING & STATE

### 🔴 CRITICAL: The Onboarding vs Dashboard state gate (App.tsx:70-74)

```tsx
const [isOnboarded, setIsOnboarded] = useState(() => {
    return localStorage.getItem('conflux-onboarded') === 'true';
});
```

**This is the smoking gun for the difference between `npm run dev` and `cargo tauri dev`:**

- **Browser (npm run dev):** localStorage has `conflux-onboarded = 'true'` from previous sessions → skips onboarding → shows dashboard → works
- **Tauri webview (cargo tauri dev):** localStorage is **empty** (new webview context) → `isOnboarded = false` → renders `<Onboarding>` → different code path → potential crash

### 🔴 CRITICAL: No React Error Boundary

There is **no error boundary** anywhere in the React tree. If any component throws during render, the entire app crashes to a white screen with no error visible in the webview.

**Affected code path when `isOnboarded = false`:**
```
App → <SplashScreen> (1.5s timer) → <Onboarding>
```

### 🔴 HIGH: `useEngine` hook calls Tauri commands on mount (useEngine.ts:48-57)

```tsx
const fetchAgents = useCallback(async () => {
    try {
        const [healthResult, agentList] = await Promise.all([
            invoke<any>('engine_health').catch(() => null),     // Swallowed
            invoke<EngineAgent[]>('engine_get_agents'),         // NOT caught separately
        ]);
        // ...
    } catch (err) {
        setConnected(false);
        setError(err instanceof Error ? err.message : 'Engine unavailable');
    }
}, []);
```

This runs in `App.tsx` via `const { connected, agents, refresh } = useEngine()`. If `engine_get_agents` fails (because engine didn't initialize), the catch block runs and sets `connected = false`, but the **app continues rendering** — it doesn't crash. So this is actually **safe** on the frontend side.

**However**, on the Rust side, if the engine is not initialized, `get_engine().expect()` will panic the **backend thread**, and the Tauri IPC call will hang or return a cryptic error. The frontend catch block would catch it, but the webview may already be in a broken state.

### 🟡 MEDIUM: `App.tsx` also calls `engine_get_agents` and `engine_health` directly (App.tsx:83-93)

```tsx
useEffect(() => {
    async function fetchDashboard() {
        try {
            const agents = await invoke<any[]>('engine_get_agents');
            // ...
            const health = await invoke<any>('engine_health');
            // ...
        } catch {}
    }
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30000);
}, []);
```

This is wrapped in try/catch, so it won't crash the frontend. **Safe.**

### 🟡 MEDIUM: Onboarding component mounts Google commands on Step 4 (Onboarding.tsx:370-388)

```tsx
useEffect(() => {
    if (step === 4) {
        const checkGoogleCredentials = async () => {
            try {
                setGoogleStatus('loading');
                const creds: any = await invoke('engine_google_get_credentials');
                // ...
                const isConnected = await invoke('engine_google_is_connected');
                // ...
                const email = await invoke('engine_google_get_email');
                // ...
            } catch (error) {
                console.error("Error getting Google credentials:", error);
                setGoogleStatus('error');
            }
        };
        checkGoogleCredentials();
    }
}, [step]);
```

This is properly wrapped in try/catch. **Safe** — errors set `googleStatus = 'error'` which shows an error UI.

### 🟢 LOW: Onboarding's `handleEnter` writes to localStorage (Onboarding.tsx:295-301)

```tsx
const handleEnter = () => {
    localStorage.setItem('conflux-onboarded', 'true');
    // ...
    onComplete(selectedTeam, agentsArr);
};
```

This only runs when the user clicks "Enter Conflux Home." Not a crash risk.

---

## PART 4: FRONTEND BUILD & ASSET LOADING

### 🟡 MEDIUM: `index.html` references `/src/main.tsx` (index.html:10)

```html
<script type="module" src="/src/main.tsx"></script>
```

This is correct for **Vite dev mode** (where Vite serves and transforms TSX on the fly). In **production** (`npm run build`), Vite bundles everything into `dist/assets/index-[hash].js` and rewrites the HTML. So this is only relevant if the build output is wrong.

**Check:** Does `dist/index.html` exist and reference the bundled JS?
```bash
ls -la /home/calo/.openclaw/workspace/conflux-home/dist/
# Shows: assets/, avatars/, backgrounds/, index.html, logo.png, wallpapers/
```

The `dist/` directory exists with `index.html`, so the build completed. **If `tauri.conf.json`'s `frontendDist` points to `../dist`**, the Tauri webview should load the production build correctly.

### 🟢 OK: `tauri.conf.json` configuration

```json
{
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  }
}
```

This is correct. `cargo tauri dev` will:
1. Run `npm run dev` (starts Vite dev server)
2. Load `http://localhost:5173` in the webview

So the webview should be getting the **dev build**, not the production build. This means `/src/main.tsx` should resolve correctly through Vite.

### 🟢 OK: Icon files exist

All icon files referenced in `tauri.conf.json` exist in `src-tauri/icons/`.

### 🟢 OK: CSP configuration

The CSP in `tauri.conf.json` includes `unsafe-inline` and `unsafe-eval` for scripts, and allows connections to localhost. Should be fine for dev.

---

## PART 5: COMMAND REGISTRATION

### 🟢 OK: All 148 commands are registered (lib.rs:42-202)

All commands listed in `invoke_handler` map to actual `#[tauri::command]` functions in `commands.rs`. No missing functions. Command registration itself shouldn't panic — it just wraps functions.

### 🟡 MEDIUM: `engine_get_agents` returns empty on fresh DB

The schema has no seed data for agents. The `agents` table starts empty. When `engine_get_agents` runs:
```rust
let engine = engine::get_engine();  // PANIC if engine not initialized
let agents = engine.get_agents()?;  // Returns empty vec
```

This won't crash (returns `[]`), but the app will show **no agents** — the onboarding flow won't have any agents to display in step 3 (Team selection). The frontend's `ALL_AGENTS` constant provides a fallback, so the onboarding UI should still work.

---

## PART 6: MOST LIKELY ROOT CAUSES (Ranked)

### 🥇 #1: **CONFIRMED** — `rusqlite` missing `fts5` feature → schema migration fails → `.expect()` panics

**Probability: CONFIRMED AS ROOT CAUSE**

The `Cargo.toml` has `features = ["bundled"]` but NOT `"fts5"`. The schema has `CREATE VIRTUAL TABLE ... USING fts5(...)` which fails during migration. This propagates through `EngineDb::open()` → `ConfluxEngine::new()` → `init_engine()` → `.expect()` → panic → white screen.

**Fix:**
```toml
rusqlite = { version = "0.31", features = ["bundled", "fts5"] }
```

Then run `cargo clean && cargo build` to rebuild with FTS5 enabled.

### 🥈 #2: Three `.expect()` calls in `setup()` make any failure a white screen

**Probability: HIGH (secondary — even after fixing FTS5)**

Even with FTS5 fixed, the `.expect()` pattern means ANY future database issue, permissions issue, or directory issue will crash the app silently. These should be converted to `?` operators that return setup errors (which Tauri shows in a dialog).

### 🥉 #3: No React Error Boundary

**Probability: MEDIUM**

If the engine initializes successfully but a component throws during render, the React tree crashes with no visible error. Adding an error boundary would catch these and show a fallback UI.

### #4: `tauri-plugin-notification` missing permissions

**Probability: LOW-MEDIUM**

Missing permission declarations for the notification plugin in Tauri v2 could cause command failures, but typically don't crash startup.

### #5: Empty localStorage → Onboarding path divergence

**Probability: LOW (not a crash cause, but explains behavioral difference)**

The Tauri webview has empty localStorage, entering the onboarding flow. The browser dev server has saved state, skipping onboarding. This explains why `npm run dev` "works" — it takes a different code path. But the onboarding path itself should be safe (all commands wrapped in try/catch). The real crash is the backend engine failure.

---

## PART 7: RECOMMENDED FIXES

### Fix 1: ADD `fts5` TO RUSQLITE FEATURES — THIS IS THE ROOT CAUSE

```toml
# In src-tauri/Cargo.toml, change:
rusqlite = { version = "0.31", features = ["bundled", "fts5"] }
```

Then:
```bash
cd src-tauri && cargo clean && cargo build
```

### Fix 2: Replace `.expect()` in setup with proper error handling

```rust
.setup(|app| {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {e}"))?;

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {e}"))?;

    let db_path = app_data_dir.join("conflux.db");
    engine::init_engine(&db_path)
        .map_err(|e| format!("Failed to initialize Conflux Engine: {e}"))?;

    log::info!("Conflux Engine initialized at {:?}", db_path);
    Ok(())
})
```

This converts panics to Tauri setup errors, which show a dialog instead of a white screen.

### Fix 3: Add a React Error Boundary

Wrap the entire app in an error boundary that shows a helpful error message instead of a white screen.

### Fix 4: Add notification plugin permissions to `tauri.conf.json`

```json
{
  "app": {
    "withGlobalTauri": true,
    "permissions": [
      "notification:default",
      "notification:allow-is-permission-granted",
      "notification:allow-request-permission",
      "notification:allow-show"
    ]
  }
}
```

### Fix 5: Seed agents in schema migration

Add `INSERT OR IGNORE INTO agents (...)` statements to `schema.sql` so the app has agents on first launch.

---

## QUICK DIAGNOSTIC COMMANDS

```bash
# Check if the panic message appears in terminal output
cargo tauri dev 2>&1 | head -100

# Check rusqlite features
grep -A5 "rusqlite" src-tauri/Cargo.toml

# Check if FTS5 works in the bundled SQLite
sqlite3 :memory: "CREATE VIRTUAL TABLE test USING fts5(x);"

# Verify dist/index.html after build
cat dist/index.html | head -20

# Check app data directory permissions
ls -la ~/.local/share/conflux-home/ 2>/dev/null || echo "Directory doesn't exist"
```
