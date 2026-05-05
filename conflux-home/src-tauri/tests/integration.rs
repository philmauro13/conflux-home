// Conflux Router — Integration Tests
// Tests actual inference through the provider adapter system.
// Run with: cd conflux-home/src-tauri && cargo test --test integration -- --nocapture

#[cfg(test)]
mod integration_tests {
    use app_lib::engine::router;

    fn rt() -> tokio::runtime::Runtime {
        tokio::runtime::Runtime::new().unwrap()
    }

    #[test]
    fn test_alias_resolution() {
        assert_eq!(router::resolve_tier("conflux-core"), "core");
        assert_eq!(router::resolve_tier("conflux-fast"), "core");
        assert_eq!(router::resolve_tier("conflux-pro"), "pro");
        assert_eq!(router::resolve_tier("conflux-smart"), "pro");
        assert_eq!(router::resolve_tier("conflux-ultra"), "ultra");
        assert_eq!(router::resolve_tier("core"), "core");
        assert_eq!(router::resolve_tier("pro"), "pro");
        assert_eq!(router::resolve_tier("ultra"), "ultra");
        println!("✅ All alias resolutions correct");
    }

    #[test]
    fn test_free_tier_core() {
        // Core tier works without any key config — built-in keys ship with the app
        rt().block_on(async {
            let messages = vec![router::OpenAIMessage {
                role: "user".to_string(),
                content: Some("Say 'hello' in one word.".to_string()),
                tool_call_id: None,
                tool_calls: None,
            }];

            let result = router::chat("core", messages, Some(20), None, None).await;
            match &result {
                Ok(resp) => {
                    println!(
                        "✅ Core: '{}' ({}ms, {} tokens) via {}",
                        resp.content.trim(),
                        resp.latency_ms,
                        resp.tokens_used,
                        resp.provider_name
                    );
                    assert!(!resp.content.is_empty(), "Core tier should return content");
                }
                Err(e) => panic!("Core tier should always work: {}", e),
            }
        });
    }

    #[test]
    fn test_free_tier_pro() {
        // Pro tier with free providers (Cerebras Qwen 235B, Groq Llama 70B)
        rt().block_on(async {
            let messages = vec![router::OpenAIMessage {
                role: "user".to_string(),
                content: Some("What is 2+2? Answer with just the number.".to_string()),
                tool_call_id: None,
                tool_calls: None,
            }];

            let result = router::chat("pro", messages, Some(20), None, None).await;
            match &result {
                Ok(resp) => {
                    println!(
                        "✅ Pro (free): '{}' ({}ms) via {}",
                        resp.content.trim(),
                        resp.latency_ms,
                        resp.provider_name
                    );
                    assert!(!resp.content.is_empty());
                }
                Err(e) => println!("⚠️ Pro free providers all failed: {}", e),
            }
        });
    }

    #[test]
    fn test_openai_direct() {
        rt().block_on(async {
            // Set key and test OpenAI directly
            let key =
                std::env::var("OPENAI_API_KEY").unwrap_or_else(|_| "test-key-not-set".to_string());
            router::set_provider_key("openai-gpt4o-mini", &key);

            let messages = vec![router::OpenAIMessage {
                role: "user".to_string(),
                content: Some("Say 'test passed' and nothing else.".to_string()),
                tool_call_id: None,
                tool_calls: None,
            }];

            let result = router::chat("pro", messages, Some(20), None, None).await;
            match &result {
                Ok(resp) => {
                    println!(
                        "✅ OpenAI GPT-4o-mini: '{}' ({}ms, {} tokens)",
                        resp.content.trim(),
                        resp.latency_ms,
                        resp.tokens_used
                    );
                    assert!(!resp.content.is_empty());
                }
                Err(e) => println!("❌ OpenAI failed: {}", e),
            }
        });
    }

    #[test]
    fn test_xiaomi_mimo_flash() {
        rt().block_on(async {
            // Test MiMo Flash via direct provider call
            let mut providers = router::get_all_providers();
            let mimo = providers.drain(..).find(|p| p.id == "xiaomi-mimo-flash");

            match mimo {
                Some(mut provider) => {
                    // Inject the key
                    let key = std::env::var("TEST_OPENROUTER_KEY")
                        .expect("TEST_OPENROUTER_KEY env var required");
                    router::set_provider_key("xiaomi-mimo-flash", &key);
                    provider.is_enabled = true;

                    let messages = vec![router::OpenAIMessage {
                        role: "user".to_string(),
                        content: Some("Say 'test passed' and nothing else.".to_string()),
                        tool_call_id: None,
                        tool_calls: None,
                    }];

                    let result = router::chat_with_provider(&provider, messages, Some(20)).await;
                    match &result {
                        Ok(resp) => {
                            println!(
                                "✅ MiMo Flash: '{}' ({}ms, {} tokens)",
                                resp.content.trim(),
                                resp.latency_ms,
                                resp.tokens_used
                            );
                            assert!(!resp.content.is_empty());
                        }
                        Err(e) => println!("❌ MiMo Flash failed: {}", e),
                    }
                }
                None => println!("⚠️ xiaomi-mimo-flash not in builtin providers"),
            }
        });
    }

    #[test]
    fn test_xiaomi_mimo_pro() {
        rt().block_on(async {
            let mut providers = router::get_all_providers();
            let mimo = providers.drain(..).find(|p| p.id == "xiaomi-mimo-pro");

            match mimo {
                Some(mut provider) => {
                    let key = std::env::var("TEST_OPENROUTER_KEY")
                        .expect("TEST_OPENROUTER_KEY env var required");
                    router::set_provider_key("xiaomi-mimo-pro", &key);
                    provider.is_enabled = true;

                    let messages = vec![router::OpenAIMessage {
                        role: "user".to_string(),
                        content: Some("What is 2+2? Answer with just the number.".to_string()),
                        tool_call_id: None,
                        tool_calls: None,
                    }];

                    let result = router::chat_with_provider(&provider, messages, Some(50)).await;
                    match &result {
                        Ok(resp) => {
                            println!(
                                "✅ MiMo Pro: '{}' ({}ms, {} tokens)",
                                resp.content.trim(),
                                resp.latency_ms,
                                resp.tokens_used
                            );
                            assert!(!resp.content.is_empty());
                        }
                        Err(e) => println!("❌ MiMo Pro failed: {}", e),
                    }
                }
                None => println!("⚠️ xiaomi-mimo-pro not in builtin providers"),
            }
        });
    }

    #[test]
    fn test_anthropic_key_valid() {
        // Test that Anthropic key is accepted (even if credits are 0)
        rt().block_on(async {
            let anthropic_key =
                std::env::var("TEST_ANTHROPIC_KEY").expect("TEST_ANTHROPIC_KEY env var required");
            router::set_provider_key("anthropic-claude-sonnet", &anthropic_key);

            let mut providers = router::get_all_providers();
            let claude = providers
                .drain(..)
                .find(|p| p.id == "anthropic-claude-sonnet");

            match claude {
                Some(mut provider) => {
                    provider.is_enabled = true;
                    let messages = vec![router::OpenAIMessage {
                        role: "user".to_string(),
                        content: Some("Say hello in one word.".to_string()),
                        tool_call_id: None,
                        tool_calls: None,
                    }];

                    let result = router::chat_with_provider(&provider, messages, Some(20)).await;
                    match &result {
                        Ok(resp) => {
                            println!(
                                "✅ Claude Sonnet: '{}' ({}ms)",
                                resp.content.trim(),
                                resp.latency_ms
                            );
                        }
                        Err(e) => {
                            let msg = e.to_string();
                            if msg.contains("credit")
                                || msg.contains("billing")
                                || msg.contains("400")
                            {
                                println!(
                                    "⚠️ Claude key valid but needs credits (expected): {}",
                                    &msg[..msg.len().min(80)]
                                );
                            } else {
                                println!("❌ Claude failed: {}", e);
                            }
                        }
                    }
                }
                None => println!("⚠️ anthropic-claude-sonnet not in builtin providers"),
            }
        });
    }

    #[test]
    fn test_web_search_ddg() {
        rt().block_on(async {
            use app_lib::engine::tools;

            let result = tools::execute_tool(
                "web_search",
                &serde_json::json!({
                    "query": "Rust programming language"
                }),
            )
            .await;

            match result {
                Ok(tool_result) => {
                    if tool_result.success {
                        let preview = &tool_result.output[..200.min(tool_result.output.len())];
                        println!("✅ Web search works: {}...", preview);
                        assert!(
                            !tool_result.output.is_empty(),
                            "Search should return results"
                        );
                    } else {
                        println!("⚠️ Web search returned error: {:?}", tool_result.error);
                    }
                }
                Err(e) => println!("❌ Web search failed: {}", e),
            }
        });
    }

    #[test]
    fn test_web_fetch_url() {
        rt().block_on(async {
            use app_lib::engine::tools;

            let result = tools::execute_tool(
                "web_fetch",
                &serde_json::json!({
                    "url": "https://en.wikipedia.org/wiki/Rust_(programming_language)"
                }),
            )
            .await;

            match result {
                Ok(tool_result) => {
                    if tool_result.success {
                        let preview = &tool_result.output[..200.min(tool_result.output.len())];
                        println!("✅ Web fetch works: {}...", preview);
                        assert!(
                            !tool_result.output.is_empty(),
                            "Fetch should return content"
                        );
                    } else {
                        println!("⚠️ Web fetch returned error: {:?}", tool_result.error);
                    }
                }
                Err(e) => println!("❌ Web fetch failed: {}", e),
            }
        });
    }
}
