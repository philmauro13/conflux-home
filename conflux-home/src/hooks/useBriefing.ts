import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DailyBriefing } from '../types';

export function useBriefing(memberId?: string) {
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // No "get from DB" command exists — briefing is generated on demand
  const generate = useCallback(async () => {
    setGenerating(true);
    setLoading(true);
    try {
      const data = await invoke<DailyBriefing>('current_daily_briefing', {
        member_id: memberId ?? null,
      });
      setBriefing(data);
      return data;
    } catch (e) {
      console.error('Failed to generate briefing:', e);
      throw e;
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  }, [memberId]);

  return { briefing, loading, generating, generate };
}
