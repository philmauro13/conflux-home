import { useState } from 'react';

interface MissionLogProps {
  narrative: string | null;
  narrating: boolean;
  onNarrate: () => void;
}

export default function MissionLog({ narrative, narrating, onNarrate }: MissionLogProps) {
  return (
    <div className="mission-log">
      <div className="mission-log-header">
        <h3 className="mission-log-title">MISSION LOG</h3>
        <button
          className="mission-log-btn"
          onClick={onNarrate}
          disabled={narrating}
        >
          {narrating ? '✨ Generating...' : '🔄 Regenerate'}
        </button>
      </div>
      <div className="mission-log-content">
        {narrating ? (
          <p className="mission-log-narrating">Analyzing trajectory...</p>
        ) : narrative ? (
          <p className="mission-log-text">{narrative}</p>
        ) : (
          <p className="mission-log-empty">
            Initialize AI narrative to receive mission briefing.
          </p>
        )}
      </div>
    </div>
  );
}
