import { HomeMenuItem } from '../types';

interface Props {
  items: HomeMenuItem[];
  onSelect: (mealId: string) => void;
}

export default function HomeMenu({ items, onSelect }: Props) {
  return (
    <div className="home-menu">
      <h3 className="home-menu-title">🍽️ What can I cook RIGHT NOW?</h3>
      <div className="home-menu-grid">
        {items.map(item => (
          <div key={item.meal_id} className="home-menu-card" onClick={() => onSelect(item.meal_id)}>
            <span className="home-menu-emoji">{item.emoji}</span>
            <div className="home-menu-info">
              <div className="home-menu-name">{item.name}</div>
              <div className="home-menu-reason">{item.reason}</div>
              <div className="home-menu-time">~{item.estimated_minutes} min</div>
            </div>
            {item.missing_ingredients.length > 0 && (
              <div className="home-menu-missing">
                Missing: {item.missing_ingredients.join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
