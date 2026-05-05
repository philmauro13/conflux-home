// Conflux Home — Home Health Hook
import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { HomeDashboard, HomeBill, HomeInsight, HomeProfile } from '../types';
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
    await invoke('home_add_bill', { id: crypto.randomUUID(), bill_type: billType, amount, usage: usage ?? null, billing_month: billingMonth, notes: notes ?? null });
    await load();
  }, [load, user?.id]);

  const deleteBill = useCallback(async (id: string) => {
    if (!user?.id) return;
    await invoke('home_delete_bill', { id });
    await load();
  }, [load, user?.id]);

  const addMaintenance = useCallback(async (task: string, category: string, intervalMonths?: number, lastCompleted?: string, estimatedCost?: number) => {
    if (!user?.id) return;
    await invoke('home_add_maintenance', {
      id: crypto.randomUUID(), task, category,
      last_completed: lastCompleted ?? null, interval_months: intervalMonths ?? null,
      priority: 'normal', estimated_cost: estimatedCost ?? null, notes: null
    });
    await load();
  }, [load, user?.id]);

  const upsertProfile = useCallback(async (profile: { yearBuilt?: number; squareFeet?: number; hvacType?: string; hvacFilterSize?: string; waterHeaterType?: string; roofType?: string; windowType?: string; insulationType?: string }): Promise<HomeProfile> => {
    if (!user?.id) throw new Error('No user');
    const now = new Date().toISOString();
    const result: HomeProfile = {
      id: user.id,
      address: null,
      year_built: profile.yearBuilt ?? null,
      square_feet: profile.squareFeet ?? null,
      hvac_type: profile.hvacType ?? null,
      hvac_filter_size: profile.hvacFilterSize ?? null,
      water_heater_type: profile.waterHeaterType ?? null,
      roof_type: profile.roofType ?? null,
      window_type: profile.windowType ?? null,
      insulation_type: profile.insulationType ?? null,
      created_at: now,
      updated_at: now,
    };
    await invoke('home_upsert_profile', {
      id: user.id, address: null,
      year_built: result.year_built, square_feet: result.square_feet,
      hvac_type: result.hvac_type, hvac_filter_size: result.hvac_filter_size,
      water_heater_type: result.water_heater_type, roof_type: result.roof_type,
      window_type: result.window_type, insulation_type: result.insulation_type,
    });
    await load();
    return result;
  }, [load, user?.id]);

  const setProfileData = useCallback((profile: HomeProfile) => {
    setDashboard(prev => prev ? { ...prev, profile } : null);
  }, []);

  return { dashboard, insights, loading, load, loadInsights, addBill, deleteBill, addMaintenance, upsertProfile, setProfileData };
}
