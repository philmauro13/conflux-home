import { PantryHeatItem } from '../types';

interface Props {
  items: PantryHeatItem[];
}

export default function PantryHeatmap({ items }: Props) {
  return (
    <div className="pantry-heatmap">
      <h3 className="pantry-heatmap-title">🌡️ Pantry Freshness</h3>
      <div className="pantry-heatmap-grid">
        {items.map((item, i) => {
          const hue = item.freshness * 120; // red(0) → green(120)
          return (
            <div key={i} className="pantry-heat-item" style={{ borderColor: `hsl(${hue}, 70%, 50%)` }}>
              <div className="pantry-heat-bar" style={{ width: `${item.freshness * 100}%`, background: `hsl(${hue}, 70%, 50%)` }} />
              <span className="pantry-heat-name">{item.name}</span>
              <span className="pantry-heat-days">
                {item.days_until_expiry !== null
                  ? item.days_until_expiry < 0 ? '⚠️ expired' : `${item.days_until_expiry}d`
                  : '✓ fresh'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
