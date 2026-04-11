import { useMemo } from 'react';
import type { Agent } from '../types';

interface ControlRoomProps {
  agents: Agent[];
  onNavigate: (appId: string) => void;
  onOpenChat: (agentId: string) => void;
}

const AGENT_COLORS: Record<string, string> = {
  conflux: '#22d3ee',
  helix: '#8b5cf6',
  forge: '#f97316',
  prism: '#3b82f6',
  spectra: '#ec4899',
  luma: '#eab308',
  pulse: '#10b981',
  hearth: '#f59e0b',
  orbit: '#8b5cf6',
  horizon: '#3b82f6',
  current: '#f1f5f9',
  story: '#991b1b',
  echo: '#14b8a6',
  foundation: '#6b7280',
  catalyst: '#a855f7',
  vector: '#ef4444',
  quanta: '#22c55e',
};

const DEFAULT_COLOR = '#60a5fa';

const AGENT_APP_MAP: Record<string, string> = {
  pulse: 'budget',
  hearth: 'kitchen',
  orbit: 'life',
  horizon: 'dreams',
  current: 'feed',
  story: 'games',
  echo: 'diary',
  foundation: 'home',
};

// Hub (Conflux/Conflux) at center, others around it
const ORB_POSITIONS: Record<string, { x: number; y: number }> = {
  conflux:   { x: 50, y: 45 },
  helix:    { x: 22, y: 28 },
  forge:    { x: 78, y: 28 },
  prism:    { x: 30, y: 65 },
  spectra:  { x: 70, y: 65 },
  luma:     { x: 18, y: 52 },
  pulse:    { x: 82, y: 52 },
  hearth:   { x: 35, y: 18 },
  orbit:    { x: 65, y: 80 },
  horizon:  { x: 15, y: 78 },
  current:  { x: 85, y: 18 },
  catalyst: { x: 50, y: 78 },
  vector:   { x: 50, y: 12 },
  quanta:   { x: 38, y: 42 },
};

function getOrbPosition(agent: Agent): { x: number; y: number } {
  if (ORB_POSITIONS[agent.id]) return ORB_POSITIONS[agent.id];
  let hash = 0;
  for (const ch of agent.id) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return {
    x: 15 + (Math.abs(hash) % 70),
    y: 15 + (Math.abs(hash >> 8) % 70),
  };
}

function getOrbSize(agent: Agent): string {
  if (agent.id === 'conflux' || agent.id === 'vector') return 'orb-hub';
  if (agent.status === 'working') return 'orb-large';
  if (agent.status === 'thinking') return 'orb-medium';
  return 'orb-small';
}

// Display name: Conflux → Conflux for the user
function getDisplayName(agent: Agent): string {
  if (agent.id === 'conflux') return 'Conflux';
  return agent.name;
}

export default function ControlRoom({ agents, onNavigate, onOpenChat }: ControlRoomProps) {
  const connections = useMemo(() => {
    const conns: [Agent, Agent][] = [];
    const hub = agents.find(a => a.id === 'conflux');
    if (!hub) return conns;

    // Hub connects to all active agents
    for (const agent of agents) {
      if (agent.id !== 'conflux' && agent.status !== 'offline') {
        conns.push([hub, agent]);
      }
    }

    // Work agents chain
    const workAgents = agents.filter(a =>
      ['helix', 'forge', 'prism', 'spectra', 'luma', 'quanta'].includes(a.id)
    );
    for (let i = 0; i < workAgents.length - 1; i++) {
      conns.push([workAgents[i], workAgents[i + 1]]);
    }

    return conns;
  }, [agents]);

  function handleOrbClick(agent: Agent) {
    const appId = AGENT_APP_MAP[agent.id];
    if (appId) {
      onNavigate(appId);
    } else {
      onOpenChat(agent.id);
    }
  }

  const visibleAgents = agents.filter(a => a.status !== 'offline');

  return (
    <div className="neural-mesh mesh-breathe" style={{ background: '#06060c' }}>
      {/* SVG Mesh Lines — raw numbers match viewBox 0 0 100 100 */}
      <svg
        className="mesh-connections"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {connections.map(([from, to], i) => {
          const p1 = getOrbPosition(from);
          const p2 = getOrbPosition(to);
          const isActive = from.status === 'working' || to.status === 'working';
          return (
            <line
              key={i}
              className={`mesh-connection ${isActive ? 'active' : ''}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
            />
          );
        })}
      </svg>

      {/* Agent Orbs */}
      {visibleAgents.map((agent, index) => {
        const pos = getOrbPosition(agent);
        const color = AGENT_COLORS[agent.id] || DEFAULT_COLOR;
        const sizeClass = getOrbSize(agent);
        const driftClass = `orb-drift-${(index % 4) + 1}`;
        const displayName = getDisplayName(agent);

        return (
          <div
            key={agent.id}
            className={`agent-orb ${sizeClass} orb-${agent.status} ${driftClass}`}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onClick={() => handleOrbClick(agent)}
          >
            <div
              className="orb-glow"
              style={{ background: `radial-gradient(circle, ${color}40, transparent 70%)` }}
            />
            <div className="orb-ring" style={{ borderColor: color }} />
            <div
              className="orb-core"
              style={{
                background: `radial-gradient(circle at 40% 35%, ${color}30, ${color}10)`,
                boxShadow: `0 0 20px ${color}20, inset 0 0 15px ${color}10`,
              }}
            >
              {agent.id === 'conflux' ? '⚡' : agent.emoji}
            </div>
            <div className={`orb-status-dot status-${agent.status}`} />
            <div className="orb-label">{displayName}</div>
          </div>
        );
      })}
    </div>
  );
}
