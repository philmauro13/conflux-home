// Conflux Engine — Viper Vulnerability Scanner
// Mission 1224 Phase 3: Red Team Operator
// Scans the local system for vulnerabilities and attack surface.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::process::Command;
use uuid::Uuid;

use crate::engine::db::EngineDb;
use crate::engine::security::events::{self, EventCategory, EventType};
use super::platform::*;

/// A single vulnerability finding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VulnFinding {
    pub id: String,
    pub scan_id: String,
    pub category: String,
    pub check_name: String,
    pub severity: String,
    pub title: String,
    pub description: String,
    pub remediation: Option<String>,
    pub cve_ids: Option<Vec<String>>,
    pub raw_data: Option<serde_json::Value>,
}

/// A scan summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VulnScan {
    pub id: String,
    pub scan_type: String,
    pub status: String,
    pub risk_score: Option<i64>,
    pub total_checks: i64,
    pub pass_count: i64,
    pub info_count: i64,
    pub warn_count: i64,
    pub critical_count: i64,
    pub started_at: String,
    pub completed_at: Option<String>,
}

/// Raw finding before DB insert
#[derive(Debug, Clone)]
struct FindingInput {
    category: String,
    check_name: String,
    severity: String,
    title: String,
    description: String,
    remediation: Option<String>,
    cve_ids: Option<Vec<String>>,
    raw_data: Option<serde_json::Value>,
}

// ── Public API ──────────────────────────────────────────────

/// Run a full vulnerability scan.
pub async fn run_full_scan(db: &EngineDb) -> Result<String> {
    run_scan(db, "full").await
}

/// Run a quick scan (misconfig + network only).
pub async fn run_quick_scan(db: &EngineDb) -> Result<String> {
    run_scan(db, "quick").await
}

/// Get recent scans.
pub async fn get_scans(db: &EngineDb, limit: i64) -> Result<Vec<VulnScan>> {
    let conn = db.conn_async().await;
    let mut stmt = conn.prepare(
        "SELECT id, scan_type, status, risk_score, total_checks, pass_count, info_count, warn_count, critical_count, started_at, completed_at
         FROM viper_scans ORDER BY started_at DESC LIMIT ?",
    )?;
    let scans = stmt
        .query_map(rusqlite::params![limit], |row| {
            Ok(VulnScan {
                id: row.get(0)?,
                scan_type: row.get(1)?,
                status: row.get(2)?,
                risk_score: row.get(3)?,
                total_checks: row.get(4)?,
                pass_count: row.get(5)?,
                info_count: row.get(6)?,
                warn_count: row.get(7)?,
                critical_count: row.get(8)?,
                started_at: row.get(9)?,
                completed_at: row.get(10)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(scans)
}

/// Get findings for a scan.
pub async fn get_findings(db: &EngineDb, scan_id: &str) -> Result<Vec<VulnFinding>> {
    let conn = db.conn_async().await;
    let mut stmt = conn.prepare(
        "SELECT id, scan_id, category, check_name, severity, title, description, remediation, cve_ids, raw_data
         FROM viper_findings WHERE scan_id = ? ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 ELSE 3 END,
         category, check_name",
    )?;
    let findings = stmt
        .query_map(rusqlite::params![scan_id], |row| {
            let cve_raw: Option<String> = row.get(8)?;
            let raw: Option<String> = row.get(9)?;
            Ok(VulnFinding {
                id: row.get(0)?,
                scan_id: row.get(1)?,
                category: row.get(2)?,
                check_name: row.get(3)?,
                severity: row.get(4)?,
                title: row.get(5)?,
                description: row.get(6)?,
                remediation: row.get(7)?,
                cve_ids: cve_raw.and_then(|s| serde_json::from_str(&s).ok()),
                raw_data: raw.and_then(|s| serde_json::from_str(&s).ok()),
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(findings)
}

/// Get findings by category.
pub async fn get_findings_by_category(
    db: &EngineDb,
    scan_id: &str,
    category: &str,
) -> Result<Vec<VulnFinding>> {
    let conn = db.conn_async().await;
    let mut stmt = conn.prepare(
        "SELECT id, scan_id, category, check_name, severity, title, description, remediation, cve_ids, raw_data
         FROM viper_findings WHERE scan_id = ? AND category = ?
         ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 ELSE 3 END",
    )?;
    let findings = stmt
        .query_map(rusqlite::params![scan_id, category], |row| {
            let cve_raw: Option<String> = row.get(8)?;
            let raw: Option<String> = row.get(9)?;
            Ok(VulnFinding {
                id: row.get(0)?,
                scan_id: row.get(1)?,
                category: row.get(2)?,
                check_name: row.get(3)?,
                severity: row.get(4)?,
                title: row.get(5)?,
                description: row.get(6)?,
                remediation: row.get(7)?,
                cve_ids: cve_raw.and_then(|s| serde_json::from_str(&s).ok()),
                raw_data: raw.and_then(|s| serde_json::from_str(&s).ok()),
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(findings)
}

/// Get latest scan summary.
pub async fn get_latest_summary(db: &EngineDb) -> Result<Option<serde_json::Value>> {
    let conn = db.conn_async().await;
    let row = conn.query_row(
        "SELECT id, scan_type, status, risk_score, total_checks, pass_count, info_count, warn_count, critical_count, started_at, completed_at
         FROM viper_scans ORDER BY started_at DESC LIMIT 1",
        [],
        |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "scan_type": row.get::<_, String>(1)?,
                "status": row.get::<_, String>(2)?,
                "risk_score": row.get::<_, Option<i64>>(3)?,
                "total_checks": row.get::<_, i64>(4)?,
                "pass_count": row.get::<_, i64>(5)?,
                "info_count": row.get::<_, i64>(6)?,
                "warn_count": row.get::<_, i64>(7)?,
                "critical_count": row.get::<_, i64>(8)?,
                "started_at": row.get::<_, String>(9)?,
                "completed_at": row.get::<_, Option<String>>(10)?,
            }))
        },
    );
    match row {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Delete a scan.
pub async fn delete_scan(db: &EngineDb, scan_id: &str) -> Result<bool> {
    let conn = db.conn_async().await;
    let deleted = conn.execute(
        "DELETE FROM viper_scans WHERE id = ?",
        rusqlite::params![scan_id],
    )?;
    Ok(deleted > 0)
}

// ── Internal: Scan Runner ───────────────────────────────────

async fn run_scan(db: &EngineDb, scan_type: &str) -> Result<String> {
    let scan_id = Uuid::new_v4().to_string();
    let conn = db.conn_async().await;

    conn.execute(
        "INSERT INTO viper_scans (id, scan_type, status) VALUES (?1, ?2, 'running')",
        rusqlite::params![&scan_id, scan_type],
    )?;

    log::info!("[Viper] Starting {} scan: {}", scan_type, scan_id);

    let mut all_findings: Vec<FindingInput> = Vec::new();

    // ── Misconfiguration checks ──
    match scan_misconfig() {
        Ok(mut f) => all_findings.append(&mut f),
        Err(e) => log::warn!("[Viper] Misconfig scan failed: {}", e),
    }

    // ── Network exposure ──
    match scan_network() {
        Ok(mut f) => all_findings.append(&mut f),
        Err(e) => log::warn!("[Viper] Network scan failed: {}", e),
    }

    if scan_type == "full" {
        // ── Browser security ──
        match scan_browser() {
            Ok(mut f) => all_findings.append(&mut f),
            Err(e) => log::warn!("[Viper] Browser scan failed: {}", e),
        }

        // ── Password checks ──
        match scan_passwords() {
            Ok(mut f) => all_findings.append(&mut f),
            Err(e) => log::warn!("[Viper] Password scan failed: {}", e),
        }

        // ── Code/config review ──
        match scan_code_config() {
            Ok(mut f) => all_findings.append(&mut f),
            Err(e) => log::warn!("[Viper] Code scan failed: {}", e),
        }

        // ── General vuln checks ──
        match scan_general() {
            Ok(mut f) => all_findings.append(&mut f),
            Err(e) => log::warn!("[Viper] General scan failed: {}", e),
        }
    }

    // ── Persist findings ──
    let mut pass_count = 0i64;
    let mut info_count = 0i64;
    let mut warn_count = 0i64;
    let mut critical_count = 0i64;

    for f in &all_findings {
        let finding_id = Uuid::new_v4().to_string();
        let cve_json = f
            .cve_ids
            .as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_default());
        conn.execute(
            "INSERT INTO viper_findings (id, scan_id, category, check_name, severity, title, description, remediation, cve_ids, raw_data)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                finding_id,
                &scan_id,
                &f.category,
                &f.check_name,
                &f.severity,
                &f.title,
                &f.description,
                &f.remediation,
                cve_json,
                f.raw_data.as_ref().map(|v| v.to_string()),
            ],
        )?;

        match f.severity.as_str() {
            "pass" => pass_count += 1,
            "info" => info_count += 1,
            "warning" => warn_count += 1,
            "critical" => critical_count += 1,
            _ => {}
        }
    }

    let total = all_findings.len() as i64;
    let risk_score = calculate_risk_score(pass_count, info_count, warn_count, critical_count);

    let now = crate::engine::db::EngineDb::now();
    conn.execute(
        "UPDATE viper_scans SET status = 'completed', risk_score = ?1, total_checks = ?2,
         pass_count = ?3, info_count = ?4, warn_count = ?5, critical_count = ?6, completed_at = ?7
         WHERE id = ?8",
        rusqlite::params![
            risk_score,
            total,
            pass_count,
            info_count,
            warn_count,
            critical_count,
            now,
            &scan_id
        ],
    )?;

    // Log to SIEM
    let severity = if critical_count > 0 {
        EventCategory::Critical
    } else if warn_count > 0 {
        EventCategory::Warning
    } else {
        EventCategory::Info
    };

    let _ = events::log_security_event(
        db,
        "viper",
        None,
        EventType::Anomaly,
        severity,
        Some("viper_scan"),
        Some(&format!("{} scan", scan_type)),
        Some(&format!(
            "{{\"scan_id\":\"{}\",\"risk\":{},\"pass\":{},\"info\":{},\"warn\":{},\"critical\":{}}}",
            scan_id, risk_score, pass_count, info_count, warn_count, critical_count
        )),
        if critical_count > 0 {
            85
        } else if warn_count > 0 {
            45
        } else {
            0
        },
        true,
    );

    log::info!(
        "[Viper] Scan {} complete: risk={}, pass={}, info={}, warn={}, critical={}",
        scan_id,
        risk_score,
        pass_count,
        info_count,
        warn_count,
        critical_count
    );

    Ok(scan_id)
}

// ── Scanners ────────────────────────────────────────────────

fn scan_misconfig() -> Result<Vec<FindingInput>> {
    let mut findings = Vec::new();

    match current_os() {
        OsType::Linux => {
            #[cfg(unix)]
            {
                // Check for world-readable /etc/shadow
                if let Ok(metadata) = std::fs::metadata("/etc/shadow") {
                    use std::os::unix::fs::PermissionsExt;
                    let mode = metadata.permissions().mode();
                    if mode & 0o007 != 0 {
                        findings.push(FindingInput {
                            category: "misconfig".into(),
                            check_name: "shadow_world_readable".into(),
                            severity: "critical".into(),
                            title: "/etc/shadow Is World-Readable".into(),
                            description: format!(
                                "/etc/shadow has mode {:o} — other users can read password hashes.",
                                mode & 0o777
                            ),
                            remediation: Some("chmod 640 /etc/shadow".into()),
                            cve_ids: None,
                            raw_data: Some(serde_json::json!({"mode": format!("{:o}", mode & 0o777)})),
                        });
                    } else {
                        findings.push(FindingInput {
                            category: "misconfig".into(),
                            check_name: "shadow_world_readable".into(),
                            severity: "pass".into(),
                            title: "/etc/shadow Permissions OK".into(),
                            description: "/etc/shadow is not world-readable.".into(),
                            remediation: None,
                            cve_ids: None,
                            raw_data: None,
                        });
                    }
                }
            }

            // Check for weak crypto in SSH config
            if let Some(ssh_config_path) = get_ssh_config_path() {
                if let Ok(content) = std::fs::read_to_string(&ssh_config_path) {
                    let weak_ciphers = ["3des-cbc", "arcfour", "blowfish-cbc", "cast128-cbc"];
                    let weak_macs = ["hmac-md5", "hmac-sha1-96"];
                    let mut found_weak = Vec::new();

                    for line in content.lines() {
                        let lower = line.to_lowercase();
                        if lower.starts_with("ciphers") {
                            for weak in &weak_ciphers {
                                if lower.contains(weak) {
                                    found_weak.push(format!("cipher: {}", weak));
                                }
                            }
                        }
                        if lower.starts_with("macs") {
                            for weak in &weak_macs {
                                if lower.contains(weak) {
                                    found_weak.push(format!("mac: {}", weak));
                                }
                            }
                        }
                    }

                    if !found_weak.is_empty() {
                        findings.push(FindingInput {
                            category: "misconfig".into(),
                            check_name: "ssh_weak_crypto".into(),
                            severity: "critical".into(),
                            title: "SSH Uses Weak Cryptographic Algorithms".into(),
                            description: format!(
                                "SSH config includes weak algorithms: {}",
                                found_weak.join(", ")
                            ),
                            remediation: Some(
                                "Remove weak ciphers/MACs from /etc/ssh/sshd_config. Use only aes-256-gcm, chacha20-poly1305, hmac-sha2-256, hmac-sha2-512.".into(),
                            ),
                            cve_ids: None,
                            raw_data: Some(serde_json::json!({"weak_algorithms": found_weak})),
                        });
                    } else {
                        findings.push(FindingInput {
                            category: "misconfig".into(),
                            check_name: "ssh_weak_crypto".into(),
                            severity: "pass".into(),
                            title: "SSH Cryptographic Configuration OK".into(),
                            description: "No weak ciphers or MACs detected in sshd_config.".into(),
                            remediation: None,
                            cve_ids: None,
                            raw_data: None,
                        });
                    }
                }
            }

            // Check for unattended-upgrades config
            let ua_paths = [
                "/etc/apt/apt.conf.d/20auto-upgrades",
                "/etc/apt/apt.conf.d/50unattended-upgrades",
            ];
            let mut auto_updates_configured = false;
            for path in &ua_paths {
                if let Ok(content) = std::fs::read_to_string(path) {
                    if content.contains("Unattended-Upgrade \"1\"")
                        || content.contains("APT::Periodic::Unattended-Upgrade")
                    {
                        auto_updates_configured = true;
                    }
                }
            }
            if !auto_updates_configured {
                findings.push(FindingInput {
                    category: "misconfig".into(),
                    check_name: "auto_updates_not_configured".into(),
                    severity: "warning".into(),
                    title: "Automatic Security Updates Not Configured".into(),
                    description: "Unattended upgrades are not configured. Known vulnerabilities will persist until manually patched.".into(),
                    remediation: Some("Run: sudo dpkg-reconfigure -plow unattended-upgrades".into()),
                    cve_ids: None,
                    raw_data: None,
                });
            }

            // Check for unnecessary SUID binaries
            if let Ok(output) = Command::new("find")
                .args([
                    "/usr/bin",
                    "/usr/sbin",
                    "/usr/local/bin",
                    "-perm",
                    "/4000",
                    "-type",
                    "f",
                ])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let suid_files: Vec<&str> = stdout.lines().filter(|l| !l.trim().is_empty()).collect();

                let dangerous_suid: Vec<&&str> = suid_files
                    .iter()
                    .filter(|f| {
                        let name = f.rsplit('/').next().unwrap_or("");
                        ["pkexec", "mount.nfs", "wall", "write", "dmcrypt-setup"].contains(&name)
                    })
                    .collect();

                if !dangerous_suid.is_empty() {
                    findings.push(FindingInput {
                        category: "misconfig".into(),
                        check_name: "dangerous_suid_binaries".into(),
                        severity: "warning".into(),
                        title: format!("{} Potentially Dangerous SUID Binaries", dangerous_suid.len()),
                        description: "SUID binaries with known privilege escalation vectors detected.".into(),
                        remediation: Some("Remove SUID bit: chmod u-s <binary> if not needed for your workflow.".into()),
                        cve_ids: None,
                        raw_data: Some(serde_json::json!({"binaries": dangerous_suid.iter().map(|f| f.to_string()).collect::<Vec<_>>()})),
                    });
                }

                findings.push(FindingInput {
                    category: "misconfig".into(),
                    check_name: "suid_count".into(),
                    severity: "info".into(),
                    title: format!("{} SUID Binaries Found", suid_files.len()),
                    description: "Total SUID binaries on the system.".into(),
                    remediation: None,
                    cve_ids: None,
                    raw_data: Some(serde_json::json!({"count": suid_files.len()})),
                });
            }

            // Check kernel.dmesg_restrict (info leak)
            if let Ok(val) = std::fs::read_to_string("/proc/sys/kernel/dmesg_restrict") {
                if val.trim() == "0" {
                    findings.push(FindingInput {
                        category: "misconfig".into(),
                        check_name: "dmesg_unrestricted".into(),
                        severity: "warning".into(),
                        title: "Kernel Log (dmesg) Accessible to All Users".into(),
                        description: "kernel.dmesg_restrict=0 allows any user to read kernel logs, which may leak sensitive hardware/memory info.".into(),
                        remediation: Some("echo 1 | sudo tee /proc/sys/kernel/dmesg_restrict".into()),
                        cve_ids: None,
                        raw_data: Some(serde_json::json!({"value": 0})),
                    });
                }
            }

            // Check kernel.kptr_restrict (kernel pointer leak)
            if let Ok(val) = std::fs::read_to_string("/proc/sys/kernel/kptr_restrict") {
                let v = val.trim().parse::<i64>().unwrap_or(0);
                if v == 0 {
                    findings.push(FindingInput {
                        category: "misconfig".into(),
                        check_name: "kptr_not_restricted".into(),
                        severity: "warning".into(),
                        title: "Kernel Pointers Exposed in /proc".into(),
                        description: "kernel.kptr_restrict=0 exposes kernel addresses in /proc/kallsyms, aiding exploitation.".into(),
                        remediation: Some("echo 2 | sudo tee /proc/sys/kernel/kptr_restrict".into()),
                        cve_ids: None,
                        raw_data: Some(serde_json::json!({"value": v})),
                    });
                }
            }
        }

        OsType::MacOS => {
            // Check SIP (System Integrity Protection) status
            let sip = Command::new("csrutil")
                .arg("status")
                .output();
            if let Ok(output) = sip {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let enabled = stdout.contains("enabled") || stdout.contains("enabled (Internal)");
                findings.push(FindingInput {
                    category: "misconfig".into(),
                    check_name: "macos_sip".into(),
                    severity: if enabled { "pass" } else { "critical" }.into(),
                    title: if enabled { "System Integrity Protection Enabled" } else { "System Integrity Protection Disabled" }.into(),
                    description: if enabled {
                        "SIP is active, protecting critical system files.".into()
                    } else {
                        "SIP is disabled. Critical system files are unprotected.".into()
                    },
                    remediation: if !enabled {
                        Some("Enable SIP: boot into Recovery Mode and run: csrutil enable".into())
                    } else {
                        None
                    },
                    cve_ids: None,
                    raw_data: Some(serde_json::json!({"status": stdout})),
                });
            }

            // Check firewall status using platform function
            let (active, product_name, _) = get_firewall_status();
            if !active {
                findings.push(FindingInput {
                    category: "misconfig".into(),
                    check_name: "macos_firewall".into(),
                    severity: "warning".into(),
                    title: "macOS Firewall is Disabled".into(),
                    description: "The macOS firewall is not active.".into(),
                    remediation: Some("Enable via System Settings > Network > Firewall".into()),
                    cve_ids: None,
                    raw_data: Some(serde_json::json!({"product": product_name})),
                });
            }

            // Check for remote Apple events
            let remote_apple_events = Command::new("defaults")
                .args(["read", "/System/Library/SystemEvents/CoreTypes", "RemoteAppleEventsEnabled"])
                .output();
            if let Ok(output) = remote_apple_events {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if stdout == "1" {
                    findings.push(FindingInput {
                        category: "misconfig".into(),
                        check_name: "remote_apple_events".into(),
                        severity: "warning".into(),
                        title: "Remote Apple Events Enabled".into(),
                        description: "Remote Apple Events allow remote computer access to scripts.".into(),
                        remediation: Some("Disable via System Settings > Sharing > Remote Apple Events".into()),
                        cve_ids: None,
                        raw_data: Some(serde_json::json!({"enabled": true})),
                    });
                }
            }
        }

        OsType::Windows => {
            // Check Windows Firewall default policy
            let (active, product_name, _) = get_firewall_status();
            if !active {
                findings.push(FindingInput {
                    category: "misconfig".into(),
                    check_name: "windows_firewall".into(),
                    severity: "critical".into(),
                    title: "Windows Firewall is Disabled".into(),
                    description: "Windows Defender Firewall is not active.".into(),
                    remediation: Some("Enable via Control Panel > System and Security > Windows Firewall".into()),
                    cve_ids: None,
                    raw_data: Some(serde_json::json!({"product": product_name})),
                });
            }

            // Check if RDP is enabled
            let rdp = Command::new("powershell")
                .args(["-Command", r"Get-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name 'fDenyTSConnections' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty fDenyTSConnections"])
                .output();
            if let Ok(output) = rdp {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if stdout == "0" {
                    findings.push(FindingInput {
                        category: "misconfig".into(),
                        check_name: "rdp_enabled".into(),
                        severity: "critical".into(),
                        title: "Remote Desktop (RDP) is Enabled".into(),
                        description: "RDP is enabled and accessible. This is a common attack vector.".into(),
                        remediation: Some("Disable RDP if not needed, or enforce NLA and strong passwords.".into()),
                        cve_ids: None,
                        raw_data: Some(serde_json::json!({"rdp_enabled": true})),
                    });
                }
            }

            // Check UAC status
            let uac = Command::new("powershell")
                .args(["-Command", r"Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'EnableLUA' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty EnableLUA"])
                .output();
            if let Ok(output) = uac {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if stdout != "1" {
                    findings.push(FindingInput {
                        category: "misconfig".into(),
                        check_name: "uac_disabled".into(),
                        severity: "critical".into(),
                        title: "UAC (User Account Control) is Disabled".into(),
                        description: "UAC is turned off. Applications can run with full administrator privileges.".into(),
                        remediation: Some("Enable UAC via Control Panel > User Accounts > User Accounts > Change UAC settings".into()),
                        cve_ids: None,
                        raw_data: Some(serde_json::json!({"uac_enabled": false})),
                    });
                }
            }
        }

        OsType::Unknown => {
            findings.push(FindingInput {
                category: "misconfig".into(),
                check_name: "platform_unknown".into(),
                severity: "info".into(),
                title: "Unknown Platform".into(),
                description: "Cannot run misconfiguration checks for this platform.".into(),
                remediation: None,
                cve_ids: None,
                raw_data: None,
            });
        }
    }

    Ok(findings)
}

fn scan_network() -> Result<Vec<FindingInput>> {
    let mut findings = Vec::new();

    // Check for services listening on 0.0.0.0 (exposed to all interfaces)
    let output = Command::new("ss")
        .args(["-tlnp"])
        .output()
        .or_else(|_| Command::new("netstat").args(["-tlnp"]).output());

    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let exposed: Vec<&str> = stdout
            .lines()
            .filter(|l| {
                l.contains("LISTEN")
                    && (l.contains("0.0.0.0:") || l.contains("*:"))
                    && !l.contains("127.0.0.1")
                    && !l.contains("::1")
            })
            .collect();

        if !exposed.is_empty() {
            findings.push(FindingInput {
                category: "network".into(),
                check_name: "exposed_services".into(),
                severity: "warning".into(),
                title: format!(
                    "{} Services Listening on All Interfaces",
                    exposed.len()
                ),
                description: "Services bound to 0.0.0.0 or * are accessible from any network interface, including external.".into(),
                remediation: Some("Bind services to 127.0.0.1 if only local access is needed. Use firewall rules for external services.".into()),
                cve_ids: None,
                raw_data: Some(serde_json::json!({
                    "count": exposed.len(),
                    "services": exposed.iter().take(15).map(|l| l.trim().to_string()).collect::<Vec<_>>(),
                })),
            });
        }
    }

    // Check for promiscuous mode interfaces
    if let Ok(output) = Command::new("ip").args(["link"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let promisc: Vec<&str> = stdout.lines().filter(|l| l.contains("PROMISC")).collect();

        if !promisc.is_empty() {
            findings.push(FindingInput {
                category: "network".into(),
                check_name: "promiscuous_mode".into(),
                severity: "critical".into(),
                title: "Network Interface in Promiscuous Mode".into(),
                description: "A network interface is in PROMISC mode, capturing all traffic (possible sniffing/packet capture).".into(),
                remediation: Some("Investigate: ip link show. Disable promiscuous mode if not intentionally capturing.".into()),
                cve_ids: None,
                raw_data: Some(serde_json::json!({"interfaces": promisc.iter().map(|l| l.trim().to_string()).collect::<Vec<_>>()})),
            });
        } else {
            findings.push(FindingInput {
                category: "network".into(),
                check_name: "promiscuous_mode".into(),
                severity: "pass".into(),
                title: "No Promiscuous Mode Interfaces".into(),
                description: "No network interfaces are in promiscuous mode.".into(),
                remediation: None,
                cve_ids: None,
                raw_data: None,
            });
        }
    }

    // Check /etc/hosts for suspicious entries
    if let Ok(content) = std::fs::read_to_string("/etc/hosts") {
        let suspicious_patterns = ["pastebin.com", "ngrok.io", "serveo.net", "burpcollaborator"];
        let mut found = Vec::new();
        for line in content.lines() {
            let lower = line.to_lowercase();
            for pattern in &suspicious_patterns {
                if lower.contains(pattern) && !line.trim().starts_with('#') {
                    found.push(line.trim().to_string());
                }
            }
        }
        if !found.is_empty() {
            findings.push(FindingInput {
                category: "network".into(),
                check_name: "suspicious_hosts_entries".into(),
                severity: "critical".into(),
                title: "Suspicious Entries in /etc/hosts".into(),
                description:
                    "/etc/hosts contains entries pointing to known C2/exfiltration domains.".into(),
                remediation: Some(
                    "Remove suspicious lines from /etc/hosts. Investigate how they were added."
                        .into(),
                ),
                cve_ids: None,
                raw_data: Some(serde_json::json!({"entries": found})),
            });
        }
    }

    // Check for IP forwarding
    for iface in ["all", "default"] {
        let path = format!("/proc/sys/net/ipv4/conf/{}/ip_forward", iface);
        if let Ok(val) = std::fs::read_to_string(&path) {
            if val.trim() == "1" {
                findings.push(FindingInput {
                    category: "network".into(),
                    check_name: format!("ip_forwarding_{}", iface),
                    severity: "info".into(),
                    title: "IP Forwarding Enabled".into(),
                    description: format!(
                        "net.ipv4.conf.{}.ip_forward=1 — this machine routes packets between interfaces.",
                        iface
                    ),
                    remediation: Some(
                        "Disable if not a router: echo 0 | sudo tee /proc/sys/net/ipv4/conf/all/ip_forward"
                            .into(),
                    ),
                    cve_ids: None,
                    raw_data: Some(serde_json::json!({"iface": iface, "value": 1})),
                });
            }
        }
    }

    // Check for mDNS/Avahi (local network discovery)
    if let Ok(output) = Command::new("systemctl")
        .args(["is-active", "avahi-daemon"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout == "active" {
            findings.push(FindingInput {
                category: "network".into(),
                check_name: "avahi_running".into(),
                severity: "info".into(),
                title: "mDNS/Avahi Discovery Active".into(),
                description:
                    "avahi-daemon is running, advertising services on the local network via mDNS."
                        .into(),
                remediation: Some(
                    "Disable if not needed: sudo systemctl disable --now avahi-daemon".into(),
                ),
                cve_ids: None,
                raw_data: None,
            });
        }
    }

    Ok(findings)
}

fn scan_browser() -> Result<Vec<FindingInput>> {
    let mut findings = Vec::new();

    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return Ok(findings),
    };

    // Check Firefox profiles for saved passwords (key4.db / logins.json)
    let ff_base = format!("{}/.mozilla/firefox", home);
    if let Ok(entries) = std::fs::read_dir(&ff_base) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let logins = path.join("logins.json");
                if logins.exists() {
                    // Check if passwords are stored
                    if let Ok(content) = std::fs::read_to_string(&logins) {
                        if content.contains("\"encryptedPassword\"") {
                            findings.push(FindingInput {
                                category: "browser".into(),
                                check_name: "firefox_saved_passwords".into(),
                                severity: "info".into(),
                                title: "Firefox Stores Saved Passwords".into(),
                                description: format!(
                                    "Firefox profile {:?} has saved passwords. If master password is not set, they can be extracted.",
                                    path.file_name().unwrap_or_default()
                                ),
                                remediation: Some(
                                    "Set a Firefox master password: Settings > Privacy & Security > Use a Primary Password."
                                        .into(),
                                ),
                                cve_ids: None,
                                raw_data: Some(serde_json::json!({"profile": path.to_string_lossy()})),
                            });
                        }
                    }
                }
            }
        }
    }

    // Check Chrome/Chromium for login data
    let chrome_paths = [
        format!("{}/.config/google-chrome/Default/Login Data", home),
        format!("{}/.config/chromium/Default/Login Data", home),
    ];
    for path in &chrome_paths {
        if std::path::Path::new(path).exists() {
            findings.push(FindingInput {
                category: "browser".into(),
                check_name: "chrome_saved_passwords".into(),
                severity: "info".into(),
                title: "Chrome/Chromium Stores Saved Passwords".into(),
                description: "Chrome/Chromium has a Login Data file with saved credentials.".into(),
                remediation: Some(
                    "Use a dedicated password manager instead of browser-stored passwords.".into(),
                ),
                cve_ids: None,
                raw_data: Some(serde_json::json!({"path": path})),
            });
        }
    }

    // Check for browser extensions with excessive permissions
    let ext_dirs = [
        format!("{}/.config/google-chrome/Default/Extensions", home),
        format!("{}/.config/chromium/Default/Extensions", home),
        format!("{}/.mozilla/firefox", home),
    ];
    let mut ext_count = 0;
    for dir in &ext_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    ext_count += 1;
                }
            }
        }
    }
    if ext_count > 15 {
        findings.push(FindingInput {
            category: "browser".into(),
            check_name: "excessive_browser_extensions".into(),
            severity: "warning".into(),
            title: format!("{} Browser Extensions Installed", ext_count),
            description:
                "Many browser extensions increase the attack surface. Each extension has access to browsing data."
                    .into(),
            remediation: Some(
                "Audit extensions: remove unused ones, review permissions of remaining.".into(),
            ),
            cve_ids: None,
            raw_data: Some(serde_json::json!({"count": ext_count})),
        });
    } else if ext_count > 0 {
        findings.push(FindingInput {
            category: "browser".into(),
            check_name: "browser_extensions".into(),
            severity: "info".into(),
            title: format!("{} Browser Extensions Found", ext_count),
            description: "Browser extensions detected.".into(),
            remediation: None,
            cve_ids: None,
            raw_data: Some(serde_json::json!({"count": ext_count})),
        });
    }

    Ok(findings)
}

fn scan_passwords() -> Result<Vec<FindingInput>> {
    let mut findings = Vec::new();

    // Check /etc/shadow for accounts with no password
    if let Ok(content) = std::fs::read_to_string("/etc/shadow") {
        let no_password: Vec<&str> = content
            .lines()
            .filter(|l| {
                let parts: Vec<&str> = l.split(':').collect();
                parts.len() > 2 && (parts[1].is_empty() || parts[1] == "!")
            })
            .collect();

        if !no_password.is_empty() {
            let names: Vec<&str> = no_password
                .iter()
                .map(|l| l.split(':').next().unwrap_or("?"))
                .collect();
            findings.push(FindingInput {
                category: "passwords".into(),
                check_name: "accounts_no_password".into(),
                severity: "warning".into(),
                title: format!(
                    "{} Accounts Without Passwords",
                    no_password.len()
                ),
                description: format!(
                    "These accounts have no password set: {}. Locked system accounts are normal.",
                    names.join(", ")
                ),
                remediation: Some(
                    "Lock unused accounts: sudo passwd -l <user>. Ensure real accounts have passwords."
                        .into(),
                ),
                cve_ids: None,
                raw_data: Some(serde_json::json!({"accounts": names})),
            });
        }
    }

    // Check for password reuse indicators (same hash in /etc/shadow)
    if let Ok(content) = std::fs::read_to_string("/etc/shadow") {
        use std::collections::HashMap;
        let mut hash_map: HashMap<String, Vec<String>> = HashMap::new();
        for line in content.lines() {
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() > 2 {
                let hash = parts[1].to_string();
                let user = parts[0].to_string();
                if !hash.is_empty() && hash != "!" && hash != "*" && hash != "!!" {
                    hash_map.entry(hash).or_default().push(user);
                }
            }
        }
        let reused: Vec<(&String, &Vec<String>)> = hash_map
            .iter()
            .filter(|(_, users)| users.len() > 1)
            .collect();

        if !reused.is_empty() {
            findings.push(FindingInput {
                category: "passwords".into(),
                check_name: "password_reuse".into(),
                severity: "critical".into(),
                title: "Password Reuse Detected".into(),
                description: format!(
                    "{} groups of accounts share the same password hash.",
                    reused.len()
                ),
                remediation: Some(
                    "Change passwords so each account has a unique password.".into(),
                ),
                cve_ids: None,
                raw_data: Some(serde_json::json!({
                    "reused_groups": reused.iter().map(|(_, users)| users.clone()).collect::<Vec<_>>()
                })),
            });
        }
    }

    // Check for password aging policies
    if let Ok(content) = std::fs::read_to_string("/etc/login.defs") {
        let mut max_days = 0i64;
        let mut min_days = 0i64;
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("PASS_MAX_DAYS") {
                max_days = trimmed
                    .split_whitespace()
                    .last()
                    .unwrap_or("0")
                    .parse()
                    .unwrap_or(0);
            }
            if trimmed.starts_with("PASS_MIN_DAYS") {
                min_days = trimmed
                    .split_whitespace()
                    .last()
                    .unwrap_or("0")
                    .parse()
                    .unwrap_or(0);
            }
        }
        if max_days == 0 || max_days > 365 {
            findings.push(FindingInput {
                category: "passwords".into(),
                check_name: "password_no_aging".into(),
                severity: "warning".into(),
                title: "No Password Expiration Policy".into(),
                description: format!(
                    "PASS_MAX_DAYS is {} — passwords never expire or expire after {} days.",
                    if max_days == 0 {
                        "unlimited".into()
                    } else {
                        max_days.to_string()
                    },
                    max_days
                ),
                remediation: Some(
                    "Set PASS_MAX_DAYS 90 in /etc/login.defs to enforce periodic password changes."
                        .into(),
                ),
                cve_ids: None,
                raw_data: Some(serde_json::json!({"max_days": max_days, "min_days": min_days})),
            });
        }
    }

    // Check for common/default passwords via login attempts (non-invasive: just check config)
    let home = std::env::var("HOME").unwrap_or_default();
    let ssh_config = format!("{}/.ssh/config", home);
    if let Ok(content) = std::fs::read_to_string(&ssh_config) {
        if content
            .to_lowercase()
            .contains("passwordauthentication yes")
        {
            findings.push(FindingInput {
                category: "passwords".into(),
                check_name: "ssh_password_in_config".into(),
                severity: "warning".into(),
                title: "SSH Client Config Allows Password Auth".into(),
                description: "Your SSH client config explicitly enables password authentication."
                    .into(),
                remediation: Some(
                    "Set 'PasswordAuthentication no' in ~/.ssh/config for sensitive hosts.".into(),
                ),
                cve_ids: None,
                raw_data: None,
            });
        }
    }

    Ok(findings)
}

fn scan_code_config() -> Result<Vec<FindingInput>> {
    let mut findings = Vec::new();
    let home = std::env::var("HOME").unwrap_or_default();

    // Check for hardcoded credentials in common config files
    let check_paths: Vec<String> = vec![
        format!("{}/.env", home),
        format!("{}/.openclaw/.env", home),
        format!("{}/.aws/credentials", home),
        format!("{}/.npmrc", home),
        format!("{}/.pypirc", home),
    ];

    for path in &check_paths {
        if let Ok(content) = std::fs::read_to_string(path) {
            let has_secrets = content.lines().any(|l| {
                let lower = l.to_lowercase();
                (lower.contains("password")
                    || lower.contains("secret")
                    || lower.contains("api_key"))
                    && l.contains('=')
                    && !l.trim().starts_with('#')
                    && l.split('=').last().unwrap_or("").trim().len() > 3
            });
            if has_secrets {
                findings.push(FindingInput {
                    category: "code".into(),
                    check_name: format!("secrets_in_{}", path.rsplit('/').next().unwrap_or("file")),
                    severity: "warning".into(),
                    title: format!("Potential Secrets in {}", path),
                    description: "File appears to contain plaintext passwords or API keys.".into(),
                    remediation: Some(
                        "Use environment variables, a secrets manager, or encrypted storage instead of plaintext secrets in files."
                            .into(),
                    ),
                    cve_ids: None,
                    raw_data: Some(serde_json::json!({"path": path})),
                });
            }
        }
    }

    // Check for .git directories exposed
    let git_check_dirs = ["/var/www", "/srv", "/opt"];
    for dir in &git_check_dirs {
        let git_dir = format!("{}/.git", dir);
        if std::path::Path::new(&git_dir).is_dir() {
            // Check if there's a web server serving this
            findings.push(FindingInput {
                category: "code".into(),
                check_name: format!("git_exposed_{}", dir.replace('/', "_")),
                severity: "info".into(),
                title: format!(".git Directory in {}", dir),
                description: format!("{} contains a .git directory. If served by a web server, source code may be exposed.", dir),
                remediation: Some("Block .git access in web server config, or move .git outside the web root.".into()),
                cve_ids: None,
                raw_data: Some(serde_json::json!({"path": git_dir})),
            });
        }
    }

    // Check Docker daemon config
    if let Ok(content) = std::fs::read_to_string("/etc/docker/daemon.json") {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if json["live-restore"] != true {
                findings.push(FindingInput {
                    category: "code".into(),
                    check_name: "docker_no_live_restore".into(),
                    severity: "info".into(),
                    title: "Docker live-restore Not Enabled".into(),
                    description: "Docker daemon doesn't have live-restore enabled. Containers stop when daemon restarts.".into(),
                    remediation: Some("\"live-restore\": true in /etc/docker/daemon.json".into()),
                    cve_ids: None,
                    raw_data: None,
                });
            }
            if json["userns-remap"].is_null() {
                findings.push(FindingInput {
                    category: "code".into(),
                    check_name: "docker_no_userns".into(),
                    severity: "warning".into(),
                    title: "Docker User Namespace Remapping Not Enabled".into(),
                    description: "Containers run with root inside by default. User namespace remapping isolates container UIDs.".into(),
                    remediation: Some("Add \"userns-remap\": \"default\" to /etc/docker/daemon.json".into()),
                    cve_ids: None,
                    raw_data: None,
                });
            }
        }
    }

    // Check for world-readable private keys
    let ssh_dir = format!("{}/.ssh", home);
    if let Ok(entries) = std::fs::read_dir(&ssh_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".pem")
                || name.ends_with("_rsa")
                || name.ends_with("_ed25519")
                || name == "id_rsa"
                || name == "id_ed25519"
            {
                #[cfg(unix)]
                {
                    if let Ok(metadata) = std::fs::metadata(entry.path()) {
                        use std::os::unix::fs::PermissionsExt;
                        let mode = metadata.permissions().mode();
                        if mode & 0o077 != 0 {
                            findings.push(FindingInput {
                                category: "code".into(),
                                check_name: format!("key_perms_{}", name),
                                severity: "critical".into(),
                                title: format!("Private Key {} Has Loose Permissions", name),
                                description: format!("~/.ssh/{} has mode {:o} — group/other can read it.", name, mode & 0o777),
                                remediation: Some(format!("chmod 600 ~/.ssh/{}", name)),
                                cve_ids: None,
                                raw_data: Some(serde_json::json!({"file": name, "mode": format!("{:o}", mode & 0o777)})),
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(findings)
}

fn scan_general() -> Result<Vec<FindingInput>> {
    let mut findings = Vec::new();

    // Check for known vulnerable packages (apt)
    if let Ok(output) = Command::new("apt")
        .args(["list", "--upgradable"])
        .env("LANG", "C")
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let security_updates: Vec<&str> = stdout
            .lines()
            .filter(|l| l.contains("security") || l.contains("ubuntu-security"))
            .collect();

        if !security_updates.is_empty() {
            findings.push(FindingInput {
                category: "general".into(),
                check_name: "pending_security_updates".into(),
                severity: "critical".into(),
                title: format!("{} Security Updates Pending", security_updates.len()),
                description: "Packages with known security vulnerabilities have updates available.".into(),
                remediation: Some("sudo apt update && sudo apt upgrade -y".into()),
                cve_ids: None,
                raw_data: Some(serde_json::json!({
                    "count": security_updates.len(),
                    "packages": security_updates.iter().take(20).map(|l| l.trim().to_string()).collect::<Vec<_>>(),
                })),
            });
        }
    }

    // Check for core dumps enabled
    if let Ok(val) = std::fs::read_to_string("/proc/sys/kernel/core_pattern") {
        if !val.trim().starts_with("|") && val.trim() != "core" {
            // Core dumps going to files
            findings.push(FindingInput {
                category: "general".into(),
                check_name: "core_dumps_to_files".into(),
                severity: "info".into(),
                title: "Core Dumps Written to Disk".into(),
                description: format!("kernel.core_pattern = {} — core dumps are saved to files which may contain sensitive data.", val.trim()),
                remediation: Some("Set kernel.core_pattern to pipe to systemd-coredump or disable: sysctl -w kernel.core_pattern=|/bin/false".into()),
                cve_ids: None,
                raw_data: Some(serde_json::json!({"pattern": val.trim()})),
            });
        }
    }

    // Check for accounts with UID 0 (should only be root)
    if let Ok(content) = std::fs::read_to_string("/etc/passwd") {
        let uid0: Vec<&str> = content
            .lines()
            .filter(|l| {
                let parts: Vec<&str> = l.split(':').collect();
                parts.len() > 2 && parts[2] == "0"
            })
            .collect();

        if uid0.len() > 1 {
            let names: Vec<&str> = uid0
                .iter()
                .map(|l| l.split(':').next().unwrap_or("?"))
                .collect();
            findings.push(FindingInput {
                category: "general".into(),
                check_name: "multiple_uid0".into(),
                severity: "critical".into(),
                title: "Multiple Accounts with UID 0".into(),
                description: format!(
                    "Found {} accounts with UID 0 (root): {}. Only 'root' should have UID 0.",
                    uid0.len(),
                    names.join(", ")
                ),
                remediation: Some(
                    "Remove or change UID of non-root UID 0 accounts immediately.".into(),
                ),
                cve_ids: None,
                raw_data: Some(serde_json::json!({"accounts": names})),
            });
        } else {
            findings.push(FindingInput {
                category: "general".into(),
                check_name: "multiple_uid0".into(),
                severity: "pass".into(),
                title: "Only root Has UID 0".into(),
                description: "No rogue UID 0 accounts found.".into(),
                remediation: None,
                cve_ids: None,
                raw_data: None,
            });
        }
    }

    // Check for unowned files in system dirs
    if let Ok(output) = Command::new("find")
        .args(["/etc", "/usr", "-nouser", "-o", "-nogroup"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let unowned: Vec<&str> = stdout.lines().filter(|l| !l.trim().is_empty()).collect();
        if !unowned.is_empty() {
            findings.push(FindingInput {
                category: "general".into(),
                check_name: "unowned_files".into(),
                severity: "warning".into(),
                title: format!("{} Unowned Files in System Dirs", unowned.len()),
                description: "Files with no valid user/group owner found in /etc and /usr. These may indicate removed accounts or tampering.".into(),
                remediation: Some("Investigate unowned files: find /etc /usr -nouser -nogroup. Chown to appropriate users.".into()),
                cve_ids: None,
                raw_data: Some(serde_json::json!({"count": unowned.len(), "files": unowned.iter().take(15).map(|f| f.to_string()).collect::<Vec<_>>()})),
            });
        }
    }

    // Check for writable systemd service files
    if let Ok(output) = Command::new("find")
        .args([
            "/etc/systemd/system",
            "/lib/systemd/system",
            "-writable",
            "-name",
            "*.service",
        ])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let writable: Vec<&str> = stdout.lines().filter(|l| !l.trim().is_empty()).collect();
        if !writable.is_empty() {
            findings.push(FindingInput {
                category: "general".into(),
                check_name: "writable_systemd_services".into(),
                severity: "critical".into(),
                title: format!("{} Writable Systemd Service Files", writable.len()),
                description: "Systemd service files are writable by non-root users. This allows persistence via service modification.".into(),
                remediation: Some("chmod 644 <service-file> and investigate how permissions were changed.".into()),
                cve_ids: None,
                raw_data: Some(serde_json::json!({"files": writable.iter().take(10).map(|f| f.to_string()).collect::<Vec<_>>()})),
            });
        }
    }

    Ok(findings)
}

// ── Helpers ─────────────────────────────────────────────────

/// Calculate risk score (0-100, higher = more vulnerable).
fn calculate_risk_score(pass: i64, info: i64, warn: i64, critical: i64) -> i64 {
    let total = pass + info + warn + critical;
    if total == 0 {
        return 0;
    }
    let risk = (critical * 25) + (warn * 8) + (info * 1);
    risk.min(100)
}
