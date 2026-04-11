# Restart Instructions for Code Changes

## Problem
Code changes have been made but the app hasn't picked them up yet.

## Solution
You need to **restart the app** to see the changes.

### If Running with `cargo tauri dev`:

1. **Stop the current process** (Ctrl+C in the terminal)
2. **Restart with:**
   ```bash
   cd /home/calo/.openclaw/workspace/conflux-home
   cargo tauri dev
   ```

### If Running with Pre-built Binary:

1. **Close the app completely**
2. **Rebuild and run:**
   ```bash
   cd /home/calo/.openclaw/workspace/conflux-home
   cargo tauri build --debug
   ./target/debug/conflux-home
   ```

## Changes Made (Require Restart)

### 1. Removed Pop-Down Animation
**File:** `src/components/ConfluxOrbit.tsx`
- `handleTranscriptionDone` no longer resets to idle
- Fairy stays in listen mode until thinking state arrives

### 2. Enhanced Thinking Animation
**File:** `src/components/ConfluxOrbit.tsx`
- Scale: 1.1x → 1.6x (larger)
- Pulse strength: 8 → 20 (maximum)
- Pulse frequency: 1.5s → 0.5s (faster)

### 3. Enhanced Focus Mode Colors
**File:** `src/lib/neuralBrain.ts`
- `glowBoost`: 1.25 → 2.0
- `pulseRate`: 1.5 → 2.5
- Brighter cyan palette

## How to Verify Changes Are Applied

After restarting, you should see:

1. **No pop-down animation** - Fairy stays centered from listening → thinking → speaking
2. **Larger thinking fairy** - Scale 1.6x (noticeably larger than before)
3. **Fast, vibrant pulses** - Every 0.5 seconds with maximum strength (20)
4. **Brighter cyan colors** - More vibrant blue/cyan during thinking

## If Still Not Working

1. Try a clean rebuild:
   ```bash
   cd /home/calo/.openclaw/workspace/conflux-home
   cargo clean
   cargo tauri dev
   ```

2. Check browser console for errors (F12 or Ctrl+Shift+I)
   - Look for `[ConfluxOrbit] State transition: Thinking` log
   - Check for any JavaScript errors

3. Verify the `conflux:state` event is being received:
   - Console should show: `[ConfluxOrbit] State transition: Thinking`
   - If not, the backend might not be emitting the event

## Expected Console Logs

When speaking a query, you should see:
```
[ConfluxOrbit] conflux:state event received: {"state":"Listening","timestamp":"..."}
[ConfluxOrbit] State transition: Listening
[ConfluxOrbit] conflux:state event received: {"state":"Thinking","timestamp":"..."}
[ConfluxOrbit] State transition: Thinking
[ConfluxOrbit] conflux:state event received: {"state":"Speaking","timestamp":"..."}
[ConfluxOrbit] State transition: Speaking
```

If you don't see the "Thinking" state transition, the backend event isn't arriving.
