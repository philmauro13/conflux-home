# Conflux Component Manual

## Purpose

This document describes the reusable Conflux component package inside `src/components/conflux`.
It is written as an operator/spec manual for other agents and developers who need to embed, drive,
or extend the component without reverse-engineering the prototype.

Conflux is split into three layers:

1. `ConfluxPresence`
The embeddable visual component. This renders the neural brain scene only.

2. `useConfluxController`
The controller hook. This manages mode changes, pulse scheduling, token cadence timing, status,
signal counts, and event application.

3. `ConfluxDebugPanel`
An optional demo/control surface. This is not required by applications. It exists only as a
reference UI and testing harness.

There are now also two transport adapters:

4. `windowBridge`
Browser CustomEvent helpers for applications that want loose coupling through the DOM event layer.

5. `tauriBridge`
An adapter that accepts Tauri's `listen(...)` function and wires backend events into the controller
without hard-coupling this package to the Tauri SDK.

And one drop-in integration wrapper:

6. `ConfluxTauriHost`
A convenience host that combines `useConfluxController`, `attachTauriConfluxListeners`, and
`ConfluxPresence` into a single embeddable component.

## File Map

Public entrypoint:

- `src/components/conflux/index.ts`

Public visual component:

- `src/components/conflux/ConfluxPresence.tsx`

Public controller hook:

- `src/components/conflux/useConfluxController.ts`

Public demo component:

- `src/components/conflux/ConfluxDebugPanel.tsx`

Drop-in Tauri host:

- `src/components/conflux/ConfluxTauriHost.tsx`

Public exported types:

- `src/components/conflux/types.ts`

Transport adapters:

- `src/components/conflux/windowBridge.ts`
- `src/components/conflux/tauriBridge.ts`

Rendering internals:

- `src/components/NeuralBrainScene.tsx`

Shared brain configuration and graph generation:

- `src/lib/neuralBrain.ts`

## High-Level Architecture

### Visual layer

`ConfluxPresence` is a thin wrapper around `NeuralBrainScene`.
It accepts either:

- a full `command: BrainCommand`
- or a simpler `mode: BrainMode`

It also accepts:

- `pulseImpulse`
- `pulseEvent`
- `transparent`
- `style`
- `containerProps`

This means the visual layer itself does not schedule pulses or maintain status.
It only renders the currently resolved Conflux state.

### Control layer

`useConfluxController` is the stateful runtime.
It owns:

- current `command`
- current `mode`
- current `status`
- current `signalCount`
- current `pulseImpulse`
- latest `pulseEvent`
- transparency preference

It also owns time-based behaviors:

- pulse impulse decay
- speech cadence timers
- listening cadence timers

### Demo layer

`ConfluxDebugPanel` is a convenience layer for local testing and visualization.
It is safe to delete from a production app.

## Public API

### `ConfluxPresence`

Import:

```ts
import { ConfluxPresence } from "./components/conflux";
```

Props:

```ts
type ConfluxPresenceProps = {
  mode?: BrainMode;
  command?: BrainCommand;
  pulseImpulse: number;
  pulseEvent?: PulseEventDetail & { id: number };
  transparent?: boolean;
  className?: string;
  style?: CSSProperties;
  containerProps?: HTMLAttributes<HTMLDivElement>;
};
```

Behavior:

- If `command` is provided, it is used directly.
- If `command` is omitted and `mode` is provided, the matching command preset is resolved internally.
- If neither is provided, `DEFAULT_COMMAND` is used.
- `pulseImpulse` influences speech ring response and general active energy.
- `pulseEvent` injects one-time routed or targeted pulses into the graph.
- `transparent` controls whether the canvas background is transparent.
- `style` allows direct width/height/position control from the consuming app.
- `containerProps` lets you attach classes, data attributes, aria attributes, and layout props
  to the outer wrapper.

Usage:

```tsx
<ConfluxPresence
  command={controller.command}
  pulseImpulse={controller.pulseImpulse}
  pulseEvent={controller.pulseEvent}
  transparent
  style={{ width: 420, height: 420 }}
/>
```

Resizing guidance:

- Conflux is parent-sized.
- The easiest pattern is to place it inside a sized container and pass `style={{ width: "100%", height: "100%" }}`.
- This makes it easy to use inside a card, overlay, floating avatar region, or resizable panel.

### `useConfluxController`

Import:

```ts
import { useConfluxController } from "./components/conflux";
```

Options:

```ts
type UseConfluxControllerOptions = {
  initialMode?: BrainMode;
  initialStatus?: string;
  initialTransparent?: boolean;
};
```

Return shape:

```ts
{
  command: BrainCommand;
  mode: BrainMode;
  pulseImpulse: number;
  pulseEvent?: PulseEventDetail & { id: number };
  signalCount: number;
  status: string;
  transparent: boolean;
  setTransparent: React.Dispatch<React.SetStateAction<boolean>>;
  setMode(nextMode, source?, nextStatus?): void;
  triggerPulse(strength?, nextStatus?): void;
  routePulse(detail, nextStatus?, options?): void;
  runSpeechCadence(detail): void;
  runListeningCadence(detail): void;
  applyEvent(event, source?): void;
  reset(): void;
}
```

Methods:

#### `setMode(nextMode, source?, nextStatus?)`

Moves Conflux into a preset behavior state.
This updates:

- `command`
- `status`
- `signalCount`
- `pulseImpulse`

Use this for coarse state changes such as:

- listening
- focus
- speaking
- excited

#### `triggerPulse(strength?, nextStatus?)`

Adds general pulse energy without a route.
This is a blunt instrument.
Use it for generic activity or alerts when no lobe or route information is known.

#### `routePulse(detail, nextStatus?, options?)`

Injects a targeted or routed pulse event into Conflux.
This is the primary structured pulse method.

`detail` accepts:

```ts
type PulseEventDetail = {
  lobe?: LobeName;
  lobes?: LobeName[];
  route?: LobeName[];
  strength?: number;
  bursts?: number;
  edgeIndex?: number;
};
```

Priority rules:

1. If `route` exists and has at least 2 lobes, Conflux computes a path across its graph.
2. Otherwise if `edgeIndex` exists, that edge is targeted directly.
3. Otherwise if `lobe` or `lobes` exist, matching edges are sampled from those lobes.
4. Otherwise the pulse falls back to whatever the current command emphasizes.

`options.updateStatus = false` prevents status thrashing during rapid cadence loops.

#### `runSpeechCadence(detail)`

Schedules multiple routed pulses over time to simulate TTS or token streaming.
Default route:

- `memory -> reasoning -> speech`

Typical use:

```ts
controller.runSpeechCadence({
  tokens: ["hello", "world"],
  intervalMs: 120,
  strength: 11,
  burstsPerToken: 3
});
```

#### `runListeningCadence(detail)`

Schedules multiple routed pulses over time to simulate STT or live voice capture.
Default route:

- `perception -> reasoning`

Typical use:

```ts
controller.runListeningCadence({
  tokens: ["partial", "transcript"],
  intervalMs: 90,
  strength: 9,
  burstsPerToken: 2
});
```

#### `applyEvent(event, source?)`

Applies a full structured event object to the controller.
This is the preferred bridge method for other agents.

Accepted shape:

```ts
type ConfluxExternalEvent = {
  mode?: BrainMode;
  pulse?: number;
  status?: string;
  pulseEvent?: PulseEventDetail;
  speechCadence?: TokenCadenceDetail;
  listeningCadence?: TokenCadenceDetail;
};
```

Behavior:

- `mode` changes the command preset
- `speechCadence` schedules token-timed speaking pulses
- `listeningCadence` schedules token-timed listening pulses
- `pulseEvent` injects structured routed/targeted activity
- `pulse` adds generic activity

#### `reset()`

Resets controller state to the initial baseline and clears cadence timers.

### `ConfluxDebugPanel`

Import:

```ts
import { ConfluxDebugPanel } from "./components/conflux";
```

Props:

```ts
type ConfluxDebugPanelProps = {
  controller: ReturnType<typeof useConfluxController>;
};
```

Purpose:

- demo triggers
- QA surface
- integration reference

This component is optional.

### `ConfluxTauriHost`

Import:

```ts
import { ConfluxTauriHost } from "./components/conflux";
```

Props:

```ts
type ConfluxTauriHostProps = UseConfluxControllerOptions & {
  listen: ConfluxTauriListen;
  eventNames?: {
    state?: string;
    pulse?: string;
  };
  className?: string;
  style?: CSSProperties;
  containerProps?: HTMLAttributes<HTMLDivElement>;
};
```

Purpose:

- simplest drop-in option for Tauri React apps
- no manual controller wiring required
- no manual event bridge wiring required
- still parent-sized and editable through props

Behavior:

- creates its own controller internally
- subscribes to Tauri events on mount
- unsubscribes on unmount
- renders the same Conflux core scene as `ConfluxPresence`

Use this when:

- another team just needs Conflux visible quickly
- Rust or Tauri emits structured events already
- you do not need direct access to controller methods in the React tree

Avoid this when:

- a parent React component needs direct imperative access to `setMode`, `routePulse`, or cadence methods
- your app needs to merge Conflux state into another orchestration store

### `windowBridge`

Import:

```ts
import {
  bindConfluxWindowEvents,
  emitConfluxPulseEvent,
  emitConfluxStateEvent
} from "./components/conflux";
```

Purpose:

- bridge structured Conflux events through browser `CustomEvent`
- keep orchestration decoupled from the React tree

API:

```ts
const bridge = bindConfluxWindowEvents(controller.applyEvent);

emitConfluxStateEvent({
  mode: "listen",
  status: "Awaiting voice input"
});

emitConfluxPulseEvent({
  pulseEvent: {
    route: ["perception", "reasoning", "tools"],
    strength: 14,
    bursts: 4
  }
});

bridge.dispose();
```

### `tauriBridge`

Import:

```ts
import { attachTauriConfluxListeners } from "./components/conflux";
```

Purpose:

- accept a Tauri `listen` function from `@tauri-apps/api/event`
- translate Tauri-emitted payloads into `controller.applyEvent(...)`
- avoid requiring the core package to import Tauri directly

API:

```ts
const bridge = await attachTauriConfluxListeners(listen, controller.applyEvent);

await bridge.dispose();
```

Expected Tauri event names by default:

- `conflux:state`
- `conflux:pulse`

These can be renamed:

```ts
await attachTauriConfluxListeners(listen, controller.applyEvent, {
  state: "agent:conflux:state",
  pulse: "agent:conflux:pulse"
});
```

## Exported Types

From `src/components/conflux/index.ts`:

- `BrainCommand`
- `BrainMode`
- `LobeName`
- `PulseEventDetail`
- `TokenCadenceDetail`
- `ConfluxExternalEvent`
- `ConfluxStatusSource`

## Feature Wiring Map

### Command presets

Defined in:

- `src/lib/neuralBrain.ts`

Wired into:

- `useConfluxController.setMode`
- `ConfluxPresence` when `mode` is passed instead of `command`
- `NeuralBrainScene` visual behavior

Each command preset contains:

- color palette
- glow strength
- pulse rate
- scale
- turbulence
- drift axis
- wobble
- lobe spread
- speech ring intensity
- active lobes

### Graph routing

Defined in:

- `src/lib/neuralBrain.ts`

Important structures:

- `nodeLobes`
- `lobeNodeIndices`
- `edgeLobes`
- `adjacency`
- `edgeIndexByPair`
- `lobeAnchors`

Used by:

- `NeuralBrainScene`

Purpose:

- classify nodes into named brain regions
- compute lobe anchor points
- traverse real routes across the neural graph

### Routed pulse choreography

Defined in:

- `src/components/NeuralBrainScene.tsx`

Important internal functions:

- `findNodePath`
- `nodePathToEdgePath`
- `buildRouteEdgePath`
- `injectPulseBurst`
- `injectRoutePulse`

Purpose:

- convert lobe routes into actual edge paths
- animate pulses across those paths over time

### Token cadence

Defined in:

- `src/components/conflux/useConfluxController.ts`

Important methods:

- `runSpeechCadence`
- `runListeningCadence`
- internal `runCadence`

Purpose:

- schedule pulse bursts per token
- avoid requiring consuming apps to write their own timer logic

### Speech rings

Defined in:

- `src/components/NeuralBrainScene.tsx`

Purpose:

- subtle speaking/listening aura
- driven by `speechRingIntensity` and `pulseImpulse`

### Internal glow pass

Defined in:

- `src/components/NeuralBrainScene.tsx`

Purpose:

- render extra brightness directly on activated graph edges
- keep glow attached to Conflux internals rather than an external halo

## Recommended Integration Patterns

### Pattern 1: Hook + visual component

Best for React apps.

```tsx
const conflux = useConfluxController();

return (
  <ConfluxPresence
    command={conflux.command}
    pulseImpulse={conflux.pulseImpulse}
    pulseEvent={conflux.pulseEvent}
    transparent
  />
);
```

Then drive it with:

```ts
conflux.setMode("listen");
conflux.runListeningCadence({
  tokens: partialTranscriptWords,
  intervalMs: 90
});
```

### Pattern 2: Event bridge

Best for Tauri, multi-agent orchestration, or loosely coupled integrations.

```ts
window.dispatchEvent(
  new CustomEvent("conflux:state", {
    detail: {
      mode: "speak",
      speechCadence: {
        tokens: ["hello", "world"],
        route: ["memory", "reasoning", "speech"],
        intervalMs: 120,
        strength: 11,
        burstsPerToken: 3
      }
    }
  })
);
```

In the current demo, `App.tsx` wires those window events into the controller with:

- `bindConfluxWindowEvents(controller.applyEvent)`

### Pattern 2A: Tauri listen bridge

Best for Tauri apps where Rust emits frontend events.

```ts
import { listen } from "@tauri-apps/api/event";
import { attachTauriConfluxListeners } from "./components/conflux";

useEffect(() => {
  let disposed = false;
  let cleanup: { dispose: () => Promise<void> } | undefined;

  attachTauriConfluxListeners(listen, controller.applyEvent).then((bridge) => {
    if (disposed) {
      void bridge.dispose();
      return;
    }
    cleanup = bridge;
  });

  return () => {
    disposed = true;
    void cleanup?.dispose();
  };
}, [controller]);
```

### Pattern 2B: Drop-in Tauri host

Best for rapid embedding.

```tsx
import { listen } from "@tauri-apps/api/event";
import { ConfluxTauriHost } from "./components/conflux";

export function AgentAvatar() {
  return (
    <ConfluxTauriHost
      listen={listen}
      initialMode="idle"
      initialTransparent={true}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
```

This is the fastest path when the frontend does not need the controller object directly.

### Pattern 3: Server-driven state projection

If another agent owns orchestration, that agent should not manipulate the scene directly.
It should produce structured `ConfluxExternalEvent` objects and feed them into:

- `controller.applyEvent(event, "backend")`

This keeps scene behavior deterministic and centralized.

## Tauri Event Contract

This section is the canonical payload contract for backend agents, Rust services, or orchestration layers that need to drive Conflux.

Default event names:

- `conflux:state`
- `conflux:pulse`

Both events accept the same payload shape:

```ts
type ConfluxExternalEvent = {
  mode?: BrainMode;
  pulse?: number;
  status?: string;
  pulseEvent?: PulseEventDetail;
  speechCadence?: TokenCadenceDetail;
  listeningCadence?: TokenCadenceDetail;
};
```

### Event field meanings

`mode`

- high-level visual preset switch
- use for broad phase changes like idle, listening, focus, or speaking

`pulse`

- generic non-routed energy bump
- use when you want activity but do not know which region should fire

`status`

- optional human-readable phase label
- should describe the current phase, not every individual token

`pulseEvent`

- targeted or routed activation
- preferred for tool calls, memory recall, focused reasoning, or perception-to-action visualization

`speechCadence`

- token-timed speaking choreography
- preferred for streamed TTS or tokenized model output

`listeningCadence`

- token-timed listening choreography
- preferred for STT partials, voice activity, or chunked incoming speech

### Supported mode values

- `idle`
- `listen`
- `focus`
- `speak`
- `excited`
- `compact`
- `expanded`

### `PulseEventDetail`

```ts
type PulseEventDetail = {
  lobe?: LobeName;
  lobes?: LobeName[];
  route?: LobeName[];
  strength?: number;
  bursts?: number;
  edgeIndex?: number;
};
```

Resolution order:

1. Use `route` when you know the intended path.
2. Otherwise use `edgeIndex` for deterministic debug targeting.
3. Otherwise use `lobe` or `lobes` to target one or more regions.
4. Otherwise the scene falls back to the active command emphasis.

Supported lobe names:

- `speech`
- `memory`
- `reasoning`
- `tools`
- `perception`

### `TokenCadenceDetail`

```ts
type TokenCadenceDetail = {
  tokens?: string[];
  route?: LobeName[];
  intervalMs?: number;
  strength?: number;
  burstsPerToken?: number;
  status?: string;
};
```

Default routes:

- `speechCadence` defaults to `memory -> reasoning -> speech`
- `listeningCadence` defaults to `perception -> reasoning`

Recommendations:

- `tokens` may be words, phrases, chunks, or placeholder beat markers
- `intervalMs` should match the approximate rhythm of the upstream stream
- `burstsPerToken` controls how emphatic each beat is
- `status` should be set for the phase, not every token

### Example payloads

Listening started:

```json
{
  "mode": "listen",
  "status": "Listening for user input"
}
```

Listening partial:

```json
{
  "listeningCadence": {
    "tokens": ["open", "the", "report"],
    "intervalMs": 90,
    "strength": 9,
    "burstsPerToken": 2
  },
  "status": "Receiving speech"
}
```

Reasoning toward a tool:

```json
{
  "mode": "focus",
  "pulseEvent": {
    "route": ["perception", "reasoning", "tools"],
    "strength": 14,
    "bursts": 4
  },
  "status": "Planning tool execution"
}
```

Speaking response:

```json
{
  "mode": "speak",
  "speechCadence": {
    "tokens": ["I", "found", "the", "result"],
    "route": ["memory", "reasoning", "speech"],
    "intervalMs": 120,
    "strength": 11,
    "burstsPerToken": 3
  },
  "status": "Delivering response"
}
```

Generic alert:

```json
{
  "pulse": 10,
  "status": "Background signal activity"
}
```

### Rust/Tauri emission sketch

Suggested Rust serialization shape:

```rust
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ConfluxExternalEvent {
    mode: Option<String>,
    pulse: Option<f32>,
    status: Option<String>,
    pulse_event: Option<PulseEventDetail>,
    speech_cadence: Option<TokenCadenceDetail>,
    listening_cadence: Option<TokenCadenceDetail>,
}
```

Suggested emit usage:

```rust
app_handle.emit("conflux:state", payload)?;
app_handle.emit("conflux:pulse", payload)?;
```

Frontend requirement:

- emit camelCase JSON keys
- keep event names aligned with the defaults above unless you explicitly rename them in `ConfluxTauriHost` or `attachTauriConfluxListeners(...)`

## Operational Recommendations For Other Agents

### Use `mode` for coarse state

Good:

- entering listen mode
- entering speak mode
- entering focused reply mode

### Use `pulseEvent.route` for intentful choreography

Good:

- `["perception", "reasoning", "tools"]` for tool discovery/tool use
- `["memory", "reasoning", "speech"]` for spoken answer generation
- `["perception", "reasoning"]` for listening

### Use `speechCadence` and `listeningCadence` for streams

Good:

- streaming token output
- STT partial transcript chunks
- batched word groups

Avoid:

- firing `setMode("speak")` repeatedly for every token
- overwriting status on every token

### Status handling

Status lives in the controller and is updated by:

- `setMode`
- `triggerPulse`
- `routePulse`
- cadence entry methods

Cadence internals intentionally suppress status rewrites on each token pulse by calling:

- `routePulse(..., { updateStatus: false })`

If another agent needs stable status, it should set the high-level status once when the phase changes,
not on every sub-event.

## Known Constraints

- This is a canvas-driven visual component, so it assumes a browser/DOM environment.
- The controller uses `window.setTimeout` and `window.setInterval`.
- The component is not SSR-safe without guarding render or deferring mount.
- The graph topology is generated once per scene mount.
- Pulse routing is deterministic only relative to the generated graph instance.

## Minimal Production Example

```tsx
import { ConfluxPresence, useConfluxController } from "./components/conflux";

export function AgentAvatar() {
  const conflux = useConfluxController({
    initialMode: "idle",
    initialTransparent: true
  });

  useEffect(() => {
    conflux.setMode("listen");
  }, [conflux]);

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

## Extension Targets

Safe next extensions for other agents:

- add audio-envelope-driven ring amplitude
- add domain-specific routes such as memory recall vs tool execution vs error recovery
- map backend confidence to pulse density or brightness
- create richer Tauri event namespaces or payload normalizers on top of the existing adapter
- add a controlled host variant that exposes controller state to parent components through callbacks

Unsafe extensions unless coordinated carefully:

- editing `NeuralBrainScene` and controller timing behavior independently
- duplicating cadence scheduling logic outside `useConfluxController`
- bypassing structured pulse routes with ad hoc visual mutations

## Summary

If another agent needs to manipulate Conflux, the preferred order is:

1. Use `useConfluxController`.
2. Feed structured events into `applyEvent`.
3. Render `ConfluxPresence`.
4. Use `windowBridge` or `tauriBridge` for transport.
5. Treat `ConfluxDebugPanel` only as a demo/testing surface.

If another agent needs the fastest Tauri integration path:

1. Use `ConfluxTauriHost`.
2. Pass Tauri's `listen`.
3. Size it from the parent with `style` or `containerProps`.

This keeps the rendering layer pure, the timing layer centralized, and the application integration clean.

## Handoff Package Guide

If you are handing Conflux to another agent or another application team, give them these files.

### Minimum reusable package

Required:

- `src/components/conflux/`
- `src/components/NeuralBrainScene.tsx`
- `src/lib/neuralBrain.ts`

This is the actual reusable Conflux package.

### Optional reference shell

Useful but not required:

- `src/App.tsx`
- `src/styles.css`
- `CONFLUX_COMPONENT_MANUAL.md`

These files help another team see how the package is meant to be embedded and exercised.

### What each path contains

`src/components/conflux/`

- public exports
- reusable component wrappers
- controller hook
- debug panel
- Tauri host
- browser/Tauri transport bridges
- shared exported types

`src/components/NeuralBrainScene.tsx`

- low-level Three.js scene
- Conflux visuals
- pulse choreography
- route traversal logic

`src/lib/neuralBrain.ts`

- graph generation
- lobe definitions
- command presets
- routing metadata
- shared mode and payload types

### NPM packages they also need

- `react`
- `react-dom`
- `three`
- `@react-three/fiber`
- `@react-three/drei`

### Recommended handoff options

Option 1: reusable core only

- give them `src/components/conflux/`, `src/components/NeuralBrainScene.tsx`, and `src/lib/neuralBrain.ts`
- best when they already have their own app shell

Option 2: core plus working reference

- also include `src/App.tsx`, `src/styles.css`, and this manual
- best when they need a working example immediately

Option 3: Tauri-first handoff

- tell them to start with `ConfluxTauriHost`
- still provide the same underlying files because the host depends on them
- best when the backend will drive Conflux entirely through emitted events
