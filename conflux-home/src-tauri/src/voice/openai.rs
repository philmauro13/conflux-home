// OpenAI Voice Integration (TTS & STT)
// Supports OpenAI TTS (voices: alloy, echo, fable, onyx, nova, shimmer)
// and Whisper API for speech-to-text.

use anyhow::{Context, Result};
use reqwest::Client;
use serde_json::json;
use tauri::{Emitter, Window};

#[derive(Debug, Clone)]
pub struct OpenAIConfig {
    pub api_key: String,
    pub model_tts: String,   // "tts-1" or "tts-1-hd"
    pub voice: String,       // "alloy", "echo", "fable", "onyx", "nova", "shimmer"
    pub model_stt: String,   // "whisper-1"
}

impl Default for OpenAIConfig {
    fn default() -> Self {
        Self {
            api_key: std::env::var("OPENAI_API_KEY")
                .ok()
                .filter(|k| !k.is_empty())
                .or_else(|| option_env!("OPENAI_API_KEY").map(|s| s.to_string()).filter(|k| !k.is_empty()))
                .unwrap_or_default(),
            model_tts: "tts-1".to_string(),
            voice: "nova".to_string(), // Friendly, clear voice
            model_stt: "whisper-1".to_string(),
        }
    }
}

/// Stream TTS audio from OpenAI and emit events to the Fairy.
pub async fn stream_tts(text: &str, config: OpenAIConfig, window: Window) -> Result<(), Box<dyn std::error::Error>> {
    if config.api_key.is_empty() {
        return Err(Box::from("OPENAI_API_KEY is not set"));
    }

    let client = Client::new();
    let url = "https://api.openai.com/v1/audio/speech";

    let payload = json!({
        "model": config.model_tts,
        "input": text,
        "voice": config.voice,
        "response_format": "mp3" // Browser can decode this natively
    });

    let response = client
        .post(url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(Box::from(format!("OpenAI TTS API Error {}: {}", status, body)));
    }

    let bytes = response.bytes().await?;
    use base64::Engine;
    let audio_base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    // Parse text into tokens for animation
    let tokens: Vec<String> = text.split_whitespace().map(|s| s.to_string()).collect();

    let _ = window.emit("conflux:tts-audio", serde_json::json!({
        "audio_base64": audio_base64,
        "sample_rate": 24000,
        "cadence": {
            "tokens": tokens,
            "intervalMs": 110,
            "strength": 7,
            "burstsPerToken": 1,
            "route": ["speech", "memory"],
        }
    }));

    Ok(())
}

/// Send audio to OpenAI Whisper API for transcription.
/// Returns the transcribed text.
pub async fn transcribe_audio(audio_data: Vec<u8>, config: OpenAIConfig) -> Result<String> {
    if config.api_key.is_empty() {
        return Err(anyhow::anyhow!("OPENAI_API_KEY is not set"));
    }

    let client = Client::new();
    let url = "https://api.openai.com/v1/audio/transcriptions";

    // Construct multipart form data
    let part = reqwest::multipart::Part::bytes(audio_data)
        .file_name("audio.wav")
        .mime_str("audio/wav")?;

    let form = reqwest::multipart::Form::new()
        .text("model", config.model_stt)
        .part("file", part);

    let response = client
        .post(url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .multipart(form)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!("OpenAI STT API Error {}: {}", status, body));
    }

    #[derive(serde::Deserialize)]
    struct WhisperResponse {
        text: String,
    }

    let result: WhisperResponse = response.json().await?;
    Ok(result.text)
}
