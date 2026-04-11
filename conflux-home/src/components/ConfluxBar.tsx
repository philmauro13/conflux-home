import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Agent } from '../types';

interface ConfluxBarProps {
  currentView: View;
  agents: Agent[];
  pinnedApps: View[];
  onNavigate: (view: View) => void;
}

interface AppItem {
  id: View;
  icon: string;
  label: string;
  category: 'work' | 'life' | 'fun' | 'system';
  description: string;
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

const ALL_APPS: AppItem[] = [
  { id: 'chat', icon: '💬', label: 'Chat', category: 'work', description: 'Talk with your AI agents' },
  { id: 'google', icon: '🔍', label: 'Google', category: 'work', description: 'Calendar, Mail & Drive' },
  { id: 'life', icon: '🧠', label: 'Life Autopilot', category: 'life', description: 'Document AI & smart reminders' },
  { id: 'home', icon: '🔧', label: 'Home Health', category: 'life', description: 'Bills, maintenance & appliances' },
  { id: 'dreams', icon: '🎯', label: 'Dream Builder', category: 'life', description: 'Goals into daily actions' },
  { id: 'kitchen', icon: '🍳', label: 'Kitchen', category: 'life', description: 'Smart meal planning & fridge' },
  { id: 'budget', icon: '💰', label: 'Budget', category: 'work', description: 'Expense tracking' },
  { id: 'feed', icon: '📰', label: 'Feed', category: 'fun', description: 'AI-curated content' },
  { id: 'games', icon: '📖', label: 'Stories', category: 'fun', description: 'Interactive adventure games' },
  { id: 'marketplace', icon: '🛒', label: 'Marketplace', category: 'system', description: 'Discover new apps & agents' },
  { id: 'agents', icon: '🧩', label: 'Agents', category: 'system', description: 'Manage your AI family' },
  { id: 'echo', icon: '🪞', label: 'Echo', category: 'life', description: 'The notebook that listens' },
  { id: 'vault', icon: '🔐', label: 'Vault', category: 'system', description: 'Encrypted password & credential manager' },
  { id: 'studio', icon: '✨', label: 'Studio', category: 'work', description: 'AI creator workspace — images, video, music, voice, web, design' },
  { id: 'settings', icon: '⚙️', label: 'Settings', category: 'system', description: 'Configure your experience' },
];

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'work', label: 'Work' },
  { id: 'life', label: 'Life' },
  { id: 'fun', label: 'Fun' },
  { id: 'system', label: 'System' },
];

const DEFAULT_PINNED: View[] = ['chat', 'kitchen', 'budget', 'settings'];

export default function ConfluxBar({ currentView, agents, pinnedApps, onNavigate }: ConfluxBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const pins = pinnedApps.length > 0 ? pinnedApps : DEFAULT_PINNED;

  // Focus search when menu opens
  useEffect(() => {
    if (menuOpen && searchRef.current) {
      searchRef.current.focus();
    }
    if (!menuOpen) {
      setSearch('');
      setCategory('all');
    }
  }, [menuOpen]);

  // Close on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [menuOpen]);

  // Close on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    // Delay to avoid immediate close on the button that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [menuOpen]);

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

  const activeAgents = agents.filter(a => a.status !== 'offline').length;
  const workingAgents = agents.filter(a => a.status === 'working' || a.status === 'thinking').length;

  const handleAppClick = useCallback((view: View) => {
    onNavigate(view);
    setMenuOpen(false);
  }, [onNavigate]);

  return (
    <div className="conflux-bar-wrapper">
      {/* Menu panel that rises from the bar */}
      {menuOpen && (
        <div className="conflux-menu" ref={menuRef}>
          {/* Agent status hero */}
          <div className="conflux-menu-hero">
            <div className="conflux-menu-hero-icon">🤖</div>
            <div className="conflux-menu-hero-text">
              <div className="conflux-menu-hero-title">Your AI Family</div>
              <div className="conflux-menu-hero-subtitle">
                {workingAgents > 0
                  ? `${workingAgents} agent${workingAgents > 1 ? 's' : ''} working · ${activeAgents} online`
                  : activeAgents > 0
                    ? `${activeAgents} agent${activeAgents > 1 ? 's' : ''} online`
                    : 'All agents resting'}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="conflux-menu-search">
            <span className="conflux-menu-search-icon">🔍</span>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search apps..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="conflux-menu-search-input"
            />
          </div>

          {/* Categories */}
          <div className="conflux-menu-categories">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                className={`conflux-menu-cat ${category === cat.id ? 'active' : ''}`}
                onClick={() => setCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* App grid */}
          <div className="conflux-menu-grid">
            {filtered.map(app => (
              <button
                key={app.id}
                className={`conflux-menu-app ${currentView === app.id ? 'active' : ''}`}
                onClick={() => handleAppClick(app.id)}
              >
                <span className="conflux-menu-app-icon">{app.icon}</span>
                <div className="conflux-menu-app-info">
                  <span className="conflux-menu-app-name">{app.label}</span>
                  <span className="conflux-menu-app-desc">{app.description}</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="conflux-menu-empty">No apps found</div>
            )}
          </div>
        </div>
      )}

      {/* The bar itself */}
      <div className="conflux-bar">
        {/* Home button */}
        <button
          className={`conflux-bar-home ${currentView === 'dashboard' && !menuOpen ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
          title="Home"
        >
          🏠
        </button>

        <div className="conflux-bar-divider" />

        {/* Pinned apps */}
        <div className="conflux-bar-apps">
          {pins.map(view => {
            const app = APP_ICONS[view];
            if (!app) return null;
            const isActive = currentView === view && !menuOpen;
            return (
              <button
                key={view}
                className={`conflux-bar-item ${isActive ? 'active' : ''}`}
                onClick={() => onNavigate(view)}
                title={app.label}
              >
                <span className="conflux-bar-item-icon">{app.icon}</span>
                <span className="conflux-bar-item-label">{app.label}</span>
              </button>
            );
          })}
        </div>

        <div className="conflux-bar-spacer" />

        {/* Search / Menu button */}
        <button
          className={`conflux-bar-search ${menuOpen ? 'active' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          title="Search apps"
        >
          🔍
        </button>
      </div>
    </div>
  );
}
