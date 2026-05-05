import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  radius: number;
  color: string;
  velocityX: number;
  velocityY: number;
  pulse: number;
  pulseSpeed: number;
}

interface StudioBackgroundProps {
  className?: string;
}

// Module-specific accent colors (from existing palette + extensions)
const MODULE_COLORS = {
  image: 'rgba(168, 85, 247, 0.25)',   // purple
  video: 'rgba(236, 72, 153, 0.25)',   // pink
  music: 'rgba(6, 182, 212, 0.25)',    // cyan
  voice: 'rgba(59, 130, 246, 0.25)',   // blue
  code:  'rgba(34, 197, 94, 0.25)',    // green
  design: 'rgba(249, 115, 22, 0.25)',  // orange
};

export default function StudioBackground({ className = '' }: StudioBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>(0);
  const isLowEndRef = useRef<boolean>(false);

  // Initialize particles
  const initParticles = (width: number, height: number) => {
    const hwConcurrency = window.navigator.hardwareConcurrency;
    const isLowEnd = hwConcurrency !== undefined && hwConcurrency <= 4;
    isLowEndRef.current = isLowEnd;
    const baseCount = isLowEnd ? 8 : 15; // 8 for low-end, 15 for normal (within 12-18 range)
    const colors = Object.values(MODULE_COLORS);
    const particles: Particle[] = [];

    for (let i = 0; i < baseCount; i++) {
      const radius = 120 + Math.random() * 200; // large orbs (120-320px)
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius,
        color: colors[Math.floor(Math.random() * colors.length)],
        velocityX: (Math.random() - 0.5) * 0.4,
        velocityY: (Math.random() - 0.5) * 0.4,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.008 + Math.random() * 0.012,
      });
    }

    particlesRef.current = particles;
  };

  // Update particle positions
  const updateParticles = (width: number, height: number) => {
    particlesRef.current.forEach(p => {
      p.x += p.velocityX;
      p.y += p.velocityY;
      p.pulse += p.pulseSpeed;

      // Wrap around edges
      if (p.x < -p.radius) p.x = width + p.radius;
      if (p.x > width + p.radius) p.x = -p.radius;
      if (p.y < -p.radius) p.y = height + p.radius;
      if (p.y > height + p.radius) p.y = -p.radius;
    });
  };

  // Draw particles
  const drawParticles = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);

    particlesRef.current.forEach(p => {
      const pulseFactor = 1 + Math.sin(p.pulse) * 0.15; // ±15% size variation
      const currentRadius = p.radius * pulseFactor;

      const gradient = ctx.createRadialGradient(
        p.x, p.y, 0,
        p.x, p.y, currentRadius
      );

      // Parse the rgba color and add glow stops
      gradient.addColorStop(0, p.color);
      gradient.addColorStop(0.5, p.color.replace('0.25)', '0.08)'));
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  // Animation loop
  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    updateParticles(width, height);
    drawParticles(ctx, width, height);

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  // Handle resize
  const handleResize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Re-init particles if needed (only if count changed dramatically)
    if (particlesRef.current.length === 0) {
      initParticles(canvas.width, canvas.height);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initial setup
    handleResize();

    // Watch for container size changes
    const resizeObserver = new ResizeObserver(handleResize);
    const container = canvas.parentElement;
    if (container) {
      resizeObserver.observe(container);
    }

    // Start animation
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
