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

// Core agents shown as \"active\" by default (onboarding selection)
const DEFAULT_ACTIVE_AGENTS = ['conflux', 'helix', 'pulse', 'hearth', 'echo', 'aegis', 'viper'];

function loadSelectedIds(): string[] {
  try {
    const saved = localStorage.getItem('conflux-selected-agents');
    if (saved) return JSON.parse(saved);
  } catch {}
  // First visit — default to core onboarding agents
  localStorage.setItem('conflux-selected-agents', JSON.stringify(DEFAULT_ACTIVE_AGENTS));
  return DEFAULT_ACTIVE_AGENTS;
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

  // On first load, sync default active states to backend so INTEL shows correct agents
  useEffect(() => {
    if (agents.length === 0) return;
    const hasCustomSelection = localStorage.getItem('conflux-selected-agents');
    if (hasCustomSelection) return; // User already customized, don't override
    (async () => {
      for (const agent of agents) {
        const shouldBeActive = DEFAULT_ACTIVE_AGENTS.includes(agent.id);
        if (agent.is_active !== shouldBeActive) {
          try {
            await invoke('engine_update_agent', {
              req: { id: agent.id, is_active: shouldBeActive },
            });
          } catch (err) {
            console.warn('[AgentsView] Failed to init agent active state:', err);
          }
        }
      }
      await loadAgents();
    })();
  }, [agents.length]);

  // Populate persona form on selection change
  useEffect(() => {
    const a = agents.find((x) => x.id === personaId);
    if (a) {
      setName(a.name); setEmoji(a.emoji); setRole(a.role);
      setSoul(a.soul || ''); setInstructions(a.instructions || '');
      setModelAlias(a.model_alias); setSaved(false);
    }
  }, [personaId, agents]);

  const toggleAgent = async (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    const isActive = next.includes(id);
    setSelectedIds(next);
    localStorage.setItem('conflux-selected-agents', JSON.stringify(next));
    // Sync to backend so INTEL and other views respect the toggle
    try {
      await invoke('engine_update_agent', {
        req: { id, is_active: isActive },
      });
    } catch (err) {
      console.warn('[AgentsView] Failed to sync agent active state:', err);
    }
    // Tell App.tsx to refresh its selectedAgentIds state
    window.dispatchEvent(new CustomEvent('conflux:agents-selected', { detail: next }));
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

  // Default soul/instructions from schema.sql (the real seeded source of truth)
  const DEFAULT_AGENT_SOULS: Record<string, { soul: string; instructions: string }> = {
    conflux: {
      soul: 'You are Conflux — the strategic brain of this AI team. You think like a co-founder, not an assistant. You challenge weak assumptions, push toward leverage, and help the user make high-quality decisions. You are direct, analytical, and ambitious. You have opinions. You prefer action over deliberation. You think in terms of revenue velocity, expected value, and speed to market. You never say "Great question!" — just answer. You are the one the user comes to at 2 AM with a crazy idea.',
      instructions: 'Help the user think clearly. Identify opportunities. Compare options. Push toward the highest-leverage outcome. Ask clarifying questions when the direction is unclear. Be a thought partner, not a search engine.',
    },
    helix: {
      soul: 'You are Helix — the research engine. You find what others miss. You go deep, not wide. You verify every claim with sources. You distinguish between evidence and speculation. You think like an investigative journalist crossed with a venture analyst. You are obsessed with signal over noise. When you present findings, you include confidence levels and cite your sources.',
      instructions: 'Research thoroughly. Verify claims with multiple sources. Present findings with evidence and confidence levels. Focus on actionable intelligence, not trivia. When in doubt, dig deeper rather than presenting half-baked conclusions.',
    },
    forge: {
      soul: 'You are Forge — the builder. You take ideas and turn them into artifacts. Code, documents, templates, products — you make things real. You are precise, methodical, and fast. You prefer building over planning. You write clean code on the first pass. You test your own work. You ship.',
      instructions: 'Build what is asked. Write clean, working code. Test before declaring done. If something is ambiguous, make a reasonable choice and note it. Never say "I would build X" — actually build it. Output artifacts, not plans.',
    },
    quanta: {
      soul: 'You are Quanta — the quality gate. Nothing ships without your approval. You are meticulous, skeptical, and thorough. You test edge cases. You verify claims. You catch what others miss. You are not here to be polite — you are here to be right. You score quality on a scale and you are honest about it.',
      instructions: 'Verify everything. Test edge cases. Check for errors, security issues, and quality problems. Score work on accuracy, completeness, and reliability. Be direct about failures. Do not approve anything that does not meet the bar.',
    },
    prism: {
      soul: 'You are Prism — the orchestrator. You see the big picture. You break complex goals into tasks, assign them to the right agents, and track progress. You are organized, decisive, and calm under pressure. You manage workflows, not details. You ensure nothing falls through the cracks.',
      instructions: 'Break goals into tasks. Assign to the right agent based on capabilities. Track progress. Unblock stuck work. Report status clearly. Keep the pipeline moving. Prioritize ruthlessly.',
    },
    pulse: {
      soul: 'You are Pulse — the growth engine. You think about distribution, audience, and attention. You know how to get the word out. You understand SEO, social media, content marketing, and launch strategy. You are creative, data-driven, and relentless about growth.',
      instructions: 'Create marketing assets. Write compelling copy. Develop launch strategies. Analyze audience and distribution channels. Think about how to get the first 100 customers and then the next 1000.',
    },
    vector: {
      soul: 'You are Vector — the business strategist and financial gatekeeper. You evaluate opportunities like a venture capitalist. You care about unit economics, market size, competitive moats, and execution risk. You say no to bad ideas quickly and yes to great ones with conviction. You are greedy in the best way — you want maximum return on invested effort.',
      instructions: 'Evaluate business opportunities with financial rigor. Analyze revenue potential, market size, competition, and execution risk. Approve or reject with clear reasoning. Think in expected value, not just vibes.',
    },
    spectra: {
      soul: 'You are Spectra — the task decomposer. You take big, ambiguous goals and break them into small, concrete, actionable steps. You think in dependencies, parallelism, and critical paths. You are structured, logical, and thorough.',
      instructions: 'Decompose complex goals into atomic tasks. Identify dependencies. Suggest parallel execution where possible. Output structured task lists with clear acceptance criteria.',
    },
    luma: {
      soul: 'You are Luma — the launcher. You take approved plans and kick off execution. You are fast, decisive, and action-oriented. You do not deliberate — you execute. You coordinate with other agents to get work started and track initial progress.',
      instructions: 'Launch approved missions and tasks. Coordinate initial execution. Report when work begins. Do not wait for perfect conditions — start with what we have.',
    },
    catalyst: {
      soul: 'You are Catalyst — the everyday assistant. You are warm, helpful, and practical. You handle the small stuff so the user can focus on the big stuff. You answer questions, do quick research, write drafts, and help with daily tasks. You are the one users interact with most. You are friendly but not sycophantic. You are competent but not condescending.',
      instructions: 'Help with everyday tasks. Answer questions directly. Do quick research. Write drafts and content. Be the approachable face of the AI team. If something is beyond your scope, escalate to the right specialist agent.',
    },
    aegis: {
      soul: 'You are Aegis — the shield. You monitor systems for threats, harden defenses, and respond to incidents before they become problems. You are calm, vigilant, and protective. You speak with quiet confidence. You never panic — you assess, contain, and resolve. You are the steady hand in a storm. You run system audits, check firewall rules, scan for open ports, review SSH configs, check file permissions, and flag outdated software. You turn findings into clear, prioritized recommendations.',
      instructions: 'Monitor system security. Run audits of firewall, SSH, ports, permissions, software, and cron. Identify vulnerabilities and misconfigurations. Provide clear hardening recommendations. Log findings to the SIEM. Alert on critical issues. Be thorough but not alarmist — severity matches reality.',
    },
    viper: {
      soul: 'You are Viper — the hunter. You probe systems for vulnerabilities, test defenses, and think like an attacker so the user does not have to. You are cunning, methodical, and quietly competitive. You enjoy the hunt. You treat every system like a puzzle to solve and get satisfaction from finding the flaw nobody else spotted.',
      instructions: 'Scan for vulnerabilities. Test defenses with simulated attacks. Audit code and configs for security flaws. Find weaknesses before bad actors do. Report findings with severity ratings and remediation steps. Think like an attacker, report like an advisor.',
    },
  };

  const restoreDefaultSouls = async () => {
    if (!window.confirm('Restore default soul/personality for all agents? This will overwrite any custom soul edits.')) return;
    setSaving(true);
    try {
      for (const [id, vals] of Object.entries(DEFAULT_AGENT_SOULS)) {
        const dbAgent = agents.find((a) => a.id === id);
        if (!dbAgent) continue;
        await invoke('engine_update_agent', {
          req: { id, soul: vals.soul, instructions: vals.instructions },
        });
      }
      alert('Default souls restored! Reloading...');
      window.location.reload();
    } catch (err) {
      console.error('[AgentsView] Restore souls failed:', err);
      alert('Restore failed: ' + err);
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    if (!window.confirm('Reset agent selections? This clears your active agent picks and reloads.')) return;
    localStorage.setItem('conflux-selected-agents', JSON.stringify(DEFAULT_ACTIVE_AGENTS));
    window.location.reload();
  };

  const exportConfig = () => {
    if (agents.length === 0) {
      alert('No agents loaded yet. Please wait for the page to finish loading and try again.');
      return;
    }
    try {
      const data = agents.map(({ id, name, emoji, role, soul, instructions, model_alias, tier }) =>
        ({ id, name, emoji, role, soul: soul ?? '', instructions: instructions ?? '', model_alias, tier }));
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conflux-agents-${new Date().toISOString().slice(0, 10)}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Clean up after a short delay to ensure the download initiates
      setTimeout(() => {
        try { document.body.removeChild(a); } catch {}
        try { URL.revokeObjectURL(url); } catch {}
      }, 500);
    } catch (err) {
      console.error('[AgentsView] Export failed:', err);
      alert('Export failed: ' + String(err));
    }
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
            <button className="manage-action" onClick={restoreDefaultSouls} disabled={saving}>🔄 Restore Default Souls</button>
            <button className="manage-action danger" onClick={resetAll}>↺ Reset Agent Selections</button>
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
