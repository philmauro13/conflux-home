// ElevenLabs WebSocket streaming STT
// Replaces the blocking local Whisper inference with a real-time streaming transcription.

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message, tungstenite::client::IntoClientRequest};
use tauri::{Emitter, Window};
use base64::Engine;

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
                engine.db().get_config("elevenlabs_key").ok().flatten().filter(|k| !k.is_empty())
                    .or_else(|| engine.db().get_config("studio_elevenlabs_key").ok().flatten().filter(|k| !k.is_empty()))
                    .or_else(|| std::env::var("ELEVENLABS_API_KEY").ok().filter(|k| !k.is_empty()))
                    .or_else(|| option_env!("ELEVENLABS_API_KEY").map(|s| s.to_string()).filter(|k| !k.is_empty()))
                    .unwrap_or_default()
            },
            sample_rate: 16000,
            model_id: Some("scribe_v1".to_string()),
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
    Audio(Vec<u8>), // PCM 16-bit LE mono bytes
    StreamStop,
}

/// Start an ElevenLabs streaming transcription session.
///
/// Returns a `Sender` that accepts raw PCM audio bytes.
/// The caller should feed audio into this sender while PTT is active.
pub async fn start_stream(
    config: StreamConfig,
    window: Window,
) -> Result<mpsc::Sender<StreamMessage>> {
    let api_key = &config.api_key;
    if api_key.is_empty() {
        return Err(anyhow::anyhow!(
            "ELEVENLABS_API_KEY is not set or is empty. Check your .env file."
        ));
    }

    let model_id = config.model_id.unwrap_or_else(|| "scribe_v1".into());
    let url = format!(
        "wss://api.elevenlabs.io/v1/speech-to-text?model_id={}&include_interim={}&language_code=en",
        model_id, config.include_interim
    );

    println!("[ElevenLabs STT] Connecting to {}", url);

    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    
    let mut request = url.into_client_request()
        .map_err(|e| anyhow::anyhow!("Failed to create client request: {}", e))?;
    
    // Add ElevenLabs specific headers
    request.headers_mut().insert("xi-api-key", api_key.parse().unwrap());
    request.headers_mut().insert("Content-Type", "application/octet-stream".parse().unwrap());
    
    println!("[ElevenLabs STT] Request prepared with API key starting with: {}", &api_key[..8]);
    
    let (socket, response) = connect_async(request).await.map_err(|e| {
        println!("[ElevenLabs STT] Connection failed: {}", e);
        anyhow::anyhow!("WebSocket connection failed: {}", e)
    })?;

    println!("[ElevenLabs STT] Connected. Status: {}", response.status());

    println!("[ElevenLabs STT] Connected. Status: {}", response.status());

    let (mut ws_sender, mut ws_receiver) = socket.split();

    let (audio_tx, mut audio_rx) = mpsc::channel::<StreamMessage>(64);
    
    // Set up a task to send initial ping/keepalive if needed, or start streaming immediately
    // (Sending empty audio or a "start" signal is usually not required for ElevenLabs STT,
    // but waiting for the first audio frame is standard.)

    // ── Incoming Messages (Transcripts) ───────────────────────────────────
    let window_clone = window.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(msg) = ws_receiver.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    // Parse JSON response from ElevenLabs
                    if let Ok(transcript) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(text_val) = transcript.get("text").and_then(|v| v.as_str()) {
                            let is_final = transcript.get("is_final").and_then(|v| v.as_bool()).unwrap_or(false);
                            
                            let chunk = TranscriptChunk {
                                text: text_val.to_string(),
                                is_final,
                            };

                            log::debug!("[ElevenLabs STT] Chunk: {:?} (final: {})", chunk.text, chunk.is_final);

                            // Emit to frontend for the Fairy to react
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
                StreamMessage::Audio(bytes) => {
                    let _ = ws_sender.send(Message::Binary(bytes)).await;
                }
                StreamMessage::StreamStop => {
                    log::info!("[ElevenLabs STT] Closing stream on request.");
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
