// Conflux Home — Viper Vulnerability Scanner Dashboard (Consumer Redesign)
// Mission 1224: Red Team Operator — Think like a hacker, before they do

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

// ── Plain-Language Category Mapping ──

const CATEGORY_META: Record<string, { icon: string; label: string; color: string; tagline: string }> = {
  misconfig: { icon: '⚙️', label: 'System Weaknesses', color: '#f97316', tagline: 'Risky settings that could let attackers in' },
  network: { icon: '🌐', label: 'Network Exposure', color: '#06b6d4', tagline: 'How visible your system is on the network' },
  browser: { icon: '🌍', label: 'Browser Security', color: '#8b5cf6', tagline: 'Saved passwords and data in your browser' },
  passwords: { icon: '🔐', label: 'Password Safety', color: '#ec4899', tagline: 'System password strength and policies' },
  code: { icon: '📝', label: 'Secrets & Config', color: '#eab308', tagline: 'Accidentally exposed API keys, tokens, or private data' },
  general: { icon: '🐍', label: 'General Hardening', color: '#22c55e', tagline: 'Overall security posture and best practices' },
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

function riskLabel(score: number | null): string {
  if (score === null) return 'No scan yet';
  if (score <= 15) return 'Low Risk — looks good';
  if (score <= 40) return 'Moderate Risk — some concerns';
  if (score <= 70) return 'High Risk — needs attention';
  return 'Critical Risk — act now';
}

function riskColor(score: number | null): string {
  if (score === null) return '#64748b';
  if (score <= 15) return '#22c55e';
  if (score <= 40) return '#f59e0b';
  return '#ef4444';
}

// ── Component ──

export default function ViperDashboard() {
  const [scans, setScans] = useState<VulnScan[]>([]);
  const [selectedScan, setSelectedScan] = useState<VulnScan | null>(null);
  const [findings, setFindings] = useState<VulnFinding[]>([]);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'history'>('overview');

  const loadScans = useCallback(async () => {
    try {
      const data = await invoke<VulnScan[]>('viper_get_scans', { limit: 20 });
      setScans(data);
      if (data.length > 0 && !selectedScan) setSelectedScan(data[0]);
    } catch (err) {
      console.error('[Viper] Failed to load scans:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedScan]);

  const loadFindings = useCallback(async () => {
    if (!selectedScan) return;
    try {
      const data = await invoke<VulnFinding[]>('viper_get_findings', {
        scanId: selectedScan.id,
        category: filterCategory || undefined,
      });
      setFindings(data);
    } catch (err) {
      console.error('[Viper] Failed to load findings:', err);
    }
  }, [selectedScan, filterCategory]);

  useEffect(() => { loadScans(); }, [loadScans]);
  useEffect(() => { loadFindings(); }, [loadFindings]);

  const handleRunScan = async (scanType: 'full' | 'quick') => {
    setScanning(true);
    try {
      const scanId = await invoke<string>('viper_run_scan', { scanType });
      console.log('[Viper] Scan complete:', scanId);
      await loadScans();
      const data = await invoke<VulnScan[]>('viper_get_scans', { limit: 1 });
      if (data.length > 0) setSelectedScan(data[0]);
    } catch (err) {
      console.error('[Viper] Scan failed:', err);
    } finally {
      setScanning(false);
    }
  };

  const filteredFindings = filterSeverity
    ? findings.filter(f => f.severity === filterSeverity)
    : findings;

  const findingsByCategory = findings.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {} as Record<string, VulnFinding[]>);

  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.loading}>
          <div style={s.loadingIcon}>🐍</div>
          <div style={s.loadingText}>Scanning for vulnerabilities...</div>
        </div>
      </div>
    );
  }

  const risk = selectedScan?.risk_score ?? null;
  const criticalCount = selectedScan?.critical_count ?? 0;
  const warnCount = selectedScan?.warn_count ?? 0;
  const infoCount = selectedScan?.info_count ?? 0;
  const passCount = selectedScan?.pass_count ?? 0;

  return (
    <div style={s.container}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerIcon}>🐍</span>
          <div>
            <h1 style={s.title}>Viper</h1>
            <p style={s.subtitle}>Think like a hacker — find weak spots before they do</p>
          </div>
        </div>
        <div style={s.headerRight}>
          <button
            style={{ ...s.scanBtn, ...(scanning ? s.scanBtnDisabled : {}) }}
            onClick={() => handleRunScan('quick')}
            disabled={scanning}
          >
            ⚡ Quick Scan
          </button>
          <button
            style={{ ...s.scanBtn, background: '#ef4444', borderColor: '#ef4444', ...(scanning ? s.scanBtnDisabled : {}) }}
            onClick={() => handleRunScan('full')}
            disabled={scanning}
          >
            {scanning ? '🔄 Scanning...' : '🐍 Full Vulnerability Scan'}
          </button>
        </div>
      </div>

      {/* ── Hero Risk Card ── */}
      {selectedScan && (
        <div style={{ ...s.heroRisk, borderTop: `4px solid ${riskColor(risk)}` }}>
          <div style={s.heroLeft}>
            <div style={s.heroRing}>
              <svg width="110" height="110" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r="48" fill="none" stroke="#1e293b" strokeWidth="7" />
                <circle
                  cx="55" cy="55" r="48" fill="none"
                  stroke={riskColor(risk)}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${((risk ?? 0) / 100) * 301.59} 301.59`}
                  transform="rotate(-90 55 55)"
                  style={{ transition: 'stroke-dasharray 0.8s ease' }}
                />
                <text x="55" y="48" textAnchor="middle" fill={riskColor(risk)} fontSize="28" fontWeight="bold">
                  {risk ?? '—'}
                </text>
                <text x="55" y="68" textAnchor="middle" fill="#64748b" fontSize="10">
                  RISK
                </text>
              </svg>
            </div>
            <div style={s.heroInfo}>
              <div style={{ ...s.heroLabel, color: riskColor(risk) }}>
                {riskLabel(risk)}
              </div>
              <div style={s.heroSub}>
                {selectedScan.total_checks} checks run · {formatAge(selectedScan.started_at)}
              </div>
              {criticalCount === 0 && warnCount === 0 && (
                <div style={s.heroGood}>
                  ✨ No vulnerabilities found — you're in good shape
                </div>
              )}
              {criticalCount > 0 && (
                <div style={s.heroAlert}>
                  🚨 {criticalCount} critical vulnerability finding{criticalCount !== 1 ? 's' : ''} — address these first
                </div>
              )}
            </div>
          </div>

          <div style={s.heroStats}>
            {passCount > 0 && (
              <div style={{ ...s.statChip, borderColor: '#22c55e' }}>
                <span style={{ ...s.statNum, color: '#22c55e' }}>{passCount}</span>
                <span style={s.statLabel}>Passed</span>
              </div>
            )}
            {infoCount > 0 && (
              <div style={{ ...s.statChip, borderColor: '#3b82f6' }}>
                <span style={{ ...s.statNum, color: '#3b82f6' }}>{infoCount}</span>
                <span style={s.statLabel}>FYI</span>
              </div>
            )}
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

      {!selectedScan && (
        <div style={s.noScan}>
          <div style={s.noScanIcon}>🐍</div>
          <h3 style={s.noScanTitle}>No Scan Yet</h3>
          <p style={s.noScanText}>
            Viper hunts for the same weaknesses an attacker would look for — saved passwords in your browser, risky network settings, accidentally exposed secrets, and more.
          </p>
          <button style={{ ...s.scanBtn, background: '#ef4444', borderColor: '#ef4444' }} onClick={() => handleRunScan('quick')}>
            🐍 Run Your First Scan
          </button>
        </div>
      )}

      {/* ── Tabs ── */}
      {selectedScan && (
        <div style={s.tabs}>
          {[
            { key: 'overview', label: `📋 Category Overview` },
            { key: 'details', label: `🔍 All Findings (${filteredFindings.length})` },
            { key: 'history', label: `📜 Scan History (${scans.length})` },
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
      {selectedScan && activeTab === 'overview' && (
        <OverviewTab findingsByCategory={findingsByCategory} />
      )}
      {selectedScan && activeTab === 'details' && (
        <DetailsTab
          findings={filteredFindings}
          filterCategory={filterCategory}
          filterSeverity={filterSeverity}
          onFilterCategory={setFilterCategory}
          onFilterSeverity={setFilterSeverity}
        />
      )}
      {selectedScan && activeTab === 'history' && (
        <HistoryTab scans={scans} selectedScan={selectedScan} onSelect={setSelectedScan} onLoadFindings={() => { loadFindings(); }} />
      )}
    </div>
  );
}

// ── Overview Tab ──

function OverviewTab({ findingsByCategory }: { findingsByCategory: Record<string, VulnFinding[]> }) {
  const categories = Object.keys(findingsByCategory).sort();

  if (categories.length === 0) {
    return (
      <div style={s.emptyState}>
        <div style={s.emptyIcon}>✅</div>
        <h3 style={s.emptyTitle}>All Clear</h3>
        <p style={s.emptyText}>No vulnerabilities found. Viper didn't find any weaknesses.</p>
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
              {catFindings.slice(0, 3).map(f => <FindingRow key={f.id} finding={f} />)}
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
  findings: VulnFinding[];
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

function HistoryTab({ scans, selectedScan, onSelect, onLoadFindings }: {
  scans: VulnScan[]; selectedScan: VulnScan | null; onSelect: (s: VulnScan) => void; onLoadFindings: () => void;
}) {
  return (
    <div style={s.historyList}>
      {scans.map(scan => (
        <div
          key={scan.id}
          style={{ ...s.historyRow, ...(selectedScan?.id === scan.id ? s.historyRowActive : {}) }}
          onClick={() => { onSelect(scan); setTimeout(onLoadFindings, 50); }}
        >
          <div style={s.historyLeft}>
            <div style={s.historyTypeIcon}>{scan.scan_type === 'full' ? '🐍' : '⚡'}</div>
            <div>
              <div style={s.historyType}>
                {scan.scan_type === 'full' ? 'Full Vulnerability Scan' : 'Quick Scan'}
              </div>
              <div style={s.historyTime}>{formatAge(scan.started_at)}</div>
            </div>
          </div>
          <div style={s.historyStats}>
            <span style={{ color: '#22c55e' }}>✓{scan.pass_count}</span>
            {scan.warn_count > 0 && <span style={{ color: '#f59e0b' }}>⚠{scan.warn_count}</span>}
            {scan.critical_count > 0 && <span style={{ color: '#ef4444' }}>🚨{scan.critical_count}</span>}
          </div>
          <div style={{ ...s.historyScore, color: riskColor(scan.risk_score) }}>
            {scan.risk_score ?? '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Finding Row (compact) ──

function FindingRow({ finding }: { finding: VulnFinding }) {
  const meta = severityMeta(finding.severity);
  return (
    <div style={s.findingRow}>
      <span style={s.findingRowIcon}>{meta.icon}</span>
      <span style={s.findingRowTitle}>{finding.title}</span>
    </div>
  );
}

// ── Finding Card (expanded) ──

function FindingCard({ finding }: { finding: VulnFinding }) {
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
          {finding.remediation && (
            <div style={s.findingCardRec}>
              <div style={{ color: '#fca5a5', fontWeight: 600, marginBottom: 4 }}>🔧 How to fix it:</div>
              {finding.remediation}
            </div>
          )}
          {finding.cve_ids && finding.cve_ids.length > 0 && (
            <div style={s.findingCardCve}>
              <span style={{ color: '#fca5a5', fontWeight: 600 }}>Related CVEs:</span>{' '}
              {finding.cve_ids.map(cve => (
                <span key={cve} style={s.cveChip}>{cve}</span>
              ))}
            </div>
          )}
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
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
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

  // Hero Risk
  heroRisk: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '24px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' as const },
  heroLeft: { display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 0 },
  heroRing: { flexShrink: 0 },
  heroInfo: { minWidth: 0 },
  heroLabel: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  heroSub: { fontSize: 13, color: '#64748b' },
  heroGood: { marginTop: 8, fontSize: 13, color: '#22c55e', background: '#22c55e18', borderRadius: 6, padding: '4px 10px', display: 'inline-block' },
  heroAlert: { marginTop: 8, fontSize: 13, color: '#ef4444', background: '#ef444418', borderRadius: 6, padding: '4px 10px', display: 'inline-block', fontWeight: 600 },
  heroStats: { display: 'flex', gap: 10 },
  statChip: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '10px 16px', background: '#0f172a', border: '1px solid', borderRadius: 10, minWidth: 72 },
  statNum: { fontSize: 24, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },

  // No scan
  noScan: { textAlign: 'center' as const, padding: '48px 24px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16 },
  noScanIcon: { fontSize: 56, marginBottom: 16 },
  noScanTitle: { fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 },
  noScanText: { fontSize: 14, color: '#64748b', maxWidth: 400, margin: '0 auto 20px', lineHeight: 1.6 },

  // Tabs
  tabs: { display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #1e293b', paddingBottom: 12 },
  tab: { padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: '#64748b', cursor: 'pointer', fontSize: 14, fontWeight: 500, borderRadius: 6 },
  tabActive: { color: '#f1f5f9', borderBottomColor: '#ef4444', background: '#1e293b' },

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
  findingCardRec: { background: '#1e293b', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5', lineHeight: 1.5, marginBottom: 8 },
  findingCardCve: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const, fontSize: 12, background: '#1e293b', borderRadius: 6, padding: '6px 12px' },
  cveChip: { background: '#ef444422', color: '#fca5a5', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace', fontSize: 11, marginRight: 4 },

  // History
  historyList: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  historyRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: '#0f172a', borderRadius: 10, cursor: 'pointer', border: '1px solid transparent' },
  historyRowActive: { borderColor: '#ef4444', background: '#2d0a0a' },
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
