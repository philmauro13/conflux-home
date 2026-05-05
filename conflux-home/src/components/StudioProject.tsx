import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useStudio } from '../hooks/useStudio';
import { STUDIO_MODULES, StudioModule } from '../types';
import '../styles-studio.css';

export default function StudioProject() {
  const {
    generations,
    selectedGeneration,
    selectGeneration,
    setEnterGallery,
    currentProject,
    saveToVault,
    remix,
    deleteGeneration,
    bulkDelete,
    bulkSaveToVault,
    exportGenerationsZip,
  } = useStudio();

  // Filter generations for this project
  const projectGenerations = useMemo(() => {
    return generations.filter(gen => {
      const genProject = gen.project_id ?? 'default';
      return genProject === currentProject;
    });
  }, [generations, currentProject]);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  const handleBranch = async () => {
    if (!selectedGeneration) return;
    // Branch is remix; does not affect bulk selection
    // We'll not change selection here
  };

  const handleBulkSave = async () => {
    if (selectedIds.length === 0) return;
    await bulkSaveToVault(selectedIds);
    setSelectedIds([]);
    setLastSelectedId(null);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} generation(s)?`)) return;
    await bulkDelete(selectedIds);
    // Clear selection; if deleted generation was previewed, clear preview
    if (selectedGeneration && selectedIds.includes(selectedGeneration.id)) {
      selectGeneration(null);
    }
    setSelectedIds([]);
    setLastSelectedId(null);
  };

  const handleBulkExport = async () => {
    if (selectedIds.length === 0) return;
    try {
      const path = await exportGenerationsZip(selectedIds);
      console.log('Exported zip to:', path);
      setSelectedIds([]);
      setLastSelectedId(null);
    } catch (err) {
      console.error('Export failed:', err);
      if (typeof err === 'string' && err !== 'Export cancelled') {
        alert(`Export failed: ${err}`);
      }
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
    setLastSelectedId(null);
  };

  const handleSelectAll = () => {
    const allIds = projectGenerations.map(g => g.id);
    setSelectedIds(allIds);
    if (allIds.length > 0) {
      setLastSelectedId(allIds[allIds.length - 1]);
    }
  };

  // Single generation export (download as ZIP to user-chosen location)
  const handleExport = async () => {
    if (!selectedGeneration) return;
    try {
      const path = await exportGenerationsZip([selectedGeneration.id]);
      console.log('Exported to:', path);
    } catch (err) {
      console.error('Export failed:', err);
      if (typeof err === 'string' && err !== 'Export cancelled') {
        alert(`Export failed: ${err}`);
      }
    }
  };

  // Selection helpers
  const isBulkSelected = (id: string) => selectedIds.includes(id);

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
    const filteredIds = projectGenerations.map((g) => g.id);
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

  if (!setEnterGallery) {
    return null;
  }

  return (
    <div className="studio-project-container">
      {/* Header */}
      <div className="project-header">
        <button className="project-back-btn" onClick={() => { selectGeneration(null); setEnterGallery(true); }}>
          ← Back to Gallery
        </button>
        <div className="project-title">
          <span className="project-name">
            {currentProject ? 'Default' : 'My Project'}
          </span>
          <span className="project-count">
            {projectGenerations.length} item{projectGenerations.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="project-actions">
          {/* Future: project rename, delete, export all */}
        </div>
      </div>

      {/* Main layout: left list, center preview, right details */}
      <div className="project-main">
        {/* Left: Version list */}
        <div className="project-versions-panel">
          <div className="panel-header">
            <span className="panel-title">Versions</span>
          </div>

          {/* Bulk Action Bar inside versions panel */}
          {selectedIds.length > 0 && (
            <div className="bulk-action-bar versions-bulk-bar">
              <span className="bulk-action-count">
                {selectedIds.length} selected
              </span>
              <button
                className="bulk-action-btn select-all"
                onClick={handleSelectAll}
              >
                ✅ Select All
              </button>
              <button
                className="bulk-action-btn save"
                onClick={handleBulkSave}
              >
                💾 Save to Vault
              </button>
              <button
                className="bulk-action-btn delete"
                onClick={handleBulkDelete}
              >
                🗑️ Delete
              </button>
              <button
                className="bulk-action-btn export"
                onClick={handleBulkExport}
              >
                📤 Export ZIP
              </button>
              <button
                className="bulk-action-btn cancel"
                onClick={handleClearSelection}
              >
                ✕ Cancel
              </button>
            </div>
          )}

          <div className="versions-list">
            <AnimatePresence>
              {projectGenerations.map((gen) => {
                const isSelected = selectedGeneration?.id === gen.id;
                const isBulkSel = isBulkSelected(gen.id);
                const displayUrl = gen.output_url?.startsWith('http')
                  ? gen.output_url
                  : gen.output_path
                  ? convertFileSrc(gen.output_path)
                  : null;
                return (
                  <motion.div
                    key={gen.id}
                    className={`version-item ${isSelected ? 'selected' : ''} ${isBulkSel ? 'bulk-selected' : ''} ${gen.status}`}
                    onClick={() => selectGeneration(gen)}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="version-thumb">
                      {displayUrl ? (
                        gen.module === 'image' ? (
                          <img src={displayUrl} alt="" className="version-thumb-img" />
                        ) : gen.module === 'voice' ? (
                          <div className="version-thumb-voice">🗣️</div>
                        ) : (
                          <div className="version-thumb-mock">
                            {STUDIO_MODULES[gen.module]?.icon}
                          </div>
                        )
                      ) : (
                        <div className="version-thumb-mock">
                          {STUDIO_MODULES[gen.module]?.icon}
                        </div>
                      )}
                      {gen.status === 'pending' && <div className="version-status-pill">Pending</div>}
                      {gen.status === 'generating' && <div className="version-status-pill generating">Generating…</div>}

                      {/* Bulk selection checkbox */}
                      <div
                        className={`selection-checkbox ${isBulkSel ? 'checked' : ''}`}
                        onClick={(e) => {
                          if (e.shiftKey && lastSelectedId) {
                            handleRangeSelect(gen.id, e);
                          } else {
                            handleToggleSelect(gen.id, e);
                          }
                        }}
                        title={isBulkSel ? 'Deselect' : 'Select'}
                      >
                        {isBulkSel && '✓'}
                      </div>
                    </div>
                    <div className="version-meta">
                      <div className="version-module">{STUDIO_MODULES[gen.module]?.icon}</div>
                      <div className="version-prompt" title={gen.prompt}>
                        {gen.prompt.length > 40 ? gen.prompt.slice(0, 40) + '…' : gen.prompt}
                      </div>
                      <div className="version-time">
                        {new Date(gen.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {projectGenerations.length === 0 && (
              <div className="versions-empty">
                <div className="empty-icon">📁</div>
                <div className="empty-text">No generations yet</div>
                <div className="empty-hint">Switch back to the dashboard to create</div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Preview canvas */}
        <div className="project-preview-area">
          {selectedGeneration ? (
            <div className="project-preview-content">
              {selectedGeneration.module === 'image' &&
                selectedGeneration.output_url && (
                  <motion.img
                    src={
                      selectedGeneration.output_url.startsWith('http')
                        ? selectedGeneration.output_url
                        : selectedGeneration.output_path
                        ? convertFileSrc(selectedGeneration.output_path)
                        : ''
                    }
                    alt={selectedGeneration.prompt}
                    className="project-preview-image"
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                )}
              {selectedGeneration.module === 'voice' &&
                selectedGeneration.output_url && (
                  <div className="project-preview-voice">
                    <div className="project-waveform">
                      {[...Array(24)].map((_, i) => (
                        <div
                          key={i}
                          className="project-waveform-bar"
                          style={{ animationDelay: `${i * 0.08}s` }}
                        />
                      ))}
                    </div>
                    <audio
                      controls
                      src={
                        selectedGeneration.output_url?.startsWith('http')
                          ? selectedGeneration.output_url
                          : selectedGeneration.output_path
                          ? convertFileSrc(selectedGeneration.output_path)
                          : ''
                      }
                      className="project-audio"
                    />
                  </div>
                )}
              {!selectedGeneration.output_url && !selectedGeneration.output_path && (
                <div className="project-preview-empty">
                  <div className="empty-icon">{STUDIO_MODULES[selectedGeneration.module]?.icon}</div>
                  <div className="empty-title">Generation is processing</div>
                  <div className="empty-desc">{selectedGeneration.prompt}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="project-preview-placeholder">
              <div className="placeholder-icon">🖼️</div>
              <div className="placeholder-title">Select a version</div>
              <div className="placeholder-desc">
                Choose a generation from the list to preview
              </div>
            </div>
          )}
        </div>

        {/* Right: Actions panel */}
        <div className="project-actions-panel">
          <div className="panel-header">
            <span className="panel-title">Actions</span>
          </div>
          {selectedGeneration ? (
            <div className="actions-list">
              <button
                className="project-action-btn save"
                onClick={() => saveToVault(selectedGeneration)}
              >
                💾 Save to Vault
              </button>
              <button
                className="project-action-btn remix"
                onClick={() => {
                  remix(selectedGeneration);
                  setEnterGallery(false);
                }}
              >
                🔄 Remix
              </button>
              <button
                className="project-action-btn branch"
                onClick={handleBranch}
              >
                🌿 Branch (New Variant)
              </button>
              <button
                className="project-action-btn export"
                onClick={handleExport}
              >
                📤 Export ZIP
              </button>
              <button
                className="project-action-btn delete"
                onClick={async () => {
                  if (confirm('Delete this generation?')) {
                    await deleteGeneration(selectedGeneration.id);
                    selectGeneration(null);
                  }
                }}
              >
                🗑️ Delete
              </button>

              {/* Remix lineage */}
              {selectedGeneration.remix_of && (
                <div className="remix-lineage">
                  <span className="lineage-label">Remix of:</span>
                  <span className="lineage-id">{selectedGeneration.remix_of}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="actions-empty">
              <div className="empty-hint">Select a generation to enable actions</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
