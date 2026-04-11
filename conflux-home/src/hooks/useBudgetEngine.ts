import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { 
  BudgetSettings, 
  BudgetBucket, 
  BudgetAllocation, 
  BudgetTransaction,
  UpdateSettingsRequest,
  LogTransactionRequest
} from '../types';
import { useAuth } from './useAuth';

export function useBudgetEngine() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<BudgetSettings | null>(null);
  const [buckets, setBuckets] = useState<BudgetBucket[]>([]);
  const [allocations, setAllocations] = useState<BudgetAllocation[]>([]);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const resolvedMemberId = useMemo(
    () => user ? user.id : null,
    [user]
  );

  // ── Fetchers ──

  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[useBudgetEngine] Loading for member:', resolvedMemberId);
      const [s, b, a, t] = await Promise.all([
        invoke<BudgetSettings | null>('budget_get_settings', { member_id: resolvedMemberId }),
        invoke<BudgetBucket[]>('budget_get_buckets', { member_id: resolvedMemberId }),
        invoke<BudgetAllocation[]>('budget_get_allocations', { member_id: resolvedMemberId }),
        invoke<BudgetTransaction[]>('budget_get_transactions', { member_id: resolvedMemberId }),
      ]);
      console.log('[useBudgetEngine] RAW settings:', JSON.stringify(s));
      console.log('[useBudgetEngine] RAW buckets:', JSON.stringify(b));
      console.log('[useBudgetEngine] Loaded:', s ? 'settings' : 'no settings', b.length, 'buckets', a.length, 'allocations', t.length, 'transactions');
      setSettings(s);
      setBuckets(b);
      setAllocations(a);
      setTransactions(t);
    } catch (err) {
      console.error('[useBudgetEngine] Failed to load:', err);
      console.error('[useBudgetEngine] member_id was:', resolvedMemberId);
    } finally {
      setLoading(false);
    }
  }, [resolvedMemberId]);

  useEffect(() => { refreshData(); }, [refreshData]);

  // ── Actions ──

  const updateSettings = useCallback(async (req: UpdateSettingsRequest) => {
    console.log('🔧 Hook: updateSettings called with:', req);
    try {
      const result = await invoke('budget_update_settings', { req, member_id: resolvedMemberId });
      console.log('🔧 Hook: budget_update_settings result:', result);
      await refreshData();
    } catch (err) {
      console.error('🔧 Hook: budget_update_settings failed:', err);
      throw err;
    }
  }, [refreshData, resolvedMemberId]);

  const logTransaction = useCallback(async (req: LogTransactionRequest) => {
    await invoke('budget_log_transaction', { req, member_id: resolvedMemberId });
    await refreshData();
  }, [refreshData, resolvedMemberId]);

  const updateAllocation = useCallback(async (bucketId: string, payPeriodId: string, amount: number) => {
    await invoke('budget_update_allocation', { req: { bucket_id: bucketId, pay_period_id: payPeriodId, amount }, member_id: resolvedMemberId });
    await refreshData();
  }, [refreshData, resolvedMemberId]);

  const createBucket = useCallback(async (bucket: { name: string; icon: string; monthly_goal: number; color: string }) => {
    await invoke('budget_create_bucket', { 
      req: {
        name: bucket.name, 
        icon: bucket.icon, 
        monthly_goal: bucket.monthly_goal, 
        color: bucket.color,
      },
      member_id: resolvedMemberId
    });
    await refreshData();
  }, [refreshData, resolvedMemberId]);

  return {
    settings,
    buckets,
    allocations,
    transactions,
    loading,
    updateSettings,
    logTransaction,
    updateAllocation,
    createBucket,
    refreshData,
  };
}
