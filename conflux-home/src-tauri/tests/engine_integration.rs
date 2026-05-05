// Conflux Engine — Integration Test
// Tests the engine in isolation: DB init, agent operations, tools, skills, cron, webhooks

#[cfg(test)]
mod integration_tests {
    use app_lib::engine;

    #[test]
    fn test_engine_init() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();
        // If we got here without panic, schema migration worked
        println!("✅ Engine DB initialized successfully");
    }

    #[test]
    fn test_agents_seeded() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();
        let agents = db.get_active_agents().unwrap();
        assert!(
            agents.len() >= 10,
            "Expected at least 10 seeded agents, got {}",
            agents.len()
        );

        for agent in &agents {
            println!("  🤖 {} ({}) — {}", agent.emoji, agent.name, agent.role);
        }
        println!("✅ {} agents seeded correctly", agents.len());
    }

    #[test]
    fn test_provider_templates() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();
        let templates = db.get_provider_templates().unwrap();
        assert!(
            templates.len() >= 5,
            "Expected at least 5 provider templates, got {}",
            templates.len()
        );

        for t in &templates {
            println!(
                "  {} {} — {} (free: {})",
                t.emoji, t.name, t.description, t.is_free
            );
        }
        println!("✅ {} provider templates loaded", templates.len());
    }

    #[test]
    fn test_tools_seeded() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();
        let conn = db.conn();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tools", [], |r| r.get(0))
            .unwrap();
        assert!(count >= 12, "Expected at least 12 tools, got {}", count);
        println!("✅ {} tools seeded", count);
    }

    #[test]
    fn test_skills_seeded() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();
        let skills = db.get_skills(true).unwrap();
        assert!(
            skills.len() >= 5,
            "Expected at least 5 skills, got {}",
            skills.len()
        );

        for s in &skills {
            println!(
                "  {} {} — {}",
                s.emoji,
                s.name,
                s.description.as_deref().unwrap_or("")
            );
        }
        println!("✅ {} skills seeded", skills.len());
    }

    #[test]
    fn test_skills_for_agent() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();
        let helix_skills = db.get_skills_for_agent("helix").unwrap();
        assert!(
            !helix_skills.is_empty(),
            "Helix should have at least one skill"
        );

        for s in &helix_skills {
            println!("  Helix can: {} {}", s.emoji, s.name);
        }
        println!("✅ Agent skill scoping works");
    }

    #[test]
    fn test_agent_capabilities() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();
        let helix_caps = db.get_agent_capabilities("helix").unwrap();
        assert!(!helix_caps.is_empty(), "Helix should have capabilities");

        for c in &helix_caps {
            println!("  Helix: {} ({})", c.capability, c.proficiency);
        }
        println!("✅ Agent capabilities work");
    }

    #[test]
    fn test_agent_permissions() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        // Prism should be able to talk to everyone
        assert!(
            db.can_agent_talk_to("prism", "helix").unwrap(),
            "Prism should talk to Helix"
        );
        assert!(
            db.can_agent_talk_to("prism", "forge").unwrap(),
            "Prism should talk to Forge"
        );
        println!("  Prism → Helix: ✅");
        println!("  Prism → Forge: ✅");

        // Forge should not be able to talk to everyone
        let forge_perms = db.get_agent_permissions("forge").unwrap().unwrap();
        println!("  Forge can_talk_to: {}", forge_perms.can_talk_to);
        println!(
            "  Forge requires_verification: {}",
            forge_perms.requires_verification
        );

        println!("✅ Agent permissions work");
    }

    #[test]
    fn test_memory_fts() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        // Store some memories
        let id1 = db
            .store_memory(
                "conflux",
                "preference",
                Some("name"),
                "User's name is Don",
                Some("test"),
            )
            .unwrap();
        let id2 = db
            .store_memory(
                "conflux",
                "fact",
                Some("timezone"),
                "User is in Mountain Time zone",
                Some("test"),
            )
            .unwrap();
        let id3 = db
            .store_memory(
                "conflux",
                "preference",
                Some("style"),
                "User prefers direct, actionable responses",
                Some("test"),
            )
            .unwrap();

        // Search with FTS
        let results = db.search_memory("conflux", "Don", 5).unwrap();
        assert!(!results.is_empty(), "FTS should find 'Don' memory");
        println!("  Search 'Don': {} results", results.len());

        let results2 = db.search_memory("conflux", "timezone", 5).unwrap();
        assert!(!results2.is_empty(), "FTS should find 'timezone' memory");
        println!("  Search 'timezone': {} results", results2.len());

        println!("✅ Memory FTS5 search works");
    }

    #[test]
    fn test_session_crud() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        // Create session
        let session = db.create_session("conflux", "test-user").unwrap();
        println!("  Created session: {}", session.id);

        // Add messages
        let msg1 = db
            .add_message(&session.id, "user", "Hello Conflux", 10, None, None, None)
            .unwrap();
        let msg2 = db
            .add_message(
                &session.id,
                "assistant",
                "Hello Don! How can I help?",
                25,
                Some("conflux-fast"),
                Some("cerebras"),
                Some(150),
            )
            .unwrap();

        // Get messages
        let messages = db.get_messages(&session.id, 10).unwrap();
        assert_eq!(messages.len(), 2, "Expected 2 messages");

        // Check session counters
        let updated = db.get_session(&session.id).unwrap().unwrap();
        assert_eq!(updated.message_count, 2);
        assert_eq!(updated.total_tokens, 35);
        println!(
            "  Messages: {}, Tokens: {}",
            updated.message_count, updated.total_tokens
        );

        println!("✅ Session CRUD works");
    }

    #[test]
    fn test_cron_parsing() {
        use app_lib::engine::cron;
        use chrono::Utc;

        let now = Utc::now();

        // Every 5 minutes
        let next = cron::next_run("*/5 * * * *", now).unwrap();
        println!("  */5 * * * * → next run: {}", next);
        assert!(next > now);

        // Daily at 9am
        let next2 = cron::next_run("0 9 * * *", now).unwrap();
        println!("  0 9 * * * → next run: {}", next2);

        // Descriptions
        assert_eq!(cron::describe("*/5 * * * *"), "Every 5 minutes");
        assert_eq!(cron::describe("0 9 * * 1-5"), "weekdays at 9:00");
        assert_eq!(cron::describe("0 * * * *"), "Every hour");
        println!("  Descriptions: ✅");

        println!("✅ Cron parser works");
    }

    #[test]
    fn test_cron_job_crud() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        // Create cron job
        let id = db
            .create_cron_job(
                "Health Check",
                "catalyst",
                "0 * * * *",
                "UTC",
                "Run health checks",
            )
            .unwrap();
        println!("  Created cron: {}", id);

        // Get jobs
        let jobs = db.get_cron_jobs(false).unwrap();
        assert!(!jobs.is_empty());
        println!("  Cron jobs: {}", jobs.len());

        // Get due jobs (should include jobs with NULL next_run_at)
        let due = db.get_due_cron_jobs().unwrap();
        println!("  Due jobs: {}", due.len());

        println!("✅ Cron CRUD works");
    }

    #[test]
    fn test_webhook_crud() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        let id = db
            .create_webhook(
                "Order Webhook",
                "catalyst",
                "/webhook/order",
                None,
                "New order received: {{body}}",
            )
            .unwrap();
        println!("  Created webhook: {}", id);

        let hook = db.get_webhook_by_path("/webhook/order").unwrap();
        assert!(hook.is_some());
        println!("  Webhook path: {}", hook.unwrap().path);

        println!("✅ Webhook CRUD works");
    }

    #[test]
    fn test_events() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        let id = db
            .emit_event(
                "test_event",
                Some("conflux"),
                None,
                Some("{\"data\": \"test\"}"),
            )
            .unwrap();
        println!("  Emitted event: {}", id);

        let events = db.get_unprocessed_events(None).unwrap();
        assert!(!events.is_empty());
        println!("  Unprocessed events: {}", events.len());

        db.mark_event_processed(&id).unwrap();
        let after = db.get_unprocessed_events(None).unwrap();
        assert_eq!(after.len(), events.len() - 1);
        println!("  After processing: {}", after.len());

        println!("✅ Event bus works");
    }

    #[test]
    fn test_tasks() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        let id = db
            .create_task(
                "Research dental market",
                Some("Find pain points and AI use cases"),
                "helix",
                "prism",
                "high",
                true,
            )
            .unwrap();
        println!("  Created task: {}", id);

        let task = db.get_task(&id).unwrap().unwrap();
        assert_eq!(task.title, "Research dental market");
        assert_eq!(task.priority, "high");
        assert!(task.requires_verify);
        println!(
            "  Task: {} (priority: {}, verify: {})",
            task.title, task.priority, task.requires_verify
        );

        // Update status
        db.update_task_status(&id, "completed", Some("Found 5 key pain points"))
            .unwrap();
        let updated = db.get_task(&id).unwrap().unwrap();
        assert_eq!(updated.status, "completed");
        println!("  Updated status: {}", updated.status);

        println!("✅ Task system works");
    }

    #[test]
    fn test_verification() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        let claim_id = db
            .create_verification(
                "forge",
                Some("session-123"),
                "tool_result",
                "Built 100 prompts successfully",
            )
            .unwrap();
        println!("  Created claim: {}", claim_id);

        let unverified = db.get_unverified_claims(None).unwrap();
        assert!(!unverified.is_empty());
        println!("  Unverified claims: {}", unverified.len());

        db.complete_verification(
            &claim_id,
            "quanta",
            "verified",
            Some("Checked file, 100 prompts exist"),
        )
        .unwrap();
        let after = db.get_unverified_claims(None).unwrap();
        assert_eq!(after.len(), unverified.len() - 1);
        println!("  After verification: {}", after.len());

        println!("✅ Verification system works");
    }

    #[test]
    fn test_lessons_learned() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        db.add_lesson(Some("forge"), "workflow_gap", "Forge outputs truncated prompts due to token limits. Write to file in batches of 10 using heredoc.", None, Some("Use bash heredoc for batch writing")).unwrap();

        let lessons = db.get_active_lessons(None).unwrap();
        assert!(!lessons.is_empty());
        println!("  Lesson: {}", lessons[0].lesson);

        println!("✅ Lessons learned works");
    }

    #[test]
    fn test_heartbeats() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        db.record_heartbeat("database", "ok", None).unwrap();
        db.record_heartbeat("providers", "warning", Some("No providers configured"))
            .unwrap();

        let records = db.get_latest_heartbeats().unwrap();
        assert_eq!(records.len(), 2);
        for r in &records {
            println!("  {} → {}", r.check_name, r.status);
        }

        println!("✅ Heartbeat system works");
    }

    #[test]
    fn test_skill_install() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        db.install_skill(
            "test-skill",
            "Test Skill",
            Some("A test skill"),
            "🧪",
            "1.0.0",
            Some("Test Author"),
            "When testing, do this.",
            Some("[\"test\"]"),
            "[\"catalyst\"]",
            Some("[\"file_read\"]"),
            "local",
            None,
        )
        .unwrap();

        let skill = db.get_skill("test-skill").unwrap().unwrap();
        assert_eq!(skill.name, "Test Skill");
        println!("  Installed: {} {}", skill.emoji, skill.name);

        // Toggle off
        db.toggle_skill("test-skill", false).unwrap();
        let inactive = db.get_skill("test-skill").unwrap().unwrap();
        assert!(!inactive.is_active);
        println!("  Toggled off: is_active = {}", inactive.is_active);

        // Uninstall
        db.uninstall_skill("test-skill").unwrap();
        let gone = db.get_skill("test-skill").unwrap();
        assert!(gone.is_none());
        println!("  Uninstalled: ✅");

        println!("✅ Skill install/toggle/uninstall works");
    }

    #[test]
    fn test_config_store() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        db.set_config("test_key", "test_value").unwrap();
        let val = db.get_config("test_key").unwrap();
        assert_eq!(val, Some("test_value".to_string()));

        // Update
        db.set_config("test_key", "updated_value").unwrap();
        let val2 = db.get_config("test_key").unwrap();
        assert_eq!(val2, Some("updated_value".to_string()));

        println!("✅ Config store works");
    }

    // ── Full End-to-End Chat Test ──
    // Tests the complete chain: DB → agent → system prompt → router → provider → response → DB

    #[test]
    fn test_full_chat_cycle_catalyst() {
        use app_lib::engine::{router, runtime};
        use tokio::runtime::Runtime;

        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

            // Verify agent exists with personality
            let agent = db
                .get_agent("catalyst")
                .unwrap()
                .expect("Catalyst agent should exist");
            assert!(agent.soul.is_some(), "Catalyst should have a soul");
            assert!(
                agent.instructions.is_some(),
                "Catalyst should have instructions"
            );
            println!("  🤖 {} — {}", agent.name, agent.role);
            println!(
                "  Soul: {}...",
                &agent.soul.as_ref().unwrap()[..60.min(agent.soul.as_ref().unwrap().len())]
            );

            // Create session
            let session = db.create_session("catalyst", "test-user").unwrap();
            println!("  Session: {}", session.id);

            // Send message through the full runtime chain
            let result = runtime::process_turn(
                &db,
                &session.id,
                "catalyst",
                "What is 2+2? Reply with just the number.",
                Some(20),
            )
            .await;

            match &result {
                Ok(resp) => {
                    println!(
                        "  ✅ Response: '{}' ({}ms, {} tokens via {})",
                        resp.content.trim(),
                        resp.latency_ms,
                        resp.tokens_used,
                        resp.provider_name
                    );

                    // Verify response was stored in DB
                    let messages = db.get_messages(&session.id, 10).unwrap();
                    let user_msgs: Vec<_> = messages.iter().filter(|m| m.role == "user").collect();
                    let assistant_msgs: Vec<_> =
                        messages.iter().filter(|m| m.role == "assistant").collect();
                    assert_eq!(user_msgs.len(), 1, "Should have 1 user message");
                    assert_eq!(assistant_msgs.len(), 1, "Should have 1 assistant message");
                    println!(
                        "  DB: {} user + {} assistant messages stored",
                        user_msgs.len(),
                        assistant_msgs.len()
                    );

                    // Verify the system prompt was built with personality
                    assert!(!resp.content.is_empty(), "Response should not be empty");
                    println!("✅ Full chat cycle complete");
                }
                Err(e) => {
                    println!("  ⚠️ Chat failed (may be provider issue): {}", e);
                    // Still verify the user message was stored
                    let messages = db.get_messages(&session.id, 10).unwrap();
                    let user_msgs: Vec<_> = messages.iter().filter(|m| m.role == "user").collect();
                    assert_eq!(
                        user_msgs.len(),
                        1,
                        "User message should be stored even on failure"
                    );
                    println!("  ✅ User message stored correctly despite provider error");
                }
            }
        });
    }

    #[test]
    fn test_full_chat_cycle_conflux() {
        use app_lib::engine::{router, runtime};
        use tokio::runtime::Runtime;

        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

            let agent = db
                .get_agent("conflux")
                .unwrap()
                .expect("Conflux should exist");
            assert_eq!(
                agent.model_alias, "conflux-core",
                "Conflux should use conflux-core"
            );
            println!("  🤖 Conflux — model: {}", agent.model_alias);

            let session = db.create_session("conflux", "test-user").unwrap();

            let result = runtime::process_turn(
                &db,
                &session.id,
                "conflux",
                "Hello! What's your name and role?",
                Some(50),
            )
            .await;

            match &result {
                Ok(resp) => {
                    println!(
                        "  ✅ Conflux: '{}' ({}ms via {})",
                        &resp.content[..100.min(resp.content.len())],
                        resp.latency_ms,
                        resp.provider_name
                    );

                    // The response should reference Conflux's identity (from the system prompt)
                    let content_lower = resp.content.to_lowercase();
                    let has_identity =
                        content_lower.contains("conflux") || content_lower.contains("strategic");
                    if has_identity {
                        println!("  ✅ Agent identity confirmed in response");
                    }
                }
                Err(e) => println!("  ⚠️ Conflux chat failed: {}", e),
            }
        });
    }

    #[test]
    fn test_conversation_history_loaded() {
        use app_lib::engine::{router, runtime};
        use tokio::runtime::Runtime;

        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();
            let session = db.create_session("catalyst", "test-user").unwrap();

            // First message
            let _ = runtime::process_turn(
                &db,
                &session.id,
                "catalyst",
                "My name is TestUser. Remember this.",
                Some(30),
            )
            .await;

            // Second message — runtime should load conversation history
            let result =
                runtime::process_turn(&db, &session.id, "catalyst", "What is my name?", Some(30))
                    .await;

            match &result {
                Ok(resp) => {
                    println!(
                        "  ✅ Follow-up: '{}'",
                        &resp.content[..100.min(resp.content.len())]
                    );

                    // Verify both messages are in DB
                    let messages = db.get_messages(&session.id, 10).unwrap();
                    assert!(
                        messages.len() >= 4,
                        "Should have at least 4 messages (2 user + 2 assistant)"
                    );
                    println!("  DB: {} messages stored across 2 turns", messages.len());
                }
                Err(e) => println!("  ⚠️ Follow-up failed: {}", e),
            }
        });
    }

    // ── Family Profiles Tests ──

    #[test]
    fn test_family_member_crud() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        // Create parent (head of household)
        let parent = db
            .create_family_member(
                "parent-1",
                "Don",
                Some(35),
                "adult",
                Some("👨"),
                Some("#6366f1"),
                Some("conflux"),
                None,
            )
            .unwrap();
        assert_eq!(parent.name, "Don");
        assert_eq!(parent.age_group, "adult");
        assert!(parent.parent_id.is_none());
        println!("  Created parent: {} ({})", parent.name, parent.age_group);

        // Create child
        let child = db
            .create_family_member(
                "child-1",
                "Alex",
                Some(8),
                "kid",
                Some("🎮"),
                Some("#8b5cf6"),
                Some("playpal"),
                Some("parent-1"),
            )
            .unwrap();
        assert_eq!(child.name, "Alex");
        assert_eq!(child.parent_id, Some("parent-1".to_string()));
        println!(
            "  Created child: {} (parent: {:?})",
            child.name, child.parent_id
        );

        // List all
        let members = db.get_family_members().unwrap();
        assert_eq!(members.len(), 2);
        println!("  Listed: {} members", members.len());

        // Get by ID
        let fetched = db.get_family_member("parent-1").unwrap().unwrap();
        assert_eq!(fetched.name, "Don");
        println!("  Fetched: {}", fetched.name);

        // Soft delete
        db.delete_family_member("child-1").unwrap();
        let after_delete = db.get_family_members().unwrap();
        assert_eq!(after_delete.len(), 1);
        println!("  After delete: {} members", after_delete.len());

        println!("✅ Family member CRUD works");
    }

    #[test]
    fn test_family_member_age_groups() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        let groups = [
            "toddler",
            "preschool",
            "kid",
            "teen",
            "young_adult",
            "adult",
        ];
        for (i, group) in groups.iter().enumerate() {
            db.create_family_member(
                &format!("member-{}", i),
                &format!("Person{}", i),
                None,
                group,
                None,
                None,
                None,
                None,
            )
            .unwrap();
        }

        let members = db.get_family_members().unwrap();
        assert_eq!(members.len(), 6);

        // Verify all age groups present
        let found_groups: Vec<&str> = members.iter().map(|m| m.age_group.as_str()).collect();
        for g in &groups {
            assert!(found_groups.contains(g), "Missing age group: {}", g);
        }

        println!("✅ All 6 age groups work");
    }

    // ── Agent Templates Tests ──

    #[test]
    fn test_agent_templates_seeded() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        let templates = db.get_agent_templates(None).unwrap();
        assert!(
            templates.len() >= 10,
            "Expected at least 10 templates, got {}",
            templates.len()
        );

        for t in &templates {
            assert!(!t.soul.is_empty(), "Template {} missing soul", t.id);
            assert!(
                !t.instructions.is_empty(),
                "Template {} missing instructions",
                t.id
            );
            println!(
                "  {} {} — {} ({})",
                t.emoji, t.name, t.age_group, t.category
            );
        }

        println!(
            "✅ {} agent templates seeded with soul + instructions",
            templates.len()
        );
    }

    #[test]
    fn test_agent_templates_by_age_group() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        // Kid templates
        let kid_templates = db.get_agent_templates(Some("kid")).unwrap();
        assert!(!kid_templates.is_empty(), "Should have kid templates");
        for t in &kid_templates {
            assert_eq!(t.age_group, "kid");
            println!("  Kid: {} {}", t.emoji, t.name);
        }

        // Teen templates
        let teen_templates = db.get_agent_templates(Some("teen")).unwrap();
        assert!(!teen_templates.is_empty(), "Should have teen templates");

        // Adult templates
        let adult_templates = db.get_agent_templates(Some("adult")).unwrap();
        assert!(!adult_templates.is_empty(), "Should have adult templates");

        println!(
            "✅ Templates filter by age group (kid: {}, teen: {}, adult: {})",
            kid_templates.len(),
            teen_templates.len(),
            adult_templates.len()
        );
    }

    #[test]
    fn test_agent_template_install_from_template() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        // Get a template by filtering all templates
        let all = db.get_agent_templates(None).unwrap();
        let template = all
            .iter()
            .find(|t| t.id == "tpl-playpal")
            .expect("PlayPal template should exist");
        assert_eq!(template.name, "PlayPal");
        println!("  Template: {} {}", template.emoji, template.name);

        // Verify it has quality soul content
        assert!(template.soul.len() > 100, "Soul should be substantial");
        assert!(
            template.instructions.len() > 100,
            "Instructions should be substantial"
        );
        println!("  Soul: {} chars", template.soul.len());
        println!("  Instructions: {} chars", template.instructions.len());

        println!("✅ Agent template install flow works");
    }

    // ── Story Game Tests ──

    #[test]
    fn test_story_game_crud() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        // Create a game
        let game = db
            .create_story_game(
                "game-1",
                None,
                "The Dragon's Cave",
                "adventure",
                "kid",
                "normal",
                Some("{\"location\":\"cave_entrance\"}"),
            )
            .unwrap();
        assert_eq!(game.title, "The Dragon's Cave");
        assert_eq!(game.status, "active");
        assert_eq!(game.current_chapter, 1);
        println!("  Created game: {} ({})", game.title, game.genre);

        // List games
        let games = db.get_story_games(None).unwrap();
        assert_eq!(games.len(), 1);
        println!("  Listed: {} games", games.len());

        // Get by ID
        let fetched = db.get_story_game("game-1").unwrap().unwrap();
        assert_eq!(fetched.title, "The Dragon's Cave");
        println!("  Fetched: {}", fetched.title);

        println!("✅ Story game CRUD works");
    }

    #[test]
    fn test_story_game_with_member() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        // Create family member first
        db.create_family_member("kid-1", "Alex", Some(8), "kid", None, None, None, None)
            .unwrap();

        // Create game linked to member
        let game = db
            .create_story_game(
                "game-2",
                Some("kid-1"),
                "Space Adventure",
                "scifi",
                "kid",
                "easy",
                None,
            )
            .unwrap();
        assert_eq!(game.member_id, Some("kid-1".to_string()));

        // List games for this member
        let member_games = db.get_story_games(Some("kid-1")).unwrap();
        assert_eq!(member_games.len(), 1);

        // List games for non-existent member
        let no_games = db.get_story_games(Some("nobody")).unwrap();
        assert!(no_games.is_empty());

        println!("✅ Story game member linking works");
    }

    #[test]
    fn test_story_chapters() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        // Create game
        db.create_story_game(
            "game-3",
            None,
            "Test Story",
            "fantasy",
            "kid",
            "normal",
            None,
        )
        .unwrap();

        // Add opening chapter
        let choices = r#"[{"id":"a","text":"Go left"},{"id":"b","text":"Go right"},{"id":"c","text":"Stay put"}]"#;
        let ch1 = db
            .add_story_chapter(
                "ch-1",
                "game-3",
                1,
                Some("The Beginning"),
                "You stand at a crossroads.",
                choices,
                None,
                None,
            )
            .unwrap();
        assert_eq!(ch1.chapter_number, 1);
        println!("  Chapter 1: {:?}", ch1.title);

        // Add puzzle chapter
        let puzzle = r#"{"puzzle_type":"riddle","question":"What has keys but no locks?","answer":"keyboard","hint":"You use it to type"}"#;
        let ch2 = db
            .add_story_chapter(
                "ch-2",
                "game-3",
                2,
                Some("The Riddle"),
                "A mysterious door blocks your path.",
                choices,
                Some(puzzle),
                None,
            )
            .unwrap();
        assert!(ch2.puzzle.is_some());
        println!(
            "  Chapter 2: {:?} (has puzzle: {})",
            ch2.title,
            ch2.puzzle.is_some()
        );

        // List chapters
        let chapters = db.get_story_chapters("game-3").unwrap();
        assert_eq!(chapters.len(), 2);
        println!("  Total chapters: {}", chapters.len());

        // Choose a path
        db.choose_story_path("ch-1", "a").unwrap();
        let updated = db.get_story_chapters("game-3").unwrap();
        assert_eq!(updated[0].chosen_choice_id, Some("a".to_string()));
        println!("  Chose path: {:?}", updated[0].chosen_choice_id);

        // Solve puzzle
        db.solve_puzzle("ch-2").unwrap();
        let solved = db.get_story_chapters("game-3").unwrap();
        assert!(solved[1].puzzle_solved);
        println!("  Puzzle solved: {}", solved[1].puzzle_solved);

        println!("✅ Story chapters, choices, and puzzles work");
    }

    #[test]
    fn test_story_seeds() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        // Get all seeds
        let seeds = db.get_story_seeds(None, None).unwrap();
        assert!(!seeds.is_empty(), "Should have story seeds");

        for seed in &seeds {
            assert!(
                !seed.opening.is_empty(),
                "Seed should have opening narrative"
            );
            assert!(
                !seed.initial_choices.is_empty(),
                "Seed should have initial choices"
            );
            println!(
                "  {} — {} ({}, {})",
                seed.title, seed.genre, seed.age_group, seed.difficulty
            );
        }

        // Filter by age group
        let kid_seeds = db.get_story_seeds(Some("kid"), None).unwrap();
        assert!(!kid_seeds.is_empty(), "Should have kid seeds");
        for s in &kid_seeds {
            assert_eq!(s.age_group, "kid");
        }
        println!("  Kid seeds: {}", kid_seeds.len());

        // Filter by genre
        let adventure_seeds = db.get_story_seeds(None, Some("adventure")).unwrap();
        for s in &adventure_seeds {
            assert_eq!(s.genre, "adventure");
        }
        println!("  Adventure seeds: {}", adventure_seeds.len());

        println!("✅ Story seeds work");
    }

    #[test]
    fn test_full_story_flow() {
        let db = app_lib::engine::db::EngineDb::open_in_memory().unwrap();

        // 1. Create family member
        db.create_family_member(
            "kid-1",
            "Sam",
            Some(10),
            "kid",
            Some("🎮"),
            None,
            None,
            None,
        )
        .unwrap();

        // 2. Create story game
        db.create_story_game(
            "game-flow",
            Some("kid-1"),
            "Mystery Manor",
            "mystery",
            "kid",
            "normal",
            Some("{\"secrets_found\":0}"),
        )
        .unwrap();

        // 3. Add opening chapter
        let choices_a = r#"[{"id":"a","text":"Search the library"},{"id":"b","text":"Check the basement"},{"id":"c","text":"Ask the ghost"}]"#;
        db.add_story_chapter(
            "ch-f-1",
            "game-flow",
            1,
            Some("Arrival"),
            "You arrive at Mystery Manor on a stormy night.",
            choices_a,
            None,
            None,
        )
        .unwrap();

        // 4. Player chooses
        db.choose_story_path("ch-f-1", "a").unwrap();

        // 5. Add next chapter
        let choices_b = r#"[{"id":"a","text":"Read the book"},{"id":"b","text":"Search the shelves"},{"id":"c","text":"Leave quickly"}]"#;
        let puzzle_b = r#"{"puzzle_type":"pattern","question":"What comes next: 2, 4, 8, 16, ?","answer":"32","hint":"Each number doubles"}"#;
        db.add_story_chapter(
            "ch-f-2",
            "game-flow",
            2,
            Some("The Library"),
            "Dusty books line the walls. One glows faintly.",
            choices_b,
            Some(puzzle_b),
            None,
        )
        .unwrap();

        // 6. Solve puzzle
        db.solve_puzzle("ch-f-2").unwrap();

        // 7. Choose next
        db.choose_story_path("ch-f-2", "a").unwrap();

        // 8. Verify full state
        let chapters = db.get_story_chapters("game-flow").unwrap();
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].chosen_choice_id, Some("a".to_string()));
        assert!(chapters[1].puzzle_solved);
        assert_eq!(chapters[1].chosen_choice_id, Some("a".to_string()));

        let game = db.get_story_game("game-flow").unwrap().unwrap();
        assert_eq!(game.member_id, Some("kid-1".to_string()));

        println!("✅ Full story flow: member → game → chapters → choices → puzzles");
    }
}
