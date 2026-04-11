// Conflux Home — Life Autopilot Hook
// Documents, reminders, knowledge base, AI analysis.

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LifeDocument, LifeReminder, LifeKnowledge, LifeAutopilotDashboard } from '../types';

export function useLifeAutopilot() {
  const [dashboard, setDashboard] = useState<LifeAutopilotDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke<LifeAutopilotDashboard>('life_get_dashboard');
      setDashboard(data);
    } catch (e) {
      console.error('Failed to load life dashboard:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const analyzeDocument = useCallback(async (text: string, docType?: string) => {
    const result = await invoke<LifeDocument>('life_analyze_document', {
      text,
      docType: docType ?? null,
    });
    await load();
    return result;
  }, [load]);

  const askQuestion = useCallback(async (question: string) => {
    return await invoke<string>('life_ask', { question });
  }, []);

  const addReminder = useCallback(async (title: string, dueDate: string, description?: string, priority?: string) => {
    await invoke('life_add_reminder', {
      member_id: null,
      title,
      description: description ?? null,
      due_date: dueDate,
      priority: priority ?? 'normal',
    });
    await load();
  }, [load]);

  return { dashboard, loading, analyzeDocument, askQuestion, addReminder, reload: load };
}
