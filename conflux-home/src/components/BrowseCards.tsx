// Browse Cards — Library Tab (DoorDash Browse Metaphor)
// Large card grid with food photos, filter chips, pantry badges

import { Meal } from '../types';
import { MEAL_CATEGORY_EMOJI } from '../types';

interface Props {
  meals: Meal[];
  loading: boolean;
  selectedCategory: string;
  selectedCuisine: string;
  showFavorites: boolean;
  onCategoryChange: (cat: string) => void;
  onCuisineChange: (cuisine: string) => void;
  onFavoritesToggle: () => void;
  onSelect: (meal: Meal) => void;
  onQuickAdd: (mealId: string) => void;
  pantryItems: string[]; // ingredients user has
}

const CATEGORIES = ['all', 'breakfast', 'lunch', 'dinner', 'snack', 'dessert'];
const CUISINES = ['all', 'italian', 'mexican', 'asian', 'indian', 'american', 'mediterranean'];

function getCategoryLabel(cat: string): string {
  if (cat === 'all') return 'All';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

export default function BrowseCards({
  meals,
  loading,
  selectedCategory,
  selectedCuisine,
  showFavorites,
  onCategoryChange,
  onCuisineChange,
  onFavoritesToggle,
  onSelect,
  onQuickAdd,
  pantryItems,
}: Props) {
  return (
    <div className="browse-cards">
      {/* Filter Chips */}
      <div className="browse-filters">
        {/* Category Chips */}
        <div className="filter-row">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`filter-chip ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => onCategoryChange(cat)}
            >
              {cat === 'all' ? '🍽️ All' : `${MEAL_CATEGORY_EMOJI[cat] ?? '🍴'} ${getCategoryLabel(cat)}`}
            </button>
          ))}
        </div>

        {/* Cuisine Chips */}
        <div className="filter-row">
          {CUISINES.map(cuisine => (
            <button
              key={cuisine}
              className={`filter-chip cuisine-chip ${selectedCuisine === cuisine ? 'active' : ''}`}
              onClick={() => onCuisineChange(cuisine)}
            >
              {cuisine === 'all' ? '🌍 All' : getEmojiForCuisine(cuisine) + ' ' + capitalize(cuisine)}
            </button>
          ))}
        </div>

        {/* Favorites Toggle */}
        <div className="filter-row">
          <button
            className={`filter-chip fav-chip ${showFavorites ? 'active' : ''}`}
            onClick={onFavoritesToggle}
          >
            {showFavorites ? '⭐ Favorites' : '☆ All Meals'}
          </button>
        </div>
      </div>

      {/* Meal Cards Grid */}
      {loading ? (
        <div className="browse-loading">
          <div className="loading-spinner" />
          <p>Loading delicious options...</p>
        </div>
      ) : meals.length === 0 ? (
        <div className="browse-empty">
          <span className="empty-emoji">🍳</span>
          <p>No meals match your filters</p>
          <p className="empty-hint">Try adjusting your filters or add a new meal with AI</p>
        </div>
      ) : (
        <div className="browse-grid">
          {meals.map(meal => {
            const pantryMatch = checkPantryMatch(meal, pantryItems);
            return (
              <div
                key={meal.id}
                className="browse-card"
                onClick={() => onSelect(meal)}
              >
                {/* Photo */}
                <div className="browse-card-photo">
                  {meal.photo_url ? (
                    <img
                      src={meal.photo_url}
                      alt={meal.name}
                      className="browse-card-img"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <span className="photo-placeholder-emoji">{MEAL_CATEGORY_EMOJI[meal.category ?? 'dinner']}</span>
                  )}
                  {/* Pantry Badge */}
                  {pantryMatch.hasMatch && (
                    <div className="pantry-badge">
                      <span className="pantry-badge-icon">✓</span>
                      <span>Made with your pantry</span>
                    </div>
                  )}
                  {/* Favorite Badge */}
                  {meal.is_favorite && (
                    <div className="fav-badge">
                      <span>⭐</span>
                    </div>
                  )}
                </div>

                {/* Card Content */}
                <div className="browse-card-content">
                  <h4 className="browse-card-name">{meal.name}</h4>
                  {meal.description && (
                    <p className="browse-card-desc">{meal.description}</p>
                  )}
                  <div className="browse-card-meta">
                    {meal.prep_time_min && meal.cook_time_min && (
                      <span className="meta-item">⏱️ {meal.prep_time_min + meal.cook_time_min}min</span>
                    )}
                    {meal.cost_per_serving != null && (
                      <span className="meta-item">💰 ${meal.cost_per_serving.toFixed(2)}</span>
                    )}
                    <span className="meta-item">👥 {meal.servings}</span>
                  </div>

                  {/* Quick Add Button */}
                  <button
                    className="quick-add-btn"
                    onClick={e => {
                      e.stopPropagation();
                      onQuickAdd(meal.id);
                    }}
                  >
                    + Add to Plan
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getEmojiForCuisine(cuisine: string): string {
  const map: Record<string, string> = {
    italian: '🇮🇹',
    mexican: '🇲🇽',
    asian: '🥢',
    indian: '🇮🇳',
    american: '🇺🇸',
    mediterranean: '🥙',
  };
  return map[cuisine] ?? '🌍';
}

function checkPantryMatch(meal: Meal, pantryItems: string[]) {
  // Placeholder logic — in real impl, this checks meal ingredients vs pantry
  // For now, return false; will be wired up when pantry integration is ready
  return { hasMatch: false, matchedItems: [] };
}
