import React, { useEffect, useState } from 'react';
import type { LifeNudge } from '../types';
import { playOrbitMorningBrief } from '../lib/sound';

interface AlertConsoleProps {
  nudges: LifeNudge[];
  onDismiss: (nudgeId: string) => void;
}

const NUDGE_ICONS: Record<string, string> = {
  overdue: '🚨',
  streak: '🔥',
  energy: '⚡',
  suggestion: '💡',
  celebrate: '🎉',
};

const NUDGE_CLASSES: Record<string, string> = {
  overdue: 'mc-alert-item urgent',
  streak: 'mc-alert-item streak',
  energy: 'mc-alert-item suggestion',
  suggestion: 'mc-alert-item suggestion',
  celebrate: 'mc-alert-item streak',
};

export function AlertConsole({ nudges, onDismiss }: AlertConsoleProps) {
  const activeNudges = nudges.filter(n => !n.dismissed);
  const [isVisible, setIsVisible] = useState(false);
  
  // Slide in animation on mount
  useEffect(() => {
    if (activeNudges.length > 0) {
      setTimeout(() => setIsVisible(true), 100);
    }
  }, [activeNudges.length]);
  
  if (activeNudges.length === 0) {
    return null;
  }

  return (
    <div className={`mc-alert-console${isVisible ? ' visible' : ''}`}>
      <div className="mc-alert-header">
        <span className="mc-alert-icon">📡</span>
        <span className="mc-alert-title">Alert Console</span>
        <span className="mc-panel-count">{activeNudges.length} alerts</span>
      </div>
      
      {activeNudges.map(nudge => (
        <div key={nudge.id} className={NUDGE_CLASSES[nudge.nudge_type] || 'mc-alert-item'}>
          <span className="mc-alert-emoji">{NUDGE_ICONS[nudge.nudge_type] ?? '💬'}</span>
          <div className="mc-flex mc-flex-col" style={{ flex: 1 }}>
            <span className="mc-alert-text">{nudge.message}</span>
            {nudge.action_label && (
              <span style={{ 
                fontSize: '11px', 
                color: 'var(--mc-primary)', 
                marginTop: '4px',
                cursor: 'pointer'
              }}>
                → {nudge.action_label}
              </span>
            )}
          </div>
          <button 
            className="mc-alert-dismiss" 
            onClick={() => onDismiss(nudge.id)}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}