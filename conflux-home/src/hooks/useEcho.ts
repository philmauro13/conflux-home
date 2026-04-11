import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { EchoEntry, EchoPattern, EchoDailyBrief, EchoWriteRequest } from '../types';

export function useEcho() {
  const [entries, setEntries] = useState<EchoEntry[]>([]);
  const [stats, setStats] = useState<EchoDailyBrief | null>(null);
  const [patterns, setPatterns] = useState<EchoPattern[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [e, s, p] = await Promise.all([
        invoke<EchoEntry[]>('echo_get_entries', { limit: 50, offset: 0 }),
        invoke<EchoDailyBrief>('echo_get_stats'),
        invoke<EchoPattern[]>('echo_get_patterns'),
      ]);
      setEntries(e);
      setStats(s);
      setPatterns(p);
    } catch (err) {
      console.error('Echo refresh failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const write = useCallback(async (req: EchoWriteRequest) => {
    const entry = await invoke<EchoEntry>('echo_write_entry', { req });
    setEntries(prev => [entry, ...prev]);
    refresh();
    return entry;
  }, [refresh]);

  const deleteEntry = useCallback(async (id: string) => {
    await invoke('echo_delete_entry', { id });
    setEntries(prev => prev.filter(e => e.id !== id));
    refresh();
  }, [refresh]);

  return { entries, stats, patterns, loading, write, deleteEntry, refresh };
}
