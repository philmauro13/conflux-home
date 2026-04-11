import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PredictedFailure } from '../types';

export function usePredictions() {
  const [predictions, setPredictions] = useState<PredictedFailure[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<PredictedFailure[]>('home_predict_failures');
      setPredictions(result);
    } catch (e) { console.error('Failed to load predictions:', e); }
    finally { setLoading(false); }
  }, []);

  return { predictions, loading, load };
}
