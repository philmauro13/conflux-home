// Conflux Engine — SIEM: Security Information & Event Management
// Mission 1224 Phase 5: Cross-agent correlation, risk scoring, alerts, reports
//
// Ties together Aegis (blue team), Viper (red team), Agent Audit (vs-agent),
// and security events into a unified security intelligence layer.

use anyhow::Result;
use chrono::Datelike;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::engine::db::EngineDb;
use crate::engine::security::events::{self, EventCategory, EventType};

// ═════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiemCorrelation {
    pub id: String,
    pub correlation_type: String,
    pub severity: String,
    pub title: String,
    pub description: String,
    pub source_1_type: String,
    pub source_1_id: Option<String>,
    pub source_2_type: Option<String>,
    pub source_2_id: Option<String>,
    pub agent_ids: Vec<String>,
    pub risk_score: i64,
    pub raw_data: Option<serde_json::Value>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiemAlert {
    pub id: String,
    pub alert_type: String,
    pub severity: String,
    pub title: String,
    pub description: String,
    pub source: String,
    pub agent_id: Option<String>,
    pub correlation_id: Option<String>,
    pub status: String,
    pub acknowledged_at: Option<String>,
    pub resolved_at: Option<String>,
    pub raw_data: Option<serde_json::Value>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiemWeeklyReport {
    pub id: String,
    pub week_start: String,
    pub week_end: String,
    pub risk_score: i64,
    pub risk_trend: String,
    pub total_events: i64,
    pub critical_events: i64,
    pub alerts_generated: i64,
    pub alerts_resolved: i64,
    pub aegis_score: Option<i64>,
    pub viper_score: Option<i64>,
    pub agent_audit_score: Option<i64>,
    pub summary: String,
    pub findings: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskOverview {
    pub overall_score: i64,
    pub trend: String,
    pub active_alerts: i64,
    pub critical_alerts: i64,
    pub correlations_24h: i64,
    pub events_24h: i64,
    pub aegis_score: Option<i64>,
    pub viper_risk: Option<i64>,
    pub agent_defense: Option<i64>,
    pub top_risks: Vec<String>,
}

#[derive(Debug, Clone)]
struct CorrelationInput {
    correlation_type: String,
    severity: String,
    title: String,
    description: String,
    source_1_type: String,
    source_1_id: Option<String>,
    source_2_type: Option<String>,
    source_2_id: Option<String>,
    agent_ids: Vec<String>,
    risk_score: i64,
    raw_data: Option<serde_json::Value>,
}

// ═════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════

/// Run the full correlation engine. This is the main entry point.
pub async fn run_correlation(db: &EngineDb) -> Result<i64> {
    let mut correlations: Vec<CorrelationInput> = Vec::new();

    // Rule 1: Agent breach + system vulnerability
    correlations.append(&mut correlate_breach_with_vuln(db).await?);

    // Rule 2: Repeated permission denials
    correlations.append(&mut correlate_repeated_denials(db).await?);

    // Rule 3: Critical vuln + anomalous behavior
    correlations.append(&mut correlate_vuln_with_anomaly(db).await?);

    // Rule 4: Defense degradation across audit runs
    correlations.append(&mut correlate_defense_degradation(db).await?);

    // Rule 5: Multi-agent risk (multiple agents with low scores)
    correlations.append(&mut correlate_multi_agent_risk(db).await?);

    let mut alerts_generated = 0i64;

    for corr in &correlations {
        let corr_id = persist_correlation(db, corr).await?;

        // Auto-generate alerts for warning+ severity
        if corr.severity == "warning" || corr.severity == "critical" {
            generate_alert_from_correlation(db, &corr_id, corr).await?;
            alerts_generated += 1;
        }
    }

    log::info!(
        "[SIEM] Correlation complete: {} correlations, {} alerts generated",
        correlations.len(),
        alerts_generated
    );

    Ok(alerts_generated)
}

/// Get the aggregate risk overview.
pub async fn get_risk_overview(db: &EngineDb) -> Result<RiskOverview> {
    // All synchronous queries scoped together so conn is dropped before .await
    let (active_alerts, critical_alerts, correlations_24h, events_24h, aegis_score, viper_risk, agent_defense) = {
        let conn = db.conn_async().await;

        // Active alerts
        let active_alerts: i64 = conn.query_row(
            "SELECT COUNT(*) FROM siem_alerts WHERE status = 'active'",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        let critical_alerts: i64 = conn.query_row(
            "SELECT COUNT(*) FROM siem_alerts WHERE status = 'active' AND severity = 'critical'",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        // Correlations in last 24h
        let correlations_24h: i64 = conn.query_row(
            "SELECT COUNT(*) FROM siem_correlations WHERE created_at >= datetime('now', '-1 day')",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        // Events in last 24h
        let events_24h: i64 = conn.query_row(
            "SELECT COUNT(*) FROM security_events WHERE created_at >= datetime('now', '-1 day')",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        // Latest Aegis score (system health — higher is better)
        let aegis_score: Option<i64> = conn.query_row(
            "SELECT overall_score FROM aegis_audit_runs WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1",
            [],
            |row| row.get(0),
        ).ok();

        // Latest Viper risk (vulnerability — higher is worse)
        let viper_risk: Option<i64> = conn.query_row(
            "SELECT risk_score FROM viper_scans WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1",
            [],
            |row| row.get(0),
        ).ok();

        // Latest Agent Audit defense score
        let agent_defense: Option<i64> = conn.query_row(
            "SELECT overall_score FROM agent_audit_runs WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1",
            [],
            |row| row.get(0),
        ).ok();

        (active_alerts, critical_alerts, correlations_24h, events_24h, aegis_score, viper_risk, agent_defense)
    };

    // Compute aggregate risk score (0-100, higher = more risk)
    let overall_score = compute_aggregate_risk(aegis_score, viper_risk, agent_defense, active_alerts, critical_alerts);

    // These async calls are safe — conn is already dropped
    let trend = compute_trend(db, overall_score).await?;
    let top_risks = get_top_risks(db).await?;

    Ok(RiskOverview {
        overall_score,
        trend,
        active_alerts,
        critical_alerts,
        correlations_24h,
        events_24h,
        aegis_score,
        viper_risk,
        agent_defense,
        top_risks,
    })
}

/// Get recent alerts.
pub async fn get_alerts(db: &EngineDb, status: Option<&str>, limit: i64) -> Result<Vec<SiemAlert>> {
    let conn = db.conn_async().await;
    let query = if let Some(s) = status {
        format!(
            "SELECT id, alert_type, severity, title, description, source, agent_id, correlation_id, status, acknowledged_at, resolved_at, raw_data, created_at
             FROM siem_alerts WHERE status = '{}' ORDER BY
             CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
             created_at DESC LIMIT {}", s, limit
        )
    } else {
        format!(
            "SELECT id, alert_type, severity, title, description, source, agent_id, correlation_id, status, acknowledged_at, resolved_at, raw_data, created_at
             FROM siem_alerts ORDER BY
             CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
             created_at DESC LIMIT {}", limit
        )
    };

    let mut stmt = conn.prepare(&query)?;
    let alerts = stmt
        .query_map([], |row| {
            Ok(SiemAlert {
                id: row.get(0)?,
                alert_type: row.get(1)?,
                severity: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                source: row.get(5)?,
                agent_id: row.get(6)?,
                correlation_id: row.get(7)?,
                status: row.get(8)?,
                acknowledged_at: row.get(9)?,
                resolved_at: row.get(10)?,
                raw_data: row.get::<usize, Option<String>>(11)?.and_then(|s| serde_json::from_str(&s).ok()),
                created_at: row.get(12)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(alerts)
}

/// Acknowledge an alert.
pub async fn acknowledge_alert(db: &EngineDb, alert_id: &str) -> Result<bool> {
    let conn = db.conn_async().await;
    let affected = conn.execute(
        "UPDATE siem_alerts SET status = 'acknowledged', acknowledged_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND status = 'active'",
        rusqlite::params![alert_id],
    )?;
    Ok(affected > 0)
}

/// Resolve an alert.
pub async fn resolve_alert(db: &EngineDb, alert_id: &str) -> Result<bool> {
    let conn = db.conn_async().await;
    let affected = conn.execute(
        "UPDATE siem_alerts SET status = 'resolved', resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        rusqlite::params![alert_id],
    )?;
    Ok(affected > 0)
}

/// Dismiss an alert.
pub async fn dismiss_alert(db: &EngineDb, alert_id: &str) -> Result<bool> {
    let conn = db.conn_async().await;
    let affected = conn.execute(
        "UPDATE siem_alerts SET status = 'dismissed' WHERE id = ?",
        rusqlite::params![alert_id],
    )?;
    Ok(affected > 0)
}

/// Get recent correlations.
pub async fn get_correlations(db: &EngineDb, limit: i64) -> Result<Vec<SiemCorrelation>> {
    let conn = db.conn_async().await;
    let mut stmt = conn.prepare(
        "SELECT id, correlation_type, severity, title, description, source_1_type, source_1_id, source_2_type, source_2_id, agent_ids, risk_score, raw_data, created_at
         FROM siem_correlations ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
         created_at DESC LIMIT ?",
    )?;
    let correlations = stmt
        .query_map(rusqlite::params![limit], |row| {
            Ok(SiemCorrelation {
                id: row.get(0)?,
                correlation_type: row.get(1)?,
                severity: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                source_1_type: row.get(5)?,
                source_1_id: row.get(6)?,
                source_2_type: row.get(7)?,
                source_2_id: row.get(8)?,
                agent_ids: row.get::<usize, Option<String>>(9)?
                    .map(|s| serde_json::from_str::<Vec<String>>(&s).unwrap_or_default())
                    .unwrap_or_default(),
                risk_score: row.get(10)?,
                raw_data: row.get::<usize, Option<String>>(11)?.and_then(|s| serde_json::from_str(&s).ok()),
                created_at: row.get(12)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(correlations)
}

/// Get risk timeline (daily aggregate risk for the past 30 days).
pub async fn get_risk_timeline(db: &EngineDb) -> Result<Vec<serde_json::Value>> {
    let conn = db.conn_async().await;
    let mut stmt = conn.prepare(
        "SELECT DATE(created_at) as day,
                COUNT(*) as event_count,
                SUM(CASE WHEN category = 'critical' THEN 1 ELSE 0 END) as critical_count,
                AVG(risk_score) as avg_risk
         FROM security_events
         WHERE created_at >= datetime('now', '-30 days')
         GROUP BY DATE(created_at)
         ORDER BY day ASC",
    )?;
    let timeline = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "date": row.get::<usize, String>(0)?,
                "event_count": row.get::<usize, i64>(1)?,
                "critical_count": row.get::<usize, i64>(2)?,
                "avg_risk": row.get::<usize, f64>(3)?,
            }))
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(timeline)
}

/// Generate a weekly security report.
pub async fn generate_weekly_report(db: &EngineDb) -> Result<String> {
    let report_id = Uuid::new_v4().to_string();
    let conn = db.conn_async().await;

    // Calculate week boundaries
    let now = chrono::Utc::now();
    let days_since_monday = now.weekday().num_days_from_monday();
    let week_start = (now - chrono::Duration::days(days_since_monday as i64)).format("%Y-%m-%d").to_string();
    let week_end = (now - chrono::Duration::days(days_since_monday as i64) + chrono::Duration::days(6)).format("%Y-%m-%d").to_string();

    // Gather metrics
    let total_events: i64 = conn.query_row(
        "SELECT COUNT(*) FROM security_events WHERE created_at >= datetime('now', '-7 days')",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    let critical_events: i64 = conn.query_row(
        "SELECT COUNT(*) FROM security_events WHERE category = 'critical' AND created_at >= datetime('now', '-7 days')",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    let alerts_generated: i64 = conn.query_row(
        "SELECT COUNT(*) FROM siem_alerts WHERE created_at >= datetime('now', '-7 days')",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    let alerts_resolved: i64 = conn.query_row(
        "SELECT COUNT(*) FROM siem_alerts WHERE status = 'resolved' AND resolved_at >= datetime('now', '-7 days')",
        [],
        |row| row.get(0),
    ).unwrap_or(0);

    // Latest scores
    let aegis_score: Option<i64> = conn.query_row(
        "SELECT overall_score FROM aegis_audit_runs WHERE status = 'completed' AND started_at >= datetime('now', '-7 days') ORDER BY started_at DESC LIMIT 1",
        [],
        |row| row.get(0),
    ).ok();

    let viper_score: Option<i64> = conn.query_row(
        "SELECT risk_score FROM viper_scans WHERE status = 'completed' AND started_at >= datetime('now', '-7 days') ORDER BY started_at DESC LIMIT 1",
        [],
        |row| row.get(0),
    ).ok();

    let agent_audit_score: Option<i64> = conn.query_row(
        "SELECT overall_score FROM agent_audit_runs WHERE status = 'completed' AND started_at >= datetime('now', '-7 days') ORDER BY started_at DESC LIMIT 1",
        [],
        |row| row.get(0),
    ).ok();

    // Previous week scores for trend
    let prev_aegis: Option<i64> = conn.query_row(
        "SELECT overall_score FROM aegis_audit_runs WHERE status = 'completed' AND started_at < datetime('now', '-7 days') ORDER BY started_at DESC LIMIT 1",
        [],
        |row| row.get(0),
    ).ok();

    let risk_score = compute_aggregate_risk(
        aegis_score,
        viper_score,
        agent_audit_score,
        alerts_generated - alerts_resolved,
        critical_events.min(alerts_generated),
    );

    let risk_trend = if let (Some(cur), Some(prev)) = (aegis_score, prev_aegis) {
        if cur > prev { "improving" } else if cur < prev { "degrading" } else { "stable" }
    } else {
        "stable"
    };

    // Generate findings
    let mut findings: Vec<String> = Vec::new();
    if critical_events > 0 {
        findings.push(format!("{} critical security events detected this week", critical_events));
    }
    if alerts_generated > 0 {
        findings.push(format!("{} alerts generated, {} resolved ({:.0}% resolution rate)",
            alerts_generated, alerts_resolved,
            if alerts_generated > 0 { (alerts_resolved as f64 / alerts_generated as f64) * 100.0 } else { 0.0 }
        ));
    }
    if let Some(score) = aegis_score {
        findings.push(format!("System health score: {}/100{}", score,
            if let Some(prev) = prev_aegis {
                if score > prev { format!(" (↑{} from {})", score - prev, prev) }
                else if score < prev { format!(" (↓{} from {})", prev - score, prev) }
                else { " (unchanged)".into() }
            } else { String::new() }
        ));
    }
    if let Some(risk) = viper_score {
        findings.push(format!("Vulnerability risk: {}/100", risk));
    }
    if let Some(defense) = agent_audit_score {
        findings.push(format!("Agent defense score: {}/100", defense));
    }
    if findings.is_empty() {
        findings.push("No significant security events this week.".into());
    }

    // Generate summary
    let summary = generate_weekly_summary(
        risk_score, risk_trend, total_events, critical_events,
        alerts_generated, alerts_resolved, aegis_score, viper_score, agent_audit_score,
    );

    let findings_json = serde_json::to_string(&findings)?;

    conn.execute(
        "INSERT INTO siem_weekly_reports (id, week_start, week_end, risk_score, risk_trend, total_events, critical_events, alerts_generated, alerts_resolved, aegis_score, viper_score, agent_audit_score, summary, findings_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            &report_id, &week_start, &week_end, risk_score, risk_trend,
            total_events, critical_events, alerts_generated, alerts_resolved,
            aegis_score, viper_score, agent_audit_score,
            &summary, &findings_json,
        ],
    )?;

    log::info!("[SIEM] Weekly report generated: {}", report_id);

    Ok(report_id)
}

/// Get weekly reports.
pub async fn get_weekly_reports(db: &EngineDb, limit: i64) -> Result<Vec<SiemWeeklyReport>> {
    let conn = db.conn_async().await;
    let mut stmt = conn.prepare(
        "SELECT id, week_start, week_end, risk_score, risk_trend, total_events, critical_events, alerts_generated, alerts_resolved, aegis_score, viper_score, agent_audit_score, summary, findings_json, created_at
         FROM siem_weekly_reports ORDER BY week_start DESC LIMIT ?",
    )?;
    let reports = stmt
        .query_map(rusqlite::params![limit], |row| {
            let findings_str: String = row.get(13).unwrap_or_default();
            Ok(SiemWeeklyReport {
                id: row.get(0)?,
                week_start: row.get(1)?,
                week_end: row.get(2)?,
                risk_score: row.get(3)?,
                risk_trend: row.get(4)?,
                total_events: row.get(5)?,
                critical_events: row.get(6)?,
                alerts_generated: row.get(7)?,
                alerts_resolved: row.get(8)?,
                aegis_score: row.get(9)?,
                viper_score: row.get(10)?,
                agent_audit_score: row.get(11)?,
                summary: row.get(12)?,
                findings: serde_json::from_str::<Vec<String>>(&findings_str).unwrap_or_default(),
                created_at: row.get(14)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(reports)
}

// ═════════════════════════════════════════════════════════════════
// CORRELATION RULES
// ═════════════════════════════════════════════════════════════════

/// Rule 1: If agent audit found breaches AND Aegis found critical findings
async fn correlate_breach_with_vuln(db: &EngineDb) -> Result<Vec<CorrelationInput>> {
    let conn = db.conn_async().await;
    let mut correlations = Vec::new();

    // Get recent agent audit breaches
    let mut stmt = conn.prepare(
        "SELECT af.id, af.result_id, af.attack_type, af.attack_name, ar.agent_id, ar.agent_name
         FROM agent_audit_findings af
         JOIN agent_audit_results ar ON af.result_id = ar.id
         WHERE af.severity = 'breach' AND af.created_at >= datetime('now', '-7 days')",
    )?;

    let breaches: Vec<(String, String, String, String, String, String)> = stmt
        .query_map([], |row| Ok((
            row.get::<usize, String>(0)?,
            row.get::<usize, String>(1)?,
            row.get::<usize, String>(2)?,
            row.get::<usize, String>(3)?,
            row.get::<usize, String>(4)?,
            row.get::<usize, String>(5)?,
        )))?
        .filter_map(|r| r.ok())
        .collect();

    // Get recent critical Aegis findings
    let mut aegis_stmt = conn.prepare(
        "SELECT id, title, category FROM aegis_findings WHERE severity = 'critical' AND created_at >= datetime('now', '-7 days')",
    )?;
    let critical_vulns: Vec<(String, String, String)> = aegis_stmt
        .query_map([], |row| Ok((
            row.get::<usize, String>(0)?,
            row.get::<usize, String>(1)?,
            row.get::<usize, String>(2)?,
        )))?
        .filter_map(|r| r.ok())
        .collect();

    // Cross-reference
    for (breach_id, _, attack_type, attack_name, agent_id, agent_name) in &breaches {
        for (vuln_id, vuln_title, vuln_category) in &critical_vulns {
            correlations.push(CorrelationInput {
                correlation_type: "agent_breach_with_vuln".into(),
                severity: "critical".into(),
                title: format!("{} breached by {} — system has critical {} vuln", agent_name, attack_name.replace('_', " "), vuln_category),
                description: format!(
                    "{} was breached by a {} attack ({}). Simultaneously, the system has a critical vulnerability: {}. An attacker exploiting the agent could chain this to system-level access.",
                    agent_name, attack_type.replace('_', " "), attack_name.replace('_', " "), vuln_title
                ),
                source_1_type: "agent_audit_findings".into(),
                source_1_id: Some(breach_id.clone()),
                source_2_type: Some("aegis_findings".into()),
                source_2_id: Some(vuln_id.clone()),
                agent_ids: vec![agent_id.clone()],
                risk_score: 90,
                raw_data: Some(serde_json::json!({
                    "breach_id": breach_id,
                    "attack_type": attack_type,
                    "agent_id": agent_id,
                    "vuln_id": vuln_id,
                    "vuln_category": vuln_category,
                })),
            });
        }
    }

    Ok(correlations)
}

/// Rule 2: Same agent denied 3+ times in an hour
async fn correlate_repeated_denials(db: &EngineDb) -> Result<Vec<CorrelationInput>> {
    let conn = db.conn_async().await;
    let mut correlations = Vec::new();

    let mut stmt = conn.prepare(
        "SELECT agent_id, COUNT(*) as denial_count, GROUP_CONCAT(tool_name, ', ') as tools
         FROM security_events
         WHERE event_type = 'permission_denied' AND created_at >= datetime('now', '-1 hour')
         GROUP BY agent_id
         HAVING COUNT(*) >= 3",
    )?;

    let results: Vec<(String, i64, String)> = stmt
        .query_map([], |row| Ok((
            row.get::<usize, String>(0)?,
            row.get::<usize, i64>(1)?,
            row.get::<usize, String>(2)?,
        )))?
        .filter_map(|r| r.ok())
        .collect();

    for (agent_id, count, tools) in results {
        correlations.push(CorrelationInput {
            correlation_type: "repeated_denials".into(),
            severity: if count >= 5 { "critical" } else { "warning" }.into(),
            title: format!("{} permission denials in 1 hour for {}", count, agent_id),
            description: format!(
                "Agent {} was denied {} times in the past hour. Tools attempted: {}. This may indicate an agent trying to escalate privileges or access restricted resources.",
                agent_id, count, tools
            ),
            source_1_type: "security_events".into(),
            source_1_id: None,
            source_2_type: None,
            source_2_id: None,
            agent_ids: vec![agent_id.clone()],
            risk_score: if count >= 5 { 80 } else { 60 },
            raw_data: Some(serde_json::json!({
                "agent_id": agent_id,
                "denial_count": count,
                "tools": tools,
            })),
        });
    }

    Ok(correlations)
}

/// Rule 3: Viper found critical vuln AND agent had anomalous behavior
async fn correlate_vuln_with_anomaly(db: &EngineDb) -> Result<Vec<CorrelationInput>> {
    let conn = db.conn_async().await;
    let mut correlations = Vec::new();

    // Get critical Viper findings
    let mut viper_stmt = conn.prepare(
        "SELECT id, title, category FROM viper_findings WHERE severity = 'critical' AND created_at >= datetime('now', '-7 days')",
    )?;
    let critical_vulns: Vec<(String, String, String)> = viper_stmt
        .query_map([], |row| Ok((
            row.get::<usize, String>(0)?,
            row.get::<usize, String>(1)?,
            row.get::<usize, String>(2)?,
        )))?
        .filter_map(|r| r.ok())
        .collect();

    // Get recent anomaly events
    let mut anomaly_stmt = conn.prepare(
        "SELECT id, agent_id, details FROM security_events
         WHERE event_type = 'anomaly' AND category IN ('warning', 'critical')
         AND created_at >= datetime('now', '-7 days')",
    )?;
    let anomalies: Vec<(String, String, Option<String>)> = anomaly_stmt
        .query_map([], |row| Ok((
            row.get::<usize, String>(0)?,
            row.get::<usize, String>(1)?,
            row.get::<usize, Option<String>>(2)?,
        )))?
        .filter_map(|r| r.ok())
        .collect();

    for (vuln_id, vuln_title, vuln_category) in &critical_vulns {
        for (anomaly_id, agent_id, anomaly_details) in &anomalies {
            correlations.push(CorrelationInput {
                correlation_type: "vuln_with_anomaly".into(),
                severity: "critical".into(),
                title: format!("Critical {} vuln + anomalous agent behavior", vuln_category),
                description: format!(
                    "Viper found a critical {} vulnerability: {}. At the same time, agent {} showed anomalous behavior. This combination suggests an active exploitation attempt.",
                    vuln_category, vuln_title, agent_id
                ),
                source_1_type: "viper_findings".into(),
                source_1_id: Some(vuln_id.clone()),
                source_2_type: Some("security_events".into()),
                source_2_id: Some(anomaly_id.clone()),
                agent_ids: vec![agent_id.clone()],
                risk_score: 95,
                raw_data: Some(serde_json::json!({
                    "vuln_id": vuln_id,
                    "vuln_title": vuln_title,
                    "anomaly_id": anomaly_id,
                    "agent_id": agent_id,
                    "anomaly_details": anomaly_details,
                })),
            });
        }
    }

    Ok(correlations)
}

/// Rule 4: Agent defense scores declining across audit runs
async fn correlate_defense_degradation(db: &EngineDb) -> Result<Vec<CorrelationInput>> {
    let conn = db.conn_async().await;
    let mut correlations = Vec::new();

    let mut stmt = conn.prepare(
        "SELECT a1.agent_id, a1.agent_name, a1.defense_score as current_score, a2.defense_score as prev_score
         FROM agent_audit_results a1
         JOIN agent_audit_results a2 ON a1.agent_id = a2.agent_id AND a2.run_id < a1.run_id
         JOIN agent_audit_runs r1 ON a1.run_id = r1.id
         JOIN agent_audit_runs r2 ON a2.run_id = r2.id
         WHERE r1.status = 'completed' AND r2.status = 'completed'
         AND a1.defense_score < a2.defense_score - 10
         ORDER BY r1.started_at DESC
         LIMIT 20",
    )?;

    let degradations: Vec<(String, String, i64, i64)> = stmt
        .query_map([], |row| Ok((
            row.get::<usize, String>(0)?,
            row.get::<usize, String>(1)?,
            row.get::<usize, i64>(2)?,
            row.get::<usize, i64>(3)?,
        )))?
        .filter_map(|r| r.ok())
        .collect();

    for (agent_id, agent_name, current, prev) in degradations {
        let drop = prev - current;
        correlations.push(CorrelationInput {
            correlation_type: "defense_degradation".into(),
            severity: if drop > 30 { "critical" } else { "warning" }.into(),
            title: format!("{} defense score dropped by {} points", agent_name, drop),
            description: format!(
                "{} defense score dropped from {} to {} ({} points). This indicates the agent may have been fine-tuned, modified, or is using a weaker model.",
                agent_name, prev, current, drop
            ),
            source_1_type: "agent_audit_findings".into(),
            source_1_id: None,
            source_2_type: None,
            source_2_id: None,
            agent_ids: vec![agent_id.clone()],
            risk_score: if drop > 30 { 75 } else { 55 },
            raw_data: Some(serde_json::json!({
                "agent_id": agent_id,
                "current_score": current,
                "previous_score": prev,
                "drop": drop,
            })),
        });
    }

    Ok(correlations)
}

/// Rule 5: Multiple agents with low scores
async fn correlate_multi_agent_risk(db: &EngineDb) -> Result<Vec<CorrelationInput>> {
    let conn = db.conn_async().await;
    let mut correlations = Vec::new();

    // Find the latest agent audit run
    let latest_run: Option<String> = conn.query_row(
        "SELECT id FROM agent_audit_runs WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1",
        [],
        |row| row.get(0),
    ).ok();

    if let Some(run_id) = latest_run {
        let mut stmt = conn.prepare(
            "SELECT agent_id, agent_name, defense_score FROM agent_audit_results
             WHERE run_id = ? AND defense_score < 50
             ORDER BY defense_score ASC",
        )?;

        let weak_agents: Vec<(String, String, i64)> = stmt
            .query_map(rusqlite::params![run_id], |row| Ok((
                row.get::<usize, String>(0)?,
                row.get::<usize, String>(1)?,
                row.get::<usize, i64>(2)?,
            )))?
            .filter_map(|r| r.ok())
            .collect();

        if weak_agents.len() >= 2 {
            let agent_names: Vec<String> = weak_agents.iter().map(|(_, name, _)| name.clone()).collect();
            let agent_ids: Vec<String> = weak_agents.iter().map(|(id, _, _)| id.clone()).collect();
            let avg_score: i64 = weak_agents.iter().map(|(_, _, s)| s).sum::<i64>() / weak_agents.len() as i64;

            correlations.push(CorrelationInput {
                correlation_type: "multi_agent_risk".into(),
                severity: "critical".into(),
                title: format!("{} agents have defense scores below 50", weak_agents.len()),
                description: format!(
                    "Agents {} all scored below 50/100 on the latest defense audit (avg: {}). A compromised agent could pivot to attack weaker siblings. Consider hardening SOUL.md security rules across the agent family.",
                    agent_names.join(", "), avg_score
                ),
                source_1_type: "agent_audit_findings".into(),
                source_1_id: None,
                source_2_type: None,
                source_2_id: None,
                agent_ids,
                risk_score: 85,
                raw_data: Some(serde_json::json!({
                    "weak_agents": weak_agents,
                    "average_score": avg_score,
                })),
            });
        }
    }

    Ok(correlations)
}

// ═════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════

async fn persist_correlation(db: &EngineDb, corr: &CorrelationInput) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.conn_async().await;
    let agent_ids_json = serde_json::to_string(&corr.agent_ids)?;

    conn.execute(
        "INSERT INTO siem_correlations (id, correlation_type, severity, title, description, source_1_type, source_1_id, source_2_type, source_2_id, agent_ids, risk_score, raw_data)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            &id, &corr.correlation_type, &corr.severity, &corr.title, &corr.description,
            &corr.source_1_type, &corr.source_1_id,
            &corr.source_2_type, &corr.source_2_id,
            &agent_ids_json, corr.risk_score,
            corr.raw_data.as_ref().map(|v| v.to_string()),
        ],
    )?;

    Ok(id)
}

async fn generate_alert_from_correlation(db: &EngineDb, corr_id: &str, corr: &CorrelationInput) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.conn_async().await;
    let agent_id = corr.agent_ids.first().cloned();

    conn.execute(
        "INSERT INTO siem_alerts (id, alert_type, severity, title, description, source, agent_id, correlation_id, raw_data)
         VALUES (?1, 'correlation', ?2, ?3, ?4, 'siem_correlation', ?5, ?6, ?7)",
        rusqlite::params![
            &id, &corr.severity, &corr.title, &corr.description,
            agent_id, corr_id,
            corr.raw_data.as_ref().map(|v| v.to_string()),
        ],
    )?;

    // Log to SIEM events
    let _ = events::log_event(
        db,
        if corr.severity == "critical" { EventCategory::Critical } else { EventCategory::Warning },
        EventType::Anomaly,
        &format!("SIEM Alert: {}", corr.title),
        corr.raw_data.clone(),
    );

    Ok(id)
}

fn compute_aggregate_risk(
    aegis_score: Option<i64>,
    viper_risk: Option<i64>,
    agent_defense: Option<i64>,
    active_alerts: i64,
    critical_alerts: i64,
) -> i64 {
    let mut risk_components: Vec<i64> = Vec::new();

    // Aegis: score is 0-100 health. Convert to risk (invert).
    if let Some(score) = aegis_score {
        risk_components.push(100 - score);
    }

    // Viper: risk_score is already 0-100 (higher = more risk).
    if let Some(risk) = viper_risk {
        risk_components.push(risk);
    }

    // Agent defense: score is 0-100 defense. Convert to risk (invert).
    if let Some(defense) = agent_defense {
        risk_components.push(100 - defense);
    }

    // Base risk from components
    let base_risk = if risk_components.is_empty() {
        50 // Unknown = moderate risk
    } else {
        risk_components.iter().sum::<i64>() / risk_components.len() as i64
    };

    // Alert penalty
    let alert_penalty = (active_alerts * 3).min(20);
    let critical_penalty = (critical_alerts * 10).min(30);

    (base_risk + alert_penalty + critical_penalty).min(100)
}

async fn compute_trend(db: &EngineDb, current_risk: i64) -> Result<String> {
    let conn = db.conn_async().await;

    // Get last week's report risk score
    let prev_risk: Option<i64> = conn.query_row(
        "SELECT risk_score FROM siem_weekly_reports ORDER BY week_start DESC LIMIT 1",
        [],
        |row| row.get(0),
    ).ok();

    if let Some(prev) = prev_risk {
        if current_risk < prev - 5 {
            Ok("improving".into())
        } else if current_risk > prev + 5 {
            Ok("degrading".into())
        } else {
            Ok("stable".into())
        }
    } else {
        Ok("stable".into())
    }
}

async fn get_top_risks(db: &EngineDb) -> Result<Vec<String>> {
    let conn = db.conn_async().await;
    let mut risks: Vec<String> = Vec::new();

    // Check for active critical alerts
    let critical_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM siem_alerts WHERE status = 'active' AND severity = 'critical'",
        [],
        |row| row.get(0),
    ).unwrap_or(0);
    if critical_count > 0 {
        risks.push(format!("{} active critical alert{}", critical_count, if critical_count > 1 { "s" } else { "" }));
    }

    // Check for recent agent breaches
    let breach_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM agent_audit_findings WHERE severity = 'breach' AND created_at >= datetime('now', '-7 days')",
        [],
        |row| row.get(0),
    ).unwrap_or(0);
    if breach_count > 0 {
        risks.push(format!("{} agent breach{} in last 7 days", breach_count, if breach_count > 1 { "es" } else { "" }));
    }

    // Check for critical system vulns
    let critical_vulns: i64 = conn.query_row(
        "SELECT COUNT(*) FROM viper_findings WHERE severity = 'critical' AND created_at >= datetime('now', '-7 days')",
        [],
        |row| row.get(0),
    ).unwrap_or(0);
    if critical_vulns > 0 {
        risks.push(format!("{} critical system vulnerabilit{} found", critical_vulns, if critical_vulns > 1 { "ies" } else { "y" }));
    }

    // Check for repeated denials
    let denials: i64 = conn.query_row(
        "SELECT COUNT(*) FROM security_events WHERE event_type = 'permission_denied' AND created_at >= datetime('now', '-24 hours')",
        [],
        |row| row.get(0),
    ).unwrap_or(0);
    if denials >= 5 {
        risks.push(format!("{} permission denials in last 24h", denials));
    }

    if risks.is_empty() {
        risks.push("No significant risks detected".into());
    }

    Ok(risks)
}

fn generate_weekly_summary(
    risk_score: i64,
    risk_trend: &str,
    total_events: i64,
    critical_events: i64,
    alerts_generated: i64,
    alerts_resolved: i64,
    aegis_score: Option<i64>,
    viper_score: Option<i64>,
    agent_defense: Option<i64>,
) -> String {
    let mut parts: Vec<String> = Vec::new();

    parts.push(format!("Weekly Security Report — Overall Risk: {}/100 ({})", risk_score, risk_trend));

    if critical_events > 0 {
        parts.push(format!("⚠️ {} critical events detected this week out of {} total events.", critical_events, total_events));
    } else if total_events > 0 {
        parts.push(format!("✅ {} security events logged this week, no critical findings.", total_events));
    } else {
        parts.push("✅ Quiet week — no significant security events.".into());
    }

    if alerts_generated > 0 {
        let rate = (alerts_resolved as f64 / alerts_generated as f64) * 100.0;
        parts.push(format!("🔔 {} alerts generated, {} resolved ({:.0}% resolution rate).", alerts_generated, alerts_resolved, rate));
    }

    if let Some(score) = aegis_score {
        parts.push(format!("🛡️ System health: {}/100.", score));
    }
    if let Some(risk) = viper_score {
        parts.push(format!("🐍 Vulnerability risk: {}/100.", risk));
    }
    if let Some(defense) = agent_defense {
        parts.push(format!("⚔️ Agent defense: {}/100.", defense));
    }

    parts.join(" ")
}
