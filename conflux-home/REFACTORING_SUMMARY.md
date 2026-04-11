# Cloud Router Refactoring Summary

## Task: Remove Provider API Keys from Client

All provider API calls now route through the cloud router at `https://theconflux.com/v1/chat/completions`.

---

## Subtasks Completed

### 030-a: Add cloud proxy mode to engine ✓

**Changes to `src-tauri/src/engine/cloud.rs`:**

- Added `cloud_chat()` - Non-streaming chat completion via cloud router
- Added `cloud_chat_stream()` - Streaming chat completion via cloud router
- Added `cloud_get_models()` - Fetch available models from cloud router
- Added `CloudModel` struct for model metadata

**Key features:**
- Uses Supabase JWT from `get_auth_token()` for authorization
- Returns OpenAI-compatible `ModelResponse` format
- Handles streaming SSE responses
- Proper error handling for 401, 402, 429, 503 status codes

### 030-b: Wire engine.chat() to use cloud proxy ✓

**Changes to `src-tauri/src/engine/runtime.rs`:**

- Updated `process_turn()` to call `cloud::cloud_chat()` instead of `router::chat()`
- Updated `process_turn_stream()` to call `cloud::cloud_chat_stream()`
- Tool-calling loop still works (passes tools parameter to cloud router)

**Changes to `src-tauri/src/engine/mod.rs`:**

- Updated `chat()` and `chat_stream()` methods to use cloud proxy
- Updated `get_available_models()` to call `cloud_get_models()`
- Updated `test_provider()` to use `cloud_chat()` directly

### 030-c: Remove provider API keys from engine ✓

**Changes to `src-tauri/src/engine/router.rs`:**

- Removed `resolve_key()` function (was loading API keys from env)
- Removed `apply_auth()` calls in adapter functions
- Removed `builtin_providers()` provider list (moved server-side)
- Removed `get_providers_for_tier()` (returns empty list)
- Marked all adapter functions (`send_openai_chat`, `send_anthropic_chat`, etc.) as `#[allow(dead_code)]`
- Simplified `chat()` and `chat_stream()` to delegate to `cloud::cloud_chat()`

### 030-d: Remove .env files with provider keys ✓

**Verified the following .env files have provider keys removed:**

- `/home/calo/.openclaw/workspace/conflux-home/.env`
- `/home/calo/.openclaw/workspace/conflux-home/.env.local`
- `/home/calo/.openclaw/workspace/conflux-home/src-tauri/.env`

**Remaining keys (not for inference):**
- Stripe API keys (billing purposes)
- Supabase URL + anon key (public by design)
- Google OAuth credentials
- Studio API keys (Replicate, ElevenLabs - for Studio features)

### 030-e: Update Settings UI for cloud-only mode ✓

**Changes to `src-tauri/src/commands.rs`:**

- Updated `engine_get_providers()` to return models from cloud router
- Updated `engine_test_provider()` to use cloud router directly
- Updated all `router::chat()` calls in commands to use `cloud::cloud_chat()`

**Provider management functions removed:**
- `engine_get_openai_key_masked()` - No longer needed
- `engine_get_anthropic_key_masked()` - No longer needed
- `engine_update_provider()` - No longer needed

---

## Architecture Changes

### Before (Direct Provider Access)
```
Client → Provider API (with API keys stored client-side)
```

### After (Cloud Router)
```
Client → Cloud Router (https://theconflux.com/v1/chat/completions) → Provider APIs
```

### Benefits
1. **Security**: No API keys in client code or .env files
2. **Control**: Cloud router can enforce rate limits, quotas, billing
3. **Simplicity**: Client doesn't need to manage provider-specific auth
4. **Flexibility**: Router can change providers without client updates

---

## Build Status

✅ **Compilation successful**
- All errors resolved
- Warnings are expected (unused code from old adapter functions)

```bash
cd /home/calo/.openclaw/workspace/conflux-home/src-tauri
cargo build  # Successfully compiled
```

---

## Notes

- The `router.rs` file still contains old adapter code (marked `#[allow(dead_code)]`) for compatibility
- Tool-calling loop in `runtime.rs` continues to work with cloud router
- Streaming responses are fully supported via SSE
- Error messages from cloud router are properly surfaced to the user
