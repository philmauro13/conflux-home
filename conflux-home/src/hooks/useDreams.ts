// Conflux Home — Dream Builder Hook (Horizon)
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Dream, DreamMilestone, DreamTask, DreamProgress, DreamDashboard, DreamVelocity, DreamTimeline } from '../types';
import { useAuthContext } from '../contexts/AuthContext';

export function useDreams() {
  const { user } = useAuthContext();
  const user_id = user?.id || '';
  const [dashboard, setDashboard] = useState<DreamDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user_id) return;
    try {
      setLoading(true);
      const d = await invoke<DreamDashboard>('dream_get_dashboard', { user_id });
      setDashboard(d);
    } catch (e) { console.error('Failed:', e); }
    finally { setLoading(false); }
  }, [user_id]);

  useEffect(() => { load(); }, [load]);

  const addDream = useCallback(async (id: string, title: string, description: string | null, category: string, targetDate: string | null, member_id?: string): Promise<Dream> => {
    await invoke('dream_add', { user_id, id, member_id: member_id ?? null, title, description, category, target_date: targetDate });
    await load();
    return {
      id,
      member_id: member_id ?? null,
      title,
      description,
      category,
      target_date: targetDate,
      status: 'active',
      progress: 0,
      ai_plan: null,
      ai_next_actions: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }, [user_id, load]);

  const deleteDream = useCallback(async (id: string) => {
    await invoke('dream_delete', { user_id, id });
    await load();
  }, [user_id, load]);

  const updateDream = useCallback(async (id: string, title: string, description: string | null, category: string, targetDate: string | null) => {
    await invoke('dream_update', { user_id, id, title, description, category, target_date: targetDate });
    await load();
  }, [user_id, load]);

  const getMilestones = useCallback(async (dream_id: string): Promise<DreamMilestone[]> => {
    return await invoke<DreamMilestone[]>('dream_get_milestones', { user_id, dream_id });
  }, [user_id]);

  const addMilestone = useCallback(async (dream_id: string, title: string, description: string | null, targetDate: string | null, sortOrder: number) => {
    const id = crypto.randomUUID();
    await invoke('dream_add_milestone', { user_id, id, dream_id, title, description, target_date: targetDate, sort_order: sortOrder });
    await load();
  }, [user_id, load]);

  const completeMilestone = useCallback(async (id: string) => {
    await invoke('dream_complete_milestone', { user_id, id });
    await load();
  }, [user_id, load]);

  const addTask = useCallback(async (dream_id: string, milestone_id: string | null, title: string, description: string | null, dueDate: string | null, frequency: string | null) => {
    const id = crypto.randomUUID();
    await invoke('dream_add_task', { user_id, id, dream_id, milestone_id, title, description, due_date: dueDate, frequency });
    await load();
  }, [user_id, load]);

  const completeTask = useCallback(async (id: string) => {
    await invoke('dream_complete_task', { user_id, id });
    await load();
  }, [user_id, load]);

  const addProgress = useCallback(async (dream_id: string, note: string | null, progressChange: number | null, aiInsight: string | null) => {
    const id = crypto.randomUUID();
    await invoke('dream_add_progress', { user_id, id, dream_id, note, progress_change: progressChange, ai_insight: aiInsight });
    await load();
  }, [user_id, load]);

  // Horizon extensions
  const getVelocity = useCallback(async (dream_id: string) => {
    return await invoke<DreamVelocity>('dream_get_velocity', { user_id, dream_id });
  }, [user_id]);

  const getTimeline = useCallback(async (dream_id: string) => {
    return await invoke<DreamTimeline>('dream_get_timeline', { user_id, dream_id });
  }, [user_id]);

  const updateProgressManual = useCallback(async (dream_id: string, progressPct: number) => {
    await invoke('dream_update_progress_manual', { user_id, dream_id, progress_pct: progressPct / 100 });
    await load();
  }, [user_id, load]);

  const narrate = useCallback(async (dream_id: string) => {
    return await invoke<string>('dream_ai_narrate', { user_id, dream_id });
  }, [user_id]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiPlan = useCallback(async (dream_id: string, title: string, description: string | null, category: string, target_date: string | null) => {
    await invoke<any>('dream_ai_plan', { user_id, dream_id, title, description, category, target_date });
    await load();
  }, [user_id, load]);

  const prependDream = useCallback((dream: Dream) => {
    setDashboard(prev => prev ? { ...prev, dreams: [dream, ...prev.dreams], active_dreams: prev.active_dreams + 1 } : null);
  }, []);

  return {
    dashboard, loading, load,
    addDream, deleteDream, updateDream, prependDream,
    addMilestone, completeMilestone, getMilestones,
    addTask, completeTask,
    addProgress,
    getVelocity, getTimeline, updateProgressManual, narrate, aiPlan,
  };
}
