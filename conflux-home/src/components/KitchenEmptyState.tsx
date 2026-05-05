// KitchenEmptyState — First-run welcome for Hearth (Kitchen app)
// Shown when meals.length === 0

import { useState, useCallback } from 'react';

interface Props {
  onAddMeal: (description: string) => void;
  onOpenLibrary: () => void;
  isLoading?: boolean;
}

const HINTS = [
  'chicken parmesan with spaghetti',
  'grilled salmon with roasted vegetables',
  'pasta with tomato sauce and garlic bread',
  'beef tacos with fresh salsa',
  'veggie stir-fry with rice',
];

function getRandomHint(): string {
  return HINTS[Math.floor(Math.random() * HINTS.length)];
}

export default function KitchenEmptyState({ onAddMeal, onOpenLibrary, isLoading = false }: Props) {
  const [input, setInput] = useState('');
  const [hint] = useState(getRandomHint);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    onAddMeal(input.trim());
    setInput('');
  }, [input, isLoading, onAddMeal]);

  return (
    <div className="kitchen-empty-state">
      {/* Background effects */}
      <div className="kitchen-empty-bg">
        <div className="kitchen-empty-steam" />
        <div className="kitchen-empty-steam steam-2" />
        <div className="kitchen-empty-steam steam-3" />
      </div>

      {/* Main card */}
      <div className="kitchen-empty-card">
        {/* Header */}
        <div className="kitchen-empty-header">
          <div className="kitchen-empty-icon">🔥</div>
          <h2 className="kitchen-empty-title">Welcome to Hearth</h2>
          <p className="kitchen-empty-subtitle">
            Your kitchen companion is ready to help you plan meals, track your pantry, and cook smarter.
          </p>
        </div>

        {/* AI Add Section */}
        <div className="kitchen-empty-ai-section">
          <div className="ai-add-header">
            <span className="ai-add-icon">✨</span>
            <span>Describe your first meal</span>
          </div>

          <form className="kitchen-empty-form" onSubmit={handleSubmit}>
            <div className="kitchen-empty-input-row">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={`e.g., "${hint}"`}
                className="kitchen-empty-input"
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div className="kitchen-empty-actions">
              <button
                type="submit"
                className="btn-primary kitchen-empty-submit"
                disabled={isLoading || !input.trim()}
              >
                {isLoading ? (
                  <>
                    <span className="spinner" /> Creating...
                  </>
                ) : (
                  <>✨ Add with AI</>
                )}
              </button>
            </div>
          </form>

          <p className="ai-add-hint">
            Try: "{hint}" or anything you want to cook
          </p>
        </div>

        {/* Divider */}
        <div className="kitchen-empty-divider">
          <span>or</span>
        </div>

        {/* Browse Examples CTA */}
        <div className="kitchen-empty-browse">
          <p className="kitchen-empty-browse-text">
            Want to explore first? Browse your library to see what's possible.
          </p>
          <button
            className="btn-secondary kitchen-empty-browse-btn"
            onClick={onOpenLibrary}
          >
            📚 Open Library
          </button>
        </div>
      </div>

      {/* Footer tip */}
      <div className="kitchen-empty-footer">
        <span className="kitchen-empty-tip">💡 Tip: You can also say "add [meal]" from anywhere in the app using the global AI input</span>
      </div>
    </div>
  );
}
