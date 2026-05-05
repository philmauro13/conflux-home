// Conflux Engine — Anomaly Detection
// Pattern-based detection of suspicious agent behavior.

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::engine::db::EngineDb;
use crate::engine::security::events::{self, EventCategory, EventType};

/// Anomaly rule definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalyRule {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub rule_type: String,
    pub condition_json: String,
    pub severity: String,
    pub action: String,
    pub is_enabled: bool,
}

/// Get all anomaly rules.
pub async fn get_anomaly_rules(db: &EngineDb) -> Result<Vec<AnomalyRule>> {
    let conn = db.conn_async().await;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, rule_type, condition_json, severity, action, is_enabled
         FROM anomaly_rules ORDER BY severity DESC, name",
    )?;

    let rules = stmt
        .query_map([], |row| {
            Ok(AnomalyRule {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                rule_type: row.get(3)?,
                condition_json: row.get(4)?,
                severity: row.get(5)?,
                action: row.get(6)?,
                is_enabled: row.get::<_, i64>(7)? != 0,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(rules)
}

/// Run all anomaly checks against recent events for an agent.
/// Returns a list of triggered anomalies.
pub async fn check_anomalies(db: &EngineDb, agent_id: &str) -> Result<Vec<TriggeredAnomaly>> {
    let rules = get_anomaly_rules(db).await?;
    let mut triggered = Vec::new();

    for rule in rules {
        if !rule.is_enabled {
            continue;
        }

        match rule.rule_type.as_str() {
            "rate_limit" => {
                if let Some(anomaly) = check_rate_limit(db, agent_id, &rule).await? {
                    triggered.push(anomaly);
                }
            }
            "pattern_match" => {
                if let Some(anomaly) = check_pattern_match(db, agent_id, &rule).await? {
                    triggered.push(anomaly);
                }
            }
            "privilege_escalation" => {
                if let Some(anomaly) = check_privilege_escalation(db, agent_id, &rule).await? {
                    triggered.push(anomaly);
                }
            }
            _ => {
                log::debug!("[Anomaly] Unknown rule type: {}", rule.rule_type);
            }
        }
    }

    Ok(triggered)
}

/// A triggered anomaly result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggeredAnomaly {
    pub rule_id: String,
    pub rule_name: String,
    pub severity: String,
    pub action: String,
    pub description: String,
    pub details: serde_json::Value,
}

/// Check rate limit anomaly.
async fn check_rate_limit(
    db: &EngineDb,
    agent_id: &str,
    rule: &AnomalyRule,
) -> Result<Option<TriggeredAnomaly>> {
    let condition: serde_json::Value = serde_json::from_str(&rule.condition_json)?;

    let event_type = condition["event_type"].as_str().unwrap_or("");
    let threshold = condition["threshold"].as_i64().unwrap_or(100);
    let window_seconds = condition["window_seconds"].as_i64().unwrap_or(300);

    let conn = db.conn_async().await;

    // Count events in the window
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM security_events
         WHERE agent_id = ?1 AND event_type = ?2
         AND created_at >= datetime('now', ?)",
        rusqlite::params![agent_id, event_type, format!("-{} seconds", window_seconds)],
        |row| row.get(0),
    )?;

    if count >= threshold {
        // Log the anomaly
        let _ = events::log_security_event(
            db,
            agent_id,
            None,
            EventType::Anomaly,
            severity_to_category(&rule.severity),
            None,
            Some(&format!("rate_limit:{}", event_type)),
            Some(&format!(
                "{{\"rule\":\"{}\",\"count\":{},\"threshold\":{},\"window_seconds\":{}}}",
                rule.name, count, threshold, window_seconds
            )),
            severity_to_risk(&rule.severity),
            false,
        );

        Ok(Some(TriggeredAnomaly {
            rule_id: rule.id.clone(),
            rule_name: rule.name.clone(),
            severity: rule.severity.clone(),
            action: rule.action.clone(),
            description: format!(
                "{}: {} events in {} seconds (threshold: {})",
                rule.name, count, window_seconds, threshold
            ),
            details: serde_json::json!({
                "event_type": event_type,
                "count": count,
                "threshold": threshold,
                "window_seconds": window_seconds,
            }),
        }))
    } else {
        Ok(None)
    }
}

/// Check pattern match anomaly (recent events match suspicious patterns).
async fn check_pattern_match(
    db: &EngineDb,
    agent_id: &str,
    rule: &AnomalyRule,
) -> Result<Option<TriggeredAnomaly>> {
    let condition: serde_json::Value = serde_json::from_str(&rule.condition_json)?;

    let event_type = condition["event_type"].as_str().unwrap_or("");
    let patterns = condition["patterns"].as_array();

    if let Some(patterns) = patterns {
        let conn = db.conn_async().await;

        // Get recent events of this type
        let mut stmt = conn.prepare(
            "SELECT target, details FROM security_events
             WHERE agent_id = ?1 AND event_type = ?2
             AND created_at >= datetime('now', '-1 hour')
             ORDER BY created_at DESC LIMIT 50",
        )?;

        let events: Vec<(Option<String>, Option<String>)> = stmt
            .query_map(rusqlite::params![agent_id, event_type], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        for (target, _details) in &events {
            if let Some(t) = target {
                for pattern in patterns {
                    if let Some(p) = pattern.as_str() {
                        if t.to_lowercase().contains(&p.to_lowercase()) {
                            let _ = events::log_security_event(
                                db,
                                agent_id,
                                None,
                                EventType::Anomaly,
                                severity_to_category(&rule.severity),
                                None,
                                Some(t),
                                Some(&format!(
                                    "{{\"rule\":\"{}\",\"pattern_matched\":\"{}\"}}",
                                    rule.name, p
                                )),
                                severity_to_risk(&rule.severity),
                                false,
                            );

                            return Ok(Some(TriggeredAnomaly {
                                rule_id: rule.id.clone(),
                                rule_name: rule.name.clone(),
                                severity: rule.severity.clone(),
                                action: rule.action.clone(),
                                description: format!(
                                    "{}: matched pattern '{}' in {}",
                                    rule.name, p, t
                                ),
                                details: serde_json::json!({
                                    "pattern": p,
                                    "target": t,
                                    "event_type": event_type,
                                }),
                            }));
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}

/// Check privilege escalation anomaly.
async fn check_privilege_escalation(
    db: &EngineDb,
    agent_id: &str,
    rule: &AnomalyRule,
) -> Result<Option<TriggeredAnomaly>> {
    let condition: serde_json::Value = serde_json::from_str(&rule.condition_json)?;

    let patterns = condition["patterns"].as_array();

    if let Some(patterns) = patterns {
        let conn = db.conn_async().await;

        // Check recent exec commands
        let mut stmt = conn.prepare(
            "SELECT target FROM security_events
             WHERE agent_id = ?1 AND event_type = 'exec_command'
             AND created_at >= datetime('now', '-1 hour')
             ORDER BY created_at DESC LIMIT 50",
        )?;

        let commands: Vec<Option<String>> = stmt
            .query_map(rusqlite::params![agent_id], |row| row.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        for cmd in &commands {
            if let Some(c) = cmd {
                for pattern in patterns {
                    if let Some(p) = pattern.as_str() {
                        if c.to_lowercase().contains(&p.to_lowercase()) {
                            let _ = events::log_security_event(
                                db,
                                agent_id,
                                None,
                                EventType::Anomaly,
                                EventCategory::Critical,
                                Some("exec"),
                                Some(c),
                                Some(&format!(
                                    "{{\"rule\":\"{}\",\"escalation_pattern\":\"{}\"}}",
                                    rule.name, p
                                )),
                                90,
                                false,
                            );

                            return Ok(Some(TriggeredAnomaly {
                                rule_id: rule.id.clone(),
                                rule_name: rule.name.clone(),
                                severity: "critical".to_string(),
                                action: rule.action.clone(),
                                description: format!(
                                    "{}: privilege escalation attempt detected — '{}'",
                                    rule.name, c
                                ),
                                details: serde_json::json!({
                                    "pattern": p,
                                    "command": c,
                                }),
                            }));
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}

/// Run anomaly check and log results. Called periodically.
pub async fn run_anomaly_scan(db: &EngineDb) -> Result<Vec<TriggeredAnomaly>> {
    // Get all active agents — conn dropped before .await loop
    let agents: Vec<String> = {
        let conn = db.conn_async().await;
        let mut stmt = conn.prepare("SELECT id FROM agents WHERE is_active = 1")?;
        let results: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        results
    };

    let mut all_anomalies = Vec::new();

    for agent_id in &agents {
        let anomalies = check_anomalies(db, agent_id).await?;
        all_anomalies.extend(anomalies);
    }

    if !all_anomalies.is_empty() {
        log::warn!(
            "[Anomaly] {} anomalies detected across {} agents",
            all_anomalies.len(),
            agents.len()
        );
    }

    Ok(all_anomalies)
}

// ── Helpers ──

fn severity_to_category(severity: &str) -> EventCategory {
    match severity {
        "critical" => EventCategory::Critical,
        "warning" => EventCategory::Warning,
        _ => EventCategory::Info,
    }
}

fn severity_to_risk(severity: &str) -> i64 {
    match severity {
        "critical" => 90,
        "warning" => 60,
        _ => 20,
    }
}
