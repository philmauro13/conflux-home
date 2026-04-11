import React, { useMemo } from 'react';
import type { RippleSignal } from '../types';

interface RadarViewProps {
  ripples: RippleSignal[];
  loading: boolean;
  onBlipClick?: (ripple: RippleSignal) => void;
}

/** Map category/keyword to color variant */
function getColorClass(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes('budget') || cat.includes('money') || cat.includes('finance')) return 'emerald';
  if (cat.includes('dream') || cat.includes('goal') || cat.includes('aspir')) return 'amber';
  if (cat.includes('creative') || cat.includes('design') || cat.includes('art')) return 'violet';
  return 'cyan'; // default
}

/** Convert priority/confidence to SVG ring radius position */
function getBlipPosition(index: number, total: number, confidence: number) {
  // Place blips around the radar based on index
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  // Distance from center based on confidence (higher = closer to center)
  const distance = 40 + (100 - confidence) * 0.5; // 40-90 range
  const cx = 100 + distance * Math.cos(angle);
  const cy = 100 + distance * Math.sin(angle);
  return { cx, cy, angle };
}

function RadarBlip({
  ripple,
  index,
  total,
  onClick,
}: {
  ripple: RippleSignal;
  index: number;
  total: number;
  onClick?: () => void;
}) {
  const colorClass = getColorClass(ripple.category);
  const pos = getBlipPosition(index, total, ripple.confidence);

  return (
    <g
      className={`radar-blip radar-blip-${colorClass}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Expanding ripple rings */}
      <circle
        className="radar-ripple-ring"
        cx={pos.cx}
        cy={pos.cy}
        r="0"
        style={{ animationDelay: `${index * 0.5}s` }}
      />
      {/* Blip dot */}
      <circle
        className="radar-blip-circle"
        cx={pos.cx}
        cy={pos.cy}
        r={6 + ripple.confidence * 0.05}
        style={{ animationDelay: `${index * 0.3}s` }}
      />
      {/* Small label */}
      <text
        x={pos.cx}
        y={pos.cy + 18}
        textAnchor="middle"
        fill="var(--radar-text-muted)"
        fontSize="7"
        fontFamily="JetBrains Mono, monospace"
      >
        {ripple.category.slice(0, 10)}
      </text>
    </g>
  );
}

export default function RadarView({ ripples, loading, onBlipClick }: RadarViewProps) {
  // Concentric ring radii
  const rings = [30, 55, 80, 105];

  if (loading) {
    return (
      <div className="radar-container">
        <div className="radar-loading">
          <div className="radar-spinner" />
          <div>Scanning signals...</div>
        </div>
      </div>
    );
  }

  if (!ripples || ripples.length === 0) {
    return (
      <div className="radar-container">
        <div className="radar-empty">
          <div className="radar-empty-icon">📡</div>
          <h4 className="radar-empty-title">No signals detected</h4>
          <p className="radar-empty-hint">The radar is scanning. New signals will appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="radar-container">
      <svg
        className="radar-svg"
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Concentric rings */}
        {rings.map((r, i) => (
          <circle
            key={i}
            className={i === rings.length - 1 ? 'radar-ring-active' : 'radar-ring'}
            cx="100"
            cy="100"
            r={r}
          />
        ))}

        {/* Cross-hairs */}
        <line x1="100" y1="0" x2="100" y2="200" stroke="var(--radar-border)" strokeWidth="0.5" />
        <line x1="0" y1="100" x2="200" y2="100" stroke="var(--radar-border)" strokeWidth="0.5" />

        {/* Sweeping radar line */}
        <line
          className="radar-sweep"
          x1="100"
          y1="100"
          x2="100"
          y2="5"
        />

        {/* Center dot */}
        <circle cx="100" cy="100" r="3" fill="var(--radar-cyan)" opacity="0.8" />

        {/* Signal blips */}
        {ripples.map((ripple, idx) => (
          <RadarBlip
            key={ripple.id}
            ripple={ripple}
            index={idx}
            total={ripples.length}
            onClick={() => onBlipClick?.(ripple)}
          />
        ))}
      </svg>
    </div>
  );
}
