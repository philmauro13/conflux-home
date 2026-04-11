// Conflux Home — Game Hub
// Shows active story games and a button to start new ones.

import { useState, useCallback } from 'react';
import type { StoryGame, StorySeed, CreateStoryGameRequest, FamilyMember } from '../types';
import { GENRE_CONFIG, AGE_GROUP_CONFIG } from '../types';

interface GameHubProps {
  games: StoryGame[];
  seeds: StorySeed[];
  member: FamilyMember | null;
  onCreateGame: (req: CreateStoryGameRequest) => Promise<StoryGame>;
  onOpenGame: (gameId: string) => void;
}

export default function GameHub({ games, seeds, member, onCreateGame, onOpenGame }: GameHubProps) {
  const [showLauncher, setShowLauncher] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [genreFilter, setGenreFilter] = useState<string>('all');

  const handleStart = useCallback(async (seed: StorySeed) => {
    setCreating(seed.id);
    try {
      const game = await onCreateGame({
        title: seed.title,
        genre: seed.genre as any,
        age_group: seed.age_group as any,
        difficulty: seed.difficulty as any,
      });
      setShowLauncher(false);
      onOpenGame(game.id);
    } finally {
      setCreating(null);
    }
  }, [onCreateGame, onOpenGame]);

  const filteredSeeds = seeds.filter(s => {
    if (genreFilter !== 'all' && s.genre !== genreFilter) return false;
    if (member && s.age_group !== member.age_group) return false;
    return true;
  });

  const activeGames = games.filter(g => g.status === 'active');

  return (
    <div className="game-hub">
      {/* Active Games */}
      {activeGames.length > 0 && (
        <div className="game-hub-section">
          <h3 className="game-hub-title">📖 Continue Your Adventure</h3>
          <div className="active-games-list">
            {activeGames.map(game => (
              <button
                key={game.id}
                className="active-game-card"
                onClick={() => onOpenGame(game.id)}
              >
                <span className="game-card-genre">{GENRE_CONFIG[game.genre]?.emoji}</span>
                <div className="game-card-info">
                  <div className="game-card-title">{game.title}</div>
                  <div className="game-card-meta">
                    Chapter {game.current_chapter} · {GENRE_CONFIG[game.genre]?.label}
                  </div>
                </div>
                <span className="game-card-arrow">▸</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Start New Game */}
      <div className="game-hub-section">
        <div className="game-hub-row">
          <h3 className="game-hub-title">✨ Start a New Story</h3>
          <button
            className="btn-secondary"
            onClick={() => setShowLauncher(!showLauncher)}
          >
            {showLauncher ? 'Hide' : 'Browse Stories'}
          </button>
        </div>

        {showLauncher && (
          <>
            {/* Genre Filter */}
            <div className="genre-filter" style={{ marginTop: 12 }}>
              <button
                className={`genre-btn ${genreFilter === 'all' ? 'active' : ''}`}
                onClick={() => setGenreFilter('all')}
              >
                All
              </button>
              {Object.entries(GENRE_CONFIG).map(([key, config]) => (
                <button
                  key={key}
                  className={`genre-btn ${genreFilter === key ? 'active' : ''}`}
                  onClick={() => setGenreFilter(key)}
                >
                  {config.emoji} {config.label}
                </button>
              ))}
            </div>

            <div className="seeds-grid" style={{ marginTop: 12 }}>
              {filteredSeeds.length === 0 ? (
                <div className="seeds-empty">
                  <p>No stories available{member ? ` for ${member.name}` : ''}.</p>
                </div>
              ) : (
                filteredSeeds.map(seed => (
                  <div key={seed.id} className="seed-card">
                    <div className="seed-header">
                      <span className="seed-genre">{GENRE_CONFIG[seed.genre]?.emoji}</span>
                      <span className="seed-difficulty">
                        {seed.difficulty === 'easy' ? '⭐' : seed.difficulty === 'hard' ? '⭐⭐⭐' : '⭐⭐'}
                      </span>
                    </div>
                    <h3>{seed.title}</h3>
                    <p className="seed-preview">{seed.opening.slice(0, 100)}...</p>
                    <button
                      className="btn-primary seed-start-btn"
                      onClick={() => handleStart(seed)}
                      disabled={creating !== null}
                    >
                      {creating === seed.id ? 'Starting...' : 'Begin →'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
