import { useState, useEffect } from 'react';

interface GamesHubProps {
  onOpenGame: (gameId: string) => void;
  onBack?: () => void;
}

interface GameDef {
  id: string;
  name: string;
  icon: string;
  subtitle: string;
  status: 'available' | 'coming-soon';
  size: 'large' | 'normal' | 'wide';
}

const GAMES: GameDef[] = [
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    icon: '💣',
    subtitle: 'Classic · 9×9',
    status: 'available',
    size: 'large',
  },
  {
    id: 'solitaire',
    name: 'Solitaire',
    icon: '🃏',
    subtitle: 'Classic Card Game',
    status: 'available',
    size: 'normal',
  },
  {
    id: 'pacman',
    name: 'Pac-Man',
    icon: '🟡',
    subtitle: 'Arcade Classic',
    status: 'available',
    size: 'normal',
  },
  {
    id: 'nani-solitaire',
    name: 'Nani Solitaire',
    icon: '🎴',
    subtitle: 'Family Tradition · Unique',
    status: 'available',
    size: 'normal',
  },
  {
    id: 'johnny-solitaire',
    name: "Johnny C's Solitaire",
    icon: '🀄',
    subtitle: 'FreeCell Variant · 8 Columns',
    status: 'available',
    size: 'normal',
  },
  {
    id: 'snake',
    name: 'Snake',
    icon: '🐍',
    subtitle: 'Arcade Classic',
    status: 'available',
    size: 'normal',
  },
  {
    id: 'stories',
    name: 'Conflux Stories',
    icon: '📖',
    subtitle: 'Interactive Fiction',
    status: 'coming-soon',
    size: 'wide',
  },
];

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function GamesHub({ onOpenGame, onBack }: GamesHubProps) {
  const [bestTimes, setBestTimes] = useState<Record<string, number>>({});
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('conflux_sound_enabled') !== 'false';
    } catch {
      return true;
    }
  });

  // Load best times from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('conflux_minesweeper_best');
      if (saved) setBestTimes(JSON.parse(saved));
    } catch {
      // ignore parse errors
    }
  }, []);

  // Persist sound preference
  useEffect(() => {
    try {
      localStorage.setItem('conflux_sound_enabled', String(soundEnabled));
    } catch {
      // ignore storage errors
    }
  }, [soundEnabled]);

  return (
    <div className="games-hub">
      {/* Header */}
      <div className="games-hub-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#aaa',
                padding: '6px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              ← Discover
            </button>
          )}
          <div>
            <h2 className="games-hub-title">🎮 Games</h2>
            <p className="games-hub-subtitle">Play, compete, and unwind</p>
          </div>
        </div>
        <div className="games-header-actions">
          <button
            className="sound-toggle-global"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>
        </div>
      </div>

      {/* Game Grid — Bento Layout */}
      <div className="games-grid">
        {GAMES.map((game) => (
          <div
            key={game.id}
            className={`game-card game-card-${game.size} ${game.status === 'coming-soon' ? 'game-card-locked' : ''}`}
            onClick={() => game.status === 'available' && onOpenGame(game.id)}
          >
            {/* Coming Soon Badge */}
            {game.status === 'coming-soon' && (
              <div className="coming-soon-badge">Coming Soon</div>
            )}

            {/* Icon */}
            <div className="game-card-icon">{game.icon}</div>

            {/* Info */}
            <div className="game-card-info">
              <h3 className="game-card-name">{game.name}</h3>
              <p className="game-card-subtitle">{game.subtitle}</p>
            </div>

            {/* Play button (only for available games) */}
            {game.status === 'available' && (
              <button className="game-play-btn">▶ Play Now</button>
            )}

            {/* Best time (only for minesweeper) */}
            {game.id === 'minesweeper' && bestTimes.beginner != null && (
              <div className="game-best-time">
                🏆 Best: {formatTime(bestTimes.beginner)}
              </div>
            )}

            {/* Breathing animation for coming soon cards */}
            {game.status === 'coming-soon' && <div className="coming-soon-glow" />}
          </div>
        ))}
      </div>
    </div>
  );
}
