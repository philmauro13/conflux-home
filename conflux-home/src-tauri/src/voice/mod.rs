// Voice Engine — Speech capture and transcription
// Uses cpal for audio capture.
// Supports ElevenLabs and OpenAI for cloud STT/TTS.
// Supports whisper-rs for local/offline STT.
// Supports Kokoro ONNX for local/offline TTS.

pub mod capture;
pub mod model;
pub mod openai;
pub mod stt;
pub mod stream;
pub mod synth;
pub mod tts;
