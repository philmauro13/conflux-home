# Debug Test Summary

## Changes Made

### 1. Added Debug Logging to Idle Emission
**File:** `src-tauri/src/voice/synth.rs`

```rust
log::info!("[TTS] Emitting Idle state after playback complete");
let _ = window.emit("conflux:state", serde_json::json!({
    "state": "Idle",
    "timestamp": chrono::Utc::now().to_rfc3339(),
    "source": "synth.rs",  // NEW: Added source marker
}));
```

### 2. Added Debug Logging to State Manager
**File:** `src-tauri/src/engine/state_events.rs`

```rust
pub fn transition(&mut self, new_state: ConfluxState) -> Result<(), String> {
    // ...
    if let Some(window) = &self.window {
        log::info!(\"[StateManager] Transitioning to {:?}\", new_state);
        // emit event
    }
    // ...
}
```

### 3. Enhanced Console Logging
**File:** `src/components/ConfluxOrbit.tsx`

```typescript
console.log('[ConfluxOrbit] State transition:', stateEvent.state, 'Source:', stateEvent.source || 'unknown');
```

## What to Look For

### Expected Console Logs (After Fix)

When speaking a query, you should see:

```
[Log] [ConfluxOrbit] PTT End - keeping listen mode during transcription
[Log] [ConfluxOrbit] conflux:state event received: {...}
[Log] [ConfluxOrbit] State transition: Listening (stays centered)
[Log] [Voice] Transcribing with OpenAI Whisper...
[Log] [ConfluxOrbit] Thinking... (from conflux-thinking event)
[Log] [StateManager] Transitioning to Thinking (from backend)
[Log] [ConfluxOrbit] State transition: Thinking (Source: backend)
[Log] [TTS] Emitting Idle state after playback complete (ONLY when TTS finishes!)
```

### What We DON'T Want to See

```
[Log] [ConfluxOrbit] State transition: Idle (Source: unknown)
```

If you see the Idle state transition BEFORE the Thinking state, that means:
- Either the Idle emission is coming from an unexpected place
- Or there's a race condition where an old Idle event is arriving

### Key Questions

1. **When does the Idle event appear in the console?**
   - BEFORE transcription starts? (BAD - this is the current bug)
   - AFTER TTS playback completes? (GOOD - this is correct)

2. **What does the `source` field say?**
   - `synth.rs` means it's coming from TTS completion (correct)
   - `unknown` or missing means it's coming from somewhere else

3. **Do you see the StateManager log?**
   - `[StateManager] Transitioning to ...` means the state manager is emitting events
   - If you see this with Idle, the state manager is the culprit

## How to Test

1. **Stop the current app** (Ctrl+C in terminal)
2. **Restart with debug logging:**
   ```bash
   cd /home/calo/.openclaw/workspace/conflux-home
   cargo tauri dev
   ```
3. **Open DevTools** (F12 or Ctrl+Shift+I)
4. **Speak a query** and watch the console logs
5. **Share the console output** with me, especially:
   - The sequence of state transitions
   - Any logs with "StateManager" or "synth.rs"
   - The exact timestamps

## Possible Causes

Based on the current investigation, the Idle event might be coming from:

1. **A race condition** - An old Idle emission from a previous TTS call arriving late
2. **The state manager** - Being called with Idle from an unexpected place
3. **A different code path** - Something emitting Idle that we haven't found yet

The debug logging will help us pinpoint exactly where the Idle event is coming from.
