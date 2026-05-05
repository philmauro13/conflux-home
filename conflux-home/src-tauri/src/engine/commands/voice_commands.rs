#[cfg(not(target_os = "android"))]
use crate::voice::{capture, openai, stream, synth};
use tauri::{AppHandle, Emitter, Manager, Window};
#[cfg(not(target_os = "android"))]
use tokio::fs::File;
#[cfg(not(target_os = "android"))]
use tokio::io::AsyncWriteExt;

#[tauri::command]
#[cfg(not(target_os = "android"))]
pub async fn voice_start_stream(window: Window) -> Result<String, String> {
    // Skip ElevenLabs streaming when engine is in offline mode
    if crate::engine::is_offline_mode() {
        println!("[STT] Engine offline mode — skipping ElevenLabs streaming");
        return Ok("Stream skipped (offline mode)".to_string());
    }

    let config = stream::StreamConfig::default();
    let _tx = stream::start_stream(config, window)
        .await
        .map_err(|e| format!("Failed to start ElevenLabs stream: {}", e))?;
    Ok("Stream started".to_string())
}

#[tauri::command]
#[cfg(not(target_os = "android"))]
pub async fn voice_synthesize(app: AppHandle, text: String) -> Result<String, String> {
    println!("[TTS] voice_synthesize called with text: {}", text);

    // ── Route based on voice mode setting ──
    // Engine offline mode overrides voice_mode config
    let voice_mode = if crate::engine::is_offline_mode() {
        println!("[TTS] Engine offline mode active — forcing offline routing");
        "offline".to_string()
    } else {
        let engine = crate::engine::get_engine();
        engine.db().get_config("voice_mode")
            .ok().flatten().unwrap_or_else(|| "cloud".to_string())
    };

    match voice_mode.as_str() {
        "offline" => {
            // Offline mode: Kokoro only
            println!("[TTS] Offline mode — using Kokoro");
            if crate::voice::tts::is_available() {
                crate::voice::tts::synthesize(&text, None, app).await?;
                return Ok("Speech synthesized via Kokoro".to_string());
            } else {
                return Err("Kokoro TTS not available. Model files missing.".to_string());
            }
        }
        "hybrid" => {
            // Hybrid: try Kokoro first, fall back to cloud
            println!("[TTS] Hybrid mode — trying Kokoro first");
            if crate::voice::tts::is_available() {
                match crate::voice::tts::synthesize(&text, None, app.clone()).await {
                    Ok(_) => return Ok("Speech synthesized via Kokoro".to_string()),
                    Err(e) => println!("[TTS] Kokoro failed: {}, falling back to cloud", e),
                }
            }
        }
        _ => {
            // Cloud mode (default): try ElevenLabs first, fall back to Kokoro
            println!("[TTS] Cloud mode — trying ElevenLabs first");
        }
    }

    // ── Cloud TTS path (ElevenLabs) ──
    let config = synth::TTSConfig::default();
    match synth::stream_tts(&text, config, app.clone()).await {
        Ok(_) => return Ok("Speech synthesized via ElevenLabs".to_string()),
        Err(e) => println!("[TTS] ElevenLabs failed: {}. Trying alternatives...", e),
    }

    // Fallback to Kokoro if available
    if crate::voice::tts::is_available() {
        println!("[TTS] Falling back to Kokoro");
        match crate::voice::tts::synthesize(&text, None, app.clone()).await {
            Ok(_) => return Ok("Speech synthesized via Kokoro".to_string()),
            Err(e) => println!("[TTS] Kokoro failed: {}", e),
        }
    }

    // Fallback to OpenAI TTS
    let openai_config = openai::OpenAIConfig::default();
    if !openai_config.api_key.is_empty() {
        match openai::stream_tts(&text, openai_config, app.clone()).await {
            Ok(_) => return Ok("Speech synthesized via OpenAI".to_string()),
            Err(e) => {
                let _ = app.emit(
                    "conflux:state",
                    serde_json::json!({
                        "state": "Idle",
                        "source": "backend",
                        "message": "TTS unavailable"
                    }),
                );
                return Err(format!("All TTS providers failed: {}", e));
            }
        }
    }

    Err("No TTS provider available".to_string())
}
