import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SeasonalTask } from '../types';

export function useSeasonalTasks() {
  const [tasks, setTasks] = useState<SeasonalTask[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (month?: number) => {
    setLoading(true);
    try {
      const result = await invoke<SeasonalTask[]>('home_get_seasonal_tasks', { month: month ?? null });
      setTasks(result);
    } catch (e) { console.error('Failed to load seasonal tasks:', e); }
    finally { setLoading(false); }
  }, []);

  const complete = useCallback(async (taskId: string) => {
    try {
      await invoke('home_complete_seasonal_task', { taskId });
      // Reload to reflect completion
      await load();
    } catch (e) { console.error('Failed to complete seasonal task:', e); }
  }, [load]);

  return { tasks, loading, load, complete };
}
