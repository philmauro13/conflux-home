# Voice Module: Phase C Integration

## State Transitions Added

### 1. Recording Start (`start_recording`)
**Location:** `src-tauri/src/voice/capture.rs` line ~110

Emits `Listening` state when push-to-talk starts:
```rust
let _ = window.emit("conflux:state", serde_json::json!({
    "state": "Listening",
    "timestamp": chrono::Utc::now().to_rfc3339(),
}));
```

### 2. Recording Stop (`stop_recording`)
**Location:** `src-tauri/src/voice/capture.rs` line ~225

Emits `Idle` state when recording stops:
```rust
let _ = window.emit("conflux:state", serde_json::json!({
    "state": "Idle",
    "timestamp": chrono::Utc::now().to_rfc3339(),
}));
```

## ✅ TTS Speaking State

### Completed: `src-tauri/src/voice/synth.rs`
Added state emission in `stream_tts` function:

```rust
// Emit Speaking state before playing audio
let _ = window.emit("conflux:state", serde_json::json!({
    "state": "Speaking",
    "timestamp": chrono::Utc::now().to_rfc3339(),
}));

// ... TTS generation and playback ...

// Emit Idle state after playback completes
let _ = window.emit("conflux:state", serde_json::json!({
    "state": "Idle",
    "timestamp": chrono::Utc::now().to_rfc3339(),
}));
```

## Frontend Integration

### ConfluxOrbit.tsx
Need to handle `conflux:state` events:

```typescript
useEffect(() => {
  const handleStateChange = (event: CustomEvent) => {
    const { state, timestamp, ...metadata } = event.detail;
    
    switch (state) {
      case 'Listening':
        setFairyMode('listening');
        break;
      case 'Thinking':
        setFairyMode('thinking');
        break;
      case 'Speaking':
        setFairyMode('speaking');
        break;
      case 'Idle':
        setFairyMode('idle');
        break;
      case 'Error':
        setFairyMode('error');
        break;
    }
  };

  window.addEventListener('conflux:state', handleStateChange);
  return () => window.removeEventListener('conflux:state', handleStateChange);
}, []);
```

## State Flow Diagram

```
User Presses Spacebar (PTT)
    ↓
[start_recording] → Emit Listening State
    ↓
[Audio Capture] → Continuous audio to ElevenLabs
    ↓
[STT Transcript] → Text to engine
    ↓
[engine_chat] → Emit Thinking State
    ↓
[LLM Response] → Text back
    ↓
[voice_synthesize] → Emit Speaking State
    ↓
[TTS Audio Playback] → Fairy animates speech
    ↓
[Playback Complete] → Emit Idle State
```

## Verification Steps

1. ✅ Rust compilation passes (`cargo check`)
2. ✅ Voice capture emits Listening state on start
3. ✅ Voice capture emits Idle state on stop
4. ✅ TTS synth emits Speaking state (and Idle after)
5. ⏳ Frontend handles conflux:state events (pending)
6. ⏳ Fairy animation syncs with state changes (pending)

## Files Modified

- `src-tauri/src/voice/capture.rs` — Added state emissions
- `src-tauri/src/engine/mod.rs` — Added state_events module

## Files to Modify Next

- `src-tauri/src/voice/synth.rs` — Add Speaking state emission
- `src/components/ConfluxOrbit.tsx` — Handle state events
