// Conflux Engine — Permission Gates
// Granular permission rules for agent access control.
// Checks agent actions against permission_rules before execution.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::engine::db::EngineDb;
use crate::engine::security::events::{self, EventCategory, EventType};

/// Permission actions
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PermissionAction {
    Allow,
    Deny,
    Prompt,
}

impl PermissionAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            PermissionAction::Allow => "allow",
            PermissionAction::Deny => "deny",
            PermissionAction::Prompt => "prompt",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "allow" => PermissionAction::Allow,
            "deny" => PermissionAction::Deny,
            "prompt" => PermissionAction::Prompt,
            _ => PermissionAction::Allow,
        }
    }
}

/// Resource types for permission rules
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ResourceType {
    FilePath,
    NetworkDomain,
    ExecCommand,
    ApiEndpoint,
    BrowserDomain,
}

impl ResourceType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ResourceType::FilePath => "file_path",
            ResourceType::NetworkDomain => "network_domain",
            ResourceType::ExecCommand => "exec_command",
            ResourceType::ApiEndpoint => "api_endpoint",
            ResourceType::BrowserDomain => "browser_domain",
        }
    }
}

/// A permission rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRule {
    pub id: String,
    pub agent_id: String,
    pub resource_type: String,
    pub resource_value: String,
    pub action: String,
    pub scope: String,
    pub description: Option<String>,
    pub is_system: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Agent security profile
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSecurityProfile {
    pub agent_id: String,
    pub sandbox_enabled: bool,
    pub file_access_mode: String,
    pub network_mode: String,
    pub exec_mode: String,
    pub max_file_reads_per_min: i64,
    pub max_file_writes_per_min: i64,
    pub max_exec_per_min: i64,
    pub max_network_per_min: i64,
    pub anomaly_threshold: i64,
}

/// Result of a permission check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionCheckResult {
    pub allowed: bool,
    pub action: String, // 'allow' | 'deny' | 'prompt'
    pub rule_id: Option<String>,
    pub reason: String,
    pub prompt_id: Option<String>, // if action='prompt', the pending prompt ID
}

/// Check if an agent action is allowed.
/// Returns the permission decision and logs the event.
pub async fn check_permission(
    db: &EngineDb,
    agent_id: &str,
    session_id: Option<&str>,
    resource_type: &str,
    resource_value: &str,
    scope: &str,
    tool_name: &str,
) -> Result<PermissionCheckResult> {
    // 1. Check agent security profile
    let profile = get_security_profile(db, agent_id).await?;

    // 2. Check specific permission rules for this agent + resource type
    let rules: Vec<(String, String, String, Option<String>)> = {
        let conn = db.conn_async().await;
        let mut stmt = conn.prepare(
            "SELECT id, action, scope, description FROM permission_rules
             WHERE agent_id = ?1 AND resource_type = ?2
             ORDER BY is_system DESC, created_at ASC",
        )?;
        let rows = stmt.query_map(rusqlite::params![agent_id, resource_type], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
        rows.collect::<std::result::Result<Vec<_>, _>>()?
    };

    // 3. Check each rule against the resource value
    for (rule_id, action, rule_scope, description) in &rules {
        if scope_matches(rule_scope, scope)
            && resource_matches(resource_value, &get_rule_pattern(db, rule_id).await?)
        {
            let perm_action = PermissionAction::from_str(action);

            let result = match perm_action {
                PermissionAction::Allow => {
                    // Log allowed event
                    let _ = events::log_security_event(
                        db,
                        agent_id,
                        session_id,
                        event_type_for_resource(resource_type),
                        EventCategory::Info,
                        Some(tool_name),
                        Some(resource_value),
                        Some(&format!(
                            "Allowed by rule: {}",
                            description.as_deref().unwrap_or("matched")
                        )),
                        0,
                        true,
                    );

                    PermissionCheckResult {
                        allowed: true,
                        action: "allow".to_string(),
                        rule_id: Some(rule_id.clone()),
                        reason: description
                            .clone()
                            .unwrap_or_else(|| "Allowed by rule".to_string()),
                        prompt_id: None,
                    }
                }
                PermissionAction::Deny => {
                    // Log denied event
                    let _ = events::log_security_event(
                        db,
                        agent_id,
                        session_id,
                        EventType::PermissionDenied,
                        EventCategory::Warning,
                        Some(tool_name),
                        Some(resource_value),
                        Some(&format!(
                            "Denied by rule: {}",
                            description.as_deref().unwrap_or("blocked")
                        )),
                        50,
                        false,
                    );

                    PermissionCheckResult {
                        allowed: false,
                        action: "deny".to_string(),
                        rule_id: Some(rule_id.clone()),
                        reason: description
                            .clone()
                            .unwrap_or_else(|| "Blocked by rule".to_string()),
                        prompt_id: None,
                    }
                }
                PermissionAction::Prompt => {
                    // Create a permission prompt for the user
                    let prompt_id = create_permission_prompt(
                        db,
                        agent_id,
                        session_id,
                        Some(rule_id),
                        resource_type,
                        resource_value,
                        tool_name,
                        None,
                    ).await?;

                    // Log prompt event
                    let _ = events::log_security_event(
                        db,
                        agent_id,
                        session_id,
                        event_type_for_resource(resource_type),
                        EventCategory::Warning,
                        Some(tool_name),
                        Some(resource_value),
                        Some("Awaiting user approval"),
                        30,
                        false, // not yet allowed
                    );

                    PermissionCheckResult {
                        allowed: false, // block until user decides
                        action: "prompt".to_string(),
                        rule_id: Some(rule_id.clone()),
                        reason: "Awaiting user approval".to_string(),
                        prompt_id: Some(prompt_id),
                    }
                }
            };

            return Ok(result);
        }
    }

    // 4. No matching rule — apply profile defaults
    let mode = match resource_type {
        "file_path" => &profile.file_access_mode,
        "network_domain" => &profile.network_mode,
        "exec_command" => &profile.exec_mode,
        _ => "allowlist",
    };

    match mode {
        "open" | "full" => {
            // Log the access but allow it
            let _ = events::log_security_event(
                db,
                agent_id,
                session_id,
                event_type_for_resource(resource_type),
                EventCategory::Info,
                Some(tool_name),
                Some(resource_value),
                None,
                0,
                true,
            );
            Ok(PermissionCheckResult {
                allowed: true,
                action: "allow".to_string(),
                rule_id: None,
                reason: format!("{} mode: open", resource_type),
                prompt_id: None,
            })
        }
        "prompt_all" => {
            let prompt_id = create_permission_prompt(
                db,
                agent_id,
                session_id,
                None,
                resource_type,
                resource_value,
                tool_name,
                None,
            ).await?;
            Ok(PermissionCheckResult {
                allowed: false,
                action: "prompt".to_string(),
                rule_id: None,
                reason: "Prompt-all mode: awaiting user approval".to_string(),
                prompt_id: Some(prompt_id),
            })
        }
        _ => {
            // "allowlist" or "denylist" with no match = deny
            let _ = events::log_security_event(
                db,
                agent_id,
                session_id,
                EventType::PermissionDenied,
                EventCategory::Warning,
                Some(tool_name),
                Some(resource_value),
                Some(&format!("No matching {} rule, default deny", resource_type)),
                40,
                false,
            );
            Ok(PermissionCheckResult {
                allowed: false,
                action: "deny".to_string(),
                rule_id: None,
                reason: format!("No matching rule for {} in {} mode", resource_value, mode),
                prompt_id: None,
            })
        }
    }
}

/// Create a permission prompt for user decision.
async fn create_permission_prompt(
    db: &EngineDb,
    agent_id: &str,
    session_id: Option<&str>,
    rule_id: Option<&str>,
    request_type: &str,
    target: &str,
    tool_name: &str,
    tool_args: Option<&str>,
) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.conn_async().await;

    conn.execute(
        "INSERT INTO permission_prompts (id, agent_id, session_id, rule_id, request_type, target, tool_name, tool_args)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, agent_id, session_id, rule_id, request_type, target, tool_name, tool_args],
    )?;

    Ok(id)
}

/// Resolve a permission prompt (user approved or denied).
pub async fn resolve_permission_prompt(
    db: &EngineDb,
    prompt_id: &str,
    decision: &str, // 'allow_once' | 'allow_always' | 'deny_once' | 'deny_always'
) -> Result<()> {
    let conn = db.conn_async().await;
    let now = crate::engine::db::EngineDb::now();

    // Update the prompt
    conn.execute(
        "UPDATE permission_prompts SET status = 'resolved', decision = ?1, resolved_at = ?2 WHERE id = ?3",
        rusqlite::params![decision, now, prompt_id],
    )?;

    // If "always", create a permanent rule
    if decision == "allow_always" || decision == "deny_always" {
        let mut stmt = conn.prepare(
            "SELECT agent_id, request_type, target, rule_id FROM permission_prompts WHERE id = ?1",
        )?;
        let (agent_id, request_type, target, rule_id): (String, String, String, Option<String>) =
            stmt.query_row(rusqlite::params![prompt_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })?;

        let action = if decision == "allow_always" {
            "allow"
        } else {
            "deny"
        };

        // If there's already a rule, update it; otherwise create new
        if let Some(rid) = rule_id {
            conn.execute(
                "UPDATE permission_rules SET action = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![action, now, rid],
            )?;
        } else {
            let rule_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO permission_rules (id, agent_id, resource_type, resource_value, action, scope, description)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'all', ?6)",
                rusqlite::params![
                    rule_id,
                    agent_id,
                    request_type.replace("_access", "").replace("_request", "").replace("_command", "").replace("_call", ""),
                    target,
                    action,
                    format!("User decision: {}", decision),
                ],
            )?;
        }
    }

    Ok(())
}

/// Get pending permission prompts for the user.
pub async fn get_pending_prompts(
    db: &EngineDb,
    agent_id: Option<&str>,
) -> Result<Vec<serde_json::Value>> {
    let conn = db.conn_async().await;

    let mut query = String::from(
        "SELECT pp.id, pp.agent_id, a.name, a.emoji, pp.request_type, pp.target, pp.tool_name, pp.created_at
         FROM permission_prompts pp
         JOIN agents a ON pp.agent_id = a.id
         WHERE pp.status = 'pending'"
    );

    let mut params_vec: Vec<String> = Vec::new();
    if let Some(aid) = agent_id {
        query.push_str(" AND pp.agent_id = ?");
        params_vec.push(aid.to_string());
    }
    query.push_str(" ORDER BY pp.created_at DESC");

    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|s| s as &dyn rusqlite::ToSql)
        .collect();

    let mut stmt = conn.prepare(&query)?;
    let prompts = stmt
        .query_map(&param_refs[..], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "agent_id": row.get::<_, String>(1)?,
                "agent_name": row.get::<_, String>(2)?,
                "agent_emoji": row.get::<_, String>(3)?,
                "request_type": row.get::<_, String>(4)?,
                "target": row.get::<_, String>(5)?,
                "tool_name": row.get::<_, Option<String>>(6)?,
                "created_at": row.get::<_, String>(7)?,
            }))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(prompts)
}

/// Get the agent's security profile.
pub async fn get_security_profile(db: &EngineDb, agent_id: &str) -> Result<AgentSecurityProfile> {
    let conn = db.conn_async().await;
    let profile = conn.query_row(
        "SELECT agent_id, sandbox_enabled, file_access_mode, network_mode, exec_mode,
                max_file_reads_per_min, max_file_writes_per_min, max_exec_per_min,
                max_network_per_min, anomaly_threshold
         FROM agent_security_profiles WHERE agent_id = ?1",
        rusqlite::params![agent_id],
        |row| {
            Ok(AgentSecurityProfile {
                agent_id: row.get(0)?,
                sandbox_enabled: row.get::<_, i64>(1)? != 0,
                file_access_mode: row.get(2)?,
                network_mode: row.get(3)?,
                exec_mode: row.get(4)?,
                max_file_reads_per_min: row.get(5)?,
                max_file_writes_per_min: row.get(6)?,
                max_exec_per_min: row.get(7)?,
                max_network_per_min: row.get(8)?,
                anomaly_threshold: row.get(9)?,
            })
        },
    )?;
    Ok(profile)
}

/// Update an agent's security profile.
pub async fn update_security_profile(
    db: &EngineDb,
    agent_id: &str,
    sandbox_enabled: Option<bool>,
    file_access_mode: Option<&str>,
    network_mode: Option<&str>,
    exec_mode: Option<&str>,
    max_file_reads: Option<i64>,
    max_file_writes: Option<i64>,
    max_exec: Option<i64>,
    max_network: Option<i64>,
    anomaly_threshold: Option<i64>,
) -> Result<()> {
    let conn = db.conn_async().await;
    let now = crate::engine::db::EngineDb::now();

    let mut sets: Vec<String> = Vec::new();
    let mut params_vec: Vec<(String, String)> = Vec::new();

    if let Some(v) = sandbox_enabled {
        sets.push("sandbox_enabled = ?".to_string());
        params_vec.push((
            "sandbox_enabled".to_string(),
            if v { "1" } else { "0" }.to_string(),
        ));
    }
    if let Some(v) = file_access_mode {
        sets.push("file_access_mode = ?".to_string());
        params_vec.push(("file_access_mode".to_string(), v.to_string()));
    }
    if let Some(v) = network_mode {
        sets.push("network_mode = ?".to_string());
        params_vec.push(("network_mode".to_string(), v.to_string()));
    }
    if let Some(v) = exec_mode {
        sets.push("exec_mode = ?".to_string());
        params_vec.push(("exec_mode".to_string(), v.to_string()));
    }
    if let Some(v) = max_file_reads {
        sets.push("max_file_reads_per_min = ?".to_string());
        params_vec.push(("max_file_reads_per_min".to_string(), v.to_string()));
    }
    if let Some(v) = max_file_writes {
        sets.push("max_file_writes_per_min = ?".to_string());
        params_vec.push(("max_file_writes_per_min".to_string(), v.to_string()));
    }
    if let Some(v) = max_exec {
        sets.push("max_exec_per_min = ?".to_string());
        params_vec.push(("max_exec_per_min".to_string(), v.to_string()));
    }
    if let Some(v) = max_network {
        sets.push("max_network_per_min = ?".to_string());
        params_vec.push(("max_network_per_min".to_string(), v.to_string()));
    }
    if let Some(v) = anomaly_threshold {
        sets.push("anomaly_threshold = ?".to_string());
        params_vec.push(("anomaly_threshold".to_string(), v.to_string()));
    }

    if sets.is_empty() {
        return Ok(());
    }

    sets.push("updated_at = ?".to_string());
    params_vec.push(("updated_at".to_string(), now));

    let query = format!(
        "UPDATE agent_security_profiles SET {} WHERE agent_id = ?",
        sets.join(", ")
    );

    let all_params: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|(_, v)| v as &dyn rusqlite::ToSql)
        .chain(std::iter::once(&agent_id as &dyn rusqlite::ToSql))
        .collect();

    conn.execute(&query, &all_params[..])?;
    Ok(())
}

/// Get all permission rules for an agent.
pub async fn get_permission_rules(db: &EngineDb, agent_id: &str) -> Result<Vec<PermissionRule>> {
    let conn = db.conn_async().await;
    let mut stmt = conn.prepare(
        "SELECT id, agent_id, resource_type, resource_value, action, scope, description, is_system, created_at, updated_at
         FROM permission_rules WHERE agent_id = ?1 ORDER BY resource_type, created_at"
    )?;

    let rules = stmt
        .query_map(rusqlite::params![agent_id], |row| {
            Ok(PermissionRule {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                resource_type: row.get(2)?,
                resource_value: row.get(3)?,
                action: row.get(4)?,
                scope: row.get(5)?,
                description: row.get(6)?,
                is_system: row.get::<_, i64>(7)? != 0,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(rules)
}

/// Add a new permission rule.
pub async fn add_permission_rule(
    db: &EngineDb,
    agent_id: &str,
    resource_type: &str,
    resource_value: &str,
    action: &str,
    scope: &str,
    description: Option<&str>,
) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.conn_async().await;

    conn.execute(
        "INSERT INTO permission_rules (id, agent_id, resource_type, resource_value, action, scope, description)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, agent_id, resource_type, resource_value, action, scope, description],
    )?;

    Ok(id)
}

/// Delete a permission rule (only non-system rules).
pub async fn delete_permission_rule(db: &EngineDb, rule_id: &str) -> Result<bool> {
    let conn = db.conn_async().await;
    let deleted = conn.execute(
        "DELETE FROM permission_rules WHERE id = ?1 AND is_system = 0",
        rusqlite::params![rule_id],
    )?;
    Ok(deleted > 0)
}

// ── Helpers ──

/// Check if a rule scope matches the requested scope.
fn scope_matches(rule_scope: &str, request_scope: &str) -> bool {
    rule_scope == "all" || rule_scope == request_scope
}

/// Check if a resource value matches a rule pattern.
/// Supports exact match and prefix match (path/*).
fn resource_matches(resource_value: &str, pattern: &str) -> bool {
    if pattern.ends_with('*') {
        let prefix = &pattern[..pattern.len() - 1];
        resource_value.starts_with(prefix)
    } else if pattern.starts_with('*') {
        let suffix = &pattern[1..];
        resource_value.ends_with(suffix)
    } else {
        resource_value == pattern
    }
}

/// Get the pattern for a rule (from resource_value in the rule).
async fn get_rule_pattern(db: &EngineDb, rule_id: &str) -> Result<String> {
    let conn = db.conn_async().await;
    let pattern: String = conn.query_row(
        "SELECT resource_value FROM permission_rules WHERE id = ?1",
        rusqlite::params![rule_id],
        |row| row.get(0),
    )?;
    Ok(pattern)
}

/// Map resource type to event type.
fn event_type_for_resource(resource_type: &str) -> EventType {
    match resource_type {
        "file_path" => EventType::FileAccess,
        "network_domain" => EventType::NetworkRequest,
        "exec_command" => EventType::ExecCommand,
        "api_endpoint" => EventType::ApiCall,
        "browser_domain" => EventType::BrowserAction,
        _ => EventType::FileAccess,
    }
}
