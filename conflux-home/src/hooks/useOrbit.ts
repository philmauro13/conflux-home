import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { OrbitDashboard, LifeSchedule } from '../types';
import { useAuthContext } from '../contexts/AuthContext';

export function useOrbit() {
  const { user } = useAuthContext();
  const user_id = user?.id || '';
  const [dashboard, setDashboard] = useState<OrbitDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    if (!user_id) return;
    try {
      setLoading(true);
      const d = await invoke<OrbitDashboard>('life_get_orbit_dashboard', { user_id });
      setDashboard(d);
    } catch (e) {
      console.error('Failed:', e);
    } finally {
      setLoading(false);
    }
  }, [user_id]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const addTask = useCallback(
    async (title: string, category?: string, priority?: string, dueDate?: string, energyType?: string) => {
      await invoke('life_add_task', {
        user_id,
        title,
        category: category ?? null,
        priority: priority ?? null,
        due_date: dueDate ?? null,
        energy_type: energyType ?? null,
      });
      await loadDashboard();
    },
    [user_id, loadDashboard]
  );

  const completeTask = useCallback(
    async (task_id: string) => {
      await invoke('life_complete_task', { user_id, task_id });
      await loadDashboard();
    },
    [user_id, loadDashboard]
  );

  const deleteTask = useCallback(
    async (task_id: string) => {
      await invoke('life_delete_task', { user_id, task_id });
      await loadDashboard();
    },
    [user_id, loadDashboard]
  );

  const addHabit = useCallback(
    async (name: string, category?: string, frequency?: string, targetCount?: number) => {
      await invoke('life_add_habit', {
        user_id,
        name,
        category: category ?? null,
        frequency: frequency ?? null,
        target_count: targetCount ?? null,
      });
      await loadDashboard();
    },
    [user_id, loadDashboard]
  );

  const logHabit = useCallback(
    async (habitId: string) => {
      await invoke('life_log_habit', { user_id, habit_id: habitId });
      await loadDashboard();
    },
    [user_id, loadDashboard]
  );

  const addFocus = useCallback(
    async (task_id: string, position?: number) => {
      await invoke('life_add_daily_focus', { user_id, task_id, position: position ?? null });
      await loadDashboard();
    },
    [user_id, loadDashboard]
  );

  const morningBrief = useCallback(async () => {
    return await invoke<string>('life_morning_brief', { user_id });
  }, [user_id]);

  const smartReschedule = useCallback(async (task_id: string) => {
    return await invoke<LifeSchedule>('life_smart_reschedule', { task_id });
  }, []);

  const parseInput = useCallback(async (input: string) => {
    return await invoke<{
      action: string;
      title: string;
      due_date?: string;
      priority?: string;
      category?: string;
      energy_type?: string;
      parsed: boolean;
    }>('life_parse_input', { input });
  }, []);

  const dismissNudge = useCallback(
    async (nudgeId: string) => {
      await invoke('life_dismiss_nudge', { user_id, nudgeId });
      await loadDashboard();
    },
    [user_id, loadDashboard]
  );

  return {
    dashboard,
    loading,
    loadDashboard,
    addTask,
    completeTask,
    deleteTask,
    addHabit,
    logHabit,
    addFocus,
    morningBrief,
    smartReschedule,
    parseInput,
    dismissNudge,
  };
}
