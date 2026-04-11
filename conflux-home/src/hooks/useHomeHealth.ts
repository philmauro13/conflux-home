// Conflux Home — Home Health Hook
import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { HomeDashboard, HomeBill, HomeInsight } from '../types';
import { useAuthContext } from '../contexts/AuthContext';

export function useHomeHealth() {
  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null);
  const [insights, setInsights] = useState<HomeInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthContext();

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const d = await invoke<HomeDashboard>('home_get_dashboard');
      setDashboard(d);
    } catch (e) { console.error('Failed:', e); }
    finally { setLoading(false); }
  }, [user?.id]);

  const loadInsights = useCallback(async () => {
    if (!user?.id) return;
    try {
      const i = await invoke<HomeInsight[]>('home_get_insights');
      setInsights(i);
    } catch (e) { console.error('Failed:', e); }
  }, [user?.id]);

  const addBill = useCallback(async (billType: string, amount: number, billingMonth: string, usage?: number, notes?: string) => {
    if (!user?.id) return;
    await invoke('home_add_bill', { userId: user.id, id: crypto.randomUUID(), billType, amount, usage: usage ?? null, billingMonth, notes: notes ?? null });
    await load();
  }, [load, user?.id]);

  const deleteBill = useCallback(async (id: string) => {
    if (!user?.id) return;
    await invoke('home_delete_bill', { userId: user.id, id });
    await load();
  }, [load, user?.id]);

  const addMaintenance = useCallback(async (task: string, category: string, intervalMonths?: number, lastCompleted?: string, estimatedCost?: number) => {
    if (!user?.id) return;
    await invoke('home_add_maintenance', {
      userId: user.id, id: crypto.randomUUID(), task, category,
      lastCompleted: lastCompleted ?? null, intervalMonths: intervalMonths ?? null,
      priority: 'normal', estimatedCost: estimatedCost ?? null, notes: null
    });
    await load();
  }, [load, user?.id]);

  const upsertProfile = useCallback(async (profile: { yearBuilt?: number; squareFeet?: number; hvacType?: string; hvacFilterSize?: string; waterHeaterType?: string; roofType?: string; windowType?: string; insulationType?: string }) => {
    if (!user?.id) return;
    await invoke('home_upsert_profile', {
      userId: user.id, id: user.id, address: null,
      yearBuilt: profile.yearBuilt ?? null, squareFeet: profile.squareFeet ?? null,
      hvacType: profile.hvacType ?? null, hvacFilterSize: profile.hvacFilterSize ?? null,
      waterHeaterType: profile.waterHeaterType ?? null, roofType: profile.roofType ?? null,
      windowType: profile.windowType ?? null, insulationType: profile.insulationType ?? null,
    });
    await load();
  }, [load, user?.id]);

  return { dashboard, insights, loading, load, loadInsights, addBill, deleteBill, addMaintenance, upsertProfile };
}
