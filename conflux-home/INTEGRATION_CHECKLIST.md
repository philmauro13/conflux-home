# Integration Testing Checklist

## Phase C Complete ✅

All backend state event infrastructure is complete and verified.

## Phase D: Integration Testing Checklist

### 1. Session Persistence
- [ ] Create new voice chat session
- [ ] Verify session ID is dynamically generated
- [ ] Send multiple messages in same session
- [ ] Verify conversation history maintained
- [ ] Restart app and verify session persists

### 2. State Event Flow
- [ ] Press spacebar (PTT) → Verify Listening state emitted
- [ ] Speak into microphone → Verify STT transcript received
- [ ] Wait for LLM response → Verify Thinking state emitted
- [ ] Receive response → Verify Speaking state emitted
- [ ] Audio playback completes → Verify Idle state emitted

### 3. Fairy Animation Sync
- [ ] Fairy shows "Listening" visual when recording
- [ ] Fairy shows "Thinking" visual during LLM processing
- [ ] Fairy shows "Speaking" visual during TTS playback
- [ ] Fairy returns to idle state after completion
- [ ] Visual pulses sync with speech cadence

### 4. Error State Handling
- [ ] Test with no microphone → Verify error state
- [ ] Test with invalid API key → Verify error state
- [ ] Test with network failure → Verify error state
- [ ] Verify fairy shows error indicator
- [ ] Verify app recovers after error

### 5. Cross-Session Behavior
- [ ] Create multiple voice chat sessions
- [ ] Verify sessions are isolated
- [ ] Verify state events don't cross sessions
- [ ] Test switching between sessions

### 6. Performance
- [ ] State transitions feel responsive
- [ ] No memory leaks during extended use
- [ ] Fairy animation remains smooth
- [ ] Audio playback quality good

## Test Commands

### Manual Testing
```bash
# Start app with logging
cd /home/calo/.openclaw/workspace/conflux-home
cargo tauri dev

# Monitor state events in console
# Look for: [ConfluxOrbit] State transition: ...
```

### Automated Testing (Future)
- Unit tests for state event emission
- Integration tests for state flow
- Performance tests for animation sync

## Expected Results

### State Event Sequence
```
Spacebar Press → Listening
    ↓
Audio Capture → Listening (continuous)
    ↓
STT Complete → Transcript ready
    ↓
LLM Call → Thinking
    ↓
LLM Response → Speaking
    ↓
TTS Playback → Idle (after completion)
```

### Fairy Modes
- `idle` - Ready state
- `listen` - Recording audio
- `think` - Processing LLM
- `speak` - Playing TTS response
- `error` - Error state

## Success Criteria

1. ✅ All state transitions emit correct events
2. ✅ Fairy animation syncs with all states
3. ✅ Session persistence works across restarts
4. ✅ Error states properly handled
5. ✅ No performance degradation
6. ✅ No memory leaks

## Notes

- Testing should be done on Windows (primary platform)
- Test with actual microphone input
- Test with various network conditions
- Test with multiple consecutive voice chats
