import type { DreamVelocity } from '../../types';

interface OrbitalVelocityProps {
  velocity: DreamVelocity;
}

export default function OrbitalVelocity({ velocity }: OrbitalVelocityProps) {
  const pct = velocity.progress_pct;
  const circumference = 2 * Math.PI * 45; // radius 45
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  const paceEmoji = velocity.pace === 'ahead' ? '🚀' : velocity.pace === 'on_track' ? '✅' : '🐢';
  const paceLabel = velocity.pace === 'ahead' ? 'Ahead' : velocity.pace === 'on_track' ? 'On Track' : 'Behind';

  return (
    <div className="orbital-velocity">
      <h3 className="orbital-velocity-title">ORBITAL VELOCITY</h3>
      <div className="orbital-velocity-gauge">
        <svg viewBox="0 0 100 100" className="orbital-gauge-svg">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#1e293b"
            strokeWidth="6"
          />
          {/* Progress arc */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="url(#velocity-gradient)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: 'stroke-dashoffset 0.6s ease',
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
            }}
          />
          {/* Gradient definition */}
          <defs>
            <linearGradient id="velocity-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          {/* Center text */}
          <text
            x="50"
            y="46"
            textAnchor="middle"
            fill="#e2e8f0"
            fontSize="18"
            fontFamily="Orbitron"
            fontWeight="bold"
          >
            {pct.toFixed(0)}%
          </text>
          <text
            x="50"
            y="60"
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="8"
            fontFamily="Inter"
          >
            COMPLETE
          </text>
        </svg>
      </div>
      <div className="orbital-velocity-stats">
        <div className="orbital-stat">
          <span className="orbital-stat-label">Milestones</span>
          <span className="orbital-stat-value">
            {velocity.milestones_completed}/{velocity.milestones_total}
          </span>
        </div>
        <div className="orbital-stat">
          <span className="orbital-stat-label">Tasks</span>
          <span className="orbital-stat-value">
            {velocity.tasks_completed}/{velocity.tasks_total}
          </span>
        </div>
        <div className="orbital-stat">
          <span className="orbital-stat-label">Pace</span>
          <span className="orbital-stat-value pace-indicator" data-pace={velocity.pace}>
            {paceEmoji} {paceLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
