# ElevenLabs Streaming Plan B

## Current State
- Rust backend compiles successfully (local Whisper disabled).
- Frontend receives `conflux:state` events via `attachTauriConfluxListeners`.
- Backend still defaults to local Whisper logic in `commands.rs`.

## Blocking Issue
The ElevenLabs WebSocket implementation in `src-tauri/src/voice/stream.rs` is ready, but it's not wired to the Tauri commands invoked by the frontend yet. The frontend expects `voice_capture_start` to begin the streaming process.

## Next Steps
1. **Verify Tauri Command Registration:** Ensure `voice_start_stream` is registered in `main.rs`.
2. **Frontend Call:** Update `useVoiceLogic.ts` to call `voice_start_stream` instead of `voice_capture_start` when PTT is pressed.
3. **Audio Feed:** Pass microphone audio bytes from `cpal` to the `StreamMessage::Audio` channel in `stream.rs`.
4. **TTS:** Implement `voice_synthesize` command to call ElevenLabs TTS and emit `speechCadence` events.
5. **Cleanup:** Remove `transcribe.rs` and `synthesize.rs` (piper) if they are fully replaced, or stub them out.

## Verification
- `cargo check` passes (✅)
- `npx tsc --noEmit` passes (✅)
- Runtime test: PTT triggers ElevenLabs stream connection.
