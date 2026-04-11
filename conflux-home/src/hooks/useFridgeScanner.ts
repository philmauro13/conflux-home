// Conflux Home — Fridge Scanner Hook
// Scan fridge, inventory, "what can I make", expiry alerts.

import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FridgeScanResult, MealMatchResult, KitchenInventoryItem, GroceryItem } from '../types';

export function useFridgeScanner() {
  const [scanResult, setScanResult] = useState<FridgeScanResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const scan = useCallback(async (description: string) => {
    setScanning(true);
    try {
      const result = await invoke<FridgeScanResult>('fridge_scan', { scanDescription: description });
      setScanResult(result);
      return result;
    } finally {
      setScanning(false);
    }
  }, []);

  const whatCanIMake = useCallback(async () => {
    return await invoke<MealMatchResult>('fridge_what_can_i_make');
  }, []);

  const expiringSoon = useCallback(async (days?: number) => {
    return await invoke<KitchenInventoryItem[]>('fridge_expiring_soon', { days: days ?? null });
  }, []);

  const shoppingForMeals = useCallback(async () => {
    return await invoke<GroceryItem[]>('fridge_shopping_for_meals');
  }, []);

  return { scanResult, scanning, scan, whatCanIMake, expiringSoon, shoppingForMeals };
}
