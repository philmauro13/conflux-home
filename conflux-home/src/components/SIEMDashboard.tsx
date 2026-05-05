// Conflux Home — Watchtower Dashboard (Consumer Redesign)
// Mission 1224: Security SIEM — Real-time eyes on everything

import React, { useState, useEffect, useCallback } from 'react';

// ── Timeout wrapper — prevents invoke calls from hanging forever ──
function invokeTimeout<T>(cmd: string, args?: Record<string, unknown>, ms = 5000): Promise<T> {
  return Promise.race([
    invoke<T>(cmd, args),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Command '${cmd}' timed out after ${ms}ms`)), ms)
    ),
  ]);
}
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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

// ── Severity ──

function severityMeta(severity: string) {
  switch (severity) {
    case 'critical': return { icon: '🚨', label: 'Critical', color: '#ef4444', bg: '#ef444418' };
    case 'warning': return { icon: '⚠️', label: 'Warning', color: '#f59e0b', bg: '#f59e0b18' };
    case 'info': return { icon: 'ℹ️', label: 'Info', color: '#3b82f6', bg: '#3b82f618' };
    default: return { icon: '📋', label: severity, color: '#64748b', bg: '#64748b18' };
  }
}

function overallLabel(score: number): string {
  if (score >= 80) return 'Healthy — all clear';
  if (score >= 60) return 'Good — minor issues';
  if (score >= 40) return 'Fair — some concerns';
  return 'At Risk — action needed';
}

function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#84cc16';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

// ── Component ──

export default function SIEMDashboard() {
  const [overview, setOverview] = useState<RiskOverview | null>(null);
  const [alerts, setAlerts] = useState<SiemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts'>('overview');

  const load = useCallback(async () => {
    try {
      const [overviewData, alertsData] = await Promise.all([
        invoke<RiskOverview>('siem_get_risk_overview'),
        invoke<SiemAlert[]>('siem_get_alerts', { status: null, limit: 50 }),
      ]);
      setOverview(overviewData);
      setAlerts(alertsData);
    } catch (err) {
      console.error('[SIEM] Load failed:', err);
      // Try without alerts
      try {
        const overviewData = await invoke<RiskOverview>('siem_get_risk_overview');
        setOverview(overviewData);
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  // Real-time: listen for new security events
  useEffect(() => {
    const unlisten = listen('security:event', (event) => {
      const newEvent = event.payload as any;
      if (newEvent.category === 'critical') {
        setOverview(prev => prev ? {
          ...prev,
          events_24h: prev.events_24h + 1,
          critical_alerts: prev.critical_alerts + 1,
        } : prev);
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const handleRunCorrelation = async () => {
    try {
      await invokeTimeout('siem_run_correlation');
      await load();
    } catch (err) {
      console.error('[SIEM] Correlation failed:', err);
    }
  };

  const handleAlertAction = async (alertId: string, action: 'acknowledge' | 'resolve' | 'dismiss') => {
    try {
      if (action === 'acknowledge') await invokeTimeout('siem_acknowledge_alert', { alertId });
      if (action === 'resolve') await invokeTimeout('siem_resolve_alert', { alertId });
      if (action === 'dismiss') await invokeTimeout('siem_dismiss_alert', { alertId });
      await load();
    } catch (err) {
      console.error('[SIEM] Alert action failed:', err);
    }
  };

  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.loading}>
          <div style={s.loadingIcon}>📡</div>
          <div style={s.loadingText}>Connecting to Watchtower...</div>
        </div>
      </div>
    );
  }

  const score = overview?.overall_score ?? 50;
  const criticalCount = overview?.critical_alerts ?? 0;
  const activeAlerts = overview?.active_alerts ?? 0;
  const events24h = overview?.events_24h ?? 0;

  return (
    <div style={s.container}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerIcon}>📡</span>
          <div>
            <h1 style={s.title}>Watchtower</h1>
            <p style={s.subtitle}>Real-time eyes on all agent activity — what's happening right now</p>
          </div>
        </div>
        <button style={s.correlateBtn} onClick={handleRunCorrelation}>
          🔄 Run Correlation
        </button>
      </div>

      {/* ── Hero Overview ── */}
      <div style={s.heroCard}>
        <div style={s.heroLeft}>
          <div style={s.heroRing}>
            <svg width="110" height="110" viewBox="0 0 110 110">
              <circle cx="55" cy="55" r="48" fill="none" stroke="#1e293b" strokeWidth="7" />
              <circle
                cx="55" cy="55" r="48" fill="none"
                stroke={scoreColor(score)}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 301.59} 301.59`}
                transform="rotate(-90 55 55)"
                style={{ transition: 'stroke-dasharray 0.8s ease' }}
              />
              <text x="55" y="52" textAnchor="middle" fill={scoreColor(score)} fontSize="28" fontWeight="bold">
                {score}
              </text>
              <text x="55" y="68" textAnchor="middle" fill="#64748b" fontSize="10">SECURITY</text>
            </svg>
          </div>
          <div>
            <div style={{ ...s.heroLabel, color: scoreColor(score) }}>
              {overallLabel(score)}
            </div>
            <div style={s.heroSub}>
              {events24h} events in last 24h · Last correlation: {overview?.trend ?? 'unknown'}
            </div>
            {criticalCount > 0 && (
              <div style={s.heroAlert}>
                🚨 {criticalCount} critical alert{criticalCount !== 1 ? 's' : ''} need attention
              </div>
            )}
            {activeAlerts > 0 && criticalCount === 0 && (
              <div style={s.heroWarning}>
                ⚠️ {activeAlerts} active alert{activeAlerts !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        <div style={s.heroStats}>
          <div style={{ ...s.statChip, borderColor: '#22c55e' }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>🛡️</span>
            <span style={s.statLabel}>Aegis Score</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>{overview?.aegis_score ?? '—'}</span>
          </div>
          <div style={{ ...s.statChip, borderColor: '#ef4444' }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>🐍</span>
            <span style={s.statLabel}>Viper Risk</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{overview?.viper_risk ?? '—'}</span>
          </div>
          <div style={{ ...s.statChip, borderColor: '#f59e0b' }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>⚔️</span>
            <span style={s.statLabel}>Agent Defense</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>{overview?.agent_defense ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* ── What's Being Monitored ── */}
      <div style={s.monitorGrid}>
        <div style={s.monitorCard}>
          <div style={s.monitorIcon}>🛡️</div>
          <div>
            <div style={s.monitorLabel}>Aegis</div>
            <div style={s.monitorSub}>System hardening checks</div>
          </div>
          <div style={{ ...s.monitorScore, color: scoreColor(overview?.aegis_score ?? 50) }}>
            {overview?.aegis_score ?? '—'}/100
          </div>
        </div>
        <div style={s.monitorCard}>
          <div style={s.monitorIcon}>🐍</div>
          <div>
            <div style={s.monitorLabel}>Viper</div>
            <div style={s.monitorSub}>Vulnerability scanning</div>
          </div>
          <div style={{ ...s.monitorScore, color: scoreColor(100 - (overview?.viper_risk ?? 50)) }}>
            {overview?.viper_risk ?? '—'} risk
          </div>
        </div>
        <div style={s.monitorCard}>
          <div style={s.monitorIcon}>⚔️</div>
          <div>
            <div style={s.monitorLabel}>Agent Armor</div>
            <div style={s.monitorSub}>Red team vs. agents</div>
          </div>
          <div style={{ ...s.monitorScore, color: scoreColor(overview?.agent_defense ?? 50) }}>
            {overview?.agent_defense ?? '—'}/100
          </div>
        </div>
        <div style={s.monitorCard}>
          <div style={s.monitorIcon}>🔔</div>
          <div>
            <div style={s.monitorLabel}>Anomaly Detection</div>
            <div style={s.monitorSub}>Unusual pattern monitoring</div>
          </div>
          <div style={{ ...s.monitorScore, color: activeAlerts > 0 ? '#f59e0b' : '#22c55e' }}>
            {activeAlerts > 0 ? `${activeAlerts} active` : '✓ Clear'}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(activeTab === 'overview' ? s.tabActive : {}) }} onClick={() => setActiveTab('overview')}>
          📊 Risk Overview
        </button>
        <button style={{ ...s.tab, ...(activeTab === 'alerts' ? s.tabActive : {}) }} onClick={() => setActiveTab('alerts')}>
          🔔 Alerts ({alerts.length})
        </button>
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div style={s.overviewContent}>
          {overview?.top_risks && overview.top_risks.length > 0 && (
            <div style={s.risksSection}>
              <h3 style={s.risksTitle}>🚨 Top Risks Detected</h3>
              <div style={s.risksList}>
                {overview.top_risks.map((risk, i) => (
                  <div key={i} style={s.riskItem}>• {risk}</div>
                ))}
              </div>
            </div>
          )}
          {(!overview?.top_risks || overview.top_risks.length === 0) && (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>✅</div>
              <h3 style={s.emptyTitle}>All Clear</h3>
              <p style={s.emptyText}>No active risks detected. Watchtower is monitoring all systems — run Aegis, Viper, or Agent Armor for more detail.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Alerts Tab ── */}
      {activeTab === 'alerts' && (
        <div style={s.alertsList}>
          {alerts.length === 0 && (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>🔔</div>
              <h3 style={s.emptyTitle}>No Alerts</h3>
              <p style={s.emptyText}>All quiet. Watchtower will alert you when something needs attention.</p>
            </div>
          )}
          {alerts.map(alert => {
            const meta = severityMeta(alert.severity);
            return (
              <div key={alert.id} style={{ ...s.alertCard, borderLeft: `3px solid ${meta.color}` }}>
                <div style={s.alertHeader}>
                  <div style={s.alertLeft}>
                    <span style={s.alertIcon}>{meta.icon}</span>
                    <div>
                      <div style={s.alertTitle}>{alert.title}</div>
                      <div style={s.alertMeta}>
                        <span style={{ color: meta.color }}>{meta.label}</span>
                        · {alert.source} · {formatAge(alert.created_at)}
                        {alert.agent_id && <span> · Agent: {alert.agent_id}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={s.alertActions}>
                    {alert.status === 'active' && (
                      <>
                        <button style={{ ...s.alertBtn, color: '#f59e0b', borderColor: '#f59e0b44' }} onClick={() => handleAlertAction(alert.id, 'acknowledge')}>Acknowledge</button>
                        <button style={{ ...s.alertBtn, color: '#22c55e', borderColor: '#22c55e44' }} onClick={() => handleAlertAction(alert.id, 'resolve')}>Resolve</button>
                      </>
                    )}
                    {alert.status === 'acknowledged' && (
                      <button style={{ ...s.alertBtn, color: '#22c55e', borderColor: '#22c55e44' }} onClick={() => handleAlertAction(alert.id, 'resolve')}>Mark Resolved</button>
                    )}
                    {alert.status !== 'resolved' && (
                      <button style={{ ...s.alertBtn, color: '#64748b', borderColor: '#334155' }} onClick={() => handleAlertAction(alert.id, 'dismiss')}>Dismiss</button>
                    )}
                    {alert.status === 'resolved' && (
                      <span style={s.resolvedBadge}>✓ Resolved</span>
                    )}
                  </div>
                </div>
                <div style={s.alertDesc}>{alert.description}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

function formatAge(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString();
  } catch { return iso; }
}

// ── Styles ──

const s: Record<string, React.CSSProperties> = {
  container: { padding: '24px 28px', maxWidth: '900px', margin: '0 auto', color: '#e2e8f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 },
  loadingIcon: { fontSize: 56, animation: 'pulse 2s infinite' },
  loadingText: { color: '#64748b', fontSize: 15 },

  // Header
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerIcon: { fontSize: 36 },
  title: { fontSize: 26, fontWeight: 700, margin: 0, color: '#f1f5f9' },
  subtitle: { fontSize: 14, color: '#64748b', margin: '2px 0 0 0' },
  correlateBtn: { padding: '9px 18px', background: '#1e293b', border: '1px solid #8b5cf6', borderRadius: 8, color: '#e2e8f0', cursor: 'pointer', fontSize: 14, fontWeight: 600 },

  // Hero
  heroCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '24px 28px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' as const },
  heroLeft: { display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 0 },
  heroRing: { flexShrink: 0 },
  heroLabel: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  heroSub: { fontSize: 13, color: '#64748b', marginTop: 4 },
  heroAlert: { marginTop: 8, fontSize: 13, color: '#ef4444', background: '#ef444418', borderRadius: 6, padding: '4px 10px', display: 'inline-block', fontWeight: 600 },
  heroWarning: { marginTop: 8, fontSize: 13, color: '#f59e0b', background: '#f59e0b18', borderRadius: 6, padding: '4px 10px', display: 'inline-block' },
  heroStats: { display: 'flex', gap: 10 },
  statChip: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '10px 14px', background: '#0f172a', border: '1px solid', borderRadius: 10, minWidth: 80 },
  statLabel: { fontSize: 10, color: '#64748b', marginTop: 4, textAlign: 'center' as const },

  // Monitor Grid
  monitorGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 16 },
  monitorCard: { display: 'flex', alignItems: 'center', gap: 10, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '12px 14px' },
  monitorIcon: { fontSize: 22, flexShrink: 0 },
  monitorLabel: { fontSize: 14, fontWeight: 600, color: '#f1f5f9' },
  monitorSub: { fontSize: 11, color: '#64748b' },
  monitorScore: { marginLeft: 'auto', fontSize: 16, fontWeight: 700, flexShrink: 0 },

  // Tabs
  tabs: { display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #1e293b', paddingBottom: 12 },
  tab: { padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: '#64748b', cursor: 'pointer', fontSize: 14, fontWeight: 500, borderRadius: 6 },
  tabActive: { color: '#f1f5f9', borderBottomColor: '#8b5cf6', background: '#1e293b' },

  // Overview
  overviewContent: {},
  risksSection: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 16 },
  risksTitle: { fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 10 },
  risksList: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  riskItem: { fontSize: 13, color: '#94a3b8', lineHeight: 1.5 },

  // Alerts
  alertsList: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  alertCard: { background: '#0f172a', borderRadius: 10, padding: '12px 16px' },
  alertHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  alertLeft: { display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 },
  alertIcon: { fontSize: 20, flexShrink: 0 },
  alertTitle: { fontSize: 14, fontWeight: 500, color: '#e2e8f0' },
  alertMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  alertActions: { display: 'flex', gap: 6, flexShrink: 0 },
  alertBtn: { padding: '4px 10px', background: 'transparent', border: '1px solid', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  resolvedBadge: { fontSize: 12, color: '#22c55e', fontWeight: 600 },
  alertDesc: { fontSize: 13, color: '#94a3b8', lineHeight: 1.5, paddingLeft: 30 },

  // Empty
  emptyState: { textAlign: 'center' as const, padding: '48px 24px' },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#64748b', lineHeight: 1.5 },
};
