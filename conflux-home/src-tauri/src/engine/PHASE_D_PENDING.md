# Phase D: Frontend State Handler (Pending)

## Overview
The final step of Phase C (and bridge to Phase D) is to update the frontend to consume and react to backend state events.

## Current State

### ✅ Backend (Complete)
- `conflux:state` events emitted from:
  - `runtime.rs` — Thinking state
  - `capture.rs` — Listening/Idle states
  - `synth.rs` — Speaking/Idle states

### ✅ Frontend (Completed)
- `ConfluxOrbit.tsx` now handles `conflux:state` events
- Fairy animation mode syncs with state changes

## Task: Update ConfluxOrbit.tsx

### 1. Listen for State Events
Add event listener for `conflux:state` events:

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

### 2. Sync with Visual Pulse System
- Consume `speechCadence` metadata from state events
- Use existing pulse animation system
- Update fairy mode based on state

### 3. Handle Error States
- Display error message or icon
- Reset to Idle state after error

## Files Modified

- `src/components/ConfluxOrbit.tsx` — Added state event handler

## Verification Steps

1. ✅ Backend emits state events
2. ✅ Frontend receives state events
3. ✅ Fairy animation updates based on state
4. ✅ Error states handled properly
5. ⏳ Integration test with voice chat (pending)

## Notes

- Existing `conflux:thinking` event may be replaced by `conflux:state`
- State events are lightweight and frequent
- Frontend may need to debounce rapid state changes
- Consider adding state transition logging for debugging
- TypeScript compilation passes
