// Conflux Home — Orbit Boot Sequence
// Mission Control Launch Sequence
// Phase 1: Boot terminal → Phase 2: Countdown → Phase 3: Systems online
//
// LocalStorage: 'orbit-boot-done' (persisted — plays once)
//
// Design: deep blue-black cockpit, CRT scanline overlay,
//         monospace terminal boot, animated countdown,
//         status indicators appearing, ORBIT materializes
//         with a crosshatch HUD grid reveal

import { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/orbit-boot.css';

const BOOT_LINES = [
  { text: 'CONFLUX SYSTEMS v2.1.4', delay: 0 },
  { text: 'LIFE SUPPORT MODULE: LOADING', delay: 200 },
  { text: 'TASK ORCHESTRATION: OK', delay: 500 },
  { text: 'HABIT TRACKING: STANDBY', delay: 700 },
  { text: 'MORNING BRIEFING: READY', delay: 900 },
  { text: 'ENERGY MAPPING: ONLINE', delay: 1100 },
  { text: 'ORBITAL CORE: IGNITION', delay: 1300 },
];

const SYSTEM_STATUS = [
  { label: 'TASKS', color: '#3b82f6' },
  { label: 'HABITS', color: '#10b981' },
  { label: 'BRIEFING', color: '#f59e0b' },
  { label: 'ENERGY', color: '#8b5cf6' },
  { label: 'NUDGE', color: '#ec4899' },
];

interface Props {
  onComplete: () => void;
}

export default function OrbitBoot({ onComplete }: Props) {
  const [phase, setPhase] = useState(0); // 0=boot, 1=countdown, 2=done
  const [visibleLines, setVisibleLines] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [scanOffset, setScanOffset] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanRef = useRef<number>(0);

  // CRT scanline animation — runs continuously
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let animFrame: number;
    let t = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 1;
      setScanOffset(prev => (prev + 1) % 4);

      // HUD crosshatch grid
      const gridSize = 48;
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Scanline sweep (the CRT beam)
      if (phase < 2) {
        const scanY = ((t * 1.5) % (canvas.height + 100)) - 50;
        const scanGrad = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40);
        scanGrad.addColorStop(0, 'rgba(59, 130, 246, 0)');
        scanGrad.addColorStop(0.5, 'rgba(59, 130, 246, 0.06)');
        scanGrad.addColorStop(1, 'rgba(59, 130, 246, 0)');
        ctx.fillStyle = scanGrad;
        ctx.fillRect(0, scanY - 40, canvas.width, 80);
      }

      // Ambient blue glow at center (appears after phase 1)
      if (phase >= 1) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2 - 20;
        const glowSize = 300 + Math.sin(t * 0.02) * 20;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
        glow.addColorStop(0, 'rgba(59, 130, 246, 0.08)');
        glow.addColorStop(1, 'rgba(59, 130, 246, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    scanRef.current = animFrame;
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resize);
    };
  }, [phase]);

  // Typewriter boot lines
  useEffect(() => {
    if (phase !== 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    BOOT_LINES.forEach((line, i) => {
      const t = setTimeout(() => {
        setVisibleLines(i + 1);
      }, line.delay + 400);
      timers.push(t);
    });
    const t2 = setTimeout(() => {
      setPhase(1);
    }, 2200);
    timers.push(t2);
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  // Countdown
  useEffect(() => {
    if (phase !== 1) return;
    const tick = setInterval(() => {
      setCountdown(c => c - 1);
    }, 700);
    const done = setTimeout(() => {
      setPhase(2);
    }, 2400);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [phase]);

  // All done
  useEffect(() => {
    if (phase !== 2) return;
    const t = setTimeout(onComplete, 1200);
    return () => clearTimeout(t);
  }, [phase, onComplete]);

  return (
    <div className="orbit-boot">
      {/* CRT canvas: grid + scanlines */}
      <canvas ref={canvasRef} className="orbit-boot-canvas" />

      {/* CRT scanline overlay (CSS) */}
      <div className="orbit-boot-scanlines" />

      {/* Phase 0: Boot Terminal */}
      {phase === 0 && (
        <div className="orbit-boot-terminal">
          <div className="orbit-boot-terminal-inner">
            {BOOT_LINES.map((line, i) => (
              <div
                key={i}
                className={`orbit-boot-line ${i < visibleLines ? 'visible' : ''}`}
              >
                <span className="orbit-boot-prompt">›</span>
                <span className="orbit-boot-status-ok">[OK]</span>
                <span className="orbit-boot-text">{line.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 1: Countdown */}
      {phase === 1 && (
        <div className="orbit-boot-countdown">
          {/* ORBIT logo */}
          <div className="orbit-boot-logo">ORBIT</div>

          {/* Countdown number */}
          <div className="orbit-boot-count-wrapper">
            <div
              key={countdown}
              className="orbit-boot-count-number"
            >
              {countdown > 0 ? countdown : 'GO'}
            </div>
            <div className="orbit-boot-count-ring" />
          </div>

          {/* Status indicators */}
          <div className="orbit-boot-status-row">
            {SYSTEM_STATUS.map((s, i) => (
              <div
                key={s.label}
                className="orbit-boot-status-chip"
                style={{
                  borderColor: s.color,
                  color: s.color,
                  animationDelay: `${i * 120}ms`,
                }}
              >
                <div
                  className="orbit-boot-status-dot"
                  style={{ background: s.color }}
                />
                {s.label}
              </div>
            ))}
          </div>

          {/* Mission tagline */}
          <p className="orbit-boot-tagline">MISSION CONTROL ONLINE</p>
        </div>
      )}

      {/* Phase 2: Fade to dashboard */}
      {phase === 2 && (
        <div className="orbit-boot-complete">
          <div className="orbit-boot-complete-logo">ORBIT</div>
          <p className="orbit-boot-complete-sub">All systems nominal.</p>
        </div>
      )}
    </div>
  );
}
