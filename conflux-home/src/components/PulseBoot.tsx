// Conflux Home — Budget Boot Sequence
// Cinematic 5-second intro: emerald particles → glowing heart → PULSE materializes
//
// LocalStorage: 'pulse-boot-done' (persisted — plays once)
//
// Design: deep emerald/charcoal bg, animated SVG heart + breathing ring,
//         floating particles, Orbitron logo + heartbeat tagline

import { useState, useEffect, useRef } from 'react';

function PulseBoot({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<{ x: number; y: number; r: number; alpha: number; speed: number; phase: number }[]>([]);

  // Static canvas: floating emerald particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      particlesRef.current = Array.from({ length: 20 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 3 + 1.5,
        alpha: Math.random() * 0.5 + 0.3,
        speed: Math.random() * 0.012 + 0.005,
        phase: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    let animFrame: number;
    let t = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 1;

      // Background ambient glow at bottom center
      if (phase >= 1) {
        const cx = canvas.width / 2;
        const cy = canvas.height * 0.75;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 200);
        glow.addColorStop(0, `rgba(16, 185, 129, ${0.12 * (t % 120 < 60 ? 1 : 0.7)})`);
        glow.addColorStop(1, 'rgba(16, 185, 129, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Floating particles (phase 2+)
      if (phase >= 2) {
        particlesRef.current.forEach(p => {
          const flicker = Math.sin(t * p.speed + p.phase) * 0.3 + 0.7;
          const drift = Math.sin(t * p.speed * 0.5 + p.phase) * 8;
          ctx.beginPath();
          ctx.arc(p.x + drift, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(16, 185, 129, ${p.alpha * flicker * 0.7})`;
          ctx.fill();
        });
      }

      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resize);
    };
  }, [phase]);

  // Phase timeline
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),   // content fades in
      setTimeout(() => setPhase(2), 1600),  // particles start
      setTimeout(() => setPhase(3), 2800),  // tagline
      setTimeout(() => setPhase(4), 4000),  // begin exit
      setTimeout(() => onComplete(), 5000),  // done
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="pulse-boot">
      <canvas ref={canvasRef} className="pulse-boot-canvas" />

      <div className={`pulse-boot-content ${phase >= 1 ? 'visible' : ''}`}>
        {/* Animated heart SVG */}
        <div className={`pulse-boot-heart ${phase >= 2 ? 'visible' : ''}`}>
          <svg viewBox="0 0 100 100" className="pulse-boot-heart-svg">
            <defs>
              <radialGradient id="pulseHeartGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
                <stop offset="60%" stopColor="#10b981" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* Outer glow ring */}
            <circle cx="50" cy="50" r="44" fill="rgba(16,185,129,0.06)" className="pulse-boot-heart-glow-ring" />
            {/* Heart path */}
            <path
              className="pulse-boot-heart-path"
              d="M50 88 C20 65, 5 48, 12 32 C17 20, 30 16, 42 24 C47 18, 53 18, 58 24 C70 16, 83 20, 88 32 C95 48, 80 65, 50 88Z"
              fill="url(#pulseHeartGrad)"
            />
            {/* Highlight */}
            <ellipse cx="38" cy="36" rx="8" ry="5" fill="rgba(255,255,255,0.15)" transform="rotate(-30 38 36)" />
          </svg>
        </div>

        <div className="pulse-boot-logo-row">
          <div className="pulse-boot-logo">PULSE</div>
        </div>

        <p className={`pulse-boot-tagline ${phase >= 3 ? 'visible' : ''}`}>
          your financial heartbeat
        </p>
      </div>

      <div className="pulse-boot-progress">
        <div
          className="pulse-boot-progress-fill"
          style={{ width: `${Math.min(((Date.now() % 5000) / 5000) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default PulseBoot;
