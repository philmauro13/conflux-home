// Conflux Home — Aegis System Audit Dashboard (Consumer Redesign)
// Mission 1224: Blue Team Guardian — Made human-readable

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

// ── Types ──

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

// ── Plain-Language Category Mapping ──

const CATEGORY_META: Record<string, { icon: string; label: string; color: string; tagline: string }> = {
  firewall: { icon: '🧱', label: 'Firewall', color: '#f97316', tagline: 'Your first line of defense — blocks unauthorized access' },
  ports: { icon: '🔌', label: 'Open Ports', color: '#06b6d4', tagline: 'Doorways into your system from the network' },
  ssh: { icon: '🔑', label: 'Remote Access', color: '#eab308', tagline: 'How you connect to this machine remotely' },
  permissions: { icon: '📂', label: 'File Permissions', color: '#8b5cf6', tagline: 'Who can read, write, or run files on your system' },
  software: { icon: '📦', label: 'Software Updates', color: '#22c55e', tagline: 'Keeping your programs up to date closes security holes' },
  cron: { icon: '⏰', label: 'Scheduled Tasks', color: '#ec4899', tagline: 'Automatic jobs running in the background' },
  general: { icon: '🛡️', label: 'System Health', color: '#6366f1', tagline: 'General hardening and best practices' },
};

// ── Severity Helpers ──

function severityMeta(severity: string) {
  switch (severity) {
    case 'critical': return { icon: '🚨', label: 'Critical', color: '#ef4444', bg: '#ef444418' };
    case 'warning': return { icon: '⚠️', label: 'Warning', color: '#f59e0b', bg: '#f59e0b18' };
    case 'info': return { icon: 'ℹ️', label: 'FYI', color: '#3b82f6', bg: '#3b82f618' };
    case 'pass': return { icon: '✅', label: 'Good', color: '#22c55e', bg: '#22c55e18' };
    default: return { icon: '📋', label: 'Unknown', color: '#64748b', bg: '#64748b18' };
  }
}

function scoreLabel(score: number | null): string {
  if (score === null) return 'No scan yet';
  if (score >= 90) return 'Excellent — well hardened';
  if (score >= 75) return 'Good — minor improvements possible';
  if (score >= 50) return 'Fair — some issues need attention';
  return 'At Risk — action recommended';
}

// ── Component ──

export default function AegisDashboard() {
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<AuditRun | null>(null);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'history'>('overview');

  const loadRuns = useCallback(async () => {
    try {
      const data = await invoke<AuditRun[]>('aegis_get_runs', { limit: 20 });
      setRuns(data);
      if (data.length > 0 && !selectedRun) setSelectedRun(data[0]);
    } catch (err) {
      console.error('[Aegis] Failed to load runs:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedRun]);

  const loadFindings = useCallback(async () => {
    if (!selectedRun) return;
    try {
      const data = await invoke<AuditFinding[]>('aegis_get_findings', {
        runId: selectedRun.id,
        category: filterCategory || undefined,
      });
      setFindings(data);
    } catch (err) {
      console.error('[Aegis] Failed to load findings:', err);
    }
  }, [selectedRun, filterCategory]);

  useEffect(() => { loadRuns(); }, [loadRuns]);
  useEffect(() => { loadFindings(); }, [loadFindings]);

  const handleRunAudit = async (runType: 'full' | 'quick') => {
    setScanning(true);
    try {
      const runId = await invoke<string>('aegis_run_audit', { runType });
      console.log('[Aegis] Audit complete:', runId);
      await loadRuns();
      const data = await invoke<AuditRun[]>('aegis_get_runs', { limit: 1 });
      if (data.length > 0) setSelectedRun(data[0]);
    } catch (err) {
      console.error('[Aegis] Audit failed:', err);
    } finally {
      setScanning(false);
    }
  };

  const filteredFindings = filterSeverity
    ? findings.filter((f) => f.severity === filterSeverity)
    : findings;

  const findingsByCategory = findings.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {} as Record<string, AuditFinding[]>);

  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.loading}>
          <div style={s.loadingIcon}>🛡️</div>
          <div style={s.loadingText}>Running system audit...</div>
        </div>
      </div>
    );
  }

  const score = selectedRun?.overall_score ?? null;
  const criticalCount = selectedRun?.critical_count ?? 0;
  const warnCount = selectedRun?.warn_count ?? 0;
  const passCount = selectedRun?.pass_count ?? 0;

  return (
    <div style={s.container}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerIcon}>🛡️</span>
          <div>
            <h1 style={s.title}>Aegis</h1>
            <p style={s.subtitle}>System Health Check — is your computer secure?</p>
          </div>
        </div>
        <div style={s.headerRight}>
          <button
            style={{ ...s.scanBtn, ...(scanning ? s.scanBtnDisabled : {}) }}
            onClick={() => handleRunAudit('quick')}
            disabled={scanning}
          >
            ⚡ Quick Scan
          </button>
          <button
            style={{ ...s.scanBtn, background: '#22c55e', borderColor: '#22c55e', ...(scanning ? s.scanBtnDisabled : {}) }}
            onClick={() => handleRunAudit('full')}
            disabled={scanning}
          >
            {scanning ? '🔄 Scanning...' : '🔍 Full System Check'}
          </button>
        </div>
      </div>

      {/* ── Hero Score Card ── */}
      {selectedRun && (
        <div style={s.heroScore}>
          <div style={s.heroLeft}>
            <div style={s.heroRing}>
              <svg width="110" height="110" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r="48" fill="none" stroke="#1e293b" strokeWidth="7" />
                <circle
                  cx="55" cy="55" r="48" fill="none"
                  stroke={scoreColor(score)}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${((score ?? 0) / 100) * 301.59} 301.59`}
                  transform="rotate(-90 55 55)"
                  style={{ transition: 'stroke-dasharray 0.8s ease' }}
                />
                <text x="55" y="50" textAnchor="middle" fill="white" fontSize="32" fontWeight="bold">
                  {score ?? '—'}
                </text>
                <text x="55" y="70" textAnchor="middle" fill="#64748b" fontSize="11">
                  /100
                </text>
              </svg>
            </div>
            <div style={s.heroInfo}>
              <div style={{ ...s.heroLabel, color: scoreColor(score) }}>
                {scoreLabel(score)}
              </div>
              <div style={s.heroSub}>
                {selectedRun.total_checks} checks run · Last scan {formatAge(selectedRun.started_at)}
              </div>
              {criticalCount === 0 && warnCount === 0 && (
                <div style={s.heroGood}>
                  ✨ No issues found — your system looks solid
                </div>
              )}
            </div>
          </div>

          <div style={s.heroStats}>
            <div style={{ ...s.statChip, borderColor: '#22c55e' }}>
              <span style={{ ...s.statNum, color: '#22c55e' }}>{passCount}</span>
              <span style={s.statLabel}>Checks Passed</span>
            </div>
            {warnCount > 0 && (
              <div style={{ ...s.statChip, borderColor: '#f59e0b' }}>
                <span style={{ ...s.statNum, color: '#f59e0b' }}>{warnCount}</span>
                <span style={s.statLabel}>Warnings</span>
              </div>
            )}
            {criticalCount > 0 && (
              <div style={{ ...s.statChip, borderColor: '#ef4444' }}>
                <span style={{ ...s.statNum, color: '#ef4444' }}>{criticalCount}</span>
                <span style={s.statLabel}>Critical</span>
              </div>
            )}
          </div>
        </div>
      )}

      {!selectedRun && (
        <div style={s.noScan}>
          <div style={s.noScanIcon}>🛡️</div>
          <h3 style={s.noScanTitle}>No Scan Yet</h3>
          <p style={s.noScanText}>
            Aegis checks your system for unlocked doors — weak settings, open ports, outdated software, and other security gaps.
          </p>
          <button style={{ ...s.scanBtn, background: '#22c55e', borderColor: '#22c55e' }} onClick={() => handleRunAudit('quick')}>
            🔍 Run Your First Scan
          </button>
        </div>
      )}

      {/* ── Tabs ── */}
      {selectedRun && (
        <div style={s.tabs}>
          {[
            { key: 'overview', label: `📋 Category Overview` },
            { key: 'details', label: `🔍 All Findings (${filteredFindings.length})` },
            { key: 'history', label: `📜 Scan History (${runs.length})` },
          ].map(tab => (
            <button
              key={tab.key}
              style={{ ...s.tab, ...(activeTab === tab.key ? s.tabActive : {}) }}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Tab Content ── */}
      {selectedRun && activeTab === 'overview' && (
        <OverviewTab findingsByCategory={findingsByCategory} />
      )}
      {selectedRun && activeTab === 'details' && (
        <DetailsTab
          findings={filteredFindings}
          filterCategory={filterCategory}
          filterSeverity={filterSeverity}
          onFilterCategory={setFilterCategory}
          onFilterSeverity={setFilterSeverity}
        />
      )}
      {selectedRun && activeTab === 'history' && (
        <HistoryTab runs={runs} selectedRun={selectedRun} onSelect={setSelectedRun} onLoadFindings={() => { loadFindings(); }} />
      )}
    </div>
  );
}

// ── Overview Tab ──

function OverviewTab({ findingsByCategory }: { findingsByCategory: Record<string, AuditFinding[]> }) {
  const categories = Object.keys(findingsByCategory).sort();

  if (categories.length === 0) {
    return (
      <div style={s.emptyState}>
        <div style={s.emptyIcon}>✅</div>
        <h3 style={s.emptyTitle}>All Clear</h3>
        <p style={s.emptyText}>No findings in the last scan. Your system passed all checks.</p>
      </div>
    );
  }

  return (
    <div style={s.catGrid}>
      {categories.map(cat => {
        const meta = CATEGORY_META[cat] ?? { icon: '📋', label: cat, color: '#6366f1', tagline: '' };
        const catFindings = findingsByCategory[cat];
        const critical = catFindings.filter(f => f.severity === 'critical').length;
        const warnings = catFindings.filter(f => f.severity === 'warning').length;
        const passes = catFindings.filter(f => f.severity === 'pass').length;
        const infos = catFindings.filter(f => f.severity === 'info').length;
        const overall = critical > 0 ? '🚨' : warnings > 0 ? '⚠️' : '✅';

        return (
          <div key={cat} style={s.catCard}>
            <div style={s.catCardHeader}>
              <div style={s.catIconWrap}>
                <span style={s.catIcon}>{meta.icon}</span>
              </div>
              <div style={s.catTitleGroup}>
                <h3 style={s.catTitle}>{meta.label}</h3>
                <p style={s.catTagline}>{meta.tagline}</p>
              </div>
              <div style={s.catBadge}>{overall}</div>
            </div>

            <div style={s.catCounts}>
              {passes > 0 && <span style={{ ...s.catCountChip, color: '#22c55e', borderColor: '#22c55e44', background: '#22c55e18' }}>✅ {passes} passed</span>}
              {infos > 0 && <span style={{ ...s.catCountChip, color: '#3b82f6', borderColor: '#3b82f644', background: '#3b82f618' }}>ℹ️ {infos} info</span>}
              {warnings > 0 && <span style={{ ...s.catCountChip, color: '#f59e0b', borderColor: '#f59e0b44', background: '#f59e0b18' }}>⚠️ {warnings} warnings</span>}
              {critical > 0 && <span style={{ ...s.catCountChip, color: '#ef4444', borderColor: '#ef444444', background: '#ef444418' }}>🚨 {critical} critical</span>}
            </div>

            <div style={s.catFindings}>
              {catFindings.slice(0, 3).map(f => (
                <FindingRow key={f.id} finding={f} />
              ))}
              {catFindings.length > 3 && (
                <div style={s.catMore}>+ {catFindings.length - 3} more findings</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Details Tab ──

function DetailsTab({ findings, filterCategory, filterSeverity, onFilterCategory, onFilterSeverity }: {
  findings: AuditFinding[];
  filterCategory: string; filterSeverity: string;
  onFilterCategory: (v: string) => void; onFilterSeverity: (v: string) => void;
}) {
  const categories = [...new Set(findings.map(f => f.category))];

  return (
    <div>
      <div style={s.filterRow}>
        <select style={s.filter} value={filterCategory} onChange={e => onFilterCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c} value={c}>{CATEGORY_META[c]?.icon ?? '📋'} {CATEGORY_META[c]?.label ?? c}</option>
          ))}
        </select>
        <select style={s.filter} value={filterSeverity} onChange={e => onFilterSeverity(e.target.value)}>
          <option value="">All Severities</option>
          <option value="critical">🚨 Critical</option>
          <option value="warning">⚠️ Warning</option>
          <option value="info">ℹ️ Info</option>
          <option value="pass">✅ Pass</option>
        </select>
      </div>
      <div style={s.findingList}>
        {findings.map(f => <FindingCard key={f.id} finding={f} />)}
        {findings.length === 0 && (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>✅</div>
            <h3 style={s.emptyTitle}>No findings match</h3>
            <p style={s.emptyText}>Try a different filter combination.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── History Tab ──

function HistoryTab({ runs, selectedRun, onSelect, onLoadFindings }: {
  runs: AuditRun[]; selectedRun: AuditRun | null; onSelect: (r: AuditRun) => void; onLoadFindings: () => void;
}) {
  return (
    <div style={s.historyList}>
      {runs.map(run => (
        <div
          key={run.id}
          style={{ ...s.historyRow, ...(selectedRun?.id === run.id ? s.historyRowActive : {}) }}
          onClick={() => { onSelect(run); setTimeout(onLoadFindings, 50); }}
        >
          <div style={s.historyLeft}>
            <div style={s.historyTypeIcon}>{run.run_type === 'full' ? '🔍' : '⚡'}</div>
            <div>
              <div style={s.historyType}>
                {run.run_type === 'full' ? 'Full System Check' : 'Quick Scan'}
              </div>
              <div style={s.historyTime}>{formatAge(run.started_at)}</div>
            </div>
          </div>
          <div style={s.historyStats}>
            <span style={{ color: '#22c55e' }}>✓{run.pass_count}</span>
            {run.warn_count > 0 && <span style={{ color: '#f59e0b' }}>⚠{run.warn_count}</span>}
            {run.critical_count > 0 && <span style={{ color: '#ef4444' }}>🚨{run.critical_count}</span>}
          </div>
          <div style={{ ...s.historyScore, color: scoreColor(run.overall_score) }}>
            {run.overall_score ?? '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Finding Row (compact for category overview) ──

function FindingRow({ finding }: { finding: AuditFinding }) {
  const meta = severityMeta(finding.severity);
  return (
    <div style={s.findingRow}>
      <span style={s.findingRowIcon}>{meta.icon}</span>
      <span style={s.findingRowTitle}>{finding.title}</span>
    </div>
  );
}

// ── Finding Card (expanded for details tab) ──

function FindingCard({ finding }: { finding: AuditFinding }) {
  const [expanded, setExpanded] = useState(false);
  const meta = severityMeta(finding.severity);
  const catMeta = CATEGORY_META[finding.category] ?? { icon: '📋', label: finding.category };

  return (
    <div style={{ ...s.findingCard, borderLeft: `3px solid ${meta.color}` }}>
      <div style={s.findingCardHeader} onClick={() => setExpanded(!expanded)}>
        <div style={s.findingCardLeft}>
          <span style={s.findingCardIcon}>{meta.icon}</span>
          <div>
            <div style={s.findingCardTitle}>{finding.title}</div>
            <div style={s.findingCardMeta}>
              {catMeta.icon} {catMeta.label} · <span style={{ color: meta.color }}>{meta.label}</span>
            </div>
          </div>
        </div>
        <span style={s.expandIcon}>{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <div style={s.findingCardBody}>
          <p style={s.findingCardDesc}>
            <strong style={{ color: '#94a3b8' }}>What this means:</strong><br />
            {finding.description}
          </p>
          {finding.recommendation && (
            <div style={s.findingCardRec}>
              <div style={{ color: '#a5b4fc', fontWeight: 600, marginBottom: 4 }}>💡 What to do:</div>
              {finding.recommendation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

function scoreColor(score: number | null): string {
  if (score === null) return '#64748b';
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

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
  loadingIcon: { fontSize: 52, animation: 'pulse 2s infinite' },
  loadingText: { color: '#64748b', fontSize: 15 },

  // Header
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerIcon: { fontSize: 36 },
  title: { fontSize: 26, fontWeight: 700, margin: 0, color: '#f1f5f9' },
  subtitle: { fontSize: 14, color: '#64748b', margin: '2px 0 0 0' },
  headerRight: { display: 'flex', gap: 10 },
  scanBtn: { padding: '9px 18px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', cursor: 'pointer', fontSize: 14, fontWeight: 600, transition: 'all 0.15s' },
  scanBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },

  // Hero Score
  heroScore: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '24px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' as const },
  heroLeft: { display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 0 },
  heroRing: { flexShrink: 0 },
  heroInfo: { minWidth: 0 },
  heroLabel: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  heroSub: { fontSize: 13, color: '#64748b' },
  heroGood: { marginTop: 8, fontSize: 13, color: '#22c55e', background: '#22c55e18', borderRadius: 6, padding: '4px 10px', display: 'inline-block' },
  heroStats: { display: 'flex', gap: 10 },
  statChip: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '10px 16px', background: '#0f172a', border: '1px solid', borderRadius: 10, minWidth: 72 },
  statNum: { fontSize: 24, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },

  // No scan
  noScan: { textAlign: 'center' as const, padding: '48px 24px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16 },
  noScanIcon: { fontSize: 56, marginBottom: 16 },
  noScanTitle: { fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 },
  noScanText: { fontSize: 14, color: '#64748b', maxWidth: 380, margin: '0 auto 20px', lineHeight: 1.6 },

  // Tabs
  tabs: { display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #1e293b', paddingBottom: 12 },
  tab: { padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: '#64748b', cursor: 'pointer', fontSize: 14, fontWeight: 500, borderRadius: 6 },
  tabActive: { color: '#f1f5f9', borderBottomColor: '#22c55e', background: '#1e293b' },

  // Category Grid
  catGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 },
  catCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column' as const, gap: 12 },
  catCardHeader: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  catIconWrap: { fontSize: 28, flexShrink: 0 },
  catIcon: {},
  catTitleGroup: { flex: 1, minWidth: 0 },
  catTitle: { fontSize: 16, fontWeight: 700, color: '#f1f5f9', margin: 0 },
  catTagline: { fontSize: 12, color: '#64748b', margin: '2px 0 0 0', lineHeight: 1.4 },
  catBadge: { fontSize: 20, flexShrink: 0 },
  catCounts: { display: 'flex', gap: 6, flexWrap: 'wrap' as const },
  catCountChip: { fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, border: '1px solid' },
  catFindings: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  findingRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 },
  findingRowIcon: { fontSize: 14, flexShrink: 0 },
  findingRowTitle: { color: '#94a3b8' },
  catMore: { fontSize: 12, color: '#475569', fontStyle: 'italic' },

  // Filters
  filterRow: { display: 'flex', gap: 10, marginBottom: 14 },
  filter: { padding: '7px 12px', background: '#1e293b', border: '1px solid #334155', borderRadius: 7, color: '#e2e8f0', fontSize: 13 },

  // Finding List
  findingList: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  findingCard: { background: '#0f172a', borderRadius: 10, overflow: 'hidden' },
  findingCardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', gap: 12 },
  findingCardLeft: { display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  findingCardIcon: { fontSize: 20, flexShrink: 0 },
  findingCardTitle: { fontSize: 14, fontWeight: 500, color: '#e2e8f0' },
  findingCardMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  expandIcon: { fontSize: 11, color: '#475569', flexShrink: 0 },
  findingCardBody: { padding: '0 16px 16px 44px' },
  findingCardDesc: { fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 10px 0' },
  findingCardRec: { background: '#1e293b', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#c4b5fd', lineHeight: 1.5 },

  // History
  historyList: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  historyRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: '#0f172a', borderRadius: 10, cursor: 'pointer', border: '1px solid transparent' },
  historyRowActive: { borderColor: '#22c55e', background: '#052e16' },
  historyLeft: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  historyTypeIcon: { fontSize: 20, flexShrink: 0 },
  historyType: { fontSize: 14, fontWeight: 500, color: '#e2e8f0' },
  historyTime: { fontSize: 12, color: '#64748b', marginTop: 1 },
  historyStats: { display: 'flex', gap: 10, fontSize: 13, fontWeight: 600 },
  historyScore: { fontSize: 24, fontWeight: 700, width: 40, textAlign: 'right' as const },

  // Empty
  emptyState: { textAlign: 'center' as const, padding: '48px 24px' },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#64748b', lineHeight: 1.5 },
};
