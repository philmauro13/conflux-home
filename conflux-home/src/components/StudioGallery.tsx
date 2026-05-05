import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useStudio } from '../hooks/useStudio';
import { STUDIO_MODULES, StudioModule } from '../types';
import '../styles-studio.css';

type FilterModule = StudioModule | 'all';
type FilterVault = 'all' | 'vaulted' | 'unvaulted';

export default function StudioGallery() {
  const {
    generations,
    selectedGeneration,
    selectGeneration,
    setEnterGallery,
    bulkDelete,
    bulkSaveToVault,
    exportGenerationsZip,
  } = useStudio();

  // Filters
  const [moduleFilter, setModuleFilter] = useState<FilterModule>('all');
  const [vaultFilter, setVaultFilter] = useState<FilterVault>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return generations.filter((gen) => {
      // Module filter
      if (moduleFilter !== 'all' && gen.module !== moduleFilter) return false;
      // Vault filter
      if (vaultFilter === 'vaulted' && !gen.vault_file_id) return false;
      if (vaultFilter === 'unvaulted' && gen.vault_file_id) return false;
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!gen.prompt.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [generations, moduleFilter, vaultFilter, searchQuery]);

  const handleGenerationClick = (gen: typeof generations[0]) => {
    selectGeneration(gen);
    setEnterGallery(false);
  };

  // Selection handlers
  const isSelected = (id: string) => selectedIds.includes(id);

  const handleToggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setLastSelectedId(id);
  };

  const handleRangeSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!lastSelectedId) {
      handleToggleSelect(id);
      return;
    }
    const filteredIds = filtered.map((g) => g.id);
    const curIdx = filteredIds.indexOf(id);
    const lastIdx = filteredIds.indexOf(lastSelectedId);
    if (curIdx === -1 || lastIdx === -1) return;

    const start = Math.min(curIdx, lastIdx);
    const end = Math.max(curIdx, lastIdx);
    const range = filteredIds.slice(start, end + 1);
    const allSelected = range.every((x) => selectedIds.includes(x));
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (allSelected) {
        range.forEach((x) => newSet.delete(x));
      } else {
        range.forEach((x) => newSet.add(x));
      }
      return Array.from(newSet);
    });
    setLastSelectedId(id);
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
    setLastSelectedId(null);
  };

  const handleSelectAll = () => {
    const allIds = filtered.map(g => g.id);
    setSelectedIds(allIds);
    if (allIds.length > 0) {
      setLastSelectedId(allIds[allIds.length - 1]);
    }
  };

  // Bulk actions
  const handleBulkSave = async () => {
    if (selectedIds.length === 0) return;
    await bulkSaveToVault(selectedIds);
    handleClearSelection();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} generation(s)?`)) return;
    await bulkDelete(selectedIds);
    handleClearSelection();
  };

  const handleBulkExport = async () => {
    if (selectedIds.length === 0) return;
    try {
      const path = await exportGenerationsZip(selectedIds);
      console.log('Exported zip to:', path);
      handleClearSelection();
    } catch (err) {
      console.error('Export failed:', err);
      if (typeof err === 'string' && err !== 'Export cancelled') {
        alert(`Export failed: ${err}`);
      }
    }
  };

  return (
    <div className="studio-gallery-container">
      {/* Header with filters */}
      <div className="gallery-header">
        <div className="gallery-title-row">
          <button className="gallery-back-btn" onClick={() => setEnterGallery(false)}>
            ← Back
          </button>
          <h2 className="gallery-title">📂 Gallery</h2>
          <span className="gallery-count">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="gallery-filters">
          {/* Module quick filters */}
          <div className="filter-group">
            <button
              className={`filter-chip ${moduleFilter === 'all' ? 'active' : ''}`}
              onClick={() => setModuleFilter('all')}
            >
              All
            </button>
            {(Object.keys(STUDIO_MODULES) as StudioModule[]).map((mod) => (
              <button
                key={mod}
                className={`filter-chip ${moduleFilter === mod ? 'active' : ''}`}
                onClick={() => setModuleFilter(mod)}
                title={STUDIO_MODULES[mod].description}
              >
                {STUDIO_MODULES[mod].icon}
              </button>
            ))}
          </div>

          {/* Vault filter */}
          <div className="filter-group">
            <button
              className={`filter-chip ${vaultFilter === 'all' ? 'active' : ''}`}
              onClick={() => setVaultFilter('all')}
            >
              All Status
            </button>
            <button
              className={`filter-chip ${vaultFilter === 'vaulted' ? 'active' : ''}`}
              onClick={() => setVaultFilter('vaulted')}
            >
              ✅ Vaulted
            </button>
            <button
              className={`filter-chip ${vaultFilter === 'unvaulted' ? 'active' : ''}`}
              onClick={() => setVaultFilter('unvaulted')}
            >
              📁 Unvaulted
            </button>
          </div>

          {/* Search */}
          <div className="filter-search">
            <input
              type="text"
              placeholder="Search prompt…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>


      </div>

      {/* Grid */}
      <div className="gallery-grid">
        {selectedIds.length > 0 && (
          <div className="bulk-action-bar">
            <span className="bulk-action-count">
              {selectedIds.length} selected
            </span>
            <button className="bulk-action-btn select-all" onClick={handleSelectAll}>✅ Select All</button>
            <button className="bulk-action-btn save" onClick={handleBulkSave}>💾 Save to Vault</button>
            <button className="bulk-action-btn delete" onClick={handleBulkDelete}>🗑️ Delete</button>
            <button className="bulk-action-btn export" onClick={handleBulkExport}>📤 Export ZIP</button>
            <button className="bulk-action-btn cancel" onClick={handleClearSelection}>✕ Cancel</button>
          </div>
        )}
        <AnimatePresence>
          {filtered.map((gen, idx) => {
            const displayUrl = gen.output_url?.startsWith('http')
              ? gen.output_url
              : gen.output_path
              ? convertFileSrc(gen.output_path)
              : null;
            return (
              <motion.div
                key={gen.id}
                className={`gallery-item ${isSelected(gen.id) ? 'selected' : ''}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, delay: (idx % 12) * 0.03 }}
                onClick={() => handleGenerationClick(gen)}
                layout
              >
                <div className="gallery-item-thumb">
                  {displayUrl ? (
                    gen.module === 'image' ? (
                      <img src={displayUrl} alt="" className="gallery-thumb-img" loading="lazy" />
                    ) : gen.module === 'voice' ? (
                      <div className="gallery-thumb-voice">🗣️</div>
                    ) : (
                      <div className="gallery-thumb-mock">
                        {STUDIO_MODULES[gen.module]?.icon}
                      </div>
                    )
                  ) : (
                    <div className="gallery-thumb-placeholder">
                      {STUDIO_MODULES[gen.module]?.icon}
                    </div>
                  )}
                  {gen.vault_file_id && (
                    <div className="gallery-vault-badge">🔒</div>
                  )}
                  {gen.status === 'generating' && (
                    <div className="gallery-generating-overlay">Generating…</div>
                  )}

                  {/* Selection checkbox overlay */}
                  <div
                    className={`selection-checkbox ${isSelected(gen.id) ? 'checked' : ''}`}
                    onClick={(e) => {
                      if (e.shiftKey && lastSelectedId) {
                        handleRangeSelect(gen.id, e);
                      } else {
                        handleToggleSelect(gen.id, e);
                      }
                    }}
                    title={isSelected(gen.id) ? 'Deselect' : 'Select'}
                  >
                    {isSelected(gen.id) && '✓'}
                  </div>
                </div>
                <div className="gallery-item-info">
                  <div className="gallery-item-module">{STUDIO_MODULES[gen.module]?.icon}</div>
                  <div className="gallery-item-prompt" title={gen.prompt}>
                    {gen.prompt.length > 60 ? gen.prompt.slice(0, 60) + '…' : gen.prompt}
                  </div>
                  <div className="gallery-item-date">
                    {new Date(gen.created_at).toLocaleDateString()}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="gallery-empty">
            <div className="empty-icon">🎨</div>
            <div className="empty-text">No generations match your filters</div>
            <button className="empty-cta" onClick={() => setEnterGallery(false)}>
              Go create something
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
