// Conflux Engine — Local AI Layer
// Runs inference locally via llama.cpp sidecar for tool routing.
// Falls back to cloud API when local model fails or for complex reasoning.
//
// Architecture:
//   llama-server (sidecar) ← HTTP → local_ai.rs ← runtime.rs
//
// The sidecar is a llama-server binary that serves a GGUF model over HTTP.
// This module manages its lifecycle and provides tool-routing functions.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::time::sleep;

use super::router::{ModelResponse, ToolCallRequest};

// ── Resource Directory (set at app startup) ──

static RESOURCE_DIR: std::sync::Mutex<Option<PathBuf>> = std::sync::Mutex::new(None);

/// Set the Tauri resource directory at app startup.
/// Models and llama-server binary are expected in `models/` and `binaries/` subdirs.
pub fn set_resource_dir(path: PathBuf) {
    let mut guard = RESOURCE_DIR.lock().unwrap();
    *guard = Some(path.clone());
    log::info!("[LocalAI] Resource directory set to: {}", path.display());
}

/// Get the resource directory if set.
fn get_resource_dir() -> Option<PathBuf> {
    RESOURCE_DIR.lock().unwrap().clone()
}

// ── App Data Directory (set at app startup) ──

static APP_DATA_DIR: std::sync::Mutex<Option<PathBuf>> = std::sync::Mutex::new(None);

/// Set the Tauri app data directory at app startup.
/// Used as a fallback location for runtime-downloaded models.
pub fn set_app_data_dir(path: PathBuf) {
    let mut guard = APP_DATA_DIR.lock().unwrap();
    *guard = Some(path.clone());
    log::info!("[LocalAI] App data directory set to: {}", path.display());
}

/// Get the app data directory if set.
fn get_app_data_dir() -> Option<PathBuf> {
    APP_DATA_DIR.lock().unwrap().clone()
}

/// Discover a bundled GGUF model file.
/// Checks resource dir first, then falls back to legacy dev paths.
fn discover_model_path() -> Option<PathBuf> {
    // 1. Try resource dir / models
    if let Some(res) = get_resource_dir() {
        let models_dir = res.join("models");
        if models_dir.is_dir() {
            // Look for known model filenames in priority order
            // Gemma 3n is the primary model for chat and tool routing.
            // Toolrouter is kept as a fallback for backwards compatibility.
            let known_names = [
                "conflux-e4b-q4km.gguf",       // fine-tuned E4B Q4_K_M (primary smart model)
                "gemma-3n-E2B-it-Q8_0.gguf",   // base E2B (fallback if no fine-tuned model)
                "conflux-toolrouter-q4-v2.gguf",
                "conflux-toolrouter-q4.gguf",  // legacy v1 fallback
            ];
            for name in &known_names {
                let p = models_dir.join(name);
                if p.exists() {
                    log::info!("[LocalAI] Found bundled model: {}", p.display());
                    return Some(p);
                }
            }
            // Fallback: any .gguf in the models dir
            if let Ok(entries) = std::fs::read_dir(&models_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.extension().and_then(|s| s.to_str()) == Some("gguf") {
                        log::info!("[LocalAI] Found bundled model: {}", p.display());
                        return Some(p);
                    }
                }
            }
        }
    }

    // 2. Legacy dev path fallback
    let home = std::env::var("HOME").unwrap_or_default();
    let legacy = PathBuf::from(format!(
        "{}/.openclaw/workspace/conflux-home/src-tauri/models/conflux-toolrouter-q4.gguf",
        home
    ));
    if legacy.exists() {
        log::info!("[LocalAI] Found legacy dev model: {}", legacy.display());
        return Some(legacy);
    }

    None
}

// ── Global Persistent Manager ──

/// Global persistent llama-server manager. Starts once, reused across all requests.
/// Avoids the 12-19s startup cost per inference call.
static LOCAL_AI: std::sync::LazyLock<std::sync::Mutex<Option<LocalAiManager>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(None));

/// Get or initialize the persistent local AI manager.
/// Starts the llama-server on first call, reuses it on subsequent calls.
/// Returns None if the server can't be started (missing binary or model).
pub async fn get_or_init_local_ai() -> Option<LocalAiManager> {
    // Check if binary and model exist first (fast path)
    let server_bin = find_llama_server().ok()?;
    let model_path = discover_model_path()?;

    let config = ServerConfig {
        model_path,
        ..Default::default()
    };

    // Try to get existing manager
    {
        let guard = LOCAL_AI.lock().unwrap();
        if let Some(ref manager) = *guard {
            // Check if still healthy
            if manager.is_process_alive() {
                return Some(manager.clone());
            }
            // Process died — will recreate below
            log::warn!("[LocalAI] Server process died, restarting...");
        }
    }

    // Create and start a new manager
    let manager = LocalAiManager::new(config);
    match manager.start() {
        Ok(_) => match manager.wait_for_ready().await {
            Ok(_) => {
                log::info!("[LocalAI] Persistent server ready on port {}", manager.config.port);
                let clone = manager.clone();
                *LOCAL_AI.lock().unwrap() = Some(manager);
                Some(clone)
            }
            Err(e) => {
                log::warn!("[LocalAI] Server not ready: {}", e);
                manager.stop().ok();
                None
            }
        },
        Err(e) => {
            log::warn!("[LocalAI] Failed to start: {}", e);
            None
        }
    }
}

/// Shutdown the persistent local AI server (call on app exit).
pub fn shutdown_local_ai() {
    let mut guard = LOCAL_AI.lock().unwrap();
    if let Some(manager) = guard.take() {
        manager.stop().ok();
        log::info!("[LocalAI] Persistent server shut down");
    }
}

// ── Configuration ──

/// Default port for the llama-server sidecar.
const DEFAULT_PORT: u16 = 8177;

/// How long to wait for the server to become ready (seconds).
const SERVER_STARTUP_TIMEOUT_SECS: u64 = 30;

/// How often to poll during startup (milliseconds).
const SERVER_POLL_INTERVAL_MS: u64 = 500;

/// Default max tokens for tool routing calls.
const DEFAULT_MAX_TOKENS: i32 = 256;

/// Default temperature for tool routing (low = deterministic).
const DEFAULT_TEMPERATURE: f32 = 0.1;

// ── Types ──

/// Status of the local AI model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalAiStatus {
    pub running: bool,
    pub model_path: Option<String>,
    pub model_name: Option<String>,
    pub port: u16,
    pub ram_mb: Option<u64>,
    pub is_ready: bool,
    pub tools_loaded: usize,
    pub error: Option<String>,
}

/// Configuration for starting the llama-server.
#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub model_path: PathBuf,
    pub port: u16,
    pub ctx_size: u32,
    pub threads: u32,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            model_path: PathBuf::new(),
            port: DEFAULT_PORT,
            ctx_size: 8192,
            threads: std::thread::available_parallelism()
                .map(|n| n.get() as u32)
                .unwrap_or(4),
        }
    }
}

// ── Sidecar Manager ──

/// Manages the llama-server sidecar process.
#[derive(Clone)]
pub struct LocalAiManager {
    process: Arc<Mutex<Option<Child>>>,
    config: ServerConfig,
    client: reqwest::Client,
}

impl LocalAiManager {
    pub fn new(config: ServerConfig) -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            config,
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(300))
                .build()
                .expect("Failed to create HTTP client"),
        }
    }

    /// Start the llama-server sidecar.
    pub fn start(&self) -> Result<()> {
        // Kill any existing process
        self.stop()?;

        if !self.config.model_path.exists() {
            return Err(anyhow!(
                "Model file not found: {}",
                self.config.model_path.display()
            ));
        }

        // Find the llama-server binary
        let server_bin = find_llama_server()?;

        // On Windows: set the working dir AND PATH to where llama-server.exe lives
        // so it can find ggml.dll, cublas.dll, and any other collocated DLLs
        // Also use DETACHED_PROCESS flag to suppress any console window
        #[cfg(target_os = "windows")]
        let _old_workdir = {
            use std::os::windows::process::CommandExt;
            use std::path::Path;
            if let Some(parent) = server_bin.as_path().parent() {
                let old = std::env::current_dir().ok();
                let _ = std::env::set_current_dir(parent);
                // Prepend binary directory to PATH so any DLL dependencies are resolved
                if let Ok(current_path) = std::env::var("PATH") {
                    let new_path = format!("{};{}", parent.to_string_lossy(), current_path);
                    let _ = std::env::set_var("PATH", new_path);
                }
                old
            } else {
                None
            }
        };
        #[cfg(not(target_os = "windows"))]
        let _old_workdir: Option<std::path::PathBuf> = None;

        log::info!(
            "[LocalAI] Starting llama-server on port {} with model {}",
            self.config.port,
            self.config.model_path.display()
        );

        // Redirect stdout to NUL (suppress) and stderr to a temp file for crash diagnostics
        let stderr_file_path = std::env::temp_dir().join("conflux-llama-server-stderr.log");
        let stderr_file = std::fs::File::create(&stderr_file_path).ok();

        let mut cmd = Command::new(&server_bin);
        cmd.arg("--model")
            .arg(&self.config.model_path)
            .arg("--port")
            .arg(self.config.port.to_string())
            .arg("--ctx-size")
            .arg(self.config.ctx_size.to_string())
            .arg("--threads")
            .arg(self.config.threads.to_string())
            .arg("--no-webui");

        // Only add --log-disable if supported (newer llama.cpp versions)
        let check_version = Command::new(&server_bin).arg("--help")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
        let supports_log_disable = check_version
            .map(|o| o.status.success())
            .unwrap_or(false);
        if supports_log_disable {
            cmd.arg("--log-disable");
        }

        // Redirect stdout to NUL (don't show console)
        cmd.stdout(Stdio::null());

        // Redirect stderr to file so we can capture crash messages
        if let Some(ref f) = stderr_file {
            cmd.stderr(Stdio::from(f.try_clone().map_err(|e| anyhow!("clone stderr file: {}", e))?));
        } else {
            cmd.stderr(Stdio::null());
        }

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            // DETACHED_PROCESS prevents a console window from appearing on Windows
            // CREATE_NO_WINDOW is an alternative that still inherits console but doesn't show it
            cmd.creation_flags(0x08000000); // DETACHED_PROCESS
        }

        let mut child = cmd.spawn()?;

        *self.process.lock().unwrap() = Some(child);

        log::info!("[LocalAI] llama-server started, waiting for ready...");
        Ok(())
    }

    /// Stop the llama-server sidecar.
    pub fn stop(&self) -> Result<()> {
        let mut proc = self.process.lock().unwrap();
        if let Some(mut child) = proc.take() {
            log::info!("[LocalAI] Stopping llama-server (PID {})", child.id());
            child.kill().ok();
            child.wait().ok();
        }
        Ok(())
    }

    /// Check if the server process is alive.
    pub fn is_process_alive(&self) -> bool {
        let mut proc = self.process.lock().unwrap();
        if let Some(ref mut child) = *proc {
            match child.try_wait() {
                Ok(Some(_)) => false, // Exited
                Ok(None) => true,     // Still running
                Err(_) => false,
            }
        } else {
            false
        }
    }

    /// Wait for the server to become ready (health check).
    pub async fn wait_for_ready(&self) -> Result<()> {
        let deadline = Instant::now() + Duration::from_secs(SERVER_STARTUP_TIMEOUT_SECS);

        while Instant::now() < deadline {
            if !self.is_process_alive() {
                log::warn!("[LocalAI] llama-server process died during startup");
                return Err(anyhow!("llama-server process died during startup"));
            }

            match self.health_check().await {
                Ok(true) => {
                    log::info!("[LocalAI] Server ready on port {}", self.config.port);
                    return Ok(());
                }
                Err(e) => {
                    // Log health check failures at debug level (may be expected during startup)
                    log::debug!("[LocalAI] Health check pending: {}", e);
                }
                _ => {}
            }
            sleep(Duration::from_millis(SERVER_POLL_INTERVAL_MS)).await;
        }

        Err(anyhow!(
            "llama-server did not become ready within {}s",
            SERVER_STARTUP_TIMEOUT_SECS
        ))
    }

    /// HTTP health check to the server.
    async fn health_check(&self) -> Result<bool> {
        let url = format!("http://localhost:{}/health", self.config.port);
        let resp = self.client.get(&url).send().await?;
        Ok(resp.status().is_success())
    }

    /// Send a completion request to the server.
    pub async fn completion(&self, prompt: &str, max_tokens: i32, temperature: f32) -> Result<String> {
        let url = format!("http://localhost:{}/completion", self.config.port);

        let body = serde_json::json!({
            "prompt": prompt,
            "n_predict": max_tokens,
            "temperature": temperature,
            "stop": ["<end_of_turn>", "<start_of_turn>user"],
        });

        let resp = self.client.post(&url).json(&body).send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("llama-server returned {}: {}", status, text));
        }

        let result: serde_json::Value = resp.json().await?;
        let content = result["content"]
            .as_str()
            .ok_or_else(|| anyhow!("No 'content' in llama-server response"))?;

        Ok(content.to_string())
    }

    /// Send a chat completion request (uses model's built-in chat template).
    pub async fn chat_completion(&self, messages: &[serde_json::Value], max_tokens: i32, temperature: f32) -> Result<String> {
        let url = format!("http://localhost:{}/v1/chat/completions", self.config.port);

        let body = serde_json::json!({
            "model": self.config.model_path.file_stem().and_then(|s| s.to_str()).unwrap_or("model"),
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        });

        let resp = self.client.post(&url).json(&body).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("llama-server chat returned {}: {}", status, text));
        }

        let result: serde_json::Value = resp.json().await?;
        let content = result["choices"]
            .get(0)
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
            .ok_or_else(|| anyhow!("No 'content' in llama-server chat response"))?;


        Ok(content.to_string())
    }
}

// Note: No Drop impl -- server lifecycle is managed by the global LOCAL_AI static.
// Call shutdown_local_ai() on app exit to clean up.


// ── Tool Routing ──

/// Format tool definitions for the Gemma chat template.
/// MUST match the format_example() from the training notebook exactly:
///   Tools:
///   [{full JSON function schemas}]
pub fn format_tools_for_local(tools: &[serde_json::Value]) -> String {
    // Training system message — must match verbatim
    let mut out = String::from(
        "You are a tool calling assistant. Given a user request, output a JSON function call with the tool name and arguments.\n\nTools:\n"
    );

    // Build JSON array of function definitions (matching training: [t[\"function\"] for t in tools])
    let func_defs: Vec<&serde_json::Value> = tools
        .iter()
        .filter_map(|t| t.get("function"))
        .collect();

    out.push_str(&serde_json::to_string_pretty(&func_defs).unwrap_or_else(|_| "[]".to_string()));

    out
}

/// Format a message for the Gemma chat template.
/// MUST match format_example() from training notebook:
///   <start_of_turn>user
///   {system}
///
///   User: {user_message}<end_of_turn>
///   <start_of_turn>model
pub fn format_prompt(system: &str, user_message: &str) -> String {
    format!(
        "<start_of_turn>user\n{}\n\nUser: {}<end_of_turn>\n<start_of_turn>model\n",
        system, user_message
    )
}

/// Parse tool calls from model output.
/// Tries to extract JSON tool call objects from the response.
pub fn parse_tool_calls(content: &str) -> Vec<ToolCallRequest> {
    let mut calls = Vec::new();
    let trimmed = content.trim();

    // Strip markdown code blocks if present
    let cleaned = trimmed
        .strip_prefix("```json").unwrap_or(trimmed)
        .strip_prefix("```").unwrap_or(trimmed)
        .strip_suffix("```").unwrap_or(trimmed)
        .trim();

    // Clean SentencePiece artifacts from fine-tuned models (UNK bytes, ▁ tokens)
    let cleaned = regex::Regex::new(r#"\[UNK_BYTE_[^\]]*\]"#)
        .unwrap()
        .replace_all(cleaned, "")
        .replace('▁', "")
        .trim()
        .to_string();

    // Try to find JSON objects in the output
    // Strategy: look for {"name"/"tool": ..., "arguments"/"args"/"parameters": ...} patterns

    // Direct parse first (if the whole response is a single tool call)
            eprintln!("[parse_tool_calls] cleaned: {:?}", cleaned);
if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&cleaned) {
                eprintln!("[parse_tool_calls] direct parse attempt: cleaned={:?}", cleaned);
let name = obj.get("name").and_then(|v| v.as_str()).or(obj.get("tool").and_then(|v| v.as_str())).or(obj.get("tool_name").and_then(|v| v.as_str()));
        let args = obj.get("arguments").or(obj.get("args")).or(obj.get("parameters"));
        eprintln!("[parse_tool_calls] direct name={:?}, args present={}", name, args.is_some());

        if let (Some(name), Some(args)) = (name, args) {
            calls.push(ToolCallRequest {
                id: format!("local_{}", uuid::Uuid::new_v4().simple()),
                name: name.to_string(),
                arguments: serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string()),
            });
            return calls;
        }

        // Fallback: name might be nested inside arguments (common with fine-tuned models)
        // e.g., {"role":"user","arguments":{"name":"time",...}}
        if let Some(args_obj) = obj.get("arguments").and_then(|a| a.as_object()) {
            if let Some(name_val) = args_obj.get("name").or(args_obj.get("tool")) {
                if let Some(name_str) = name_val.as_str() {
                    // Filter out the name from the args object
                    let mut filtered_args = args_obj.clone();
                    filtered_args.remove("name");
                    filtered_args.remove("tool");
                    // Remove known example fields the model hallucinates
                    filtered_args.remove("body");
                    filtered_args.remove("title");
                    filtered_args.remove("example_body");
                    filtered_args.remove("example_title");
                    filtered_args.remove("role");
                    calls.push(ToolCallRequest {
                        id: format!("local_{}", uuid::Uuid::new_v4().simple()),
                        name: name_str.to_string(),
                        arguments: serde_json::to_string(&filtered_args).unwrap_or_else(|_| "{}".to_string()),
                    });
                    return calls;
                }
            }
        }
    }

    // Regex scan for embedded JSON objects
    let re = regex::Regex::new(r#"\{\s*"(?:name|tool)"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|args|parameters)"\s*:\s*\{[^}]*\}\s*\}"#)
        .unwrap();
    for cap in re.captures_iter(&cleaned) {
        if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&cap[0]) {
            let name = obj.get("name").and_then(|v| v.as_str()).or(obj.get("tool").and_then(|v| v.as_str())).or(obj.get("tool_name").and_then(|v| v.as_str()));
            if let Some(name) = name {
                let args = obj.get("arguments").or(obj.get("args")).or(obj.get("parameters"));
                calls.push(ToolCallRequest {
                    id: format!("local_{}", uuid::Uuid::new_v4().simple()),
                    name: name.to_string(),
                    arguments: serde_json::to_string(args.unwrap_or(&serde_json::json!({})))
                        .unwrap_or_else(|_| "{}".to_string()),
                });
            }
        }
    }

    calls
}

/// Route a user message through the local model for tool calling.
/// Returns a ModelResponse with tool calls if the model decides tools are needed.
pub async fn local_tool_route(
    manager: &LocalAiManager,
    user_message: &str,
    tools: &[serde_json::Value],
) -> Result<ModelResponse> {
    let tools_text = format_tools_for_local(tools);
    let prompt = format_prompt(&tools_text, user_message);

    let start = Instant::now();

    let content = manager
        .completion(&prompt, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE)
        .await?;

    let latency_ms = start.elapsed().as_millis() as i64;

    log::info!("[LocalAI] Raw output ({} chars): {}", content.len(), &content[..content.len().min(400)]);

    let tool_calls = parse_tool_calls(&content);

    log::info!(
        "[LocalAI] Routed in {}ms — {} tool calls, response len={}",
        latency_ms,
        tool_calls.len(),
        content.len()
    );

    Ok(ModelResponse {
        content,
        model: "local-gemma3-1b".to_string(),
        provider_id: "local".to_string(),
        provider_name: "Local AI".to_string(),
        tokens_used: 0, // Local inference, no token counting yet
        latency_ms,
        tool_calls,
    })
}

// ── Helpers ──

/// Find the llama-server binary on the system.
/// Checks bundled resources first, then system PATH.
pub fn find_llama_server() -> Result<PathBuf> {
    // 1. Check bundled resources
    if let Some(res) = get_resource_dir() {
        let binaries_dir = res.join("binaries");
        let bundled_names = if cfg!(target_os = "windows") {
            vec!["llama-server.exe", "llama-server"]
        } else {
            vec!["llama-server"]
        };
        for name in &bundled_names {
            let p = binaries_dir.join(name);
            if p.exists() && p.is_file() {
                log::info!("[LocalAI] Using bundled llama-server: {}", p.display());
                return Ok(p);
            }
        }
    }

    // 2. Check common system locations
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates: Vec<PathBuf> = vec![
        PathBuf::from("llama-server"), // In PATH (checked via which below)
        PathBuf::from("/usr/local/bin/llama-server"),
        PathBuf::from("/opt/llama.cpp/bin/llama-server"),
        PathBuf::from(format!("{}/llama.cpp/build/bin/llama-server", home)),
        PathBuf::from(format!("{}/.local/bin/llama-server", home)),
    ];

    for path in &candidates {
        if path.exists() && path.is_file() {
            return Ok(path.clone());
        }
    }

    // 3. Try `which` via shell as last resort
    if let Ok(output) = std::process::Command::new("which").arg("llama-server").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(PathBuf::from(path));
            }
        }
    }

    Err(anyhow!(
        "llama-server binary not found. Bundle it in src-tauri/binaries/ or install llama.cpp:\n\
         git clone https://github.com/ggerganov/llama.cpp ~/llama.cpp\n\
         cd ~/llama.cpp && cmake -B build && cmake --build build --config Release -j"
    ))
}

// ── Tauri Commands ──

/// Tauri command: Start local AI with a model file.
#[tauri::command]
pub async fn local_ai_start(
    model_path: String,
) -> Result<LocalAiStatus, String> {
    let full_path = if Path::new(&model_path).is_absolute() {
        PathBuf::from(&model_path)
    } else if let Some(res) = get_resource_dir() {
        res.join("models").join(&model_path)
    } else {
        let home = std::env::var("HOME").unwrap_or_default();
        PathBuf::from(format!("{}/.openclaw/workspace/conflux-home/src-tauri/models/{}", home, model_path))
    };

    let config = ServerConfig {
        model_path: full_path.clone(),
        ..Default::default()
    };

    let manager = LocalAiManager::new(config);
    manager.start().map_err(|e| e.to_string())?;

    // Store manager in global state
    *LOCAL_AI.lock().unwrap() = Some(manager.clone());

    Ok(LocalAiStatus {
        running: true,
        model_path: Some(full_path.to_string_lossy().to_string()),
        model_name: Some(full_path.file_stem().and_then(|s| s.to_str()).unwrap_or("unknown").to_string()),
        port: DEFAULT_PORT,
        ram_mb: None,
        is_ready: false,
        tools_loaded: 0,
        error: None,
    })
}

/// Tauri command: Stop local AI.
#[tauri::command]
pub async fn local_ai_stop() -> Result<(), String> {
    shutdown_local_ai();
    Ok(())
}

/// Tauri command: Get local AI status.
#[tauri::command]
pub async fn local_ai_status() -> Result<LocalAiStatus, String> {
    let guard = LOCAL_AI.lock().unwrap();
    if let Some(ref manager) = *guard {
        let running = manager.is_process_alive();
        let model_name = manager.config.model_path.file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string());
        Ok(LocalAiStatus {
            running,
            model_path: Some(manager.config.model_path.to_string_lossy().to_string()),
            model_name,
            port: manager.config.port,
            ram_mb: None,
            is_ready: running,
            tools_loaded: 0,
            error: None,
        })
    } else {
        // No manager started yet — check if we *could* start one
        let model_path = discover_model_path();
        let server_bin = find_llama_server().ok();
        let error = if model_path.is_none() && server_bin.is_none() {
            Some("No bundled model or llama-server found.".to_string())
        } else if model_path.is_none() {
            Some("No bundled GGUF model found.".to_string())
        } else if server_bin.is_none() {
            Some("llama-server binary not found.".to_string())
        } else {
            None
        };
        Ok(LocalAiStatus {
            running: false,
            model_path: model_path.map(|p| p.to_string_lossy().to_string()),
            model_name: None,
            port: DEFAULT_PORT,
            ram_mb: None,
            is_ready: false,
            tools_loaded: 0,
            error,
        })
    }
}
