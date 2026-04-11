import { useState, useCallback } from 'react';
import { AGENT_COLORS } from '../types';

export interface AvatarProps {
  agentId: string;
  name: string;
  emoji: string;
  status: 'idle' | 'working' | 'thinking' | 'error' | 'offline';
  size?: 'sm' | 'md' | 'lg' | 'hero'; // 32, 64, 128, 256px
  showStatus?: boolean; // default true
  onClick?: () => void;
  className?: string;
}

const SIZE_MAP = {
  sm: 32,
  md: 64,
  lg: 128,
  hero: 256,
} as const;

const STATUS_COLORS: Record<string, string> = {
  idle: '#555577',
  working: '#00ff88',
  thinking: '#ffaa00',
  error: '#ff4466',
  offline: '#555577',
};

export default function Avatar({
  agentId,
  name,
  emoji,
  status,
  size = 'md',
  showStatus = true,
  onClick,
  className,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const px = SIZE_MAP[size];
  const color = AGENT_COLORS[agentId] ?? '#8888aa';
  const isOffline = status === 'offline';

  const handleError = useCallback(() => setImgError(true), []);

  const statusDotSize = Math.max(px * 0.2, 8);
  const borderWidth = Math.max(2, px * 0.04);

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    width: px,
    height: px,
    borderRadius: '50%',
    overflow: 'visible',
    cursor: onClick ? 'pointer' : 'default',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    flexShrink: 0,
    opacity: isOffline ? 0.5 : 1,
    transform: hovered ? 'scale(1.05)' : 'scale(1)',
    boxShadow: hovered ? `0 0 16px ${color}55` : 'none',
  };

  const imgStyle: React.CSSProperties = {
    width: px,
    height: px,
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
  };

  const fallbackStyle: React.CSSProperties = {
    width: px,
    height: px,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: px * 0.4,
    lineHeight: 1,
    background: `radial-gradient(circle at 35% 35%, ${color}44, ${color}18)`,
    border: `2px solid ${color}55`,
    userSelect: 'none',
  };

  const statusDotStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: statusDotSize,
    height: statusDotSize,
    borderRadius: '50%',
    background: STATUS_COLORS[status] ?? STATUS_COLORS.idle,
    border: `${borderWidth}px solid var(--bg-primary, #0a0a0f)`,
    animation:
      status === 'working' || status === 'thinking'
        ? 'avatar-pulse 2s ease-in-out infinite'
        : 'none',
  };

  return (
    <>
      <style>{`
        @keyframes avatar-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      <div
        className={className}
        style={containerStyle}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={`${name} — ${status}`}
      >
        {!imgError ? (
          <img
            src={`/avatars/${agentId}.webp`}
            alt={name}
            style={imgStyle}
            onError={handleError}
            draggable={false}
          />
        ) : (
          <div style={fallbackStyle} aria-label={`${name} avatar`}>
            <span>{emoji}</span>
          </div>
        )}
        {showStatus && <div style={statusDotStyle} />}
      </div>
    </>
  );
}
