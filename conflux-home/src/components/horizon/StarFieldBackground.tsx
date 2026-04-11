import { useState, useEffect, useCallback } from 'react';

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
}

export default function StarFieldBackground() {
  const [stars, setStars] = useState<Star[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Generate stars on mount
  useEffect(() => {
    const newStars: Star[] = [];
    for (let i = 0; i < 80; i++) {
      newStars.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.7 + 0.3,
        twinkleSpeed: Math.random() * 3 + 2,
      });
    }
    setStars(newStars);
  }, []);

  // Parallax effect on mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    setMousePos({ x, y });
  }, []);

  return (
    <div
      className="starfield-background"
      onMouseMove={handleMouseMove}
      style={{
        transform: `translate(${mousePos.x * 0.5}px, ${mousePos.y * 0.5}px)`,
      }}
    >
      {stars.map((star) => (
        <div
          key={star.id}
          className="starfield-star"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            animationDuration: `${star.twinkleSpeed}s`,
          }}
        />
      ))}
    </div>
  );
}
