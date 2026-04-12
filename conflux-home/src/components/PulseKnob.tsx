// Conflux Home — PulseKnob Component
// Animated heartbeat interval control for the INTEL Dashboard
// Drag circularly to select interval • Arc depletes as time passes

import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface PulseKnobProps {
  value: number;          // current interval in ms (0 = off)
  onChange: (ms: number) => void;
  lastBeat?: number;      // timestamp of last beat (for countdown arc)
}

// ── Presets ──────────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'OFF',  ms: 0,         position: 0 },  // 12 o'clock
  { label: '30s',  ms: 30_000,    position: 1 },  // ~2 o'clock
  { label: '1m',   ms: 60_000,    position: 2 },  // ~4 o'clock
  { label: '5m',   ms: 300_000,   position: 3 },  // ~6 o'clock
  { label: '30m',  ms: 1_800_000, position: 4 },  // ~8 o'clock
  { label: '60m',  ms: 3_600_000, position: 5 },  // ~10 o'clock
] as const;

const RING_RADIUS = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const CENTER = 54; // SVG viewBox is 108×108
const NUM_DETENTS = PRESETS.length;

// ── Helpers ──────────────────────────────────────────────────────────────────

function msToLabel(ms: number): string {
  if (ms === 0) return '⏸ OFF';
  if (ms < 60_000) return `⏱ ${ms / 1000}s`;
  if (ms < 3_600_000) return `⏱ ${ms / 60_000}m`;
  return `⏱ ${ms / 3_600_000}h`;
}

function msToPreset(ms: number): number {
  const p = PRESETS.findIndex(pr => pr.ms === ms);
  return p === -1 ? 4 : p; // default to 30m (index 4)
}

function angleToPreset(angleDeg: number): number {
  // 0° = top (12 o'clock), clockwise
  // Map angle -90..270 → positions 0..5
  let pos = ((angleDeg + 90 + 360) % 360) / (360 / NUM_DETENTS);
  let rounded = Math.round(pos) % NUM_DETENTS;
  return rounded;
}

// ── SVG icons inside the ring ──────────────────────────────────────────────

function KnobCenterIcon({ preset }: { preset: number }) {
  const isOff = PRESETS[preset].ms === 0;
  if (isOff) {
    return (
      <g>
        {/* Pause bars */}
        <rect x="46" y="44" width="6" height="20" rx="2" fill="rgba(255,255,255,0.5)" />
        <rect x="56" y="44" width="6" height="20" rx="2" fill="rgba(255,255,255,0.5)" />
      </g>
    );
  }
  return (
    <g>
      {/* Animated pulsing dot */}
      <circle cx="54" cy="54" r="6" fill="rgba(99,102,241,0.9)">
        <animate attributeName="r" values="4;7;4" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.4;0.9" dur="2s" repeatCount="indefinite" />
      </circle>
      {/* Inner rings */}
      <circle cx="54" cy="54" r="10" fill="none" stroke="rgba(99,102,241,0.3)" strokeWidth="1.5">
        <animate attributeName="r" values="10;13;10" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="54" cy="54" r="15" fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="1">
        <animate attributeName="r" values="15;18;15" dur="2s" begin="0.3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" begin="0.3s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

// ── Detent tick marks ──────────────────────────────────────────────────────

function DetentTicks() {
  const ticks = [];
  for (let i = 0; i < NUM_DETENTS; i++) {
    const angleDeg = (i * 360) / NUM_DETENTS - 90;
    const angleRad = (angleDeg * Math.PI) / 180;
    const outerR = 54;
    const innerR = i === 0 ? 50 : 51; // OFF position slightly shorter
    const x1 = CENTER + outerR * Math.cos(angleRad);
    const y1 = CENTER + outerR * Math.sin(angleRad);
    const x2 = CENTER + innerR * Math.cos(angleRad);
    const y2 = CENTER + innerR * Math.sin(angleRad);
    const isOff = i === 0;
    ticks.push(
      <line
        key={i}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={isOff ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.25)'}
        strokeWidth={isOff ? 2.5 : 1.5}
        strokeLinecap="round"
      />
    );
  }
  return <g>{ticks}</g>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PulseKnob({ value, onChange, lastBeat }: PulseKnobProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragAngle, setDragAngle] = useState<number | null>(null);
  const [justSnapped, setJustSnapped] = useState(false);
  const [countdownPct, setCountdownPct] = useState(1); // 1 = full, 0 = empty
  const animationRef = useRef<number>(0);
  const lastBeatRef = useRef(lastBeat ?? Date.now());
  const valueRef = useRef(value);

  // Keep valueRef current
  useEffect(() => { valueRef.current = value; }, [value]);

  // Update lastBeat ref when prop changes
  useEffect(() => {
    if (lastBeat) lastBeatRef.current = lastBeat;
  }, [lastBeat]);

  // ── Countdown arc animation ────────────────────────────────────────────────

  useEffect(() => {
    if (value === 0) {
      setCountdownPct(0);
      return;
    }

    function tick() {
      const elapsed = Date.now() - lastBeatRef.current;
      const interval = valueRef.current;
      const remaining = Math.max(0, interval - (elapsed % interval));
      const pct = remaining / interval;
      setCountdownPct(pct);
      animationRef.current = requestAnimationFrame(tick);
    }

    animationRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationRef.current);
  }, [value]);

  // Reset countdown when a beat fires (lastBeat changes externally)
  useEffect(() => {
    if (lastBeat) lastBeatRef.current = lastBeat;
  }, [lastBeat]);

  // ── Circular drag handler ──────────────────────────────────────────────────

  const getAngleFromEvent = useCallback((e: MouseEvent | React.MouseEvent): number => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const angle = getAngleFromEvent(e);
      setDragAngle(angle);
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsDragging(false);
      if (dragAngle === null) return;
      const preset = angleToPreset(dragAngle);
      const newMs = PRESETS[preset].ms;
      if (newMs !== valueRef.current) {
        onChange(newMs);
        lastBeatRef.current = Date.now(); // reset countdown on change
        setCountdownPct(1);
        setJustSnapped(true);
        setTimeout(() => setJustSnapped(false), 400);
      }
      setDragAngle(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragAngle, getAngleFromEvent, onChange]);

  // ── Derived display state ──────────────────────────────────────────────────

  const currentPreset = msToPreset(value);
  const activePreset = isDragging && dragAngle !== null
    ? angleToPreset(dragAngle)
    : currentPreset;
  const isOff = PRESETS[activePreset].ms === 0;
  const isFast = PRESETS[activePreset].ms <= 60_000;

  const ringColor = isOff
    ? 'rgba(75, 85, 99, 0.8)'
    : isFast
    ? '#f59e0b'           // amber for 30s/1m
    : '#6366f1';           // indigo default

  const dashOffset = RING_CIRCUMFERENCE * (1 - countdownPct);

  // Glow filter id (unique per render to avoid SVG defs conflicts)
  const glowId = `knob-glow-${Math.random().toString(36).slice(2, 7)}`;
  const filterId = `knob-filter-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <div className={`intel-pulse-knob${isDragging ? ' dragging' : ''}${justSnapped ? ' snapped' : ''}${isOff ? ' off' : ''}`}>
      {/* Section label */}
      <div className="intel-knob-label">PULSE</div>

      {/* SVG Knob */}
      <svg
        ref={svgRef}
        viewBox="0 0 108 108"
        className="intel-knob-svg"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <defs>
          {/* Glow filter */}
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={isDragging ? '3' : '2'} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Snap flash filter */}
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer decorative ring */}
        <circle
          cx={CENTER} cy={CENTER} r={RING_RADIUS + 6}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1"
        />

        {/* Detent tick marks */}
        <DetentTicks />

        {/* Track ring (always visible) */}
        <circle
          cx={CENTER} cy={CENTER} r={RING_RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Countdown arc — depletes clockwise from top */}
        {!isOff && (
          <circle
            cx={CENTER} cy={CENTER} r={RING_RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            filter={isDragging ? `url(#${filterId})` : undefined}
            style={{
              transition: isDragging ? 'none' : 'stroke-dashoffset 0.3s ease',
              filter: isDragging ? `url(#${filterId})` : `url(#${filterId})`,
            }}
          >
            {/* Breathing glow animation on the arc */}
            {!isDragging && (
              <>
                <animate attributeName="stroke-opacity" values="1;0.6;1" dur="3s" repeatCount="indefinite" />
              </>
            )}
          </circle>
        )}

        {/* Active preset indicator dot */}
        {PRESETS.map((_, i) => {
          const angleDeg = (i * 360) / NUM_DETENTS - 90;
          const angleRad = (angleDeg * Math.PI) / 180;
          const dotR = RING_RADIUS + 10;
          const x = CENTER + dotR * Math.cos(angleRad);
          const y = CENTER + dotR * Math.sin(angleRad);
          const isActive = i === activePreset;
          const isCurrent = i === currentPreset;
          return (
            <circle
              key={i}
              cx={x} cy={y} r={isActive ? 4 : isCurrent ? 3 : 2}
              fill={isActive ? ringColor : 'rgba(255,255,255,0.2)'}
              style={{
                transition: 'r 0.15s ease, fill 0.15s ease',
                filter: isActive ? `drop-shadow(0 0 4px ${ringColor})` : undefined,
              }}
            />
          );
        })}

        {/* Center icon */}
        <KnobCenterIcon preset={activePreset} />
      </svg>

      {/* Value label below knob */}
      <div
        className="intel-knob-value"
        style={{ color: ringColor }}
      >
        {isDragging ? PRESETS[activePreset].label : msToLabel(value)}
      </div>

      {/* Interval label */}
      <div className="intel-knob-interval-label">
        {value === 0 ? 'disabled' : `every ${msToLabel(value).replace('⏱ ', '')}`}
      </div>

      {/* Drag hint */}
      {isDragging && (
        <div className="intel-knob-drag-hint">release to set</div>
      )}
    </div>
  );
}
