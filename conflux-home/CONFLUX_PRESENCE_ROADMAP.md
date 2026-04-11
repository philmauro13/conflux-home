# 🧚‍♂️ Conflux Presence: The "Jarvis" Integration Roadmap

> **Current Version:** v0.1.53
> **Status:** Visuals & Movement ✅ | TTS/STT Wiring 🚧 | Cross-App Awareness ⏳

This document serves as the master checklist and technical specification for integrating the **Conflux Presence** (the "Fairy" or neural brain) into Conflux Home. It is designed to prevent context bloat and ensure we can resume high-level development across multiple sessions.

**Connection to INTELLIGENCE_ROADMAP.md:**
This roadmap focuses specifically on the *visual layer* and *voice interface*. The broader agent intelligence (proactive nudges, cross-app awareness, pattern detection) is detailed in `INTELLIGENCE_ROADMAP.md` (Phase 1 & 2).

---

## 1. Reference Documentation
These files are the "Source of Truth" for the visual component and design philosophy:
- **[Conflux Component Manual](./conflux-next/neural-agent-ui/CONFLUX_COMPONENT_MANUAL.md):** The detailed API spec for the neural brain, including `useConfluxController`, `ConfluxPresence`, and the Tauri event contract.
- **[Master Inspiration Prompt](./MASTER_INSPIRATION_PROMPT.md):** The guiding vision for "Need, Not Want" and the "AOL for AI" strategy.

---

## 2. Completed: The "Zelda Fairy" Foundation
- [x] **Component Integration:** `ConfluxPresence` and `NeuralBrainScene` are now part of the Tauri stack.
- [x] **Orbit Logic:** `ConfluxOrbit.tsx` uses `framer-motion` for physics-based movement between app states.
- [x] **Push-to-Talk (PTT):** Global Spacebar listener implemented.
- [x] **Mode Mapping:** 
    - `Idle`: Dashboard/Bottom-Right.
    - `Listen`: PTT/Center/Large/Indigo.
    - `Focus`: Chat/Thinking/Gold.
    - `Speak`: Chat/Token-Synced.
- [x] **Transparency:** The brain now floats over the UI without a solid background canvas.

---

## 3. Master Checklist: Remaining Implementation

### 🟢 Phase A: The Voice Layer (TTS/STT) 🗣️ — ElevenLabs Integration
*Goal: Move from "simulated" pulses to actual audio-driven reactions.*

> **Status:** PTT, audio capture, volume-driven pulses are live. Local Whisper was blocked by UI thread issues.

- [x] **PTT & Audio Capture:**
    - [x] Spacebar triggers "Listening" state (Indigo pulse).
    - [x] Volume-driven amplitude reacting to live mic.
- [x] **STT Groundwork (Local Whisper Small):**
    - [x] Audio capture from PTT wired via `voice/capture.rs`.
    - [x] Whisper Small integrated in `voice/transcribe.rs`.
    - [ ] **Blocked:** Local Whisper inference is synchronous and blocks the UI; requires async/streaming or replacement (ElevenLabs).
- [ ] **TTS Implementation (Text-to-Speech):**
    - [x] Web Audio API wired for playback (`src/components/ConfluxOrbit.tsx`).
    - [ ] **Provider:** ElevenLabs streaming API (replacing local blocking calls).
    - [ ] **Audio Envelope:** Extract the audio amplitude/phoneme timing from the ElevenLabs stream.
    - [ ] **Sync:** Pass the TTS tokens to `conflux.runSpeechCadence()` to match the mouth-movement of the neural pulses.

### 🔵 Phase B: Cross-App "Awareness" 📱
*Goal: The Fairy should "inspect" the app the user is currently in.*

> **Status:** Magnetic positioning and app-specific palettes are implemented. Lobe routing is wired.

- [x] **App-Specific Lobe Routing:**
    - [x] `APP_LOBE_MAP` in `ConfluxOrbit.tsx` maps apps to lobes (Budget → reasoning, Kitchen → memory).
    - [x] `conflux.routePulse()` triggers visual pulses in specific brain lobes based on app context.
- [x] **App-Specific Palettes:**
    - [x] `APP_PALETTES` in `neuralBrain.ts` defines unique color schemes per app.
    - [x] `conflux.setAppPaletteMode()` switches colors dynamically.
- [ ] **Data-Driven Pulses:**
    - [ ] **Deep Dive:** How do we map a "notification" or "nudge" from an app to a specific `strength` and `burst` count in the neural brain?
    - [ ] **Integration:** Connect to `INTELLIGENCE_ROADMAP.md` Phase 1 (Nudge System) to trigger visual pulses from backend events.

### 🟣 Phase C: The "Master Intelligence" Layer (Backend) 🧠
*Goal: The brain should react to the Rust engine's internal state, not just the UI.*

- [x] **Rust Event Emission:**
    - [x] `conflux:state` events are emitted by the backend (`router.rs`) during thinking/speaking.
    - [x] `ConfluxOrbit.tsx` listens for these events and updates visual state accordingly.
- [ ] **Tool Use Reaction:**
    - [ ] When the agent calls a tool (e.g., `budget_detect_patterns`), trigger a `pulseEvent` to the `tools` lobe.
- [ ] **Wake Word Simulation:**
    - [ ] **Deep Dive:** Implement a "Hey Conflux" listener that triggers `mode: 'excited'` and a unique `SoundManager` effect.

### 🟠 Phase D: Polish & Physics 🚀
- [ ] **Collision Avoidance:** Ensure the Fairy doesn't overlap with the `GlobalAIInput` or the `ConfluxBarV2`.
- [ ] **Idle Animations:** Add "micro-movements" (breathing/drift) when the user hasn't interacted for 30+ seconds.

---

## 4. Technical Notes for Next Session
- **File Locations:**
    - **Visuals:** `src/components/conflux/` and `src/components/ConfluxOrbit.tsx`.
    - **Logic:** `src/lib/neuralBrain.ts` (Command presets and palettes).
    - **Wiring:** `src/App.tsx` (PTT listeners) and `src/components/ChatPanel.tsx` (Token sync).
- **Dependencies:** `framer-motion`, `three`, `@react-three/fiber`, `@react-three/drei`.
- **Debugging Tip:** To see the "Listening" state change, open the browser console (F12) and look for `[ConfluxOrbit] PTT Start` logs.

---

## 5. Next Session "Kickoff" Prompt
> "ZigBot, let's continue the Conflux Presence integration. Phase A voice groundwork is complete (PTT, audio capture, volume-driven pulses). **Priority: Phase B — ElevenLabs streaming TTS/STT** to replace the local blocking Whisper calls. We need real-time streaming transcription and audio-envelope-driven fairy pulses. Reference `INTELLIGENCE_ROADMAP.md` for the broader agent vision and `CONFLUX_PRESENCE_ROADMAP.md` for the visual/voice layer."
