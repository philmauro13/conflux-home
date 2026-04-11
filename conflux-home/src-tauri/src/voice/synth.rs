// ElevenLabs Text-to-Speech Synthesis
// Streams audio data from ElevenLabs TTS API for real-time playback.

use anyhow::{Context, Result};
use reqwest::{Client, StatusCode};
use serde_json::json;
use std::io::{self, Write};
use tauri::{Emitter, Window};
use base64::Engine;

#[derive(Debug, Clone)]
pub struct TTSConfig {
    pub api_key: String,
    pub voice_id: String,
    pub model_id: String,
    pub latency: String,
    pub sample_rate: u32,
}

impl Default for TTSConfig {
    fn default() -> Self {
        Self {
            api_key: {
                let engine = crate::engine::get_engine();
                engine.db().get_config("elevenlabs_key").ok().flatten().filter(|k| !k.is_empty())
                    .or_else(|| engine.db().get_config("studio_elevenlabs_key").ok().flatten().filter(|k| !k.is_empty()))
                    .or_else(|| std::env::var("ELEVENLABS_API_KEY").ok().filter(|k| !k.is_empty()))
                    .or_else(|| option_env!("ELEVENLABS_API_KEY").map(|s| s.to_string()).filter(|k| !k.is_empty()))
                    .unwrap_or_default()
            },
            voice_id: "JBFqnCBsd6RMkjVDRZzb".to_string(), // "George" (Free tier compatible)
            model_id: "eleven_turbo_v2_5".to_string(), // Free tier compatible model
            latency: "low".to_string(),
            sample_rate: 44100,
        }
    }
}

/// Stream TTS audio from ElevenLabs and emit audio envelope events to the Fairy.
pub async fn stream_tts(
    text: &str,
    config: TTSConfig,
    window: Window,
) -> Result<(), Box<dyn std::error::Error>> {
    if config.api_key.is_empty() {
        return Err(Box::from("ELEVENLABS_API_KEY is not set"));
    }

    // Emit Speaking state when TTS starts
    let _ = window.emit("conflux:state", serde_json::json!({
        "state": "Speaking",
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }));

    let client = Client::new();
    let url = format!(
        "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream",
        voice_id = config.voice_id
    );

    let payload = json!({
        "text": text,
        "model_id": config.model_id,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    });

    let response = client
        .post(&url)
        .header("xi-api-key", &config.api_key)
        .header("Content-Type", "application/json")
        .header("accept", "audio/mpeg")
        .json(&payload)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(Box::from(format!("TTS API Error {}: {}", status, body)));
    }

    // Simulate phoneme timing based on word count for pulse syncing
    // (ElevenLabs does not expose detailed phoneme timing in the basic streaming API)
    // In a production implementation, we would parse the audio stream amplitude.
    let tokens: Vec<String> = text.split_whitespace().map(|s| s.to_string()).collect();
    
    // Emit cadence immediately for visual sync (sends conflux:state event)
    let event_payload = serde_json::json!({
        "state": "Speaking",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "speechCadence": {
            "tokens": tokens,
            "intervalMs": 100, // Adjust based on speaking speed
            "strength": 8,
            "burstsPerToken": 1,
            "route": ["memory", "reasoning", "speech"],
        },
        "mode": "speak",
        "status": "Speaking...",
    });
    
    let _ = window.emit("conflux:state", event_payload);

    // Stream the audio response and convert to PCM for the frontend
    let bytes = response.bytes().await?;
    
    // Convert MP3 bytes to base64 to pass to frontend for playback
    use base64::Engine;
    let audio_base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    let _ = window.emit("conflux:tts-audio", serde_json::json!({
        "audio_base64": audio_base64,
        "sample_rate": 24000, // ElevenLabs default
        "cadence": {
            "tokens": tokens,
            "intervalMs": 110,
            "strength": 7,
            "burstsPerToken": 1,
            "route": ["speech", "memory"],
        }
    }));

    // Emit Idle state after TTS playback completes
    log::info!("[TTS] Emitting Idle state after playback complete");
    let _ = window.emit("conflux:state", serde_json::json!({
        "state": "Idle",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "source": "synth.rs",
    }));

    Ok(())
}
