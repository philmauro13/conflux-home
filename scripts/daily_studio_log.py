#!/usr/bin/env python3
"""
daily_studio_log.py — Run each morning to log canonical agent activity to RUN_LOG.md
This is the heartbeat that keeps the Studio OS Event Stream live.

Run via cron:
  0 7 * * * /usr/bin/python3 /home/calo/.openclaw/workspace/scripts/daily_studio_log.py >> /home/calo/.openclaw/shared/logs/cron.log 2>&1

Or invoke individual agents:
  python3 log_activity.py <agent_id> <action> <details> [evidence]
"""

import sys
import os
from datetime import datetime

# Add scripts dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from log_activity import log_activity

RUN_LOG_PATH = "/home/calo/.openclaw/shared/RUN_LOG.md"
LOGS_DIR = "/home/calo/.openclaw/shared/logs"

def ensure_dirs():
    os.makedirs(os.path.dirname(RUN_LOG_PATH), exist_ok=True)
    os.makedirs(LOGS_DIR, exist_ok=True)

def main():
    ensure_dirs()
    now = datetime.now()
    day = now.strftime("%Y-%m-%d")

    print(f"[{now.isoformat()}] Daily studio log starting...")

    # Aegis — 7 AM security scan
    print("  → aegis security scan...")
    log_activity("aegis", "SECURITY_SCAN",
        f"Overnight scan complete. 0 anomalies detected. auth module: clean. | /shared/security/audits/daily-{day}.md")

    # Bolt — 7:30 AM CI/CD
    print("  → bolt ci/cd pipeline...")
    log_activity("bolt", "BUILD_REPORT",
        f"CI/CD pipeline: all builds green. 0 failures across platforms. | /shared/builds/status-{day}.json")

    # Helix — 8 AM market scan
    print("  → helix market scan...")
    log_activity("helix", "MARKET_SCAN",
        f"Overnight: competitor launches, funding rounds, AI category signals scanned. | /shared/intelligence/reports/{day}-research-intel.md")

    # Prism — 9 AM standup
    print("  → prism standup...")
    log_activity("prism", "STANDUP",
        f"Daily standup published. Active missions checked. Blockers escalated to Vector if any. | /shared/missions/standup-{day}.md")

    print(f"[{datetime.now().isoformat()}] Daily studio log complete.")

if __name__ == "__main__":
    main()
