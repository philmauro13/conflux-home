import { useStudio } from '../hooks/useStudio';
import { STUDIO_MODULES } from '../types';
export default function AdjustmentPanel() {
  const { activeModule, adjustments, updateAdjustment, setPrompt } = useStudio();

  const currentAdjustments = adjustments[activeModule] || {};

  const renderControls = () => {
    switch (activeModule) {
      case 'image':
        return (
          <>
            <div className="adjustment-group">
              <label className="adjustment-label">Template</label>
              <div className="adjustment-buttons">
                {[
                  { label: 'Portrait', prompt: 'A portrait of a person, detailed face, studio lighting' },
                  { label: 'Landscape', prompt: 'A wide landscape scene, epic vista, natural lighting' },
                  { label: 'Product', prompt: 'A professional product photo, clean background, commercial' },
                  { label: 'Thumbnail', prompt: 'YouTube thumbnail style, eye-catching, bold composition' },
                  { label: 'Abstract', prompt: 'Abstract digital art, surreal, colorful gradients' },
                ].map((t) => (
                  <button
                    key={t.label}
                    className="adjustment-btn"
                    onClick={() => setPrompt(t.prompt)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Size</label>
              <div className="adjustment-buttons">
                {['512x512', '1024x1024', '1792x1024', '1024x1792'].map((size) => (
                  <button
                    key={size}
                    className={`adjustment-btn ${currentAdjustments.size === size ? 'active' : ''}`}
                    onClick={() => updateAdjustment('image', 'size', size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Style</label>
              <div className="adjustment-buttons">
                {['vivid', 'natural', 'dramatic'].map((style) => (
                  <button
                    key={style}
                    className={`adjustment-btn ${currentAdjustments.style === style ? 'active' : ''}`}
                    onClick={() => updateAdjustment('image', 'style', style)}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Quality</label>
              <div className="adjustment-buttons">
                {['standard', 'high', 'ultra'].map((quality) => (
                  <button
                    key={quality}
                    className={`adjustment-btn ${currentAdjustments.quality === quality ? 'active' : ''}`}
                    onClick={() => updateAdjustment('image', 'quality', quality)}
                  >
                    {quality}
                  </button>
                ))}
              </div>
            </div>
          </>
        );

      case 'voice':
        return (
          <>
            <div className="adjustment-group">
              <label className="adjustment-label">Voice</label>
              <div className="adjustment-buttons">
                {[
                  { id: 'conflux', label: 'Conflux', voiceId: 'TvxTBL9RtGW6tVhl4NoI' },
                  { id: 'helix', label: 'Helix', voiceId: 'USEXQnsXRJlw2k9LUzG4' },
                  { id: 'pulse', label: 'Pulse', voiceId: 'auq43ws1oslv0tO4BDa7' },
                  { id: 'hearth', label: 'Hearth', voiceId: 'W7iR5kTNHozpIl2Jqq15' },
                  { id: 'echo', label: 'Echo', voiceId: 'EST9Ui6982FZPSi7gCHi' },
                  { id: 'rachel', label: 'Rachel (default)', voiceId: 'JBFqnCBsd6RMkjVDRZzb' },
                ].map((v) => (
                  <button
                    key={v.id}
                    className={`adjustment-btn ${currentAdjustments.voiceId === v.voiceId ? 'active' : ''}`}
                    onClick={() => updateAdjustment('voice', 'voiceId', v.voiceId)}
                    title={v.id}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Speed</label>
              <div className="adjustment-slider">
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={currentAdjustments.speed || 1.0}
                  onChange={(e) => updateAdjustment('voice', 'speed', parseFloat(e.target.value))}
                />
                <span className="adjustment-value">{(currentAdjustments.speed || 1.0).toFixed(1)}x</span>
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Stability</label>
              <div className="adjustment-slider">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={currentAdjustments.stability || 0.5}
                  onChange={(e) => updateAdjustment('voice', 'stability', parseFloat(e.target.value))}
                />
                <span className="adjustment-value">{((currentAdjustments.stability || 0.5) * 100).toFixed(0)}%</span>
              </div>
            </div>
          </>
        );

      case 'video':
        return (
          <>
            <div className="adjustment-group">
              <label className="adjustment-label">Duration (seconds)</label>
              <div className="adjustment-number">
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={currentAdjustments.duration || 5}
                  onChange={(e) => updateAdjustment('video', 'duration', parseInt(e.target.value))}
                />
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Frame Rate</label>
              <div className="adjustment-buttons">
                {[24, 30, 60].map((fps) => (
                  <button
                    key={fps}
                    className={`adjustment-btn ${currentAdjustments.fps === fps ? 'active' : ''}`}
                    onClick={() => updateAdjustment('video', 'fps', fps)}
                  >
                    {fps} fps
                  </button>
                ))}
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Style</label>
              <div className="adjustment-buttons">
                {['cinematic', 'animated', 'realistic'].map((style) => (
                  <button
                    key={style}
                    className={`adjustment-btn ${currentAdjustments.style === style ? 'active' : ''}`}
                    onClick={() => updateAdjustment('video', 'style', style)}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          </>
        );

      case 'music':
        return (
          <>
            <div className="adjustment-group">
              <label className="adjustment-label">Genre</label>
              <div className="adjustment-buttons">
                {['ambient', 'electronic', 'classical', 'jazz', 'rock', 'hip-hop'].map((genre) => (
                  <button
                    key={genre}
                    className={`adjustment-btn ${currentAdjustments.genre === genre ? 'active' : ''}`}
                    onClick={() => updateAdjustment('music', 'genre', genre)}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Duration</label>
              <div className="adjustment-buttons">
                {[15, 30, 60].map((duration) => (
                  <button
                    key={duration}
                    className={`adjustment-btn ${currentAdjustments.duration === duration ? 'active' : ''}`}
                    onClick={() => updateAdjustment('music', 'duration', duration)}
                  >
                    {duration}s
                  </button>
                ))}
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Mood</label>
              <div className="adjustment-buttons">
                {['calm', 'energetic', 'melancholic', 'joyful', 'mysterious'].map((mood) => (
                  <button
                    key={mood}
                    className={`adjustment-btn ${currentAdjustments.mood === mood ? 'active' : ''}`}
                    onClick={() => updateAdjustment('music', 'mood', mood)}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </div>
          </>
        );

      case 'code':
        return (
          <>
            <div className="adjustment-group">
              <label className="adjustment-label">Language</label>
              <div className="adjustment-buttons">
                {['html', 'css', 'javascript', 'python', 'rust', 'go'].map((lang) => (
                  <button
                    key={lang}
                    className={`adjustment-btn ${currentAdjustments.language === lang ? 'active' : ''}`}
                    onClick={() => updateAdjustment('code', 'language', lang)}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Framework</label>
              <div className="adjustment-buttons">
                {['vanilla', 'react', 'vue', 'svelte', 'tailwind'].map((fw) => (
                  <button
                    key={fw}
                    className={`adjustment-btn ${currentAdjustments.framework === fw ? 'active' : ''}`}
                    onClick={() => updateAdjustment('code', 'framework', fw)}
                  >
                    {fw}
                  </button>
                ))}
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Complexity</label>
              <div className="adjustment-buttons">
                {['simple', 'medium', 'complex'].map((level) => (
                  <button
                    key={level}
                    className={`adjustment-btn ${currentAdjustments.complexity === level ? 'active' : ''}`}
                    onClick={() => updateAdjustment('code', 'complexity', level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </>
        );

      case 'design':
        return (
          <>
            <div className="adjustment-group">
              <label className="adjustment-label">Format</label>
              <div className="adjustment-buttons">
                {['png', 'svg', 'pdf', 'eps'].map((format) => (
                  <button
                    key={format}
                    className={`adjustment-btn ${currentAdjustments.format === format ? 'active' : ''}`}
                    onClick={() => updateAdjustment('design', 'format', format)}
                  >
                    {format.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Style</label>
              <div className="adjustment-buttons">
                {['modern', 'minimal', 'vintage', 'bold', 'elegant'].map((style) => (
                  <button
                    key={style}
                    className={`adjustment-btn ${currentAdjustments.style === style ? 'active' : ''}`}
                    onClick={() => updateAdjustment('design', 'style', style)}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
            <div className="adjustment-group">
              <label className="adjustment-label">Colors</label>
              <div className="adjustment-number">
                <input
                  type="range"
                  min="1"
                  max="6"
                  step="1"
                  value={currentAdjustments.colorCount || 3}
                  onChange={(e) => updateAdjustment('design', 'colorCount', parseInt(e.target.value))}
                />
                <span className="adjustment-value">{currentAdjustments.colorCount || 3} colors</span>
              </div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="studio-adjustment-panel">
      <div className="adjustment-header">
        <span className="adjustment-title">Adjustments</span>
        <span className="adjustment-module">{STUDIO_MODULES[activeModule]?.icon}</span>
      </div>
      <div className="adjustment-content">
        {renderControls()}
      </div>
    </div>
  );
}
