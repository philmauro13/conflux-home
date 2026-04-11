import { useEffect, useRef } from 'react';
import { STUDIO_MODULES, StudioModule } from '../types';

interface StudioPromptBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isGenerating: boolean;
  activeModule: StudioModule;
}

const PLACEHOLDER: Record<StudioModule, string> = {
  image: 'Describe the image you want to create...',
  video: 'Describe the video you want to generate...',
  music: 'Describe the music you want to compose...',
  voice: 'Enter the text you want spoken aloud...',
  code: 'Describe the website or app you want to build...',
  design: 'Describe the design asset you need...',
};

export default function StudioPromptBar({
  value,
  onChange,
  onSubmit,
  isGenerating,
  activeModule,
}: StudioPromptBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Cmd/Ctrl+Enter to submit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isGenerating && value.trim()) {
        e.preventDefault();
        onSubmit();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onSubmit, isGenerating, value]);

  const moduleInfo = STUDIO_MODULES[activeModule];

  return (
    <div className="studio-prompt-bar">
      <div className="studio-prompt-header">
        <span className="studio-prompt-module-icon">{moduleInfo.icon}</span>
        <span className="studio-prompt-module-label">{moduleInfo.label}</span>
      </div>
      <textarea
        ref={textareaRef}
        className="studio-prompt-textarea"
        placeholder={PLACEHOLDER[activeModule]}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={1}
        disabled={isGenerating}
      />
      <div className="studio-prompt-actions">
        <span className="studio-prompt-hint">
          ⏎ Cmd/Ctrl+Enter to generate
        </span>
        <button
          className="studio-generate-btn"
          onClick={onSubmit}
          disabled={isGenerating || !value.trim()}
        >
          {isGenerating ? (
            <>
              <span className="studio-generate-spinner" />
              Generating…
            </>
          ) : (
            <>
              Generate ▶
            </>
          )}
        </button>
      </div>
    </div>
  );
}
