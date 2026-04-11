import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { HomeDiagnosis } from '../types';
import { useAuthContext } from '../contexts/AuthContext';

export function useHomeDiagnosis() {
  const [diagnosis, setDiagnosis] = useState<HomeDiagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthContext();

  const diagnose = useCallback(async (symptom: string) => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<HomeDiagnosis>('home_diagnose_problem', { user_id: user.id, symptom });
      setDiagnosis(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const logProblem = useCallback(async (description: string) => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<HomeDiagnosis>('home_log_problem_natural', { user_id: user.id, description });
      setDiagnosis(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  return { diagnosis, loading, error, diagnose, logProblem };
}
