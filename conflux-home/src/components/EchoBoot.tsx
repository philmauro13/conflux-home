// Conflux Home — Echo Boot Sequence
// Warm ember aesthetic: floating light particles → "ECHO" materializes → gentle pulse
// Duration: ~5 seconds

import { useState, useEffect, useRef } from 'react';

interface Ember {
  x: number;
  y: number;
  r: number;
  alpha: number;
  speed: number;
  drift: number;
  phase: number;
}

interface EchoBootProps {
  onComplete: () => void;
}

export default function EchoBoot({ onComplete }: EchoBootProps) {
  const [phase, setPhase] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const embersRef = useRef<Ember[]>([]);
  const frameRef = useRef<number>(0);

  // Floating embers canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Initialize embers
      embersRef.current = Array.from({ length: 60 }, () => createEmber(canvas.width, canvas.height, true));
    };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 1;

      embersRef.current.forEach(ember => {
        ember.y -= ember.speed;
        ember.x += Math.sin(t * 0.01 + ember.phase) * ember.drift;
        ember.alpha = Math.sin(t * 0.02 + ember.phase) * 0.25 + 0.5;

        const grad = ctx.createRadialGradient(ember.x, ember.y, 0, ember.x, ember.y, ember.r * 3);
        grad.addColorStop(0, `rgba(200, 160, 255, ${ember.alpha})`);
        grad.addColorStop(0.4, `rgba(147, 112, 219, ${ember.alpha * 0.5})`);
        grad.addColorStop(1, 'rgba(147, 112, 219, 0)');

        ctx.beginPath();
        ctx.arc(ember.x, ember.y, ember.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Reset ember when it drifts off screen
        if (ember.y < -20) {
          Object.assign(ember, createEmber(canvas.width, canvas.height, false));
        }
      });

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const createEmber = (w: number, h: number, randomY: boolean): Ember => ({
    x: Math.random() * w,
    y: randomY ? Math.random() * h : h + 10 + Math.random() * 100,
    r: Math.random() * 2 + 0.8,
    alpha: Math.random() * 0.4 + 0.2,
    speed: Math.random() * 0.6 + 0.15,
    drift: Math.random() * 0.4 - 0.2,
    phase: Math.random() * Math.PI * 2,
  });

  // Phase timeline
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),   // logo appears
      setTimeout(() => setPhase(2), 2000), // tagline
      setTimeout(() => setPhase(3), 3800),  // begin exit
      setTimeout(() => onComplete(), 4800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="echo-boot">
      {/* Ember canvas */}
      <canvas ref={canvasRef} className="echo-boot-canvas" />

      {/* Deep gradient background */}
      <div className="echo-boot-bg" aria-hidden="true" />

      {/* Central glow */}
      <div className={`echo-boot-glow ${phase >= 1 ? 'visible' : ''}`} aria-hidden="true" />

      {/* Logo */}
      <div className={`echo-boot-content ${phase >= 1 ? 'visible' : ''}`}>
        {/* Pulsing orb */}
        <div className="echo-boot-orb-wrap">
          <div className="echo-boot-orb" />
          <div className="echo-boot-orb-ring echo-boot-orb-ring-1" />
          <div className="echo-boot-orb-ring echo-boot-orb-ring-2" />
        </div>

        <h1 className="echo-boot-logo">ECHO</h1>

        <p className={`echo-boot-tagline ${phase >= 2 ? 'visible' : ''}`}>
          You don't have to be okay.<br />You just have to show up.
        </p>
      </div>

      {/* Progress bar */}
      <div className="echo-boot-progress">
        <div
          className="echo-boot-progress-fill"
          style={{ width: `${Math.min(((Date.now() % 4800) / 4800) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}
