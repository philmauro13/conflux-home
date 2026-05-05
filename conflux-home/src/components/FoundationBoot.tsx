// Conflux Home — Foundation Boot Sequence
// Blueprint aesthetic: house schematic draws itself → FOUNDATION materializes
// Duration: ~4 seconds

import { useState, useEffect, useRef } from 'react';

interface BootSequenceProps {
  onComplete: () => void;
}

const SYSTEMS = [
  { icon: '🏠', label: 'HVAC' },
  { icon: '💧', label: 'Plumbing' },
  { icon: '⚡', label: 'Electrical' },
  { icon: '🔥', label: 'Water Heater' },
  { icon: '🛡️', label: 'Roof' },
];

export default function FoundationBoot({ onComplete }: BootSequenceProps) {
  const [phase, setPhase] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blueprintProgress, setBlueprintProgress] = useState(0);

  // Blueprint drawing animation via canvas
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
    let startTime: number | null = null;
    const duration = 2000; // 2 seconds for blueprint draw

    const housePath: Array<{ type: 'rect'; x: number; y: number; w: number; h: number } | { type: 'line'; x1: number; y1: number; x2: number; y2: number }> = [
      { type: 'rect', x: 0.5, y: 0.52, w: 0.22, h: 0.08 },
      { type: 'rect', x: 0.45, y: 0.35, w: 0.32, h: 0.17 },
      { type: 'line', x1: 0.35, y1: 0.35, x2: 0.61, y2: 0.35 },
      { type: 'line', x1: 0.37, y1: 0.35, x2: 0.5, y2: 0.18 },
      { type: 'line', x1: 0.63, y1: 0.35, x2: 0.5, y2: 0.18 },
      { type: 'rect', x: 0.55, y: 0.15, w: 0.04, h: 0.08 },
      { type: 'rect', x: 0.58, y: 0.43, w: 0.05, h: 0.09 },
      { type: 'rect', x: 0.46, y: 0.42, w: 0.06, h: 0.06 },
    ];

    let currentElement = 0;
    let currentSubProgress = 0;

    const animate = (ts: number) => {
      if (startTime === null) startTime = ts;
      const elapsed = ts - startTime;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const overallProgress = Math.min(elapsed / duration, 1);
      setBlueprintProgress(overallProgress);

      // How many full elements to draw
      const totalElements = housePath.length;
      const targetElement = Math.floor(overallProgress * totalElements);
      const subProgress = (overallProgress * totalElements) % 1;

      ctx.strokeStyle = 'rgba(100, 116, 139, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const cx = canvas.width / 2;
      const cy = canvas.height / 2 - 40;
      const scale = Math.min(canvas.width, canvas.height) * 0.18;

      for (let i = 0; i < totalElements; i++) {
        const elem = housePath[i];
        const isActive = i < targetElement || (i === targetElement && overallProgress < 1);
        const isPartial = i === targetElement && overallProgress < 1;

        ctx.globalAlpha = isActive ? 1 : 0.15;
        if (elem.type === 'rect') {
          const x = cx + (elem.x - 0.61) * scale;
          const y = cy + (elem.y - 0.35) * scale;
          const w = elem.w * scale;
          const h = elem.h * scale;
          ctx.beginPath();
          if (isPartial) {
            // Partial rect drawing
            const progress = subProgress;
            ctx.rect(x, y, w * progress, h * progress);
          } else {
            ctx.rect(x, y, w, h);
          }
          ctx.stroke();
        } else if (elem.type === 'line') {
          const x1 = cx + (elem.x1 - 0.61) * scale;
          const y1 = cy + (elem.y1 - 0.35) * scale;
          const x2 = cx + (elem.x2 - 0.61) * scale;
          const y2 = cy + (elem.y2 - 0.35) * scale;
          ctx.beginPath();
          if (isPartial) {
            const progress = subProgress;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 + (x2 - x1) * progress, y1 + (y2 - y1) * progress);
          } else {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      if (overallProgress < 1) {
        animFrame = requestAnimationFrame(animate);
      } else {
        // Hold final state for a moment
        setTimeout(() => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }, 300);
      }
    };

    animFrame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Phase timeline
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),   // blueprint starts
      setTimeout(() => setPhase(2), 2200), // logo + tagline
      setTimeout(() => setPhase(3), 3400), // begin exit
      setTimeout(() => onComplete(), 4200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div className="foundation-boot">
      {/* Blueprint grid background */}
      <div className="foundation-boot-grid" aria-hidden="true" />

      {/* Blueprint house drawing */}
      <div className={`foundation-boot-house ${phase >= 1 ? 'visible' : ''}`}>
        <canvas ref={canvasRef} className="foundation-boot-canvas" />
      </div>

      {/* House glowing outline overlay */}
      {phase >= 2 && (
        <div className="foundation-boot-house-glow" aria-hidden="true" />
      )}

      {/* Logo + tagline */}
      <div className={`foundation-boot-content ${phase >= 2 ? 'visible' : ''}`}>
        <div className="foundation-boot-icon-row">
          <span className="foundation-boot-icon">🛡️</span>
          <div className="foundation-boot-icon-pulse" />
        </div>

        <h1 className="foundation-boot-logo">FOUNDATION</h1>
        <p className="foundation-boot-tagline">Your home, protected.</p>

        {/* Mini system icons */}
        <div className="foundation-boot-systems">
          {SYSTEMS.map((sys, i) => (
            <div
              key={sys.label}
              className="foundation-boot-system-chip"
              style={{
                animationDelay: `${0.8 + i * 0.12}s`,
                opacity: phase >= 3 ? 0 : 1,
                transition: 'opacity 0.4s ease',
              }}
            >
              <span>{sys.icon}</span>
              <span>{sys.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="foundation-boot-progress">
        <div
          className="foundation-boot-progress-fill"
          style={{ width: `${Math.min(((Date.now() % 4200) / 4200) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}
