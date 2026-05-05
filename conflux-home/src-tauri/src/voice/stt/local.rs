// Local STT via whisper-rs (whisper.cpp GGML)
// Provides offline speech-to-text transcription using the AUDIO_BUFFER.
// Model: ggml-base.bin (~141MB, base quality, English + multilingual)

use crate::voice::capture::AUDIO_BUFFER;
use once_cell::sync::Lazy;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState};

/// Cached whisper context — loaded once, reused for all transcriptions.
/// Loading takes ~2-5s; inference takes ~1-5s depending on audio length.
static WHISPER_CTX: Lazy<Mutex<Option<WhisperContext>>> = Lazy::new(|| Mutex::new(None));

/// Find the whisper GGML model file.
/// Checks resource dir first, then the voice-cloning models directory.
fn find_model_path(app: Option<&tauri::AppHandle>) -> Option<PathBuf> {
    // 1. Check Tauri resource dir (bundled with installer)
    if let Some(app) = app {
        if let Ok(res_dir) = app.path().resource_dir() {
            let candidate = res_dir.join("models").join("whisper-cpp").join("ggml-base.bin");
            if candidate.exists() {
                log::info!("[LocalSTT] Found model in resource dir: {:?}", candidate);
                return Some(candidate);
            }
        }
    }

    // 2. Check the voice-cloning models directory (dev/local install)
    let dev_path = dirs::home_dir()
        .map(|h| h.join(".openclaw/voice-cloning/models/whisper-cpp/ggml-base.bin"))
        .filter(|p| p.exists());
    if let Some(path) = dev_path {
        log::info!("[LocalSTT] Found model in voice-cloning dir: {:?}", path);
        return Some(path);
    }

    log::warn!("[LocalSTT] No whisper model found");
    None
}

/// Load or get the cached WhisperContext.
fn get_or_load_context(app: Option<&tauri::AppHandle>) -> Result<(), String> {
    let mut ctx_guard = WHISPER_CTX.lock().map_err(|e| e.to_string())?;
    if ctx_guard.is_some() {
        return Ok(());
    }

    let model_path = find_model_path(app)
        .ok_or_else(|| "Whisper model not found. Expected ggml-base.bin in models/whisper-cpp/".to_string())?;

    log::info!("[LocalSTT] Loading whisper model from {:?}...", model_path);
    let start = std::time::Instant::now();

    let params = WhisperContextParameters::default();
    let ctx = WhisperContext::new_with_params(
        model_path.to_str().unwrap_or(""),
        params,
    ).map_err(|e| format!("Failed to load whisper model: {}", e))?;

    log::info!("[LocalSTT] Model loaded in {}ms", start.elapsed().as_millis());
    *ctx_guard = Some(ctx);
    Ok(())
}

/// Transcribe the current audio buffer contents using local whisper.
///
/// Reads from the shared AUDIO_BUFFER (f32 mono 16kHz), runs whisper inference,
/// and returns the transcript text. The buffer is NOT cleared — caller should
/// clear it after successful transcription.
///
/// # Arguments
/// * `app` - Tauri app handle for resource dir resolution
/// * `language` - Language code (e.g., "en") or None for auto-detect
///
/// # Returns
/// The transcribed text, or an error if inference fails.
pub fn transcribe_buffer(
    app: Option<&tauri::AppHandle>,
    language: Option<&str>,
) -> Result<String, String> {
    // 1. Ensure model is loaded
    get_or_load_context(app)?;

    // 2. Grab audio from buffer
    let audio: Vec<f32> = {
        let buf = AUDIO_BUFFER.lock().map_err(|e| e.to_string())?;
        if buf.is_empty() {
            return Err("Audio buffer is empty — no audio recorded".to_string());
        }
        log::info!("[LocalSTT] Buffer has {} samples ({:.1}s of audio)",
            buf.len(), buf.len() as f64 / 16000.0);
        buf.clone()
    };

    // 3. Run inference
    let mut ctx_guard = WHISPER_CTX.lock().map_err(|e| e.to_string())?;
    let ctx = ctx_guard.as_ref().ok_or("Whisper context not loaded")?;

    let mut state: WhisperState = ctx.create_state()
        .map_err(|e| format!("Failed to create whisper state: {}", e))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

    // Optimize for speed on CPU
    let n_threads = std::thread::available_parallelism()
        .map(|n| n.get() as i32)
        .unwrap_or(4)
        .min(8); // Cap at 8 to avoid oversubscribing
    params.set_n_threads(n_threads);
    params.set_language(language);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_audio_ctx(0); // 0 = use full context

    // Skip silence detection for short utterances
    params.set_no_speech_thold(0.6);
    params.set_entropy_thold(2.4);

    log::info!("[LocalSTT] Running inference ({} threads, {} samples)...",
        n_threads, audio.len());
    let start = std::time::Instant::now();

    state.full(params, &audio)
        .map_err(|e| format!("Whisper inference failed: {}", e))?;

    let elapsed = start.elapsed();
    log::info!("[LocalSTT] Inference completed in {}ms", elapsed.as_millis());

    // 4. Extract transcript
    let n_segments = state.full_n_segments();
    let mut transcript = String::new();

    for i in 0..n_segments {
        if let Some(segment) = state.get_segment(i) {
            if let Ok(text) = segment.to_str_lossy() {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    if !transcript.is_empty() {
                        transcript.push(' ');
                    }
                    transcript.push_str(trimmed);
                }
            }
        }
    }

    if transcript.is_empty() {
        log::warn!("[LocalSTT] No speech detected in audio");
        return Err("No speech detected in audio".to_string());
    }

    log::info!("[LocalSTT] Transcript: {:?}", transcript);
    Ok(transcript)
}

/// Check if the local whisper model is available and loaded.
pub fn is_model_available(app: Option<&tauri::AppHandle>) -> bool {
    find_model_path(app).is_some()
}

/// Preload the whisper model into memory (call at app startup for faster first transcription).
pub fn preload_model(app: &tauri::AppHandle) {
    let app_clone = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = get_or_load_context(Some(&app_clone)) {
            log::warn!("[LocalSTT] Preload failed: {}", e);
        } else {
            log::info!("[LocalSTT] Model preloaded successfully");
        }
    });
}
