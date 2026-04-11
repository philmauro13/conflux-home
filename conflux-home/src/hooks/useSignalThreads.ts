import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SignalThread } from '../types';

export function useSignalThreads(memberId?: string) {
  const [threads, setThreads] = useState<SignalThread[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke<SignalThread[]>('current_signal_threads', {
        member_id: memberId ?? null,
      });
      setThreads(data);
    } catch (e) {
      console.error('Failed to load signal threads:', e);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (topic: string, content: string) => {
    try {
      const data = await invoke<SignalThread>('current_create_signal_thread', {
        member_id: memberId ?? null,
        topic,
        content,
      });
      setThreads(prev => [data, ...prev]);
      return data;
    } catch (e) {
      console.error('Failed to create signal thread:', e);
      throw e;
    }
  }, [memberId]);

  return { threads, loading, create, reload: load };
}
