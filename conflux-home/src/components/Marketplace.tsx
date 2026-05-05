import { useState, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { MARKETPLACE_ITEMS, MarketplaceItem, MarketplaceItemType } from '../data/marketplace-items';
import '../styles-marketplace.css';

type TypeTab = 'all' | MarketplaceItemType;

const TYPE_TABS: { id: TypeTab; label: string; emoji: string }[] = [
  { id: 'all', label: 'All', emoji: '🌟' },
  { id: 'app', label: 'Apps', emoji: '📱' },
  { id: 'game', label: 'Games', emoji: '🎮' },
  { id: 'agent', label: 'Agents', emoji: '🤖' },
];

const TYPE_LABELS: Record<MarketplaceItemType, string> = {
  app: 'App',
  game: 'Game',
  agent: 'Agent',
};

export default function Marketplace() {
  const [typeTab, setTypeTab] = useState<TypeTab>('all');
  const [categoryTab, setCategoryTab] = useState('all');
  const [search, setSearch] = useState('');
  const [localStatus, setLocalStatus] = useState<Record<string, MarketplaceItem['status']>>({});

  // Compute categories for current type
  const categories = useMemo(() => {
    const source = typeTab === 'all' ? MARKETPLACE_ITEMS : MARKETPLACE_ITEMS.filter((i) => i.type === typeTab);
    const cats = [...new Set(source.map((i) => i.category))];
    return ['all', ...cats.sort()];
  }, [typeTab]);

  // Reset category when type changes
  const handleTypeTab = (id: TypeTab) => {
    setTypeTab(id);
    setCategoryTab('all');
  };

  // Filtered items
  const filtered = useMemo(() => {
    let items = MARKETPLACE_ITEMS;
    if (typeTab !== 'all') items = items.filter((i) => i.type === typeTab);
    if (categoryTab !== 'all') items = items.filter((i) => i.category === categoryTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.tagline.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.skills.some((s) => s.toLowerCase().includes(q))
      );
    }
    return items.map((i) => ({ ...i, status: localStatus[i.id] ?? i.status }));
  }, [typeTab, categoryTab, search, localStatus]);

  // Featured items
  const featured = useMemo(() => {
    if (typeTab !== 'all' || search.trim()) {
      return filtered.filter((i) => i.featured);
    }
    return MARKETPLACE_ITEMS.filter((i) => i.featured).map((i) => ({
      ...i,
      status: localStatus[i.id] ?? i.status,
    }));
  }, [typeTab, search, filtered, localStatus]);

  // Handlers
  const handleOpen = useCallback((item: MarketplaceItem) => {
    if (item.status === 'coming-soon') return;
    window.dispatchEvent(
      new CustomEvent('conflux:navigate', {
        detail: { viewId: item.viewId, gameId: item.gameId },
      })
    );
  }, []);

  const handleInstall = useCallback(async (item: MarketplaceItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.status === 'coming-soon' || item.status === 'installed') return;
    try {
      await invoke('agent_template_install', { template_id: item.agentId, member_id: null });
      setLocalStatus((prev) => ({ ...prev, [item.id]: 'installed' }));
    } catch {
      // install failed — leave as available
    }
  }, []);

  const getButtonText = (status: MarketplaceItem['status']) => {
    switch (status) {
      case 'installed': return '✓ Open';
      case 'available': return '+ Install';
      case 'coming-soon': return '🔒 Coming Soon';
    }
  };

  const showCategories = categories.length > 2;

  return (
    <div className="marketplace-hub">
      {/* Hero */}
      <div className="marketplace-hero">
        <div className="marketplace-hero-glow" />
        <div className="marketplace-hero-content">
          <div className="marketplace-hero-icon">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <rect x="4" y="20" width="48" height="32" rx="4" fill="rgba(245,200,66,0.12)" stroke="rgba(245,200,66,0.4)" strokeWidth="1.5"/>
              <rect x="10" y="26" width="12" height="10" rx="2" fill="rgba(245,200,66,0.2)" stroke="rgba(245,200,66,0.3)" strokeWidth="1"/>
              <rect x="26" y="26" width="12" height="10" rx="2" fill="rgba(245,200,66,0.2)" stroke="rgba(245,200,66,0.3)" strokeWidth="1"/>
              <rect x="10" y="40" width="12" height="8" rx="2" fill="rgba(245,200,66,0.2)" stroke="rgba(245,200,66,0.3)" strokeWidth="1"/>
              <rect x="26" y="40" width="12" height="8" rx="2" fill="rgba(245,200,66,0.2)" stroke="rgba(245,200,66,0.3)" strokeWidth="1"/>
              <path d="M28 4 L32 16 L50 16 L36 24 L40 36 L28 28 L16 36 L20 24 L6 16 L24 16 Z" fill="rgba(245,200,66,0.9)" stroke="rgba(245,200,66,0.6)" strokeWidth="1"/>
            </svg>
          </div>
          <h1 className="marketplace-hero-title">Marketplace</h1>
          <p className="marketplace-hero-sub">Apps, games, and agents for your AI home</p>
        </div>
      </div>

      <div className="marketplace-content">
        {/* Search */}
        <div className="marketplace-search">
          <div className="marketplace-search-inner">
            <span className="marketplace-search-icon">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search apps, games, agents..."
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="marketplace-tabs-row">
          <div className="marketplace-tabs">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.id}
                className={`type-tab ${typeTab === tab.id ? 'active' : ''}`}
                data-type={tab.id}
                onClick={() => handleTypeTab(tab.id)}
              >
                {tab.emoji} {tab.label}
              </button>
            ))}
          </div>

          {/* Category Tabs */}
          {showCategories && (
            <div className="marketplace-tabs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`category-tab ${categoryTab === cat ? 'active' : ''}`}
                  onClick={() => setCategoryTab(cat)}
                >
                  {cat === 'all' ? 'All' : cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Featured Section */}
        {featured.length > 0 && typeTab === 'all' && !search.trim() && (
          <div className="marketplace-featured">
            <div className="marketplace-section-label">⭐ Featured</div>
            <div className="featured-grid">
              {featured.map((item) => (
                <MarketplaceFeaturedCard
                  key={item.id}
                  item={item}
                  onOpen={() => handleOpen(item)}
                  onInstall={(e) => handleInstall(item, e)}
                  getButtonText={getButtonText}
                />
              ))}
            </div>
          </div>
        )}

        {/* Main Grid */}
        {filtered.length > 0 ? (
          <div className="marketplace-grid">
            {filtered.map((item) => (
              <MarketplaceCard
                key={item.id}
                item={item}
                onOpen={() => handleOpen(item)}
                onInstall={(e) => handleInstall(item, e)}
                getButtonText={getButtonText}
              />
            ))}
          </div>
        ) : (
          <div className="marketplace-empty">
            <span className="empty-emoji">🔍</span>
            <h3>No results found</h3>
            <p>Try a different search or browse all categories.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Card Components ──────────────────────────────────────────

function MarketplaceCard({
  item,
  onOpen,
  onInstall,
  getButtonText,
}: {
  item: MarketplaceItem;
  onOpen: () => void;
  onInstall: (e: React.MouseEvent) => void;
  getButtonText: (s: MarketplaceItem['status']) => string;
}) {
  return (
    <div
      className={`marketplace-card ${item.status === 'coming-soon' ? 'coming-soon' : ''}`}
      style={{ '--card-color': item.color } as React.CSSProperties}
      onClick={onOpen}
    >
      <span className="card-emoji">{item.emoji}</span>
      <h3 className="card-name">{item.name}</h3>
      <p className="card-tagline">{item.tagline}</p>
      <span className="card-category-badge">{TYPE_LABELS[item.type]}</span>
      <div className="card-skills">
        {item.skills.slice(0, 3).map((skill) => (
          <span key={skill} className="skill-tag">{skill}</span>
        ))}
      </div>
      <button
        className={`card-action ${item.status}`}
        onClick={item.status === 'available' ? onInstall : item.status === 'installed' ? onOpen : undefined}
        disabled={item.status === 'coming-soon'}
      >
        {getButtonText(item.status)}
      </button>
    </div>
  );
}

function MarketplaceFeaturedCard({
  item,
  onOpen,
  onInstall,
  getButtonText,
}: {
  item: MarketplaceItem;
  onOpen: () => void;
  onInstall: (e: React.MouseEvent) => void;
  getButtonText: (s: MarketplaceItem['status']) => string;
}) {
  return (
    <div
      className={`featured-card ${item.status === 'coming-soon' ? 'coming-soon' : ''}`}
      style={{ '--card-color': item.color } as React.CSSProperties}
      onClick={onOpen}
    >
      <span className="featured-badge">Featured</span>
      <span className="card-emoji">{item.emoji}</span>
      <h3 className="card-name">{item.name}</h3>
      <p className="card-tagline">{item.tagline}</p>
      <span className="card-category-badge">{TYPE_LABELS[item.type]}</span>
      <div className="card-skills">
        {item.skills.slice(0, 3).map((skill) => (
          <span key={skill} className="skill-tag">{skill}</span>
        ))}
      </div>
      <button
        className={`card-action ${item.status}`}
        onClick={item.status === 'available' ? onInstall : item.status === 'installed' ? onOpen : undefined}
        disabled={item.status === 'coming-soon'}
      >
        {getButtonText(item.status)}
      </button>
    </div>
  );
}
