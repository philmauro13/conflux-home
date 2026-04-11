import { KitchenNudge } from '../types';

interface Props {
  nudges: KitchenNudge[];
  onHomeMenu: () => void;
  onPantryHeatmap: () => void;
}

export default function HearthHero({ nudges, onHomeMenu, onPantryHeatmap }: Props) {
  return (
    <div className="hearth-hero">
      <div className="hearth-hero-bg" />
      <div className="hearth-hero-content">
        <h2 className="hearth-hero-title">🔥 What's cooking?</h2>
        <div className="hearth-hero-actions">
          <button className="hearth-action-btn" onClick={onHomeMenu}>
            🍽️ What can I cook now?
          </button>
          <button className="hearth-action-btn" onClick={onPantryHeatmap}>
            🌡️ Pantry Check
          </button>
        </div>
        {nudges.length > 0 && (
          <div className="hearth-nudges">
            {nudges.map((n, i) => (
              <div key={i} className="hearth-nudge-card">
                <span className="hearth-nudge-emoji">{n.emoji}</span>
                <span className="hearth-nudge-msg">{n.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
