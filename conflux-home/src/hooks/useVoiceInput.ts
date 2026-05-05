// Conflux Home — Voice Input Hook (Tauri backend)
// Split flow: start → user taps stop → transcribe
// No blocking wait — user controls recording duration.

import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface UseVoiceInputOptions {
  onTranscription: (text: string) => void;
  maxDurationMs?: number;
}

interface UseVoiceInputReturn {
  isListening: boolean;
  isTranscribing: boolean;
  isAvailable: boolean;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  toggleListening: () => Promise<void>;
  clearError: () => void;
}

export function useVoiceInput(options: UseVoiceInputOptions): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startListening = useCallback(async () => {
    if (isListening || isTranscribing) return;
    abortRef.current = false;
    setError(null);

    try {
      await invoke('voice_capture_start');
      setIsListening(true);

      // Auto-stop after maxDurationMs as a safety net
      const maxMs = options.maxDurationMs ?? 30_000;
      autoStopTimer.current = setTimeout(() => {
        stopListening();
      }, maxMs);
    } catch (e) {
      if (!abortRef.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }, [isListening, isTranscribing, options.maxDurationMs]);

  const stopListening = useCallback(async () => {
    if (autoStopTimer.current) {
      clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
    }

    abortRef.current = true;
    setIsListening(false);

    try {
      // Stop recording — backend returns transcript if realtime STT delivered it
      const result = await invoke<{ samples: number; duration_seconds: number; transcript?: string | null }>('voice_capture_stop');

      if (result.samples > 1600) { // At least 0.1s of audio
        setIsTranscribing(true);

        // Fast path: realtime STT already gave us a transcript synchronously
        if (result.transcript && result.transcript.trim()) {
          options.onTranscription(result.transcript.trim());
          return;
        }

        // Fallback: wait for conflux:transcription event (realtime STT arrived after stop)
        // This handles the case where transcript arrived just after voice_capture_stop returned.
        const transcriptionText = await new Promise<string>(async (resolve) => {
          const unlisten = await listen<{ text: string }>('conflux:transcription', (event) => {
            if (timeoutId) clearTimeout(timeoutId);
            unlisten();
            if (event.payload?.text) resolve(event.payload.text);
            else resolve('');
          });

          let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
            unlisten();
            resolve('');
          }, 3000);
        });

        if (transcriptionText && transcriptionText.trim()) {
          options.onTranscription(transcriptionText.trim());
          return;
        }

        // Last resort: batch Whisper / ElevenLabs
        const text = await invoke<string>('voice_transcribe');
        if (text) {
          options.onTranscription(text);
        }
      }
    } catch (e) {
      if (!abortRef.current || (e instanceof Error && !e.message.includes('Not recording'))) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setIsTranscribing(false);
    }
  }, [options]);

  const toggleListening = useCallback(async () => {
    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  }, [isListening, startListening, stopListening]);

  const clearError = useCallback(() => setError(null), []);

  return {
    isListening,
    isTranscribing,
    isAvailable: true,
    error,
    startListening,
    stopListening,
    toggleListening,
    clearError,
  };
}
