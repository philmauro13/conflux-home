# Session Handoff: Conflux Voice Layer

> **Version:** v0.1.53-pre
> **Date:** 2026-04-06
> **Status:** Phase A groundwork complete. Pivoting to ElevenLabs for Phase B.

---

## What Works

- **Push-to-Talk (PTT):** Global Spacebar listener captures mic input. Fully functional.
- **Audio Capture:** `voice/capture.rs` streams microphone audio while PTT is held.
- **Volume-Driven Pulses:** The fairy reacts to live microphone amplitude — louder input = faster/larger pulses on the neural brain.
- **Whisper Small Integration:** Local transcription wired via `voice/transcribe.rs`. Successfully transcribes captured audio.
- **Visual Sync:** `ConfluxOrbit` mode transitions (Idle → Listen → Focus → Speak) respond to voice events.

## What's Blocked / Needs Rework

- **Whisper is blocking:** Local Whisper Small inference runs synchronously and freezes the UI during transcription. It works, but it's not usable for real-time interaction.
- **No streaming STT:** We need partial-transcript streaming to drive `runListeningCadence()` in real time. Local Whisper doesn't provide this out of the box.
- **No TTS yet:** Text-to-speech output and audio-envelope-driven fairy speech animations are not implemented.

## What's Next: ElevenLabs Streaming (Phase B)

1. **Streaming STT via ElevenLabs:** Replace local Whisper with ElevenLabs Speech-to-Text streaming API for non-blocking, partial-transcript results.
2. **Streaming TTS via ElevenLabs:** Pipe assistant responses through ElevenLabs TTS and extract audio amplitude/phoneme timing.
3. **Fairy Speech Sync:** Pass TTS audio envelope data to `conflux.runSpeechCadence()` so the fairy "speaks" in sync with audio output.
4. **Latency target:** < 300ms from end of user speech to start of fairy response animation.

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/voice/capture.rs` | Mic audio capture (PTT) |
| `src-tauri/src/voice/transcribe.rs` | Whisper Small transcription (blocking) |
| `src/components/ConfluxOrbit.tsx` | Fairy movement + mode transitions |
| `src/components/conflux/useConfluxController.ts` | Fairy state machine (listen/focus/speak) |
| `src/components/ChatPanel.tsx` | Token sync for speech cadence |
| `src/App.tsx` | PTT listener wiring |

## References

- [`MASTER_INSPIRATION_PROMPT.md`](./MASTER_INSPIRATION_PROMPT.md) — The "Need, Not Want" vision and "AOL for AI" strategy.
- [`CONFLUX_PRESENCE_ROADMAP.md`](./CONFLUX_PRESENCE_ROADMAP.md) — Master checklist and phase breakdown.
- [`conflux-next/neural-agent-ui/CONFLUX_COMPONENT_MANUAL.md`](./conflux-next/neural-agent-ui/CONFLUX_COMPONENT_MANUAL.md) — API spec for the neural brain component.
