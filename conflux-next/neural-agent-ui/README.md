# Neural Agent UI Prototype

This is a fresh React + Vite prototype for a Tauri-friendly AI presence layer.

## What it includes

- A responsive 3D Conflux brain rendered with `@react-three/fiber`
- Emotion-driven body language with distinct color palettes and motion profiles
- Named internal lobes for `speech`, `memory`, `reasoning`, `tools`, and `perception`
- Speech rings and routed neural pulses that brighten connection paths
- Command-driven morph states for listening, focus, speaking, burst, compact, and expanded modes
- Transparent-preview support so Conflux can eventually float over other surfaces
- A UI shell and event hooks that can later be driven by Rust/Tauri events

## Run it

```bash
npm install
npm run dev
```

## Build it

```bash
npm run build
```

## Tauri integration direction

The frontend now listens for browser events named `conflux:state` and `conflux:pulse`.
In Tauri, your Rust event bridge can translate backend signals into those frontend events.

```ts
import { listen } from "@tauri-apps/api/event";

listen("conflux://state", (event) => {
  window.dispatchEvent(
    new CustomEvent("conflux:state", {
      detail: event.payload
    })
  );
});

listen("conflux://pulse", (event) => {
  window.dispatchEvent(
    new CustomEvent("conflux:pulse", {
      detail: event.payload
    })
  );
});
```

Recommended payload shape:

```ts
{
  mode?: "idle" | "listen" | "focus" | "speak" | "excited" | "compact" | "expanded";
  pulse?: number;
  pulseEvent?: {
    lobe?: "speech" | "memory" | "reasoning" | "tools" | "perception";
    lobes?: Array<"speech" | "memory" | "reasoning" | "tools" | "perception">;
    route?: Array<"speech" | "memory" | "reasoning" | "tools" | "perception">;
    strength?: number;
    bursts?: number;
    edgeIndex?: number;
  };
  speechCadence?: {
    tokens?: string[];
    route?: Array<"speech" | "memory" | "reasoning" | "tools" | "perception">;
    intervalMs?: number;
    strength?: number;
    burstsPerToken?: number;
    status?: string;
  };
  listeningCadence?: {
    tokens?: string[];
    route?: Array<"speech" | "memory" | "reasoning" | "tools" | "perception">;
    intervalMs?: number;
    strength?: number;
    burstsPerToken?: number;
    status?: string;
  };
  status?: string;
}
```

Recommended semantic events from Rust:

- `conflux://state` for mode changes like listening, thinking, speaking, or compacting
- `conflux://pulse` for tool calls, memory links, confidence spikes, or alerts
- `pulseEvent.lobe` or `pulseEvent.lobes` to route energy into exact Conflux regions
- `pulseEvent.route` to choreograph travel across multiple regions like `["memory", "reasoning", "speech"]`
- `speechCadence` to pulse with token-timed output for TTS or streamed generation
- `listeningCadence` to pulse with token-timed input for STT or live voice capture

## Visual model

Conflux is now organized into readable regions:

- `speech` biases forward and drives ring emission
- `memory` sits deeper and cooler for recall-oriented states
- `reasoning` stabilizes the upper core during focused work
- `tools` can flare more sharply during agent actions
- `perception` helps listening states feel receptive rather than just bright

Route choreography now traverses the graph itself, so a pulse can visibly move through Conflux in sequence rather than just appearing inside one lobe.
Token cadence layers on top of that so speaking and listening can advance in conversational rhythm.

## Next ideas

- Add voice-reactive ring amplitude tied to mic or TTS envelope data
- Drive cadence from real streaming token boundaries and STT partial transcripts
- Fade UI chrome further so only Conflux remains over transparent application surfaces
- Layer in shader-based bloom and postprocessing once performance targets are known
