// Conflux Home — Kitchen Boot Sequence
// Cinematic 5-second intro: heat shimmer → flames rise → HEARTH materializes → tagline
//
// LocalStorage: 'hearth-boot-done' (persisted — plays once)
//
// Design: deep charcoal bg, animated flame, rising heat waves,
//         floating ember particles, warm amber glow

import { useState, useEffect, useRef } from 'react';

interface Ember {
  id: number;
  x: number;
  baseY: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
}

function KitchenBoot({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const embersRef = useRef<Ember[]>([]);
  const heatWaveRef = useRef<number>(0);

  // Static background — floating embers + heat shimmer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Initialize embers
      embersRef.current = Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: canvas.width * (0.2 + Math.random() * 0.6),
        baseY: canvas.height * (0.55 + Math.random() * 0.25),
        size: Math.random() * 3 + 1.5,
        duration: Math.random() * 3 + 2,
        delay: Math.random() * 4,
        color: `hsl(${30 + Math.random() * 20}, 90%, ${55 + Math.random() * 20}%)`,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    let animFrame: number;
    let t = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 1;
      const now = t;

      // Ambient heat shimmer (bottom portion)
      const heatY = canvas.height * 0.65;
      const heatH = canvas.height * 0.35;
      const shimmer = Math.sin(now * 0.015) * 0.15 + 0.85;
      const grad = ctx.createLinearGradient(0, heatY, 0, canvas.height);
      grad.addColorStop(0, `rgba(245, 158, 11, 0)`);
      grad.addColorStop(0.3, `rgba(245, 158, 11, ${0.04 * shimmer})`);
      grad.addColorStop(0.7, `rgba(239, 68, 68, ${0.06 * shimmer})`);
      grad.addColorStop(1, `rgba(180, 83, 9, ${0.1 * shimmer})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, heatY, canvas.width, heatH);

      // Heat wave lines
      ctx.strokeStyle = `rgba(245, 158, 11, 0.08)`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const baseY = heatY + (i / 5) * heatH * 0.6;
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        for (let x = 0; x < canvas.width; x += 8) {
          const wave = Math.sin((x * 0.02) + (now * 0.02) + i) * (4 + i * 2);
          ctx.lineTo(x, baseY + wave);
        }
        ctx.stroke();
      }

      // Floating embers (only when phase >= 2)
      if (phase >= 2) {
        embersRef.current.forEach(ember => {
          const elapsed = (now / 60) - ember.delay;
          if (elapsed < 0) return;
          const progress = elapsed / ember.duration;
          if (progress > 1) return;
          const x = ember.x + Math.sin(progress * Math.PI * 2 + ember.id) * 15;
          const y = ember.baseY - progress * (ember.baseY * 0.4);
          const alpha = progress < 0.3 ? progress / 0.3 : 1 - ((progress - 0.3) / 0.7);
          const size = ember.size * (1 - progress * 0.4);
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = ember.color.replace(')', `, ${alpha * 0.8})`).replace('hsl', 'hsla');
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
      setTimeout(() => setPhase(2), 1600),  // embers start rising
      setTimeout(() => setPhase(3), 2800),  // tagline
      setTimeout(() => setPhase(4), 4000),  // begin exit
      setTimeout(() => onComplete(), 5000),  // done
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="hearth-boot">
      {/* Canvas: heat shimmer + embers */}
      <canvas ref={canvasRef} className="hearth-boot-canvas" />

      {/* Content: logo + tagline */}
      <div className={`hearth-boot-content ${phase >= 1 ? 'visible' : ''}`}>
        {/* Flame icon */}
        <div className={`hearth-boot-flame ${phase >= 2 ? 'visible' : ''}`}>
          <svg viewBox="0 0 100 120" className="hearth-boot-flame-svg">
            {/* Outer glow */}
            <defs>
              <radialGradient id="flameGrad" cx="50%" cy="70%" r="60%">
                <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.9" />
                <stop offset="40%" stopColor="#F59E0B" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#B45309" stopOpacity="0" />
              </radialGradient>
              <filter id="flameGlow">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            {/* Main flame body */}
            <path
              className="hearth-boot-flame-path"
              d="M50 110 C20 85, 5 65, 12 45 C16 30, 28 20, 38 28 C42 18, 52 8, 58 18 C66 28, 62 48, 50 65 C45 73, 38 80, 30 82 C22 80, 18 70, 22 58 C26 46, 38 38, 50 38 C62 38, 74 46, 78 58 C82 70, 78 80, 70 82 C62 80, 55 73, 50 65 C38 48, 34 28, 42 18 C48 8, 58 18, 62 28 C72 20, 84 30, 88 45 C95 65, 80 85, 50 110Z"
              fill="url(#flameGrad)"
              filter="url(#flameGlow)"
            />
            {/* Inner bright core */}
            <ellipse cx="50" cy="72" rx="12" ry="20" fill="rgba(254,243,199,0.4)" />
          </svg>
        </div>

        {/* Logo */}
        <div className="hearth-boot-logo-row">
          <div className="hearth-boot-logo">HEARTH</div>
        </div>

        {/* Tagline */}
        <p className={`hearth-boot-tagline ${phase >= 3 ? 'visible' : ''}`}>
          your kitchen, powered by AI
        </p>
      </div>

      {/* Progress bar */}
      <div className="hearth-boot-progress">
        <div
          className="hearth-boot-progress-fill"
          style={{ width: `${Math.min(((Date.now() % 5000) / 5000) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default KitchenBoot;
