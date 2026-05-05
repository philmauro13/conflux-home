// Conflux Home — Security Settings
// Mission 1224: Per-agent security profiles, permission rules, anomaly rules

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { playToggleOn, playToggleOff } from '../../lib/sound';

// ── Types ──

interface SecurityProfile {
  agent_id: string;
  sandbox_enabled: boolean;
  file_access_mode: string;
  network_mode: string;
  exec_mode: string;
  max_file_reads_per_min: number;
  max_file_writes_per_min: number;
  max_exec_per_min: number;
  max_network_per_min: number;
  anomaly_threshold: number;
}

interface PermissionRule {
  id: string;
  agent_id: string;
  resource_type: string;
  resource_value: string;
  action: 'allow' | 'deny' | 'prompt';
  scope: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

interface AnomalyRule {
  id: string;
  agent_id: string | null;
  rule_type: string;
  threshold: number;
  window_seconds: number;
  pattern: string | null;
  severity: string;
  enabled: boolean;
}

// ── Toggle Switch ──

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`toggle-switch ${checked ? 'on' : ''}`}
      onClick={() => { checked ? playToggleOff() : playToggleOn(); onChange(!checked); }}
      type="button"
      aria-label={checked ? 'Disable' : 'Enable'}
    >
      <span className="toggle-knob" />
    </button>
  );
}

// ── Section: Per-Agent Security Profile ──

function AgentSecurityProfileSection() {
  const [agents, setAgents] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [profile, setProfile] = useState<SecurityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load agent list
  useEffect(() => {
    invoke<any[]>('engine_get_agents').then(list => {
      const ids = (list ?? []).map(a => a.id);
      setAgents(ids);
      if (ids.length > 0 && !selectedAgent) {
        setSelectedAgent(ids[0]);
      }
    }).catch(() => setAgents([]));
  }, []);

  // Load profile when agent changes
  useEffect(() => {
    if (!selectedAgent) return;
    setLoading(true);
    invoke<SecurityProfile>('security_get_profile', { agentId: selectedAgent })
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [selectedAgent]);

  const updateField = useCallback(async <K extends keyof SecurityProfile>(
    field: K,
    value: SecurityProfile[K]
  ) => {
    if (!profile) return;
    const updated = { ...profile, [field]: value };
    setProfile(updated);
    setSaving(true);
    try {
      await invoke('security_update_profile', {
        agentId: updated.agent_id,
        sandboxEnabled: updated.sandbox_enabled,
        fileAccessMode: updated.file_access_mode,
        networkMode: updated.network_mode,
        execMode: updated.exec_mode,
        maxFileReads: updated.max_file_reads_per_min,
        maxFileWrites: updated.max_file_writes_per_min,
        maxExec: updated.max_exec_per_min,
        maxNetwork: updated.max_network_per_min,
        anomalyThreshold: updated.anomaly_threshold,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('[Security] Failed to update profile:', err);
    } finally {
      setSaving(false);
    }
  }, [profile]);

  if (!selectedAgent) {
    return (
      <div className="settings-section">
        <div className="settings-section-title">🛡️ Agent Security Profiles</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No agents installed.</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        🛡️ Agent Security Profile
        {saved && <span style={{ fontSize: 12, color: '#22c55e', marginLeft: 8 }}>✓ Saved</span>}
      </div>

      {/* Agent selector */}
      <div className="settings-row">
        <span className="settings-label">Agent</span>
        <select
          className="settings-value"
          value={selectedAgent}
          onChange={e => setSelectedAgent(e.target.value)}
          style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}
        >
          {agents.map(id => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </div>

      {loading || !profile ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <>
          {/* Sandbox toggle */}
          <div className="settings-row">
            <span className="settings-label">Sandbox</span>
            <div className="settings-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Toggle checked={profile.sandbox_enabled} onChange={v => updateField('sandbox_enabled', v)} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {profile.sandbox_enabled ? 'Enabled — restricted access' : 'Disabled — full access'}
              </span>
            </div>
          </div>

          {/* File access mode */}
          <div className="settings-row">
            <span className="settings-label">File Access</span>
            <select
              className="settings-value"
              value={profile.file_access_mode}
              onChange={e => updateField('file_access_mode', e.target.value)}
              style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}
            >
              <option value="open">Open — all files</option>
              <option value="allowlist">Allowlist — permitted paths only</option>
              <option value="prompt_all">Prompt — ask every time</option>
            </select>
          </div>

          {/* Network mode */}
          <div className="settings-row">
            <span className="settings-label">Network</span>
            <select
              className="settings-value"
              value={profile.network_mode}
              onChange={e => updateField('network_mode', e.target.value)}
              style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}
            >
              <option value="open">Open — all domains</option>
              <option value="allowlist">Allowlist — permitted domains only</option>
              <option value="prompt_all">Prompt — ask every time</option>
            </select>
          </div>

          {/* Exec mode */}
          <div className="settings-row">
            <span className="settings-label">Command Exec</span>
            <select
              className="settings-value"
              value={profile.exec_mode}
              onChange={e => updateField('exec_mode', e.target.value)}
              style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}
            >
              <option value="open">Open — all commands</option>
              <option value="allowlist">Allowlist — permitted commands only</option>
              <option value="prompt_all">Prompt — ask every time</option>
            </select>
          </div>

          {/* Rate limits */}
          <div className="settings-row">
            <span className="settings-label">File Reads / min</span>
            <input
              type="number"
              className="settings-value"
              value={profile.max_file_reads_per_min}
              onChange={e => updateField('max_file_reads_per_min', parseInt(e.target.value) || 0)}
              style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', width: 80 }}
              min={0}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">File Writes / min</span>
            <input
              type="number"
              className="settings-value"
              value={profile.max_file_writes_per_min}
              onChange={e => updateField('max_file_writes_per_min', parseInt(e.target.value) || 0)}
              style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', width: 80 }}
              min={0}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">Exec Commands / min</span>
            <input
              type="number"
              className="settings-value"
              value={profile.max_exec_per_min}
              onChange={e => updateField('max_exec_per_min', parseInt(e.target.value) || 0)}
              style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', width: 80 }}
              min={0}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">Network Calls / min</span>
            <input
              type="number"
              className="settings-value"
              value={profile.max_network_per_min}
              onChange={e => updateField('max_network_per_min', parseInt(e.target.value) || 0)}
              style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', width: 80 }}
              min={0}
            />
          </div>

          {/* Anomaly threshold */}
          <div className="settings-row">
            <span className="settings-label">Anomaly Sensitivity</span>
            <div className="settings-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range"
                min={1}
                max={100}
                value={profile.anomaly_threshold}
                onChange={e => updateField('anomaly_threshold', parseInt(e.target.value) || 50)}
                style={{ width: 120 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 24 }}>{profile.anomaly_threshold}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Section: Permission Rules ──

function PermissionRulesSection() {
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState({ agent_id: '', resource_type: 'file_path', resource_value: '', action: 'allow' as 'allow' | 'deny' | 'prompt', scope: 'global', description: '' });

  const loadRules = useCallback(() => {
    setLoading(true);
    invoke<PermissionRule[]>('security_get_rules', { agentId: undefined })
      .then(setRules)
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const handleAddRule = async () => {
    if (!newRule.resource_value) return;
    try {
      await invoke('security_add_rule', {
        agentId: newRule.agent_id || undefined,
        resourceType: newRule.resource_type,
        resourceValue: newRule.resource_value,
        action: newRule.action,
        scope: newRule.scope,
        description: newRule.description || undefined,
      });
      setShowAdd(false);
      setNewRule({ agent_id: '', resource_type: 'file_path', resource_value: '', action: 'allow', scope: 'global', description: '' });
      loadRules();
    } catch (err) {
      console.error('[Security] Failed to add rule:', err);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await invoke('security_delete_rule', { ruleId });
      loadRules();
    } catch (err) {
      console.error('[Security] Failed to delete rule:', err);
    }
  };

  const actionColors: Record<string, string> = { allow: '#22c55e', deny: '#ef4444', prompt: '#f59e0b' };

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        🔐 Permission Rules
        <button
          className="settings-button"
          onClick={() => setShowAdd(!showAdd)}
          style={{ marginLeft: 12, fontSize: 12, padding: '2px 8px' }}
        >
          {showAdd ? '✕ Cancel' : '+ Add Rule'}
        </button>
      </div>

      {showAdd && (
        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Agent ID (empty = all)"
              value={newRule.agent_id}
              onChange={e => setNewRule(r => ({ ...r, agent_id: e.target.value }))}
              style={{ flex: 1, background: 'var(--surface-1)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}
            />
            <select
              value={newRule.resource_type}
              onChange={e => setNewRule(r => ({ ...r, resource_type: e.target.value }))}
              style={{ background: 'var(--surface-1)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}
            >
              <option value="file_path">File Path</option>
              <option value="network_domain">Network Domain</option>
              <option value="exec_command">Command</option>
              <option value="api_endpoint">API Endpoint</option>
              <option value="browser_domain">Browser Domain</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Resource value (e.g. /home/*, *.example.com)"
              value={newRule.resource_value}
              onChange={e => setNewRule(r => ({ ...r, resource_value: e.target.value }))}
              style={{ flex: 1, background: 'var(--surface-1)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}
            />
            <select
              value={newRule.action}
              onChange={e => setNewRule(r => ({ ...r, action: e.target.value as any }))}
              style={{ background: 'var(--surface-1)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}
            >
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
              <option value="prompt">Prompt</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Description (optional)"
              value={newRule.description}
              onChange={e => setNewRule(r => ({ ...r, description: e.target.value }))}
              style={{ flex: 1, background: 'var(--surface-1)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}
            />
            <button
              className="settings-button"
              onClick={handleAddRule}
              style={{ background: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e40' }}
            >
              ✓ Save
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
      ) : rules.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No permission rules defined. Agents have unrestricted access.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rules.map(rule => (
            <div key={rule.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              background: 'var(--surface-2)', borderRadius: 6, fontSize: 13,
            }}>
              <span style={{
                background: actionColors[rule.action] + '20',
                color: actionColors[rule.action],
                borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600,
                textTransform: 'uppercase',
              }}>
                {rule.action}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{rule.resource_type}</span>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', flex: 1 }}>{rule.resource_value}</span>
              {rule.agent_id && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({rule.agent_id})</span>}
              {rule.description && <span style={{ color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic' }}>{rule.description}</span>}
              {!rule.is_system && (
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                  title="Delete rule"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section: Anomaly Rules ──

function AnomalyRulesSection() {
  const [rules, setRules] = useState<AnomalyRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<AnomalyRule[]>('security_get_anomaly_rules', { agentId: undefined })
      .then(setRules)
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="settings-section">
      <div className="settings-section-title">🔍 Anomaly Detection Rules</div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
      ) : rules.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No anomaly rules configured.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rules.map(rule => (
            <div key={rule.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              background: 'var(--surface-2)', borderRadius: 6, fontSize: 13,
              opacity: rule.enabled ? 1 : 0.5,
            }}>
              <span style={{
                background: rule.severity === 'critical' ? '#ef444420' : rule.severity === 'high' ? '#f59e0b20' : '#3b82f620',
                color: rule.severity === 'critical' ? '#ef4444' : rule.severity === 'high' ? '#f59e0b' : '#3b82f6',
                borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 600,
                textTransform: 'uppercase',
              }}>
                {rule.severity}
              </span>
              <span style={{ color: 'var(--text-primary)', flex: 1 }}>{rule.rule_type.replace(/_/g, ' ')}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                threshold: {rule.threshold} | {rule.window_seconds}s window
              </span>
              <span style={{ color: rule.enabled ? '#22c55e' : '#ef4444', fontSize: 11 }}>
                {rule.enabled ? 'Active' : 'Disabled'}
              </span>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        Run scans manually from the <span style={{ color: 'var(--text-secondary)' }}>Security Center</span> dashboard.
      </p>
    </div>
  );
}

// ── Main Export ──

export default function SecuritySettings() {
  return (
    <>
      <AgentSecurityProfileSection />
      <PermissionRulesSection />
      <AnomalyRulesSection />
    </>
  );
}
