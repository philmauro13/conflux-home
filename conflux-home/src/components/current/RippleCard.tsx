import React, { useState } from 'react';
import type { RippleSignal } from '../../types';

interface RippleCardProps {
  ripples: RippleSignal[];
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  return (
    <span className="current-ripple-confidence">
      {confidence}% confidence
    </span>
  );
}

function SingleRippleCard({ ripple }: { ripple: RippleSignal }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="current-ripple-card">
      <ConfidenceBadge confidence={ripple.confidence} />
      <h3 className="current-ripple-title">{ripple.title}</h3>
      <p className="current-ripple-body">{ripple.description}</p>
      <span className="current-ripple-tag">{ripple.category}</span>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--teal, #00ccaa)',
          cursor: 'pointer',
          fontSize: '0.8rem',
          padding: '4px 0',
          opacity: 0.8,
        }}
      >
        {expanded ? '▾ Hide why it matters' : '▸ Why it could matter'}
      </button>
      {expanded && (
        <p style={{ fontSize: '0.85rem', opacity: 0.75, marginTop: '4px' }}>
          {ripple.why_it_could_matter}
        </p>
      )}
    </div>
  );
}

export default function RippleCard({ ripples }: RippleCardProps) {
  if (!ripples || ripples.length === 0) {
    return (
      <div className="current-ripples">
        <div className="current-ripples-header">
          <h3>Ripple Radar</h3>
        </div>
        <p style={{ opacity: 0.5, padding: '1rem' }}>No signals detected yet. Scanning...</p>
      </div>
    );
  }

  return (
    <div className="current-ripples">
      <div className="current-ripples-header">
        <h3>Ripple Radar</h3>
        <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>
          {ripples.length} signal{ripples.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="current-ripple-cards">
        {ripples.map((ripple) => (
          <SingleRippleCard key={ripple.id} ripple={ripple} />
        ))}
      </div>
    </div>
  );
}
