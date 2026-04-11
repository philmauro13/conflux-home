# OpenClaw Multi-Agent Orchestration Research

**Date:** 2026-03-23  
**Purpose:** Technical specification for replicating OpenClaw's sub-agent orchestration patterns in native Rust (tokio + Tauri)

---

## 1. Sub-Agent Lifecycle

### 1.1 Spawn API (`sessions_spawn`)

OpenClaw's `sessions_spawn` tool creates isolated sub-agent runs. Here's the exact API contract:

#### Parameters

```typescript
type SpawnSubagentParams = {
    task: string;                      // Required: task description
    label?: string;                    // Optional: human-readable label
    agentId?: string;                  // Optional: spawn under different agent ID
    model?: string;                    // Optional: model override
    thinking?: string;                 // Optional: thinking level
    runTimeoutSeconds?: number;        // Optional: timeout (0 = no timeout)
    thread?: boolean;                  // Default false; true for thread-bound sessions
    mode?: "run" | "session";          // "run"=one-shot, "session"=persistent
    cleanup?: "delete" | "keep";       // Default "keep"
    sandbox?: "inherit" | "require";   // Default "inherit"
    expectsCompletionMessage?: boolean;
    attachments?: Array<{
        name: string;
        content: string;
        encoding?: "utf8" | "base64";
        mimeType?: string;
    }>;
    attachMountPath?: string;
};
```

#### Context

```typescript
type SpawnSubagentContext = {
    agentSessionKey?: string;          // e.g., "agent:main:xyz123"
    agentChannel?: string;
    agentAccountId?: string;
    agentTo?: string;
    agentThreadId?: string | number;
    agentGroupId?: string | null;
    agentGroupChannel?: string | null;
    agentGroupSpace?: string | null;
    requesterAgentIdOverride?: string;
    workspaceDir?: string;             // Explicit workspace directory
};
```

#### Return Value

```typescript
type SpawnSubagentResult = {
    status: "accepted" | "forbidden" | "error";
    childSessionKey?: string;          // e.g., "agent:main:subagent:a514ee78-..."
    runId?: string;
    mode?: "run" | "session";
    note?: string;
    modelApplied?: boolean;
    error?: string;
    attachments?: {
        count: number;
        totalBytes: number;
        files: Array<{name, bytes, sha256}>;
        relDir: string;
    };
};
```

### 1.2 Session Key Structure

Session keys follow a hierarchical pattern:

```
Depth 0 (main):   agent:<agentId>:<mainKey>
Depth 1 (child):  agent:<agentId>:subagent:<uuid>
Depth 2 (grandchild): agent:<agentId>:subagent:<uuid>:subagent:<uuid>
```

### 1.3 Sub-Agent Registry

OpenClaw maintains an in-memory registry tracking all active sub-agent runs:

```typescript
type SubagentRunRecord = {
    runId: string;
    childSessionKey: string;
    controllerSessionKey?: string;   // Parent session
    requesterSessionKey: string;
    requesterOrigin?: DeliveryContext;
    requesterDisplayKey: string;
    task: string;
    cleanup: "delete" | "keep";
    label?: string;
    model?: string;
    workspaceDir?: string;
    runTimeoutSeconds?: number;
    spawnMode?: "run" | "session";
    createdAt: number;               // Unix timestamp (ms)
    startedAt?: number;
    endedAt?: number;
    outcome?: SubagentRunOutcome;    // {status: "ok"|"error"|"timeout"|"unknown"}
    archiveAtMs?: number;
    cleanupCompletedAt?: number;
    expectsCompletionMessage?: boolean;
    announceRetryCount?: number;
    lastAnnounceRetryAt?: number;
    endedReason?: "subagent-complete"|"subagent-error"|"subagent-killed"|"session-reset"|"session-delete";
    frozenResultText?: string | null;      // Latest completion output
    frozenResultCapturedAt?: number;
    wakeOnDescendantSettle?: boolean;
};
```

### 1.4 `subagents` Tool Actions

The `subagents` tool provides control over spawned runs:

- **`list`**: Returns all sub-agent runs for current session
- **`kill <id>`**: Terminates a specific run + cascades to children
- **`steer <id> <message>`**: Sends guidance message to running sub-agent
- **`log <id>`**: Fetches transcript/logs
- **`info <id>`**: Returns metadata from registry
- **`send <id> <message>`**: Direct message injection

### 1.5 Push-Based Completion (Critical Pattern)

**OpenClaw does NOT poll for completion.** Results auto-announce via internal event system:

**Flow:**
1. Parent spawns child → receives `{childSessionKey, runId}`
2. Parent continues execution (non-blocking)
3. Child finishes → internal lifecycle event fires
4. Event triggers announce step → runs in *child* session context
5. Announce generates summary → posted to requester channel
6. Parent receives completion as user message

**Key insight:** Parent tracks expected children and waits for ALL completion events before finalizing. No polling loops.

```rust
// Rust equivalent pattern
struct Orchestrator {
    spawned: HashMap<RunId, ChildHandle>,
    completed: HashMap<RunId, CompletionResult>,
    completion_rx: Receiver<CompletionEvent>,  // tokio channel
}

impl Orchestrator {
    async fn spawn(&mut self, task: String) -> RunId {
        let (run_id, handle) = spawn_subagent(task).await;
        self.spawned.insert(run_id.clone(), handle);
        run_id
    }
    
    async fn wait_all(&mut self) -> Vec<CompletionResult> {
        // Receive push-based events, no polling
        for _ in 0..self.spawned.len() {
            if let Ok(event) = self.completion_rx.recv().await {
                self.completed.insert(event.run_id.clone(), event.result);
            }
        }
        self.completed.values().cloned().collect()
    }
}
```

### 1.6 Error Handling & Panic Propagation

**Q: Does a sub-agent panic kill the parent?**

**A: No.** OpenClaw isolates failures:

- Sub-agent error → marks run with `outcome: {status: "error"}`
- Error propagates as completion event with error details
- Parent continues execution, receives error in announce
- Cascade stop only on explicit `/stop` or `kill` command

**Timeout behavior:**
- `runTimeoutSeconds` triggers abort at runtime level
- Run marked with `outcome: {status: "timeout"}`
- Session auto-archives after `agents.defaults.subagents.archiveAfterMinutes` (default: 60)

---

## 2. Orchestrator Pattern (Prism/Spectra/Luma)

### 2.1 Role-Based Capability System

OpenClaw assigns roles and capabilities based on spawn depth:

| Depth | Role | Can Spawn? | Can Control Children? | Session Tools Available |
|-------|------|------------|----------------------|-------------------------|
| 0 | `main` | Always | Yes (depth 1 children) | All except `subagents` |
| 1 | `orchestrator` | Only if `maxSpawnDepth >= 2` | Yes (depth 2) | `sessions_spawn`, `subagents`, `sessions_list`, `sessions_history` |
| 1 | `leaf` | No (when maxSpawnDepth=1) | No | None |
| 2 | `leaf` | Never | No | None |

**Configuration:**
```json5
{
  agents: {
    defaults: {
      subagents: {
        maxSpawnDepth: 2,           // Allow depth-2 (default: 1)
        maxChildrenPerAgent: 5,     // Active children cap per session
        maxConcurrent: 8,           // Global concurrency lane
        runTimeoutSeconds: 900,     // Default timeout
        archiveAfterMinutes: 60,    // Auto-archive delay
      }
    }
  }
}
```

### 2.2 Orchestrator Workflow

**Decomposition Pattern:**
1. **Prism** (orchestrator) receives mission
2. Spawns **Spectra** for task decomposition
3. Spectra returns structured task graph
4. Prism spawns parallel **worker** sub-agents (Forge, Helix, etc.)
5. Workers announce results back to Prism
6. Prism aggregates → validates (via Vector gate) → passes to **Luma** for launch

**Approval Gate (Vector Role):**
- Vector is NOT a separate agent run—it's a policy layer
- Approval decisions returned as structured data:
  ```typescript
  type ApprovalDecision = "APPROVE" | "REJECT" | "REFINE";
  ```
- Vector policy stored in canonical JSON files (e.g., `budgets.json`, `policies.json`)
- Orchestrator checks Vector policy before creating missions

**OpenClaw does not implement Prism/Spectra/Luma as built-in agents.** These are user-defined agents in the venture studio config (`AGENTS.md` in workspace). The orchestration pattern is:
- Use `maxSpawnDepth: 2` to enable depth-1 orchestrators
- Depth-1 orchestrator spawns depth-2 workers
- All results flow up via announce chain

### 2.3 Result Aggregation

Announce payloads include:
```typescript
type AnnouncePayload = {
    source: "subagent" | "cron";
    childSessionKey: string;
    childRunId: string;
    task: string;
    label?: string;
    status: "success" | "error" | "timeout" | "unknown";  // From runtime
    result: string;  // Assistant reply or `(no output)`
    runtime: string;  // "5m12s"
    tokens: { input: number; output: number; total: number };
    cost?: number;   // If model pricing configured
    sessionKey: string;
    sessionId: string;
    transcriptPath: string;  // Filesystem path for manual inspection
};
```

**Aggregation strategy** (orchestrator responsibility):
1. Track all spawned children by `runId`
2. Wait for all `CompletionEvent` arrivals (push-based)
3. Extract `result` from each announce payload
4. Synthesize into final summary
5. Send own announce to parent

---

## 3. Parallel Execution Model

### 3.1 Concurrency Control

OpenClaw uses a **lane-based queuing system**:

- **Lane name:** `subagent`
- **Concurrency limit:** `agents.defaults.subagents.maxConcurrent` (default: 8)
- **Session serialization:** Each session key has its own queue lane

**Queue modes** (from `auto-reply/reply/queue.js`):
```typescript
type QueueMode = "collect" | "steer" | "followup";
type QueueDropPolicy = "oldest" | "newest";
```

**Enforcement:**
- New spawn request checks active count against `maxConcurrent`
- If at limit, request queued until slot available
- Per-session limit: `maxChildrenPerAgent` (default: 5)

### 3.2 Resource Limits

| Resource | Limit | Config Key |
|----------|-------|------------|
| Max spawn depth | 1–5 | `agents.defaults.subagents.maxSpawnDepth` |
| Active children per agent | 1–20 | `agents.defaults.subagents.maxChildrenPerAgent` |
| Global concurrent subagents | 8 (default) | `agents.defaults.subagents.maxConcurrent` |
| Run timeout | 0 (unlimited) or N seconds | `sessions_spawn.runTimeoutSeconds` |

### 3.3 Cancellation Propagation

**Cascade stop pattern:**
1. User sends `/stop` to main session
2. Main session queries registry for all active children
3. For each child: sends abort signal + waits for settle timeout
4. Child aborts → marks `endedReason: "session-reset"` (cascade stop)
5. Child's children (depth 2) also aborted recursively

**Manual kill:**
```typescript
killControlledSubagentRun(params: {
    controller: ResolvedSubagentController;
    entry: SubagentRunRecord;
}): Promise<{
    status: "done" | "ok";
    runId: string;
    sessionKey: string;
    cascadeKilled?: number;  // Count of child runs terminated
    cascadeLabels?: string[];
}>;
```

**Settle timeout:** `STEER_ABORT_SETTLE_TIMEOUT_MS = 5000` (5 seconds)

---

## 4. Shared State Architecture

### 4.1 Session Write Locks

OpenClaw uses **file-based advisory locks** for concurrent session access:

**Lock file pattern:**
```
~/.openclaw/agents/<agentId>/sessions/<session.key>.lock
```

**Lock structure:**
```typescript
type SessionLockInfo = {
    pid: number;
    createdAt: string;  // ISO-8601
};
```

**Acquisition:**
```typescript
acquireSessionWriteLock(params: {
    sessionFile: string;
    timeoutMs?: number;       // Default: 30000
    staleMs?: number;         // Default: 60000 (1 min)
    maxHoldMs?: number;       // Derived from timeout
    allowReentrant?: boolean; // Default: false
}): Promise<{ release: () => Promise<void> }>;
```

**Stale lock detection:**
- Lock age > `staleMs` → considered stale
- Check if `pid` still alive via `kill(pid, 0)`
- Stale locks can be cleaned with `cleanStaleLockFiles()`

**Release on crash:**
- SIGINT/SIGTERM/SIGQUIT/SIGABRT handlers call `releaseAllLocksSync()`
- Watchdog runs periodically to clean orphaned locks

### 4.2 Canonical Pattern (shared/MEMORY.md)

Each agent workspace has its own `MEMORY.md` file for long-term state:

```
~/.openclaw/workspace-<agentId>/MEMORY.md
```

**OpenClaw does NOT use in-memory shared state between agents.** Each agent has:
- Isolated workspace directory
- Separate session store
- Separate `auth-profiles.json`

**For venture studio pattern** (multiple agents sharing state):
- Use canonical JSON files under `/home/calo/.openclaw/shared/`
- File-based coordination (locks for concurrent writes)
- Example state files:
  - `studio_state.json`
  - `missions/mission-0001.json`
  - `telemetry/events.jsonl` (append-only)

**Lock pattern for canonical files:**
```bash
# Acquire lock
acquire_lock("/home/calo/.openclaw/shared/studio/studio_state.json.lock")

# Read-modify-write
state = read_json("studio_state.json")
state.last_updated = now()
write_json_atomic("studio_state.json", state)  # tmp + rename

# Release lock
release_lock(...)
```

### 4.3 Attachment Handling

Attachments passed to sub-agents:
- Stored in dedicated directory: `~/.openclaw/agents/<agentId>/attachments/<runId>/`
- SHA-256 hash computed for each file
- `attachMountPath` parameter maps to container mount point

---

## 5. Rust Equivalent Patterns

### 5.1 Sub-Agent Lifecycle (tokio tasks)

```rust
use tokio::sync::{mpsc, RwLock};
use std::sync::Arc;
use uuid::Uuid;

pub type RunId = String;
pub type SessionKey = String;

#[derive(Clone)]
pub struct SubagentRegistry {
    runs: Arc<RwLock<HashMap<RunId, SubagentRunRecord>>>,
    completion_tx: mpsc::Sender<CompletionEvent>,
}

#[derive(Debug, Clone)]
pub struct SubagentRunRecord {
    pub run_id: RunId,
    pub child_session_key: SessionKey,
    pub controller_session_key: Option<SessionKey>,
    pub task: String,
    pub mode: SpawnMode,  // Run | Session
    pub cleanup: CleanupPolicy,  // Delete | Keep
    pub created_at: u64,  // Unix ms
    pub run_timeout_secs: Option<u64>,
    // ... more fields
}

#[derive(Debug, Clone)]
pub enum SpawnMode {
    Run,      // One-shot
    Session,  // Persistent/thread-bound
}

#[derive(Debug, Clone)]
pub enum CompletionStatus {
    Ok,
    Error(String),
    Timeout,
    Killed,
}

pub struct CompletionEvent {
    pub run_id: RunId,
    pub session_key: SessionKey,
    pub status: CompletionStatus,
    pub result: Option<String>,
    pub token_usage: TokenUsage,
    pub runtime_ms: u64,
}

impl SubagentRegistry {
    pub fn new() -> Self {
        let (tx, mut rx) = mpsc::channel(100);
        let registry = Self {
            runs: Arc::new(RwLock::new(HashMap::new())),
            completion_tx: tx,
        };
        
        // Spawn listener (receives push-based completions)
        let runs = registry.runs.clone();
        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                let mut runs_guard = runs.write().await;
                if let Some(record) = runs_guard.get_mut(&event.run_id) {
                    // Update record with completion
                    record.ended_at = Some(utc_now_ms());
                    // ... trigger announce logic
                }
            }
        });
        
        registry
    }
    
    pub async fn spawn(&self, params: SpawnParams) -> SpawnResult {
        let run_id = Uuid::new_v4().to_string();
        let session_key = format!("agent:main:subagent:{}", run_id);
        
        let record = SubagentRunRecord {
            run_id: run_id.clone(),
            child_session_key: session_key.clone(),
            task: params.task,
            created_at: utc_now_ms(),
            // ... initialize other fields
        };
        
        self.runs.write().await.insert(run_id.clone(), record);
        
        // Spawn tokio task for sub-agent execution
        let registry = self.clone();
        let task_handle = tokio::spawn(async move {
            execute_subagent(params).await
        });
        
        SpawnResult {
            status: "accepted".to_string(),
            run_id: Some(run_id),
            child_session_key: Some(session_key),
            // ...
        }
    }
}
```

### 5.2 Orchestrator Pattern (tokio + channels)

```rust
pub struct Orchestrator {
    registry: SubagentRegistry,
    spawned_children: Arc<RwLock<HashMap<RunId, ChildHandle>>>,
    results: Arc<RwLock<HashMap<RunId, AggregatedResult>>>,
    max_depth: u8,
    current_depth: u8,
}

impl Orchestrator {
    pub fn new(max_depth: u8, current_depth: u8) -> Self {
        Self {
            registry: SubagentRegistry::new(),
            spawned_children: Arc::new(RwLock::new(HashMap::new())),
            results: Arc::new(RwLock::new(HashMap::new())),
            max_depth,
            current_depth,
        }
    }
    
    pub async fn can_spawn(&self) -> bool {
        if self.current_depth >= self.max_depth {
            return false;
        }
        let children = self.spawned_children.read().await;
        children.len() < MAX_CHILDREN_PER_AGENT  // e.g., 5
    }
    
    pub async fn spawn_worker(&self, task: String) -> Result<RunId, SpawnError> {
        if !self.can_spawn().await {
            return Err(SpawnError::AtLimit);
        }
        
        let result = self.registry.spawn(SpawnParams {
            task,
            mode: SpawnMode::Run,
            ..default()
        }).await;
        
        if result.status == "accepted" {
            let run_id = result.run_id.unwrap();
            self.spawned_children.write().await.insert(
                run_id.clone(),
                ChildHandle { run_id: run_id.clone() }
            );
            Ok(run_id)
        } else {
            Err(SpawnError::Rejected)
        }
    }
    
    pub async fn wait_all(&self) -> Vec<AggregatedResult> {
        // Use channel receiver to wait for completions
        let expected_count = self.spawned_children.read().await.len();
        
        // In real impl, subscribe to registry's completion channel
        // For example, clone receiver and receive N events
        
        let mut results = Vec::new();
        // ... receive events via channel
        
        results
    }
}
```

### 5.3 Parallel Execution (tokio::Semaphore + lanes)

```rust
use tokio::sync::Semaphore;

pub struct ConcurrencyLimiter {
    global_semaphore: Arc<Semaphore>,
    session_lanes: RwLock<HashMap<SessionKey, Arc<Semaphore>>>,
}

impl ConcurrencyLimiter {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            global_semaphore: Arc::new(Semaphore::new(max_concurrent)),
            session_lanes: RwLock::new(HashMap::new()),
        }
    }
    
    pub async fn acquire(&self, session_key: &SessionKey) -> SemaphorePermit<'_> {
        let session_sem = {
            let mut lanes = self.session_lanes.write().await;
            lanes.entry(session_key.clone())
                .or_insert_with(|| Arc::new(Semaphore::new(1)))
                .clone()
        };
        
        // Acquire global slot
        let global_permit = self.global_semaphore.acquire().await.unwrap();
        
        // Acquire session slot
        let session_permit = session_sem.acquire().await.unwrap();
        
        // Return combined permit (in real impl, use custom guard)
        session_permit
    }
}
```

### 5.4 Shared State (SQLite + advisory locks)

```rust
use rusqlite::{Connection, params};
use std::fs::OpenOptions;
use fs2::FileExt;  // Advisory locking

pub struct StateStore {
    db: Connection,
}

impl StateStore {
    pub fn new(path: &str) -> Result<Self, rusqlite::Error> {
        let db = Connection::open(path)?;
        
        // Create tables
        db.execute(
            "CREATE TABLE IF NOT EXISTS subagent_runs (
                run_id TEXT PRIMARY KEY,
                child_session_key TEXT NOT NULL,
                controller_session_key TEXT,
                task TEXT,
                mode TEXT,
                cleanup TEXT,
                created_at INTEGER,
                started_at INTEGER,
                ended_at INTEGER,
                outcome TEXT,
                frozen_result TEXT
            )",
            [],
        )?;
        
        Ok(Self { db })
    }
    
    pub fn with_file_lock<F, T>(&self, path: &str, f: F) -> Result<T, std::io::Error>
    where
        F: FnOnce() -> Result<T, std::io::Error>
    {
        let lock_file = OpenOptions::new()
            .create(true)
            .write(true)
            .open(format!("{}.lock", path))?;
        
        lock_file.lock_exclusive()?;
        let result = f();
        lock_file.unlock()?;
        result
    }
    
    #[inline]
    pub fn write_json_atomic<T: Serialize>(&self, path: &str, data: &T) -> Result<(), std::io::Error> {
        self.with_file_lock(path, || {
            // Write to temp file, then rename
            let tmp_path = format!("{}.tmp", path);
            let mut tmp = std::fs::File::create(&tmp_path)?;
            serde_json::to_writer_pretty(&mut tmp, data)?;
            std::fs::rename(&tmp_path, path)?;
            Ok(())
        })?;
        Ok(())
    }
}
```

### 5.5 Push-Based Completion (tokio broadcast channel)

```rust
use tokio::sync::broadcast;

pub struct CompletionBroadcaster {
    tx: broadcast::Sender<CompletionEvent>,
}

impl CompletionBroadcaster {
    pub fn new() -> Self {
        let (tx, _rx) = broadcast::channel(1000);
        Self { tx }
    }
    
    pub fn send(&self, event: CompletionEvent) {
        let _ = self.tx.send(event);
        // Ignore send errors (no receivers = parent done waiting)
    }
    
    pub fn subscribe(&self) -> broadcast::Receiver<CompletionEvent> {
        self.tx.subscribe()
    }
}

// Parent agent usage:
async fn run_orchestration(broadcaster: CompletionBroadcaster, tasks: Vec<String>) {
    let mut rx = broadcaster.subscribe();
    let mut handles = Vec::new();
    
    for task in tasks {
        let handle = tokio::spawn({
            let tx = broadcaster.tx.clone();
            async move {
                let result = execute_task(task).await;
                let _ = tx.send(CompletionEvent {
                    run_id: Uuid::new_v4().to_string(),
                    status: if result.is_ok() { CompletionStatus::Ok } else { CompletionStatus::Error("...".to_string()) },
                    // ...
                });
                result
            }
        });
        handles.push(handle);
    }
    
    // Wait for ALL completions WITHOUT polling
    for _ in 0..handles.len() {
        match rx.recv().await {
            Ok(event) => println!("Received completion: {}", event.run_id),
            Err(broadcast::error::RecvError::Lagged(n)) => {
                eprintln!("Lagged {} messages", n);
            }
            Err(broadcast::error::RecvError::Closed) => break,
        }
    }
    
    // All completions received, aggregate results
    for handle in handles {
        let result = handle.await.unwrap();
        // ...
    }
}
```

---

## 6. Gap Analysis

### 6.1 What We Have (Current Rust/Conflux State)

| Component | Status |
|-----------|--------|
| Basic tokio runtime | ✅ Available |
| Tauri app shell | ✅ Available |
| SQLite for persistence | ⚠️ Needs setup |
| HTTP client (reqwest) | ✅ Available |
| JSON serialization (serde) | ✅ Available |
| UUID generation | ✅ Available |

### 6.2 What We Need to Build

| Component | Description | Effort | Dependencies |
|-----------|-------------|--------|--------------|
| **SubagentRegistry** | Track active runs, push-based completion channel | 4h | tokio, uuid, serde |
| **Spawn API** | `sessions_spawn` equivalent with params validation | 3h | registry, sqlite |
| **Orchestrator** | Role-based capability system, depth tracking | 4h | registry, semaphore |
| **Concurrency limiter** | Lane-based queuing, global + per-session limits | 2h | tokio::sync::Semaphore |
| **Announce system** | Push completion events to parent via channel | 2h | tokio::broadcast |
| **File lock manager** | Advisory locks for session state files | 2h | fs2 crate |
| **SQLite schema** | Tables for runs, sessions, telemetry | 2h | rusqlite |
| **Cascade stop** | Propagate cancellation to children | 2h | abort handles, channels |
| **Timeout system** | Per-run timeout with graceful abort | 2h | tokio::time::timeout |
| **State file atomic writes** | tmp + rename pattern for JSON files | 1h | std::fs |

**Total estimated effort:** ~24 hours (3 days focused work)

### 6.3 Key Design Decisions for Rust Implementation

1. **Push-based completion is critical:** Do NOT implement polling loops. Use tokio broadcast/mutex channels.

2. **Separate registry from execution:**
   - Registry = state tracking (in-memory + SQLite persistence)
   - Execution = tokio tasks running actual agent logic

3. **Use tokio::broadcast for completion events:**
   - Allows multiple listeners (orchestrator + UI)
   - Events immutable - perfect for functional pattern
   - Built-in backpressure (channel size limit)

4. **File locks only for JSON state files:**
   - Session transcripts → append-only, no lock needed
   - State files (studio_state.json, etc.) → exclusive lock
   - Use `fs2::lock_exclusive()` for simplicity

5. **SQLite for canonical state:**
   - Runs table = source of truth
   - Telemetry table = append-only event log
   - File-based JSON → fallback or human-readable cache

6. **Capability-based access control:**
   - Store capabilities in session context at spawn time
   - Check `can_spawn()` before allowing `spawn_worker()`
   - Prevent depth escalation attacks

### 6.4 Testing Strategy

**Unit tests needed:**
1. Registry insertion/lookup
2. Depth capability checks
3. Concurrency limiter (acquire/release)
4. File lock acquisition/release
5. Atomic write verification (temp + rename)
6. Timeout enforcement
7. Cascade stop propagation

**Integration tests:**
1. Parent spawns 5 children → wait_all → verify all completions
2. Orchestrator at depth 1 → spawn depth 2 → verify depth 2 cannot spawn
3. Kill parent → verify all children aborted
4. Timeout child → verify timeout recorded, parent continues

---

## Appendix A: Key OpenClaw Source Files

```
~/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/dist/plugin-sdk/agents/
├── subagent-registry.d.ts          # Registry API (register, release, list)
├── subagent-registry.types.d.ts    # SubagentRunRecord type
├── subagent-spawn.d.ts             # Spawn API definition
├── subagent-announce.d.ts          # Announce flow API
├── subagent-announce-dispatch.d.ts # Dispatch strategy (queue vs direct)
├── subagent-announce-queue.d.ts    # Queue settings
├── subagent-control.d.ts           # steer/kill/list logic
├── subagent-capabilities.d.ts      # Role/capability resolution
├── subagent-lifecycle-events.d.ts  # Status enums
├── subagent-depth.d.ts             # Spawn depth tracking
├── subagent-registry-cleanup.d.ts  # Cleanup with pending descendants
└── session-write-lock.d.ts         # File-based locking
```

**Documentation:**
- `docs/tools/subagents.md` - User-facing guide
- `docs/concepts/multi-agent.md` - Agent routing
- `docs/concepts/agent-loop.md` - Lifecycle events
- `docs/gateway/sandboxing.md` - Container isolation

---

## Appendix B. Glossary

| Term | Meaning |
|------|---------|
| **Run ID** | UUID for a single sub-agent execution |
| **Session Key** | Hierarchical identifier (agent:main:subagent:uuid) |
| **Spawn Depth** | Nesting level (0=main, 1=child, 2=grandchild) |
| **Lane** | Concurrency queue (global or per-session) |
| **Push-based** | Event-driven completion (no polling) |
| **Announce** | Child-to-parent completion delivery step |
| **Cascade Stop** | Recursive termination of children |
| **Frozen Result** | Latest completion text captured for delivery |

---

**End of Document**
