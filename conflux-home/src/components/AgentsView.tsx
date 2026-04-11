import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AGENT_PROFILES } from '../data/agent-descriptions';
import '../styles-agents.css';

interface Agent {
  id: string; name: string; emoji: string; role: string;
  soul: string | null; instructions: string | null;
  model_alias: string; tier: string; is_active: boolean;
  created_at: string; updated_at: string;
}

type Tab = 'agents' | 'persona' | 'files' | 'manage';
type FileTab = 'soul' | 'instructions';

const MODELS = [
  { value: 'conflux-fast', label: 'Fast (Llama 3.1 8B)', desc: 'Quick responses, good for chat' },
  { value: 'conflux-smart', label: 'Smart (Llama 3.3 70B)', desc: 'Deeper reasoning, slower' },
];

const TABS: { key: Tab; label: string }[] = [
  { key: 'agents', label: '👥 My Agents' },
  { key: 'persona', label: '🧠 Persona' },
  { key: 'files', label: '📖 Files' },
  { key: 'manage', label: '⚙️ Manage' },
];

const workAgents = AGENT_PROFILES.filter((a) => !a.comingSoon);

function loadSelectedIds(): string[] {
  try { return JSON.parse(localStorage.getItem('conflux-selected-agents') || '[]'); }
  catch { return []; }
}

// ── Agent Selector Row (shared by Persona & Files tabs) ──

function AgentRow({
  agents, selectedId, onSelect,
}: {
  agents: Agent[]; selectedId: string | null; onSelect: (id: string) => void;
}) {
  return (
    <div className="persona-agent-row">
      {agents.map((a) => (
        <button key={a.id}
          className={`persona-agent-btn ${selectedId === a.id ? 'selected' : ''}`}
          onClick={() => onSelect(a.id)}>
          <span>{a.emoji}</span><span>{a.name}</span>
        </button>
      ))}
    </div>
  );
}

// ── Main Component ──

export default function AgentsView() {
  const [tab, setTab] = useState<Tab>('agents');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(loadSelectedIds);
  const [loading, setLoading] = useState(true);

  // Persona state
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [role, setRole] = useState('');
  const [soul, setSoul] = useState('');
  const [instructions, setInstructions] = useState('');
  const [modelAlias, setModelAlias] = useState('conflux-fast');

  // Files state
  const [filesAgentId, setFilesAgentId] = useState<string | null>(null);
  const [fileTab, setFileTab] = useState<FileTab>('soul');

  const loadAgents = useCallback(async () => {
    try { setAgents(await invoke<Agent[]>('engine_get_agents')); }
    catch (err) { console.error('[AgentsView] Failed to load:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  // Populate persona form on selection change
  useEffect(() => {
    const a = agents.find((x) => x.id === personaId);
    if (a) {
      setName(a.name); setEmoji(a.emoji); setRole(a.role);
      setSoul(a.soul || ''); setInstructions(a.instructions || '');
      setModelAlias(a.model_alias); setSaved(false);
    }
  }, [personaId, agents]);

  const toggleAgent = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem('conflux-selected-agents', JSON.stringify(next));
      return next;
    });
  };

  async function saveAgent() {
    if (!personaId) return;
    setSaving(true);
    try {
      await invoke('engine_update_agent', {
        req: { id: personaId, name, emoji, role, soul: soul || null, instructions: instructions || null, model_alias: modelAlias },
      });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
      await loadAgents();
    } catch (err) { console.error('[AgentsView] Save failed:', err); }
    finally { setSaving(false); }
  }

  const resetAll = () => {
    if (!window.confirm('Reset all agents? This clears selections and reloads.')) return;
    localStorage.removeItem('conflux-selected-agents');
    window.location.reload();
  };

  const exportConfig = () => {
    const data = agents.map(({ id, name, emoji, role, soul, instructions, model_alias, tier }) =>
      ({ id, name, emoji, role, soul, instructions, model_alias, tier }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `conflux-agents-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const navigateToMarketplace = () =>
    window.dispatchEvent(new CustomEvent('conflux:navigate', { detail: { viewId: 'marketplace' } }));

  const personaAgent = agents.find((a) => a.id === personaId);
  const filesAgent = agents.find((a) => a.id === filesAgentId);
  const activeCount = selectedIds.length;
  const avgSoulLen = agents.length
    ? Math.round(agents.reduce((s, a) => s + (a.soul?.length || 0), 0) / agents.length) : 0;

  return (
    <div className="agents-hub">
      <div className="agents-header">
        <h1>🧩 Agents</h1>
        <div className="agents-subtitle">Your AI family</div>
      </div>

      <div className="agents-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`agents-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: My Agents ── */}
      {tab === 'agents' && (
        <div className="agents-grid">
          {workAgents.map((profile) => {
            const enabled = selectedIds.includes(profile.id);
            const db = agents.find((a) => a.id === profile.id);
            return (
              <div key={profile.id} className="agent-card"
                style={{ '--agent-color': profile.color } as React.CSSProperties}>
                <div className="agent-avatar">{profile.emoji}</div>
                <div className="agent-name">{profile.name}</div>
                <div className="agent-role">{profile.role}</div>
                <div className="agent-tagline">{profile.tagline}</div>
                <div className="agent-card-footer">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className={`agent-status ${enabled ? 'active' : ''}`} />
                    <button className={`agent-toggle ${enabled ? 'on' : ''}`}
                      onClick={() => toggleAgent(profile.id)} aria-label={enabled ? 'Disable' : 'Enable'}>
                      <span className="toggle-knob" />
                    </button>
                  </div>
                  {db && (
                    <button className="agent-edit-btn"
                      onClick={() => { setPersonaId(db.id); setTab('persona'); }}>
                      Edit Persona
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tab: Persona ── */}
      {tab === 'persona' && (
        <div className="persona-editor">
          <AgentRow agents={agents} selectedId={personaId} onSelect={setPersonaId} />
          {loading && <div className="agents-loading">Loading agents...</div>}
          {personaAgent && (
            <div className="persona-form">
              <div className="persona-basics">
                <div className="persona-field">
                  <label>Emoji</label>
                  <input className="emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={2} />
                </div>
                <div className="persona-field">
                  <label>Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="persona-field">
                  <label>Role</label>
                  <input value={role} onChange={(e) => setRole(e.target.value)} />
                </div>
              </div>
              <div className="persona-field">
                <label>Model</label>
                <div className="persona-model-select">
                  {MODELS.map((opt) => (
                    <button key={opt.value}
                      className={`persona-model-card ${modelAlias === opt.value ? 'selected' : ''}`}
                      onClick={() => setModelAlias(opt.value)}>
                      <div className="model-label">{opt.label}</div>
                      <div className="model-desc">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="persona-field persona-soul">
                <label>Soul (personality & voice)</label>
                <textarea value={soul} onChange={(e) => setSoul(e.target.value)} rows={6}
                  placeholder="Who is this agent? What's their personality, voice, and values?" />
              </div>
              <div className="persona-field">
                <label>Instructions (behavior rules)</label>
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={6}
                  placeholder="What should this agent do? What rules should they follow?" />
              </div>
              <div className="persona-meta">
                Agent ID: {personaAgent.id} · Tier: {personaAgent.tier} · Created:{' '}
                {new Date(personaAgent.created_at).toLocaleDateString()}
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button className={`persona-save ${saved ? 'saved' : ''}`} onClick={saveAgent} disabled={saving}>
                  {saving ? 'Saving...' : saved ? '✓ Saved!' : '💾 Save Changes'}
                </button>
                {saved && <span className="persona-save-msg">Agent persona updated</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Files ── */}
      {tab === 'files' && (
        <div className="files-viewer">
          <div className="files-subtitle">Watch your agents develop</div>
          <AgentRow agents={agents} selectedId={filesAgentId} onSelect={setFilesAgentId} />
          {filesAgent && (
            <>
              <div className="files-tabs">
                <button className={`files-tab ${fileTab === 'soul' ? 'active' : ''}`}
                  onClick={() => setFileTab('soul')}>Soul</button>
                <button className={`files-tab ${fileTab === 'instructions' ? 'active' : ''}`}
                  onClick={() => setFileTab('instructions')}>Instructions</button>
              </div>
              <div className="file-card">
                <div className="file-label">
                  {filesAgent.emoji} {filesAgent.name} — {fileTab === 'soul' ? 'Soul' : 'Instructions'}
                </div>
                {(fileTab === 'soul' ? filesAgent.soul : filesAgent.instructions) ? (
                  <div className="file-content">
                    {fileTab === 'soul' ? filesAgent.soul : filesAgent.instructions}
                  </div>
                ) : (
                  <div className="file-empty">
                    No {fileTab} defined yet. Edit in the Persona tab.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Manage ── */}
      {tab === 'manage' && (
        <div className="manage-section">
          <div className="manage-heading">Manage your AI family</div>
          <div className="manage-actions">
            <button className="manage-action" onClick={navigateToMarketplace}>🛒 Browse Marketplace</button>
            <button className="manage-action" onClick={exportConfig}>📥 Export Agent Config</button>
            <button className="manage-action danger" onClick={resetAll}>↺ Reset All Agents</button>
          </div>
          <div className="manage-stats">
            <h3>Quick Stats</h3>
            <div className="stat-row"><span className="stat-label">Total Agents</span><span className="stat-value">{agents.length}</span></div>
            <div className="stat-row"><span className="stat-label">Active Agents</span><span className="stat-value">{activeCount}</span></div>
            <div className="stat-row"><span className="stat-label">Avg Soul Length</span><span className="stat-value">{avgSoulLen} chars</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
