// Conflux Home — Agent Status Hook
// Queries agent status data for ConfluxBarV2 badges and status panels.

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface AgentStatusInfo {
  agentId: string;
  emoji: string;
  name: string;
  statusText: string;
  badgeText?: string;
  badgeType?: 'default' | 'attention' | 'warning' | 'celebration';
  details?: string;
  actionable?: boolean;
}

export interface BudgetPatternData {
  category: string;
  pattern_type: string;
  description: string;
  avg_amount: number;
  frequency: string;
}

const timeout = (ms: number) => new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error('timeout')), ms)
);

const safeInvoke = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
  try {
    return await Promise.race([promise, timeout(1500)]);
  } catch {
    return fallback;
  }
};

export function useAgentStatus(userId: string, memberId?: string | null) {
  const [statusList, setStatusList] = useState<AgentStatusInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [patterns, setPatterns] = useState<BudgetPatternData[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<{
    totalExpenses: number;
    totalIncome: number;
  } | null>(null);

  const fetchAgentStatuses = useCallback(async () => {
    setLoading(true);

    const mid = memberId || null;
    const month = new Date().toISOString().slice(0, 7);

    // Fire all queries in parallel
    const [kitchenItems, budgetData, budgetPatterns, orbitTasks, dreamList, feedUnread, homeDashboard] = await Promise.all([
      safeInvoke(invoke<any[]>('kitchen_get_inventory', { location: null, member_id: mid }), []),
      safeInvoke(invoke<any>('budget_get_summary', { month }), null),
      safeInvoke(invoke<any[]>('budget_detect_patterns', { member_id: mid }), []),
      safeInvoke(invoke<any[]>('life_get_tasks', { user_id: userId, status: 'pending' }), []),
      safeInvoke(invoke<any[]>('dream_get_all', { user_id: userId, status: null }), []),
      safeInvoke(invoke<any[]>('feed_get_items', { user_id: userId, member_id: mid, content_type: null, unread_only: true }), []),
      safeInvoke(invoke<any>('home_get_dashboard'), null),
    ]);

    const statuses: AgentStatusInfo[] = [];

    // Hearth (Kitchen)
    const kitchenCount = kitchenItems.length;
    if (kitchenCount > 0) {
      const soon = kitchenItems.filter((i: any) => {
        if (!i.expiry_date) return false;
        const exp = new Date(i.expiry_date);
        const now = new Date();
        return exp <= new Date(now.getTime() + 3 * 86400000);
      });
      if (soon.length > 0) {
        statuses.push({
          agentId: 'hearth',
          emoji: '🍳',
          name: 'Hearth',
          statusText: `${soon.length} items expiring soon`,
          badgeText: `${soon.length}`,
          badgeType: 'attention',
          details: `${kitchenCount} items in pantry, ${soon.length} expiring within 3 days`,
          actionable: true,
        });
      } else {
        statuses.push({
          agentId: 'hearth',
          emoji: '🍳',
          name: 'Hearth',
          statusText: `${kitchenCount} items in pantry`,
          details: `Pantry stocked with ${kitchenCount} items`,
        });
      }
    } else {
      statuses.push({
        agentId: 'hearth',
        emoji: '🍳',
        name: 'Hearth',
        statusText: 'Pantry is empty — want me to help you stock it?',
        badgeType: 'default',
        actionable: true,
      });
    }

    // Pulse (Budget)
    if (budgetData) {
      const expenses = budgetData.total_expenses || 0;
      const income = budgetData.total_income || 0;
      setBudgetSummary({ totalExpenses: expenses, totalIncome: income });

      statuses.push({
        agentId: 'pulse',
        emoji: '💰',
        name: 'Pulse',
        statusText: `$${expenses.toFixed(0)} spent this month`,
        details: `Income: $${income.toFixed(0)} · Expenses: $${expenses.toFixed(0)}`,
      });
    } else {
      statuses.push({
        agentId: 'pulse',
        emoji: '💰',
        name: 'Pulse',
        statusText: 'Ready to track spending',
        badgeType: 'default',
        actionable: true,
      });
    }

    // Orbit (Life)
    const pendingCount = orbitTasks.length;
    if (pendingCount > 0) {
      statuses.push({
        agentId: 'orbit',
        emoji: '🪐',
        name: 'Orbit',
        statusText: `${pendingCount} task${pendingCount > 1 ? 's' : ''} on your plate`,
        badgeText: `${pendingCount}`,
        badgeType: pendingCount > 5 ? 'attention' : 'default',
        details: `${pendingCount} pending tasks`,
      });
    } else {
      statuses.push({
        agentId: 'orbit',
        emoji: '🪐',
        name: 'Orbit',
        statusText: 'All caught up!',
        badgeType: 'celebration',
      });
    }

    // Horizon (Dreams)
    const activeDreams = (dreamList || []).filter((d: any) => d.status === 'active' || !d.status);
    const dreamCount = activeDreams.length;
    if (dreamCount > 0) {
      statuses.push({
        agentId: 'horizon',
        emoji: '🏔️',
        name: 'Horizon',
        statusText: `${dreamCount} active goal${dreamCount > 1 ? 's' : ''}`,
        badgeText: `${dreamCount}`,
        details: `${dreamCount} active dream${dreamCount > 1 ? 's' : ''}`,
      });
    } else {
      statuses.push({
        agentId: 'horizon',
        emoji: '🏔️',
        name: 'Horizon',
        statusText: 'Ready for your next goal',
        badgeType: 'default',
        actionable: true,
      });
    }

    // Current (Feed)
    const unreadCount = (feedUnread || []).length;
    if (unreadCount > 0) {
      statuses.push({
        agentId: 'current',
        emoji: '📰',
        name: 'Current',
        statusText: `${unreadCount} unread item${unreadCount > 1 ? 's' : ''}`,
        badgeText: `${unreadCount}`,
        badgeType: unreadCount > 3 ? 'attention' : 'default',
      });
    }

    // Foundation (Home Health)
    if (homeDashboard) {
      const overdueCount = (homeDashboard.overdue_maintenance || []).length;
      const appliancesAtRisk = (homeDashboard.appliances_needing_service || []).length;
      const healthScore = homeDashboard.health_score ?? 0;

      if (overdueCount > 0) {
        statuses.push({
          agentId: 'foundation',
          emoji: '🔧',
          name: 'Foundation',
          statusText: `${overdueCount} overdue maintenance${overdueCount > 1 ? ' items' : ''}`,
          badgeText: `${overdueCount}`,
          badgeType: 'attention',
          details: `Health score: ${healthScore}/100 · ${overdueCount} overdue · ${appliancesAtRisk} appliances at risk`,
          actionable: true,
        });
      } else if (appliancesAtRisk > 0) {
        statuses.push({
          agentId: 'foundation',
          emoji: '🔧',
          name: 'Foundation',
          statusText: `${appliancesAtRisk} appliance${appliancesAtRisk > 1 ? 's' : ''} need attention`,
          badgeText: `${appliancesAtRisk}`,
          badgeType: 'warning',
          details: `Health score: ${healthScore}/100`,
          actionable: true,
        });
      } else {
        statuses.push({
          agentId: 'foundation',
          emoji: '🔧',
          name: 'Foundation',
          statusText: `Health score: ${healthScore}/100`,
          details: `All systems on track`,
        });
      }
    } else {
      statuses.push({
        agentId: 'foundation',
        emoji: '🔧',
        name: 'Foundation',
        statusText: 'Ready to monitor your home',
        badgeType: 'default',
        actionable: true,
      });
    }

    setStatusList(statuses);
    setPatterns(budgetPatterns);
    setLoading(false);
  }, [userId, memberId]);

  useEffect(() => {
    fetchAgentStatuses();
    // Refresh every 5 minutes
    const interval = setInterval(fetchAgentStatuses, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAgentStatuses]);

  return {
    statusList,
    loading,
    patterns,
    budgetSummary,
    refresh: fetchAgentStatuses,
  };
}
