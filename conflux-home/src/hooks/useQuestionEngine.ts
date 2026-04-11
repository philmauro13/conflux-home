import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { QuestionResult } from '../types';

export function useQuestionEngine(memberId?: string) {
  const [result, setResult] = useState<QuestionResult | null>(null);
  const [history, setHistory] = useState<QuestionResult[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke<QuestionResult[]>('current_get_questions', {
        member_id: memberId ?? null,
      });
      setHistory(data);
      if (data.length > 0) {
        setResult(data[0]);
      }
    } catch (e) {
      console.error('Failed to load question history:', e);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const ask = useCallback(async (question: string) => {
    try {
      const data = await invoke<QuestionResult>('current_ask', {
        member_id: memberId ?? null,
        question,
      });
      setResult(data);
      setHistory(prev => [data, ...prev]);
      return data;
    } catch (e) {
      console.error('Failed to ask question:', e);
      throw e;
    }
  }, [memberId]);

  return { result, history, loading, ask };
}
