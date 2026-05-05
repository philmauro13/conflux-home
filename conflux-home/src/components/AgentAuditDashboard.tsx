// Conflux Home — Agent Armor Dashboard (Consumer Redesign)
// Mission 1224: Agent-vs-Agent Red Teaming — Made human-readable

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
  total_agents: number;
  agents_passed: number;
  agents_warning: number;
  agents_failed: number;
  started_at: string;
  completed_at: string | null;
}

interface AgentResult {
  id: string;
  run_id: string;
  agent_id: string;
  agent_name: string;
  agent_emoji: string;
  defense_score: number;
  total_attacks: number;
  blocked_count: number;
  partial_count: number;
  breached_count: number;
}

interface AuditFinding {
  id: string;
  result_id: string;
  attack_type: string;
  attack_name: string;
  severity: 'pass' | 'partial' | 'breach';
  attack_prompt: string;
  agent_response: string | null;
  indicator: string | null;
  description: string;
  remediation: string | null;
  raw_data: unknown;
}

// ── Attack Type Plain Language ──

const ATTACK_META: Record<string, { icon: string; label: string; tagline: string; color: string }> = {
  prompt_injection: { icon: '💉', label: 'Prompt Injection', tagline: 'Could someone trick this agent into ignoring its instructions?', color: '#ef4444' },
  data_exfil: { icon: '📤', label: 'Data Exfiltration', tagline: 'Could this agent be tricked into sharing private information?', color: '#f59e0b' },
  priv_escalation: { icon: '⬆️', label: 'Privilege Escalation', tagline: 'Could this agent gain capabilities it wasn\'t supposed to have?', color: '#8b5cf6' },
  instruction_override: { icon: '🔄', label: 'Instruction Override', tagline: 'Could someone make this agent ignore its core purpose?', color: '#ec4899' },
  social_engineering: { icon: '🎭', label: 'Social Engineering', tagline: 'Could this agent be manipulated through flattery, fear, or authority?', color: '#f97316' },
};

// ── Severity ──

function severityMeta(severity: string) {
  switch (severity) {
    case 'breach': return { icon: '🚨', label: 'Breached', color: '#ef4444', bg: '#ef444418' };
    case 'partial': return { icon: '⚠️', label: 'Partial', color: '#f59e0b', bg: '#f59e0b18' };
    case 'pass': return { icon: '✅', label: 'Blocked', color: '#22c55e', bg: '#22c55e18' };
    default: return { icon: '📋', label: severity, color: '#64748b', bg: '#64748b18' };
  }
}

function defenseLabel(score: number): string {
  if (score >= 90) return 'Well Defended';
  if (score >= 70) return 'Good Defense';
  if (score >= 40) return 'Needs Improvement';
  return 'Vulnerable';
}

// ── Component ──

export default function AgentAuditDashboard() {
  const [runs, setRuns] = useState<AuditRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<AuditRun | null>(null);
  const [agentResults, setAgentResults] = useState<AgentResult[]>([]);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'findings'>('overview');

  const loadRuns = useCallback(async () => {
    try {
      const data = await invoke<AuditRun[]>('agent_audit_get_runs', { limit: 20 });
      setRuns(data);
      if (data.length > 0 && !selectedRun) setSelectedRun(data[0]);
    } catch (err) {
      console.error('[AgentAudit] Failed to load runs:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedRun]);

  const loadResults = useCallback(async () => {
    if (!selectedRun) return;
    try {
      const data = await invoke<AgentResult[]>('agent_audit_get_results', { runId: selectedRun.id });
      setAgentResults(data);
      if (data.length > 0 && !selectedAgent) setSelectedAgent(data[0]);
    } catch (err) {
      console.error('[AgentAudit] Failed to load results:', err);
    }
  }, [selectedRun, selectedAgent]);

  const loadFindings = useCallback(async () => {
    if (!selectedAgent) return;
    try {
      const data = await invoke<AuditFinding[]>('agent_audit_get_findings', { resultId: selectedAgent.id });
      setFindings(data);
    } catch (err) {
      console.error('[AgentAudit] Failed to load findings:', err);
    }
  }, [selectedAgent]);

  useEffect(() => { loadRuns(); }, [loadRuns]);
  useEffect(() => { loadResults(); }, [loadResults]);
  useEffect(() => { loadFindings(); }, [loadFindings]);

  const handleRun = async (runType: 'full' | 'quick') => {
    setRunning(true);
    try {
      const runId = await invoke<string>('agent_audit_run_full', { runType, agentIds: null });
      console.log('[AgentAudit] Run complete:', runId);
      await loadRuns();
      const data = await invoke<AuditRun[]>('agent_audit_get_runs', { limit: 1 });
      if (data.length > 0) setSelectedRun(data[0]);
    } catch (err) {
      console.error('[AgentAudit] Run failed:', err);
    } finally {
      setRunning(false);
    }
  };

  const overallScore = selectedRun?.overall_score ?? null;
  const passed = selectedRun?.agents_passed ?? 0;
  const warnings = selectedRun?.agents_warning ?? 0;
  const failed = selectedRun?.agents_failed ?? 0;

  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.loading}>
          <div style={s.loadingIcon}>⚔️</div>
          <div style={s.loadingText}>Running red team exercises...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerIcon}>⚔️</span>
          <div>
            <h1 style={s.title}>Agent Armor</h1>
            <p style={s.subtitle}>Red team vs. your agents — can they be tricked or manipulated?</p>
          </div>
        </div>
        <button
          style={{ ...s.runBtn, ...(running ? s.runBtnDisabled : {}) }}
          onClick={() => handleRun('full')}
          disabled={running}
        >
          {running ? '⚔️ Testing Agents...' : '⚔️ Run Red Team Exercise'}
        </button>
      </div>

      {/* ── Hero Overview ── */}
      {selectedRun && (
        <div style={s.heroCard}>
          <div style={s.heroLeft}>
            <div style={s.heroRing}>
              <svg width="110" height="110" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r="48" fill="none" stroke="#1e293b" strokeWidth="7" />
                <circle
                  cx="55" cy="55" r="48" fill="none"
                  stroke={defenseColor(overallScore)}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${((overallScore ?? 0) / 100) * 301.59} 301.59`}
                  transform="rotate(-90 55 55)"
                  style={{ transition: 'stroke-dasharray 0.8s ease' }}
                />
                <text x="55" y="48" textAnchor="middle" fill={defenseColor(overallScore)} fontSize="26" fontWeight="bold">
                  {overallScore ?? '—'}
                </text>
                <text x="55" y="68" textAnchor="middle" fill="#64748b" fontSize="10">SCORE</text>
              </svg>
            </div>
            <div>
              <div style={{ ...s.heroLabel, color: defenseColor(overallScore) }}>
                {overallScore !== null ? defenseLabel(overallScore) : 'No score yet'}
              </div>
              <div style={s.heroSub}>
                {selectedRun.total_agents} agents tested · {formatAge(selectedRun.started_at)}
              </div>
              <div style={s.heroSub}>
                {ATTACK_META['prompt_injection']?.icon} {ATTACK_META['data_exfil']?.icon} {ATTACK_META['priv_escalation']?.icon} {ATTACK_META['social_engineering']?.icon} 5 attack vectors
              </div>
            </div>
          </div>
          <div style={s.heroStats}>
            {passed > 0 && <div style={{ ...s.statChip, borderColor: '#22c55e' }}><span style={{ ...s.statNum, color: '#22c55e' }}>{passed}</span><span style={s.statLabel}>Well Defended</span></div>}
            {warnings > 0 && <div style={{ ...s.statChip, borderColor: '#f59e0b' }}><span style={{ ...s.statNum, color: '#f59e0b' }}>{warnings}</span><span style={s.statLabel}>Needs Work</span></div>}
            {failed > 0 && <div style={{ ...s.statChip, borderColor: '#ef4444' }}><span style={{ ...s.statNum, color: '#ef4444' }}>{failed}</span><span style={s.statLabel}>Vulnerable</span></div>}
          </div>
        </div>
      )}

      {!selectedRun && (
        <div style={s.noRun}>
          <div style={s.noRunIcon}>⚔️</div>
          <h3 style={s.noRunTitle}>Agent Armor Test</h3>
          <p style={s.noRunText}>
            Agent Armor runs simulated attacks against your agents — prompt injection attempts, data exfiltration tries, social engineering, privilege escalation — to see which ones hold up and which ones fold.
          </p>
          <button style={{ ...s.runBtn, background: '#f59e0b', borderColor: '#f59e0b' }} onClick={() => handleRun('full')}>
            ⚔️ Run First Test
          </button>
        </div>
      )}

      {/* ── Tabs ── */}
      {selectedRun && (
        <div style={s.tabs}>
          <button style={{ ...s.tab, ...(activeTab === 'overview' ? s.tabActive : {}) }} onClick={() => setActiveTab('overview')}>
            📋 Agent Results ({agentResults.length})
          </button>
          <button style={{ ...s.tab, ...(activeTab === 'agents' ? s.tabActive : {}) }} onClick={() => setActiveTab('agents')}>
            🛡️ By Attack Type
          </button>
          <button style={{ ...s.tab, ...(activeTab === 'findings' ? s.tabActive : {}) }} onClick={() => setActiveTab('findings')}>
            🔍 All Findings ({findings.length})
          </button>
        </div>
      )}

      {/* ── Tab Content ── */}
      {activeTab === 'overview' && (
        <div style={s.agentGrid}>
          {agentResults.map(result => (
            <div
              key={result.id}
              style={{
                ...s.agentCard,
                borderColor: defenseColor(result.defense_score) + '44',
                ...(selectedAgent?.id === result.id ? { borderColor: defenseColor(result.defense_score), boxShadow: `0 0 20px ${defenseColor(result.defense_score)}22` } : {}),
              }}
              onClick={() => { setSelectedAgent(result); setActiveTab('findings'); }}
            >
              <div style={s.agentCardTop}>
                <span style={s.agentEmoji}>{result.agent_emoji}</span>
                <div style={s.agentInfo}>
                  <div style={s.agentName}>{result.agent_name}</div>
                  <div style={s.agentSub}>ID: {result.agent_id}</div>
                </div>
                <div style={{ ...s.agentScore, color: defenseColor(result.defense_score) }}>
                  {result.defense_score}
                </div>
              </div>
              <div style={s.agentCardStats}>
                <span style={{ color: '#22c55e' }}>✅ {result.blocked_count} blocked</span>
                <span style={{ color: '#f59e0b' }}>⚠️ {result.partial_count} partial</span>
                <span style={{ color: '#ef4444' }}>🚨 {result.breached_count} breached</span>
              </div>
            </div>
          ))}
          {agentResults.length === 0 && (
            <div style={s.emptyState}><div style={s.emptyIcon}>🤖</div><h3 style={s.emptyTitle}>No agent results yet</h3></div>
          )}
        </div>
      )}

      {activeTab === 'agents' && (
        <div style={s.attackGrid}>
          {Object.entries(ATTACK_META).map(([key, meta]) => {
            const relevantFindings = findings.filter(f => f.attack_type === key);
            const breaches = relevantFindings.filter(f => f.severity === 'breach').length;
            const partials = relevantFindings.filter(f => f.severity === 'partial').length;
            const passed = relevantFindings.filter(f => f.severity === 'pass').length;
            const total = relevantFindings.length;

            return (
              <div key={key} style={s.attackCard}>
                <div style={s.attackCardHeader}>
                  <span style={s.attackIcon}>{meta.icon}</span>
                  <div>
                    <div style={s.attackLabel}>{meta.label}</div>
                    <div style={s.attackTagline}>{meta.tagline}</div>
                  </div>
                </div>
                {total === 0 ? (
                  <div style={s.attackEmpty}>No results yet — run a test to see how agents handle this attack</div>
                ) : (
                  <>
                    <div style={s.attackCounts}>
                      <span style={{ color: '#22c55e' }}>✅ {passed}/{total}</span>
                      {partials > 0 && <span style={{ color: '#f59e0b' }}>⚠️ {partials}</span>}
                      {breaches > 0 && <span style={{ color: '#ef4444' }}>🚨 {breaches}</span>}
                    </div>
                    <div style={s.attackBar}>
                      <div style={{ ...s.attackBarFill, width: `${(passed / total) * 100}%`, background: '#22c55e' }} />
                      <div style={{ ...s.attackBarFill, width: `${(partials / total) * 100}%`, background: '#f59e0b' }} />
                      <div style={{ ...s.attackBarFill, width: `${(breaches / total) * 100}%`, background: '#ef4444' }} />
                    </div>
                    <div style={s.attackLegend}>
                      <span style={{ color: '#22c55e', fontSize: 12 }}>■ Blocked</span>
                      <span style={{ color: '#f59e0b', fontSize: 12 }}>■ Partial</span>
                      <span style={{ color: '#ef4444', fontSize: 12 }}>■ Breached</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'findings' && (
        <div style={s.findingsList}>
          {findings.map(f => {
            const meta = severityMeta(f.severity);
            const attackMeta = ATTACK_META[f.attack_type] ?? { icon: '⚔️', label: f.attack_type };
            return (
              <div key={f.id} style={{ ...s.findingCard, borderLeft: `3px solid ${meta.color}` }}>
                <div style={s.findingHeader}>
                  <div style={s.findingLeft}>
                    <span style={s.findingIcon}>{meta.icon}</span>
                    <div>
                      <div style={s.findingTitle}>{f.attack_name}</div>
                      <div style={s.findingMeta}>
                        {attackMeta.icon} {attackMeta.label} · <span style={{ color: meta.color }}>{meta.label}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={s.findingDesc}>{f.description}</div>
                {f.remediation && (
                  <div style={s.findingRemed}>
                    <strong style={{ color: '#a5b4fc' }}>💡 How to harden:</strong> {f.remediation}
                  </div>
                )}
              </div>
            );
          })}
          {findings.length === 0 && selectedAgent && (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>🛡️</div>
              <h3 style={s.emptyTitle}>No findings for this agent</h3>
              <p style={s.emptyText}>Either this agent passed all tests or no test was run yet. Click an agent above to see its test results.</p>
            </div>
          )}
          {!selectedAgent && (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>👆</div>
              <h3 style={s.emptyTitle}>Select an agent</h3>
              <p style={s.emptyText}>Click an agent card above to see its individual attack findings.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──

function defenseColor(score: number | null): string {
  if (score === null) return '#64748b';
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#f59e0b';
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
  loadingIcon: { fontSize: 56, animation: 'pulse 2s infinite' },
  loadingText: { color: '#64748b', fontSize: 15 },

  // Header
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerIcon: { fontSize: 36 },
  title: { fontSize: 26, fontWeight: 700, margin: 0, color: '#f1f5f9' },
  subtitle: { fontSize: 14, color: '#64748b', margin: '2px 0 0 0' },
  runBtn: { padding: '10px 20px', background: '#1e293b', border: '1px solid #f59e0b', borderRadius: 8, color: '#f1f5f9', cursor: 'pointer', fontSize: 14, fontWeight: 700, transition: 'all 0.15s' },
  runBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },

  // Hero
  heroCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: '24px 28px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' as const },
  heroLeft: { display: 'flex', alignItems: 'center', gap: 20, flex: 1, minWidth: 0 },
  heroRing: { flexShrink: 0 },
  heroLabel: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  heroSub: { fontSize: 13, color: '#64748b', marginTop: 4 },
  heroStats: { display: 'flex', gap: 10 },
  statChip: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '10px 16px', background: '#0f172a', border: '1px solid', borderRadius: 10, minWidth: 72 },
  statNum: { fontSize: 24, fontWeight: 700 },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },

  // No run
  noRun: { textAlign: 'center' as const, padding: '48px 24px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16 },
  noRunIcon: { fontSize: 56, marginBottom: 16 },
  noRunTitle: { fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 },
  noRunText: { fontSize: 14, color: '#64748b', maxWidth: 460, margin: '0 auto 20px', lineHeight: 1.6 },

  // Tabs
  tabs: { display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #1e293b', paddingBottom: 12 },
  tab: { padding: '8px 16px', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: '#64748b', cursor: 'pointer', fontSize: 14, fontWeight: 500, borderRadius: 6 },
  tabActive: { color: '#f1f5f9', borderBottomColor: '#f59e0b', background: '#1e293b' },

  // Agent Grid
  agentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 },
  agentCard: { background: '#0f172a', border: '2px solid', borderRadius: 12, padding: 16, cursor: 'pointer', transition: 'all 0.15s' },
  agentCardTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  agentEmoji: { fontSize: 28 },
  agentInfo: { flex: 1, minWidth: 0 },
  agentName: { fontSize: 15, fontWeight: 700, color: '#f1f5f9' },
  agentSub: { fontSize: 11, color: '#475569' },
  agentScore: { fontSize: 28, fontWeight: 700 },
  agentCardStats: { display: 'flex', gap: 8, fontSize: 12, fontWeight: 600 },

  // Attack Grid
  attackGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 },
  attackCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: 16 },
  attackCardHeader: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  attackIcon: { fontSize: 24, flexShrink: 0 },
  attackLabel: { fontSize: 15, fontWeight: 700, color: '#f1f5f9' },
  attackTagline: { fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 1.4 },
  attackEmpty: { fontSize: 12, color: '#475569', fontStyle: 'italic', lineHeight: 1.5 },
  attackCounts: { display: 'flex', gap: 10, fontSize: 13, fontWeight: 600, marginBottom: 8 },
  attackBar: { display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2, marginBottom: 6 },
  attackBarFill: { height: '100%', borderRadius: 3 },
  attackLegend: { display: 'flex', gap: 8 },

  // Findings
  findingsList: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  findingCard: { background: '#0f172a', borderRadius: 10, padding: '12px 16px' },
  findingHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  findingLeft: { display: 'flex', alignItems: 'center', gap: 10, flex: 1 },
  findingIcon: { fontSize: 20, flexShrink: 0 },
  findingTitle: { fontSize: 14, fontWeight: 500, color: '#e2e8f0' },
  findingMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  findingDesc: { fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 8 },
  findingRemed: { background: '#1e293b', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#c4b5fd', lineHeight: 1.5 },

  // Empty
  emptyState: { textAlign: 'center' as const, padding: '48px 24px' },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#64748b', lineHeight: 1.5 },
};
