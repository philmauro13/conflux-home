// Conflux Engine — Cross-Platform OS Abstraction Layer
// Mission 1224: Supports Linux, macOS, and Windows
// All functions are infallible — return safe defaults if commands fail.

use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OsType {
    Linux,
    MacOS,
    Windows,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct PlatformInfo {
    pub os: OsType,
    pub os_name: String,
    pub os_version: String,
    pub hostname: String,
    pub arch: String,
}

/// Returns the current platform type.
pub fn current_os() -> OsType {
    match std::env::consts::OS {
        "linux" => OsType::Linux,
        "macos" => OsType::MacOS,
        "windows" => OsType::Windows,
        _ => OsType::Unknown,
    }
}

pub fn is_linux() -> bool { std::env::consts::OS == "linux" }
pub fn is_macos() -> bool { std::env::consts::OS == "macos" }
pub fn is_windows() -> bool { std::env::consts::OS == "windows" }

/// Run a shell command, return stdout or empty string on failure.
fn run_cmd(program: &str, args: &[&str]) -> String {
    Command::new(program)
        .args(args)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

/// Get full platform info.
pub fn get_platform_info() -> PlatformInfo {
    let os = current_os();
    let hostname = run_cmd("hostname", &[]);
    let arch = std::env::consts::ARCH.to_string();

    let (os_name, os_version) = match os {
        OsType::Linux => {
            let rel = run_cmd("cat", &["/etc/os-release"]);
            let name = rel.lines()
                .find(|l| l.starts_with("PRETTY_NAME="))
                .map(|l| l.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string())
                .unwrap_or_else(|| "Linux".to_string());
            let version = rel.lines()
                .find(|l| l.starts_with("VERSION_ID="))
                .map(|l| l.trim_start_matches("VERSION_ID=").trim_matches('"').to_string())
                .unwrap_or_default();
            (name, version)
        }
        OsType::MacOS => {
            let name = run_cmd("sw_vers", &["-productName"]);
            let version = run_cmd("sw_vers", &["-productVersion"]);
            (name, version)
        }
        OsType::Windows => {
            let ver = run_cmd("cmd", &["/c", "ver"]);
            (ver.clone(), ver)
        }
        OsType::Unknown => ("Unknown".to_string(), String::new()),
    };

    PlatformInfo { os, os_name, os_version, hostname, arch }
}

/// Get firewall status.
/// Returns (is_active, product_name, raw_output)
pub fn get_firewall_status() -> (bool, String, String) {
    match current_os() {
        OsType::Linux => {
            // Try ufw first
            let ufw = run_cmd("ufw", &["status"]);
            if !ufw.is_empty() {
                let active = ufw.contains("Status: active");
                return (active, "UFW".to_string(), ufw);
            }
            // Try iptables
            let iptables = run_cmd("iptables", &["-L", "-n"]);
            let active = !iptables.is_empty() && !iptables.contains("Chain INPUT (policy ACCEPT)");
            (active, "iptables".to_string(), iptables)
        }
        OsType::MacOS => {
            let pfctl = run_cmd("pfctl", &["-si"]);
            if !pfctl.is_empty() {
                let enabled = pfctl.contains("Status: Enabled");
                return (enabled, "PF (Packet Filter)".to_string(), pfctl);
            }
            // Check if firewall is enabled via system preferences
            let defaults = run_cmd("defaults", &["read", "/Library/Preferences/com.apple.alf", "globalstate"]);
            let enabled = defaults.trim() != "0" && !defaults.is_empty();
            (enabled, "macOS Firewall".to_string(), defaults)
        }
        OsType::Windows => {
            let output = run_cmd("netsh", &["advfirewall", "show", "allprofiles", "state"]);
            let active = output.contains("ON") || output.contains("Enabled");
            (active, "Windows Defender Firewall".to_string(), output)
        }
        OsType::Unknown => (false, "Unknown".to_string(), String::new()),
    }
}

/// Get listening ports.
/// Returns Vec of (port, protocol, program, bind_address)
pub fn get_listening_ports() -> Vec<(String, String, String, String)> {
    match current_os() {
        OsType::Linux => {
            let output = run_cmd("ss", &["-tlnp"]);
            parse_linux_ss(&output)
        }
        OsType::MacOS => {
            let output = run_cmd("lsof", &["-iTCP", "-sTCP:LISTEN", "-P", "-n"]);
            parse_macos_lsof(&output)
        }
        OsType::Windows => {
            let output = run_cmd("netstat", &["-ano"]);
            parse_windows_netstat(&output)
        }
        OsType::Unknown => Vec::new(),
    }
}

fn parse_linux_ss(output: &str) -> Vec<(String, String, String, String)> {
    let mut ports = Vec::new();
    for line in output.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 {
            let local_addr = parts[3];
            if let Some(addr_part) = local_addr.split(':').last() {
                let port = addr_part.to_string();
                let proto = parts[0].to_uppercase().replace("LISTEN", "").trim().to_string();
                let process = parts.last().map(|s| s.to_string()).unwrap_or_default();
                let bind = local_addr.to_string();
                if !port.is_empty() && port.parse::<u16>().is_ok() {
                    ports.push((port, proto, process, bind));
                }
            }
        }
    }
    ports
}

fn parse_macos_lsof(output: &str) -> Vec<(String, String, String, String)> {
    let mut ports = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 9 {
            let name = parts.get(0).unwrap_or(&"");
            let proto = parts.get(4).unwrap_or(&"TCP").to_string();
            let name_id = parts.get(8).unwrap_or(&"");
            if let Some(addr) = name_id.split(':').last() {
                if let Ok(port) = addr.parse::<u16>() {
                    ports.push((port.to_string(), proto.replace("TCP", "TCP"), name.to_string(), name_id.to_string()));
                }
            }
        }
    }
    ports
}

fn parse_windows_netstat(output: &str) -> Vec<(String, String, String, String)> {
    let mut ports = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 5 && parts[3] == "LISTENING" {
            let local_addr = parts[1];
            if let Some(port_str) = local_addr.rsplit(':').next() {
                if let Ok(port) = port_str.parse::<u16>() {
                    let proto = parts[0].to_uppercase();
                    let pid = parts[4].to_string();
                    ports.push((port.to_string(), proto, format!("PID:{}", pid), local_addr.to_string()));
                }
            }
        }
    }
    ports
}

/// Get user accounts.
/// Returns Vec of (username, uid, shell, home)
pub fn get_users() -> Vec<(String, String, String, String)> {
    match current_os() {
        OsType::Linux => {
            let output = run_cmd("cat", &["/etc/passwd"]);
            parse_passwd(&output)
        }
        OsType::MacOS => {
            let output = run_cmd("dscl", &[".", "-list", "/Users", "Shell"]);
            let homes = run_cmd("dscl", &[".", "-list", "/Users", "NFSHomeDirectory"]);
            let shells = run_cmd("dscl", &[".", "-list", "/Users", "Shell"]);
            let uids = run_cmd("dscl", &[".", "-list", "/Users", "UniqueID"]);
            parse_macos_users(&output, &homes, &shells, &uids)
        }
        OsType::Windows => {
            let output = run_cmd("wmic", &["useraccount", "get", "name,sid,disabled"]);
            parse_windows_users(&output)
        }
        OsType::Unknown => Vec::new(),
    }
}

fn parse_passwd(output: &str) -> Vec<(String, String, String, String)> {
    output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() >= 7 {
                Some((
                    parts[0].to_string(),
                    parts[2].to_string(),
                    parts[6].to_string(),
                    parts[5].to_string(),
                ))
            } else {
                None
            }
        })
        .collect()
}

fn parse_macos_users(names_out: &str, homes_out: &str, shells_out: &str, uids_out: &str) -> Vec<(String, String, String, String)> {
    let names: Vec<&str> = names_out.lines().filter(|l| !l.contains("_mbsetupuser") && !l.is_empty()).collect();
    let homes: Vec<&str> = homes_out.lines().filter(|l| !l.contains("_mbsetupuser") && !l.is_empty()).collect();
    let shells: Vec<&str> = shells_out.lines().filter(|l| !l.contains("_mbsetupuser") && !l.is_empty()).collect();
    let uids: Vec<&str> = uids_out.lines().filter(|l| !l.contains("_mbsetupuser") && !l.is_empty()).collect();

    let get_field = |lines: &[&str], name: &str, idx: usize| -> String {
        lines.iter().find(|l| l.starts_with(name)).map(|l| l.split_whitespace().nth(idx).unwrap_or("")).unwrap_or("/bin/bash").to_string()
    };

    names.iter()
        .map(|name| {
            let name = name.trim();
            let home = get_field(&homes, name, 1);
            let shell = get_field(&shells, name, 1);
            let uid = get_field(&uids, name, 1);
            (name.to_string(), uid, shell, home)
        })
        .filter(|(name, _, _, _)| !name.starts_with('_') && !name.is_empty())
        .collect()
}

fn parse_windows_users(output: &str) -> Vec<(String, String, String, String)> {
    output
        .lines()
        .skip(1)
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().filter(|s| !s.is_empty()).collect();
            if parts.len() >= 2 {
                let name = parts[0].to_string();
                let sid = parts[1].to_string();
                let disabled_str = if parts.len() > 2 { parts[2] } else { "" };
                let shell: String = if disabled_str == "TRUE" { "Disabled" } else { "Active" }.to_string();
                Some((name, sid, shell, String::new()))
            } else {
                None
            }
        })
        .collect()
}

/// Check if a process with given name is running.
pub fn is_process_running(name: &str) -> bool {
    match current_os() {
        OsType::Linux | OsType::MacOS => {
            let output = run_cmd("pgrep", &["-x", name]);
            !output.is_empty()
        }
        OsType::Windows => {
            let output = run_cmd("tasklist", &["/FI", &format!("IMAGENAME eq {}", name)]);
            output.to_lowercase().contains(&name.to_lowercase())
        }
        OsType::Unknown => false,
    }
}

/// Get OS-specific SSH config path.
pub fn get_ssh_config_path() -> Option<String> {
    match current_os() {
        OsType::Linux => Some("/etc/ssh/sshd_config".to_string()),
        OsType::MacOS => {
            if std::path::Path::new("/etc/ssh/sshd_config").exists() {
                Some("/etc/ssh/sshd_config".to_string())
            } else if std::path::Path::new("/usr/local/sbin/sshd").exists() {
                Some("/usr/local/sbin/sshd_config".to_string())
            } else {
                None
            }
        }
        OsType::Windows => {
            let path = r"C:\ProgramData\ssh\sshd_config";
            if std::path::Path::new(path).exists() {
                Some(path.to_string())
            } else {
                None
            }
        }
        OsType::Unknown => None,
    }
}

/// Get the hosts file path for the current platform.
pub fn get_hosts_path() -> String {
    match current_os() {
        OsType::Windows => r"C:\Windows\System32\drivers\etc\hosts".to_string(),
        _ => "/etc/hosts".to_string(),
    }
}

/// Get auto-update check command output (empty if not available).
pub fn get_auto_update_status() -> String {
    match current_os() {
        OsType::Linux => {
            if is_process_running("unattended-upgrades") {
                "Unattended upgrades: running".to_string()
            } else {
                run_cmd("apt", &["-qq", "list", "--upgradable"])
            }
        }
        OsType::MacOS => run_cmd("softwareupdate", &["--list"]),
        OsType::Windows => {
            let output = run_cmd("powershell", &["-Command", "Get-Service wuauserv | Select-Object -ExpandProperty Status"]);
            format!("Windows Update service: {}", output.trim())
        }
        OsType::Unknown => String::new(),
    }
}

/// Check if running as root/Administrator.
pub fn is_elevated() -> bool {
    match current_os() {
        OsType::Linux | OsType::MacOS => {
            let output = run_cmd("id", &["-u"]);
            output.trim() == "0"
        }
        OsType::Windows => {
            let output = run_cmd("net", &["session"]);
            output.contains("denied") || output.is_empty()
        }
        OsType::Unknown => false,
    }
}
