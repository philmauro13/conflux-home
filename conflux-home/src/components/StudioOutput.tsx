import { STUDIO_MODULES, StudioGeneration, StudioModule } from '../types';

interface StudioOutputProps {
  generation: StudioGeneration | null;
  isGenerating: boolean;
  onSave: () => void;
  onRemix: () => void;
}

function OutputPlaceholder({ module }: { module: StudioModule }) {
  switch (module) {
    case 'image':
      return (
        <div className="studio-output-placeholder studio-output-image">
          <div className="studio-output-canvas-placeholder">
            <div className="studio-output-canvas-grid">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="studio-output-canvas-cell" />
              ))}
            </div>
          </div>
        </div>
      );
    case 'video':
      return (
        <div className="studio-output-placeholder studio-output-video">
          <div className="studio-output-video-player">
            <div className="studio-output-play-icon">▶</div>
            <div className="studio-output-timeline">
              <div className="studio-output-timeline-track" />
              <div className="studio-output-timeline-scrubber" />
            </div>
          </div>
        </div>
      );
    case 'music':
      return (
        <div className="studio-output-placeholder studio-output-music">
          <div className="studio-output-waveform">
            {Array.from({ length: 32 }).map((_, i) => (
              <div
                key={i}
                className="studio-output-waveform-bar"
                style={{ height: `${20 + Math.random() * 60}%` }}
              />
            ))}
          </div>
          <div className="studio-output-audio-controls">
            <span className="studio-output-play-btn">▶</span>
            <span className="studio-output-time">0:00 / 0:30</span>
          </div>
        </div>
      );
    case 'voice':
      return (
        <div className="studio-output-placeholder studio-output-voice">
          <div className="studio-output-waveform">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className="studio-output-waveform-bar"
                style={{ height: `${15 + Math.random() * 70}%` }}
              />
            ))}
          </div>
        </div>
      );
    case 'code':
      return (
        <div className="studio-output-placeholder studio-output-code">
          <div className="studio-output-code-editor">
            <div className="studio-output-code-header">
              <span className="studio-output-code-dot" />
              <span className="studio-output-code-dot" />
              <span className="studio-output-code-dot" />
              <span className="studio-output-code-filename">index.html</span>
            </div>
            <div className="studio-output-code-body">
              <div className="studio-output-code-line"><span className="studio-output-code-tag">&lt;!DOCTYPE html&gt;</span></div>
              <div className="studio-output-code-line"><span className="studio-output-code-tag">&lt;html&gt;</span></div>
              <div className="studio-output-code-line">&nbsp;&nbsp;<span className="studio-output-code-tag">&lt;body&gt;</span></div>
              <div className="studio-output-code-line">&nbsp;&nbsp;&nbsp;&nbsp;<span className="studio-output-code-comment">&lt;!-- Your code here --&gt;</span></div>
              <div className="studio-output-code-line">&nbsp;&nbsp;<span className="studio-output-code-tag">&lt;/body&gt;</span></div>
              <div className="studio-output-code-line"><span className="studio-output-code-tag">&lt;/html&gt;</span></div>
            </div>
          </div>
        </div>
      );
    case 'design':
      return (
        <div className="studio-output-placeholder studio-output-design">
          <div className="studio-output-canvas-placeholder">
            <div className="studio-output-design-grid">
              <div className="studio-output-design-shape studio-output-design-circle" />
              <div className="studio-output-design-shape studio-output-design-rect" />
              <div className="studio-output-design-shape studio-output-design-triangle" />
            </div>
          </div>
        </div>
      );
  }
}

function GenerationPreview({ generation }: { generation: StudioGeneration }) {
  const meta = generation.metadata_json ? JSON.parse(generation.metadata_json) : null;

  return (
    <div className="studio-output-preview">
      {generation.output_url ? (
        generation.module === 'image' || generation.module === 'design' ? (
          <img
            className="studio-output-preview-img"
            src={generation.output_url}
            alt={generation.prompt}
          />
        ) : generation.module === 'video' ? (
          <video
            className="studio-output-preview-video"
            src={generation.output_url}
            controls
          />
        ) : generation.module === 'music' || generation.module === 'voice' ? (
          <audio
            className="studio-output-preview-audio"
            src={generation.output_url}
            controls
          />
        ) : (
          <div className="studio-output-preview-fallback">
            <span className="studio-output-preview-icon">
              {STUDIO_MODULES[generation.module].icon}
            </span>
            <p className="studio-output-preview-prompt">{generation.prompt}</p>
          </div>
        )
      ) : (
        <div className="studio-output-preview-fallback">
          <span className="studio-output-preview-icon">
            {STUDIO_MODULES[generation.module].icon}
          </span>
          <p className="studio-output-preview-prompt">{generation.prompt}</p>
        </div>
      )}
      {meta && (
        <div className="studio-output-preview-meta">
          {meta.width && meta.height && (
            <span>{meta.width}×{meta.height}</span>
          )}
          {meta.duration && (
            <span>{meta.duration}s</span>
          )}
          {meta.format && (
            <span>{meta.format.toUpperCase()}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function StudioOutput({ generation, isGenerating, onSave, onRemix }: StudioOutputProps) {
  // Shimmer state during generation
  if (isGenerating) {
    return (
      <div className="studio-output">
        <div className="studio-output-shimmer">
          <div className="studio-output-shimmer-bar" />
          <div className="studio-output-shimmer-text">
            {STUDIO_MODULES[generation?.module || 'image'].icon} Generating…
          </div>
        </div>
      </div>
    );
  }

  // Completed generation
  if (generation && generation.status === 'complete') {
    return (
      <div className="studio-output">
        <GenerationPreview generation={generation} />
        <div className="studio-output-actions">
          <button className="studio-output-btn studio-output-btn-save" onClick={onSave}>
            💾 Save to Vault
          </button>
          <button className="studio-output-btn studio-output-btn-remix" onClick={onRemix}>
            🔄 Remix
          </button>
        </div>
      </div>
    );
  }

  // Failed generation
  if (generation && generation.status === 'failed') {
    return (
      <div className="studio-output">
        <div className="studio-output-empty">
          <div className="studio-output-empty-icon">❌</div>
          <div className="studio-output-empty-title">Generation failed</div>
          <div className="studio-output-empty-desc">Something went wrong. Try again with a different prompt.</div>
        </div>
      </div>
    );
  }

  // Empty state
  return (
    <div className="studio-output">
      <div className="studio-output-empty">
        <div className="studio-output-empty-icon">✨</div>
        <div className="studio-output-empty-title">Your creation will appear here</div>
        <div className="studio-output-empty-desc">
          Describe what you want and hit Generate
        </div>
      </div>
    </div>
  );
}
