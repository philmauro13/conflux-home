import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { convertFileSrc } from '@tauri-apps/api/core';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useStudio } from '../hooks/useStudio';
import { STUDIO_MODULES } from '../types';
import ToolPalette from './ToolPalette';
import AdjustmentPanel from './AdjustmentPanel';
import HistoryStrip from './HistoryStrip';
import StudioBackground from './StudioBackground';
import StudioGallery from './StudioGallery';
import StudioProject from './StudioProject';
import StudioAnalytics from './StudioAnalytics';
import '../styles-studio.css';

function getDisplayUrl(gen: { output_url: string | null; output_path: string | null }): string | null {
  if (gen.output_url?.startsWith('http')) return gen.output_url;
  if (gen.output_path) return convertFileSrc(gen.output_path);
  if (gen.output_url?.startsWith('file://')) return gen.output_url.replace('file://', '');
  return null;
}

function getThumbnailUrl(gen: { output_url: string | null; output_path: string | null }): string | null {
  if (gen.output_url?.startsWith('http')) return gen.output_url;
  if (gen.output_path) return convertFileSrc(gen.output_path);
  return null;
}

export default function StudioDashboard() {
  const {
    activeModule,
    setActiveModule,
    prompt,
    setPrompt,
    isGenerating,
    generations,
    selectedGeneration,
    selectGeneration,
    generate,
    generateBatch,
    saveToVault,
    remix,
    loadHistory,
    adjustments,
    updateAdjustment,
    isFullscreen,
    toggleFullscreen,
    currentProject,
    projects,
    setProjects,
    setCurrentProject,
    batchGenerations,
    setBatchGenerations,
    enterGallery,
    setEnterGallery,
  } = useStudio();

  // All hooks (must be called unconditionally)
  const [credits, setCredits] = useState<number | null>(null);
  const [toolPaletteCollapsed, setToolPaletteCollapsed] = useState(false);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

  // Analytics panel state
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Load credit balance
  const loadCredits = useCallback(async () => {
    try {
      const userId = await invoke<string>('get_studio_user_id');
      if (!userId) return;
      const result = await invoke<{ balance: number; has_active_subscription: boolean }>(
        'get_credit_balance',
        { userId }
      );
      setCredits(result.balance);
    } catch {
      // Credit system unavailable — that's OK
    }
  }, []);

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      const result = await invoke<Array<{ id: string; name: string; path: string }>>('studio_get_projects');
      if (result.length > 0) {
        setProjects(result);
      }
    } catch {
      // Projects not implemented yet
    }
  }, []);

  useEffect(() => {
    loadCredits();
    loadProjects();
  }, [loadCredits, loadProjects]);

  // Handle reference image upload
  const handleReferenceUpload = useCallback(async () => {
    try {
      const selected = await open({
        title: 'Select Reference Image',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        multiple: false,
      });
      if (selected) {
        setReferenceImage(Array.isArray(selected) ? selected[0] : selected);
      }
    } catch (e) {
      console.error('Failed to open file dialog:', e);
    }
  }, []);

  // Wrap generate to also pass reference image and refresh credits
  const handleGenerate = useCallback(async () => {
    await generate();
    // Refresh credits after generation
    setTimeout(loadCredits, 2000);
  }, [generate, loadCredits]);

  // Wrap save to refresh after
  const handleSaveToVault = useCallback(async (gen: any) => {
    await saveToVault(gen);
    await loadHistory();
  }, [saveToVault, loadHistory]);

  const moduleInfo = STUDIO_MODULES[activeModule];

  // Gallery / Project overlay modes
  if (enterGallery) {
    return selectedGeneration ? <StudioProject /> : <StudioGallery />;
  }

  return (
    <div className="studio-dashboard-container">
      {/* Background particle canvas — z-index: 0, pointer-events: none */}
      <StudioBackground className="studio-background" />

      {/* Header */}
      <div className="studio-dashboard-header">
        <div className="dashboard-header-left">
          <div className="dashboard-header-title">
            <h2 className="studio-title">✨ Studio</h2>
            {projects.length > 1 && (
              <select
                className="dashboard-project-select"
                value={currentProject}
                onChange={(e) => setCurrentProject(e.target.value)}
              >
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>{proj.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="dashboard-header-center">
          <div className="dashboard-breadcrumb">
            <span className="dashboard-module-icon">{moduleInfo.icon}</span>
            <span className="dashboard-module-label">{moduleInfo.label}</span>
            <span className="dashboard-breadcrumb-sep">/</span>
            <span className="dashboard-project-name">{projects.find(p => p.id === currentProject)?.name || 'Default'}</span>
          </div>
        </div>
        <div className="dashboard-header-right">
          {credits !== null && (
            <div className="studio-credits-badge">
              <span className="studio-credits-icon">⚡</span>
              <span className="studio-credits-amount">{credits.toLocaleString()}</span>
              <span className="studio-credits-label">credits</span>
            </div>
          )}
          <button
            className="dashboard-gallery-btn"
            onClick={() => {
              setEnterGallery(true);
              selectGeneration(null);
            }}
            title="Open Gallery"
          >
            🗂️
          </button>
          <button
            className={`dashboard-fullscreen-btn ${isFullscreen ? 'active' : ''}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? '⛶' : '⛶'}
          </button>
          <button
            className={`dashboard-analytics-btn ${showAnalytics ? 'active' : ''}`}
            onClick={() => setShowAnalytics(!showAnalytics)}
            title="Analytics"
          >
            📊
          </button>
        </div>
      </div>

      {/* Analytics Panel */}
      {showAnalytics && (
        <div className="studio-analytics-panel">
          <StudioAnalytics
            generations={generations}
            onClose={() => setShowAnalytics(false)}
          />
        </div>
      )}

      {/* Main Dashboard Layout */}
      <div className="studio-dashboard-main">
        {/* Tool Palette */}
        <ToolPalette
          activeModule={activeModule}
          onSelect={setActiveModule}
          isCollapsed={toolPaletteCollapsed}
          onToggleCollapse={() => setToolPaletteCollapsed(!toolPaletteCollapsed)}
        />

        {/* Preview Canvas */}
        <div className={`studio-preview-canvas ${isFullscreen ? 'fullscreen' : ''}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeModule}-${selectedGeneration?.id || 'empty'}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="preview-canvas-content"
            >
              {isGenerating ? (
                <div className="preview-generating">
                  <div className="preview-shimmer">
                    <div className="preview-shimmer-bar" />
                    <div className="preview-shimmer-text">Generating...</div>
                  </div>
                </div>
              ) : selectedGeneration ? (
                <div className="preview-generation">
                  {selectedGeneration.module === 'image' && getDisplayUrl(selectedGeneration) && (
                    <motion.img
                      src={getDisplayUrl(selectedGeneration)!}
                      alt={selectedGeneration.prompt}
                      className="preview-image"
                      initial={{ scale: 0.95 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                  {selectedGeneration.module === 'voice' && getDisplayUrl(selectedGeneration) && (
                    <div className="preview-voice">
                      <div className="preview-waveform">
                        {[...Array(20)].map((_, i) => (
                          <div
                            key={i}
                            className="preview-waveform-bar"
                            style={{ animationDelay: `${i * 0.1}s` }}
                          />
                        ))}
                      </div>
                      <audio controls src={getDisplayUrl(selectedGeneration)!} className="preview-audio" />
                    </div>
                  )}
                  {!getDisplayUrl(selectedGeneration) && (
                    <div className="preview-empty">
                      <div className="preview-empty-icon">
                        {selectedGeneration.module === 'voice' ? '🗣️' : '🎨'}
                      </div>
                      <div className="preview-empty-title">Generation complete</div>
                      <div className="preview-empty-desc">{selectedGeneration.prompt}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="preview-placeholder">
                  <div className="preview-placeholder-icon">
                    {moduleInfo.icon}
                  </div>
                  <div className="preview-placeholder-title">Ready to create</div>
                  <div className="preview-placeholder-desc">
                    Enter a prompt to generate your first {moduleInfo.label.toLowerCase()}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Adjustment Panel */}
        <AdjustmentPanel />
      </div>

      {/* Reference Image (for image module) */}
      {activeModule === 'image' && (
        <div className="dashboard-reference-row">
          {referenceImage ? (
            <div className="dashboard-reference-preview">
              <img src={convertFileSrc(referenceImage)} alt="Reference" className="dashboard-reference-img" />
              <button className="dashboard-reference-remove" onClick={() => setReferenceImage(null)}>✕</button>
              <span className="dashboard-reference-label">Reference</span>
            </div>
          ) : (
            <button className="dashboard-reference-btn" onClick={handleReferenceUpload}>
              📎 Add Reference Image
            </button>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {selectedGeneration && !isGenerating && (
        <div className="dashboard-actions">
          <button className="dashboard-action-btn dashboard-action-btn-save" onClick={() => handleSaveToVault(selectedGeneration)}>
            💾 Save to Vault
          </button>
          <button className="dashboard-action-btn" onClick={() => remix(selectedGeneration)}>
            🔄 Remix
          </button>
          <button className="dashboard-action-btn dashboard-action-btn-export" onClick={() => {/* TODO: Implement export */}}>
            📤 Export
          </button>
        </div>
      )}

      {/* History Strip */}
      <HistoryStrip />

      {/* Prompt Bar */}
      <div className="dashboard-prompt-bar">
        <div className="dashboard-prompt-header-left">
          <span className="dashboard-prompt-icon">{moduleInfo.icon}</span>
          <span className="dashboard-prompt-label">{moduleInfo.label}</span>
        </div>
        <div className="dashboard-prompt-input-wrapper">
          <textarea
            className="dashboard-prompt-textarea"
            placeholder={`Describe your ${moduleInfo.label.toLowerCase()}...`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={1}
            disabled={isGenerating}
          />
        </div>
        <div className="dashboard-prompt-right">
          <span className="dashboard-prompt-hint">⌘ + Enter</span>
          <button
            className="dashboard-generate-btn"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
          >
            {isGenerating ? 'Generating…' : 'Generate'}
          </button>
          <button
            className="dashboard-generate-btn dashboard-generate-batch"
            onClick={generateBatch}
            disabled={isGenerating || !prompt.trim()}
            title="Generate 4 variations"
          >
            4
          </button>
        </div>
      </div>
    </div>
  );
}
