import { GroceryItem } from '../types';

interface Props {
  items: GroceryItem[];
  onToggle: (id: string) => void;
}

export default function SmartGrocery({ items, onToggle }: Props) {
  const unchecked = items.filter(i => !i.is_checked);
  const checked = items.filter(i => i.is_checked);

  return (
    <div className="smart-grocery">
      <div className="smart-grocery-header">
        <h3>🛒 Smart Grocery List</h3>
        <span className="smart-grocery-count">{unchecked.length} items left</span>
      </div>
      <div className="smart-grocery-list">
        {unchecked.map(item => (
          <div key={item.id} className="smart-grocery-item" onClick={() => onToggle(item.id)}>
            <span className="grocery-check">☐</span>
            <span className="grocery-name">{item.name}</span>
            <span className="grocery-qty">{item.quantity} {item.unit}</span>
          </div>
        ))}
        {checked.length > 0 && (
          <>
            <div className="smart-grocery-divider">Checked ({checked.length})</div>
            {checked.map(item => (
              <div key={item.id} className="smart-grocery-item checked" onClick={() => onToggle(item.id)}>
                <span className="grocery-check">☑</span>
                <span className="grocery-name">{item.name}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
