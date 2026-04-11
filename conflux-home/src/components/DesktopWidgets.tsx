import { View } from '../types';

interface WidgetDef {
  id: string;
  icon: string;
  label: string;
  preview: string;
  color: string;
}

const WIDGETS: WidgetDef[] = [
  { id: 'google', icon: '🔍', label: 'Google', preview: 'Calendar · Mail · Drive', color: '#4285f4' },
  { id: 'budget', icon: '💰', label: 'Budget', preview: 'Weekly spend summary', color: '#10b981' },
  { id: 'kitchen', icon: '🍳', label: 'Kitchen', preview: "Tonight's meal plan", color: '#f59e0b' },
  { id: 'life', icon: '🧠', label: 'Life Autopilot', preview: 'Active reminders', color: '#6366f1' },
  { id: 'home', icon: '🔧', label: 'Home Health', preview: 'Systems check', color: '#3b82f6' },
  { id: 'dreams', icon: '🎯', label: 'Dreams', preview: 'Current milestones', color: '#8b5cf6' },
  { id: 'agents', icon: '🧩', label: 'Agents', preview: 'Active agents', color: '#3b82f6' },
  { id: 'games', icon: '🎮', label: 'Games', preview: 'Play and compete', color: '#f43f5e' },
  { id: 'feed', icon: '📰', label: 'Feed', preview: 'Latest items', color: '#0ea5e9' },
  { id: 'marketplace', icon: '🛒', label: 'Marketplace', preview: 'Browse agents', color: '#84cc16' },
  { id: 'settings', icon: '⚙️', label: 'Settings', preview: 'System config', color: '#64748b' },
];

interface DesktopWidgetsProps {
  onNavigate: (view: View) => void;
}

export default function DesktopWidgets({ onNavigate }: DesktopWidgetsProps) {
  return (
    <>
      <div className="desktop-widgets-grid">
        {WIDGETS.map((widget) => (
          <div
            key={widget.id}
            className="desktop-widget"
            onClick={() => onNavigate(widget.id as View)}
            style={{
              '--widget-color': widget.color,
            } as React.CSSProperties}
          >
            <div
              className="widget-accent"
              style={{
                background: `linear-gradient(90deg, ${widget.color}, ${widget.color}88)`,
              }}
            />
            <div className="widget-body">
              <div className="widget-icon">{widget.icon}</div>
              <div className="widget-label">{widget.label}</div>
              <div className="widget-preview">{widget.preview}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
