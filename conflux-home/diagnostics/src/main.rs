/// Standalone audio capture diagnostic.
/// Mirrors the cpal logic from `src-tauri/src/voice/capture.rs` and reports:
///   1. Available input devices
///   2. Default device config (sample rate, channels, format)
///   3. Buffer size before recording starts
///   4. Buffer size after N seconds of microphone input
///   5. Whether the stream callback actually delivered samples

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

fn main() {
    println!("=== Conflux Audio Capture Diagnostic ===\n");

    // --- 1. Host ---
    let host = cpal::default_host();
    println!("[1] Default host: {:?}", host.id());

    // --- 2. Enumerate input devices ---
    println!("\n[2] Input devices:");
    let mut devices: Vec<String> = Vec::new();
    match host.input_devices() {
        Ok(iter) => {
            for d in iter {
                if let Ok(name) = d.name() {
                    println!("    - {}", name);
                    devices.push(name);
                }
            }
            if devices.is_empty() {
                println!("    (none found)");
            }
        }
        Err(e) => println!("    ERROR enumerating: {}", e),
    }

    // --- 3. Default input device ---
    let device = match host.default_input_device() {
        Some(d) => {
            let name = d.name().unwrap_or_else(|_| "<unknown>".into());
            println!("\n[3] Default input device: {}", name);
            d
        }
        None => {
            println!("\n[3] ERROR: No default input device available!");
            println!("    Check that a microphone is connected and PulseAudio/PipeWire is running.");
            return;
        }
    };

    // --- 4. Supported configs ---
    println!("\n[4] Supported input configs:");
    match device.supported_input_configs() {
        Ok(ranges) => {
            for range in ranges {
                println!(
                    "    channels={}  sample_format={:?}  range={}..{} Hz",
                    range.channels(),
                    range.sample_format(),
                    range.min_sample_rate().0,
                    range.max_sample_rate().0,
                );
            }
        }
        Err(e) => println!("    ERROR: {}", e),
    }

    // --- 5. Default config ---
    let config = match device.default_input_config() {
        Ok(c) => {
            println!(
                "\n[5] Default config: {} Hz, {} ch, {:?}",
                c.sample_rate().0,
                c.channels(),
                c.sample_format()
            );
            c
        }
        Err(e) => {
            println!("\n[5] ERROR getting default config: {}", e);
            return;
        }
    };

    // --- 6. Choose working config (prefer 16kHz mono f32) ---
    let working_config = {
        let sample_rate = config.sample_rate().0;
        let channels = config.channels();
        let fmt = config.sample_format();

        if channels == 1 && sample_rate == 16000 && fmt == cpal::SampleFormat::F32 {
            println!("[6] Using default config directly (16kHz mono f32)");
            config.clone()
        } else {
            // Try to find 16kHz mono f32
            let mut found = None;
            for range in device.supported_input_configs().unwrap() {
                if range.channels() == 1 && range.sample_format() == cpal::SampleFormat::F32 {
                    let min = range.min_sample_rate().0;
                    let max = range.max_sample_rate().0;
                    if min <= 16000 && max >= 16000 {
                        found = Some(range.with_sample_rate(cpal::SampleRate(16000)));
                        break;
                    }
                }
            }
            if let Some(ref cfg) = found {
                println!("[6] Found 16kHz mono f32 config: {:?}", cfg.sample_rate());
                cfg.clone()
            } else {
                println!("[6] Using default config (will resample to 16kHz)");
                config.clone()
            }
        }
    };

    // --- 7. Build shared state ---
    let buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let callbacks_fired = Arc::new(AtomicU64::new(0));
    let total_samples_raw = Arc::new(AtomicU64::new(0));
    let stream_ok = Arc::new(AtomicBool::new(false));

    let buf_clone = buffer.clone();
    let callbacks_clone = callbacks_fired.clone();
    let total_raw_clone = total_samples_raw.clone();
    let stream_ok_clone = stream_ok.clone();

    let channels = working_config.channels();
    let sample_rate = working_config.sample_rate().0;

    // --- 8. Build stream ---
    println!("\n[7] Building input stream ({} Hz, {} ch)...", sample_rate, channels);
    let stream = match device.build_input_stream(
        &working_config.into(),
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            callbacks_clone.fetch_add(1, Ordering::Relaxed);
            total_raw_clone.fetch_add(data.len() as u64, Ordering::Relaxed);

            // Convert to mono
            let mono: Vec<f32> = if channels > 1 {
                data.chunks(channels as usize)
                    .map(|frame| frame.iter().sum::<f32>() / channels as f64 as f32)
                    .collect()
            } else {
                data.to_vec()
            };

            // Resample to 16kHz if needed
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

            if let Ok(mut buf) = buf_clone.lock() {
                buf.extend_from_slice(&resampled);
            }

            stream_ok_clone.store(true, Ordering::Relaxed);
        },
        |err| {
            eprintln!("    CALLBACK ERROR: {}", err);
        },
        None,
    ) {
        Ok(s) => s,
        Err(e) => {
            println!("\n    ERROR building stream: {}", e);
            return;
        }
    };

    // --- 9. Buffer state BEFORE recording ---
    {
        let buf = buffer.lock().unwrap();
        println!("[8] Buffer BEFORE start: {} samples, capacity {}",
                 buf.len(), buf.capacity());
    }

    // --- 10. Start stream ---
    if let Err(e) = stream.play() {
        println!("\n    ERROR starting stream: {}", e);
        return;
    }
    println!("[9] Stream started. Capturing for 5 seconds...");

    // --- 11. Capture for 5 seconds, printing progress ---
    for i in 1..=5 {
        std::thread::sleep(Duration::from_secs(1));
        let callbacks = callbacks_fired.load(Ordering::Relaxed);
        let raw = total_samples_raw.load(Ordering::Relaxed);
        let count = buffer.lock().unwrap().len();
        println!(
            "    t={}s  callbacks={}  raw_samples={}  buffer_16kHz_samples={}",
            i, callbacks, raw, count
        );
    }

    // --- 12. Final report ---
    let final_callbacks = callbacks_fired.load(Ordering::Relaxed);
    let final_raw = total_samples_raw.load(Ordering::Relaxed);
    let final_buffer_len = {
        let buf = buffer.lock().unwrap();
        buf.len()
    };
    let stream_active = stream_ok.load(Ordering::Relaxed);

    println!("\n[10] Final state after 5 seconds:");
    println!("     Stream delivered samples: {}", if stream_active { "YES" } else { "NO" });
    println!("     Total callbacks fired:    {}", final_callbacks);
    println!("     Raw samples received:     {}", final_raw);
    println!("     Buffer (16kHz) samples:   {}", final_buffer_len);
    println!("     Buffer duration:          {:.2}s", final_buffer_len as f64 / 16000.0);

    if final_buffer_len == 0 {
        println!("\n     ⚠️  DIAGNOSIS: Buffer is EMPTY after 5s capture.");
        println!("     Possible causes:");
        println!("       - Microphone is muted or volume is 0");
        println!("       - PulseAudio is capturing a different source");
        println!("       - Permissions issue (check user in 'audio' group)");
        println!("       - Another app has exclusive access");
    } else {
        println!("\n     ✅ Audio capture is working. {} samples ({:.2}s) captured.",
                 final_buffer_len, final_buffer_len as f64 / 16000.0);
    }

    // Stream drops here automatically
    println!("\n=== Diagnostic complete ===");
}
