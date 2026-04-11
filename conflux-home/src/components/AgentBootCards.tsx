import { useState, useEffect, useRef } from 'react';
import { playHeartbeat } from '../lib/sound';
import { useAgentStatus } from '../hooks/useAgentStatus';
import '../styles-agent-boot-cards.css';

interface AgentBootCardsProps {
  userId: string;
  members?: any[];
  onComplete: () => void;
}

interface SimpleAgentStatus {
  agentId: string;
  emoji: string;
  name: string;
  statusText: string;
}

export default function AgentBootCards({ userId, members, onComplete }: AgentBootCardsProps) {
  const member_id = members?.[0]?.id;
  const { statusList, loading } = useAgentStatus(userId, member_id || undefined);
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const hasStarted = useRef(false);
  const [simpleStatuses, setSimpleStatuses] = useState<SimpleAgentStatus[]>([]);

  // Convert full status to simple format for display
  useEffect(() => {
    if (statusList.length > 0) {
      setSimpleStatuses(statusList.map(s => ({
        agentId: s.agentId,
        emoji: s.emoji,
        name: s.name,
        statusText: s.statusText,
      })));
    }
  }, [statusList]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    playHeartbeat();

    // Start fade-out after 2.5 seconds regardless of load state
    const fadeTimer = setTimeout(() => {
      setFading(true);
      setTimeout(() => {
        setVisible(false);
        onComplete();
      }, 500);
    }, 2500);

    // If data loads quickly, we're set. If not, simpleStatuses will stay empty until it does (still fine to show empties until fade)
    return () => clearTimeout(fadeTimer);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div className={`agent-boot-cards-overlay ${fading ? 'fading' : ''}`}>
      <button
        className="agent-boot-skip"
        onClick={() => { setFading(true); setTimeout(() => { setVisible(false); onComplete(); }, 500); }}
        title="Skip to desktop"
      >
        Skip
      </button>
      <div className="agent-boot-cards-container">
        {simpleStatuses.length === 0 ? (
          <div className="agent-boot-card">
            <div className="agent-boot-card-emoji">🤖</div>
            <div className="agent-boot-card-content">
              <div className="agent-boot-card-name">Conflux</div>
              <div className="agent-boot-card-status">Your team is starting up...</div>
            </div>
          </div>
        ) : (
          simpleStatuses.map((agent, index) => (
            <div
              key={agent.agentId}
              className="agent-boot-card"
              style={{ animationDelay: `${index * 150}ms` }}
            >
              <div className="agent-boot-card-emoji">{agent.emoji}</div>
              <div className="agent-boot-card-content">
                <div className="agent-boot-card-name">{agent.name}</div>
                <div className="agent-boot-card-status">{agent.statusText}</div>
              </div>
            </div>
          ))
        )}
        <div className="agent-boot-team-ready">Your team is ready.</div>
      </div>
    </div>
  );
}
