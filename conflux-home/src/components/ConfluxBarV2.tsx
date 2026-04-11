import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Agent } from '../types';
import { playClick, playNavSwish } from '../lib/sound';

// ── Agent-to-View mapping (canonical) ──
const AGENT_TO_VIEW: Record<string, View> = {
  hearth: 'kitchen',
  pulse: 'budget',
  orbit: 'life',
  horizon: 'dreams',
  current: 'feed',
  foundation: 'home',
};

const VIEW_BADGE_LABEL: Record<string, string> = {
  kitchen: 'items expiring',
  budget: 'spent this month',
  life: 'pending tasks',
  dreams: 'active goals',
  feed: 'unread items',
  home: 'overdue items',
};

const VIEW_BADGE_EMOJI: Record<string, string> = {
  kitchen: '🍳',
  budget: '💰',
  life: '🧠',
  dreams: '🎯',
  feed: '📰',
  home: '🔧',
};

interface ConfluxBarV2Props {
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

interface BadgeInfo {
  agentId: string;
  badgeText?: string;
  badgeType?: string;
  statusText: string;
  details?: string;
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
  settings: { icon: '⚙️', label: 'Settings' },
  onboarding: { icon: '👋', label: 'Onboarding' },
  'api-dashboard': { icon: '📊', label: 'API' },
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
  { id: 'api-dashboard', icon: '📊', label: 'API Dashboard', category: 'work', description: 'Manage your API usage and credits' },
  { id: 'settings', icon: '⚙️', label: 'Settings', category: 'system', description: 'Configure your experience' },
];

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'work', label: 'Work' },
  { id: 'life', label: 'Life' },
  { id: 'fun', label: 'Fun' },
  { id: 'system', label: 'System' },
];

// The 5 intelligence agents get badges on the dock
const INTELLIGENCE_VIEWS: View[] = ['kitchen', 'budget', 'life', 'dreams', 'feed', 'home'];

export default function ConfluxBarV2({
  currentView,
  agents,
  onNavigate,
  statusBadges = {},
  statusDetails = {},
  onStatusClick,
  onBadgeClick,
}: ConfluxBarV2Props & {
  statusBadges?: Record<string, { badgeText?: string; badgeType?: string }>;
  statusDetails?: Record<string, BadgeInfo>;
  onStatusClick?: () => void;
  onBadgeClick?: (view: View, agentId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const agentStatusColor = useMemo(() => {
    if (workingAgents > 0) return '#f59e0b';
    if (activeAgents > 0) return '#22c55e';
    return '#6b7280';
  }, [activeAgents, workingAgents]);

  const handleAppClick = useCallback((view: View) => {
    playNavSwish('forward');
    onNavigate(view);
    setMenuOpen(false);
  }, [onNavigate]);

  const isChatOpen = currentView === 'chat';

  // Build a view→badge lookup for quick access
  const viewBadgeMap = useMemo(() => {
    const map: Record<View, BadgeInfo | null> = {} as Record<View, BadgeInfo | null>;
    for (const view of INTELLIGENCE_VIEWS) {
      const agentId = Object.entries(AGENT_TO_VIEW).find(([, v]) => v === view)?.[0] ?? null;
      if (agentId && statusBadges[agentId]) {
        map[view] = {
          agentId,
          badgeText: statusBadges[agentId].badgeText,
          badgeType: statusBadges[agentId].badgeType,
          statusText: statusDetails[agentId]?.statusText ?? '',
          details: statusDetails[agentId]?.details,
        };
      }
    }
    return map;
  }, [statusBadges, statusDetails]);

  const totalBadges = Object.values(statusBadges).filter(b => b.badgeText).length;

  const handleHeroClick = useCallback(() => {
    playClick();
    if (isChatOpen) {
      onNavigate('dashboard');
    } else {
      onNavigate('chat');
    }
  }, [isChatOpen, onNavigate]);

  const handleBadgeClick = useCallback((view: View, agentId: string) => {
    playClick();
    if (onBadgeClick) {
      onBadgeClick(view, agentId);
    } else if (onStatusClick) {
      onStatusClick();
    }
  }, [onBadgeClick, onStatusClick]);

  return (
    <div className="conflux-bar-v2-wrapper" data-tour-id="dock">
      {/* ── Intelligence Badges Bar (above the 3-point spine) ── */}
      {totalBadges > 0 && (
        <div className="intelligence-bar">
          {INTELLIGENCE_VIEWS.map((view) => {
            const badge = viewBadgeMap[view];
            if (!badge) return null;
            const appInfo = APP_ICONS[view];
            return (
              <button
                key={view}
                className={`intelligence-badge ${badge.badgeType === 'attention' ? 'attention' : ''}`}
                onClick={() => handleBadgeClick(view, badge.agentId)}
                onMouseEnter={() => setHoveredBadge(view)}
                onMouseLeave={() => setHoveredBadge(null)}
              >
                <span className="intelligence-badge-emoji">{VIEW_BADGE_EMOJI[view]}</span>
                <span className="intelligence-badge-label">{appInfo?.label ?? view}</span>
                <span className={`intelligence-badge-value ${badge.badgeType === 'attention' ? 'attention' : ''}`}>
                  {badge.badgeText}
                </span>
                {/* Hover tooltip */}
                {hoveredBadge === view && badge.statusText && (
                  <div className="intelligence-badge-tooltip">
                    <div className="tooltip-title">{VIEW_BADGE_EMOJI[view]} {appInfo?.label}</div>
                    <div className="tooltip-text">{badge.statusText}</div>
                    {badge.details && badge.details !== badge.statusText && (
                      <div className="tooltip-detail">{badge.details}</div>
                    )}
                    <div className="tooltip-hint">Click for full status →</div>
                  </div>
                )}
              </button>
            );
          })}
          <button
            className="intelligence-bar-summary"
            onClick={() => onStatusClick?.()}
          >
            ◈ Team Status
          </button>
        </div>
      )}

      {/* ── Menu panel (start menu) ── */}
      {menuOpen && (
        <div className="conflux-menu" ref={menuRef}>
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

          {/* App grid with inline badges */}
          <div className="conflux-menu-grid">
            {filtered.map(app => {
              const badge = viewBadgeMap[app.id];
              return (
                <button
                  key={app.id}
                  className={`conflux-menu-app ${currentView === app.id ? 'active' : ''}`}
                  onClick={() => handleAppClick(app.id)}
                >
                  <span className="conflux-menu-app-icon">{app.icon}</span>
                  <div className="conflux-menu-app-info">
                    <span className="conflux-menu-app-name">{app.label}</span>
                    <span className="conflux-menu-app-desc">{app.description}</span>
                    {badge && badge.statusText && (
                      <span className="conflux-menu-app-badge">
                        {badge.statusText}
                      </span>
                    )}
                  </div>
                  {badge?.badgeText && (
                    <span className={`menu-app-count-badge ${badge.badgeType === 'attention' ? 'attention' : ''}`}>
                      {badge.badgeText}
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="conflux-menu-empty">No apps found</div>
            )}
          </div>
        </div>
      )}

      {/* ── Three-Point Navigation Spine ── */}
      <div className="conflux-bar-v2">
        {/* Left: Conflux Logo */}
        <div style={{ position: 'relative' }}>
          <button
            className={`conflux-logo-btn ${menuOpen ? 'active' : ''}`}
            onClick={() => { playClick(); setMenuOpen(!menuOpen); }}
            title="Start Menu"
          >
            ◈
          </button>
          {totalBadges > 0 && (
            <span
              className="bar-status-dot"
              onClick={(e) => {
                e.stopPropagation();
                onStatusClick?.();
              }}
              style={{ cursor: 'pointer' }}
            />
          )}
        </div>

        {/* Center: Hero Button */}
        <button
          className={`hero-btn${isChatOpen ? ' chat-active' : ''}`}
          onClick={handleHeroClick}
          title="Talk to Conflux"
          aria-label="Talk to Conflux"
          data-tour-id="chat"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white" fillOpacity="0.9"/>
          </svg>
          <span className="hero-btn-status" style={{ background: agentStatusColor }} />
        </button>

        {/* Right: Home Button */}
        <button
          className={`conflux-home-btn ${currentView === 'dashboard' && !menuOpen ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
          title="Home"
          data-tour-id="home-btn"
        >
          🏠
        </button>
      </div>
    </div>
  );
}
