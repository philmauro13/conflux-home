# Debugging Guide: Conflux Presence State Events

## Common Issues

### 1. State Events Not Emitted

**Symptom:** Fairy doesn't change mode during voice chat

**Debug Steps:**
1. Check console for `[ConfluxOrbit] conflux:state event received` log
2. Verify state value in event: `event.state`
3. Check Rust logs for state emission errors
4. Verify Tauri commands are registered in `lib.rs`

**Fix:** Ensure state emission code is executed:
```rust
let _ = window.emit("conflux:state", serde_json::json!({
    "state": "Listening",
    "timestamp": chrono::Utc::now().to_rfc3339(),
}));
```

### 2. Session ID Errors

**Symptom:** Foreign key errors in database

**Debug Steps:**
1. Check console for session creation logs
2. Verify `engine_create_session` is called
3. Check `engine_get_sessions` returns valid sessions
4. Verify user_id is set in Supabase config

**Fix:** Ensure session management in `App.tsx`:
```typescript
const sessions = await invoke('engine_get_sessions', { limit: 10 });
const voiceSession = sessions.find((s: any) => s.agent_id === 'conflux');
```

### 3. Fairy Animation Not Syncing

**Symptom:** Fairy mode doesn't update with state changes

**Debug Steps:**
1. Check console for state transition logs
2. Verify `conflux.setMode()` is called with correct parameters
3. Check `ConfluxOrbit.tsx` event handler is attached
4. Verify event listener cleanup doesn't remove handler prematurely

**Fix:** Ensure event handler is properly attached:
```typescript
window.addEventListener('conflux:state', handleStateChange);
return () => window.removeEventListener('conflux:state', handleStateChange);
```

### 4. TTS Audio Not Playing

**Symptom:** No audio playback after voice chat

**Debug Steps:**
1. Check console for TTS audio event logs
2. Verify Web Audio API context is created
3. Check MP3 decoding succeeds
4. Verify audio source connects to destination

**Fix:** Ensure audio context is initialized:
```typescript
if (!audioContextRef.current) {
  audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
}
```

## Debugging Commands

### Check Rust Compilation
```bash
cd /home/calo/.openclaw/workspace/conflux-home/src-tauri
cargo check
```

### Check TypeScript Compilation
```bash
cd /home/calo/.openclaw/workspace/conflux-home
npx tsc --noEmit
```

### Run App with Logging
```bash
cd /home/calo/.openclaw/workspace/conflux-home
cargo tauri dev
```

### Monitor Console Logs
1. Open DevTools in app window (Ctrl+Shift+I)
2. Look for `[ConfluxOrbit]` logs
3. Check for state transition messages
4. Verify no errors in console

## Log Messages to Watch For

### Successful Flow
```
[ConfluxOrbit] conflux:state event received: {"state":"Listening","timestamp":"..."}
[ConfluxOrbit] State transition: Listening
[ConfluxOrbit] conflux:state event received: {"state":"Thinking","timestamp":"..."}
[ConfluxOrbit] State transition: Thinking
[ConfluxOrbit] conflux:state event received: {"state":"Speaking","timestamp":"..."}
[ConfluxOrbit] State transition: Speaking
[ConfluxOrbit] conflux:state event received: {"state":"Idle","timestamp":"..."}
[ConfluxOrbit] State transition: Idle
```

### Error Cases
```
[ConfluxOrbit] State transition: Error
[Voice] Chat failed: ...
[STT] Failed to start ElevenLabs stream: ...
[Engine] Credit charge failed: ...
```

## Testing Checklist

### Quick Test
1. Start app with `cargo tauri dev`
2. Press spacebar (PTT)
3. Speak into microphone
4. Verify fairy shows "Listening"
5. Wait for LLM response
6. Verify fairy shows "Thinking"
7. Verify fairy shows "Speaking" during TTS
8. Verify fairy returns to "Idle" after playback

### Comprehensive Test
1. Test multiple consecutive voice chats
2. Test with network interruptions
3. Test with no microphone
4. Test with invalid API keys
5. Test session persistence across app restarts
6. Test state transitions with multiple users

## Common Fixes

### State Event Not Emitted
- Check window reference is valid
- Verify event name is `"conflux:state"`
- Check JSON serialization succeeds
- Verify no errors in Rust logs

### Session Not Created
- Check Supabase user_id is set
- Verify `engine_create_session` command is registered
- Check database schema has sessions table
- Verify foreign key constraints

### Fairy Mode Not Updating
- Check event listener is attached
- Verify `setMode()` is called with correct parameters
- Check `ConfluxOrbit` component is mounted
- Verify no React errors in console

## Performance Tips

1. **Debounce Rapid State Changes**
   - State events can be frequent
   - Frontend should debounce if needed
   - Use `setTimeout` or `requestAnimationFrame`

2. **Avoid Memory Leaks**
   - Clean up event listeners on unmount
   - Close audio contexts when done
   - Dispose of Tauri listeners properly

3. **Optimize Audio Playback**
   - Reuse AudioContext instance
   - Decode audio in background thread
   - Buffer audio data for smooth playback
