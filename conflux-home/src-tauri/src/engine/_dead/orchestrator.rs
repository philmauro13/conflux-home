// Conflux Engine — Orchestrator
// Manages depth-based capability system, spawn planning, and execution coordination.

use anyhow::{Result, bail};
use chrono::Utc;
use tokio::sync::broadcast;

use super::subagent::{SubagentRegistry, ConcurrencyLimiter, make_run_id, make_session_key, execute_subagent};
use super::db::EngineDb;
use super::types::{SubagentRunRecord, CompletionEvent, SpawnParams};

pub struct Orchestrator {
    registry: SubagentRegistry,
    limiter: ConcurrencyLimiter,
    max_depth: i64,
}

impl Orchestrator {
    pub fn new(registry: SubagentRegistry, max_depth: i64) -> Self {
        Self {
            registry,
            limiter: ConcurrencyLimiter::new(super::subagent::MAX_CONCURRENT_GLOBAL),
            max_depth,
        }
    }

    /// Check if a spawn is allowed (depth, children count, concurrency).
    pub fn can_spawn(&self, parent_run_id: Option<&str>, depth: i64) -> bool {
        // Check depth limit
        if depth >= self.max_depth {
            log::warn!("[Orchestrator] Cannot spawn: depth {} >= max {}", depth, self.max_depth);
            return false;
        }

        // Check children limit
        if let Some(parent_id) = parent_run_id {
            let child_count = self.registry.count_children(parent_id);
            if child_count >= super::subagent::MAX_CHILDREN_PER_AGENT {
                log::warn!("[Orchestrator] Cannot spawn: parent {} has {} children (max {})", 
                    parent_id, child_count, super::subagent::MAX_CHILDREN_PER_AGENT);
                return false;
            }
        }

        // Check concurrency limit
        let active_count = self.limiter.active_count();
        if active_count >= super::subagent::MAX_CONCURRENT_GLOBAL {
            log::warn!("[Orchestrator] Cannot spawn: {} active runs (max {})", 
                active_count, super::subagent::MAX_CONCURRENT_GLOBAL);
            return false;
        }

        true
    }

    /// Plan a spawn — validates params and returns a SpawnPlan.
    pub fn plan_spawn(&self, params: &SpawnParams, parent_run_id: Option<&str>) -> Result<SpawnPlan> {
        // Calculate depth
        let depth = if let Some(parent_id) = parent_run_id {
            if let Some(parent) = self.registry.get(parent_id) {
                parent.depth + 1
            } else {
                0
            }
        } else {
            0
        };

        // Validate
        if !self.can_spawn(parent_run_id, depth) {
            bail!("Spawn not allowed at depth {} with parent {:?}", depth, parent_run_id);
        }

        let run_id = make_run_id();
        let session_key = make_session_key(&params.agent_id, &run_id);
        let timeout_secs = params.timeout_secs.unwrap_or(super::subagent::DEFAULT_TIMEOUT_SECS);

        Ok(SpawnPlan {
            run_id: run_id.clone(),
            session_key,
            depth,
            parent_run_id: parent_run_id.map(|s| s.to_string()),
            agent_id: params.agent_id.clone(),
            task: params.task.clone(),
            timeout_secs,
        })
    }

    /// Execute a spawn plan — creates DB record, registers in memory, returns run_id.
    pub async fn execute_spawn(&self, plan: SpawnPlan, db: &EngineDb) -> Result<String> {
        let now = Utc::now().to_rfc3339();

        // Create DB record
        let record = SubagentRunRecord {
            run_id: plan.run_id.clone(),
            parent_run_id: plan.parent_run_id.clone(),
            session_key: plan.session_key.clone(),
            controller_session_key: Some("orchestrator".to_string()),
            agent_id: plan.agent_id.clone(),
            task: plan.task.clone(),
            label: None,
            mode: "run".to_string(),
            cleanup: "keep".to_string(),
            depth: plan.depth,
            status: "spawned".to_string(),
            model_override: None,
            timeout_secs: Some(plan.timeout_secs),
            created_at: now.clone(),
            started_at: None,
            ended_at: None,
            outcome: None,
            error_message: None,
            frozen_result: None,
            tokens_used: 0,
            runtime_ms: 0,
        };

        db.create_subagent_run(&record)?;
        db.log_subagent_event(&plan.run_id, "spawned", None)?;

        // Register in memory
        self.registry.register(record)?;

        // Acquire concurrency permit
        let _permit = self.limiter.acquire(&plan.session_key).await?;

        // Spawn the execution task
        let registry = self.registry.clone();
        let db_clone = db.clone();
        let run_id = plan.run_id.clone();
        let agent_id = plan.agent_id.clone();
        let task = plan.task.clone();
        let timeout_secs = plan.timeout_secs;

        let handle = tokio::spawn(async move {
            execute_subagent(&db_clone, &registry, run_id, agent_id, task, Some(timeout_secs)).await;
        });

        self.registry.store_handle(&plan.run_id, handle)?;

        log::info!("[Orchestrator] Spawned run {} at depth {}", plan.run_id, plan.depth);

        Ok(plan.run_id)
    }

    /// Wait for all children of a parent to complete. Returns their results.
    pub async fn wait_children(&self, parent_run_id: &str, timeout_secs: i64) -> Result<Vec<CompletionEvent>> {
        let mut results = Vec::new();
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(timeout_secs as u64);

        // Get all children
        let children: Vec<String> = {
            let runs = self.registry.list(Some(parent_run_id));
            runs.iter().map(|r| r.run_id.clone()).collect()
        };

        if children.is_empty() {
            return Ok(results);
        }

        log::info!("[Orchestrator] Waiting for {} children of {}", children.len(), parent_run_id);

        // Subscribe to completion events
        let mut subscriber = self.registry.subscribe();

        while start.elapsed() < timeout {
            // Check if all children are complete
            let mut all_done = true;
            for child_id in &children {
                if let Some(run) = self.registry.get(child_id) {
                    if !matches!(run.status.as_str(), "completed" | "error" | "timeout" | "killed") {
                        all_done = false;
                        break;
                    }
                }
            }

            if all_done {
                // Collect results
                for child_id in &children {
                    if let Some(run) = self.registry.get(child_id) {
                        if let Some(ref result) = run.frozen_result {
                            results.push(CompletionEvent {
                                run_id: run.run_id.clone(),
                                session_key: run.session_key.clone(),
                                status: run.status.clone(),
                                result: Some(result.clone()),
                                tokens_used: run.tokens_used,
                                runtime_ms: run.runtime_ms,
                            });
                        }
                    }
                }
                break;
            }

            // Wait for next completion event
            match tokio::time::timeout(std::time::Duration::from_millis(100), subscriber.recv()).await {
                Ok(Ok(event)) => {
                    if children.contains(&event.run_id) {
                        log::info!("[Orchestrator] Child {} completed with status {}", event.run_id, event.status);
                    }
                }
                Ok(Err(broadcast::error::RecvError::Lagged(n))) => {
                    log::warn!("[Orchestrator] Lagged {} completion events", n);
                }
                Ok(Err(broadcast::error::RecvError::Closed)) => {
                    log::error!("[Orchestrator] Completion channel closed");
                    break;
                }
                Err(_) => {
                    // Timeout on recv, will check all_done on next iteration
                }
            }
        }

        log::info!("[Orchestrator] Collected {} child results", results.len());
        Ok(results)
    }

    /// Kill a run and all its children (cascade).
    pub async fn cascade_kill(&self, run_id: &str, db: &EngineDb) -> Result<CascadeResult> {
        let mut killed = Vec::new();

        // Get all descendants first
        let mut to_kill = vec![run_id.to_string()];
        let mut index = 0;
        
        while index < to_kill.len() {
            let current_id = &to_kill[index];
            let children: Vec<String> = self.registry.list(Some(current_id))
                .iter()
                .map(|r| r.run_id.clone())
                .collect();
            to_kill.extend(children);
            index += 1;
        }

        // Kill all
        for id in &to_kill {
            if self.registry.kill(id).await? {
                db.log_subagent_event(id, "cascade_killed", None)?;
                killed.push(id.clone());
            }
        }

        let count = killed.len() as i64;
        log::info!("[Orchestrator] Cascade killed {} runs", count);

        Ok(CascadeResult {
            kill_ids: killed,
            count,
        })
    }

    /// Get the concurrency limiter for status checks.
    pub fn limiter(&self) -> &ConcurrencyLimiter {
        &self.limiter
    }

    /// Get the registry.
    pub fn registry(&self) -> &SubagentRegistry {
        &self.registry
    }
}

pub struct SpawnPlan {
    pub run_id: String,
    pub session_key: String,
    pub depth: i64,
    pub parent_run_id: Option<String>,
    pub agent_id: String,
    pub task: String,
    pub timeout_secs: i64,
}

pub struct CascadeResult {
    pub kill_ids: Vec<String>,
    pub count: i64,
}
