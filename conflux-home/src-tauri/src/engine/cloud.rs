// Cloud sync module — Supabase integration for credits & usage tracking
//
// All Supabase REST API communication lives here.
// Fire-and-forget usage logging, atomic credit charges, quota checks.

/// Valid task types accepted by the cloud router.
const VALID_TASK_TYPES: &[&str] = &[
    "simple_chat", "summarize", "extract", "translate",
    "code_gen", "tool_orchestrate", "image_gen", "file_ops",
    "web_browse", "creative", "deep_reasoning", "agentic_complex",
];

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use super::get_engine;
use super::router::ModelResponse;
use super::router::OpenAIMessage;
use super::router::ToolCallRequest;

// ── Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditStatus {
    pub balance: i64,
    pub has_active_subscription: bool,
    pub subscription_plan: String,
    pub monthly_credits: i64,
    pub monthly_used: i64,
    pub deposit_balance: i64,
    pub total_available: i64,
    pub source: String,
}

/// Alias for CreditStatus — used as the Tauri command response type.
pub type CreditBalance = CreditStatus;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaStatus {
    pub allowed: bool,
    pub source: String,
    pub remaining: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageEntry {
    pub id: String,
    pub model: String,
    pub provider_id: String,
    pub tokens_used: i64,
    pub latency_ms: i64,
    pub status: String,
    pub credits_charged: i64,
    pub call_type: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderStat {
    pub provider_id: String,
    pub call_count: i64,
    pub total_tokens: i64,
    pub total_credits: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelStat {
    pub model: String,
    pub call_count: i64,
    pub total_tokens: i64,
    pub total_credits: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats {
    pub total_calls: i64,
    pub total_tokens: i64,
    pub total_credits: i64,
    pub success_rate: f64,
    pub by_provider: Vec<ProviderStat>,
    pub by_model: Vec<ModelStat>,
}

// ── Credit Cost Cache ──

struct CostCache {
    costs: HashMap<String, i64>,
    fetched_at: Instant,
}

fn cost_cache() -> &'static Arc<RwLock<Option<CostCache>>> {
    static CACHE: std::sync::OnceLock<Arc<RwLock<Option<CostCache>>>> = std::sync::OnceLock::new();
    CACHE.get_or_init(|| Arc::new(RwLock::new(None)))
}

const COST_CACHE_TTL: Duration = Duration::from_secs(300); // 5 minutes

// ── Supabase Helpers ──

/// Read Supabase URL from engine config.
fn get_supabase_url() -> Result<String> {
    let engine = get_engine();
    engine.db().get_config("supabase_url")
        .map_err(|e| anyhow::anyhow!("Failed to read supabase_url: {}", e))?
        .ok_or_else(|| anyhow::anyhow!("supabase_url not configured"))
}

/// Read Supabase anon key from engine config.
fn get_supabase_key() -> Result<String> {
    let engine = get_engine();
    engine.db().get_config("supabase_anon_key")
        .map_err(|e| anyhow::anyhow!("Failed to read supabase_anon_key: {}", e))?
        .ok_or_else(|| anyhow::anyhow!("supabase_anon_key not configured"))
}

/// Read the user's auth token (JWT) from engine config.
fn get_auth_token() -> Result<String> {
    let engine = get_engine();
    let token = engine.db().get_config("supabase_auth_token")
        .map_err(|e| anyhow::anyhow!("Failed to read supabase_auth_token: {}", e))?;
    log::info!("[get_auth_token] Token found: {}", token.is_some());
    token.ok_or_else(|| anyhow::anyhow!("supabase_auth_token not configured"))
}

/// Build a Supabase REST GET request.
fn supabase_get(table: &str, query: &str) -> Result<reqwest::RequestBuilder> {
    let url = get_supabase_url()?;
    let key = get_supabase_key()?;
    let token = get_auth_token()?;
    let full_url = format!("{}/rest/v1/{}?{}", url, table, query);

    Ok(reqwest::Client::new()
        .get(&full_url)
        .header("apikey", &key)
        .header("Authorization", format!("Bearer {}", token))
        .header("Prefer", "return=representation"))
}

/// Build a Supabase REST POST request.
fn supabase_post(table: &str) -> Result<reqwest::RequestBuilder> {
    let url = get_supabase_url()?;
    let key = get_supabase_key()?;
    let token = get_auth_token()?;
    let full_url = format!("{}/rest/v1/{}", url, table);

    Ok(reqwest::Client::new()
        .post(&full_url)
        .header("apikey", &key)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation"))
}

/// Build a Supabase REST PATCH request.
fn supabase_patch(table: &str, query: &str) -> Result<reqwest::RequestBuilder> {
    let url = get_supabase_url()?;
    let key = get_supabase_key()?;
    let token = get_auth_token()?;
    let full_url = format!("{}/rest/v1/{}?{}", url, table, query);

    Ok(reqwest::Client::new()
        .patch(&full_url)
        .header("apikey", &key)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation"))
}

// ── Public API ──

/// Log a usage event to Supabase. Fire-and-forget — errors are logged, not propagated.
pub async fn log_usage_to_cloud(
    user_id: &str,
    session_id: &str,
    agent_id: &str,
    model: &str,
    provider_id: &str,
    tier: &str,
    tokens_used: i64,
    latency_ms: i64,
    status: &str,
    credits_charged: i64,
) {
    // Best-effort: if Supabase isn't configured, just skip silently.
    let body = serde_json::json!({
        "user_id": user_id,
        "session_id": session_id,
        "agent_id": agent_id,
        "model": model,
        "provider_id": provider_id,
        "tier": tier,
        "tokens_used": tokens_used,
        "latency_ms": latency_ms,
        "status": status,
        "credits_charged": credits_charged,
        "call_type": "chat",
        "created_at": chrono::Utc::now().to_rfc3339(),
    });

    match supabase_post("usage_log") {
        Ok(builder) => {
            if let Err(e) = builder.json(&body).send().await {
                log::warn!("[Cloud] Failed to log usage: {}", e);
            }
        }
        Err(e) => {
            log::debug!("[Cloud] Skipping usage log (not configured): {}", e);
        }
    }
}

/// Check the user's cloud credit balance.
pub async fn check_cloud_balance(user_id: &str) -> Result<CreditStatus> {
    // Fetch credit account
    let query = format!("user_id=eq.{}&select=*", user_id);
    let resp = supabase_get("credit_accounts", &query)?
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to fetch credit_accounts: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("credit_accounts fetch returned {}: {}", status, body);
    }

    let accounts: Vec<serde_json::Value> = resp.json().await
        .map_err(|e| anyhow::anyhow!("Failed to parse credit_accounts: {}", e))?;

    let account = accounts.first()
        .ok_or_else(|| anyhow::anyhow!("No credit account found for user {}", user_id))?;

    let balance = account["balance"].as_i64().unwrap_or(0);
    let deposit_balance = balance; // All balance is usable (deposit + subscription grant both tracked here)

    // Fetch active subscription (if any)
    let sub_query = format!("user_id=eq.{}&subscription_status=eq.active&select=*", user_id);
    let (has_active_subscription, subscription_plan, monthly_credits, monthly_used) =
        match supabase_get("ch_subscriptions", &sub_query) {
            Ok(builder) => match builder.send().await {
                Ok(resp) if resp.status().is_success() => {
                    let subs: Vec<serde_json::Value> = resp.json().await.unwrap_or_default();
                    if let Some(sub) = subs.first() {
                        (
                            true,
                            sub["plan"].as_str().unwrap_or("free").to_string(),
                            sub["credits_included"].as_i64().unwrap_or(0),
                            sub["credits_used"].as_i64().unwrap_or(0),
                        )
                    } else {
                        (false, "free".to_string(), 0, 0)
                    }
                }
                _ => (false, "free".to_string(), 0, 0),
            },
            Err(_) => (false, "free".to_string(), 0, 0),
        };

    // Don't double-count: subscription credits and balance are the same pool for free tier
    // For paid tiers, balance = purchased credits, monthly_credits = subscription grant
    // Only add subscription grant if it's a paid plan (not free)
    let total_available = if subscription_plan != "free" && has_active_subscription {
        balance + (monthly_credits - monthly_used).max(0)
    } else {
        // Free tier: balance IS the monthly grant, don't add twice
        balance
    };

    let source = if has_active_subscription {
        "subscription".to_string()
    } else if balance > 0 {
        "deposit".to_string()
    } else {
        "free".to_string()
    };

    Ok(CreditStatus {
        balance,
        has_active_subscription,
        subscription_plan,
        monthly_credits,
        monthly_used,
        deposit_balance,
        total_available,
        source,
    })
}

/// Atomically deduct credits. Uses an UPDATE with a balance guard to prevent double-spend.
/// Returns the new balance.
pub async fn charge_credits(user_id: &str, amount: i64, usage_log_id: &str) -> Result<i64> {
    // First, get current balance to compute new values
    let get_query = format!("user_id=eq.{}&select=balance,total_consumed", user_id);
    let resp = supabase_get("credit_accounts", &get_query)?
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to read balance for charge: {}", e))?;

    let accounts: Vec<serde_json::Value> = resp.json().await
        .map_err(|e| anyhow::anyhow!("Failed to parse balance: {}", e))?;

    let account = accounts.first()
        .ok_or_else(|| anyhow::anyhow!("No credit account for user {}", user_id))?;

    let current_balance = account["balance"].as_i64().unwrap_or(0);
    let current_consumed = account["total_consumed"].as_i64().unwrap_or(0);

    if current_balance < amount {
        anyhow::bail!(
            "Insufficient credits: have {}, need {}",
            current_balance, amount
        );
    }

    let new_balance = current_balance - amount;
    let new_consumed = current_consumed + amount;
    let now = chrono::Utc::now().to_rfc3339();

    // PATCH the credit account
    let update_body = serde_json::json!({
        "balance": new_balance,
        "total_consumed": new_consumed,
        "last_charge_at": now,
    });

    let patch_query = format!("user_id=eq.{}", user_id);
    let resp = supabase_patch("credit_accounts", &patch_query)?
        .json(&update_body)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to charge credits: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Credit charge returned {}: {}", status, body);
    }

    // Insert a transaction record (best-effort)
    let tx_body = serde_json::json!({
        "user_id": user_id,
        "amount": -amount,
        "transaction_type": "usage_charge",
        "usage_log_id": usage_log_id,
        "balance_after": new_balance,
        "created_at": now,
    });

    if let Err(e) = supabase_post("credit_transactions")?.json(&tx_body).send().await {
        log::warn!("[Cloud] Failed to record credit transaction: {}", e);
    }

    log::info!(
        "[Cloud] Charged {} credits for user {} (new balance: {})",
        amount, user_id, new_balance
    );

    Ok(new_balance)
}

/// Fetch credit costs from Supabase `credit_config` table.
/// Results are cached with a 5-minute TTL.
pub async fn get_credit_costs() -> Result<HashMap<String, i64>> {
    // Check cache first
    {
        let cache = cost_cache().read().unwrap();
        if let Some(ref cached) = *cache {
            if cached.fetched_at.elapsed() < COST_CACHE_TTL {
                return Ok(cached.costs.clone());
            }
        }
    }

    // Fetch from Supabase
    let resp = supabase_get("credit_config", "select=*")?
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to fetch credit_config: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("credit_config fetch returned {}: {}", status, body);
    }

    let rows: Vec<serde_json::Value> = resp.json().await
        .map_err(|e| anyhow::anyhow!("Failed to parse credit_config: {}", e))?;

    let mut costs = HashMap::new();
    for row in &rows {
        let key = row["config_key"].as_str().unwrap_or_default().to_string();
        let value = row["credits_cost"].as_i64().unwrap_or(1);
        if !key.is_empty() {
            costs.insert(key, value);
        }
    }

    // Update cache
    {
        let mut cache = cost_cache().write().unwrap();
        *cache = Some(CostCache {
            costs: costs.clone(),
            fetched_at: Instant::now(),
        });
    }

    Ok(costs)
}

/// Look up the credit cost for a model call.
/// Priority: model-specific → provider → tier → default 1.
pub fn credit_cost_for_model(
    model: &str,
    provider_id: &str,
    tier: &str,
    costs: &HashMap<String, i64>,
) -> i64 {
    // 1. Model-specific cost
    if let Some(&cost) = costs.get(&format!("model:{}", model)) {
        return cost;
    }

    // 2. Provider cost
    if let Some(&cost) = costs.get(&format!("provider:{}", provider_id)) {
        return cost;
    }

    // 3. Tier fallback
    if let Some(&cost) = costs.get(&format!("tier:{}", tier)) {
        return cost;
    }

    // 4. Default
    *costs.get("default").unwrap_or(&1)
}

/// Fetch usage history for a user.
pub async fn get_usage_history(user_id: &str, limit: i32) -> Result<Vec<UsageEntry>> {
    let query = format!(
        "user_id=eq.{}&order=created_at.desc&limit={}",
        user_id, limit
    );

    let resp = supabase_get("usage_log", &query)?
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to fetch usage_log: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("usage_log fetch returned {}: {}", status, body);
    }

    let rows: Vec<serde_json::Value> = resp.json().await
        .map_err(|e| anyhow::anyhow!("Failed to parse usage_log: {}", e))?;

    let entries = rows.iter().map(|r| UsageEntry {
        id: r["id"].as_str().unwrap_or_default().to_string(),
        model: r["model"].as_str().unwrap_or_default().to_string(),
        provider_id: r["provider_id"].as_str().unwrap_or_default().to_string(),
        tokens_used: r["tokens_used"].as_i64().unwrap_or(0),
        latency_ms: r["latency_ms"].as_i64().unwrap_or(0),
        status: r["status"].as_str().unwrap_or("success").to_string(),
        credits_charged: r["credits_charged"].as_i64().unwrap_or(0),
        call_type: r["call_type"].as_str().unwrap_or("chat").to_string(),
        created_at: r["created_at"].as_str().unwrap_or_default().to_string(),
    }).collect();

    Ok(entries)
}

// ── Cloud Router Proxy ──

/// Cloud router endpoint (conflux-cloud)
const CLOUD_ROUTER_URL: &str = "https://zcvhozqrssotirabdlzr.functions.supabase.co/conflux-router/v1/chat/completions";

/// Send a chat completion request to the cloud router.
/// This is the main entry point for all inference in cloud-only mode.
pub async fn cloud_chat(
    task_type: Option<&str>,
    messages: Vec<OpenAIMessage>,
    max_tokens: Option<i64>,
    temperature: Option<f64>,
    tools: Option<Vec<serde_json::Value>>,
) -> Result<ModelResponse> {
    let token = get_auth_token()?;
    // Log token status for debugging (first 10 chars only)
    let token_preview = if token.len() > 10 { &token[..10] } else { &token };
    log::info!("[cloud_chat] Using token (preview): {}...", token_preview);    
    let mut request_body = serde_json::json!({
        "messages": messages,
        "stream": false,
    });
    
    // Add optional fields — map model aliases to valid task types
    if let Some(task) = task_type {
        let effective_task = if VALID_TASK_TYPES.contains(&task) {
            task.to_string()
        } else {
            "simple_chat".to_string()
        };
        request_body["task_type"] = serde_json::json!(effective_task);
    }
    if let Some(max) = max_tokens {
        request_body["max_tokens"] = serde_json::json!(max);
    }
    if let Some(temp) = temperature {
        request_body["temperature"] = serde_json::json!(temp);
    }
    if let Some(t) = tools {
        request_body["tools"] = serde_json::json!(t);
    }
    
    let client = reqwest::Client::new();
    let response = client
        .post(CLOUD_ROUTER_URL)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to call cloud router: {}", e))?;
    
    let status = response.status();
    
    // Handle errors from cloud router
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        log::error!("[cloud_chat] Cloud router returned {}: {}", status, body);
        log::error!("[cloud_chat] Token preview sent (first 20): {}", if token.len() > 20 { &token[..20] } else { &token });
        
        let error_msg = match status.as_u16() {
            401 => {
                // DO NOT clear the token on 401 — it may be a transient error
                log::warn!("[cloud_chat] 401 from cloud router. Response: {}", body);
                format!("Unauthorized from cloud router (401): {}", body)
            },
            402 => format!("Insufficient credits: {}", body),
            429 => "Rate limit exceeded. Please try again later.".to_string(),
            503 => "Service temporarily unavailable. Please try again.".to_string(),
            _ => format!("Cloud router error ({}): {}", status, body),
        };
        anyhow::bail!(error_msg);
    }
    
    // Parse OpenAI-compatible response
    #[derive(Debug, serde::Deserialize)]
    struct CloudResponse {
        id: Option<String>,
        model: Option<String>,
        choices: Vec<CloudChoice>,
        usage: Option<CloudUsage>,
    }
    
    #[derive(Debug, serde::Deserialize)]
    struct CloudChoice {
        index: Option<i64>,
        message: Option<OpenAIMessage>,
        finish_reason: Option<String>,
    }
    
    #[derive(Debug, serde::Deserialize)]
    struct CloudUsage {
        prompt_tokens: Option<i64>,
        completion_tokens: Option<i64>,
        total_tokens: Option<i64>,
    }
    
    let parsed: CloudResponse = response
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to parse cloud router response: {}", e))?;
    
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
        model: parsed.model.unwrap_or_else(|| "cloud-router".to_string()),
        provider_id: "cloud-router".to_string(),
        provider_name: "Conflux Cloud Router".to_string(),
        tokens_used,
        latency_ms: 0, // Cloud router handles its own latency tracking
        tool_calls,
    })
}

/// Send a streaming chat request to the cloud router.
pub async fn cloud_chat_stream(
    task_type: Option<&str>,
    messages: Vec<OpenAIMessage>,
    max_tokens: Option<i64>,
    on_chunk: &mut dyn FnMut(&str) -> Result<()>,
) -> Result<ModelResponse> {
    let token = get_auth_token()?;
    let token_preview = if token.len() > 10 { &token[..10] } else { &token };
    log::info!("[cloud_chat_stream] URL: {}", CLOUD_ROUTER_URL);
    log::info!("[cloud_chat_stream] Token preview: {}...", token_preview);
    
    let mut request_body = serde_json::json!({
        "messages": messages,
        "stream": true,
    });
    
    if let Some(task) = task_type {
        let effective_task = if VALID_TASK_TYPES.contains(&task) {
            task.to_string()
        } else {
            "simple_chat".to_string()
        };
        request_body["task_type"] = serde_json::json!(effective_task);
    }
    if let Some(max) = max_tokens {
        request_body["max_tokens"] = serde_json::json!(max);
    }
    
    let client = reqwest::Client::new();
    let response = client
        .post(CLOUD_ROUTER_URL)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to call cloud router (stream): {}", e))?;
    
    let status = response.status();
    
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        log::error!("[cloud_chat_stream] Cloud router returned {}: {}", status, body);
        log::error!("[cloud_chat_stream] Token preview sent (first 20): {}", if token.len() > 20 { &token[..20] } else { &token });
        
        let error_msg = match status.as_u16() {
            401 => format!("Unauthorized from cloud router (401): {}", body),
            402 => format!("Insufficient credits: {}", body),
            429 => "Rate limit exceeded. Please try again later.".to_string(),
            503 => "Service temporarily unavailable. Please try again.".to_string(),
            _ => format!("Cloud router error ({}): {}", status, body),
        };
        anyhow::bail!(error_msg);
    }
    
    // Parse SSE stream from cloud router (OpenAI-compatible format)
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
                let tokens_used = (full_text.len() as f64 / 4.0).ceil() as i64;
                return Ok(ModelResponse {
                    content: full_text,
                    model: "cloud-router".to_string(),
                    provider_id: "cloud-router".to_string(),
                    provider_name: "Conflux Cloud Router".to_string(),
                    tokens_used,
                    latency_ms: 0,
                    tool_calls: vec![],
                });
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
    
    let tokens_used = (full_text.len() as f64 / 4.0).ceil() as i64;
    Ok(ModelResponse {
        content: full_text,
        model: "cloud-router".to_string(),
        provider_id: "cloud-router".to_string(),
        provider_name: "Conflux Cloud Router".to_string(),
        tokens_used,
        latency_ms: 0,
        tool_calls: vec![],
    })
}

/// Get available models from cloud router.
pub async fn cloud_get_models() -> Result<Vec<CloudModel>> {
    let token = get_auth_token()?;
    let url = format!("{}/v1/models", CLOUD_ROUTER_URL);
    
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to fetch models: {}", e))?;
    
    if !response.status().is_success() {
        anyhow::bail!("Failed to fetch models: {}", response.status());
    }
    
    #[derive(Debug, serde::Deserialize)]
    struct ModelsResponse {
        data: Vec<CloudModel>,
    }
    
    let parsed: ModelsResponse = response.json().await
        .map_err(|e| anyhow::anyhow!("Failed to parse models response: {}", e))?;
    
    Ok(parsed.data)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudModel {
    pub id: String,
    pub provider: String,
    pub tier: String,
    pub context_window: i64,
    pub max_tokens: i64,
    pub credits_per_1k_input: i64,
    pub credits_per_1k_output: i64,
}

/// Fetch usage stats for a user over the last N days.
pub async fn get_usage_stats(user_id: &str, days: i32) -> Result<UsageStats> {
    let since = (chrono::Utc::now() - chrono::Duration::days(days as i64)).to_rfc3339();
    // URL-encode the '+' in timezone offset (e.g. +00:00 -> %2B00:00) to prevent it being parsed as a space
    let since_encoded = since.replace('+', "%2B");

    // Total stats
    let query = format!(
        "user_id=eq.{}&created_at=gte.{}&select=*",
        user_id, since_encoded
    );

    let resp = supabase_get("usage_log", &query)?
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to fetch usage stats: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("usage stats fetch returned {}: {}", status, body);
    }

    let rows: Vec<serde_json::Value> = resp.json().await
        .map_err(|e| anyhow::anyhow!("Failed to parse usage stats: {}", e))?;

    let total_calls = rows.len() as i64;
    let total_tokens: i64 = rows.iter().map(|r| r["tokens_used"].as_i64().unwrap_or(0)).sum();
    let total_credits: i64 = rows.iter().map(|r| r["credits_charged"].as_i64().unwrap_or(0)).sum();
    let success_count = rows.iter().filter(|r| r["status"].as_str() == Some("success")).count() as i64;
    let success_rate = if total_calls > 0 {
        success_count as f64 / total_calls as f64
    } else {
        1.0
    };

    // Aggregate by provider
    let mut provider_map: HashMap<String, (i64, i64, i64)> = HashMap::new();
    let mut model_map: HashMap<String, (i64, i64, i64)> = HashMap::new();

    for row in &rows {
        let provider = row["provider_id"].as_str().unwrap_or("unknown").to_string();
        let model = row["model"].as_str().unwrap_or("unknown").to_string();
        let tokens = row["tokens_used"].as_i64().unwrap_or(0);
        let credits = row["credits_charged"].as_i64().unwrap_or(0);

        let entry = provider_map.entry(provider).or_insert((0, 0, 0));
        entry.0 += 1;
        entry.1 += tokens;
        entry.2 += credits;

        let entry = model_map.entry(model).or_insert((0, 0, 0));
        entry.0 += 1;
        entry.1 += tokens;
        entry.2 += credits;
    }

    let by_provider = provider_map.into_iter().map(|(id, (calls, tokens, credits))| ProviderStat {
        provider_id: id,
        call_count: calls,
        total_tokens: tokens,
        total_credits: credits,
    }).collect();

    let by_model = model_map.into_iter().map(|(model, (calls, tokens, credits))| ModelStat {
        model,
        call_count: calls,
        total_tokens: tokens,
        total_credits: credits,
    }).collect();

    Ok(UsageStats {
        total_calls,
        total_tokens,
        total_credits,
        success_rate,
        by_provider,
        by_model,
    })
}
