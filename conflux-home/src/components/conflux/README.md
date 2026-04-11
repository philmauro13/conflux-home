# Conflux Component Package

This directory contains the **Conflux Presence** component — a dynamic, moving, reactive neural network visualization designed to represent an AI agent's "soul" or consciousness.

## Purpose

Conflux is not just a visual effect. It is a **living interface** that:

- **Reacts** to agent state (listening, speaking, thinking, idle)
- **Speaks** via tokenized pulse choreography (simulating TTS/streaming)
- **Listens** via STT visual feedback
- **Emotes** via mode changes and pulse intensity

It turns a static agent into a **Jarvis or Fairy** — a presence that feels alive.

## Architecture

The package is split into three layers:

1. **`ConfluxPresence`** — The visual component (Three.js canvas)
2. **`useConfluxController`** — The stateful hook that manages modes, pulses, and cadence
3. **`ConfluxDebugPanel`** — Optional demo UI for testing

Plus transport adapters:

- **`windowBridge`** — Browser CustomEvent bridge
- **`tauriBridge`** — Tauri event listener bridge
- **`ConfluxTauriHost`** — Drop-in Tauri wrapper

## Quick Start

### Option 1: Drop-in Tauri Host (Fastest)

```tsx
import { listen } from "@tauri-apps/api/event";
import { ConfluxTauriHost } from "./components/conflux";

export function AgentAvatar() {
  return (
    <ConfluxTauriHost
      listen={listen}
      initialMode="idle"
      initialTransparent={true}
      style={{ width: 400, height: 400 }}
    />
  );
}
```

### Option 2: Hook + Visual (Most Control)

```tsx
import { useConfluxController, ConfluxPresence } from "./components/conflux";

export function AgentAvatar() {
  const conflux = useConfluxController({
    initialMode: "idle",
    initialTransparent: true
  });

  return (
    <ConfluxPresence
      command={conflux.command}
      pulseImpulse={conflux.pulseImpulse}
      pulseEvent={conflux.pulseEvent}
      transparent={conflux.transparent}
    />
  );
}
```

## Integration Points

### From Rust/Tauri Backend

Emit events that Conflux listens to:

```rust
// Speaking
app_handle.emit("conflux:state", ConfluxExternalEvent {
  mode: Some("speak".to_string()),
  speech_cadence: Some(TokenCadenceDetail {
    tokens: Some(vec!["Hello".to_string(), "world".to_string()]),
    route: Some(vec!["memory".to_string(), "reasoning".to_string(), "speech".to_string()]),
    interval_ms: Some(120),
    strength: Some(11.0),
    bursts_per_token: Some(3),
    ..Default::default()
  }),
  status: Some("Delivering response".to_string()),
  ..Default::default()
})?;

// Listening
app_handle.emit("conflux:state", ConfluxExternalEvent {
  mode: Some("listen".to_string()),
  status: Some("Listening for user input".to_string()),
  ..Default::default()
})?;
```

### From Other Agents (React)

Use the controller hook to drive the visual:

```tsx
// Listen mode
conflux.setMode("listen", "user", "Awaiting voice input");

// Speech cadence (simulates TTS)
conflux.runSpeechCadence({
  tokens: ["I", "found", "the", "result"],
  route: ["memory", "reasoning", "speech"],
  intervalMs: 120,
  strength: 11,
  burstsPerToken: 3
});

// Pulse event (targeted activation)
conflux.routePulse({
  route: ["perception", "reasoning", "tools"],
  strength: 14,
  bursts: 4
});
```

## Files

- `index.ts` — Public exports
- `ConfluxPresence.tsx` — Visual component
- `useConfluxController.ts` — Controller hook
- `ConfluxDebugPanel.tsx` — Demo panel
- `ConfluxTauriHost.tsx` — Drop-in Tauri wrapper
- `windowBridge.ts` — Browser event bridge
- `tauriBridge.ts` — Tauri event bridge
- `types.ts` — Shared types

## Dependencies

- `react`
- `react-dom`
- `three`
- `@react-three/fiber`
- `@react-three/drei`

## Next Steps

1. Copy the `src/components/conflux/` folder into your Next.js app
2. Install the Three.js dependencies
3. Import and render `ConfluxPresence` or `ConfluxTauriHost`
4. Drive it via `useConfluxController` or Tauri events
5. Connect STT/TTS to `runListeningCadence` and `runSpeechCadence`

## Manual

Full operator manual available at `CONFLUX_COMPONENT_MANUAL.md` (attached to this session).
