import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { HomeMenuItem, PantryHeatItem, CookingStep, KitchenDigest, KitchenNudge, MealPhoto } from '../types';

export function useHomeMenu() {
  const [menu, setMenu] = useState<HomeMenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const items = await invoke<HomeMenuItem[]>('kitchen_home_menu');
      setMenu(items);
    } catch (e) { console.error('Failed:', e); }
    finally { setLoading(false); }
  }, []);

  return { menu, loading, load };
}

export function useCookingMode(mealId: string | null) {
  const [steps, setSteps] = useState<CookingStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadSteps = useCallback(async () => {
    if (!mealId) return;
    try {
      setLoading(true);
      const s = await invoke<CookingStep[]>('kitchen_get_cooking_steps', { meal_id: mealId, member_id: null });
      setSteps(s);
      setCurrentStep(0);
    } catch (e) { console.error('Failed:', e); }
    finally { setLoading(false); }
  }, [mealId]);

  const nextStep = useCallback(() => setCurrentStep(c => Math.min(c + 1, steps.length - 1)), [steps.length]);
  const prevStep = useCallback(() => setCurrentStep(c => Math.max(c - 1, 0)), []);

  return { steps, currentStep, loading, loadSteps, nextStep, prevStep };
}

export function useKitchenDigest(weekStart: string) {
  const [digest, setDigest] = useState<KitchenDigest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const d = await invoke<KitchenDigest>('kitchen_weekly_digest', { week_start: weekStart, member_id: null });
      setDigest(d);
    } catch (e) { console.error('Failed:', e); }
    finally { setLoading(false); }
  }, [weekStart]);

  return { digest, loading, load };
}

export function useKitchenNudges() {
  const [nudges, setNudges] = useState<KitchenNudge[]>([]);

  const load = useCallback(async () => {
    try {
      const n = await invoke<KitchenNudge[]>('kitchen_get_nudges');
      setNudges(n);
    } catch (e) { console.error('Failed:', e); }
  }, []);

  return { nudges, load };
}

export function useMealPhotos(mealId: string | null) {
  const [photos, setPhotos] = useState<MealPhoto[]>([]);

  const load = useCallback(async () => {
    if (!mealId) return;
    try {
      const p = await invoke<MealPhoto[]>('kitchen_get_meal_photos', { meal_id: mealId, member_id: null });
      setPhotos(p);
    } catch (e) { console.error('Failed:', e); }
  }, [mealId]);

  const upload = useCallback(async (photoUrl: string, caption?: string) => {
    if (!mealId) return;
    try {
      await invoke('kitchen_upload_meal_photo', { meal_id: mealId, photo_url: photoUrl, caption: caption ?? null, member_id: null });
      await load();
    } catch (e) { console.error('Failed:', e); }
  }, [mealId, load]);

  return { photos, load, upload };
}
