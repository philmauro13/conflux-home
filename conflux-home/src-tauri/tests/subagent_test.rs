// Conflux Engine — Sub-Agent Integration Tests
// Tests for Day 2: Orchestration + Concurrency + Spawn Runtime

use app_lib::engine;
use app_lib::engine::orchestrator::Orchestrator;
use app_lib::engine::subagent::{make_run_id, make_session_key, ConcurrencyLimiter};
use app_lib::engine::types::SpawnParams;
use std::fs;

fn setup_test_engine() -> (String, engine::ConfluxEngine) {
    // Create a unique temporary database for each test
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
        .as_nanos();

    let temp_dir = std::env::temp_dir().join("conflux_test");
    fs::create_dir_all(&temp_dir).expect("Failed to create temp dir");
    let db_path = temp_dir.join(format!("test_{}.db", timestamp));

    let engine = engine::ConfluxEngine::new(&db_path).expect("Failed to create test engine");
    (db_path.to_string_lossy().to_string(), engine)
}

#[test]
fn test_subagent_registry_basic() {
    let (_temp_path, engine) = setup_test_engine();
    let registry = engine.subagent_registry();

    // Create a test run record
    let run_id = make_run_id();
    let session_key = make_session_key("test-agent", &run_id);
    let now = chrono::Utc::now().to_rfc3339();

    let record = engine::types::SubagentRunRecord {
        run_id: run_id.clone(),
        parent_run_id: None,
        session_key: session_key.clone(),
        controller_session_key: Some("test".to_string()),
        agent_id: "test-agent".to_string(),
        task: "Test task".to_string(),
        label: None,
        mode: "run".to_string(),
        cleanup: "keep".to_string(),
        depth: 0,
        status: "spawned".to_string(),
        model_override: None,
        timeout_secs: None,
        created_at: now.clone(),
        started_at: None,
        ended_at: None,
        outcome: None,
        error_message: None,
        frozen_result: None,
        tokens_used: 0,
        runtime_ms: 0,
    };

    // Register the run
    registry
        .register(record.clone())
        .expect("Failed to register run");

    // Verify it appears in list
    let runs = registry.list(None);
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].run_id, run_id);

    // Test count_children (should be 0 for this run)
    let children = registry.count_children(&run_id);
    assert_eq!(children, 0);

    // Verify list_active includes it
    let active = registry.list_active();
    assert_eq!(active.len(), 1);

    // Update status to completed and verify it's filtered out
    registry
        .update_status(&run_id, "completed", Some("completed"), None)
        .expect("Failed to update status");

    let active = registry.list_active();
    assert_eq!(active.len(), 0);

    println!("✓ test_subagent_registry_basic passed");
}

#[test]
fn test_concurrency_limiter() {
    let limiter = ConcurrencyLimiter::new(2);

    // Verify initial state
    assert_eq!(limiter.available(), 2);
    assert_eq!(limiter.active_count(), 0);

    // Acquire 2 permits concurrently
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let permit1 = limiter
            .acquire("session1")
            .await
            .expect("Failed to acquire permit 1");
        assert_eq!(limiter.available(), 1);
        assert_eq!(limiter.active_count(), 1);

        let permit2 = limiter
            .acquire("session2")
            .await
            .expect("Failed to acquire permit 2");
        assert_eq!(limiter.available(), 0);
        assert_eq!(limiter.active_count(), 2);

        // Permits are held, verify they release on drop
        drop(permit1);
        assert_eq!(limiter.available(), 1);
        assert_eq!(limiter.active_count(), 1);

        drop(permit2);
        assert_eq!(limiter.available(), 2);
        assert_eq!(limiter.active_count(), 0);
    });

    println!("✓ test_concurrency_limiter passed");
}

#[test]
fn test_orchestrator_depth_limit() {
    let (_temp_path, engine) = setup_test_engine();
    let registry = engine.subagent_registry().clone();
    let orchestrator = Orchestrator::new(registry, 2); // max_depth = 2

    // Verify can_spawn returns false at depth >= 2
    assert!(orchestrator.can_spawn(None, 0));
    assert!(orchestrator.can_spawn(None, 1));
    assert!(!orchestrator.can_spawn(None, 2));
    assert!(!orchestrator.can_spawn(None, 3));

    println!("✓ test_orchestrator_depth_limit passed");
}

#[test]
fn test_spawn_plan_validation() {
    let (_temp_path, engine) = setup_test_engine();
    let registry = engine.subagent_registry().clone();
    let orchestrator = Orchestrator::new(registry, 2);

    // Test valid spawn plan
    let params = SpawnParams {
        agent_id: "test-agent".to_string(),
        task: "Test task".to_string(),
        label: None,
        mode: "run".to_string(),
        parent_run_id: None,
        model_override: None,
        timeout_secs: None,
        cleanup: "keep".to_string(),
    };

    let plan = orchestrator.plan_spawn(&params, None);
    assert!(plan.is_ok());
    let plan = plan.unwrap();
    assert_eq!(plan.depth, 0);
    assert_eq!(plan.agent_id, "test-agent");

    // Test rejected at depth limit - simulate by manually checking
    assert!(!orchestrator.can_spawn(None, 2));

    println!("✓ test_spawn_plan_validation passed");
}

#[tokio::test]
async fn test_orchestrator_execute_spawn() {
    let (_temp_path, engine) = setup_test_engine();

    // Create a test agent in the DB first
    let agent_id = "test-agent";
    let db = engine.db();

    // Insert test agent
    db.conn()
        .execute(
            "INSERT INTO agents (id, name, emoji, role, soul, instructions, model_alias, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                agent_id,
                "Test Agent",
                "🤖",
                "Tester",
                "I am a test agent.",
                "Test instructions.",
                "core",
                1
            ],
        )
        .expect("Failed to insert test agent");

    let params = SpawnParams {
        agent_id: agent_id.to_string(),
        task: "Say hello".to_string(),
        label: None,
        mode: "run".to_string(),
        parent_run_id: None,
        model_override: None,
        timeout_secs: Some(5),
        cleanup: "keep".to_string(),
    };

    let plan = engine
        .orchestrator()
        .plan_spawn(&params, None)
        .expect("Failed to plan spawn");
    let run_id = engine
        .orchestrator()
        .execute_spawn(plan, engine.db())
        .await
        .expect("Failed to execute spawn");

    // Verify the run was created
    let runs = engine.subagent_registry().list(None);
    assert!(runs.iter().any(|r| r.run_id == run_id));

    println!("✓ test_orchestrator_execute_spawn passed");
}

#[test]
fn test_spawn_helpers() {
    // Test make_run_id generates unique IDs
    let id1 = make_run_id();
    let id2 = make_run_id();
    assert_ne!(id1, id2);
    assert!(!id1.is_empty());
    assert!(!id2.is_empty());

    // Test make_session_key format
    let session_key = make_session_key("agent-123", "run-456");
    assert_eq!(session_key, "agent:agent-123:subagent:run-456");

    println!("✓ test_spawn_helpers passed");
}

#[tokio::test]
async fn test_full_subagent_lifecycle() {
    let (_temp, engine) = setup_test_engine();

    // Create test agent in DB
    let agent_id = "test-agent";
    let db = engine.db();
    db.conn()
        .execute(
            "INSERT INTO agents (id, name, emoji, role, soul, instructions, model_alias, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                agent_id,
                "Test Agent",
                "🤖",
                "Tester",
                "I test.",
                "Be helpful.",
                "core",
                1
            ],
        )
        .expect("Failed to insert test agent");

    // Spawn sub-agent
    let params = SpawnParams {
        agent_id: agent_id.to_string(),
        task: "Say hello".to_string(),
        label: None,
        mode: "run".to_string(),
        parent_run_id: None,
        model_override: None,
        timeout_secs: Some(10),
        cleanup: "keep".to_string(),
    };

    let run_id = engine
        .orchestrator()
        .execute_spawn(
            engine
                .orchestrator()
                .plan_spawn(&params, None)
                .expect("Failed to plan"),
            db,
        )
        .await
        .expect("Failed to spawn");

    // Wait for completion by subscribing to events
    let mut subscriber = engine.subagent_registry().subscribe();
    let timeout = tokio::time::timeout(std::time::Duration::from_secs(30), async {
        loop {
            match subscriber.recv().await {
                Ok(event) => {
                    if event.run_id == run_id {
                        return event.status;
                    }
                }
                Err(_) => break String::from("error"),
            }
        }
    })
    .await;

    let status = match timeout {
        Ok(s) => s,
        Err(_) => "timeout".to_string(),
    };

    // Verify run completed
    let run = db.get_subagent_run(&run_id).expect("Failed to get run");
    assert!(run.is_some());
    let run = run.unwrap();
    assert!(
        run.status == "completed" || run.status == "error" || run.status == "timeout",
        "Expected completed/error/timeout but got: {} (event status: {})",
        run.status,
        status
    );

    println!(
        "✓ test_full_subagent_lifecycle passed (run_id: {}, status: {})",
        run_id, run.status
    );
}

#[tokio::test]
async fn test_cascade_kill() {
    let (_temp, engine) = setup_test_engine();

    // Create test agent in DB
    let agent_id = "test-agent";
    let db = engine.db();
    db.conn()
        .execute(
            "INSERT INTO agents (id, name, emoji, role, soul, instructions, model_alias, is_active)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                agent_id,
                "Test Agent",
                "🤖",
                "Tester",
                "I test.",
                "Be helpful.",
                "core",
                1
            ],
        )
        .expect("Failed to insert test agent");

    // Spawn a parent
    let parent_run_id = engine
        .orchestrator()
        .execute_spawn(
            engine
                .orchestrator()
                .plan_spawn(
                    &SpawnParams {
                        agent_id: agent_id.to_string(),
                        task: "Parent task".to_string(),
                        label: None,
                        mode: "run".to_string(),
                        parent_run_id: None,
                        model_override: None,
                        timeout_secs: Some(10),
                        cleanup: "keep".to_string(),
                    },
                    None,
                )
                .expect("Failed to plan"),
            db,
        )
        .await
        .expect("Failed to spawn parent");

    // Kill the parent (should cascade)
    let result = engine
        .orchestrator()
        .cascade_kill(&parent_run_id, db)
        .await
        .expect("Failed to cascade kill");

    // Verify cascaded (at least the parent should be killed)
    assert!(result.count >= 1);

    println!("✓ test_cascade_kill passed (killed {} runs)", result.count);
}
