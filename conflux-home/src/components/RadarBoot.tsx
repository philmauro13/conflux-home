// Conflux Home — Radar Boot Sequence
// Tactical Intelligence Activation
// Phase 1: Power on → Phase 2: Radar sweep → Phase 3: Signals detected
//
// LocalStorage: 'radar-boot-done' (persisted — plays once)
//
// Design: pitch black, SVG radar dish draws itself,
//         sweep arm rotates and catches blips one by one,
//         tactical readouts appear, RIPPLE RADAR materializes
//         Completely different: no particles, no flames,
//         just geometry and light on dark glass

import { useState, useEffect, useRef } from 'react';
import '../styles/radar-boot.css';

const RIPPLE_TYPES = [
  { label: 'FINANCE', color: '#10b981', delay: 800 },
  { label: 'DREAMS', color: '#f59e0b', delay: 1200 },
  { label: 'CREATIVE', color: '#8b5cf6', delay: 1600 },
  { label: 'GENERAL', color: '#06b6d4', delay: 2000 },
];

interface Props {
  onComplete: () => void;
}

export default function RadarBoot({ onComplete }: Props) {
  const [phase, setPhase] = useState(0);
  const [sweepAngle, setSweepAngle] = useState(0);
  const [visibleBlips, setVisibleBlips] = useState(0);
  const sweepRef = useRef<number | null>(null);

  // Continuous sweep animation during boot
  useEffect(() => {
    if (phase < 1) return;
    let last = 0;
    const animate = (t: number) => {
      if (last) {
        const delta = (t - last) * 0.05;
        setSweepAngle(a => (a + delta) % 360);
      }
      last = t;
      sweepRef.current = requestAnimationFrame(animate);
    };
    sweepRef.current = requestAnimationFrame(animate);
    return () => { if (sweepRef.current) cancelAnimationFrame(sweepRef.current); };
  }, [phase]);

  // Blips appear one by one as sweep passes them
  useEffect(() => {
    if (phase < 1) return;
    let idx = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    RIPPLE_TYPES.forEach((r, i) => {
      const t = setTimeout(() => {
        setVisibleBlips(i + 1);
      }, r.delay + 500);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // Phase timeline
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),   // radar activates
      setTimeout(() => setPhase(2), 3800),  // fade out
      setTimeout(() => onComplete(), 4800), // done
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  // Blip positions around the radar
  const blipPositions = [
    { angle: 30, dist: 65 },
    { angle: 130, dist: 80 },
    { angle: 220, dist: 50 },
    { angle: 310, dist: 75 },
  ];

  return (
    <div className="radar-boot">
      {/* Phase 1: Full radar activation */}
      {phase >= 1 && (
        <div className={`radar-boot-content ${phase >= 1 ? 'visible' : ''}`}>
          {/* Title */}
          <div className="radar-boot-title-row">
            <div className="radar-boot-eyebrow">CONFLUX INTELLIGENCE LAYER</div>
            <div className="radar-boot-title">RIPPLE RADAR</div>
          </div>

          {/* SVG Radar */}
          <div className="radar-boot-radar">
            <svg
              viewBox="0 0 300 300"
              className="radar-boot-svg"
            >
              <defs>
                {/* Sweep gradient */}
                <linearGradient id="sweepGrad" gradientTransform="rotate(0)">
                  <stop offset="0%" stopColor="rgba(6,182,212,0)" />
                  <stop offset="100%" stopColor="rgba(6,182,212,0.35)" />
                </linearGradient>
                {/* Glow filter */}
                <filter id="radarGlow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              {/* Outer border ring */}
              <circle cx="150" cy="150" r="135" fill="none" stroke="rgba(6,182,212,0.15)" strokeWidth="1" />
              <circle cx="150" cy="150" r="135" fill="none" stroke="rgba(6,182,212,0.4)" strokeWidth="2" strokeDasharray="8 4" className="radar-border-spin" />

              {/* Concentric rings */}
              {[35, 65, 95, 125].map((r, i) => (
                <circle
                  key={r}
                  cx="150" cy="150" r={r}
                  fill="none"
                  stroke={i === 3 ? 'rgba(6,182,212,0.25)' : 'rgba(6,182,212,0.08)'}
                  strokeWidth={i === 3 ? 1.5 : 1}
                  strokeDasharray={i === 3 ? '3 3' : 'none'}
                />
              ))}

              {/* Crosshairs */}
              <line x1="150" y1="15" x2="150" y2="285" stroke="rgba(6,182,212,0.1)" strokeWidth="0.5" />
              <line x1="15" y1="150" x2="285" y2="150" stroke="rgba(6,182,212,0.1)" strokeWidth="0.5" />

              {/* Sweep arm — rotating triangle */}
              <g transform={`rotate(${sweepAngle}, 150, 150)`}>
                <polygon
                  points="150,150 150,20 158,150"
                  fill="url(#sweepGrad)"
                  opacity="0.7"
                />
                {/* Sweep line */}
                <line x1="150" y1="150" x2="150" y2="18" stroke="rgba(6,182,212,0.8)" strokeWidth="1.5" filter="url(#radarGlow)" />
              </g>

              {/* Center dot */}
              <circle cx="150" cy="150" r="4" fill="#06b6d4" filter="url(#radarGlow)" />
              <circle cx="150" cy="150" r="2" fill="#fff" />

              {/* Blips — appear as sweep passes them */}
              {blipPositions.slice(0, visibleBlips).map((b, i) => {
                const rad = (b.angle * Math.PI) / 180;
                const cx = 150 + b.dist * Math.cos(rad);
                const cy = 150 + b.dist * Math.sin(rad);
                const rippleType = RIPPLE_TYPES[i];
                return (
                  <g key={i}>
                    {/* Expanding ring */}
                    <circle
                      cx={cx} cy={cy} r="0"
                      fill="none"
                      stroke={rippleType.color}
                      strokeWidth="1"
                      opacity="0.6"
                      className="radar-boot-blip-ring"
                      style={{ animationDelay: `${i * 0.3}s` }}
                    />
                    {/* Blip dot */}
                    <circle
                      cx={cx} cy={cy} r="5"
                      fill={rippleType.color}
                      filter="url(#radarGlow)"
                      opacity="0"
                      className="radar-boot-blip-dot"
                      style={{ animationDelay: `${i * 0.3}s` }}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Tactical readouts */}
          <div className="radar-boot-readouts">
            {RIPPLE_TYPES.slice(0, visibleBlips).map((r, i) => (
              <div
                key={r.label}
                className="radar-boot-readout"
                style={{ borderColor: r.color, color: r.color, animationDelay: `${i * 0.2 + 0.3}s` }}
              >
                <div className="radar-boot-readout-dot" style={{ background: r.color }} />
                <span>{r.label} SIGNALS ONLINE</span>
              </div>
            ))}
          </div>

          {/* Status bar */}
          <div className="radar-boot-status">
            <span className="radar-boot-status-indicator" />
            <span>INTELLIGENCE LAYER ACTIVE · SCANNING {visibleBlips} CATEGORIES</span>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="radar-boot-progress">
        <div className="radar-boot-progress-fill" />
      </div>
    </div>
  );
}
