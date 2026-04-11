import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Task {
  id: string;
  title: string;
  agent_id: string;
  status: 'pending' | 'in_progress' | 'review' | 'done';
  priority: 'critical' | 'high' | 'normal' | 'low';
  created_at: string;
  description?: string;
  verification_id?: string;
}

export interface CreateTaskReq {
  title: string;
  agent_id: string;
  priority: string;
  description?: string;
}

export interface UpdateTaskReq {
  id: string;
  status?: string;
  agent_id?: string;
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // Fetch tasks for all agents by passing empty string or null
      const result = await invoke<Task[]>('engine_get_tasks_for_agent', { agent_id: '', status: null });
      setTasks(result);
    } catch (err) {
      console.error('[useTasks] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (req: CreateTaskReq): Promise<string> => {
    const id = await invoke<string>('engine_create_task', { req });
    await refresh();
    return id;
  }, [refresh]);

  const update = useCallback(async (req: UpdateTaskReq) => {
    await invoke('engine_update_task', { req });
    await refresh();
  }, [refresh]);

  const grouped = {
    pending: tasks.filter(t => t.status === 'pending'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    review: tasks.filter(t => t.status === 'review'),
    done: tasks.filter(t => t.status === 'done'),
  };

  return { tasks, grouped, loading, refresh, create, update };
}
