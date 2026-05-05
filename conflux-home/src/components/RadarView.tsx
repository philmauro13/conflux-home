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

/** Stable blip position: sort by id first so order never shifts between re-renders */
function sortRipples(ripples: RippleSignal[]): RippleSignal[] {
  return [...ripples].sort((a, b) => a.id.localeCompare(b.id));
}

/** Convert confidence (0–100) to distance from center (20–90px in SVG coords) */
function confidenceToDistance(confidence: number): number {
  // Higher confidence → closer to center
  return 20 + (100 - confidence) * 0.7;
}

function RadarBlip({
  ripple,
  position,
  animationDelay,
  onClick,
}: {
  ripple: RippleSignal;
  position: { cx: number; cy: number };
  animationDelay: number;
  onClick?: () => void;
}) {
  const colorClass = getColorClass(ripple.category);
  const radius = 6 + ripple.confidence * 0.05;

  return (
    <g
      className={`radar-blip radar-blip-${colorClass}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Expanding ripple ring — CSS handles the expansion */}
      <circle
        className="radar-ripple-ring"
        cx={position.cx}
        cy={position.cy}
        r="0"
        style={{ animationDelay: `${animationDelay}s` }}
      />
      {/* Blip dot with stable pulse */}
      <circle
        className="radar-blip-circle"
        cx={position.cx}
        cy={position.cy}
        r={radius}
        style={{ animationDelay: `${animationDelay}s` }}
      />
      {/* Label — static, no animation */}
      <text
        x={position.cx}
        y={position.cy + 18}
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
  // Concentric ring radii in SVG viewBox coords (200x200)
  const rings = [30, 55, 80, 105];

  // Stable sorted ripples so blip order never shifts between renders
  const sortedRipples = useMemo(() => sortRipples(ripples), [ripples]);

  // Precompute positions once — stable based on sorted order
  const blipPositions = useMemo(() => {
    const total = sortedRipples.length;
    if (total === 0) return [];
    return sortedRipples.map((ripple, i) => {
      // Angle: distribute evenly around circle, start from top (-π/2)
      const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
      const distance = confidenceToDistance(ripple.confidence);
      return {
        cx: 100 + distance * Math.cos(angle),
        cy: 100 + distance * Math.sin(angle),
      };
    });
  }, [sortedRipples]);

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

        {/* Signal blips — positions precomputed, stable across re-renders */}
        {sortedRipples.map((ripple, idx) => (
          <RadarBlip
            key={ripple.id}
            ripple={ripple}
            position={blipPositions[idx]}
            animationDelay={idx * 0.4}
            onClick={() => onBlipClick?.(ripple)}
          />
        ))}
      </svg>
    </div>
  );
}
