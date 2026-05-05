// Conflux Home — Kitchen Hook
// Manages meals, weekly plans, and grocery lists via Tauri commands.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Meal, MealWithIngredients, WeeklyPlan, GroceryItem } from '../types';
import { useAuth } from './useAuth';

export function useMeals(category?: string, cuisine?: string, favoritesOnly = false) {
  const { user } = useAuth();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  const memberId = useMemo(() => user?.id ?? null, [user]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke<Meal[]>('kitchen_get_meals', {
        category: category ?? null,
        cuisine: cuisine ?? null,
        favoritesOnly,
        member_id: memberId,
      });
      console.log('[useMeals] load() returned', data.length, 'meals, memberId:', memberId);
      setMeals(data);
    } catch (e) {
      console.error('Failed to load meals:', e);
    } finally {
      setLoading(false);
    }
  }, [category, cuisine, favoritesOnly, memberId]);

  useEffect(() => { load(); }, [load]);

  const addWithAI = useCallback(async (description: string) => {
    console.log('[useMeals] addWithAI called, memberId:', memberId);
    const result = await invoke<MealWithIngredients>('kitchen_ai_add_meal', { description, member_id: memberId });
    console.log('[useMeals] addWithAI result.meal:', result?.meal?.name ?? 'NULL/UNDEFINED');
    setMeals(prev => [result.meal, ...prev]);
    return result;
  }, [memberId]);

  const toggleFavorite = useCallback(async (id: string) => {
    await invoke('kitchen_toggle_favorite', { id, member_id: memberId });
    setMeals(prev => prev.map(m => m.id === id ? { ...m, is_favorite: !m.is_favorite } : m));
  }, [memberId]);

  return { meals, loading, addWithAI, toggleFavorite, reload: load, setMeals };
}

export function useMealDetail(mealId: string | null) {
  const { user } = useAuth();
  const [meal, setMeal] = useState<MealWithIngredients | null>(null);
  const [loading, setLoading] = useState(false);
  const memberId = useMemo(() => user?.id ?? null, [user]);

  const load = useCallback(async () => {
    if (!mealId) { setMeal(null); return; }
    try {
      setLoading(true);
      const data = await invoke<MealWithIngredients | null>('kitchen_get_meal', { id: mealId, member_id: memberId });
      setMeal(data);
    } catch (e) {
      console.error('Failed to load meal:', e);
    } finally {
      setLoading(false);
    }
  }, [mealId, memberId]);

  useEffect(() => { load(); }, [load]);

  return { meal, loading, reload: load };
}

export function useWeeklyPlan(weekStart: string) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const memberId = useMemo(() => user?.id ?? null, [user]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke<WeeklyPlan>('kitchen_get_weekly_plan', { weekStart, member_id: memberId });
      setPlan(data);
    } catch (e) {
      console.error('Failed to load weekly plan:', e);
    } finally {
      setLoading(false);
    }
  }, [weekStart, memberId]);

  useEffect(() => { load(); }, [load]);

  const setEntry = useCallback(async (dayOfWeek: number, mealSlot: string, mealId: string | null, notes?: string) => {
    await invoke('kitchen_set_plan_entry', {
      req: { week_start: weekStart, day_of_week: dayOfWeek, meal_slot: mealSlot, meal_id: mealId, notes: notes ?? null },
      member_id: memberId,
    });
    await load();
  }, [weekStart, load, memberId]);

  const clearWeek = useCallback(async () => {
    await invoke('kitchen_clear_week_plan', { weekStart, member_id: memberId });
    await load();
  }, [weekStart, load, memberId]);

  return { plan, loading, setEntry, clearWeek, reload: load };
}

export function useGroceryList(weekStart: string) {
  const { user } = useAuth();
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const memberId = useMemo(() => user?.id ?? null, [user]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke<GroceryItem[]>('kitchen_get_grocery', { weekStart, member_id: memberId });
      setItems(data);
    } catch (e) {
      console.error('Failed to load grocery list:', e);
    } finally {
      setLoading(false);
    }
  }, [weekStart, memberId]);

  useEffect(() => { load(); }, [load]);

  const generate = useCallback(async () => {
    const data = await invoke<GroceryItem[]>('kitchen_generate_grocery', { weekStart, member_id: memberId });
    setItems(data);
  }, [weekStart, memberId]);

  const toggleItem = useCallback(async (id: string) => {
    await invoke('kitchen_toggle_grocery_item', { id, member_id: memberId });
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_checked: !i.is_checked } : i));
  }, [memberId]);

  const totalCost = items.reduce((sum, i) => sum + (i.estimated_cost ?? 0), 0);

  return { items, loading, generate, toggleItem, totalCost, reload: load };
}
