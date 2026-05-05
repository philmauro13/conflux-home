// ElevenLabs WebSocket streaming STT
// Replaces the blocking local Whisper inference with a real-time streaming transcription.

use anyhow::{Context, Result};
use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use hound::{WavWriter, WavSpec};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Window};
use tokio::sync::mpsc;
use tokio_tungstenite::{
    connect_async, tungstenite::client::IntoClientRequest, tungstenite::protocol::Message,
};

/// Holds the final transcript from the current streaming session.
/// Accessed from both the async WebSocket task (write) and the sync Tauri command (read).
pub static STREAMING_TRANSCRIPT: Lazy<Mutex<Option<String>>> =
    Lazy::new(|| Mutex::new(None));

/// Response from POST /v1/single-use-token/{token_type}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SingleUseTokenResponse {
    token: String,
}

/// Configuration for the ElevenLabs streaming session.
#[derive(Debug, Clone)]
pub struct StreamConfig {
    pub api_key: String,
    pub sample_rate: u32,
    pub model_id: Option<String>,
    pub include_interim: bool,
}

impl Default for StreamConfig {
    fn default() -> Self {
        Self {
            api_key: {
                let engine = crate::engine::get_engine();
                engine
                    .db()
                    .get_config("elevenlabs_key")
                    .ok()
                    .flatten()
                    .filter(|k| !k.is_empty())
                    .or_else(|| {
                        engine
                            .db()
                            .get_config("studio_elevenlabs_key")
                            .ok()
                            .flatten()
                            .filter(|k| !k.is_empty())
                    })
                    .or_else(|| {
                        std::env::var("ELEVENLABS_API_KEY")
                            .ok()
                            .filter(|k| !k.is_empty())
                    })
                    .or_else(|| {
                        option_env!("ELEVENLABS_API_KEY")
                            .map(|s| s.to_string())
                            .filter(|k| !k.is_empty())
                    })
                    .unwrap_or_default()
            },
            sample_rate: 16000,
            model_id: Some("scribe_v2_realtime".to_string()),
            include_interim: true,
        }
    }
}

/// Represents a partial (interim) or final transcript from the stream.
#[derive(Debug, Serialize, Clone)]
pub struct TranscriptChunk {
    pub text: String,
    pub is_final: bool,
}

/// Internal message passed from the audio capture thread to the WebSocket sender.
pub enum StreamMessage {
    Audio(Vec<i16>), // PCM 16-bit LE mono samples (decoded from bytes)
    StreamStop,
}

/// Encode raw PCM 16-bit mono audio as a WAV RIFF container, then base64-encode it.
/// ElevenLabs expects audio in WAV RIFF format, not raw PCM bytes.
fn encode_audio_wav(pcm_samples: &[i16]) -> String {
    let spec = WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut buffer = Vec::new();
    {
        let mut writer = WavWriter::new(Cursor::new(&mut buffer), spec)
            .expect("failed to create WAV writer");
        for &sample in pcm_samples {
            writer.write_sample(sample).expect("failed to write sample");
        }
        writer.finalize().expect("failed to finalize WAV");
    }
    use base64::engine::general_purpose::STANDARD as BASE64;
    BASE64.encode(&buffer)
}

/// Obtain a short-lived single-use token for WSS authentication.
/// This is the required two-step auth flow: REST → token → WSS.
async fn get_single_use_token(api_key: &str) -> Result<String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe")
        .header("xi-api-key", api_key)
        .header("Content-Length", "0")
        .send()
        .await
        .context("Failed to request single-use token")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!(
            "Single-use token request failed ({}): {}",
            status,
            body
        ));
    }

    let token_resp: SingleUseTokenResponse =
        resp.json().await.context("Failed to parse token response")?;

    Ok(token_resp.token)
}

/// Start an ElevenLabs streaming transcription session.
///
/// Returns an `UnboundedSender` that accepts raw PCM audio bytes.
/// The caller should feed audio into this sender while PTT is active.
pub async fn start_stream(
    config: StreamConfig,
    window: Window,
) -> Result<mpsc::UnboundedSender<StreamMessage>> {
    // Clear any stale transcript from a previous session
    STREAMING_TRANSCRIPT.lock().unwrap().take();

    let api_key = &config.api_key;
    if api_key.is_empty() {
        return Err(anyhow::anyhow!(
            "ELEVENLABS_API_KEY is not set or is empty. Check your .env file."
        ));
    }

    // Step 1: Get a short-lived single-use token via REST (required auth for WSS)
    println!("[ElevenLabs STT] Obtaining single-use token...");
    let session_token = get_single_use_token(api_key).await?;
    println!(
        "[ElevenLabs STT] Token received: {}...",
        &session_token[..session_token.len().min(12)]
    );

    let mut model_id = config.model_id.unwrap_or_else(|| "scribe_v2_realtime".into());
    if model_id == "scribe_v1" || model_id == "scribe_v2" {
        model_id = "scribe_v2_realtime".to_string();
    }

    // Step 2: Connect to WSS using the session token as URL param
    // Use commit_strategy=manual so we control when to finalize (avoids VAD timing issues)
    let url = format!(
        "wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id={}&audio_format=pcm_16000&commit_strategy=manual&token={}",
        model_id, session_token
    );

    println!("[ElevenLabs STT] Connecting to WSS...");

    let request = url
        .into_client_request()
        .map_err(|e| anyhow::anyhow!("Failed to create client request: {}", e))?;

    let (socket, response) = connect_async(request).await.map_err(|e| {
        println!("[ElevenLabs STT] Connection failed: {}", e);
        anyhow::anyhow!("WebSocket connection failed: {}", e)
    })?;

    println!(
        "[ElevenLabs STT] Connected. Status: {}",
        response.status()
    );

    let (mut ws_sender, mut ws_receiver) = socket.split();

    let (audio_tx, mut audio_rx) = mpsc::unbounded_channel::<StreamMessage>();

    // Shared state: accumulated transcript text updated by recv_task, read by send_task
    let accumulated_text = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    let accumulated_text_send = accumulated_text.clone();
    let accumulated_text_recv = accumulated_text.clone();

    // ── Incoming Messages (Transcripts) ───────────────────────────────────
    let window_clone = window.clone();
    let accumulated_text_clone = accumulated_text_recv;
    let recv_task = tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    // Parse JSON response from ElevenLabs
                    // Protocol: { "message_type": "partial_transcript" | "committed_transcript" | "session_started", "text": "..." }
                    if let Ok(transcript) = serde_json::from_str::<serde_json::Value>(&text) {
                        let message_type = transcript.get("message_type").and_then(|v| v.as_str());

                        match message_type {
                            Some("session_started") => {
                                log::info!("[ElevenLabs STT] Session started OK");
                            }
                            Some("partial_transcript") | Some("committed_transcript") | Some("committed_transcript_with_timestamps") => {
                                let is_final = message_type != Some("partial_transcript");
                                let text_val = transcript.get("text").and_then(|v| v.as_str());

                                if let Some(text_val) = text_val {
                                    let chunk = TranscriptChunk { text: text_val.to_string(), is_final };

                                    log::debug!(
                                        "[ElevenLabs STT] Chunk: {:?} (final: {}, type: {:?})",
                                        chunk.text, chunk.is_final, message_type
                                    );

                                    let event_payload = serde_json::json!({
                                        "listeningCadence": {
                                            "tokens": chunk.text.split_whitespace().collect::<Vec<_>>(),
                                            "intervalMs": 90,
                                            "strength": 9,
                                            "burstsPerToken": 2,
                                            "route": ["perception", "reasoning"],
                                        },
                                        "mode": "listen",
                                        "status": if is_final { "Transcript finalized" } else { "Receiving speech..." },
                                    });
                                    let _ = window_clone.emit("conflux:state", event_payload);

                                    if is_final {
                                        let trimmed = chunk.text.trim().to_string();
                                        if !trimmed.is_empty() {
                                            let mut transcript_guard = STREAMING_TRANSCRIPT.lock().unwrap();
                                            *transcript_guard = Some(trimmed.clone());
                                            // Update accumulated text so the next audio chunk knows context
                                            if let Ok(mut acc) = accumulated_text_clone.lock() {
                                                *acc = trimmed.clone();
                                            }
                                            let _ = window_clone.emit(
                                                "conflux:transcription",
                                                serde_json::json!({ "text": trimmed, "is_final": true }),
                                            );
                                        }
                                    } else {
                                        // Update accumulated text on partial too so we have latest context
                                        let trimmed = chunk.text.trim().to_string();
                                        if !trimmed.is_empty() {
                                            if let Ok(mut acc) = accumulated_text_clone.lock() {
                                                *acc = trimmed;
                                            }
                                        }
                                    }
                                }
                            }
                            Some("error") | Some("auth_error") | Some("quota_exceeded") => {
                                let err = transcript.get("error").and_then(|v| v.as_str()).unwrap_or("unknown");
                                log::error!("[ElevenLabs STT] Server error: {}", err);
                            }
                            _ => {
                                // Ignorable: rate_limited, throttled, etc.
                                log::debug!("[ElevenLabs STT] Unhandled message type: {:?}", message_type);
                            }
                        }
                    }
                }
                Ok(Message::Close(_)) | Err(_) => {
                    break;
                }
                _ => {}
            }
        }
        log::info!("[ElevenLabs STT] Stream closed.");
    });

    // ── Outgoing Messages (Audio) ────────────────────────────────────────
    let send_task = tokio::spawn(async move {
        while let Some(msg) = audio_rx.recv().await {
            match msg {
                StreamMessage::Audio(samples) => {
                    // ElevenLabs expects a WAV RIFF container, not raw PCM
                    let audio_b64 = encode_audio_wav(&samples);
                    let prev = accumulated_text_send.lock().unwrap().clone();
                    let payload = serde_json::json!({
                        "message_type": "input_audio_chunk",
                        "audio_base_64": audio_b64,
                        "sample_rate": 16000,
                        "previous_text": prev
                    });
                    if let Err(e) = ws_sender.send(Message::Text(payload.to_string())).await {
                        log::warn!("[ElevenLabs STT] Audio send failed: {}", e);
                    }
                }
                StreamMessage::StreamStop => {
                    log::info!("[ElevenLabs STT] Committing and closing stream on request.");
                    // Send an empty audio chunk with commit=true to trigger final transcript
                    let commit_payload = serde_json::json!({
                        "message_type": "input_audio_chunk",
                        "audio_base_64": "",
                        "commit": true,
                        "sample_rate": 16000
                    });
                    let _ = ws_sender.send(Message::Text(commit_payload.to_string())).await;
                    // Give the server a moment to respond with the final transcript
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    let _ = ws_sender.close().await;
                    break;
                }
            }
        }
    });

    // Cleanup
    tokio::spawn(async {
        let _ = tokio::join!(recv_task, send_task);
    });

    Ok(audio_tx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_stream_config_default() {
        let config = StreamConfig::default();
        assert!(!config.api_key.is_empty());
    }
}
