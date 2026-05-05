// Conflux Engine — Security Events (SIEM)
// Logs all security-relevant agent actions to security_events table.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::engine::db::EngineDb;

/// Security event categories
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum EventCategory {
    Info,
    Warning,
    Critical,
    Security,
}

impl EventCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            EventCategory::Info => "info",
            EventCategory::Warning => "warning",
            EventCategory::Critical => "critical",
            EventCategory::Security => "security",
        }
    }
}

/// Security event types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EventType {
    FileAccess,
    NetworkRequest,
    ExecCommand,
    ApiCall,
    BrowserAction,
    PermissionDenied,
    Anomaly,
    SecurityAudit,
}

impl EventType {
    pub fn as_str(&self) -> &'static str {
        match self {
            EventType::FileAccess => "file_access",
            EventType::NetworkRequest => "network_request",
            EventType::ExecCommand => "exec_command",
            EventType::ApiCall => "api_call",
            EventType::BrowserAction => "browser_action",
            EventType::PermissionDenied => "permission_denied",
            EventType::Anomaly => "anomaly",
            EventType::SecurityAudit => "security_audit",
        }
    }
}

/// A security event to log
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityEvent {
    pub id: String,
    pub agent_id: String,
    pub session_id: Option<String>,
    pub event_type: String,
    pub category: String,
    pub tool_name: Option<String>,
    pub target: Option<String>,
    pub details: Option<String>,
    pub risk_score: i64,
    pub was_allowed: bool,
    pub created_at: String,
}

/// Wrapper for agent_audit to log security audit events.
pub async fn log_event(
    db: &EngineDb,
    category: EventCategory,
    event_type: EventType,
    message: &str,
    details: Option<serde_json::Value>,
) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.conn_async().await;

    conn.execute(
        "INSERT INTO security_events (id, agent_id, session_id, event_type, category, tool_name, target, details, risk_score, was_allowed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            id,
            "system",
            Option::<String>::None,
            event_type.as_str(),
            category.as_str(),
            Option::<String>::None,
            Option::<String>::None,
            details.map(|d| d.to_string()),
            0,
            1,
        ],
    )?;

    log::info!("[Security] {}: {}", category.as_str(), message);

    Ok(id)
}

/// Log a security event to the SIEM.
pub async fn log_security_event(
    db: &EngineDb,
    agent_id: &str,
    session_id: Option<&str>,
    event_type: EventType,
    category: EventCategory,
    tool_name: Option<&str>,
    target: Option<&str>,
    details: Option<&str>,
    risk_score: i64,
    was_allowed: bool,
) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.conn_async().await;

    conn.execute(
        "INSERT INTO security_events (id, agent_id, session_id, event_type, category, tool_name, target, details, risk_score, was_allowed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            id,
            agent_id,
            session_id,
            event_type.as_str(),
            category.as_str(),
            tool_name,
            target,
            details,
            risk_score,
            if was_allowed { 1 } else { 0 },
        ],
    )?;

    log::info!(
        "[Security] {} event: agent={} tool={} target={} risk={} allowed={}",
        category.as_str(),
        agent_id,
        tool_name.unwrap_or("none"),
        target.unwrap_or("none"),
        risk_score,
        was_allowed
    );

    Ok(id)
}

/// Get recent security events with optional filters.
pub async fn get_security_events(
    db: &EngineDb,
    agent_id: Option<&str>,
    event_type: Option<&str>,
    category: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<SecurityEvent>> {
    let conn = db.conn_async().await;

    let mut query = String::from(
        "SELECT id, agent_id, session_id, event_type, category, tool_name, target, details, risk_score, was_allowed, created_at
         FROM security_events WHERE 1=1"
    );
    let mut params_vec: Vec<String> = Vec::new();

    if let Some(aid) = agent_id {
        query.push_str(" AND agent_id = ?");
        params_vec.push(aid.to_string());
    }
    if let Some(et) = event_type {
        query.push_str(" AND event_type = ?");
        params_vec.push(et.to_string());
    }
    if let Some(cat) = category {
        query.push_str(" AND category = ?");
        params_vec.push(cat.to_string());
    }

    query.push_str(" ORDER BY created_at DESC LIMIT ? OFFSET ?");
    params_vec.push(limit.to_string());
    params_vec.push(offset.to_string());

    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|s| s as &dyn rusqlite::ToSql)
        .collect();

    let mut stmt = conn.prepare(&query)?;
    let events = stmt
        .query_map(&param_refs[..], |row| {
            Ok(SecurityEvent {
                id: row.get(0)?,
                agent_id: row.get(1)?,
                session_id: row.get(2)?,
                event_type: row.get(3)?,
                category: row.get(4)?,
                tool_name: row.get(5)?,
                target: row.get(6)?,
                details: row.get(7)?,
                risk_score: row.get(8)?,
                was_allowed: row.get::<_, i64>(9)? != 0,
                created_at: row.get(10)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(events)
}

/// Get SIEM summary stats for the dashboard.
pub async fn get_security_summary(db: &EngineDb) -> Result<serde_json::Value> {
    let conn = db.conn_async().await;

    // Total events
    let total: i64 =
        conn.query_row("SELECT COUNT(*) FROM security_events", [], |row| row.get(0))?;

    // Events by category
    let mut cat_stmt =
        conn.prepare("SELECT category, COUNT(*) FROM security_events GROUP BY category")?;
    let categories: Vec<(String, i64)> = cat_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    // Events by type
    let mut type_stmt = conn.prepare(
        "SELECT event_type, COUNT(*) FROM security_events GROUP BY event_type ORDER BY COUNT(*) DESC"
    )?;
    let types: Vec<(String, i64)> = type_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    // Blocked events
    let blocked: i64 = conn.query_row(
        "SELECT COUNT(*) FROM security_events WHERE was_allowed = 0",
        [],
        |row| row.get(0),
    )?;

    // High-risk events (risk_score >= 70)
    let high_risk: i64 = conn.query_row(
        "SELECT COUNT(*) FROM security_events WHERE risk_score >= 70",
        [],
        |row| row.get(0),
    )?;

    // Recent anomalies
    let mut anomaly_stmt = conn.prepare(
        "SELECT id, agent_id, target, risk_score, created_at FROM security_events
         WHERE event_type = 'anomaly' ORDER BY created_at DESC LIMIT 5",
    )?;
    let anomalies: Vec<serde_json::Value> = anomaly_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "agent_id": row.get::<_, String>(1)?,
                "target": row.get::<_, Option<String>>(2)?,
                "risk_score": row.get::<_, i64>(3)?,
                "created_at": row.get::<_, String>(4)?,
            }))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    // Events in last 24 hours
    let last_24h: i64 = conn.query_row(
        "SELECT COUNT(*) FROM security_events WHERE created_at >= datetime('now', '-24 hours')",
        [],
        |row| row.get(0),
    )?;

    Ok(serde_json::json!({
        "total_events": total,
        "last_24h": last_24h,
        "blocked": blocked,
        "high_risk": high_risk,
        "by_category": categories.iter().map(|(k, v)| (k.clone(), serde_json::json!(v))).collect::<serde_json::Map<String, _>>(),
        "by_type": types.iter().map(|(k, v)| (k.clone(), serde_json::json!(v))).collect::<serde_json::Map<String, _>>(),
        "recent_anomalies": anomalies,
    }))
}

/// Get events by agent for the activity feed.
pub async fn get_agent_activity(db: &EngineDb, agent_id: &str, limit: i64) -> Result<Vec<SecurityEvent>> {
    get_security_events(db, Some(agent_id), None, None, limit, 0).await
}

/// Get critical events that need attention.
pub async fn get_critical_events(db: &EngineDb, limit: i64) -> Result<Vec<SecurityEvent>> {
    get_security_events(db, None, None, Some("critical"), limit, 0).await
}

/// Cleanup old security events (keep last N days).
pub async fn cleanup_security_events(db: &EngineDb, days: i64) -> Result<i64> {
    let conn = db.conn_async().await;
    let deleted = conn.execute(
        "DELETE FROM security_events WHERE created_at < datetime('now', ?)",
        rusqlite::params![format!("-{} days", days)],
    )?;
    log::info!(
        "[Security] Cleaned up {} old security events (older than {} days)",
        deleted,
        days
    );
    Ok(deleted as i64)
}
