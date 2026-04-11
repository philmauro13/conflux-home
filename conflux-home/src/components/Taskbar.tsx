import { View } from '../types';

interface TaskbarProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const ITEMS: { view: View; icon: string; label: string }[] = [
  { view: 'dashboard', icon: '🏠', label: 'Dash' },
  { view: 'chat', icon: '💬', label: 'Chat' },
  { view: 'life', icon: '🧠', label: 'Life' },
  { view: 'home', icon: '🔧', label: 'Home' },
  { view: 'dreams', icon: '🎯', label: 'Dreams' },
  { view: 'agents', icon: '🧩', label: 'Agents' },
  { view: 'games', icon: '📖', label: 'Games' },
  { view: 'kitchen', icon: '🍳', label: 'Kitchen' },
  { view: 'budget', icon: '💰', label: 'Budget' },
  { view: 'feed', icon: '📰', label: 'Feed' },
  { view: 'marketplace', icon: '🛒', label: 'Market' },
  { view: 'settings', icon: '⚙️', label: 'Settings' },
];

export default function Taskbar({ currentView, onNavigate }: TaskbarProps) {
  return (
    <div className="taskbar">
      {ITEMS.map((item) => (
        <button
          key={item.view}
          className={`taskbar-item ${currentView === item.view ? 'active' : ''}`}
          onClick={() => onNavigate(item.view)}
          title={item.label}
        >
          <span className="taskbar-icon">{item.icon}</span>
          <span className="taskbar-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
