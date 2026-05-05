// Local TTS via Kokoro ONNX
// Provides offline text-to-speech using the Kokoro-82M ONNX model.
// Calls a Python helper script for G2P + inference (CPU, ~2x realtime).

use base64::Engine;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

/// Find the Kokoro TTS Python script.
fn find_tts_script() -> Option<PathBuf> {
    // Check voice-cloning models dir (dev/local)
    let dev_path = dirs::home_dir()
        .map(|h| h.join(".openclaw/voice-cloning/models/kokoro/kokoro_tts.py"))
        .filter(|p| p.exists());
    if let Some(path) = dev_path {
        return Some(path);
    }

    // Check resource dir (bundled)
    // TODO: bundle in tauri.conf.json resources for release
    None
}

/// Find the Python venv with onnxruntime + eng_to_ipa installed.
fn find_python() -> String {
    // Check the dedicated TTS venv
    let venv_python = dirs::home_dir()
        .map(|h| h.join(".openclaw/voice-cloning/tts-venv/bin/python3"))
        .filter(|p| p.exists());
    if let Some(path) = venv_python {
        return path.to_string_lossy().to_string();
    }

    // Fallback to system python3
    "python3".to_string()
}

/// Generate speech using local Kokoro ONNX model.
///
/// # Arguments
/// * `text` - Text to synthesize
/// * `voice` - Voice name (e.g., "am_onyx") or None for default
/// * `app` - Tauri app handle for emitting events
///
/// # Returns
/// Ok(()) on success, or error string.
pub async fn synthesize(
    text: &str,
    voice: Option<&str>,
    app: AppHandle,
) -> Result<(), String> {
    let script_path = find_tts_script()
        .ok_or_else(|| "Kokoro TTS script not found. Expected kokoro_tts.py in voice-cloning/models/kokoro/".to_string())?;

    let python = find_python();
    let voice_name = voice.unwrap_or("am_onyx");

    log::info!("[KokoroTTS] Synthesizing {:?} with voice {:?}", text, voice_name);

    // Emit Speaking state
    let _ = app.emit(
        "conflux:state",
        serde_json::json!({
            "state": "Speaking",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        }),
    );

    // Run the Python script
    let output = tokio::process::Command::new(&python)
        .arg(script_path.to_string_lossy().to_string())
        .arg(text)
        .arg(voice_name)
        .arg("1.0")  // speed
        .output()
        .await
        .map_err(|e| format!("Failed to run Kokoro TTS: {}. Is Python installed?", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Kokoro TTS failed: {}", stderr));
    }

    let wav_bytes = output.stdout;
    if wav_bytes.is_empty() {
        return Err("Kokoro TTS returned empty audio".to_string());
    }

    // Log stderr (contains timing info)
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.is_empty() {
        log::info!("[KokoroTTS] {}", stderr.trim());
    }

    // Base64 encode for frontend
    let audio_base64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);

    // Emit cadence for visual sync
    let tokens: Vec<String> = text.split_whitespace().map(|s| s.to_string()).collect();

    let _ = app.emit(
        "conflux:tts-audio",
        serde_json::json!({
            "audio_base64": audio_base64,
            "sample_rate": 24000,
            "format": "wav",
            "cadence": {
                "tokens": tokens,
                "intervalMs": 110,
                "strength": 7,
                "burstsPerToken": 1,
                "route": ["speech", "memory"],
            }
        }),
    );

    // Emit Idle state
    let _ = app.emit(
        "conflux:state",
        serde_json::json!({
            "state": "Idle",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "source": "kokoro_tts",
        }),
    );

    Ok(())
}

/// Check if local Kokoro TTS is available.
pub fn is_available() -> bool {
    find_tts_script().is_some()
}
