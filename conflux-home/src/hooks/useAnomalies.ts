import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { BillAnomaly } from '../types';

export function useAnomalies() {
  const [anomalies, setAnomalies] = useState<BillAnomaly[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<BillAnomaly[]>('home_detect_anomalies');
      setAnomalies(result);
    } catch (e) { console.error('Failed to detect anomalies:', e); }
    finally { setLoading(false); }
  }, []);

  return { anomalies, loading, load };
}
