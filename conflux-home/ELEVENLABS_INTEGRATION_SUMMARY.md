# ElevenLabs Streaming Integration Summary

## Overview
Successfully pivoted Conflux Presence from local Whisper/Piper TTS to ElevenLabs real-time streaming API for non-blocking STT/TTS.

## Key Changes

### Backend (Rust)

#### 1. `src-tauri/src/voice/stream.rs` (New)
- **WebSocket STT Client**: Connects to ElevenLabs `wss://api.elevenlabs.io/v1/speech-to-text`
- **Real-time Transcripts**: Parses incoming JSON and emits `conflux:state` events with `listeningCadence` payload
- **Audio Streaming**: Accepts PCM audio bytes via channel and sends to WebSocket

#### 2. `src-tauri/src/voice/synth.rs` (New)
- **TTS Streaming**: Calls ElevenLabs TTS API to generate MP3 audio
- **Audio Envelope**: Emits `conflux:tts-audio` event with base64-encoded MP3 and cadence data
- **Visual Sync**: Includes token timing data for fairy speech animation

#### 3. `src-tauri/src/voice/capture.rs` (Modified)
- **Audio Pipeline**: Captures microphone via `cpal`, converts to 16-bit PCM, feeds to ElevenLabs stream
- **Stream Management**: Creates/stores WebSocket sender in static `ELEVENLABS_SENDER`
- **Cleanup**: Properly signals stream closure when recording stops

#### 4. `src-tauri/src/commands.rs` (Modified)
- **Command Renaming**: `voice_commands` → `voice_cmds` to avoid conflict with `engine::commands::voice_commands`
- **New Commands**: `voice_start_stream`, `voice_synthesize` (registered in `lib.rs`)

#### 5. `src-tauri/src/lib.rs` (Modified)
- **Command Registration**: Added ElevenLabs streaming commands to Tauri invoke handler

### Frontend (React/TypeScript)

#### 1. `src/components/ConfluxOrbit.tsx` (Modified)
- **TTS Playback**: New `playTTS()` callback using Web Audio API
- **Event Listener**: Updated `attachTauriConfluxListeners` to handle `conflux:tts-audio` events
- **Visual Sync**: Sets fairy to 'speak' mode when audio begins playing

#### 2. `src/components/conflux/tauriBridge.ts` (Modified)
- **TTS Event Support**: Added `onTTSAudio` callback parameter to `attachTauriConfluxListeners`
- **Event Name**: Supports `conflux:tts-audio` event name

#### 3. `src/components/conflux/ConfluxTauriHost.tsx` (Modified)
- **API Update**: Updated call to `attachTauriConfluxListeners` with new signature

#### 4. `src/App.tsx` (Modified)
- **PTT Audio**: Added `soundManager.playAgentWake('conflux')` when PTT starts
- **Transcription**: Removed call to `voice_transcribe` (now handled by ElevenLabs streaming)

## Data Flow

### STT (Speech-to-Text)
```
Spacebar Press
    ↓
voice_capture_start (Tauri)
    ↓
cpal captures mic audio (16kHz mono f32)
    ↓
Convert to 16-bit PCM bytes
    ↓
Send to ElevenLabs WebSocket (StreamMessage::Audio)
    ↓
ElevenLabs returns partial/final transcripts
    ↓
Backend emits conflux:state with listeningCadence
    ↓
Frontend ConfluxOrbit receives event
    ↓
useConfluxController.runListeningCadence()
    ↓
Fairy pulses in sync with speech tokens
```

### TTS (Text-to-Speech)
```
Agent Response (LLM)
    ↓
voice_synthesize (Tauri)
    ↓
ElevenLabs TTS API (POST /v1/text-to-speech/{voice_id}/stream)
    ↓
Receive MP3 audio bytes
    ↓
Backend emits conflux:tts-audio event (base64 encoded)
    ↓
Frontend receives audio data
    ↓
Web Audio API decodes MP3 → plays to speakers
    ↓
ConfluxOrbit sets mode to 'speak' during playback
```

## API Keys
- **Location**: `src-tauri/.env`
- **Var**: `ELEVENLABS_API_KEY`
- **Verification**: Backend checks for key presence on startup

## Testing Checklist
- [ ] Rust compilation: ✅
- [ ] TypeScript compilation: ✅
- [ ] Audio capture works (cpal)
- [ ] WebSocket connects to ElevenLabs
- [ ] Real-time transcripts drive fairy animation
- [ ] TTS audio plays through speakers
- [ ] Fairy switches to 'speak' mode during TTS

## Notes
- **Blocking Whisper**: Removed/Disabled (replaced by ElevenLabs streaming)
- **Local TTS (Piper)**: Kept as fallback (commented out in `voice/mod.rs`)
- **MP3 Decoding**: Browser-native `decodeAudioData` handles MP3 playback
- **Visual Sync**: `speechCadence` payload drives fairy animation during TTS
