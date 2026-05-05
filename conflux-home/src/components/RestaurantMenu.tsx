// Restaurant Menu — Home Tab (Restaurant Metaphor)
// Warm, paper-textured menu with "Chef's Specials" and "Your Regulars"

import { HomeMenuItem, Meal } from '../types';

interface Props {
  chefsSpecials: HomeMenuItem[];
  yourRegulars: Meal[];
  onSelect: (mealId: string) => void;
  loading: boolean;
}

export default function RestaurantMenu({ chefsSpecials, yourRegulars, onSelect, loading }: Props) {
  return (
    <div className="restaurant-menu">
      {/* Paper texture background */}
      <div className="menu-paper-texture" />

      {/* Chef's Specials Section */}
      <section className="menu-section">
        <h3 className="menu-section-title">
          <span className="menu-title-decoration">—</span>
          <span>Chef's Specials</span>
          <span className="menu-title-decoration">—</span>
        </h3>
        <p className="menu-section-subtitle">Curated for your kitchen today</p>

        {loading ? (
          <div className="menu-loading">Preparing the menu...</div>
        ) : chefsSpecials.length === 0 ? (
          <div className="menu-empty">No specials today. Check back later!</div>
        ) : (
          <div className="menu-items-list">
            {chefsSpecials.map((item, idx) => (
              <div
                key={item.meal_id}
                className="menu-item"
                onClick={() => onSelect(item.meal_id)}
              >
                <div className="menu-item-left">
                  <span className="menu-item-number">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="menu-item-emoji">{item.emoji}</span>
                </div>
                <div className="menu-item-content">
                  <div className="menu-item-header">
                    <span className="menu-item-name">{item.name}</span>
                    <span className="menu-item-price">~{item.estimated_minutes}min</span>
                  </div>
                  <p className="menu-item-description">{item.reason}</p>
                  {item.missing_ingredients.length > 0 && (
                    <div className="menu-item-missing">
                      <span className="missing-label">Note:</span> {item.missing_ingredients.join(', ')}
                    </div>
                  )}
                </div>
                <div className="menu-item-action">
                  <button className="menu-select-btn">Select</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Your Regulars Section */}
      {yourRegulars.length > 0 && (
        <section className="menu-section menu-section-regulars">
          <h3 className="menu-section-title">
            <span className="menu-title-decoration">—</span>
            <span>Your Regulars</span>
            <span className="menu-title-decoration">—</span>
          </h3>
          <p className="menu-section-subtitle">Favorites you return to</p>

          <div className="regulars-grid">
            {yourRegulars.map(meal => (
              <div
                key={meal.id}
                className="regular-card"
                onClick={() => onSelect(meal.id)}
              >
                {meal.photo_url ? (
                  <img
                    src={meal.photo_url}
                    alt={meal.name}
                    className="regular-img"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span className="regular-emoji">{meal.category ? getCategoryEmoji(meal.category) : '🍽️'}</span>
                )}
                <div className="regular-info">
                  <span className="regular-name">{meal.name}</span>
                  {meal.prep_time_min && meal.cook_time_min && (
                    <span className="regular-time">~{meal.prep_time_min + meal.cook_time_min}min</span>
                  )}
                </div>
                <span className="regular-star">⭐</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    breakfast: '🥞',
    lunch: '🥗',
    dinner: '🍝',
    snack: '🍪',
    dessert: '🍰',
  };
  return map[category] ?? '🍽️';
}
