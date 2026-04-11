import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CognitivePattern } from '../types';

export function useCognitivePatterns(memberId?: string) {
  const [pattern, setPattern] = useState<CognitivePattern | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = useCallback(async (timeRange?: string) => {
    try {
      setLoading(true);
      const data = await invoke<CognitivePattern>('current_cognitive_patterns', {
        memberId: memberId ?? null,
        timeRange: timeRange ?? null,
      });
      setPattern(data);
      return data;
    } catch (e) {
      console.error('Failed to analyze cognitive patterns:', e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  return { pattern, loading, analyze };
}
