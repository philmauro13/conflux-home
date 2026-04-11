import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const DEFAULT_CREDITS: Record<string, number> = {
  free: 500,
  power: 10_000,
  pro: 30_000,
  enterprise: 100_000,
};

export interface UseSubscriptionReturn {
  plan: string;
  creditsIncluded: number;
  creditsUsed: number;
  creditsRemaining: number;
  loading: boolean;
  refresh: () => Promise<void>;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export function useSubscription(): UseSubscriptionReturn {
  const { user } = useAuth();
  const [plan, setPlan] = useState('free');
  const [creditsIncluded, setCreditsIncluded] = useState(500);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setPlan('free');
      setCreditsIncluded(DEFAULT_CREDITS.free);
      setCreditsUsed(0);
      setStripeCustomerId(null);
      setStripeSubscriptionId(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ch_subscriptions')
        .select('plan, credits_included, credits_used, stripe_customer_id, stripe_subscription_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Failed to load subscription:', error);
        // Fall back to free tier on error
        setPlan('free');
        setCreditsIncluded(DEFAULT_CREDITS.free);
        setCreditsUsed(0);
        return;
      }

      if (!data) {
        // No subscription row — treat as free tier
        setPlan('free');
        setCreditsIncluded(DEFAULT_CREDITS.free);
        setCreditsUsed(0);
        setStripeCustomerId(null);
        setStripeSubscriptionId(null);
        return;
      }

      setPlan(data.plan ?? 'free');
      setCreditsIncluded(data.credits_included ?? DEFAULT_CREDITS[data.plan] ?? 500);
      setCreditsUsed(data.credits_used ?? 0);
      setStripeCustomerId(data.stripe_customer_id ?? null);
      setStripeSubscriptionId(data.stripe_subscription_id ?? null);
    } catch (e) {
      console.error('Failed to load subscription:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const creditsRemaining = Math.max(0, creditsIncluded - creditsUsed);

  return {
    plan,
    creditsIncluded,
    creditsUsed,
    creditsRemaining,
    loading,
    refresh: load,
    stripeCustomerId,
    stripeSubscriptionId,
  };
}
