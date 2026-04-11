import { useState, useCallback } from 'react';
import type { AgentStatusInfo } from '../hooks/useAgentStatus';
import '../styles-agent-status.css';

interface AgentStatusPanelProps {
  statuses: AgentStatusInfo[];
  onClose: () => void;
  onOpenApp?: (agentId: string) => void;
}

export default function AgentStatusPanel({ statuses, onClose, onOpenApp }: AgentStatusPanelProps) {
  const handleItemClick = useCallback((agentId: string) => {
    onOpenApp?.(agentId);
    onClose();
  }, [onOpenApp, onClose]);

  return (
    <div className="agent-status-panel">
      <button className="status-panel-close" onClick={onClose}>✕</button>
      <div className="status-panel-title">
        ◈ Team Status
      </div>
      {statuses.length === 0 ? (
        <div className="status-item-empty">No agents to report on yet.</div>
      ) : (
        statuses.map((s) => (
          <div
            key={s.agentId}
            className="status-item"
            onClick={() => handleItemClick(s.agentId)}
          >
            <span className="status-item-emoji">{s.emoji}</span>
            <div className="status-item-text">
              <div className="status-item-label">
                {s.name}
                {s.badgeType === 'attention' && (
                  <span className="pattern-tag increasing">Needs attention</span>
                )}
                {s.badgeType === 'celebration' && (
                  <span className="pattern-tag decreasing">✓</span>
                )}
              </div>
              <div className="status-item-value">
                {s.statusText}
                {s.details && s.details !== s.statusText && ` — ${s.details}`}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
