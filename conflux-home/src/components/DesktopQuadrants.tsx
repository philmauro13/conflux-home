import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCredits, useUsageStats, useUsageHistory } from '../hooks/useCredits';
import { useAuth } from '../hooks/useAuth';
import PulseKnob from './PulseKnob';
import IntelView from './IntelView';

import { View, Agent } from '../types';

// ── App definitions ──

interface AppDef {
  id: string;
  icon: string;
  label: string;
  preview: string;
}

interface CategoryDef {
  id: string;
  icon: string;
  label: string;
  color: string;
  desc: string;
  apps: AppDef[];
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'my-apps',
    icon: '📱',
    label: 'My Apps',
    color: '#10b981',
    desc: '6 daily apps',
    apps: [
      { id: 'kitchen', icon: '🍳', label: 'Kitchen', preview: 'Meal planning & recipes' },
      { id: 'budget', icon: '💰', label: 'Budget', preview: 'Track spending & goals' },
      { id: 'life', icon: '🧠', label: 'Life Autopilot', preview: 'Tasks, habits & reminders' },
      { id: 'dreams', icon: '🎯', label: 'Dreams', preview: 'Goal tracking & milestones' },
      { id: 'echo', icon: '📝', label: 'Echo', preview: 'Journal & reflection' },
      { id: 'security-hub', icon: '🛡️', label: 'Security', preview: 'Shield & monitor your home' },
    ],
  },
  {
    id: 'discover',
    icon: '🔭',
    label: 'Discover',
    color: '#f59e0b',
    desc: 'Browse & install',
    apps: [
      { id: 'marketplace', icon: '🛒', label: 'Marketplace', preview: 'Browse & install agents' },
      { id: 'agents', icon: '🧩', label: 'Agents', preview: 'Manage your AI team' },
      { id: 'games', icon: '🎮', label: 'Games', preview: 'Play & learn' },
      { id: 'news-intelligence', icon: '📡', label: 'News & Intelligence', preview: 'Daily briefing & signals' },
    ],
  },
  {
    id: 'creator',
    icon: '🏗️',
    label: 'Creator',
    color: '#8b5cf6',
    desc: 'Build & create',
    apps: [
      { id: 'studio', icon: '🎨', label: 'Studio', preview: 'AI creative generation' },
      { id: 'vault', icon: '📦', label: 'Vault', preview: 'Files & projects' },
    ],
  },
];


function timeAgo(dateString: string): string {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) {
        return Math.floor(interval) + "y ago";
    }
    interval = seconds / 2592000;
    if (interval > 1) {
        return Math.floor(interval) + "mo ago";
    }
    interval = seconds / 86400;
    if (interval > 1) {
        return Math.floor(interval) + "d ago";
    }
    interval = seconds / 3600;
    if (interval > 1) {
        return Math.floor(interval) + "h ago";
    }
    interval = seconds / 60;
    if (interval > 1) {
        return Math.floor(interval) + "m ago";
    }
    return Math.floor(seconds) + "s ago";
}

// ── Status helpers ──

const STATUS_COLORS: Record<string, string> = {
  working: '#22c55e',
  thinking: '#f59e0b',
  idle: '#6366f1',
  error: '#ef4444',
  offline: '#4b5563',
};

function getAgentProgress(agent: Agent): number {
  switch (agent.status) {
    case 'working': return 80;
    case 'thinking': return 50;
    case 'idle': return 20;
    case 'error': return 10;
    default: return 0;
  }
}

// ── Intel Dashboard ──

interface IntelDashboardProps {
  agents: Agent[];
}

// Ring gauge SVG component — neumorphic 3D style
function RingGauge({ value, max, color, label, sublabel }: { value: number; max: number; color: string; label: string; sublabel: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct);
  const cx = 40;
  const cy = 40;

  return (
    <div className="intel-ring">
      <svg viewBox="0 0 80 80" className="intel-ring-svg">
        <defs>
          {/* Neumorphic outer glow for the whole gauge */}
          <filter id={`gauge-glow-${sublabel}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
            <feFlood floodColor={color} floodOpacity="0.3" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Gradient for the filled arc */}
          <linearGradient id={`gauge-grad-${sublabel}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* Neumorphic outer shadow — dark ring behind */}
        <circle cx={cx} cy={cy} r={radius + 5}
          fill="rgba(0,0,0,0.35)"
          style={{ filter: 'blur(3px)' }}
        />
        {/* Neumorphic top-left highlight bezel */}
        <circle cx={cx} cy={cy} r={radius + 4}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="1"
        />
        {/* Track ring — neumorphic groove */}
        <circle className="intel-ring-bg" cx={cx} cy={cy} r={radius} />
        {/* Filled arc — gradient + glow */}
        <circle
          className="intel-ring-fill"
          cx={cx} cy={cy} r={radius}
          stroke={`url(#gauge-grad-${sublabel})`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          filter={`url(#gauge-glow-${sublabel})`}
        />
        {/* Specular highlight dot at top */}
        <circle cx={cx} cy={cy - radius + 3} r="3"
          fill="rgba(255,255,255,0.18)"
        />
      </svg>
      <div className="intel-ring-label">
        <span className="intel-ring-value">{label}</span>
        <span className="intel-ring-sublabel">{sublabel}</span>
      </div>
    </div>
  );
}

function IntelDashboard({ agents }: IntelDashboardProps) {
  const { balance, loading: creditsLoading } = useCredits();
  const { stats, loading: statsLoading } = useUsageStats(7);
  const { entries, loading: historyLoading } = useUsageHistory(10);

  // Heartbeat interval — default 1hr (3_600_000 ms)
  const [heartbeatInterval, setHeartbeatInterval] = useState(3_600_000);
  const [lastBeat, setLastBeat] = useState(() => {
    const cached = localStorage.getItem('conflux-last-beat');
    return cached ? parseInt(cached, 10) : Date.now();
  });

  const allLoading = creditsLoading || statsLoading || historyLoading;
  const activeAgents = agents.filter(a => a.status !== 'offline');
  const workingCount = agents.filter(a => a.status === 'working' || a.status === 'thinking').length;
  const onlinePct = agents.length > 0 ? Math.round((activeAgents.length / agents.length) * 100) : 0;

  // Load persisted interval from Rust backend
  useEffect(() => {
    invoke<number>('engine_get_heartbeat_interval')
      .then(ms => { if (ms > 0) setHeartbeatInterval(ms); })
      .catch(() => {});
  }, []);

  // Listen for real beat events from Rust scheduler
  useEffect(() => {
    let ignore = false;

    const unlistenPromise = listen<null>('conflux:heartbeat-beat', () => {
      if (ignore) return;
      const now = Date.now();
      setLastBeat(now);
      localStorage.setItem('conflux-last-beat', String(now));
    });

    // Also listen for interval-change events so scheduler restart is instant
    const unlistenIntervalPromise = listen<number>('conflux:heartbeat-interval-changed', (event) => {
      if (ignore) return;
      const newMs = event.payload;
      setHeartbeatInterval(newMs);
      const now = Date.now();
      setLastBeat(now);
      localStorage.setItem('conflux-last-beat', String(now));
    });

    // Cleanup: unsubscribe both listeners when effect tears down
    return () => {
      ignore = true;
      unlistenPromise.then(fn => fn());
      unlistenIntervalPromise.then(fn => fn());
    };
  }, []);

  const handleHeartbeatChange = useCallback(async (ms: number) => {
    setHeartbeatInterval(ms);
    setLastBeat(Date.now());
    try {
      await invoke('engine_set_heartbeat_interval', { ms });
    } catch (err) {
      console.error('[IntelDashboard] Failed to save heartbeat interval:', err);
    }
  }, []);

  return (
    <div className="intel-dashboard" data-tour-id="intel">
      <div className="intel-header">
        <span className="intel-title">🧠 INTEL</span>
        <span className="intel-live-indicator">
          <span className="intel-live-dot" />
          LIVE
        </span>
      </div>

      <div className="intel-body">
        {/* System Overview — PulseKnob hero + flanking ring gauges */}
        <div className="intel-section">
          <div className="intel-section-title">SYSTEM OVERVIEW</div>
          <div className="intel-overview-row">
            <div className="intel-overview-gauge">
              <RingGauge value={activeAgents.length} max={Math.max(agents.length, 1)} color="#6366f1" label={`${activeAgents.length}`} sublabel="online" />
            </div>
            <div className="intel-overview-knob">
              <PulseKnob
                value={heartbeatInterval}
                onChange={handleHeartbeatChange}
                lastBeat={lastBeat}
              />
            </div>
            <div className="intel-overview-gauge">
              <RingGauge value={onlinePct} max={100} color="#22c55e" label={`${onlinePct}%`} sublabel="health" />
            </div>
          </div>
        </div>

        {/* Agents Section — cockpit bars */}
        <div className="intel-section">
          <div className="intel-section-title">AGENT STATUS</div>
          <div className="intel-section-content">
            {agents.map((agent) => {
              const color = STATUS_COLORS[agent.status] || '#4b5563';
              const progress = getAgentProgress(agent);
              const isOffline = agent.status === 'offline';
              return (
                <div
                  key={agent.id}
                  className="intel-agent-row"
                  style={isOffline ? { opacity: 0.3 } : undefined}
                >
                  <span className="intel-agent-dot" style={{ background: color }} />
                  <span className="intel-agent-name">{agent.emoji} {agent.name}</span>
                  <span className="intel-agent-status-text">{agent.status}</span>
                  <div className="intel-agent-bar">
                    <div
                      className="intel-agent-bar-fill"
                      style={{
                        width: `${progress}%`,
                        ['--bar-color' as string]: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {agents.length === 0 && (
              <div className="intel-activity-item">No agents connected</div>
            )}
          </div>
        </div>

        {/* CREDITS Section */}
        <div className="intel-section">
          <div className="intel-section-title">CREDITS</div>
          <div className="intel-metrics-grid">
            <div className="intel-metric-card">
              <span className="intel-metric-icon">⚡</span>
              <span className="intel-metric-value">{allLoading ? '---' : balance?.total_available.toLocaleString() || '0.00'}</span>
              <span className="intel-metric-label">Available</span>
            </div>
            <div className="intel-metric-card">
              <span className="intel-metric-icon">🔄</span>
              <span className="intel-metric-value">{allLoading ? '---' : (balance?.subscription_plan === 'free' ? 'Free' : balance?.subscription_plan || 'N/A')}</span>
              <span className="intel-metric-label">Plan</span>
            </div>
            <div className="intel-metric-card">
              <span className="intel-metric-icon">📊</span>
              <span className="intel-metric-value">{allLoading ? '---' : `${balance?.monthly_used?.toFixed(0) || '0'}/${balance?.monthly_credits?.toFixed(0) || '0'}`}</span>
              <span className="intel-metric-label">Monthly</span>
            </div>
            {balance?.source === 'free' && (
            <div className="intel-metric-card">
              <span className="intel-metric-icon">☀️</span>
              <span className="intel-metric-value">{allLoading ? '---' : `${balance.daily_used?.toFixed(0) || '0'}/${balance.daily_limit?.toFixed(0) || '0'}`}</span>
              <span className="intel-metric-label">Daily Left</span>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Folder App Definitions ──

interface FolderItem {
  id: string;
  name: string;
  icon: string;
  subtitle: string;
  status: 'available' | 'coming-soon';
}

const FOLDER_APPS: Record<string, { title: string; icon: string; items: FolderItem[] }> = {
  games: {
    title: 'Games',
    icon: '🎮',
    items: [
      { id: 'minesweeper', name: 'Minesweeper', icon: '💣', subtitle: 'Classic · 9×9', status: 'available' },
      { id: 'solitaire', name: 'Solitaire', icon: '🃏', subtitle: 'Classic Card Game', status: 'available' },
      { id: 'pacman', name: 'Pac-Man', icon: '🟡', subtitle: 'Arcade Classic', status: 'available' },
      { id: 'snake', name: 'Snake', icon: '🐍', subtitle: 'Arcade Classic', status: 'available' },
      { id: 'nani-solitaire', name: "Nani's Solitaire", icon: '🎴', subtitle: 'Family Tradition · 4×4', status: 'available' },
      { id: 'johnny-solitaire', name: "Johnny C's Solitaire", icon: '🀄', subtitle: 'FreeCell · 8 Columns', status: 'available' },
      { id: 'stories', name: 'Conflux Stories', icon: '📖', subtitle: 'Interactive Fiction', status: 'coming-soon' },
    ],
  },
  'news-intelligence': {
    title: 'News & Intelligence',
    icon: '📡',
    items: [
      { id: 'feed', name: 'Feed', icon: '📰', subtitle: 'Daily briefing & signal radar', status: 'coming-soon' },
    ],
  },
};

// ── Expanded Category View ──

interface ExpandedViewProps {
  category: CategoryDef;
  onBack: () => void;
  onNavigate: (view: View) => void;
}

function ExpandedView({ category, onBack, onNavigate }: ExpandedViewProps) {
  const [subFolder, setSubFolder] = useState<string | null>(null);

  // If inside a sub-folder (like Games), show its items as a grid
  if (subFolder) {
    const folder = FOLDER_APPS[subFolder];
    if (!folder) return null;

    return (
      <div className="quadrant-expanded">
        <div className="quadrant-expanded-header">
          <button className="quadrant-back-btn" onClick={() => setSubFolder(null)}>
            ←
          </button>
          <span className="quadrant-expanded-title">
            {folder.icon} {folder.title}
          </span>
        </div>
        <div className="quadrant-expanded-grid">
          {/* Back button tile */}
          <div
            className="desktop-widget folder-back-tile"
            onClick={() => setSubFolder(null)}
            style={{ '--widget-color': category.color } as React.CSSProperties}
          >
            <div className="widget-accent widget-accent-themed" />
            <div className="widget-body">
              <span className="widget-icon">↩️</span>
              <span className="widget-label">Back</span>
              <span className="widget-preview">Back to {category.label}</span>
            </div>
          </div>

          {/* Game tiles */}
          {folder.items.map((item) => (
            <div
              key={item.id}
              className={`desktop-widget ${item.status === 'coming-soon' ? 'folder-item-locked' : ''}`}
              onClick={() => {
                if (item.status === 'available') {
                  onNavigate('games');
                  // Small delay to ensure immersiveView is set before game dispatch
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('conflux:navigate', {
                      detail: { viewId: 'games', gameId: item.id },
                    }));
                  }, 0);
                }
              }}
              style={{ '--widget-color': category.color } as React.CSSProperties}
            >
              <div className="widget-accent widget-accent-themed" />
              {item.status === 'coming-soon' && (
                <div className="folder-item-badge">Coming Soon</div>
              )}
              <div className="widget-body">
                <span className="widget-icon">{item.icon}</span>
                <span className="widget-label">{item.name}</span>
                <span className="widget-preview">{item.subtitle}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Normal category expanded view
  return (
    <div className="quadrant-expanded">
      <div className="quadrant-expanded-header">
        <button className="quadrant-back-btn" onClick={onBack}>
          ←
        </button>
        <span className="quadrant-expanded-title">
          {category.icon} {category.label}
        </span>
      </div>
      <div className="quadrant-expanded-grid">
        {/* Back to Desktop tile */}
        <div
          className="desktop-widget folder-back-tile"
          onClick={onBack}
          style={{ '--widget-color': category.color } as React.CSSProperties}
        >
          <div className="widget-accent widget-accent-themed" />
          <div className="widget-body">
            <span className="widget-icon">↩️</span>
            <span className="widget-label">Back</span>
            <span className="widget-preview">Back to Desktop</span>
          </div>
        </div>

        {category.apps.map((app) => {
          const isFolder = app.id in FOLDER_APPS;
          return (
            <div
              key={app.id}
              className="desktop-widget"
              onClick={() => {
                if (isFolder) {
                  setSubFolder(app.id);
                } else {
                  onNavigate(app.id as View);
                }
              }}
              style={{ '--widget-color': category.color } as React.CSSProperties}
            >
              <div className="widget-accent widget-accent-themed" />
              <div className="widget-body">
                <span className="widget-icon">{app.icon}</span>
                <span className="widget-label">{app.label}</span>
                <span className="widget-preview">{app.preview}</span>
              </div>
              {isFolder && <span className="folder-indicator">▸</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ──

interface DesktopQuadrantsProps {
  onNavigate: (view: View) => void;
  agents: Agent[];
}

export default function DesktopQuadrants({ onNavigate, agents }: DesktopQuadrantsProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Collapse expanded view on Home navigation
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      // Reset on any non-game navigation (dashboard, chat, settings, etc.)
      if (typeof detail === 'string' || (typeof detail === 'object' && detail?.viewId === 'dashboard')) {
        setExpandedCategory(null);
      }
    };
    window.addEventListener('conflux:navigate', handler as EventListener);
    return () => window.removeEventListener('conflux:navigate', handler as EventListener);
  }, []);

  // Also reset on keyboard shortcut (Escape is handled in ImmersiveView, but for desktop we need this)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedCategory(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Expanded view
  if (expandedCategory) {
    const category = CATEGORIES.find((c) => c.id === expandedCategory);
    if (category) {
      return (
        <ExpandedView
          category={category}
          onBack={() => setExpandedCategory(null)}
          onNavigate={onNavigate}
        />
      );
    }
  }

  // Main view
  return (
    <div className="desktop-quadrants" data-tour-id="apps">
      {/* Left: Intel Dashboard */}
      <IntelDashboard agents={agents} />

      {/* Right: Category Cards */}
      <div className="desktop-quadrants-right">
        {CATEGORIES.map((cat) => (
          <div
            key={cat.id}
            className="category-card"
            onClick={() => setExpandedCategory(cat.id)}
            style={{ '--cat-color': cat.color } as React.CSSProperties}
          >
            <div
              className="category-card-accent category-card-accent-themed"
            />
            <span className="category-card-icon">{cat.icon}</span>
            <div className="category-card-info">
              <div className="category-card-title">{cat.label}</div>
              <div className="category-card-desc">{cat.desc}</div>
              <div className="category-card-preview">
                {cat.apps.slice(0, 4).map((app) => (
                  <span key={app.id} className="category-card-preview-item">{app.icon} {app.label}</span>
                ))}
                {cat.apps.length > 4 && (
                  <span className="category-card-preview-item">+{cat.apps.length - 4} more</span>
                )}
              </div>
            </div>
            <span className="category-card-badge">{cat.apps.length}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
