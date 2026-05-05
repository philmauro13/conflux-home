// Conflux Home — PulseKnob Component
// Animated heartbeat interval control for the INTEL Dashboard
// Drag circularly to select interval • Arc depletes as time passes
//
// Uses HeartbeatGlobal singleton so the countdown clock runs in a module-level
// setInterval — not tied to the component mount cycle. Navigating away and
// coming back does NOT restart the countdown.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { subscribe, setHeartbeatInterval } from '../lib/heartbeatGlobal';

export interface PulseKnobProps {
  value: number;          // current interval in ms (0 = off)
  onChange: (ms: number) => void;
  lastBeat?: number;      // timestamp of last beat (for countdown arc + heart pulse)
}

// ── Presets ──────────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'OFF',   ms: 0,           position: 0 },
  { label: '15m',   ms: 900_000,     position: 1 },
  { label: '1hr',   ms: 3_600_000,   position: 2 },
  { label: '4hr',   ms: 14_400_000, position: 3 },
  { label: '8hr',   ms: 28_800_000, position: 4 },
  { label: '12hr',  ms: 43_200_000, position: 5 },
] as const;

const RING_RADIUS = 44;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const CENTER = 54;
const NUM_DETENTS = PRESETS.length;

// ── Helpers ──────────────────────────────────────────────────────────────────

function msToLabel(ms: number): string {
  if (ms === 0) return '⏸ OFF';
  if (ms < 3_600_000) return `${ms / 60_000}m`;
  return `${ms / 3_600_000}hr`;
}

function msToPreset(ms: number): number {
  const p = PRESETS.findIndex(pr => pr.ms === ms);
  return p === -1 ? 4 : p;
}

function angleToPreset(angleDeg: number): number {
  let pos = ((angleDeg + 90 + 360) % 360) / (360 / NUM_DETENTS);
  return Math.round(pos) % NUM_DETENTS;
}

// ── Heart SVG (3D neumorphic) ───────────────────────────────────────────────

function KnobCenterIcon({ isOff, isBeating }: { isOff: boolean; isBeating: boolean }) {
  return (
    <g>
      <path
        d="M54 68 C54 68 34 56 34 44 C34 37 39 32 46 32 C49.5 32 52.5 33.5 54 36 C55.5 33.5 58.5 32 62 32 C69 32 74 37 74 44 C74 56 54 68 54 68Z"
        fill="#7f1d1d"
        transform="translate(2, 3)"
      />
      <defs>
        <linearGradient id="heartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#fca5a5" />
          <stop offset="35%"  stopColor="#ef4444" />
          <stop offset="70%"  stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </linearGradient>
        <filter id="heartGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="heartGlowIntense" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="heartClip">
          <path d="M54 68 C54 68 34 56 34 44 C34 37 39 32 46 32 C49.5 32 52.5 33.5 54 36 C55.5 33.5 58.5 32 62 32 C69 32 74 37 74 44 C74 56 54 68 54 68Z" />
        </clipPath>
      </defs>
      <path
        d="M54 68 C54 68 34 56 34 44 C34 37 39 32 46 32 C49.5 32 52.5 33.5 54 36 C55.5 33.5 58.5 32 62 32 C69 32 74 37 74 44 C74 56 54 68 54 68Z"
        fill="url(#heartGrad)"
        filter={isBeating ? 'url(#heartGlowIntense)' : 'url(#heartGlow)'}
      >
        <animateTransform
          attributeName="transform"
          type="scale"
          values="1;1.06;1"
          dur="2.4s"
          repeatCount="indefinite"
          calcMode="spline"
          keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
        />
        <animate
          attributeName="fill"
          values="url(#heartGrad);#fca5a5;url(#heartGrad)"
          dur="0.5s"
          begin={isBeating ? '0s' : 'indefinite'}
          repeatCount={isBeating ? 1 : 0}
        />
      </path>
      <ellipse
        cx="46"
        cy="40"
        rx="7"
        ry="5"
        fill="rgba(255,255,255,0.25)"
        clipPath="url(#heartClip)"
      />
    </g>
  );
}

// ── Detent Ticks ──────────────────────────────────────────────────────────────

function DetentTicks() {
  return (
    <g>
      {PRESETS.map((preset, i) => {
        const angleDeg = (i * 360) / NUM_DETENTS - 90;
        const angleRad = (angleDeg * Math.PI) / 180;
        const innerR = RING_RADIUS - 8;
        const outerR = RING_RADIUS + 2;
        const x1 = CENTER + innerR * Math.cos(angleRad);
        const y1 = CENTER + innerR * Math.sin(angleRad);
        const x2 = CENTER + outerR * Math.cos(angleRad);
        const y2 = CENTER + outerR * Math.sin(angleRad);
        return (
          <line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={1}
          />
        );
      })}
    </g>
  );
}

// ── Notch Labels ───────────────────────────────────────────────────────────────

function NotchLabels({ activePreset, currentPreset }: { activePreset: number; currentPreset: number }) {
  const labelR = RING_RADIUS + 20;
  return (
    <g>
      {PRESETS.map((preset, i) => {
        const angleDeg = (i * 360) / NUM_DETENTS - 90;
        const angleRad = (angleDeg * Math.PI) / 180;
        const x = CENTER + labelR * Math.cos(angleRad);
        const y = CENTER + labelR * Math.sin(angleRad);
        const isActive = i === activePreset;
        const isCurrent = i === currentPreset;
        return (
          <text
            key={i}
            x={x} y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="8"
            fontFamily="monospace"
            fill={isActive ? '#ef4444' : isCurrent ? '#ffffff99' : 'rgba(255,255,255,0.35)'}
            style={{ userSelect: 'none', pointerEvents: 'none', fontWeight: isActive ? 700 : 400 }}
          >
            {preset.label}
          </text>
        );
      })}
    </g>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PulseKnob({ value, onChange, lastBeat }: PulseKnobProps) {
  const [displayPct, setDisplayPct] = useState(1.0);
  const [isBeating, setIsBeating] = useState(false);
  const [dragAngle, setDragAngle] = useState<number | null>(null);
  const [justSnapped, setJustSnapped] = useState(false);
  const [filterId] = useState(() => `knob-filter-${Math.random().toString(36).slice(2, 7)}`);
  const [glowId] = useState(() => `knob-glow-${Math.random().toString(36).slice(2, 7)}`);

  const svgRef = useRef<SVGSVGElement>(null);
  const valueRef = useRef(value);
  const lastBeatRef = useRef<number>(lastBeat ?? Date.now());
  const rafRef = useRef<number>(0);
  const isDraggingRef = useRef(false);

  useEffect(() => { valueRef.current = value; }, [value]);

  // ── Global heartbeat subscription ────────────────────────────────────────
  // The rAF countdown loop is now driven by the HeartbeatGlobal tick,
  // so navigating away doesn't reset the countdown clock.
  useEffect(() => {
    // Subscribe to global beats — the singleton's setInterval fires independently
    // of this component's lifecycle.
    const unsub = subscribe((timestamp: number) => {
      lastBeatRef.current = timestamp;
      setDisplayPct(1.0);

      if (valueRef.current === 0) return;
      setIsBeating(true);
    });

    return unsub;
  }, []);

  // Smooth countdown arc — rAF loop between global beats (not tied to mount)
  useEffect(() => {
    if (value === 0) {
      setDisplayPct(0);
      cancelAnimationFrame(rafRef.current);
      return;
    }

    // Initialize displayPct to a value that reflects elapsed time since lastBeat
    const elapsed = Date.now() - lastBeatRef.current;
    const initialPct = Math.max(0, (value - elapsed) / value);
    setDisplayPct(initialPct);

    function tick() {
      const elapsed = Date.now() - lastBeatRef.current;
      const interval = valueRef.current;
      setDisplayPct(Math.max(0, (interval - elapsed) / interval));
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  // ── Drag handler ──────────────────────────────────────────────────────────
  const getAngleFromEvent = useCallback((e: MouseEvent | React.MouseEvent): number => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setDragAngle(getAngleFromEvent(e));

    function onMove(ev: MouseEvent) {
      setDragAngle(getAngleFromEvent(ev));
    }

    function onUp(ev: MouseEvent) {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      const finalAngle = getAngleFromEvent(ev);
      const preset = angleToPreset(finalAngle);
      const newMs = PRESETS[preset].ms;

      if (newMs !== valueRef.current) {
        // Update both local state AND global singleton
        onChange(newMs);
        setHeartbeatInterval(newMs);
        setDisplayPct(1);
        lastBeatRef.current = Date.now();
        setJustSnapped(true);
        setTimeout(() => setJustSnapped(false), 400);
      }
      setDragAngle(null);

      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [getAngleFromEvent, onChange]);

  // ── Beat flash from Rust lastBeat prop (secondary sync) ─────────────────
  useEffect(() => {
    if (!lastBeat || lastBeat <= lastBeatRef.current) return;
    lastBeatRef.current = lastBeat;
    if (valueRef.current === 0) return;
    setIsBeating(true);
    const t = setTimeout(() => setIsBeating(false), 700);
    return () => clearTimeout(t);
  }, [lastBeat]);

  // ── Display state ──────────────────────────────────────────────────────────
  const currentPreset = msToPreset(value);
  const activePreset = dragAngle !== null ? angleToPreset(dragAngle) : currentPreset;
  const isOff = PRESETS[currentPreset].ms === 0;
  const ringColor = isOff ? 'rgba(75, 85, 99, 0.8)' : '#ef4444';

  return (
    <div className={`intel-pulse-knob${justSnapped ? ' snapped' : ''}${isOff ? ' off' : ''}`}>
      <div className="intel-knob-label">HEARTBEAT</div>

      <svg
        ref={svgRef}
        viewBox="0 0 108 108"
        className="intel-knob-svg"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}
      >
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={CENTER} cy={CENTER} r={RING_RADIUS + 6}
          fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        <DetentTicks />
        <NotchLabels activePreset={activePreset} currentPreset={currentPreset} />

        <circle cx={CENTER} cy={CENTER} r={RING_RADIUS}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" strokeLinecap="round" />

        {!isOff && (
          <circle
            cx={CENTER} cy={CENTER} r={RING_RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - displayPct)}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            filter={`url(#${filterId})`}
          />
        )}

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
              cx={x} cy={y}
              r={isActive ? 4 : isCurrent ? 3 : 2}
              fill={isActive ? ringColor : 'rgba(255,255,255,0.2)'}
              style={{
                transition: 'r 0.15s ease, fill 0.15s ease',
                filter: isActive ? `drop-shadow(0 0 4px ${ringColor})` : undefined,
              }}
            />
          );
        })}

        <KnobCenterIcon isOff={isOff} isBeating={isBeating} />
      </svg>

      <div className="intel-knob-value" style={{ color: ringColor }}>
        {dragAngle !== null ? PRESETS[activePreset].label : msToLabel(value)}
      </div>

      <div className="intel-knob-interval-label">
        {value === 0 ? 'disabled' : `every ${msToLabel(value)}`}
      </div>

      {dragAngle !== null && (
        <div className="intel-knob-drag-hint">release to set</div>
      )}
    </div>
  );
}
