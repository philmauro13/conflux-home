// Security Hub v2.0 — Unified Security Center
// Combines Aegis, Viper, SIEM/Watchtower, Permissions, Activity, Pending

import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// ── Timeout wrapper ──
function invokeTimeout<T>(cmd: string, args?: Record<string, unknown>, ms = 5000): Promise<T> {
  return Promise.race([
    invoke<T>(cmd, args),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Command '${cmd}' timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ── Types ──
interface RiskOverview {
  overall_score: number;
  trend: string;
  active_alerts: number;
  critical_alerts: number;
  correlations_24h: number;
  events_24h: number;
  aegis_score: number | null;
  viper_risk: number | null;
  agent_defense: number | null;
  top_risks: string[];
}

interface AuditRun {
  id: string;
  run_type: string;
  status: string;
  overall_score: number | null;
  total_checks: number;
  pass_count: number;
  warn_count: number;
  critical_count: number;
  started_at: string;
  completed_at: string | null;
}

interface AuditFinding {
  id: string;
  run_id: string;
  category: string;
  check_name: string;
  severity: 'pass' | 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string | null;
  raw_data: unknown;
}

interface VulnScan {
  id: string;
  scan_type: string;
  status: string;
  risk_score: number | null;
  total_checks: number;
  pass_count: number;
  info_count: number;
  warn_count: number;
  critical_count: number;
  started_at: string;
  completed_at: string | null;
}

interface VulnFinding {
  id: string;
  scan_id: string;
  category: string;
  check_name: string;
  severity: 'pass' | 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  remediation: string | null;
  cve_ids: string[] | null;
  raw_data: unknown;
}

interface SecurityEvent {
  id: string;
  agent_id: string;
  event_type: string;
  category: 'info' | 'warning' | 'critical';
  tool_name: string | null;
  target: string | null;
  risk_score: number;
  was_allowed: boolean;
  created_at: string;
}

interface PermissionPrompt {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_emoji: string;
  request_type: string;
  target: string;
  tool_name: string | null;
  created_at: string;
}

interface AgentProfile {
  agent_id: string;
  sandbox_enabled: boolean;
  file_access_mode: string;
  network_mode: string;
  exec_mode: string;
  anomaly_threshold: number;
}

interface SiemAlert {
  id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  source: string;
  agent_id: string | null;
  correlation_id: string | null;
  status: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

// ── Category Meta ──
const AEGIS_CATEGORY_META: Record<string, { icon: string; label: string; color: string }> = {
  firewall: { icon: '🧱', label: 'Firewall', color: '#f97316' },
  ports: { icon: '🔌', label: 'Open Ports', color: '#06b6d4' },
  ssh: { icon: '🔑', label: 'Remote Access', color: '#eab308' },
  permissions: { icon: '📂', label: 'File Permissions', color: '#8b5cf6' },
  software: { icon: '📦', label: 'Software Updates', color: '#22c55e' },
  cron: { icon: '⏰', label: 'Scheduled Tasks', color: '#ec4899' },
  general: { icon: '🛡️', label: 'System Health', color: '#6366f1' },
};

const VIPER_CATEGORY_META: Record<string, { icon: string; label: string; color: string }> = {
  misconfig: { icon: '⚙️', label: 'System Weaknesses', color: '#f97316' },
  network: { icon: '🌐', label: 'Network Exposure', color: '#06b6d4' },
  browser: { icon: '🌍', label: 'Browser Security', color: '#8b5cf6' },
  passwords: { icon: '🔐', label: 'Password Safety', color: '#ec4899' },
  code: { icon: '📝', label: 'Secrets & Config', color: '#eab308' },
  general: { icon: '🐍', label: 'General Hardening', color: '#22c55e' },
};

// ── Helpers ──
function scoreColor(score: number | null): string {
  if (score === null) return '#475569';
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#84cc16';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

function severityMeta(sev: string) {
  switch (sev) {
    case 'critical': return { icon: '🚨', color: '#ef4444', bg: '#ef444418' };
    case 'warning': return { icon: '⚠️', color: '#f59e0b', bg: '#f59e0b18' };
    case 'info': return { icon: 'ℹ️', color: '#3b82f6', bg: '#3b82f618' };
    case 'pass': return { icon: '✅', color: '#22c55e', bg: '#22c55e18' };
    default: return { icon: '📋', color: '#64748b', bg: '#64748b18' };
  }
}

function formatAge(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return diffMin + 'm ago';
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + 'h ago';
    return d.toLocaleDateString();
  } catch { return iso; }
}

function truncate(str: string, len: number): string {
  if (!str) return '—';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function eventIcon(type: string): string {
  const m: Record<string, string> = {
    file_access: '📁', network_request: '🌐', exec_command: '💻',
    api_call: '🔌', browser_action: '🌍', permission_denied: '🚫', anomaly: '⚠️',
  };
  return m[type] || '📋';
}

function eventLabel(type: string): string {
  const m: Record<string, string> = {
    file_access: 'tried to read a file', network_request: 'made a network request',
    exec_command: 'ran a command', api_call: 'called an API',
    browser_action: 'opened something in browser', permission_denied: 'was denied access',
    anomaly: 'triggered anomaly detection',
  };
  return m[type] || type;
}

// ── SVG Score Ring ──
function ScoreRing({ score, size = 140, strokeWidth = 10, color, label, icon }: {
  score: number | null;
  size?: number;
  strokeWidth?: number;
  color: string;
  label: string;
  icon: string;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct = score !== null ? score / 100 : 0;
  const dashLen = pct * circ;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={strokeWidth} />
          <circle
            cx={size/2} cy={size/2} r={r} fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dashLen} ${circ}`}
            transform={`rotate(-90 ${size/2} ${size/2})`}
            style={{
              transition: 'stroke-dasharray 1s ease',
              filter: `drop-shadow(0 0 ${size > 100 ? 12 : 6}px ${color}55)`,
            }}
          />
          <text x={size/2} y={size/2 - (size > 100 ? 8 : 4)} textAnchor="middle" fill="white" fontSize={size > 100 ? 36 : 22} fontWeight="bold">
            {score !== null ? score : '—'}
          </text>
          <text x={size/2} y={size/2 + (size > 100 ? 16 : 10)} textAnchor="middle" fill="#64748b" fontSize={size > 100 ? 12 : 10}>
            /100
          </text>
        </svg>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#94a3b8' }}>
        <span>{icon}</span>
        <span>{label}</span>
      </div>
    </div>
  );
}

// ── Category Bar ──
function CategoryBar({ meta, pass, warn, critical, total }: {
  meta: { icon: string; label: string; color: string };
  pass: number;
  warn: number;
  critical: number;
  total: number;
}) {
  const pPct = total > 0 ? (pass / total) * 100 : 0;
  const wPct = total > 0 ? (warn / total) * 100 : 0;
  const cPct = total > 0 ? (critical / total) * 100 : 0;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>{meta.icon}</span>
        <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{meta.label}</span>
        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>
          {pass}✓ {warn > 0 && <span style={{ color: '#f59e0b' }}>{warn}⚠</span>} {critical > 0 && <span style={{ color: '#ef4444' }}>{critical}🚨</span>}
        </span>
      </div>
      <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
        {pPct > 0 && <div style={{ width: pPct + '%', background: '#22c55e', transition: 'width 0.6s ease' }} />}
        {wPct > 0 && <div style={{ width: wPct + '%', background: '#f59e0b', transition: 'width 0.6s ease' }} />}
        {cPct > 0 && <div style={{ width: cPct + '%', background: '#ef4444', transition: 'width 0.6s ease' }} />}
      </div>
    </div>
  );
}

// ── Permission Chip ──
function PermissionChip({ label, value, icon }: { label: string; value: string; icon: string }) {
  const color = value === 'open' || value === 'prompt_all' ? '#f59e0b' : '#22c55e';
  const label2 = value === 'open' ? 'Full Access' : value === 'prompt_all' ? 'Ask First' : value === 'allowlist' ? 'Restricted' : value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{icon}</span>
      <span style={{ color: '#64748b', flex: 1 }}>{label}</span>
      <span style={{ color, fontWeight: 600, fontSize: 12 }}>{label2}</span>
    </div>
  );
}

// ── Tab Type ──
type TabKey = 'overview' | 'activity' | 'aegis' | 'viper' | 'watchtower' | 'permissions' | 'pending';

// ── Component ──
export default function SecurityDashboard() {
  // Data state
  const [overview, setOverview] = useState<RiskOverview | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [prompts, setPrompts] = useState<PermissionPrompt[]>([]);
  const [profiles, setProfiles] = useState<Record<string, AgentProfile>>({});
  const [aegisRuns, setAegisRuns] = useState<AuditRun[]>([]);
  const [aegisFindings, setAegisFindings] = useState<AuditFinding[]>([]);
  const [viperScans, setViperScans] = useState<VulnScan[]>([]);
  const [viperFindings, setViperFindings] = useState<VulnFinding[]>([]);
  const [alerts, setAlerts] = useState<SiemAlert[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [scanning, setScanning] = useState<'aegis' | 'viper' | null>(null);
  const [aegisCategory, setAegisCategory] = useState('');
  const [aegisSeverity, setAegisSeverity] = useState('');
  const [viperCategory, setViperCategory] = useState('');
  const [viperSeverity, setViperSeverity] = useState('');
  const [toasts, setToasts] = useState<Array<{ id: string; title: string; body: string; key: string }>>([]);

  // ── Load all data in parallel ──
  const load = useCallback(async () => {
    try {
      const [ev, pr, ov, aRuns, vScans, aAlerts] = await Promise.all([
        invokeTimeout<SecurityEvent[]>('security_get_events', { limit: 30 }).catch(() => [] as SecurityEvent[]),
        invokeTimeout<PermissionPrompt[]>('security_get_pending_prompts', {}).catch(() => [] as PermissionPrompt[]),
        invokeTimeout<RiskOverview>('siem_get_risk_overview').catch(() => null),
        invokeTimeout<AuditRun[]>('aegis_get_runs', { limit: 5 }).catch(() => [] as AuditRun[]),
        invokeTimeout<VulnScan[]>('viper_get_scans', { limit: 5 }).catch(() => [] as VulnScan[]),
        invokeTimeout<SiemAlert[]>('siem_get_alerts', { status: null, limit: 30 }).catch(() => [] as SiemAlert[]),
      ]);

      setEvents(ev);
      setPrompts(pr);
      setOverview(ov);
      setAegisRuns(aRuns);
      setViperScans(vScans);
      setAlerts(aAlerts);

      // Load Aegis findings for latest run
      if (aRuns.length > 0) {
        const findings = await invokeTimeout<AuditFinding[]>('aegis_get_findings', { runId: aRuns[0].id, category: null }).catch(() => [] as AuditFinding[]);
        setAegisFindings(findings);
      }

      // Load Viper findings for latest scan
      if (vScans.length > 0) {
        const findings = await invokeTimeout<VulnFinding[]>('viper_get_findings', { scanId: vScans[0].id, category: null }).catch(() => [] as VulnFinding[]);
        setViperFindings(findings);
      }

      // Load profiles for all seen agents
      const agentIds = [...new Set([...ev.map(e => e.agent_id), ...pr.map(p => p.agent_id)])];
      const profilesMap: Record<string, AgentProfile> = {};
      for (const id of agentIds) {
        try {
          const profile = await invokeTimeout<AgentProfile>('security_get_profile', { agentId: id });
          profilesMap[id] = profile;
        } catch { /* skip */ }
      }
      setProfiles(profilesMap);
    } catch (err: any) {
      console.error('[Security Hub] Load failed:', err);
      setLoadError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  // Real-time events
  useEffect(() => {
    const unlisten = listen('security:event', (event) => {
      const newEvent = event.payload as SecurityEvent;
      setEvents(prev => [newEvent, ...prev.slice(0, 49)]);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Real-time permission prompts
  useEffect(() => {
    const unlisten = listen<{ title: string; body: string; timestamp: string }>(
      'security:permission_prompt',
      (event) => {
        const toast = {
          id: Date.now().toString(),
          title: event.payload.title,
          body: event.payload.body,
          key: event.payload.timestamp,
        };
        setToasts(prev => {
          if (prev.some(t => t.key === toast.key)) return prev;
          return [...prev, toast];
        });
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toast.id));
        }, 10000);
        setActiveTab('pending');
        load();
      }
    );
    return () => { unlisten.then(fn => fn()); };
  }, [load]);

  // ── Handlers ──
  const handlePrompt = async (id: string, decision: 'allow_once' | 'allow_always' | 'deny_once' | 'deny_always') => {
    try {
      await invokeTimeout('security_resolve_prompt', { promptId: id, decision });
      setPrompts(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('[Security] Prompt resolution failed:', err);
    }
  };

  const handleAlertAction = async (alertId: string, action: 'acknowledge' | 'resolve' | 'dismiss') => {
    try {
      const cmd = 'siem_' + action + '_alert';
      await invokeTimeout(cmd, { alertId });
      setAlerts(prev => prev.map(a =>
        a.id === alertId
          ? { ...a, status: action === 'acknowledge' ? 'acknowledged' : action === 'resolve' ? 'resolved' : 'dismissed' }
          : a
      ));
    } catch (err) {
      console.error('[Security] Alert action failed:', err);
    }
  };

  const handleRunScan = async (type: 'aegis' | 'viper', scanType: 'full' | 'quick') => {
    setScanning(type);
    try {
      if (type === 'aegis') {
        await invokeTimeout('aegis_run_audit', { runType: scanType });
        const runs = await invokeTimeout<AuditRun[]>('aegis_get_runs', { limit: 1 });
        setAegisRuns(runs);
        if (runs.length > 0) {
          const findings = await invokeTimeout<AuditFinding[]>('aegis_get_findings', { runId: runs[0].id, category: null });
          setAegisFindings(findings);
        }
      } else {
        await invokeTimeout('viper_run_scan', { scanType });
        const scans = await invokeTimeout<VulnScan[]>('viper_get_scans', { limit: 1 });
        setViperScans(scans);
        if (scans.length > 0) {
          const findings = await invokeTimeout<VulnFinding[]>('viper_get_findings', { scanId: scans[0].id, category: null });
          setViperFindings(findings);
        }
      }
      // Also refresh overview
      const ov = await invokeTimeout<RiskOverview>('siem_get_risk_overview').catch(() => null);
      if (ov) setOverview(ov);
    } catch (err) {
      console.error('[Security] Scan failed:', err);
    } finally {
      setScanning(null);
    }
  };

  // ── Derived data ──
  const pendingCount = prompts.length;
  const activeAlerts = alerts.filter(a => a.status === 'active');
  const latestAegis = aegisRuns[0] ?? null;
  const latestViper = viperScans[0] ?? null;

  const filteredAegisFindings = aegisFindings
    .filter(f => !aegisCategory || f.category === aegisCategory)
    .filter(f => !aegisSeverity || f.severity === aegisSeverity);

  const filteredViperFindings = viperFindings
    .filter(f => !viperCategory || f.category === viperCategory)
    .filter(f => !viperSeverity || f.severity === viperSeverity);

  const aegisByCategory = aegisFindings.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = { pass: 0, warn: 0, critical: 0, total: 0 };
    acc[f.category].total++;
    if (f.severity === 'pass') acc[f.category].pass++;
    else if (f.severity === 'warning') acc[f.category].warn++;
    else if (f.severity === 'critical') acc[f.category].critical++;
    return acc;
  }, {} as Record<string, { pass: number; warn: number; critical: number; total: number }>);

  const viperByCategory = viperFindings.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = { pass: 0, warn: 0, critical: 0, total: 0 };
    acc[f.category].total++;
    if (f.severity === 'pass') acc[f.category].pass++;
    else if (f.severity === 'warning') acc[f.category].warn++;
    else if (f.severity === 'critical') acc[f.category].critical++;
    return acc;
  }, {} as Record<string, { pass: number; warn: number; critical: number; total: number }>);

  // ── Loading / Error states ──
  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.loading}>
          <div style={s.loadingIcon}>🛡️</div>
          <div style={s.loadingText}>Loading Security Hub...</div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={s.container}>
        <div style={s.errorBox}>
          <div style={{ fontSize: 52 }}>⚠️</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Couldn't load Security Hub</h3>
          <p style={{ fontSize: 14, color: '#f59e0b', margin: 0, maxWidth: 400 }}>{loadError}</p>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Make sure the Conflux engine is running with the latest build.</p>
          <button style={s.retryBtn} onClick={() => { setLoadError(null); setLoading(true); load(); }}>
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  const ovScore = overview?.overall_score ?? (latestAegis?.overall_score ?? null);
  const aegisScore = overview?.aegis_score ?? (latestAegis?.overall_score ?? null);
  const viperRisk = overview?.viper_risk ?? (latestViper?.risk_score ?? null);
  const agentDefense = overview?.agent_defense ?? null;
  const alertCount = overview?.active_alerts ?? activeAlerts.length;

  return (
    <div style={s.container}>
      {/* CSS Animations */}
      <style>{`
        @keyframes secPulseGlow { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes secRadarSweep { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes secFloatParticle { 0%,100%{transform:translateY(0) translateX(0)} 25%{transform:translateY(-6px) translateX(3px)} 50%{transform:translateY(-10px) translateX(-2px)} 75%{transform:translateY(-4px) translateX(5px)} }
        @keyframes secSlideInUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes secScanLine { 0%{left:-100%} 100%{left:100%} }
        @keyframes secFadeInScale { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
        @keyframes secRingPulse { 0%,100%{filter:drop-shadow(0 0 6px var(--glow))} 50%{filter:drop-shadow(0 0 18px var(--glow))} }
        @keyframes secCountUp { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
      `}</style>

      {/* Toast Notifications */}
      {toasts.map(toast => (
        <div key={toast.id} style={s.toast}>
          <div style={s.toastTitle}>🔔 {toast.title}</div>
          <div style={s.toastBody}>{toast.body}</div>
          <div style={s.toastActions}>
            <button
              style={{ ...s.toastBtn, background: '#22c55e', marginRight: 8 }}
              onClick={() => { setActiveTab('pending'); setToasts(prev => prev.filter(t => t.id !== toast.id)); }}
            >
              Review Now
            </button>
            <button
              style={{ ...s.toastBtn, background: '#1e293b' }}
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
            >
              Later
            </button>
          </div>
        </div>
      ))}

      {/* ── Hero Section ── */}
      <div style={s.hero}>
        {/* Background effects */}
        <div style={s.heroBg}>
          <div style={s.radarSweep} />
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              style={{
                ...s.particle,
                left: `${10 + (i * 12)}%`,
                top: `${20 + ((i % 3) * 25)}%`,
                animationDelay: `${i * 0.7}s`,
                animationDuration: `${3 + (i % 3)}s`,
              }}
            />
          ))}
          <div style={s.gridOverlay} />
        </div>

        {/* Main score ring */}
        <div style={s.heroContent}>
          <ScoreRing
            score={ovScore}
            size={140}
            strokeWidth={10}
            color={scoreColor(ovScore)}
            label="Overall Security"
            icon="🔒"
          />

          {/* Satellite rings */}
          <div style={s.satelliteRings}>
            <ScoreRing score={aegisScore} size={80} strokeWidth={6} color="#06b6d4" label="Aegis" icon="🛡️" />
            <ScoreRing score={viperRisk !== null ? 100 - viperRisk : null} size={80} strokeWidth={6} color="#ef4444" label="Viper" icon="🐍" />
            <ScoreRing score={agentDefense} size={80} strokeWidth={6} color="#8b5cf6" label="Agents" icon="🧠" />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: alertCount > 0 ? '#f59e0b15' : '#0f172a',
                border: `6px solid ${alertCount > 0 ? '#f59e0b' : '#1e293b'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                filter: alertCount > 0 ? 'drop-shadow(0 0 8px #f59e0b55)' : 'none',
              }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: alertCount > 0 ? '#f59e0b' : '#475569' }}>
                  {alertCount}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#94a3b8' }}>
                <span>🔔</span>
                <span>Alerts</span>
              </div>
            </div>
          </div>

          {/* Trend badge */}
          {overview && (
            <div style={{
              ...s.trendBadge,
              background: overview.trend === 'improving' ? '#22c55e18' : overview.trend === 'declining' ? '#ef444418' : '#3b82f618',
              color: overview.trend === 'improving' ? '#22c55e' : overview.trend === 'declining' ? '#ef4444' : '#3b82f6',
            }}>
              {overview.trend === 'improving' ? '📈' : overview.trend === 'declining' ? '📉' : '➡️'}
              {' '}{overview.trend}
            </div>
          )}

          {/* Pending badge */}
          {pendingCount > 0 && (
            <button style={s.pendingBadge} onClick={() => setActiveTab('pending')}>
              🔔 {pendingCount} request{pendingCount !== 1 ? 's' : ''} need your approval
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={s.tabs}>
        {([
          { key: 'overview', label: '📊 Overview' },
          { key: 'aegis', label: '🛡️ Aegis' },
          { key: 'viper', label: '🐍 Viper' },
          { key: 'watchtower', label: `👁️ Watchtower (${activeAlerts.length})` },
          { key: 'activity', label: `📋 Activity (${events.length})` },
          { key: 'permissions', label: '🔐 Permissions' },
          { key: 'pending', label: `🔔 Pending (${pendingCount})` },
        ] as Array<{ key: TabKey; label: string }>).map(tab => (
          <button
            key={tab.key}
            style={{ ...s.tab, ...(activeTab === tab.key ? s.tabActive : {}) }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ animation: 'secSlideInUp 0.3s ease' }}>

        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (
          <div>
            {/* Top Risks */}
            {overview && overview.top_risks.length > 0 && (
              <div style={s.section}>
                <h3 style={s.sectionTitle}>⚡ Top Risks</h3>
                {overview.top_risks.map((risk, i) => (
                  <div key={i} style={s.riskItem}>
                    <span style={{ color: '#ef4444', fontWeight: 700, marginRight: 8 }}>{i + 1}.</span>
                    <span style={{ color: '#e2e8f0', fontSize: 13 }}>{risk}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Stats */}
            {overview && (
              <div style={s.section}>
                <h3 style={s.sectionTitle}>📈 Last 24 Hours</h3>
                <div style={s.statsRow}>
                  <div style={s.statCard}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6' }}>{overview.events_24h}</div>
                    <div style={s.statLabel}>Events</div>
                  </div>
                  <div style={s.statCard}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#8b5cf6' }}>{overview.correlations_24h}</div>
                    <div style={s.statLabel}>Correlations</div>
                  </div>
                  <div style={s.statCard}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#ef4444' }}>{overview.critical_alerts}</div>
                    <div style={s.statLabel}>Critical</div>
                  </div>
                  <div style={s.statCard}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b' }}>{overview.active_alerts}</div>
                    <div style={s.statLabel}>Active Alerts</div>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Critical Events */}
            {events.filter(e => e.category === 'critical').length > 0 && (
              <div style={s.section}>
                <h3 style={s.sectionTitle}>🚨 Recent Critical Events</h3>
                {events.filter(e => e.category === 'critical').slice(0, 5).map(e => (
                  <div key={e.id} style={{ ...s.eventRow, borderLeft: '3px solid #ef4444' }}>
                    <span style={{ fontSize: 16 }}>{eventIcon(e.event_type)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#6366f1' }}>{e.agent_id}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{eventLabel(e.event_type)}</span>
                      </div>
                      {e.target && <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>{truncate(e.target, 60)}</div>}
                    </div>
                    <span style={{ fontSize: 11, color: '#475569' }}>{formatAge(e.created_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {!overview && events.filter(e => e.category === 'critical').length === 0 && (
              <div style={s.emptyState}>
                <div style={s.emptyIcon}>✨</div>
                <h3 style={s.emptyTitle}>All Clear</h3>
                <p style={s.emptyText}>No critical issues detected. Your security posture looks solid.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Aegis Tab (inline mini-dashboard) ── */}
        {activeTab === 'aegis' && (
          <div>
            <div style={s.section}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={s.sectionTitle}>🛡️ Aegis — System Audit</h3>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Blue Team: checks your system for unlocked doors and weak settings</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={{ ...s.scanBtn, ...(scanning === 'aegis' ? s.scanBtnDisabled : {}) }}
                    onClick={() => handleRunScan('aegis', 'quick')}
                    disabled={scanning !== null}
                  >
                    ⚡ Quick
                  </button>
                  <button
                    style={{ ...s.scanBtn, background: '#22c55e', borderColor: '#22c55e', ...(scanning === 'aegis' ? s.scanBtnDisabled : {}) }}
                    onClick={() => handleRunScan('aegis', 'full')}
                    disabled={scanning !== null}
                  >
                    {scanning === 'aegis' ? '🔄 Scanning...' : '🔍 Full Scan'}
                  </button>
                </div>
              </div>

              {scanning === 'aegis' && (
                <div style={s.scanningBar}>
                  <div style={s.scanningLine} />
                </div>
              )}

              {latestAegis ? (
                <>
                  {/* Score + Stats */}
                  <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 20 }}>
                    <ScoreRing
                      score={latestAegis.overall_score}
                      size={100}
                      strokeWidth={8}
                      color={scoreColor(latestAegis.overall_score)}
                      label="Score"
                      icon="🛡️"
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                        <span style={{ ...s.miniStat, color: '#22c55e' }}>{latestAegis.pass_count}✓</span>
                        <span style={{ ...s.miniStat, color: '#f59e0b' }}>{latestAegis.warn_count}⚠</span>
                        <span style={{ ...s.miniStat, color: '#ef4444' }}>{latestAegis.critical_count}🚨</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {latestAegis.total_checks} checks · {latestAegis.run_type} scan · {formatAge(latestAegis.started_at)}
                      </div>
                    </div>
                  </div>

                  {/* Category bars */}
                  <div style={{ marginBottom: 16 }}>
                    {Object.entries(AEGIS_CATEGORY_META).map(([key, meta]) => {
                      const stats = aegisByCategory[key];
                      if (!stats) return null;
                      return <CategoryBar key={key} meta={meta} pass={stats.pass} warn={stats.warn} critical={stats.critical} total={stats.total} />;
                    })}
                  </div>

                  {/* Findings filters + list */}
                  {filteredAegisFindings.length > 0 && (
                    <>
                      <div style={s.filterRow}>
                        <select style={s.filterSelect} value={aegisCategory} onChange={e => setAegisCategory(e.target.value)}>
                          <option value="">All categories</option>
                          {Object.entries(AEGIS_CATEGORY_META).map(([k, v]) => (
                            <option key={k} value={k}>{v.icon} {v.label}</option>
                          ))}
                        </select>
                        <select style={s.filterSelect} value={aegisSeverity} onChange={e => setAegisSeverity(e.target.value)}>
                          <option value="">All severities</option>
                          <option value="critical">🚨 Critical</option>
                          <option value="warning">⚠️ Warning</option>
                          <option value="info">ℹ️ Info</option>
                          <option value="pass">✅ Pass</option>
                        </select>
                      </div>
                      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {filteredAegisFindings.map(f => {
                          const sm = severityMeta(f.severity);
                          return (
                            <div key={f.id} style={{ ...s.findingRow, borderLeft: `3px solid ${sm.color}` }}>
                              <span style={{ fontSize: 14 }}>{sm.icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{f.title}</div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{truncate(f.description, 120)}</div>
                              </div>
                              <span style={{ fontSize: 10, color: sm.color, fontWeight: 700, textTransform: 'uppercase' }}>{f.severity}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div style={s.emptyState}>
                  <div style={s.emptyIcon}>🛡️</div>
                  <h3 style={s.emptyTitle}>No Scans Yet</h3>
                  <p style={s.emptyText}>Run your first Aegis scan to check your system for security gaps.</p>
                  <button style={{ ...s.scanBtn, background: '#22c55e', borderColor: '#22c55e' }} onClick={() => handleRunScan('aegis', 'quick')}>
                    🔍 Run First Scan
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Viper Tab (inline mini-dashboard) ── */}
        {activeTab === 'viper' && (
          <div>
            <div style={s.section}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={s.sectionTitle}>🐍 Viper — Vulnerability Scan</h3>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Red Team: hunts for weaknesses attackers could exploit</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={{ ...s.scanBtn, ...(scanning === 'viper' ? s.scanBtnDisabled : {}) }}
                    onClick={() => handleRunScan('viper', 'quick')}
                    disabled={scanning !== null}
                  >
                    ⚡ Quick
                  </button>
                  <button
                    style={{ ...s.scanBtn, background: '#ef4444', borderColor: '#ef4444', ...(scanning === 'viper' ? s.scanBtnDisabled : {}) }}
                    onClick={() => handleRunScan('viper', 'full')}
                    disabled={scanning !== null}
                  >
                    {scanning === 'viper' ? '🔄 Scanning...' : '🔍 Full Scan'}
                  </button>
                </div>
              </div>

              {scanning === 'viper' && (
                <div style={s.scanningBar}>
                  <div style={{ ...s.scanningLine, background: 'linear-gradient(90deg, transparent, #ef4444, transparent)' }} />
                </div>
              )}

              {latestViper ? (
                <>
                  <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 20 }}>
                    <ScoreRing
                      score={latestViper.risk_score}
                      size={100}
                      strokeWidth={8}
                      color={latestViper.risk_score !== null && latestViper.risk_score > 60 ? '#ef4444' : latestViper.risk_score !== null && latestViper.risk_score > 30 ? '#f59e0b' : '#22c55e'}
                      label="Risk Score"
                      icon="🐍"
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                        <span style={{ ...s.miniStat, color: '#22c55e' }}>{latestViper.pass_count}✓</span>
                        <span style={{ ...s.miniStat, color: '#3b82f6' }}>{latestViper.info_count}ℹ</span>
                        <span style={{ ...s.miniStat, color: '#f59e0b' }}>{latestViper.warn_count}⚠</span>
                        <span style={{ ...s.miniStat, color: '#ef4444' }}>{latestViper.critical_count}🚨</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {latestViper.total_checks} checks · {latestViper.scan_type} scan · {formatAge(latestViper.started_at)}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    {Object.entries(VIPER_CATEGORY_META).map(([key, meta]) => {
                      const stats = viperByCategory[key];
                      if (!stats) return null;
                      return <CategoryBar key={key} meta={meta} pass={stats.pass} warn={stats.warn} critical={stats.critical} total={stats.total} />;
                    })}
                  </div>

                  {filteredViperFindings.length > 0 && (
                    <>
                      <div style={s.filterRow}>
                        <select style={s.filterSelect} value={viperCategory} onChange={e => setViperCategory(e.target.value)}>
                          <option value="">All categories</option>
                          {Object.entries(VIPER_CATEGORY_META).map(([k, v]) => (
                            <option key={k} value={k}>{v.icon} {v.label}</option>
                          ))}
                        </select>
                        <select style={s.filterSelect} value={viperSeverity} onChange={e => setViperSeverity(e.target.value)}>
                          <option value="">All severities</option>
                          <option value="critical">🚨 Critical</option>
                          <option value="warning">⚠️ Warning</option>
                          <option value="info">ℹ️ Info</option>
                          <option value="pass">✅ Pass</option>
                        </select>
                      </div>
                      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {filteredViperFindings.map(f => {
                          const sm = severityMeta(f.severity);
                          return (
                            <div key={f.id} style={{ ...s.findingRow, borderLeft: `3px solid ${sm.color}` }}>
                              <span style={{ fontSize: 14 }}>{sm.icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{f.title}</div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{truncate(f.description, 120)}</div>
                                {f.cve_ids && f.cve_ids.length > 0 && (
                                  <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {f.cve_ids.map(cve => (
                                      <a key={cve} href={`https://nvd.nist.gov/vuln/detail/${cve}`} target="_blank" rel="noopener noreferrer"
                                        style={{ fontSize: 10, color: '#3b82f6', textDecoration: 'none', background: '#3b82f618', padding: '1px 6px', borderRadius: 4 }}>
                                        {cve}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <span style={{ fontSize: 10, color: sm.color, fontWeight: 700, textTransform: 'uppercase' }}>{f.severity}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div style={s.emptyState}>
                  <div style={s.emptyIcon}>🐍</div>
                  <h3 style={s.emptyTitle}>No Scans Yet</h3>
                  <p style={s.emptyText}>Run your first Viper scan to find vulnerabilities attackers could exploit.</p>
                  <button style={{ ...s.scanBtn, background: '#ef4444', borderColor: '#ef4444' }} onClick={() => handleRunScan('viper', 'quick')}>
                    🔍 Run First Scan
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Watchtower Tab (SIEM Alerts) ── */}
        {activeTab === 'watchtower' && (
          <div>
            <div style={s.section}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={s.sectionTitle}>👁️ Watchtower — SIEM Alerts</h3>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Cross-correlation engine: correlates events across all security systems</p>
                </div>
                <button
                  style={s.scanBtn}
                  onClick={async () => {
                    try {
                      await invokeTimeout('siem_run_correlation');
                      const freshAlerts = await invokeTimeout<SiemAlert[]>('siem_get_alerts', { status: null, limit: 30 });
                      setAlerts(freshAlerts);
                    } catch (err) { console.error('[SIEM] Correlation failed:', err); }
                  }}
                >
                  🔗 Run Correlation
                </button>
              </div>

              {activeAlerts.length === 0 ? (
                <div style={s.emptyState}>
                  <div style={s.emptyIcon}>✨</div>
                  <h3 style={s.emptyTitle}>No Active Alerts</h3>
                  <p style={s.emptyText}>Watchtower is monitoring. Alerts will appear here when cross-system patterns are detected.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {alerts.filter(a => a.status !== 'dismissed' && a.status !== 'resolved').map(alert => {
                    const sm = severityMeta(alert.severity);
                    return (
                      <div key={alert.id} style={{
                        ...s.alertCard,
                        borderLeft: `4px solid ${sm.color}`,
                        opacity: alert.status === 'acknowledged' ? 0.7 : 1,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <span style={{ fontSize: 18 }}>{sm.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{alert.title}</span>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                background: sm.bg, color: sm.color, textTransform: 'uppercase',
                              }}>
                                {alert.severity}
                              </span>
                              {alert.status === 'acknowledged' && (
                                <span style={{ fontSize: 10, color: '#3b82f6', fontWeight: 600 }}>ACKNOWLEDGED</span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, lineHeight: 1.5 }}>
                              {truncate(alert.description, 200)}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ fontSize: 11, color: '#475569' }}>Source: {alert.source}</span>
                              {alert.agent_id && <span style={{ fontSize: 11, color: '#6366f1' }}>Agent: {alert.agent_id}</span>}
                              <span style={{ fontSize: 11, color: '#475569' }}>{formatAge(alert.created_at)}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            {alert.status === 'active' && (
                              <button style={s.alertBtn} onClick={() => handleAlertAction(alert.id, 'acknowledge')}>
                                👁️ Ack
                              </button>
                            )}
                            <button style={{ ...s.alertBtn, background: '#22c55e22', color: '#22c55e' }} onClick={() => handleAlertAction(alert.id, 'resolve')}>
                              ✅ Resolve
                            </button>
                            <button style={{ ...s.alertBtn, background: '#47556922', color: '#94a3b8' }} onClick={() => handleAlertAction(alert.id, 'dismiss')}>
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Activity Tab (existing) ── */}
        {activeTab === 'activity' && (
          <div>
            {events.length === 0 ? (
              <div style={s.emptyState}>
                <div style={s.emptyIcon}>🛡️</div>
                <h3 style={s.emptyTitle}>No Activity Yet</h3>
                <p style={s.emptyText}>Agent actions will appear here as they happen. Run a scan to generate your first security events.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {events.map(event => (
                  <div key={event.id} style={{
                    ...s.eventRow,
                    borderLeft: `3px solid ${event.category === 'critical' ? '#ef4444' : event.category === 'warning' ? '#f59e0b' : '#22c55e'}`,
                  }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{eventIcon(event.event_type)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#6366f1' }}>{event.agent_id}</span>
                        <span style={{ fontSize: 13, color: '#94a3b8' }}>{eventLabel(event.event_type)}</span>
                        {!event.was_allowed && (
                          <span style={{ background: '#ef444422', color: '#ef4444', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>Denied</span>
                        )}
                      </div>
                      {event.target && (
                        <div style={{ fontSize: 12, color: '#475569', fontFamily: 'monospace', wordBreak: 'break-all' as const }}>{truncate(event.target, 80)}</div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        {event.tool_name && (
                          <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 11, padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>{event.tool_name}</span>
                        )}
                        <span style={{ color: event.category === 'critical' ? '#ef4444' : event.category === 'warning' ? '#f59e0b' : '#22c55e', fontSize: 12, fontWeight: 600 }}>
                          {event.category.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: '#475569' }}>{formatAge(event.created_at)}</span>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, minWidth: 24, textAlign: 'right' as const }}>
                      {event.risk_score > 0 && (
                        <span style={{
                          color: event.risk_score >= 70 ? '#ef4444' : event.risk_score >= 40 ? '#f59e0b' : '#22c55e',
                          fontWeight: 700, fontSize: 14,
                        }}>
                          {event.risk_score}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Permissions Tab (existing) ── */}
        {activeTab === 'permissions' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                Each agent has its own security profile — controls what it can access on your system.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {Object.entries(profiles).map(([agentId, profile]) => (
                <div key={agentId} style={s.profileCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', textTransform: 'capitalize' }}>{agentId}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                      background: profile.sandbox_enabled ? '#22c55e22' : '#ef444422',
                      color: profile.sandbox_enabled ? '#22c55e' : '#ef4444',
                    }}>
                      {profile.sandbox_enabled ? '🛡️ Sandboxed' : '⚠️ Unrestricted'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    <PermissionChip label="Files" value={profile.file_access_mode} icon="📁" />
                    <PermissionChip label="Network" value={profile.network_mode} icon="🌐" />
                    <PermissionChip label="Commands" value={profile.exec_mode} icon="💻" />
                  </div>
                  <div style={{ fontSize: 11, color: '#475569' }}>Anomaly threshold: {profile.anomaly_threshold}/100</div>
                </div>
              ))}
            </div>
            {Object.keys(profiles).length === 0 && (
              <div style={s.emptyState}>
                <div style={s.emptyIcon}>🤖</div>
                <h3 style={s.emptyTitle}>No Agents Configured</h3>
                <p style={s.emptyText}>Add agents through the Agents app and their security profiles will appear here.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Pending Tab (existing) ── */}
        {activeTab === 'pending' && (
          <div>
            {prompts.length === 0 ? (
              <div style={s.emptyState}>
                <div style={s.emptyIcon}>✅</div>
                <h3 style={s.emptyTitle}>All Clear</h3>
                <p style={s.emptyText}>No pending permission requests. Your agents are operating within their allowed boundaries.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {prompts.map(prompt => (
                  <div key={prompt.id} style={s.promptCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <span style={{ fontSize: 28 }}>{prompt.agent_emoji}</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', display: 'block' }}>{prompt.agent_name}</span>
                        <span style={{ fontSize: 11, color: '#475569' }}>ID: {prompt.agent_id}</span>
                      </div>
                      <span style={{ fontSize: 12, color: '#475569' }}>{formatAge(prompt.created_at)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 14 }}>
                      <span style={{ color: '#94a3b8' }}>wants to</span>
                      <code style={{ background: '#1e293b', color: '#22c55e', padding: '2px 8px', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}>
                        {prompt.tool_name || prompt.request_type}
                      </code>
                      <span style={{ color: '#94a3b8' }}>this:</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#cbd5e1', background: '#020617', borderRadius: 6, padding: '8px 12px', marginBottom: 14, wordBreak: 'break-all' as const, fontFamily: 'monospace' }}>
                      "{truncate(prompt.target, 80)}"
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                      <button style={{ ...s.promptBtn, background: '#22c55e' }} onClick={() => handlePrompt(prompt.id, 'allow_once')}>✓ Allow Once</button>
                      <button style={{ ...s.promptBtn, background: '#3b82f6' }} onClick={() => handlePrompt(prompt.id, 'allow_always')}>✓ Always Allow</button>
                      <button style={{ ...s.promptBtn, background: '#f59e0b' }} onClick={() => handlePrompt(prompt.id, 'deny_once')}>✗ Deny Once</button>
                      <button style={{ ...s.promptBtn, background: '#ef4444' }} onClick={() => handlePrompt(prompt.id, 'deny_always')}>✗ Always Block</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}


// ── Styles ──
const s: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    maxWidth: '900px',
    margin: '0 auto',
    color: '#e2e8f0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    position: 'relative',
  },
  loading: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '60vh', gap: 12,
  },
  loadingIcon: { fontSize: 48, animation: 'pulse 2s infinite' },
  loadingText: { color: '#64748b', fontSize: 15 },
  errorBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '48px 24px', textAlign: 'center', gap: 12,
  },
  retryBtn: {
    marginTop: 8, padding: '9px 20px', background: '#1e293b', border: '1px solid #334155',
    borderRadius: 8, color: '#e2e8f0', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },

  // Hero
  hero: {
    position: 'relative',
    background: 'linear-gradient(135deg, #0a0f1a 0%, #0f172a 50%, #0a0f1a 100%)',
    border: '1px solid #1e293b',
    borderRadius: 16,
    padding: '32px 24px',
    marginBottom: 20,
    overflow: 'hidden',
  },
  heroBg: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    overflow: 'hidden', pointerEvents: 'none',
  },
  radarSweep: {
    position: 'absolute', top: '50%', left: '50%',
    width: 300, height: 300,
    marginLeft: -150, marginTop: -150,
    background: 'conic-gradient(from 0deg, transparent 0deg, rgba(34, 197, 94, 0.06) 30deg, transparent 60deg)',
    borderRadius: '50%',
    animation: 'secRadarSweep 8s linear infinite',
  },
  particle: {
    position: 'absolute',
    width: 3, height: 3,
    background: '#22c55e',
    borderRadius: '50%',
    opacity: 0.4,
    animation: 'secFloatParticle 4s ease-in-out infinite',
  },
  gridOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundImage: 'linear-gradient(rgba(30, 41, 59, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(30, 41, 59, 0.15) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
    opacity: 0.3,
  },
  heroContent: {
    position: 'relative', zIndex: 1,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
  },
  satelliteRings: {
    display: 'flex', gap: 24, flexWrap: 'wrap' as const, justifyContent: 'center',
  },
  trendBadge: {
    fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
    textTransform: 'capitalize' as const,
  },
  pendingBadge: {
    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
    color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },

  // Tabs
  tabs: {
    display: 'flex', gap: 4, marginBottom: 16,
    borderBottom: '1px solid #1e293b', paddingBottom: 12,
    overflowX: 'auto' as const,
  },
  tab: {
    background: 'transparent', color: '#64748b', border: 'none',
    padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
    fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' as const,
  },
  tabActive: {
    background: '#1e293b', color: '#f1f5f9',
  },

  // Sections
  section: {
    background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12,
    padding: 20, marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15, fontWeight: 700, color: '#f1f5f9', margin: '0 0 12px 0',
  },

  // Stats
  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
  },
  statCard: {
    background: '#020617', border: '1px solid #1e293b', borderRadius: 10,
    padding: 16, textAlign: 'center' as const,
  },
  statLabel: {
    fontSize: 11, color: '#64748b', marginTop: 4, textTransform: 'uppercase' as const, fontWeight: 600,
  },
  miniStat: {
    fontSize: 14, fontWeight: 700,
  },

  // Risk items
  riskItem: {
    display: 'flex', alignItems: 'center', padding: '8px 12px',
    background: '#020617', borderRadius: 8, marginBottom: 4,
  },

  // Events
  eventRow: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '10px 14px', background: '#0f172a', borderRadius: 8,
  },

  // Findings
  findingRow: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '10px 12px', background: '#0f172a', borderRadius: 6, marginBottom: 4,
  },

  // Filters
  filterRow: {
    display: 'flex', gap: 8, marginBottom: 12,
  },
  filterSelect: {
    background: '#020617', color: '#e2e8f0', border: '1px solid #1e293b',
    borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
  },

  // Scanning
  scanningBar: {
    height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden', marginBottom: 16,
    position: 'relative' as const,
  },
  scanningLine: {
    position: 'absolute' as const, top: 0, width: '40%', height: '100%',
    background: 'linear-gradient(90deg, transparent, #06b6d4, transparent)',
    animation: 'secScanLine 1.5s ease-in-out infinite',
  },

  // Scan buttons
  scanBtn: {
    background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155',
    borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', transition: 'opacity 0.15s',
  },
  scanBtnDisabled: {
    opacity: 0.5, cursor: 'not-allowed',
  },

  // Alert cards
  alertCard: {
    background: '#0f172a', border: '1px solid #1e293b',
    borderRadius: 10, padding: 16,
  },
  alertBtn: {
    background: '#3b82f622', color: '#3b82f6', border: 'none',
    borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
  },

  // Profile cards
  profileCard: {
    background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 16,
  },

  // Prompt cards
  promptCard: {
    background: '#0f172a', border: '1px solid #1e293b', borderLeft: '4px solid #f59e0b',
    borderRadius: 12, padding: 20,
  },
  promptBtn: {
    padding: '7px 16px', border: 'none', borderRadius: 7, color: 'white',
    cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'opacity 0.15s',
  },

  // Empty state
  emptyState: {
    textAlign: 'center' as const, padding: '48px 24px',
  },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#64748b', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 },

  // Toast
  toast: {
    position: 'fixed' as const, top: 24, right: 24, zIndex: 9999, width: 340,
    background: 'linear-gradient(135deg, #1e293b, #0f172a)',
    border: '1px solid #22c55e55', borderRadius: 14, padding: '16px 18px',
    boxShadow: '0 8px 32px rgba(34, 197, 94, 0.25), 0 0 0 1px rgba(34, 197, 94, 0.1)',
    animation: 'secSlideInUp 0.3s ease',
  },
  toastTitle: { fontSize: 15, fontWeight: 700, color: '#22c55e', marginBottom: 6 },
  toastBody: { fontSize: 13, color: '#94a3b8', marginBottom: 12, lineHeight: 1.5 },
  toastActions: { display: 'flex', gap: 8 },
  toastBtn: {
    flex: 1, padding: '7px 0', border: 'none', borderRadius: 7, color: 'white',
    cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'opacity 0.15s',
  },
};
