# Auth Wiring Technical Summary

## Rust Changes

### 1. src-tauri/src/budget.rs
- All 9 budget functions updated to require `member_id: Option<String>`
- Fallback to `get_user_id()` which now returns `Result<String, String>` instead of defaulting to "default"
- `get_user_id()` returns error "User not authenticated" if no user ID is configured

### 2. src-tauri/src/commands.rs
- `get_supabase_user_id()` updated to use `unwrap_or_default()` instead of "default"
- `home_chat()`, `home_diagnose_problem()`, `home_log_problem_natural()` accept `user_id` parameter

### 3. src-tauri/src/engine/google.rs
- Google token functions updated to accept `user_id` parameter
- SQL queries changed from `id = 'default'` to `id = ?` with user_id parameter

### 4. src-tauri/src/engine/runtime.rs
- Updated error handling when user_id is empty
- Returns explicit error message "No user session found. Please sign in."

## Frontend Changes

### 1. hooks/useHomeChat.ts
- Added `useAuthContext()` hook
- Pass `user.id` to Tauri commands instead of hardcoded 'default'

### 2. hooks/useHomeDiagnosis.ts
- Added `useAuthContext()` hook
- Pass `user.id` to Tauri commands instead of hardcoded 'default'

### 3. hooks/useHomeHealth.ts
- Added `useAuthContext()` hook
- Pass `user.id` to Tauri commands instead of hardcoded 'default'

### 4. hooks/useEngineChat.ts
- Updated to use `userId ?? user?.id` pattern
- Ensures `userId` from AuthContext is used as fallback

## Verification

### Rust Compilation
```
cd /home/calo/.openclaw/workspace/conflux-home/src-tauri
cargo build --release
```
Result: ✅ Success (21 warnings, 0 errors)

### Remaining 'default' References
- `src-tauri/src/engine/cloud.rs:437`: `costs.get("default")` — cost tier fallback (NOT user ID)
- `src-tauri/src/lib.rs:101`: `["default", ...]` — xdg-mime registration (NOT user ID)

### Git History
```
git log v0.1.49 --oneline | head -1
3327a70 fix: auth wiring - use user.id from AuthContext in useEngineChat
```

Tag v0.1.49 points to commit that completes auth wiring.

Summary:
- All hardcoded 'default' user IDs have been removed or verified as safe.
- AuthContext is now the source of truth for user IDs.
- No 'default' user IDs remain in Rust backend (verified).