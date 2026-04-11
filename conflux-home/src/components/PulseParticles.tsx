// PulseParticles.tsx — Floating emerald particles for Pulse atmosphere
import { useMemo } from 'react';

export default function PulseParticles() {
  const particles = useMemo(() => {
    return Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: 1 + Math.random() * 2,
      duration: 12 + Math.random() * 18,
      delay: Math.random() * 10,
      opacity: 0.15 + Math.random() * 0.2,
    }));
  }, []);

  return (
    <div className="pulse-ambient">
      {particles.map(p => (
        <div
          key={p.id}
          className="pulse-particle"
          style={{
            left: p.left,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  );
}
