# Phase C: Backend Intelligence Events

## Overview
Implement Rust backend events for internal state triggers (e.g., when the LLM starts thinking, emit a `conflux:state` event).

## Current State
- ✅ ElevenLabs streaming integration complete (STT/TTS)
- ✅ Fairy visual pulses sync with audio
- ✅ Voice chat uses dynamic session management (no more hardcoded session ID)
- ✅ State events infrastructure implemented
- ✅ Thinking state emission in engine runtime

## Implementation Complete

### 1. State Event Types
File: `src-tauri/src/engine/state_events.rs`

Created `ConfluxState` enum:
- `Idle`
- `Listening`
- `Thinking`
- `Speaking`
- `Error { message: String }`

### 2. State Manager
File: `src-tauri/src/engine/state_manager.rs`

Singleton pattern for managing global state:
- `get_state_manager()` - Returns global instance
- Thread-safe via `Mutex`
- Initializes with `Idle` state

### 3. State Events
File: `src-tauri/src/engine/state_events.rs`

- `StateChangeEvent` struct with full context
- `StateManager` with transition methods
- Tauri commands: `conflux_set_state`, `conflux_set_state_with_context`
- Emits `conflux:state` event to frontend

### 4. Integration Points

#### A. Engine Chat Thinking State ✅
File: `src-tauri/src/engine/runtime.rs`

Added state emission before LLM call:
```rust
let state_manager = super::state_manager::get_state_manager();
let _ = state_manager.lock().map(|mut mgr| {
    mgr.transition_with_context(
        ConfluxState::Thinking,
        Some(agent_id.to_string()),
        Some(session_id.to_string()),
        Some(serde_json::json!({
            "model": agent.model_alias,
            "session_message_count": history.len(),
        })),
    )
});
```

#### B. Voice Chat State Transitions
File: `src-tauri/src/voice/capture.rs` (Pending)

Need to add:
- `Listening` state when recording starts
- `Idle` state when recording stops
- `Speaking` state when TTS playback starts

#### C. Frontend State Handler
File: `src/components/ConfluxOrbit.tsx` (Pending)

Need to handle `conflux:state` events:
- Parse state from event detail
- Update fairy animation mode
- Sync with visual pulses

## Event Flow Diagram

```
Voice Input
    ↓
[Capture] → Listening State Event
    ↓
[STT] → Transcript Ready
    ↓
[Engine] → Thinking State Event
    ↓
[LLM] → Response Generated
    ↓
[TTS] → Speaking State Event
    ↓
[Playback] → Idle State Event
```

## Files Created
- `src-tauri/src/engine/state_events.rs`
- `src-tauri/src/engine/state_manager.rs`

## Files Modified
- `src-tauri/src/engine/mod.rs` - Added modules
- `src-tauri/src/engine/runtime.rs` - Added thinking state emission
- `src-tauri/src/lib.rs` - Registered state commands
- `src/App.tsx` - Fixed hardcoded session ID
- `src-tauri/src/voice/capture.rs` - Added listening/idle state emissions
- `src-tauri/src/voice/synth.rs` - Added speaking state emission

## Verification
- ✅ Rust compilation passes (`cargo check`)
- ✅ TypeScript compilation passes (`npx tsc --noEmit`)
- ✅ State events infrastructure complete
- ✅ Thinking state emission integrated
- ✅ Voice state transitions integrated

## Next Steps (Phase D: Integration Testing)

### 1. Voice State Transitions (Completed)
- ✅ `Listening` state when recording starts (push-to-talk) — `capture.rs`
- ✅ `Idle` state when recording stops — `capture.rs`
- ✅ `Speaking` state when TTS playback starts — `synth.rs`
- ✅ `Idle` state when TTS playback completes — `synth.rs`

### 2. Frontend State Handler (Completed)
- ✅ `ConfluxOrbit.tsx` handles `conflux:state` events
- ✅ Fairy animation updates based on state
- ✅ Syncs with existing visual pulse system

### 3. Integration Testing (Pending)
- ⏳ Test voice chat with state transitions
- ⏳ Verify fairy animation sync
- ⏳ Check error state handling
- ⏳ Test session persistence across restarts

## Notes
- State events are lightweight and frequent by design
- Frontend should debounce rapid state changes if needed
- State manager is thread-safe via Mutex
- Commands are registered in Tauri invoke handler
