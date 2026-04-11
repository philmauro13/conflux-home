import { View } from '../types';

interface DockProps {
  currentView: View;
  pinnedApps: View[];
  onNavigate: (view: View) => void;
  onOpenStartMenu: () => void;
}

const APP_ICONS: Record<View, { icon: string; label: string }> = {
  dashboard: { icon: '🏠', label: 'Home' },
  chat: { icon: '💬', label: 'Chat' },
  google: { icon: '🔍', label: 'Google' },
  agents: { icon: '🧩', label: 'Agents' },
  kitchen: { icon: '🍳', label: 'Kitchen' },
  budget: { icon: '💰', label: 'Budget' },
  life: { icon: '🧠', label: 'Life' },
  home: { icon: '🔧', label: 'Home Health' },
  dreams: { icon: '🎯', label: 'Dreams' },
  feed: { icon: '📰', label: 'Feed' },
  games: { icon: '📖', label: 'Stories' },
  marketplace: { icon: '🛒', label: 'Market' },
  echo: { icon: '🪞', label: 'Echo' },
  vault: { icon: '🔐', label: 'Vault' },
  studio: { icon: '✨', label: 'Studio' },
  'api-dashboard': { icon: '📊', label: 'API Dashboard' },
  settings: { icon: '⚙️', label: 'Settings' },
  onboarding: { icon: '👋', label: 'Onboarding' },
};

const DEFAULT_PINNED: View[] = ['chat', 'agents', 'kitchen', 'budget', 'settings'];

export default function Dock({ currentView, pinnedApps, onNavigate, onOpenStartMenu }: DockProps) {
  const pins = pinnedApps.length > 0 ? pinnedApps : DEFAULT_PINNED;

  return (
    <div className="dock">
      <button
        className="dock-start-btn"
        onClick={onOpenStartMenu}
        title="Start Menu"
      >
        🏠
      </button>

      <div className="dock-divider" />

      <div className="dock-items">
        {pins.map(view => {
          const app = APP_ICONS[view];
          if (!app) return null;
          const isActive = currentView === view;
          return (
            <button
              key={view}
              className={`dock-item ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(view)}
              title={app.label}
            >
              <span className="dock-item-icon">{app.icon}</span>
              <span className="dock-item-label">{app.label}</span>
            </button>
          );
        })}
      </div>

      <div className="dock-divider" />

      <button
        className="dock-item"
        onClick={onOpenStartMenu}
        title="More apps"
      >
        <span className="dock-item-icon">⋯</span>
        <span className="dock-item-label">More</span>
      </button>
    </div>
  );
}
