#!/usr/bin/env python3
"""
log_activity.py — The one-liner for every agent to write to RUN_LOG.md

Usage:
  python3 log_activity.py <agent_id> <action> <details> [evidence]

Examples:
  python3 log_activity.py aegis SECURITY_SCAN "Overnight scan complete. 0 anomalies detected." "/shared/security/audits/daily-2026-04-19.md"
  python3 log_activity.py forge BUILD "+247 lines. Permission gates phase 1 complete." "commit: a3f9c21"
  python3 log_activity.py helix MARKET_SCAN "2 competitor launches, 1 funding round detected."
  python3 log_activity.py prism STANDUP "2 active missions. mission-1224: 47%."
  python3 log_activity.py zigbot DREAM_CYCLE "Memory consolidated. 42% load. 0 entries pruned."

Format written to RUN_LOG.md:
  [YYYY-MM-DD HH:MM:SS] AgentName | ACTION | Details
  ---
"""

import sys
import os
from datetime import datetime

RUN_LOG_PATH = "/home/calo/.openclaw/shared/RUN_LOG.md"

AGENT_NAMES = {
    "vector":   "Vector",
    "zigbot":   "ZigBot",
    "viper":    "Viper",
    "aegis":    "Aegis",
    "prism":    "Prism",
    "spectra":  "Spectra",
    "luma":     "Luma",
    "catalyst": "Catalyst",
    "forge":    "Forge",
    "quanta":   "Quanta",
    "pulse":    "Pulse",
    "helix":    "Helix",
    "lex":      "Lex",
    "ledger":   "Ledger",
    "bolt":     "Bolt",
    "sona":     "Sona",
    "vanta":    "Vanta",
}

def log_activity(agent_id: str, action: str, details: str, evidence: str = "") -> bool:
    """Append a standardized entry to RUN_LOG.md"""
    now = datetime.now()
    timestamp = now.strftime("%Y-%m-%d %H:%M:%S")
    agent_name = AGENT_NAMES.get(agent_id.lower(), agent_id.capitalize())
    
    evidence_line = f" | {evidence}" if evidence else ""
    
    entry = (
        f"[{timestamp}] {agent_name} | {action} | {details}{evidence_line}\n"
        f"---\n"
    )
    
    try:
        with open(RUN_LOG_PATH, "a") as f:
            f.write(entry)
        return True
    except Exception as e:
        print(f"ERROR: Could not write to {RUN_LOG_PATH}: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: log_activity.py <agent_id> <action> <details> [evidence]")
        print("Example: log_activity.py aegis SECURITY_SCAN '0 anomalies detected' '/shared/security/audits/daily-2026-04-19.md'")
        sys.exit(1)
    
    agent_id = sys.argv[1]
    action = sys.argv[2]
    details = sys.argv[3]
    evidence = sys.argv[4] if len(sys.argv) > 4 else ""
    
    success = log_activity(agent_id, action, details, evidence)
    sys.exit(0 if success else 1)
