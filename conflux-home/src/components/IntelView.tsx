// IntelView — live agent activity monitor (INTEL section of desktop)
// Shows: agent activity indicators, live beat timeline, system stats
// Wired to BeatEventBus — every beat fires visibly

import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ConfluxPresence } from './conflux';
import { triggerFairyNudge } from '../lib/triggerFairyNudge';
import { AGENTS, useBeatTimeline, useAgentActivity, emitBeat, startDemoBeats, type BeatEvent } from '../lib/beatBus';
import './IntelView.css';

interface AgentFromDB {
  id: string;
  name: string;
  emoji: string;
  role: string;
  soul: string | null;
  instructions: string | null;
  model_alias: string;
  tier: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Agent row ─────────────────────────────────────────────────────────────────
interface DisplayAgent {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

function AgentRow({ agent }: { agent: DisplayAgent }) {
  const { lastActive, isActive } = useAgentActivity(agent.id);
  const ago = lastActive ? timeAgo(lastActive) : '—';

  return (
    <div className={`intel-agent ${isActive ? 'intel-agent-active' : ''}`}>
      <div className="intel-agent-dot" style={{ '--agent-color': agent.color } as React.CSSProperties} />
      <span className="intel-agent-emoji">{agent.emoji}</span>
      <span className="intel-agent-name">{agent.label}</span>
      <span className="intel-agent-status">
        {isActive ? (
          <span className="intel-status-working">
            <span className="intel-working-dot" />
            Working
          </span>
        ) : (
          <span className="intel-status-idle">Active {ago}</span>
        )}
      </span>
    </div>
  );
}

// ── Beat event row ─────────────────────────────────────────────────────────────
function BeatRow({ event, index }: { event: BeatEvent; index: number }) {
  const agent = AGENTS.find(a => a.id === event.agentId);
  const ago = timeAgo(event.timestamp);

  return (
    <div
      className={`intel-beat intel-beat-${event.type}`}
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      <div className="intel-beat-agent-icon" style={{ color: agent?.color ?? '#fff' }}>
        {agent?.emoji ?? '⚡'}
      </div>
      <div className="intel-beat-body">
        <span className="intel-beat-action">
          <strong>{event.agentLabel}</strong> {event.action}
        </span>
        {event.detail && (
          <span className="intel-beat-detail">{event.detail}</span>
        )}
      </div>
      <div className="intel-beat-time">{ago}</div>
    </div>
  );
}

// ── Live pulse ring around NeuralBrain ─────────────────────────────────────────
function BrainPulseRing({ beatCount }: { beatCount: number }) {
  return (
    <div className="intel-brain-ring">
      <div className="intel-ring-inner">
        <ConfluxPresence
          command={{
            mode: 'idle',
            label: 'INTEL',
            scale: 1,
            turbulence: 0.3,
            driftAxis: [0, 0, 0] as [number, number, number],
            wobble: 0.4,
            lobeSpread: 0.8,
            speechRingIntensity: 0.6,
            activeLobes: ['memory', 'reasoning'] as const,
            glowBoost: 1.4,
            pulseRate: 1.2,
            palette: {
              node: '#3a2a6b',
              hot: '#7c5aad',
              line: '#9d7ac7',
              glow: '#c4a3f0',
              aura: '#1a1040',
            },
          }}
          pulseImpulse={beatCount}
          fairyExpression="idle"
          style={{ width: 160, height: 160 }}
        />
      </div>
      {/* Outer pulse ring */}
      <div className="intel-ring-outer" />
    </div>
  );
}

// ── Stats bar ──────────────────────────────────────────────────────────────────
function StatsBar({ events }: { events: BeatEvent[] }) {
  const today = new Date().toDateString();
  const todayEvents = events.filter(e => new Date(e.timestamp).toDateString() === today);

  const agentCounts = todayEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.agentId] = (acc[e.agentId] ?? 0) + 1;
    return acc;
  }, {});

  const topAgent = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0];
  const topAgentDef = AGENTS.find(a => a.id === topAgent?.[0]);

  return (
    <div className="intel-stats">
      <div className="intel-stat">
        <span className="intel-stat-value">{todayEvents.length}</span>
        <span className="intel-stat-label">beats today</span>
      </div>
      <div className="intel-stat-divider" />
      <div className="intel-stat">
        <span className="intel-stat-value">{events.length > 0 ? timeAgo(events[0].timestamp) : '—'}</span>
        <span className="intel-stat-label">last beat</span>
      </div>
      <div className="intel-stat-divider" />
      <div className="intel-stat">
        <span className="intel-stat-value" style={{ color: topAgentDef?.color }}>
          {topAgentDef ? `${topAgentDef.emoji} ${topAgent[1]}` : '—'}
        </span>
        <span className="intel-stat-label">most active</span>
      </div>
    </div>
  );
}

// ── Main IntelView ─────────────────────────────────────────────────────────────
export default function IntelView() {
  const events = useBeatTimeline();
  const [started, setStarted] = useState(false);
  const [activeAgents, setActiveAgents] = useState<AgentFromDB[]>([]);
  const [loading, setLoading] = useState(true);

  // Load active agents from DB so INTEL always reflects the user's selection
  // On fresh launch this may fail while the engine initializes — show localStorage as fallback
  const loadActiveAgents = async (retries = 3) => {
    try {
      const allAgents = await invoke<AgentFromDB[]>('engine_get_agents');
      const active = allAgents.filter(a => a.is_active);
      setActiveAgents(active);
      // Sync localStorage so we have a fallback if next launch is also before engine init
      localStorage.setItem('conflux-active-agents', JSON.stringify(active.map(a => a.id)));
    } catch (err) {
      console.warn('[IntelView] engine_get_agents failed, trying localStorage fallback:', err);
      // Engine not ready yet — try localStorage (written by AgentsView on every toggle)
      try {
        const stored = localStorage.getItem('conflux-selected-agents');
        if (stored) {
          const selectedIds: string[] = JSON.parse(stored);
          const allAgents = await invoke<AgentFromDB[]>('engine_get_agents');
          // Filter to only the selected IDs that are also in the DB
          const active = allAgents.filter(a => selectedIds.includes(a.id) && a.is_active);
          setActiveAgents(active.length > 0 ? active : allAgents.filter(a => selectedIds.includes(a.id)));
        }
      } catch (_e) {
        // localStorage also failed — nothing we can do, keep empty state
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveAgents();
    // Listen for agent selection changes from AgentsView so INTEL updates in real time
    const handler = () => loadActiveAgents();
    window.addEventListener('conflux:agents-selected', handler);
    return () => window.removeEventListener('conflux:agents-selected', handler);
  }, []);

  useEffect(() => {
    if (!started) {
      setStarted(true);
      startDemoBeats(45000);
    }
  }, [started]);

  // Pulse counter for NeuralBrain
  const beatCountRef = useRef(0);
  const [beatPulse, setBeatPulse] = useState(0);

  useEffect(() => {
    if (events.length === 0) return;
    beatCountRef.current += 1;
    setBeatPulse(beatCountRef.current);
    // Also emit a fairy nudge for interesting beats
    const latest = events[0];
    if (latest.type === 'success') {
      triggerFairyNudge({
        id: `beat-${latest.id}`,
        text: `${latest.agentLabel}: ${latest.action}`,
        app: latest.agentId,
        priority: 'info',
      });
    }
  }, [events.length]);

  // Build a lookup from AGENTS for display metadata (emoji, color)
  const agentMeta = Object.fromEntries(AGENTS.map(a => [a.id, a])) as Record<string, typeof AGENTS[number]>;
  // or simpler: just use find() in the map
  const getMeta = (id: string) => AGENTS.find(a => a.id === id);

  return (
    <div className="intel-view">
      {/* Header */}
      <div className="intel-header">
        <div className="intel-title">INTEL</div>
        <div className="intel-live-indicator">
          <span className="intel-live-dot" />
          Live
        </div>
      </div>

      {/* NeuralBrain + Stats */}
      <div className="intel-brain-section">
        <BrainPulseRing beatCount={beatPulse} />
        <StatsBar events={events} />
      </div>

      {/* Agent status grid — only DB-active agents */}
      <div className="intel-section-label">AGENT STATUS</div>
      <div className="intel-agents">
        {loading ? (
          <div className="intel-empty">Loading agents...</div>
        ) : activeAgents.length === 0 ? (
          <div className="intel-empty">No active agents. Enable agents in Settings.</div>
        ) : (
          activeAgents.map(agent => {
            const meta = AGENTS.find(a => a.id === agent.id);
            if (!meta) return null;
            const rowAgent: DisplayAgent = {
              id: agent.id,
              label: agent.name,
              emoji: meta.emoji,
              color: meta.color,
            };
            return (
              <AgentRow
                key={agent.id}
                agent={rowAgent}
              />
            );
          })
        )}
      </div>

      {/* Beat timeline */}
      <div className="intel-section-label">ACTIVITY FEED</div>
      <div className="intel-feed">
        {events.length === 0 ? (
          <div className="intel-empty">
            <span className="intel-empty-spinner" />
            Waiting for agent activity...
          </div>
        ) : (
          events.slice(0, 12).map((event, i) => (
            <BeatRow key={event.id} event={event} index={i} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
