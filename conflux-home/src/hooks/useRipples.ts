import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { RippleSignal } from '../types';

export function useRipples(memberId?: string) {
  const [ripples, setRipples] = useState<RippleSignal[]>([]);
  const [loading, setLoading] = useState(false);

  // No "get from DB" command exists — ripples are detected on demand
  const detect = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<RippleSignal[]>('current_detect_ripples', {
        member_id: memberId ?? null,
      });
      setRipples(data);
      return data;
    } catch (e) {
      console.error('Failed to detect ripples:', e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  return { ripples, loading, detect };
}
