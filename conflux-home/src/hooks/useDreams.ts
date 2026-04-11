// Conflux Home — Dream Builder Hook (Horizon)
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Dream, DreamMilestone, DreamTask, DreamProgress, DreamDashboard, DreamVelocity, DreamTimeline } from '../types';
import { useAuthContext } from '../contexts/AuthContext';

export function useDreams() {
  const { user } = useAuthContext();
  const userId = user?.id || '';
  const [dashboard, setDashboard] = useState<DreamDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const d = await invoke<DreamDashboard>('dream_get_dashboard', { userId });
      setDashboard(d);
    } catch (e) { console.error('Failed:', e); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const addDream = useCallback(async (id: string, title: string, description: string | null, category: string, targetDate: string | null, memberId?: string) => {
    await invoke('dream_add', { userId, id, member_id: memberId ?? null, title, description, category, targetDate });
    await load();
  }, [userId, load]);

  const deleteDream = useCallback(async (id: string) => {
    await invoke('dream_delete', { userId, id });
    await load();
  }, [userId, load]);

  const addMilestone = useCallback(async (dreamId: string, title: string, description: string | null, targetDate: string | null, sortOrder: number) => {
    const id = crypto.randomUUID();
    await invoke('dream_add_milestone', { userId, id, dreamId, title, description, targetDate, sortOrder });
    await load();
  }, [userId, load]);

  const completeMilestone = useCallback(async (id: string) => {
    await invoke('dream_complete_milestone', { userId, id });
    await load();
  }, [userId, load]);

  const addTask = useCallback(async (dreamId: string, milestoneId: string | null, title: string, description: string | null, dueDate: string | null, frequency: string | null) => {
    const id = crypto.randomUUID();
    await invoke('dream_add_task', { userId, id, dreamId, milestoneId, title, description, dueDate, frequency });
    await load();
  }, [userId, load]);

  const completeTask = useCallback(async (id: string) => {
    await invoke('dream_complete_task', { userId, id });
    await load();
  }, [userId, load]);

  const addProgress = useCallback(async (dreamId: string, note: string | null, progressChange: number | null, aiInsight: string | null) => {
    const id = crypto.randomUUID();
    await invoke('dream_add_progress', { userId, id, dreamId, note, progressChange, aiInsight });
    await load();
  }, [userId, load]);

  // Horizon extensions
  const getVelocity = useCallback(async (dreamId: string) => {
    return await invoke<DreamVelocity>('dream_get_velocity', { userId, dreamId });
  }, [userId]);

  const getTimeline = useCallback(async (dreamId: string) => {
    return await invoke<DreamTimeline>('dream_get_timeline', { userId, dreamId });
  }, [userId]);

  const updateProgressManual = useCallback(async (dreamId: string, progressPct: number) => {
    await invoke('dream_update_progress_manual', { userId, dreamId, progressPct: progressPct / 100 });
    await load();
  }, [userId, load]);

  const narrate = useCallback(async (dreamId: string) => {
    return await invoke<string>('dream_ai_narrate', { userId, dreamId });
  }, [userId]);

  return {
    dashboard, loading, load,
    addDream, deleteDream,
    addMilestone, completeMilestone,
    addTask, completeTask,
    addProgress,
    getVelocity, getTimeline, updateProgressManual, narrate,
  };
}
