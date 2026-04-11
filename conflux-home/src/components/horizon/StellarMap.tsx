import { useState, useRef, useCallback } from 'react';
import type { DreamMilestone } from '../../types';

interface StellarMapProps {
  milestones: DreamMilestone[];
  selectedMilestoneId: string | null;
  onSelectMilestone: (milestoneId: string | null) => void;
}

export default function StellarMap({
  milestones,
  selectedMilestoneId,
  onSelectMilestone,
}: StellarMapProps) {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Calculate star positions in a constellation layout
  const positions = milestones.map((m, i) => {
    const angle = (i / Math.max(milestones.length, 1)) * 2 * Math.PI - Math.PI / 2;
    const radius = 120 + (i % 3) * 60; // varied radius for constellation effect
    const x = 250 + Math.cos(angle) * radius;
    const y = 200 + Math.sin(angle) * radius;
    return { ...m, x, y };
  });

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.5, Math.min(2, prev - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanX(e.clientX - dragStart.x);
    setPanY(e.clientY - dragStart.y);
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(2, prev + 0.2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(0.5, prev - 0.2));
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const getStarColor = (m: DreamMilestone) => {
    if (m.is_completed) return '#fbbf24'; // Amber
    // Check if any task for this milestone is in progress (simplified - just check position)
    return '#94a3b8'; // Gray (Slate 400) for pending
  };

  const getStarGlow = (m: DreamMilestone) => {
    if (m.is_completed) return 'drop-shadow(0 0 8px #fbbf24)';
    if (selectedMilestoneId === m.id) return 'drop-shadow(0 0 8px #06b6d4)';
    return 'none';
  };

  return (
    <div className="stellar-map">
      <svg
        ref={svgRef}
        className="stellar-map-svg"
        viewBox="0 0 500 400"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
          {/* Constellation lines */}
          {positions.map((m, i) => {
            if (i === 0) return null;
            const prev = positions[i - 1];
            return (
              <line
                key={`line-${i}`}
                x1={prev.x}
                y1={prev.y}
                x2={m.x}
                y2={m.y}
                stroke="#06b6d4"
                strokeWidth="1.5"
                strokeDasharray={m.is_completed ? '0' : '4 4'}
                opacity={0.6}
                style={{ filter: 'drop-shadow(0 0 4px #06b6d4)' }}
              />
            );
          })}

          {/* Stars (milestones) */}
          {positions.map((m) => (
            <g
              key={m.id}
              className={`stellar-star ${selectedMilestoneId === m.id ? 'selected' : ''} ${m.is_completed ? 'completed' : ''}`}
              onClick={() => onSelectMilestone(selectedMilestoneId === m.id ? null : m.id)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={m.x}
                cy={m.y}
                r={m.is_completed ? 14 : 12}
                fill={getStarColor(m)}
                stroke={selectedMilestoneId === m.id ? '#06b6d4' : 'none'}
                strokeWidth="2"
                style={{
                  filter: getStarGlow(m),
                  transition: 'all 0.3s ease',
                }}
              />
              <text
                x={m.x}
                y={m.y + 4}
                textAnchor="middle"
                fill="#0f172a"
                fontSize="12"
                fontWeight="bold"
                style={{ pointerEvents: 'none' }}
              >
                {m.is_completed ? '✓' : ''}
              </text>
              <text
                x={m.x}
                y={m.y + 24}
                textAnchor="middle"
                fill="#e2e8f0"
                fontSize="10"
                fontFamily="Inter"
                style={{ pointerEvents: 'none' }}
              >
                {m.title.length > 15 ? m.title.slice(0, 15) + '…' : m.title}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* Zoom Controls */}
      <div className="stellar-map-controls">
        <button onClick={handleZoomIn} className="stellar-map-btn" title="Zoom In">
          +
        </button>
        <button onClick={handleZoomOut} className="stellar-map-btn" title="Zoom Out">
          −
        </button>
        <button onClick={handleReset} className="stellar-map-btn" title="Reset">
          ↺
        </button>
      </div>
    </div>
  );
}
