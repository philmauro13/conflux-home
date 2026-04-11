// Conflux Home — Learning Tracking Hook
// Manages learning activities, progress, and goals via Tauri commands.

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { LearningActivity, LearningProgress, LearningGoal, LogActivityRequest } from '../types';

export function useLearningProgress(memberId: string | null) {
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!memberId) { setProgress(null); return; }
    try {
      setLoading(true);
      const data = await invoke<LearningProgress>('learning_get_progress', { member_id: memberId });
      setProgress(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { load(); }, [load]);

  return { progress, loading, error, reload: load };
}

export function useLearningActivities(memberId: string | null, limit: number = 50) {
  const [activities, setActivities] = useState<LearningActivity[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!memberId) { setActivities([]); return; }
    try {
      setLoading(true);
      const data = await invoke<LearningActivity[]>('learning_get_activities', { member_id: memberId, limit });
      setActivities(data);
    } catch (e) {
      console.error('Failed to load activities:', e);
    } finally {
      setLoading(false);
    }
  }, [memberId, limit]);

  useEffect(() => { load(); }, [load]);

  const log = useCallback(async (req: LogActivityRequest) => {
    await invoke('learning_log_activity', { req });
    await load();
  }, [load]);

  return { activities, loading, log, reload: load };
}

export function useLearningGoals(memberId: string | null) {
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!memberId) { setGoals([]); return; }
    try {
      setLoading(true);
      const data = await invoke<LearningGoal[]>('learning_get_goals', { member_id: memberId });
      setGoals(data);
    } catch (e) {
      console.error('Failed to load goals:', e);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (req: {
    member_id: string;
    goal_type: string;
    activity_type?: string;
    title: string;
    target_value: number;
    unit?: string;
    deadline?: string;
  }) => {
    await invoke('learning_create_goal', { req });
    await load();
  }, [load]);

  return { goals, loading, create, reload: load };
}
