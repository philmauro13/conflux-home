import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { WarrantyAlert } from '../types';

export function useWarrantyAlerts() {
  const [alerts, setAlerts] = useState<WarrantyAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<WarrantyAlert[]>('home_get_warranty_alerts');
      setAlerts(result);
    } catch (e) { console.error('Failed to load warranty alerts:', e); }
    finally { setLoading(false); }
  }, []);

  return { alerts, loading, load };
}
