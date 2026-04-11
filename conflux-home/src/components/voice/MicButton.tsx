// Conflux Home — Mic Button Component
// Reusable voice input button with inline/floating/topbar variants.

import { useCallback, useEffect, useState } from 'react';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import '../../styles/voice.css';

const MIC_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

export interface MicButtonProps {
  onTranscription: (text: string) => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'inline' | 'floating' | 'topbar';
  className?: string;
  disabled?: boolean;
  maxDurationMs?: number;
  label?: string;
}

const sizeMap = {
  sm: 20,
  md: 28,
  lg: 40,
};

export default function MicButton({
  onTranscription,
  size = 'md',
  variant = 'topbar',
  className = '',
  disabled = false,
  maxDurationMs,
  label,
}: MicButtonProps) {
  const [flashError, setFlashError] = useState(false);

  const handleTranscription = useCallback(
    (text: string) => {
      onTranscription(text);
    },
    [onTranscription],
  );

  const { isListening, isTranscribing, error, toggleListening, clearError } = useVoiceInput({
    onTranscription: handleTranscription,
    maxDurationMs,
  });

  // Flash error class briefly when an error arrives
  useEffect(() => {
    if (error) {
      setFlashError(true);
      const t = setTimeout(() => {
        setFlashError(false);
        clearError();
      }, 600);
      return () => clearTimeout(t);
    }
  }, [error, clearError]);

  const stateClass = isListening ? 'listening' : isTranscribing ? 'transcribing' : flashError ? 'error' : '';

  return (
    <button
      className={`mic-button mic-button-${variant} ${stateClass} ${className}`.trim()}
      onClick={toggleListening}
      disabled={disabled}
      aria-label={label ?? (isListening ? 'Stop listening' : 'Start voice input')}
      title={label ?? (isListening ? 'Stop listening' : 'Voice input')}
      style={{ width: sizeMap[size], height: sizeMap[size] }}
    >
      {isTranscribing ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      ) : (
        MIC_SVG
      )}
    </button>
  );
}
