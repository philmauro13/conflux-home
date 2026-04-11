// Conflux Home — Budget NLP Parser & Rollover Engine
import type { BudgetBucket, BudgetTransaction } from '../types';

export interface ParsedAction {
  type: 'allocation' | 'transaction';
  bucketId: string;
  amount: number;
  period?: 'p1' | 'p2';
  date?: string;
}

export function parseBudgetCommand(input: string, buckets: BudgetBucket[]): ParsedAction | null {
  const lower = input.toLowerCase();
  
  // 1. Identify the Bucket
  const bucket = buckets.find(b => lower.includes(b.name.toLowerCase()));
  if (!bucket) return null;

  // 2. Identify the Amount
  const amountMatch = input.match(/\$?(\d+(\.\d{1,2})?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

  // 3. Identify the Period
  const isP1 = lower.includes('p1') || lower.includes('first pay') || lower.includes('period 1');
  const isP2 = lower.includes('p2') || lower.includes('second pay') || lower.includes('period 2');
  const period = isP1 ? 'p1' : isP2 ? 'p2' : undefined;

  // 4. Identify the Intent
  if (lower.includes('paid') || lower.includes('settled') || lower.includes('spent')) {
    return { type: 'transaction', bucketId: bucket.id, amount, date: new Date().toISOString(), period };
  }
  
  if (lower.includes('alloc') || lower.includes('put') || lower.includes('set')) {
    return { type: 'allocation', bucketId: bucket.id, amount, period };
  }

  return null;
}

export function calculateRollover(
  bucket: BudgetBucket, 
  allocatedP1: number, 
  paidP1: number, 
  allocatedP2: number
) {
  const shortfallP1 = Math.max(0, allocatedP1 - paidP1);
  const suggestedP2 = allocatedP2 + shortfallP1;
  
  return {
    shortfall: shortfallP1,
    suggestedP2,
    isRollover: shortfallP1 > 0,
  };
}

export function calculateSafeToSpend(
  income: number, 
  allocations: { p1: number; p2: number }[], 
  rollovers: number[]
) {
  const totalAllocated = allocations.reduce((sum, a) => sum + a.p1 + a.p2, 0);
  const totalRollovers = rollovers.reduce((sum, r) => sum + r, 0);
  return Math.max(0, income - totalAllocated - totalRollovers);
}
