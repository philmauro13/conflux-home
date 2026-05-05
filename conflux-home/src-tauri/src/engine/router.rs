// Conflux Engine — Model Router v4 (Direct API)
// The Conflux IS the API proxy. All inference runs through OUR keys.
// Users never touch API keys — they use Conflux Home, we handle everything.
//
// NO MIDDLEMEN. No OpenRouter. No proxy services.
// Direct API calls to every provider. Full margin control.
//
// Tiers:
//   conflux-core  — Free providers (Cerebras, Groq, Mistral, DeepSeek, Cloudflare). $0 cost.
//   conflux-pro   — Smart free models (Cerebras Qwen 235B, Groq Llama 3.3 70B, Mistral Medium).
//                   Pennies cost models when keys are configured (MiMo, GPT-4o-mini).
//   conflux-ultra — Premium models (Claude Sonnet 4, GPT-4o, MiMo Pro). Best quality available.

use anyhow::Result;
use serde::{Deserialize, Serialize};

// ── Provider Management ──
// Provider API keys are now managed server-side by the cloud router.
// This client no longer stores or handles provider credentials.
// Different providers have different API formats.
// Adapters handle the translation so the router doesn't care.

/// How a provider authenticates requests.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AuthMethod {
    /// Standard Bearer token in Authorization header
    BearerToken,
    /// Anthropic's custom x-api-key header
    AnthropicKey,
    /// Google's API key as query parameter
    GoogleQueryParam,
    /// Cloudflare's custom header
    CloudflareHeader,
}

/// The API format a provider speaks.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ApiFormat {
    /// OpenAI-compatible (Cerebras, Groq, Mistral, DeepSeek, Cloudflare, OpenAI, etc.)
    OpenAI,
    /// Anthropic Messages API (different request/response shape)
    Anthropic,
    /// Google Gemini (REST with API key in URL)
    GoogleGemini,
}

/// A provider in our router.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelProvider {
    pub id: String,
    pub name: String,
    pub tier: String, // "core", "pro", "ultra"
    pub base_url: String,
    pub model_id: String, // provider's model name
    pub auth_method: AuthMethod,
    pub api_format: ApiFormat,
    pub priority: i32, // lower = try first within tier
    pub is_free: bool, // true if $0 marginal cost
    pub cost_per_1k_tokens: f64,
    pub max_tokens: i64,
    pub rate_limit_rpm: i64, // requests per minute
    pub is_enabled: bool,
}

/// A tool call from the model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRequest {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

/// The result of a model call.
#[derive(Debug, Clone)]
pub struct ModelResponse {
    pub content: String,
    pub model: String,
    pub provider_id: String,
    pub provider_name: String,
    pub tokens_used: i64,
    pub latency_ms: i64,
    pub tool_calls: Vec<ToolCallRequest>,
}

// ── OpenAI-compatible types (used by most providers) ──

#[derive(Debug, Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenAIMessage {
    pub role: String,
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponse {
    id: Option<String>,
    model: Option<String>,
    choices: Vec<OpenAIChoice>,
    usage: Option<OpenAIUsage>,
}

#[derive(Debug, Deserialize)]
struct OpenAIChoice {
    index: Option<i64>,
    message: Option<OpenAIMessage>,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIUsage {
    prompt_tokens: Option<i64>,
    completion_tokens: Option<i64>,
    total_tokens: Option<i64>,
}

// ── Anthropic Messages API types ──

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
struct AnthropicMessage {
    role: String,
    content: serde_json::Value, // string or array of content blocks
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    id: Option<String>,
    #[serde(rename = "type")]
    resp_type: Option<String>,
    role: Option<String>,
    content: Vec<AnthropicContentBlock>,
    model: Option<String>,
    stop_reason: Option<String>,
    usage: Option<AnthropicUsage>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    #[serde(default)]
    text: String,
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    input: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: i64,
    output_tokens: i64,
}

// ── Provider Registry (Read-only) ──
// Providers are now managed server-side by the cloud router.
// This function exists for settings UI display only.

pub fn builtin_providers() -> Vec<ModelProvider> {
    vec![
        // ══════════════════════════════════════════════════════════════
        // CORE TIER — Free providers, $0 marginal cost
        // These are the workhorses. Fast, free, good enough for most tasks.
        // ══════════════════════════════════════════════════════════════
        ModelProvider {
            id: "cerebras-llama-8b".into(),
            name: "Cerebras Llama 3.1 8B".into(),
            tier: "core".into(),
            base_url: "https://api.cerebras.ai/v1".into(),
            model_id: "llama3.1-8b".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 1,
            is_free: true,
            cost_per_1k_tokens: 0.0,
            max_tokens: 8192,
            rate_limit_rpm: 30,
            is_enabled: true,
        },
        ModelProvider {
            id: "groq-llama-8b".into(),
            name: "Groq Llama 3.1 8B".into(),
            tier: "core".into(),
            base_url: "https://api.groq.com/openai/v1".into(),
            model_id: "llama-3.1-8b-instant".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 2,
            is_free: true,
            cost_per_1k_tokens: 0.0,
            max_tokens: 8192,
            rate_limit_rpm: 30,
            is_enabled: true,
        },
        ModelProvider {
            id: "mistral-small".into(),
            name: "Mistral Small".into(),
            tier: "core".into(),
            base_url: "https://api.mistral.ai/v1".into(),
            model_id: "mistral-small-latest".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 3,
            is_free: true,
            cost_per_1k_tokens: 0.0,
            max_tokens: 8192,
            rate_limit_rpm: 60,
            is_enabled: true,
        },
        ModelProvider {
            id: "deepseek-chat".into(),
            name: "DeepSeek Chat".into(),
            tier: "core".into(),
            base_url: "https://api.deepseek.com/v1".into(),
            model_id: "deepseek-chat".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 4,
            is_free: true,
            cost_per_1k_tokens: 0.0,
            max_tokens: 8192,
            rate_limit_rpm: 60,
            is_enabled: true,
        },
        ModelProvider {
            id: "cloudflare-llama-8b".into(),
            name: "Cloudflare Llama 3.1 8B".into(),
            tier: "core".into(),
            base_url: "https://api.cloudflare.com/client/v4/accounts/36d37d313aa8598b2735b28b4211862b/ai/v1".into(),
            model_id: "@cf/meta/llama-3.1-8b-instruct".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 5,
            is_free: true,
            cost_per_1k_tokens: 0.0,
            max_tokens: 4096,
            rate_limit_rpm: 50,
            is_enabled: false,
        },

        // ══════════════════════════════════════════════════════════════
        // PRO TIER — Smarter models, mix of free + low-cost
        // Best free models + pennies-cost models when keys are configured
        // ══════════════════════════════════════════════════════════════
        ModelProvider {
            id: "cerebras-qwen-235b".into(),
            name: "Cerebras Qwen 3 235B".into(),
            tier: "pro".into(),
            base_url: "https://api.cerebras.ai/v1".into(),
            model_id: "qwen-3-235b-a22b-instruct-2507".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 1,
            is_free: true,
            cost_per_1k_tokens: 0.0,
            max_tokens: 8192,
            rate_limit_rpm: 30,
            is_enabled: true,
        },
        ModelProvider {
            id: "groq-llama-70b".into(),
            name: "Groq Llama 3.3 70B".into(),
            tier: "pro".into(),
            base_url: "https://api.groq.com/openai/v1".into(),
            model_id: "llama-3.3-70b-versatile".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 2,
            is_free: true,
            cost_per_1k_tokens: 0.0,
            max_tokens: 8192,
            rate_limit_rpm: 30,
            is_enabled: true,
        },
        ModelProvider {
            id: "mistral-medium".into(),
            name: "Mistral Medium".into(),
            tier: "pro".into(),
            base_url: "https://api.mistral.ai/v1".into(),
            model_id: "mistral-medium-latest".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 3,
            is_free: true,
            cost_per_1k_tokens: 0.0,
            max_tokens: 8192,
            rate_limit_rpm: 60,
            is_enabled: true,
        },
        ModelProvider {
            id: "groq-deepseek-70b".into(),
            name: "Groq DeepSeek R1 70B".into(),
            tier: "pro".into(),
            base_url: "https://api.groq.com/openai/v1".into(),
            model_id: "deepseek-r1-distill-llama-70b".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 4,
            is_free: true,
            cost_per_1k_tokens: 0.0,
            max_tokens: 8192,
            rate_limit_rpm: 30,
            is_enabled: true,
        },
        // Pro tier paid models — enabled when keys are configured
        ModelProvider {
            id: "openai-gpt4o-mini".into(),
            name: "GPT-4o Mini".into(),
            tier: "pro".into(),
            base_url: "https://api.openai.com/v1".into(),
            model_id: "gpt-4o-mini".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 10,
            is_free: false,
            cost_per_1k_tokens: 0.00015,
            max_tokens: 16384,
            rate_limit_rpm: 500,
            is_enabled: false,
        },
        ModelProvider {
            id: "xiaomi-mimo-flash".into(),
            name: "MiMo v2 Flash".into(),
            tier: "pro".into(),
            base_url: "https://api.xiaomimimo.com/v1".into(),
            model_id: "mimo-v2-flash".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 5,
            is_free: true,
            cost_per_1k_tokens: 0.0,
            max_tokens: 8192,
            rate_limit_rpm: 60,
            is_enabled: false,
        },
        ModelProvider {
            id: "xiaomi-mimo-pro".into(),
            name: "MiMo v2 Pro (1M ctx)".into(),
            tier: "ultra".into(),
            base_url: "https://api.xiaomimimo.com/v1".into(),
            model_id: "mimo-v2-pro".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 1,
            is_free: true,
            cost_per_1k_tokens: 0.0,
            max_tokens: 32000,
            rate_limit_rpm: 60,
            is_enabled: false,
        },

        // ══════════════════════════════════════════════════════════════
        // ULTRA TIER — Premium models, best available quality
        // These are the "wow" models. Claude, GPT-4o, MiMo Pro.
        // ══════════════════════════════════════════════════════════════
        ModelProvider {
            id: "anthropic-claude-sonnet".into(),
            name: "Claude Sonnet 4".into(),
            tier: "ultra".into(),
            base_url: "https://api.anthropic.com/v1".into(),
            model_id: "claude-sonnet-4-20250514".into(),
            auth_method: AuthMethod::AnthropicKey,
            api_format: ApiFormat::Anthropic,
            priority: 2,
            is_free: false,
            cost_per_1k_tokens: 0.003,
            max_tokens: 16384,
            rate_limit_rpm: 50,
            is_enabled: false,
        },
        ModelProvider {
            id: "openai-gpt4o".into(),
            name: "GPT-4o".into(),
            tier: "ultra".into(),
            base_url: "https://api.openai.com/v1".into(),
            model_id: "gpt-4o".into(),
            auth_method: AuthMethod::BearerToken,
            api_format: ApiFormat::OpenAI,
            priority: 3,
            is_free: false,
            cost_per_1k_tokens: 0.005,
            max_tokens: 16384,
            rate_limit_rpm: 500,
            is_enabled: false,
        },
        ModelProvider {
            id: "anthropic-claude-opus".into(),
            name: "Claude Opus 4".into(),
            tier: "ultra".into(),
            base_url: "https://api.anthropic.com/v1".into(),
            model_id: "claude-opus-4-20250514".into(),
            auth_method: AuthMethod::AnthropicKey,
            api_format: ApiFormat::Anthropic,
            priority: 4,
            is_free: false,
            cost_per_1k_tokens: 0.015,
            max_tokens: 16384,
            rate_limit_rpm: 50,
            is_enabled: false,
        },
    ]
}

// ── Public API ──

/// Get all providers for a given tier (legacy compatibility).
/// Returns an empty list as providers are now managed server-side.
pub fn get_providers_for_tier(_tier: &str) -> Vec<ModelProvider> {
    // Providers are now managed server-side by the cloud router.
    // This function exists for compatibility but returns an empty list.
    vec![]
}

/// Check if a free provider has a built-in key.
/// These are our keys that ship with the app.
fn has_builtin_key(provider_id: &str) -> bool {
    // Keys that ship with Conflux Home (our accounts, our keys)
    matches!(
        provider_id,
        "cerebras-llama-8b"
            | "cerebras-qwen-235b"
            | "groq-llama-8b"
            | "groq-llama-70b"
            | "groq-deepseek-70b"
            | "mistral-small"
            | "mistral-medium"
            | "deepseek-chat"
            | "cloudflare-llama-8b"
    )
}

/// Get ALL providers (for settings UI display).
/// Returns an empty list as providers are now managed server-side.
pub fn get_all_providers() -> Vec<ModelProvider> {
    // Providers are managed server-side by the cloud router.
    vec![]
}

/// Get providers for a specific model alias (legacy compat).
pub fn get_providers_for_alias(alias: &str) -> Vec<ModelProvider> {
    let tier = match alias {
        "conflux-core" | "conflux-fast" => "core",
        "conflux-pro" | "conflux-smart" => "pro",
        "conflux-ultra" => "ultra",
        _ => alias, // pass through raw tier names
    };
    get_providers_for_tier(tier)
}

/// Enable a provider (now handled server-side).
/// This is a no-op for compatibility as providers are managed server-side.
pub fn enable_provider(_provider_id: &str) {
    // Provider management is now handled server-side by the cloud router.
    // This function exists for compatibility but does nothing.
}

/// Configure a provider (now handled server-side).
/// This is a no-op for compatibility as provider keys are no longer stored client-side.
pub fn configure_provider(_provider_id: &str, _api_key: &str) -> Result<()> {
    // Provider configuration is now handled server-side by the cloud router.
    // This function exists for compatibility but does nothing.
    Ok(())
}

// ── Chat Completion (non-streaming) ──

/// Resolve legacy aliases to raw tier names.
pub fn resolve_tier(alias: &str) -> &str {
    match alias {
        "conflux-core" | "conflux-fast" | "fast" => "core",
        "conflux-pro" | "conflux-smart" | "smart" => "pro",
        "conflux-ultra" | "ultra" => "ultra",
        "core" | "pro" | "ultra" => alias, // already raw
        _ => alias,
    }
}

/// Chat completion is now handled by the cloud router.
/// This function delegates to cloud::cloud_chat() for security.
pub async fn chat(
    tier: &str,
    messages: Vec<OpenAIMessage>,
    max_tokens: Option<i64>,
    temperature: Option<f64>,
    tools: Option<Vec<serde_json::Value>>,
) -> Result<ModelResponse> {
    // Note: This is a compatibility wrapper. In production, callers should
    // use cloud::cloud_chat() directly. The tier parameter is ignored since
    // the cloud router handles model selection.
    super::cloud::cloud_chat(Some(tier), messages, max_tokens, temperature, tools).await
}

/// Streaming chat completion is now handled by the cloud router.
/// This function delegates to cloud::cloud_chat_stream() for security.
pub async fn chat_stream(
    tier: &str,
    messages: Vec<OpenAIMessage>,
    max_tokens: Option<i64>,
    _tools: Option<Vec<serde_json::Value>>,
    on_chunk: &mut dyn FnMut(&str) -> Result<()>,
) -> Result<ModelResponse> {
    // Note: This is a compatibility wrapper. In production, callers should
    // use cloud::cloud_chat_stream() directly. The tier parameter is ignored
    // since the cloud router handles model selection. Tools are not supported
    // in streaming mode (the cloud router handles this internally).
    super::cloud::cloud_chat_stream(Some(tier), messages, max_tokens, on_chunk).await
}

/// This function is deprecated as provider routing is now server-side.
pub async fn chat_with_provider(
    _provider: &ModelProvider,
    _messages: Vec<OpenAIMessage>,
    _max_tokens: Option<i64>,
) -> Result<ModelResponse> {
    anyhow::bail!("chat_with_provider is deprecated. Use cloud::cloud_chat() instead.")
}

// Provider-specific adapters have been removed.
// All inference now routes through the cloud router.
// See cloud.rs for the cloud_router implementation.

// Compatibility placeholder - this function no longer does anything.
#[allow(dead_code)]
async fn send_openai_chat(
    provider: &ModelProvider,
    messages: &[OpenAIMessage],
    max_tokens: Option<i64>,
    temperature: Option<f64>,
    tools: &Option<Vec<serde_json::Value>>,
) -> Result<ModelResponse> {
    // Note: API keys are handled server-side by the cloud router

    let request = OpenAIRequest {
        model: provider.model_id.clone(),
        messages: messages.to_vec(),
        max_tokens: max_tokens.or(Some(provider.max_tokens)),
        temperature,
        stream: false,
        tools: tools.clone(),
    };

    let url = format!("{}/chat/completions", provider.base_url);

    let client = reqwest::Client::new();
    let mut req_builder = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request);

    // API authentication handled by cloud router
    // req_builder = apply_auth(req_builder, provider, &api_key);

    let response = req_builder
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Request to {} failed: {}", provider.name, e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        anyhow::bail!("{} returned {}: {}", provider.name, status, body);
    }

    let parsed: OpenAIResponse = response
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to parse {} response: {}", provider.name, e))?;

    let choice = parsed.choices.first();

    let content = choice
        .and_then(|c| c.message.as_ref())
        .and_then(|m| m.content.clone())
        .unwrap_or_default();

    let tool_calls = choice
        .and_then(|c| c.message.as_ref())
        .and_then(|m| m.tool_calls.as_ref())
        .map(|tc| {
            tc.iter()
                .filter_map(|call| {
                    let id = call.get("id").and_then(|v| v.as_str())?.to_string();
                    let name = call
                        .get("function")
                        .and_then(|f| f.get("name"))
                        .and_then(|n| n.as_str())?
                        .to_string();
                    let arguments = call
                        .get("function")
                        .and_then(|f| f.get("arguments"))
                        .and_then(|a| a.as_str())
                        .unwrap_or("{}")
                        .to_string();
                    Some(ToolCallRequest {
                        id,
                        name,
                        arguments,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let tokens_used = parsed
        .usage
        .map(|u| u.total_tokens.unwrap_or(0))
        .unwrap_or(0);

    Ok(ModelResponse {
        content,
        model: parsed.model.unwrap_or_else(|| provider.model_id.clone()),
        provider_id: provider.id.clone(),
        provider_name: provider.name.clone(),
        tokens_used,
        latency_ms: 0, // set by caller
        tool_calls,
    })
}

#[allow(dead_code)]
async fn send_openai_stream(
    provider: &ModelProvider,
    messages: &[OpenAIMessage],
    max_tokens: Option<i64>,
    on_chunk: &mut dyn FnMut(&str) -> Result<()>,
) -> Result<String> {
    // Note: API keys are handled server-side by the cloud router

    let request = OpenAIRequest {
        model: provider.model_id.clone(),
        messages: messages.to_vec(),
        max_tokens: max_tokens.or(Some(provider.max_tokens)),
        temperature: None,
        stream: true,
        tools: None,
    };

    let url = format!("{}/chat/completions", provider.base_url);

    let client = reqwest::Client::new();
    let mut req_builder = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&request);

    // API authentication handled by cloud router
    // req_builder = apply_auth(req_builder, provider, &api_key);

    let response = req_builder
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Stream request to {} failed: {}", provider.name, e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        anyhow::bail!("{} stream returned {}: {}", provider.name, status, body);
    }

    parse_sse_stream(response, on_chunk).await
}

// ── Anthropic Adapter ──
// Handles Claude's native Messages API format.
// Different auth header, different request shape, different response shape.

#[allow(dead_code)]
async fn send_anthropic_chat(
    provider: &ModelProvider,
    messages: &[OpenAIMessage],
    max_tokens: Option<i64>,
    temperature: Option<f64>,
) -> Result<ModelResponse> {
    // Note: API keys are handled server-side by the cloud router

    // Convert OpenAI messages to Anthropic format
    // Anthropic separates system message from conversation
    let mut system: Option<String> = None;
    let mut anthropic_messages: Vec<AnthropicMessage> = Vec::new();

    for msg in messages {
        if msg.role == "system" {
            // Anthropic takes system as a top-level parameter
            system = Some(msg.content.clone().unwrap_or_default());
        } else {
            // Content can be a simple string for text-only messages
            anthropic_messages.push(AnthropicMessage {
                role: msg.role.clone(),
                content: serde_json::Value::String(msg.content.clone().unwrap_or_default()),
            });
        }
    }

    let request = AnthropicRequest {
        model: provider.model_id.clone(),
        max_tokens: max_tokens.unwrap_or(provider.max_tokens),
        system,
        messages: anthropic_messages,
        temperature,
        stream: Some(false),
    };

    let url = format!("{}/messages", provider.base_url);

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        // API authentication handled by cloud router
        .header("anthropic-version", "2023-06-01")
        .json(&request)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Anthropic request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        anyhow::bail!("Anthropic returned {}: {}", status, body);
    }

    let parsed: AnthropicResponse = response
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to parse Anthropic response: {}", e))?;

    // Extract text content from Anthropic's content blocks
    let content = parsed
        .content
        .iter()
        .filter(|b| b.block_type == "text")
        .map(|b| b.text.clone())
        .collect::<Vec<_>>()
        .join("\n");

    // Extract tool use blocks
    let tool_calls = parsed
        .content
        .iter()
        .filter(|b| b.block_type == "tool_use")
        .map(|b| ToolCallRequest {
            id: b.id.clone(),
            name: b.name.clone(),
            arguments: serde_json::to_string(&b.input).unwrap_or_else(|_| "{}".to_string()),
        })
        .collect();

    let tokens_used = parsed
        .usage
        .map(|u| u.input_tokens + u.output_tokens)
        .unwrap_or(0);

    Ok(ModelResponse {
        content,
        model: parsed.model.unwrap_or_else(|| provider.model_id.clone()),
        provider_id: provider.id.clone(),
        provider_name: provider.name.clone(),
        tokens_used,
        latency_ms: 0,
        tool_calls,
    })
}

#[allow(dead_code)]
async fn send_anthropic_stream(
    provider: &ModelProvider,
    messages: &[OpenAIMessage],
    max_tokens: Option<i64>,
    on_chunk: &mut dyn FnMut(&str) -> Result<()>,
) -> Result<String> {
    // Note: API keys are handled server-side by the cloud router

    // Convert messages
    let mut system: Option<String> = None;
    let mut anthropic_messages: Vec<AnthropicMessage> = Vec::new();

    for msg in messages {
        if msg.role == "system" {
            system = Some(msg.content.clone().unwrap_or_default());
        } else {
            anthropic_messages.push(AnthropicMessage {
                role: msg.role.clone(),
                content: serde_json::Value::String(msg.content.clone().unwrap_or_default()),
            });
        }
    }

    let request = AnthropicRequest {
        model: provider.model_id.clone(),
        max_tokens: max_tokens.unwrap_or(provider.max_tokens),
        system,
        messages: anthropic_messages,
        temperature: None,
        stream: Some(true),
    };

    let url = format!("{}/messages", provider.base_url);

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        // API authentication handled by cloud router
        .header("anthropic-version", "2023-06-01")
        .json(&request)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Anthropic stream request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        anyhow::bail!("Anthropic stream returned {}: {}", status, body);
    }

    // Anthropic SSE format is similar but uses event types:
    // event: content_block_delta
    // data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
    parse_anthropic_sse_stream(response, on_chunk).await
}

// ── Google Gemini Adapter ──
// Gemini uses a different REST API with the key in the URL.
// We convert to/from OpenAI format internally.

#[allow(dead_code)]
async fn send_gemini_chat(
    provider: &ModelProvider,
    messages: &[OpenAIMessage],
    max_tokens: Option<i64>,
) -> Result<ModelResponse> {
    // Note: API keys are handled server-side by the cloud router

    // Convert OpenAI messages to Gemini format
    // Gemini uses "contents" with "parts" array
    let contents: Vec<serde_json::Value> = messages
        .iter()
        .filter(|m| m.role != "system") // Gemini handles system instruction differently
        .map(|m| {
            let role = if m.role == "assistant" {
                "model"
            } else {
                "user"
            };
            serde_json::json!({
                "role": role,
                "parts": [{ "text": m.content.clone().unwrap_or_default() }]
            })
        })
        .collect();

    // Extract system instruction
    let system_instruction = messages
        .iter()
        .find(|m| m.role == "system")
        .and_then(|m| m.content.clone())
        .map(|s| serde_json::json!({ "parts": [{ "text": s }] }));

    let mut body = serde_json::json!({
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max_tokens.unwrap_or(provider.max_tokens),
        }
    });

    if let Some(si) = system_instruction {
        body["systemInstruction"] = si;
    }

    // Note: API key handled server-side by cloud router
    let url = format!(
        "{}/models/{}:generateContent?key=REDACTED",
        provider.base_url, provider.model_id
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Gemini request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        anyhow::bail!("Gemini returned {}: {}", status, body);
    }

    let parsed: serde_json::Value = response
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to parse Gemini response: {}", e))?;

    let content = parsed["candidates"]
        .get(0)
        .and_then(|c| c["content"]["parts"].get(0))
        .and_then(|p| p["text"].as_str())
        .unwrap_or("")
        .to_string();

    let tokens_used = parsed["usageMetadata"]["totalTokenCount"]
        .as_i64()
        .unwrap_or(0);

    Ok(ModelResponse {
        content,
        model: provider.model_id.clone(),
        provider_id: provider.id.clone(),
        provider_name: provider.name.clone(),
        tokens_used,
        latency_ms: 0,
        tool_calls: vec![],
    })
}

// ── SSE Stream Parsers ──

async fn parse_sse_stream(
    response: reqwest::Response,
    on_chunk: &mut dyn FnMut(&str) -> Result<()>,
) -> Result<String> {
    let mut full_text = String::new();
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| anyhow::anyhow!("Stream read error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim().to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            if line == "data: [DONE]" {
                return Ok(full_text);
            }

            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(content) = parsed
                        .get("choices")
                        .and_then(|c| c.get(0))
                        .and_then(|c| c.get("delta"))
                        .and_then(|d| d.get("content"))
                        .and_then(|c| c.as_str())
                    {
                        full_text.push_str(content);
                        on_chunk(content)?;
                    }
                }
            }
        }
    }

    Ok(full_text)
}

/// Parse Anthropic's SSE stream format.
/// Events look like:
///   event: content_block_delta
///   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}
async fn parse_anthropic_sse_stream(
    response: reqwest::Response,
    on_chunk: &mut dyn FnMut(&str) -> Result<()>,
) -> Result<String> {
    let mut full_text = String::new();
    let mut buffer = String::new();
    let mut stream = response.bytes_stream();

    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| anyhow::anyhow!("Anthropic stream read error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim().to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            if line == "event: message_stop" {
                return Ok(full_text);
            }

            // Anthropic sends "data: {...}" lines
            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    // content_block_delta has the text chunks
                    if parsed["type"] == "content_block_delta" {
                        if let Some(text) = parsed["delta"]["text"].as_str() {
                            full_text.push_str(text);
                            on_chunk(text)?;
                        }
                    }
                }
            }
        }
    }

    Ok(full_text)
}

// ── Auth Helpers ──

// Provider API keys are now managed server-side by the cloud router.
// This client does not handle provider authentication.

// ── Provider Adapters ──
// NOTE: These adapters are no longer used. All inference now routes
// through the cloud router in cloud.rs. These functions are kept
// for compatibility but are unused.

#[allow(dead_code)]
fn apply_auth(
    builder: reqwest::RequestBuilder,
    provider: &ModelProvider,
    _api_key: &str,
) -> reqwest::RequestBuilder {
    match provider.auth_method {
        AuthMethod::BearerToken => builder.header("Authorization", format!("Bearer {}", _api_key)),
        AuthMethod::AnthropicKey => builder
            .header("x-api-key", _api_key)
            .header("anthropic-version", "2023-06-01"),
        AuthMethod::GoogleQueryParam => builder, // key is already in URL
        AuthMethod::CloudflareHeader => {
            builder.header("Authorization", format!("Bearer {}", _api_key))
        }
    }
}
