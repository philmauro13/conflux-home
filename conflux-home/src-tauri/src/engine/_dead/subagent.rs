// Conflux Engine — Sub-Agent Runtime
// Multi-agent orchestration via tokio tasks with push-based completion.
// This is the core IP that makes Conflux Home a true multi-agent system.

use anyhow::Result;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tokio::sync::broadcast;
use tokio::task::JoinHandle;
use uuid::Uuid;
use chrono::Utc;

use super::types::{SubagentRunRecord, CompletionEvent};
use super::EngineDb;
use std::sync::Arc as StdArc;
use tokio::sync::{Semaphore, RwLock as TokioRwLock};

// ── Configuration ──

pub const MAX_SPAWN_DEPTH: i64 = 3;
pub const MAX_CHILDREN_PER_AGENT: usize = 10;
pub const MAX_CONCURRENT_GLOBAL: usize = 8;
pub const DEFAULT_TIMEOUT_SECS: i64 = 900; // 15 minutes
pub const COMPLETION_CHANNEL_SIZE: usize = 1000;

// ── SubagentRegistry ──
// Tracks all active sub-agent runs. Thread-safe via RwLock.
// Persists to SQLite for crash recovery.

pub struct SubagentRegistry {
    runs: Arc<RwLock<HashMap<String, SubagentRunRecord>>>,
    handles: Arc<RwLock<HashMap<String, JoinHandle<()>>>>,
    completion_tx: broadcast::Sender<CompletionEvent>,
}

impl SubagentRegistry {
    pub fn new() -> Self {
        let (completion_tx, _) = broadcast::channel(COMPLETION_CHANNEL_SIZE);
        Self {
            runs: Arc::new(RwLock::new(HashMap::new())),
            handles: Arc::new(RwLock::new(HashMap::new())),
            completion_tx,
        }
    }

    /// Load persisted runs from database on startup.
    pub fn load_from_db(&self, db: &EngineDb) -> Result<()> {
        let runs = db.get_active_subagent_runs()?;
        let mut guard = self.runs.write().map_err(|_| anyhow::anyhow!("Registry lock poisoned"))?;
        for run in runs {
            guard.insert(run.run_id.clone(), run);
        }
        log::info!("[SubagentRegistry] Loaded {} active runs from DB", guard.len());
        Ok(())
    }

    /// Register a new sub-agent run.
    pub fn register(&self, record: SubagentRunRecord) -> Result<()> {
        let mut guard = self.runs.write().map_err(|_| anyhow::anyhow!("Registry lock poisoned"))?;
        guard.insert(record.run_id.clone(), record);
        Ok(())
    }

    /// Unregister a completed run.
    pub fn unregister(&self, run_id: &str) -> Result<()> {
        let mut guard = self.runs.write().map_err(|_| anyhow::anyhow!("Registry lock poisoned"))?;
        guard.remove(run_id);
        let mut handles = self.handles.write().map_err(|_| anyhow::anyhow!("Handles lock poisoned"))?;
        handles.remove(run_id);
        Ok(())
    }

    /// Get a run record by ID.
    pub fn get(&self, run_id: &str) -> Option<SubagentRunRecord> {
        self.runs.read().ok()?.get(run_id).cloned()
    }

    /// List all runs, optionally filtered by parent.
    pub fn list(&self, parent_run_id: Option<&str>) -> Vec<SubagentRunRecord> {
        let guard = match self.runs.read() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        guard.values()
            .filter(|r| match parent_run_id {
                Some(parent) => r.parent_run_id.as_deref() == Some(parent),
                None => r.parent_run_id.is_none(),
            })
            .cloned()
            .collect()
    }

    /// List all active (non-terminal) runs.
    pub fn list_active(&self) -> Vec<SubagentRunRecord> {
        let guard = match self.runs.read() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        guard.values()
            .filter(|r| !matches!(r.status.as_str(), "completed" | "error" | "timeout" | "killed"))
            .cloned()
            .collect()
    }

    /// Count active children of a parent run.
    pub fn count_children(&self, parent_run_id: &str) -> usize {
        let guard = match self.runs.read() {
            Ok(g) => g,
            Err(_) => return 0,
        };
        guard.values()
            .filter(|r| r.parent_run_id.as_deref() == Some(parent_run_id))
            .filter(|r| !matches!(r.status.as_str(), "completed" | "error" | "timeout" | "killed"))
            .count()
    }

    /// Update run status.
    pub fn update_status(&self, run_id: &str, status: &str, outcome: Option<&str>, error: Option<&str>) -> Result<()> {
        let mut guard = self.runs.write().map_err(|_| anyhow::anyhow!("Registry lock poisoned"))?;
        if let Some(record) = guard.get_mut(run_id) {
            record.status = status.to_string();
            if let Some(o) = outcome {
                record.outcome = Some(o.to_string());
            }
            if let Some(e) = error {
                record.error_message = Some(e.to_string());
            }
            if matches!(status, "completed" | "error" | "timeout" | "killed") {
                record.ended_at = Some(Utc::now().to_rfc3339());
            }
        }
        Ok(())
    }

    /// Store the tokio task handle for a run.
    pub fn store_handle(&self, run_id: &str, handle: JoinHandle<()>) -> Result<()> {
        let mut handles = self.handles.write().map_err(|_| anyhow::anyhow!("Handles lock poisoned"))?;
        handles.insert(run_id.to_string(), handle);
        Ok(())
    }

    /// Subscribe to completion events (push-based, no polling).
    pub fn subscribe(&self) -> broadcast::Receiver<CompletionEvent> {
        self.completion_tx.subscribe()
    }

    /// Broadcast a completion event.
    pub fn broadcast_completion(&self, event: CompletionEvent) {
        let _ = self.completion_tx.send(event);
    }

    /// Kill a specific run by ID. Returns true if found and killed.
    pub async fn kill(&self, run_id: &str) -> Result<bool> {
        // Abort the tokio handle if it exists
        let handle = {
            let mut handles = self.handles.write().map_err(|_| anyhow::anyhow!("Handles lock poisoned"))?;
            handles.remove(run_id)
        };

        if let Some(h) = handle {
            h.abort();
        }

        // Update status
        self.update_status(run_id, "killed", Some("killed"), None)?;

        // Broadcast completion
        let record = self.get(run_id);
        if let Some(r) = record {
            self.broadcast_completion(CompletionEvent {
                run_id: run_id.to_string(),
                session_key: r.session_key,
                status: "killed".to_string(),
                result: None,
                tokens_used: 0,
                runtime_ms: 0,
            });
        }

        // Also kill all children recursively (cascade)
        let children: Vec<String> = {
            let guard = self.runs.read().map_err(|_| anyhow::anyhow!("Registry lock poisoned"))?;
            guard.values()
                .filter(|r| r.parent_run_id.as_deref() == Some(run_id))
                .filter(|r| !matches!(r.status.as_str(), "completed" | "error" | "timeout" | "killed"))
                .map(|r| r.run_id.clone())
                .collect()
        };

        for child_id in children {
            Box::pin(self.kill(&child_id)).await?;
        }

        Ok(true)
    }

    /// Kill all runs associated with a session (cascade stop).
    pub async fn kill_all_for_session(&self, session_key: &str) -> Result<usize> {
        let run_ids: Vec<String> = {
            let guard = self.runs.read().map_err(|_| anyhow::anyhow!("Registry lock poisoned"))?;
            guard.values()
                .filter(|r| r.session_key == session_key || r.controller_session_key.as_deref() == Some(session_key))
                .filter(|r| !matches!(r.status.as_str(), "completed" | "error" | "timeout" | "killed"))
                .map(|r| r.run_id.clone())
                .collect()
        };

        let count = run_ids.len();
        for run_id in run_ids {
            self.kill(&run_id).await?;
        }
        Ok(count)
    }
}

impl Clone for SubagentRegistry {
    fn clone(&self) -> Self {
        Self {
            runs: Arc::clone(&self.runs),
            handles: Arc::clone(&self.handles),
            completion_tx: self.completion_tx.clone(),
        }
    }
}

// ── Spawn Helpers ──

/// Generate a session key for a sub-agent run.
pub fn make_session_key(agent_id: &str, run_id: &str) -> String {
    format!("agent:{}:subagent:{}", agent_id, run_id)
}

/// Generate a unique run ID.
pub fn make_run_id() -> String {
    Uuid::new_v4().to_string()
}

/// Check if a parent can spawn more children.
pub fn can_spawn(registry: &SubagentRegistry, parent_run_id: Option<&str>, depth: i64) -> Result<bool> {
    if depth >= MAX_SPAWN_DEPTH {
        return Ok(false);
    }

    if let Some(parent_id) = parent_run_id {
        let child_count = registry.count_children(parent_id);
        if child_count >= MAX_CHILDREN_PER_AGENT {
            return Ok(false);
        }
    }

    let active_count = registry.list_active().len();
    if active_count >= MAX_CONCURRENT_GLOBAL {
        return Ok(false);
    }

    Ok(true)
}

// ── Concurrency Limiter ──
// Manages global and per-session semaphore slots for sub-agent concurrency control.

pub struct ConcurrencyPermit {
    _global: tokio::sync::OwnedSemaphorePermit,
    _session: tokio::sync::OwnedSemaphorePermit,
}

pub struct ConcurrencyLimiter {
    global: StdArc<Semaphore>,
    session_lanes: StdArc<TokioRwLock<HashMap<String, StdArc<Semaphore>>>>,
    max_concurrent: usize,
}

impl ConcurrencyLimiter {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            global: StdArc::new(Semaphore::new(max_concurrent)),
            session_lanes: StdArc::new(TokioRwLock::new(HashMap::new())),
            max_concurrent,
        }
    }

    /// Acquire a concurrency permit for the given session.
    /// Blocks until both global and session permits are available.
    pub async fn acquire(&self, session_key: &str) -> Result<ConcurrencyPermit> {
        // Ensure session lane exists
        {
            let mut lanes = self.session_lanes.write().await;
            lanes.entry(session_key.to_string())
                .or_insert_with(|| StdArc::new(Semaphore::new(1)));
        }

        // Acquire global permit
        let global_permit = self.global.clone().acquire_owned().await
            .map_err(|_| anyhow::anyhow!("Global semaphore closed"))?;

        // Acquire session permit
        let session_permit = {
            let lanes = self.session_lanes.read().await;
            let lane = lanes.get(session_key)
                .ok_or_else(|| anyhow::anyhow!("Session lane not found"))?;
            lane.clone().acquire_owned().await
                .map_err(|_| anyhow::anyhow!("Session semaphore closed"))?
        };

        Ok(ConcurrencyPermit {
            _global: global_permit,
            _session: session_permit,
        })
    }

    /// Get the number of currently active (acquired) permits.
    pub fn active_count(&self) -> usize {
        self.max_concurrent - self.global.available_permits()
    }

    /// Get the number of available global permits.
    pub fn available(&self) -> usize {
        self.global.available_permits()
    }
}

// ── Sub-Agent Execution ──
// Actually runs a sub-agent as a tokio task.

/// Execute a sub-agent run. This function:
/// 1. Updates status to "running"
/// 2. Creates a session in the DB
/// 3. Loads the agent's system prompt (soul + instructions)
/// 4. Calls runtime::process_turn() to execute the task
/// 5. Captures the result
/// 6. Updates the DB with completion status
/// 7. Broadcasts a CompletionEvent
/// 8. Cleans up if cleanup="delete"
pub async fn execute_subagent(
    db: &EngineDb,
    registry: &SubagentRegistry,
    run_id: String,
    agent_id: String,
    task: String,
    timeout_secs: Option<i64>,
) {
    let timeout = timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS);
    let start_time = Utc::now();

    log::info!("[Subagent] Starting run {} for agent {} with task: {}", run_id, agent_id, &task[..task.len().min(100)]);

    // 1. Update status to "running"
    let _ = db.update_subagent_run_status(&run_id, "running", None, None, None, None, None);
    let _ = db.log_subagent_event(&run_id, "running", None);

    // 2. Get agent config
    let agent = match db.get_agent(&agent_id) {
        Ok(Some(a)) => a,
        Ok(None) => {
            let error_msg = format!("Agent not found: {}", agent_id);
            log::error!("[Subagent] {}", error_msg);
            let _ = db.update_subagent_run_status(&run_id, "error", None, Some(&error_msg), None, None, None);
            let _ = db.log_subagent_event(&run_id, "error", Some(&error_msg));
            return;
        }
        Err(e) => {
            let error_msg = format!("Failed to load agent: {}", e);
            log::error!("[Subagent] {}", error_msg);
            let _ = db.update_subagent_run_status(&run_id, "error", None, Some(&error_msg), None, None, None);
            let _ = db.log_subagent_event(&run_id, "error", Some(&error_msg));
            return;
        }
    };

    // 3. Execute with timeout
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(timeout as u64),
        execute_task(db, &agent, &task),
    ).await;

    let end_time = Utc::now();
    let runtime_ms = (end_time - start_time).num_milliseconds();

    match result {
        Ok(Ok((response_content, tokens_used))) => {
            // Success
            log::info!("[Subagent] Run {} completed successfully in {}ms", run_id, runtime_ms);
            
            let _ = db.update_subagent_run_status(
                &run_id, 
                "completed", 
                Some("completed"),
                None,
                Some(&response_content),
                Some(tokens_used),
                Some(runtime_ms),
            );
            let _ = db.log_subagent_event(&run_id, "completed", None);

            // Broadcast completion event
            registry.broadcast_completion(CompletionEvent {
                run_id: run_id.clone(),
                session_key: make_session_key(&agent_id, &run_id),
                status: "completed".to_string(),
                result: Some(response_content),
                tokens_used,
                runtime_ms: runtime_ms as i64,
            });
        }
        Ok(Err(e)) => {
            // Task error
            let error_msg = format!("Task failed: {}", e);
            log::error!("[Subagent] Run {} failed: {}", run_id, error_msg);
            
            let _ = db.update_subagent_run_status(&run_id, "error", None, Some(&error_msg), None, None, Some(runtime_ms));
            let _ = db.log_subagent_event(&run_id, "error", Some(&error_msg));

            registry.broadcast_completion(CompletionEvent {
                run_id: run_id.clone(),
                session_key: make_session_key(&agent_id, &run_id),
                status: "error".to_string(),
                result: None,
                tokens_used: 0,
                runtime_ms: runtime_ms as i64,
            });
        }
        Err(_) => {
            // Timeout
            let error_msg = format!("Timeout after {}s", timeout);
            log::warn!("[Subagent] Run {} timed out after {}s", run_id, timeout);
            
            let _ = db.update_subagent_run_status(&run_id, "timeout", None, Some(&error_msg), None, None, Some(runtime_ms));
            let _ = db.log_subagent_event(&run_id, "timeout", Some(&error_msg));

            registry.broadcast_completion(CompletionEvent {
                run_id: run_id.clone(),
                session_key: make_session_key(&agent_id, &run_id),
                status: "timeout".to_string(),
                result: None,
                tokens_used: 0,
                runtime_ms: runtime_ms as i64,
            });
        }
    }

    log::info!("[Subagent] Run {} lifecycle complete", run_id);
}

/// Execute the actual task for a sub-agent.
/// Returns (response_content, tokens_used).
async fn execute_task(db: &EngineDb, agent: &super::types::Agent, task: &str) -> Result<(String, i64)> {
    // Create a temporary session for this sub-agent run
    let session = db.create_session(&agent.id, "subagent")?;

    // Call the existing runtime to handle the full turn
    let response = super::runtime::process_turn(db, &session.id, &agent.id, task, None).await?;

    Ok((response.content, response.tokens_used))
}
