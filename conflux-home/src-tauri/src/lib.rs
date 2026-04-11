// Conflux Home — Tauri Entry Point
// Initializes the Conflux Engine and exposes commands to the frontend.

pub mod engine;
pub mod budget;
#[cfg(not(target_os = "android"))]
pub mod voice;
mod commands;
mod stripe;
use dotenvy;

use tauri::{Manager, Emitter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok();

    // On Android, catch panics and log them instead of crashing
    #[cfg(target_os = "android")]
    {
        let default_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            log::error!("[PANIC] {}", info);
            // Still call default hook for backtrace
            default_hook(info);
        }));
    }
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    // Notification plugin only on desktop (needs Android permissions we don't have)
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_notification::init());
    }

    let mut builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );

    // Single-instance plugin only works on desktop (not Android/iOS)
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
                log::info!("Second instance detected with args: {:?}", args);
                for arg in args {
                    if arg.starts_with("conflux://") {
                        log::info!("Forwarding deep link URL: {}", arg);
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.emit("deep-link://new-url", vec![arg.as_str()]);
                        }
                    }
                }
            }))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .setup(|app| {
            let app_data_dir = match app.path().app_data_dir() {
                Ok(dir) => dir,
                Err(e) => {
                    log::error!("[Setup] Failed to get app data directory: {}", e);
                    // On Android, try a fallback path
                    let fallback = std::path::PathBuf::from("/data/data/com.conflux.home/files");
                    if fallback.exists() {
                        fallback
                    } else {
                        log::error!("[Setup] No valid app data directory found");
                        return Ok(());
                    }
                }
            };

            if let Err(e) = std::fs::create_dir_all(&app_data_dir) {
                log::error!("[Setup] Failed to create app data directory: {}", e);
                return Ok(());
            }

            let db_path = app_data_dir.join("conflux.db");
            match engine::init_engine(&db_path) {
                Ok(_) => log::info!("Conflux Engine initialized at {:?}", db_path),
                Err(e) => log::error!("[Setup] Failed to initialize engine: {} — app will run without engine", e),
            }

            // Background cron scheduler — ticks every 60s
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
                loop {
                    interval.tick().await;
                    match engine::try_get_engine() {
                        Some(engine_ref) => {
                            match engine_ref.tick_cron().await {
                                Ok(count) if count > 0 => {
                                    log::info!("[CronScheduler] Executed {} jobs", count);
                                }
                                Err(e) => log::error!("[CronScheduler] tick error: {}", e),
                                _ => {}
                            }
                        }
                        None => {
                            log::warn!("[CronScheduler] Engine not initialized, skipping tick");
                        }
                    }
                }
            });

            // Register conflux:// protocol on Linux
            #[cfg(target_os = "linux")]
            {
                let app_id = "conflux-home";
                let exe_path = std::env::current_exe().unwrap_or_default();
                let desktop_dir = std::path::PathBuf::from(
                    std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string())
                ).join(".local/share/applications");
                let _ = std::fs::create_dir_all(&desktop_dir);
                let desktop_file = desktop_dir.join(format!("{}.desktop", app_id));
                let desktop_content = format!(
                    "[Desktop Entry]\n\
                     Type=Application\n\
                     Name=Conflux Home\n\
                     Exec={} %u\n\
                     MimeType=x-scheme-handler/conflux;\n\
                     NoDisplay=true\n",
                    exe_path.display()
                );
                let _ = std::fs::write(&desktop_file, desktop_content);
                let _ = std::process::Command::new("xdg-mime")
                    .args(["default", &format!("{}.desktop", app_id), "x-scheme-handler/conflux"])
                    .output();
                let _ = std::process::Command::new("update-desktop-database")
                    .arg(&desktop_dir)
                    .output();
                log::info!("Registered conflux:// protocol handler");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Chat
            commands::engine_chat,
            commands::engine_chat_stream,
            // Sessions
            commands::engine_create_session,
            commands::engine_get_sessions,
            commands::engine_get_messages,
            // Agents
            commands::engine_get_agents,
            commands::engine_update_agent,
            // Quota
            commands::engine_get_quota,
            // Memory
            commands::engine_store_memory,
            commands::engine_search_memory,
            commands::engine_get_memories,
            commands::engine_delete_memory,
            // Providers
            commands::engine_get_providers,
            commands::engine_update_provider,
            commands::engine_delete_provider,
            commands::engine_test_provider,
            // Provider Templates
            commands::engine_get_provider_templates,
            commands::engine_install_template,
            // Provider API Keys (direct — no middlemen)
            commands::engine_set_openai_key,
            commands::engine_get_openai_key_masked,
            commands::engine_set_anthropic_key,
            commands::engine_get_anthropic_key_masked,
            commands::engine_set_xiaomi_key,
            commands::engine_get_xiaomi_key_masked,
            commands::engine_get_router_providers,
            // Agent Registry & Capabilities
            commands::engine_get_agent_capabilities,
            commands::engine_find_agents_by_capability,
            commands::engine_get_agent_permissions,
            // Inter-Agent Communication
            commands::engine_agent_ask,
            commands::engine_get_communications,
            // Tasks
            commands::engine_create_task,
            commands::engine_update_task,
            commands::engine_get_task,
            commands::engine_get_tasks_for_agent,
            // Verification (Anti-Hallucination)
            commands::engine_create_verification,
            commands::engine_complete_verification,
            commands::engine_get_unverified_claims,
            // Lessons Learned
            commands::engine_add_lesson,
            commands::engine_get_lessons,
            // Cron Jobs
            commands::engine_create_cron,
            commands::engine_get_crons,
            commands::engine_toggle_cron,
            commands::engine_delete_cron,
            commands::engine_tick_cron,
            // Webhooks
            commands::engine_create_webhook,
            commands::engine_get_webhooks,
            commands::engine_delete_webhook,
            commands::engine_handle_webhook,
            // Events
            commands::engine_get_events,
            commands::engine_mark_event_processed,
            // Heartbeats
            commands::engine_run_health_checks,
            commands::engine_get_heartbeats,
            // Skills
            commands::engine_get_skills,
            commands::engine_get_skill,
            commands::engine_get_skills_for_agent,
            commands::engine_install_skill,
            commands::engine_toggle_skill,
            commands::engine_uninstall_skill,
            // Notifications
            commands::engine_send_notification,
            // Email Config
            commands::engine_set_email_config,
            commands::engine_get_email_config,
            // Google
            commands::engine_google_is_connected,
            commands::engine_google_get_email,
            commands::engine_google_auth_url,
            commands::engine_google_connect,
            commands::engine_google_disconnect,
            commands::engine_google_set_credentials,
            commands::engine_google_get_credentials,
            // Google Workspace (gog CLI)
            commands::google_get_events,
            commands::google_get_emails,
            commands::google_get_drive_files,
            commands::google_get_tasks,
            commands::google_create_event_nl,
            // Health
            commands::engine_health,
            // Family Members
            commands::family_list,
            commands::family_create,
            commands::family_delete,
            // Agent Templates
            commands::agent_templates_list,
            commands::agent_template_install,
            // Story Games
            commands::story_games_list,
            commands::story_game_create,
            commands::story_game_get,
            commands::story_chapters_list,
            commands::story_seeds_list,
            commands::story_choose_path,
            commands::story_solve_puzzle,
            commands::story_generate_next_chapter,
            // Learning Tracking
            commands::learning_log_activity,
            commands::learning_get_activities,
            commands::learning_get_progress,
            commands::learning_create_goal,
            commands::learning_get_goals,
            // Smart Kitchen
            commands::kitchen_create_meal,
            commands::kitchen_get_meals,
            commands::kitchen_get_meal,
            commands::kitchen_toggle_favorite,
            commands::kitchen_add_ingredient,
            commands::kitchen_ai_add_meal,
            commands::kitchen_set_plan_entry,
            // State Events
            engine::state_events::conflux_set_state,
            engine::state_events::conflux_set_state_with_context,
            // engine::state_manager::get_state_manager,
            commands::kitchen_get_weekly_plan,
            commands::kitchen_clear_week_plan,
            commands::kitchen_generate_grocery,
            commands::kitchen_get_grocery,
            commands::kitchen_toggle_grocery_item,
            commands::kitchen_add_inventory,
            commands::kitchen_get_inventory,
            // Kitchen Hearth
            commands::kitchen_home_menu,
            commands::kitchen_upload_meal_photo,
            commands::kitchen_identify_meal_from_photo,
            commands::kitchen_plan_week_natural,
            commands::kitchen_suggest_meal_natural,
            commands::kitchen_pantry_heatmap,
            commands::kitchen_use_expiring,
            commands::kitchen_get_cooking_steps,
            commands::kitchen_weekly_digest,
            commands::kitchen_get_nudges,
            commands::kitchen_smart_grocery,
            commands::kitchen_get_meal_photos,
            // Onboarding Setup
            commands::save_budget_data,
            // Budget Tracker
            commands::budget_add_entry,
            commands::budget_get_entries,
            commands::budget_get_summary,
            commands::budget_delete_entry,
            commands::budget_parse_natural,
            commands::budget_detect_patterns,
            commands::budget_can_afford,
            commands::budget_create_goal,
            commands::budget_get_goals,
            commands::budget_update_goal,
            commands::budget_delete_goal,
            commands::budget_goal_status,
            commands::budget_generate_report,
            // Budget Matrix (Cloud)
            budget::budget_get_settings,
            budget::budget_update_settings,
            budget::budget_get_buckets,
            budget::budget_create_bucket,
            budget::budget_update_bucket,
            budget::budget_get_allocations,
            budget::budget_update_allocation,
            budget::budget_log_transaction,
            budget::budget_get_transactions,
            // Content Feed
            commands::feed_get_items,
            commands::feed_mark_read,
            commands::feed_toggle_bookmark,
            commands::feed_add_item,
            commands::feed_generate,
            commands::kitchen_recognize_meal,
            // Fridge Scanner
            commands::fridge_scan,
            commands::fridge_what_can_i_make,
            commands::fridge_expiring_soon,
            commands::fridge_shopping_for_meals,
            // Life Autopilot
            commands::life_analyze_document,
            commands::life_get_dashboard,
            commands::life_get_documents,
            commands::life_get_reminders,
            commands::life_get_knowledge,
            commands::life_add_reminder,
            commands::life_ask,
            // Life Autopilot: Orbit
            commands::life_add_task,
            commands::life_get_tasks,
            commands::life_complete_task,
            commands::life_delete_task,
            commands::life_add_habit,
            commands::life_get_habits,
            commands::life_log_habit,
            commands::life_get_orbit_dashboard,
            commands::life_add_daily_focus,
            commands::life_morning_brief,
            commands::life_smart_reschedule,
            commands::life_parse_input,
            commands::life_decision_helper,
            commands::life_get_heatmap,
            commands::life_dismiss_nudge,
            // Home Health
            commands::home_upsert_profile,
            commands::home_get_dashboard,
            commands::home_add_bill,
            commands::home_get_bills,
            commands::home_delete_bill,
            commands::home_add_maintenance,
            commands::home_get_maintenance,
            commands::home_add_appliance,
            commands::home_get_appliances,
            commands::home_get_insights,
            // Foundation AI Commands
            commands::home_diagnose_problem,
            commands::home_predict_failures,
            commands::home_get_seasonal_tasks,
            commands::home_complete_seasonal_task,
            commands::home_detect_anomalies,
            commands::home_get_warranty_alerts,
            commands::home_chat,
            commands::home_get_maintenance_report,
            commands::home_log_problem_natural,
            commands::home_get_year_summary,
            // Dream Builder
            commands::dream_add,
            commands::dream_get_all,
            commands::dream_get_dashboard,
            commands::dream_add_milestone,
            commands::dream_complete_milestone,
            commands::dream_add_task,
            commands::dream_get_tasks,
            commands::dream_complete_task,
            commands::dream_add_progress,
            commands::dream_delete,
            commands::dream_ai_plan,
            commands::dream_get_velocity,
            commands::dream_get_timeline,
            commands::dream_update_progress_manual,
            commands::dream_get_all_active_with_velocity,
            commands::dream_ai_narrate,
            // Agent Diary
            commands::diary_generate_entry,
            commands::diary_get_entries,
            commands::diary_get_all_entries,
            commands::diary_get_today,
            commands::diary_get_dashboard,
            // Echo — Writing & Notes
            commands::echo_write_entry,
            commands::echo_get_entries,
            commands::echo_delete_entry,
            commands::echo_get_stats,
            commands::echo_get_patterns,
            commands::echo_create_pattern,
            commands::echo_get_entries_by_date,
            // Echo Counselor (Mirror)
            commands::echo_counselor_get_state,
            commands::echo_counselor_start_session,
            commands::echo_counselor_get_messages,
            commands::echo_counselor_send_message,
            commands::echo_counselor_end_session,
            commands::echo_counselor_flag_crisis,
            commands::echo_counselor_write_gratitude,
            commands::echo_counselor_get_gratitude,
            commands::echo_counselor_get_exercises,
            commands::echo_counselor_complete_exercise,
            commands::echo_counselor_get_reflections,
            commands::echo_counselor_mark_reflection_read,
            commands::echo_counselor_generate_weekly_letter,
            commands::echo_counselor_get_weekly_letter,
            commands::echo_counselor_get_weekly_letter_history,
            commands::echo_counselor_set_evening_reminder,
            // Current — Intelligence Briefing
            commands::current_daily_briefing,
            commands::current_detect_ripples,
            commands::current_signal_threads,
            commands::current_create_signal_thread,
            commands::current_ask,
            commands::current_get_questions,
            commands::current_cognitive_patterns,
            commands::current_synthesize,
            // Feedback & System Info
            commands::get_log_path,
            commands::write_updater_log,
            commands::get_system_info,
            commands::download_update_file,
            commands::run_installer,
            // Vault — File Browser
            commands::vault_scan_directory,
            commands::vault_get_files,
            commands::vault_search_files,
            commands::vault_get_file,
            commands::vault_delete_file,
            commands::vault_toggle_favorite,
            commands::vault_get_recent,
            commands::vault_get_favorites,
            commands::vault_get_stats,
            commands::vault_create_project,
            commands::vault_get_projects,
            commands::vault_get_project_detail,
            commands::vault_add_file_to_project,
            commands::vault_remove_file_from_project,
            commands::vault_delete_project,
            commands::vault_get_tags,
            commands::vault_tag_file,
            commands::vault_untag_file,
            // Studio — Creator Workspace
            commands::studio_create_generation,
            commands::studio_update_generation_status,
            commands::studio_get_generations,
            commands::studio_get_generation,
            commands::studio_delete_generation,
            commands::studio_upsert_prompt,
            commands::studio_get_prompts,
            commands::studio_update_usage,
            commands::studio_get_usage,
            commands::studio_set_api_keys,
            commands::studio_get_api_keys_status,
            commands::studio_generate_image,
            commands::studio_generate_voice,
            commands::studio_save_to_vault,
            commands::get_studio_user_id,
            commands::studio_generate_wallpaper,
            commands::tts_speak,
            // Voice Input (desktop only — see cfg below)
            #[cfg(not(target_os = "android"))]
            commands::voice_cmds::voice_capture_start,
            #[cfg(not(target_os = "android"))]
            commands::voice_cmds::voice_capture_stop,
            #[cfg(not(target_os = "android"))]
            commands::voice_cmds::voice_transcribe,
            #[cfg(not(target_os = "android"))]
            commands::voice_cmds::voice_capture_and_transcribe,
            #[cfg(not(target_os = "android"))]
            commands::voice_cmds::voice_get_status,
            #[cfg(not(target_os = "android"))]
            commands::voice_cmds::voice_list_devices,
            #[cfg(not(target_os = "android"))]
            commands::voice_cmds::voice_get_config,
            #[cfg(not(target_os = "android"))]
            commands::voice_cmds::voice_set_config,
            #[cfg(not(target_os = "android"))]
            commands::voice_cmds::debug_audio_buffer_state,
            #[cfg(not(target_os = "android"))]
            commands::voice_cmds::voice_check_microphone,
            // New ElevenLabs streaming commands (desktop only)
            #[cfg(not(target_os = "android"))]
            engine::commands::voice_commands::voice_start_stream,
            #[cfg(not(target_os = "android"))]
            engine::commands::voice_commands::voice_synthesize,
            // Cloud — Supabase Credit & Usage System
            commands::get_credit_balance,
            commands::get_usage_history,
            commands::get_usage_stats,
            commands::purchase_credits,
            commands::set_supabase_session,
            // Deterministic Router
            commands::route_select_model,
            commands::route_get_tier,
            commands::route_get_task_types,
            commands::route_model_supports_tools,
            commands::route_get_reliable_tool_models,
            // Cross-App Synthesis for Orbit
            commands::orbit_get_cross_app_insights,
            // Stripe — Subscription Management
            stripe::stripe_create_checkout_session,
            stripe::stripe_create_credit_pack_session,
            stripe::stripe_create_portal_session,
            stripe::stripe_get_subscription,
            stripe::stripe_get_prices,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
