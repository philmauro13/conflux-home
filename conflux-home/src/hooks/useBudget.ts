import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { BudgetEntry, BudgetSummary, BudgetGoal, BudgetPattern, MonthlyReport } from '../types';
import { useAuth } from './useAuth';

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function useBudget(memberId?: string) {
  const { user } = useAuth();
  const [period, setPeriod] = useState(getCurrentMonth);
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [goals, setGoals] = useState<BudgetGoal[]>([]);
  const [patterns, setPatterns] = useState<BudgetPattern[]>([]);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);

  // Resolve auth-wired user ID, falling back to explicit memberId or null
  const resolvedMemberId = useMemo(
    () => memberId || (user ? user.id : null),
    [memberId, user]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[useBudget] Loading data for member:', resolvedMemberId);
      const [e, s, g, p] = await Promise.all([
        invoke<BudgetEntry[]>('budget_get_entries', { member_id: resolvedMemberId, month: period }),
        invoke<BudgetSummary>('budget_get_summary', { member_id: resolvedMemberId, month: period }),
        invoke<BudgetGoal[]>('budget_get_goals', { member_id: resolvedMemberId }),
        invoke<BudgetPattern[]>('budget_detect_patterns', { member_id: resolvedMemberId }),
      ]);
      console.log('[useBudget] Loaded entries:', e.length);
      setEntries(e);
      setSummary(s);
      setGoals(g);
      setPatterns(p);
    } catch (e) {
      console.error('Failed to load budget:', e);
    } finally {
      setLoading(false);
    }
  }, [resolvedMemberId, period]);

  useEffect(() => { load(); }, [load]);

  const addEntry = useCallback(async (req: {
    member_id?: string;
    entry_type: string;
    category: string;
    amount: number;
    description?: string;
    recurring?: boolean;
    frequency?: string;
    date: string;
  }) => {
    await invoke('budget_add_entry', {
      req: { ...req, member_id: req.member_id ?? resolvedMemberId, description: req.description ?? null, recurring: req.recurring ?? false, frequency: req.frequency ?? null },
    });
    await load();
  }, [load, resolvedMemberId]);

  const deleteEntry = useCallback(async (id: string) => {
    await invoke('budget_delete_entry', { id });
    await load();
  }, [load]);

  // Natural language entry
  const parseNatural = useCallback(async (input: string) => {
    return await invoke<{ entry_type: string; category: string; amount: number; description: string }>('budget_parse_natural', { input });
  }, []);

  // Goals CRUD
  const createGoal = useCallback(async (name: string, targetAmount: number, deadline?: string, monthlyAllocation?: number) => {
    await invoke('budget_create_goal', { name, target_amount: targetAmount, deadline: deadline ?? null, monthly_allocation: monthlyAllocation ?? null, member_id: resolvedMemberId });
    await load();
  }, [resolvedMemberId, load]);

  const updateGoal = useCallback(async (id: string, currentAmount: number) => {
    await invoke('budget_update_goal', { id, current_amount: currentAmount });
    await load();
  }, [load]);

  const deleteGoal = useCallback(async (id: string) => {
    await invoke('budget_delete_goal', { id });
    await load();
  }, [load]);

  // Monthly report
  const generateReport = useCallback(async () => {
    const r = await invoke<MonthlyReport>('budget_generate_report', { month: period });
    setReport(r);
    return r;
  }, [period]);

  // Affordability check
  const canAfford = useCallback(async (amount: number) => {
    return await invoke<boolean>('budget_can_afford', { amount, month: period });
  }, [period]);

  const prevPeriod = useCallback(() => {
    setPeriod(m => {
      const [y, mo] = m.split('-').map(Number);
      const d = new Date(y, mo - 2, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  const nextPeriod = useCallback(() => {
    setPeriod(m => {
      const [y, mo] = m.split('-').map(Number);
      const d = new Date(y, mo, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  return {
    entries, summary, period, loading, goals, patterns, report,
    addEntry, deleteEntry, prevPeriod, nextPeriod, reload: load,
    parseNatural, createGoal, updateGoal, deleteGoal, generateReport, canAfford,
  };
}
