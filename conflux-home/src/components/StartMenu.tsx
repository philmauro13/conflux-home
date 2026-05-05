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
  page: 1 | 2;
}

const ALL_APPS: AppItem[] = [
  // Page 1 — Primary apps
  { id: 'chat', icon: '💬', label: 'Chat', category: 'work', description: 'Talk with your AI agents', page: 1 },
  { id: 'agents', icon: '🧩', label: 'Agent Library', category: 'work', description: 'Browse and install agents', page: 1 },
  { id: 'life', icon: '🧠', label: 'Life Autopilot', category: 'life', description: 'Document AI & smart reminders', page: 1 },
  { id: 'dreams', icon: '🎯', label: 'Dream Builder', category: 'life', description: 'Goals into daily actions', page: 1 },
  { id: 'kitchen', icon: '🍳', label: 'Kitchen', category: 'life', description: 'Smart meal planning & fridge', page: 1 },
  { id: 'budget', icon: '💰', label: 'Budget', category: 'work', description: 'Expense tracking', page: 1 },
  { id: 'marketplace', icon: '🛒', label: 'Discover', category: 'system', description: 'Apps, games, and agents', page: 1 },
  { id: 'security-hub', icon: '🛡️', label: 'Security', category: 'system', description: 'AI agent security suite — audit, scan, defend', page: 1 },
  { id: 'settings', icon: '⚙️', label: 'Settings', category: 'system', description: 'Configure your experience', page: 1 },

  // Page 2 — More apps
  { id: 'games', icon: '🎮', label: 'Games', category: 'fun', description: 'Minesweeper, Snake, Pac-Man & more', page: 2 },
{ id: 'echo', icon: '🪞', label: 'Echo', category: 'life', description: 'The notebook that listens', page: 2 },
  { id: 'vault', icon: '🔐', label: 'Vault', category: 'system', description: 'Encrypted password & credential manager', page: 2 },
  { id: 'studio', icon: '✨', label: 'Studio', category: 'work', description: 'AI creator — images, video, music, voice', page: 2 },
  { id: 'api-dashboard', icon: '📊', label: 'API Dashboard', category: 'work', description: 'Manage your API usage and credits', page: 2 },
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
  const [page, setPage] = useState<1 | 2>(1);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
    if (!isOpen) {
      setSearch('');
      setCategory('all');
      setPage(1);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    let apps = ALL_APPS.filter(a => a.page === page);
    if (category !== 'all') {
      apps = apps.filter(a => a.category === category);
    }
    if (search) {
      // Search shows all pages
      const q = search.toLowerCase();
      apps = ALL_APPS.filter(a =>
        a.label.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      );
    }
    return apps;
  }, [search, category, page]);

  const page1Count = ALL_APPS.filter(a => a.page === 1).length;
  const page2Count = ALL_APPS.filter(a => a.page === 2).length;

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

        {/* Page indicator + back button */}
        <div style={styles.pageNav}>
          {page === 2 && (
            <button style={styles.pageBtn} onClick={() => setPage(1)}>
              ← Back
            </button>
          )}
          <div style={styles.pageDots}>
            <span style={{...styles.dot, ...(page === 1 ? styles.dotActive : {})}} />
            <span style={{...styles.dot, ...(page === 2 ? styles.dotActive : {})}} />
          </div>
          {page === 1 && (
            <button style={styles.pageBtn} onClick={() => setPage(2)}>
              My Apps →
            </button>
          )}
          {page === 2 && <div style={{width: '80px'}} />}
        </div>

        {!search && (
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
        )}

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

        {/* Footer with page info */}
        {!search && (
          <div style={styles.footer}>
            Page {page} of 2 • {page === 1 ? page1Count : page2Count} apps
          </div>
        )}
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 12px 8px',
  },
  pageBtn: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    color: '#94a3b8',
    fontSize: '13px',
    padding: '4px 12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  pageDots: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    transition: 'all 0.2s',
  },
  dotActive: {
    background: '#3b82f6',
    width: '20px',
    borderRadius: '4px',
  },
  footer: {
    textAlign: 'center' as const,
    padding: '8px',
    fontSize: '11px',
    color: '#475569',
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
};
