# Thinking State Animation Fix

## Problem
The "Thinking" state wasn't visible during the delay between STT and TTS.

## Root Causes
1. The `focus` mode (scale 0.95) was being overridden by positioning logic
2. No continuous pulse animation during thinking
3. Fairy wasn't moving to center during thinking

## Solution Implemented

### 1. Updated Positioning Logic (`src/components/ConfluxOrbit.tsx`)

```typescript
const isThinking = conflux.mode === 'focus';

if (isPushToTalkActive || isSpeaking) {
  // Listening/Speaking: Large, centered (scale 1.8)
  targetX = dimensions.width / 2 - 250;
  targetY = dimensions.height / 2 - 250;
  scale = 1.8;
} else if (isThinking) {
  // Thinking: Medium, centered (scale 1.1)
  targetX = dimensions.width / 2 - 250;
  targetY = dimensions.height / 2 - 250;
  scale = 1.1; // Calmer than speaking but noticeable
}
```

### 2. Enhanced Thinking State Handler

```typescript
case 'Thinking':
  conflux.setMode('focus', 'backend', 'Thinking...');
  conflux.triggerPulse(8, 'Thinking...'); // Strong initial pulse
  
  // Continuous pulse every 1.5 seconds
  const thinkingPulseInterval = setInterval(() => {
    if (conflux.mode === 'focus') {
      conflux.triggerPulse(4, 'Thinking...');
    } else {
      clearInterval(thinkingPulseInterval);
    }
  }, 1500);
  break;
```

### 3. Updated `conflux:state` Event Handler

```typescript
case 'Thinking':
  conflux.setMode('focus', 'backend', 'Thinking...');
  conflux.triggerPulse(8, 'Thinking...');
  break;
```

## Visual Design

| State | Mode | Scale | Position | Animation |
|-------|------|-------|----------|-----------|
| Idle | idle | 1.0 | Bottom-right | Calm drift |
| Listening | listen | 1.8 | Center | Purple pulses |
| **Thinking** | **focus** | **1.1** | **Center** | **Blue pulses, continuous** |
| Speaking | speak | 1.8 | Center | Warm gold pulses |

## What to Test

1. **Speak a query** - Verify fairy shows "Listening" (large, center, purple)
2. **Wait for LLM** - Verify fairy shows "Thinking" (medium, center, blue with pulses)
3. **Receive response** - Verify fairy shows "Speaking" (large, center, gold)

## Expected Behavior

- Fairy moves to center when thinking starts
- Fairy stays centered during thinking (not returning to dock)
- Continuous blue pulses every 1.5 seconds while thinking
- Status text shows "Thinking..."
- Fairy is smaller than speaking but larger than idle

## Files Modified

- `src/components/ConfluxOrbit.tsx`
  - Added `isThinking` check
  - Updated positioning logic for thinking
  - Enhanced thinking state handler with continuous pulses
  - Updated `conflux:state` event handler

## Verification

- ✅ TypeScript compilation passes
- ✅ Thinking state properly handled in event listener
- ✅ Continuous pulse animation implemented
- ✅ Positioning logic updated for thinking
