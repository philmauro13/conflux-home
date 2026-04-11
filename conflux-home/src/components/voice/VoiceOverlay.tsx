// Conflux Home — Voice Overlay Component
// Full-screen overlay for TopBar universal mic activation.
// Uses a React portal to render at document.body level.

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import VoiceWaveform from './VoiceWaveform';
import '../../styles/voice.css';

interface VoiceOverlayProps {
  active: boolean;
  onTranscription: (text: string) => void;
  onDone: () => void;
  maxDurationMs?: number;
}

type Phase = 'enter' | 'active' | 'exit';

export default function VoiceOverlay({ active, onTranscription, onDone, maxDurationMs }: VoiceOverlayProps) {
  const [phase, setPhase] = useState<Phase>('enter');
  const [transcript, setTranscript] = useState('');
  const hasStartedRef = useRef(false);
  const doneRef = useRef(false);

  const handleTranscription = (text: string) => {
    setTranscript(text);
    onTranscription(text);
  };

  const { isListening, isTranscribing, startListening, stopListening } = useVoiceInput({
    onTranscription: handleTranscription,
    maxDurationMs,
  });

  // Start listening when overlay opens
  useEffect(() => {
    if (active) {
      setTranscript('');
      doneRef.current = false;
      hasStartedRef.current = false;
      requestAnimationFrame(() => setPhase('active'));
      const t = setTimeout(() => {
        hasStartedRef.current = true;
        startListening();
      }, 150);
      return () => clearTimeout(t);
    } else if (phase !== 'enter') {
      if (hasStartedRef.current) {
        stopListening();
      }
      setPhase('exit');
      const t = setTimeout(() => setPhase('enter'), 300);
      return () => clearTimeout(t);
    }
  }, [active]);

  // Auto-close after transcription completes
  useEffect(() => {
    if (active && !isListening && !isTranscribing && transcript && !doneRef.current) {
      doneRef.current = true;
      const t = setTimeout(onDone, 1000);
      return () => clearTimeout(t);
    }
  }, [active, isListening, isTranscribing, transcript, onDone]);

  if (phase === 'enter' && !active) return null;

  const handleBackdropClick = () => {
    if (isListening) {
      stopListening();
    } else {
      onDone();
    }
  };

  const overlay = (
    <div
      className={`voice-overlay voice-overlay-${phase}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-label="Voice input"
    >
      <div className="voice-overlay-content" onClick={(e) => e.stopPropagation()}>
        <div className="voice-overlay-waveform">
          <VoiceWaveform barCount={7} active={isListening} />
        </div>

        <div className="voice-overlay-label">
          {isTranscribing ? '⏳ Processing...' : isListening ? '🎤 Listening...' : 'Tap to speak'}
        </div>

        {transcript && (
          <div className="voice-overlay-transcript">{transcript}</div>
        )}

        <div className="voice-overlay-hint">
          {isListening ? 'Tap anywhere to stop' : ''}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
