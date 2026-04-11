import { useState, useEffect, useCallback } from 'react';
import { useStudio } from '../hooks/useStudio';
import { STUDIO_MODULES, StudioGeneration } from '../types';
import StudioTabs from './StudioTabs';
import StudioPromptBar from './StudioPromptBar';
import { convertFileSrc } from '@tauri-apps/api/core';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import '../styles-studio.css';

function getDisplayUrl(gen: { output_url: string | null; output_path: string | null }): string | null {
  if (gen.output_url?.startsWith('http')) return gen.output_url;
  if (gen.output_path) return convertFileSrc(gen.output_path);
  if (gen.output_url?.startsWith('file://')) return gen.output_url.replace('file://', '');
  return null;
}

function getThumbnailUrl(gen: StudioGeneration): string | null {
  if (gen.module === 'image' && gen.output_url?.startsWith('http')) return gen.output_url;
  if (gen.module === 'image' && gen.output_path) return convertFileSrc(gen.output_path);
  return null;
}

export default function StudioView() {
  const {
    activeModule, setActiveModule,
    prompt, setPrompt,
    isGenerating,
    generations,
    selectedGeneration,
    generate,
    saveToVault,
    remix,
    selectGeneration,
    loadHistory,
  } = useStudio();

  const [credits, setCredits] = useState<number | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

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

  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

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
  const handleSaveToVault = useCallback(async (gen: StudioGeneration) => {
    await saveToVault(gen);
    await loadHistory();
  }, [saveToVault, loadHistory]);

  return (
    <div className="studio-container">
      {/* Header with credit balance */}
      <div className="studio-header">
        <div>
          <h2 className="studio-title">✨ Studio</h2>
          <p className="studio-subtitle">Describe it. Generate it. Ship it.</p>
        </div>
        {credits !== null && (
          <div className="studio-credits-badge">
            <span className="studio-credits-icon">⚡</span>
            <span className="studio-credits-amount">{credits.toLocaleString()}</span>
            <span className="studio-credits-label">credits</span>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="studio-tabs">
        {Object.entries(STUDIO_MODULES).map(([id, mod]) => (
          <button
            key={id}
            className={`studio-tab ${activeModule === id ? 'active' : ''}`}
            onClick={() => setActiveModule(id as any)}
          >
            <span className="studio-tab-icon">{mod.icon}</span>
            <span className="studio-tab-label">{mod.label}</span>
          </button>
        ))}
      </div>

      {/* Prompt Bar — THE INPUT FIELD AND GENERATE BUTTON */}
      <StudioPromptBar
        value={prompt}
        onChange={setPrompt}
        onSubmit={handleGenerate}
        isGenerating={isGenerating}
        activeModule={activeModule}
      />

      {/* Reference Image (for image module) */}
      {activeModule === 'image' && (
        <div className="studio-reference-row">
          {referenceImage ? (
            <div className="studio-reference-preview">
              <img src={convertFileSrc(referenceImage)} alt="Reference" className="studio-reference-img" />
              <button className="studio-reference-remove" onClick={() => setReferenceImage(null)}>✕</button>
              <span className="studio-reference-label">Reference</span>
            </div>
          ) : (
            <button className="studio-reference-btn" onClick={handleReferenceUpload}>
              📎 Add Reference Image
            </button>
          )}
        </div>
      )}

      {/* Output Area */}
      <div className="studio-output">
        <div className="studio-output-preview">
          {isGenerating ? (
            <div className="studio-output-shimmer">
              <div className="studio-output-shimmer-bar" />
              <div className="studio-output-shimmer-text">Generating...</div>
            </div>
          ) : selectedGeneration ? (
            <div className="studio-output-content">
              {selectedGeneration.module === 'image' && getDisplayUrl(selectedGeneration) && (
                <img src={getDisplayUrl(selectedGeneration)!} alt="Generated" className="studio-output-preview-img" />
              )}
              {selectedGeneration.module === 'voice' && getDisplayUrl(selectedGeneration) && (
                <div className="studio-output-preview-audio">
                  <div className="studio-output-waveform">
                    {[...Array(20)].map((_, i) => (
                      <div
                        key={i}
                        className="studio-output-waveform-bar"
                        style={{ animationDelay: `${i * 0.1}s` }}
                      />
                    ))}
                  </div>
                  <audio controls src={getDisplayUrl(selectedGeneration)!} className="studio-output-audio-player" />
                </div>
              )}
              {!getDisplayUrl(selectedGeneration) && (
                <div className="studio-output-empty">
                  <div className="studio-output-empty-icon">
                    {selectedGeneration.module === 'voice' ? '🗣️' : '🎨'}
                  </div>
                  <div className="studio-output-empty-title">Generation complete</div>
                  <div className="studio-output-empty-desc">{selectedGeneration.prompt}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="studio-output-empty">
              <div className="studio-output-empty-icon">🎨</div>
              <div className="studio-output-empty-title">Ready to create</div>
              <div className="studio-output-empty-desc">Enter a prompt below to generate your first creation</div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      {selectedGeneration && (
        <div className="studio-output-actions">
          <button className="studio-output-btn studio-output-btn-save" onClick={() => handleSaveToVault(selectedGeneration)}>
            💾 Save to Vault
          </button>
          <button className="studio-output-btn" onClick={() => remix(selectedGeneration)}>
            🔄 Remix
          </button>
        </div>
      )}

      {/* Generation History with real thumbnails */}
      {generations.length > 0 && (
        <div className="studio-history">
          <div className="studio-history-title">History</div>
          <div className="studio-history-scroll">
            {generations.map(gen => {
              const thumb = getThumbnailUrl(gen);
              return (
                <div
                  key={gen.id}
                  className={`studio-history-thumb ${selectedGeneration?.id === gen.id ? 'active' : ''}`}
                  onClick={() => selectGeneration(gen)}
                >
                  {thumb ? (
                    <img src={thumb} alt={gen.prompt} className="studio-history-thumb-img" />
                  ) : (
                    <span className="studio-history-thumb-placeholder">
                      {gen.module === 'voice' ? '🔊' : gen.module === 'image' ? '🖼️' : '🎨'}
                    </span>
                  )}
                  <span className="studio-history-module-badge">{gen.module}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
