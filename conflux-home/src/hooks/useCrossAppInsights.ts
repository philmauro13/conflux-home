import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAuthContext } from '../contexts/AuthContext';

export interface OrbitInsight {
  id: string;
  title: string;
  message: string;
  icon: string;
  source_apps: string[];
  confidence: number;
  action_suggestion?: string;
  priority: string;
  created_at: string;
}

export interface OrbitInsights {
  insights: OrbitInsight[];
}

export function useCrossAppInsights() {
  const { user } = useAuthContext();
  const userId = user?.id || '';
  const [insights, setInsights] = useState<OrbitInsight[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInsights = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const data = await invoke<OrbitInsights>('orbit_get_cross_app_insights', {
        userId,
      });
      setInsights(data.insights ?? []);
    } catch (e) {
      console.error('Failed to load cross-app insights:', e);
      setInsights([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  return { insights, loading, reload: loadInsights };
}
