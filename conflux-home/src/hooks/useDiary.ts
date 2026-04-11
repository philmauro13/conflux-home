// Conflux Home — Agent Diary Hook
import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DiaryEntry, DiaryDashboard } from '../types';

export function useDiary() {
  const [dashboard, setDashboard] = useState<DiaryDashboard | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const d = await invoke<DiaryDashboard>('diary_get_dashboard');
      setDashboard(d);
    } catch (e) { console.error('Failed:', e); }
    finally { setLoading(false); }
  }, []);

  const loadEntries = useCallback(async (agentId: string, limit?: number) => {
    try {
      const e = await invoke<DiaryEntry[]>('diary_get_entries', { agentId, limit: limit ?? 20 });
      setEntries(e);
    } catch (e) { console.error('Failed:', e); }
  }, []);

  const loadAllEntries = useCallback(async (limit?: number) => {
    try {
      const e = await invoke<DiaryEntry[]>('diary_get_all_entries', { limit: limit ?? 50 });
      setEntries(e);
    } catch (e) { console.error('Failed:', e); }
  }, []);

  const loadToday = useCallback(async () => {
    try {
      const e = await invoke<DiaryEntry[]>('diary_get_today');
      setEntries(e);
    } catch (e) { console.error('Failed:', e); }
  }, []);

  const generateEntry = useCallback(async (agentId: string) => {
    const entry = await invoke<DiaryEntry>('diary_generate_entry', { agentId });
    await loadDashboard();
    return entry;
  }, [loadDashboard]);

  return { dashboard, entries, loading, loadDashboard, loadEntries, loadAllEntries, loadToday, generateEntry };
}
