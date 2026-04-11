import { useState, useMemo, useRef, useEffect } from 'react';
import { View } from '../types';

interface StartMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: View) => void;
}

interface AppItem {
  id: View;
  icon: string;
  label: string;
  category: 'work' | 'life' | 'fun' | 'system';
  description: string;
}

const ALL_APPS: AppItem[] = [
  { id: 'chat', icon: '💬', label: 'Chat', category: 'work', description: 'Talk with your AI agents' },
  { id: 'agents', icon: '🧩', label: 'Agent Library', category: 'work', description: 'Browse and install agents' },
  { id: 'life', icon: '🧠', label: 'Life Autopilot', category: 'life', description: 'Document AI & smart reminders' },
  { id: 'home', icon: '🔧', label: 'Home Health', category: 'life', description: 'Bills, maintenance & appliances' },
  { id: 'dreams', icon: '🎯', label: 'Dream Builder', category: 'life', description: 'Goals into daily actions' },
  { id: 'kitchen', icon: '🍳', label: 'Kitchen', category: 'life', description: 'Smart meal planning & fridge' },
  { id: 'budget', icon: '💰', label: 'Budget', category: 'work', description: 'Expense tracking' },
  { id: 'feed', icon: '📰', label: 'Feed', category: 'fun', description: 'AI-curated content' },
  { id: 'games', icon: '📖', label: 'Stories', category: 'fun', description: 'Interactive adventure games' },
  { id: 'marketplace', icon: '🛒', label: 'Marketplace', category: 'system', description: 'Discover new apps & agents' },
  { id: 'settings', icon: '⚙️', label: 'Settings', category: 'system', description: 'Configure your experience' },
];

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'work', label: 'Work' },
  { id: 'life', label: 'Life' },
  { id: 'fun', label: 'Fun' },
  { id: 'system', label: 'System' },
];

export default function StartMenu({ isOpen, onClose, onNavigate }: StartMenuProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
    if (!isOpen) {
      setSearch('');
      setCategory('all');
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    let apps = ALL_APPS;
    if (category !== 'all') {
      apps = apps.filter(a => a.category === category);
    }
    if (search) {
      const q = search.toLowerCase();
      apps = apps.filter(a =>
        a.label.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      );
    }
    return apps;
  }, [search, category]);

  if (!isOpen) return null;

  return (
    <>
      <div className="start-menu-backdrop" onClick={onClose} />
      <div className="start-menu">
        <div className="start-menu-search">
          <span className="start-menu-search-icon">🔍</span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="start-menu-search-input"
          />
        </div>

        <div className="start-menu-categories">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`start-menu-cat ${category === cat.id ? 'active' : ''}`}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="start-menu-grid">
          {filtered.map(app => (
            <button
              key={app.id}
              className="start-menu-app"
              onClick={() => { onNavigate(app.id); onClose(); }}
            >
              <span className="start-menu-app-icon">{app.icon}</span>
              <div className="start-menu-app-info">
                <span className="start-menu-app-name">{app.label}</span>
                <span className="start-menu-app-desc">{app.description}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="start-menu-empty">No apps found</div>
          )}
        </div>
      </div>
    </>
  );
}
