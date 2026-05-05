// Conflux Home — Horizon Boot Sequence
// Cinematic 5-second intro: shooting stars → horizon rises → logo draws → tagline

import { useState, useEffect, useRef } from 'react';

const degToRad = (d: number) => (d * Math.PI) / 180;

interface ShootingStar {
  id: number;
  startX: number;
  startY: number;
  angle: number;
  length: number;
  duration: number;
  delay: number;
}

function HorizonBoot({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<{ x: number; y: number; r: number; alpha: number; speed: number }[]>([]);

  // Static twinkling stars (rendered on canvas)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Initialize background stars
      starsRef.current = Array.from({ length: 200 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.3,
        alpha: Math.random() * 0.7 + 0.3,
        speed: Math.random() * 0.015 + 0.005,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    let animFrame: number;
    let t = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 1;

      // Background stars — twinkle based on phase
      const starAlpha = phase >= 1 ? 1 : 0.4;
      starsRef.current.forEach(star => {
        const flicker = Math.sin(t * star.speed + star.x) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * flicker * starAlpha})`;
        ctx.fill();
      });

      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resize);
    };
  }, [phase]);

  // Shooting stars
  const shootingStars: ShootingStar[] = [
    { id: 1, startX: 0.1, startY: 0.15, angle: 35, length: 120, duration: 0.7, delay: 0.3 },
    { id: 2, startX: 0.85, startY: 0.1, angle: 140, length: 90, duration: 0.6, delay: 0.8 },
    { id: 3, startX: 0.4, startY: 0.05, angle: 50, length: 150, duration: 0.9, delay: 1.2 },
    { id: 4, startX: 0.7, startY: 0.2, angle: 30, length: 80, duration: 0.5, delay: 1.8 },
    { id: 5, startX: 0.2, startY: 0.08, angle: 55, length: 110, duration: 0.75, delay: 2.5 },
  ];

  // Phase timeline
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),    // horizon starts rising
      setTimeout(() => setPhase(2), 1600),  // logo + constellation draw
      setTimeout(() => setPhase(3), 2800),  // tagline
      setTimeout(() => setPhase(4), 4000),  // begin exit
      setTimeout(() => onComplete(), 5000),  // done
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="horizon-boot">
      {/* Star canvas background */}
      <canvas ref={canvasRef} className="horizon-boot-canvas" />

      {/* Horizon line rising */}
      <div className={`horizon-boot-horizon ${phase >= 1 ? 'visible' : ''}`}>
        <div className="horizon-boot-horizon-glow" />
        <div className="horizon-boot-horizon-line" />
      </div>

      {/* Shooting stars */}
      {shootingStars.map(star => (
        <ShootingStarRenderer
          key={star.id}
          star={star}
          active={phase >= 1}
        />
      ))}

      {/* Logo + constellation drawing */}
      <div className={`horizon-boot-content ${phase >= 2 ? 'visible' : ''}`}>
        <div className="horizon-boot-logo-row">
          {/* Constellation decoration left */}
          <svg className="horizon-boot-constellation horizon-boot-constellation-left" viewBox="0 0 100 40">
            <line x1="0" y1="20" x2="30" y2="10" stroke="rgba(251,191,36,0.5)" strokeWidth="1" strokeDasharray="60" strokeDashoffset={phase >= 2 ? "0" : "60"} style={{ transition: 'stroke-dashoffset 0.8s ease 0.2s' }} />
            <line x1="30" y1="10" x2="60" y2="25" stroke="rgba(251,191,36,0.5)" strokeWidth="1" strokeDasharray="60" strokeDashoffset={phase >= 2 ? "0" : "60"} style={{ transition: 'stroke-dashoffset 0.8s ease 0.4s' }} />
            <line x1="60" y1="25" x2="100" y2="15" stroke="rgba(251,191,36,0.5)" strokeWidth="1" strokeDasharray="60" strokeDashoffset={phase >= 2 ? "0" : "60"} style={{ transition: 'stroke-dashoffset 0.8s ease 0.6s' }} />
            <circle cx="0" cy="20" r="3" fill="rgba(251,191,36,0.7)" style={{ opacity: phase >= 2 ? 1 : 0, transition: 'opacity 0.3s ease 0.2s' }} />
            <circle cx="30" cy="10" r="2" fill="rgba(251,191,36,0.7)" style={{ opacity: phase >= 2 ? 1 : 0, transition: 'opacity 0.3s ease 0.4s' }} />
            <circle cx="60" cy="25" r="2.5" fill="rgba(251,191,36,0.7)" style={{ opacity: phase >= 2 ? 1 : 0, transition: 'opacity 0.3s ease 0.6s' }} />
            <circle cx="100" cy="15" r="3" fill="rgba(251,191,36,0.9)" style={{ opacity: phase >= 2 ? 1 : 0, transition: 'opacity 0.3s ease 0.8s' }} />
          </svg>

          <div className="horizon-boot-logo">HORIZON</div>

          {/* Constellation decoration right */}
          <svg className="horizon-boot-constellation horizon-boot-constellation-right" viewBox="0 0 100 40">
            <line x1="0" y1="15" x2="40" y2="30" stroke="rgba(251,191,36,0.5)" strokeWidth="1" strokeDasharray="60" strokeDashoffset={phase >= 2 ? "0" : "60"} style={{ transition: 'stroke-dashoffset 0.8s ease 0.2s' }} />
            <line x1="40" y1="30" x2="70" y2="12" stroke="rgba(251,191,36,0.5)" strokeWidth="1" strokeDasharray="60" strokeDashoffset={phase >= 2 ? "0" : "60"} style={{ transition: 'stroke-dashoffset 0.8s ease 0.4s' }} />
            <line x1="70" y1="12" x2="100" y2="22" stroke="rgba(251,191,36,0.5)" strokeWidth="1" strokeDasharray="60" strokeDashoffset={phase >= 2 ? "0" : "60"} style={{ transition: 'stroke-dashoffset 0.8s ease 0.6s' }} />
            <circle cx="0" cy="15" r="3" fill="rgba(251,191,36,0.9)" style={{ opacity: phase >= 2 ? 1 : 0, transition: 'opacity 0.3s ease 0.2s' }} />
            <circle cx="40" cy="30" r="2.5" fill="rgba(251,191,36,0.7)" style={{ opacity: phase >= 2 ? 1 : 0, transition: 'opacity 0.3s ease 0.4s' }} />
            <circle cx="70" cy="12" r="2" fill="rgba(251,191,36,0.7)" style={{ opacity: phase >= 2 ? 1 : 0, transition: 'opacity 0.3s ease 0.6s' }} />
            <circle cx="100" cy="22" r="3" fill="rgba(251,191,36,0.9)" style={{ opacity: phase >= 2 ? 1 : 0, transition: 'opacity 0.3s ease 0.8s' }} />
          </svg>
        </div>

        <p className={`horizon-boot-tagline ${phase >= 3 ? 'visible' : ''}`}>
          Your dreams, illuminated.
        </p>
      </div>

      {/* Progress bar at bottom */}
      <div className="horizon-boot-progress">
        <div
          className="horizon-boot-progress-fill"
          style={{ width: `${Math.min(((Date.now() % 5000) / 5000) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── Shooting Star ──────────────────────────────────────────────

function ShootingStarRenderer({ star, active }: { star: ShootingStar; active: boolean }) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    const schedule = setTimeout(() => {
      const duration = star.duration * 1000;
      const animate = (ts: number) => {
        if (startRef.current === null) startRef.current = ts;
        const elapsed = ts - startRef.current;
        const p = Math.min(elapsed / duration, 1);
        setProgress(p);
        if (p < 1) {
          frameRef.current = requestAnimationFrame(animate);
        } else {
          setDone(true);
        }
      };
      frameRef.current = requestAnimationFrame(animate);
    }, star.delay * 1000);

    return () => {
      clearTimeout(schedule);
      cancelAnimationFrame(frameRef.current);
    };
  }, [active, star]);

  if (done || !active) return null;

  const rad = degToRad(star.angle);
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  const x = star.startX * w + Math.cos(rad) * star.length * progress;
  const y = star.startY * h + Math.sin(rad) * star.length * progress;
  const tailX = x - Math.cos(rad) * star.length * 0.6;
  const tailY = y - Math.sin(rad) * star.length * 0.6;

  return (
    <svg
      className="horizon-shooting-star"
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10005, overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`ss-grad-${star.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(251,191,36,0.9)" />
        </linearGradient>
      </defs>
      <line
        x1={tailX}
        y1={tailY}
        x2={x}
        y2={y}
        stroke={`url(#ss-grad-${star.id})`}
        strokeWidth="2"
        strokeLinecap="round"
        style={{ opacity: progress < 0.9 ? 1 : 1 - (progress - 0.9) * 10 }}
      />
      <circle cx={x} cy={y} r="2.5" fill="rgba(251,191,36,1)" style={{ opacity: progress < 0.9 ? 1 : 1 - (progress - 0.9) * 10 }} />
    </svg>
  );
}

export default HorizonBoot;
