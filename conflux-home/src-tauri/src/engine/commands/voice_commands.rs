use tauri::{AppHandle, Manager, Window};
#[cfg(not(target_os = "android"))]
use crate::voice::{capture, stream, synth, openai};
#[cfg(not(target_os = "android"))]
use tokio::fs::File;
#[cfg(not(target_os = "android"))]
use tokio::io::AsyncWriteExt;

#[tauri::command]
#[cfg(not(target_os = "android"))]
pub async fn voice_start_stream(window: Window) -> Result<String, String> {
    let config = stream::StreamConfig::default();
    let _tx = stream::start_stream(config, window)
        .await
        .map_err(|e| format!("Failed to start ElevenLabs stream: {}", e))?;
    Ok("Stream started".to_string())
}

#[tauri::command]
#[cfg(not(target_os = "android"))]
pub async fn voice_synthesize(text: String, window: Window) -> Result<String, String> {
    println!("[TTS] voice_synthesize called with text: {}", text);
    
    // Try OpenAI first (works on free tier with usage-based billing)
    let openai_config = openai::OpenAIConfig::default();
    if !openai_config.api_key.is_empty() {
        match openai::stream_tts(&text, openai_config, window.clone()).await {
            Ok(_) => return Ok("Speech synthesized via OpenAI".to_string()),
            Err(e) => println!("[TTS] OpenAI failed: {}. Falling back to ElevenLabs...", e),
        }
    }

    // Fallback to ElevenLabs (requires paid plan for full access)
    let config = synth::TTSConfig::default();
    synth::stream_tts(&text, config, window)
        .await
        .map_err(|e| format!("TTS failed: {}", e))?;
    Ok("Speech synthesized".to_string())
}
