// Audio capture via cpal
// Records 16kHz mono f32 samples from the default input device.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use once_cell::sync::Lazy;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::time::Duration;
use tauri::{Emitter, Window};
use tokio::sync::mpsc::Sender;
use crate::voice::stream::{StreamMessage, start_stream, StreamConfig};
use crate::engine::state_events::ConfluxState;

pub static AUDIO_BUFFER: Lazy<Arc<Mutex<Vec<f32>>>> = Lazy::new(|| Arc::new(Mutex::new(Vec::new())));
static IS_RECORDING: Lazy<Arc<AtomicBool>> = Lazy::new(|| Arc::new(AtomicBool::new(false)));
static ELEVENLABS_SENDER: Lazy<Arc<Mutex<Option<Sender<StreamMessage>>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));
// cpal::Stream is not Send, so we use a thread-local holder instead
thread_local! {
    static STREAM_HANDLE: std::cell::RefCell<Option<cpal::Stream>> = std::cell::RefCell::new(None);
}

/// Get the shared audio buffer (Arc-wrapped).
pub fn get_audio_buffer() -> Arc<Mutex<Vec<f32>>> {
    AUDIO_BUFFER.clone()
}

/// Whether we are currently recording.
pub fn is_recording() -> bool {
    IS_RECORDING.load(Ordering::Relaxed)
}

/// List available input device names.
pub fn list_input_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices = host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate input devices: {}", e))?;

    let mut names = Vec::new();
    for device in devices {
        if let Ok(name) = device.name() {
            names.push(name);
        }
    }
    Ok(names)
}

/// Check if at least one input device is available.
pub fn input_device_available() -> bool {
    match cpal::default_host().default_input_device() {
        Some(_) => true,
        None => false,
    }
}

/// Get microphone status for diagnostics (useful on Windows).
pub fn microphone_status() -> serde_json::Value {
    let host = cpal::default_host();
    let default_available = host.default_input_device().is_some();
    let devices = list_input_devices().unwrap_or_default();

    #[cfg(target_os = "windows")]
    let guidance = if !default_available {
        "No microphone detected. Check: Settings → Privacy & Security → Microphone → Turn ON 'Microphone access' and 'Let desktop apps access your microphone'. Restart this app after changing."
    } else {
        "Microphone available."
    };

    #[cfg(not(target_os = "windows"))]
    let guidance = if !default_available {
        "No microphone detected. Check your system audio input settings."
    } else {
        "Microphone available."
    };

    serde_json::json!({
        "available": default_available,
        "device_count": devices.len(),
        "devices": devices,
        "guidance": guidance,
    })
}

/// Start recording from the default input device.
/// Captures audio at 16kHz mono f32.
pub fn start_recording(window: Window) -> Result<String, String> {
    if is_recording() {
        return Err("Already recording".to_string());
    }

    // Start ElevenLabs streaming STT in the background
    let window_clone = window.clone();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let config = StreamConfig::default();
            match start_stream(config, window_clone).await {
                Ok(sender) => {
                    let mut tx = ELEVENLABS_SENDER.lock().unwrap();
                    *tx = Some(sender);
                    log::info!("[STT] ElevenLabs streaming started");
                }
                Err(e) => {
                    log::error!("[STT] Failed to start ElevenLabs stream: {}", e);
                }
            }
        });
    });

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| {
            #[cfg(target_os = "windows")]
            return format!(
                "No microphone found on Windows. To fix:\n\
                 1. Open Windows Settings (Win+I)\n\
                 2. Go to Privacy & Security → Microphone\n\
                 3. Turn ON 'Microphone access'\n\
                 4. Turn ON 'Let desktop apps access your microphone'\n\
                 5. Restart this app\n\
                 Note: This app captures audio directly (not through the browser)."
            );
            #[cfg(not(target_os = "windows"))]
            return "No input device available. Check your microphone.".to_string();
        })?;

    let device_name = device.name().unwrap_or_else(|_| "unknown".to_string());

    // Emit Listening state (capture started)
    let _ = window.emit("conflux:state", serde_json::json!({
        "state": "Listening",
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }));

    // Find a supported config: prefer 16000 Hz mono f32
    let supported_configs = device
        .supported_input_configs()
        .map_err(|e| format!("Failed to get supported configs: {}", e))?;

    // Try to find 16kHz mono f32, or fall back to the first available config
    let config = {
        let mut found = None;
        for config_range in supported_configs {
            if config_range.channels() == 1
                && config_range.sample_format() == cpal::SampleFormat::F32
            {
                let min_rate = config_range.min_sample_rate().0;
                let max_rate = config_range.max_sample_rate().0;
                if min_rate <= 16000 && max_rate >= 16000 {
                    found = Some(config_range.with_sample_rate(cpal::SampleRate(16000)));
                    break;
                }
                // Even if exact 16kHz isn't supported, take this config (we'll resample)
                if found.is_none() {
                    found = Some(config_range.with_sample_rate(cpal::SampleRate(
                        std::cmp::min(max_rate, 48000),
                    )));
                }
            }
        }
        // Fallback: just use the default input config
        found.unwrap_or_else(|| {
            device
                .default_input_config()
                .expect("No default input config available")
        })
    };

    let channels = config.channels();
    let sample_rate = config.sample_rate().0;

    // Clear buffer
    {
        let mut buf = AUDIO_BUFFER.lock().map_err(|e| e.to_string())?;
        buf.clear();
    }

    let buffer = AUDIO_BUFFER.clone();
    let recording_flag = IS_RECORDING.clone();

    let stream = device
        .build_input_stream(
            &config.into(),
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if !recording_flag.load(Ordering::Relaxed) {
                    return;
                }

                // Convert to mono if stereo/multi-channel
                let mono: Vec<f32> = if channels > 1 {
                    data.chunks(channels as usize)
                        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
                        .collect()
                } else {
                    data.to_vec()
                };

                // Resample from sample_rate to 16000 Hz if needed
                let resampled = if sample_rate != 16000 {
                    let ratio = sample_rate as f64 / 16000.0;
                    let new_len = (mono.len() as f64 / ratio) as usize;
                    let mut out = Vec::with_capacity(new_len);
                    for i in 0..new_len {
                        let src_idx = (i as f64 * ratio) as usize;
                        if src_idx < mono.len() {
                            out.push(mono[src_idx]);
                        }
                    }
                    out
                } else {
                    mono
                };

                if let Ok(mut buf) = buffer.lock() {
                    buf.extend_from_slice(&resampled);
                }

                // Send audio data to ElevenLabs stream sender
                // Convert f32 samples to 16-bit PCM bytes for ElevenLabs
                if let Some(tx) = ELEVENLABS_SENDER.lock().ok().and_then(|s| s.clone()) {
                    let pcm_bytes: Vec<u8> = resampled.iter().flat_map(|&s| {
                        let clamped = s.max(-1.0).min(1.0);
                        let i16_val = (clamped * i16::MAX as f32) as i16;
                        i16_val.to_le_bytes()
                    }).collect();
                    let _ = tx.try_send(StreamMessage::Audio(pcm_bytes));
                }
            },
            |err| {
                log::error!("Audio capture error: {}", err);
            },
            None,
        )
        .map_err(|e| format!("Failed to build input stream: {}", e))?;

    stream.play().map_err(|e| format!("Failed to start stream: {}", e))?;

    IS_RECORDING.store(true, Ordering::Relaxed);

    // Store stream so it stays alive (thread_local since Stream is not Send)
    STREAM_HANDLE.with(|cell| {
        *cell.borrow_mut() = Some(stream);
    });

    log::info!("Voice recording started on '{}' ({}Hz, {}ch)", device_name, sample_rate, channels);
    Ok(format!("Recording started on '{}'", device_name))
}

/// Stop recording and return the number of samples captured.
pub fn stop_recording(window: Window) -> Result<u64, String> {
    if !is_recording() {
        return Err("Not recording".to_string());
    }

    IS_RECORDING.store(false, Ordering::Relaxed);

    // Don't emit Idle state here - let the backend handle the transition to thinking
    // This prevents the fairy from dropping to the dock before thinking starts



    // Signal ElevenLabs stream to close
    if let Some(tx) = ELEVENLABS_SENDER.lock().unwrap().take() {
        let _ = tx.try_send(StreamMessage::StreamStop);
    }

    // Drop the stream
    STREAM_HANDLE.with(|cell| {
        *cell.borrow_mut() = None;
    });

    let count = {
        let buf = AUDIO_BUFFER.lock().map_err(|e| e.to_string())?;
        buf.len() as u64
    };

    log::info!("Voice recording stopped. {} samples captured.", count);
    Ok(count)
}

/// Start recording, wait up to `max_duration_ms`, then stop and return sample count.
/// If `max_duration_ms` is None, defaults to 30 seconds.
pub fn record_with_timeout(window: Window, max_duration_ms: Option<u64>) -> Result<u64, String> {
    let timeout = max_duration_ms.unwrap_or(30000);
    start_recording(window.clone())?;
    std::thread::sleep(Duration::from_millis(timeout));
    stop_recording(window)
}

/// Start a background thread that monitors microphone volume and emits
/// `conflux:state` events with `pulseImpulse` (0.0 – 10.0) for the Fairy orbs.
///
/// The loop runs at ~30 fps and stops automatically when `IS_RECORDING` is set
/// to false (i.e. after `stop_recording()` is called).
pub fn start_volume_monitor(window: Window) {
    std::thread::spawn(move || {
        loop {
            // Check if still recording
            if !IS_RECORDING.load(Ordering::Relaxed) {
                break;
            }

            // Calculate RMS of the most recent 1024 samples
            let rms = if let Ok(buf) = AUDIO_BUFFER.lock() {
                let len = buf.len();
                if len == 0 {
                    0.0f32
                } else {
                    let window_size = 1024.min(len);
                    let start = len - window_size;
                    let sum_sq: f32 = buf[start..].iter().map(|s| s * s).sum();
                    (sum_sq / window_size as f32).sqrt()
                }
            } else {
                0.0
            };

            // Map RMS to pulseImpulse (0.0 – 10.0)
            // Typical RMS for speech ranges ~0.01 – 0.15, so we scale and clamp.
            let pulse = (rms * 80.0).min(10.0).max(0.0);

            // Emit the event — ignore errors if the window was closed
            let _ = window.emit("conflux:state", serde_json::json!({
                "pulseImpulse": pulse
            }));

            // ~30 fps
            std::thread::sleep(Duration::from_millis(33));
        }

        log::info!("[VolumeMonitor] Stopped (recording ended)");
    });
}
