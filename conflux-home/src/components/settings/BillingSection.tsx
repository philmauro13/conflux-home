import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { onOpenUrl, getCurrent } from '@tauri-apps/plugin-deep-link';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCredits } from '../../hooks/useCredits';

// ── Credit Packs ──

const CREDIT_PACKS = [
  { id: 's', label: '$5', credits: 1500 },
  { id: 'm', label: '$10', credits: 3200 },
  { id: 'l', label: '$20', credits: 7000 },
  { id: 'xl', label: '$50', credits: 18000 },
] as const;

// ── Types ──

interface StripePrice {
  id: string;
  plan: string;
  amount: number;
  interval: string;
  currency: string;
  display_price: string;
}

interface StripeSubscription {
  id: string;
  status: string;
  plan: string;
  price_id: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

interface SubscriptionRow {
  user_id: string;
  plan: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  credits_included: number;
  credits_used: number;
}

// ── Plan metadata ──

const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    '500 credits / month',
    'Standard agent access',
    'Community support',
    'Basic integrations',
  ],
  power: [
    '10,000 credits / month',
    'Priority agent access',
    'Email support',
    'Advanced integrations',
  ],
  pro: [
    '30,000 credits / month',
    'Premium agent access',
    'Priority support',
    'All integrations + API access',
  ],
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  power: 'Power',
  pro: 'Pro',
};

const PLAN_CREDIT_LIMITS: Record<string, number> = {
  free: 500,
  power: 10000,
  pro: 30000,
};

// ── Component ──

export default function BillingSection() {
  const { user, loading: authLoading } = useAuth();
  const { balance: creditBalance, refresh: refreshCredits } = useCredits();

  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [stripeSub, setStripeSub] = useState<StripeSubscription | null>(null);
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [billingCycle, setBillingCycle] = useState<'month' | 'year'>('month');
  const [loadingSub, setLoadingSub] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Fetch subscription from Supabase ──
  const fetchSubscription = useCallback(async (userId: string) => {
    setLoadingSub(true);
    try {
      const { data, error } = await supabase
        .from('ch_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching subscription:', error);
        setSubscription(null);
        return;
      }

      if (!data) {
        setSubscription(null);
        setStripeSub(null);
        return;
      }

      setSubscription(data as SubscriptionRow);

      // Fetch Stripe subscription details if we have a subscription ID
      if (data.stripe_subscription_id) {
        try {
          const sub = await invoke<StripeSubscription>(
            'stripe_get_subscription',
            { stripeSubscriptionId: data.stripe_subscription_id }
          );
          setStripeSub(sub);
        } catch (err) {
          console.error('Error fetching Stripe subscription:', err);
        }
      }
    } catch (err) {
      console.error('Error fetching subscription:', err);
    } finally {
      setLoadingSub(false);
    }
  }, []);

  // ── Fetch prices from Stripe ──
  const fetchPrices = useCallback(async () => {
    setLoadingPrices(true);
    try {
      const p = await invoke<StripePrice[]>('stripe_get_prices');
      setPrices(p);
    } catch (err) {
      console.error('Error fetching prices:', err);
      // Fallback: use static price display if invoke fails
      setPrices([]);
    } finally {
      setLoadingPrices(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id) {
      fetchSubscription(user.id);
      fetchPrices();
    } else if (!authLoading) {
      setLoadingSub(false);
      setLoadingPrices(false);
    }
  }, [user, authLoading, fetchSubscription, fetchPrices]);

  // ── Deep link handler for billing redirects ──
  const handleBillingDeepLink = useCallback((url: string) => {
    if (url.includes('billing/success')) {
      console.log('Deep link received: Billing success. Refreshing subscription.');
      if (user?.id) fetchSubscription(user.id);
    } else if (url.includes('billing/cancel')) {
      console.log('Deep link received: Billing canceled. User returned to app.');
      // Optionally, show a cancellation message to the user
    } else {
      console.log('Deep link received with unhandled URL:', url);
    }
  }, [user, fetchSubscription]);

  useEffect(() => {
    const unlistenPromise = onOpenUrl((urls) => {
      if (urls && urls.length > 0) handleBillingDeepLink(urls[0]);
    });
    return () => { unlistenPromise.then(fn => fn()) };
  }, [handleBillingDeepLink]);

  useEffect(() => {
    getCurrent().then((urls) => {
      if (urls && urls.length > 0) handleBillingDeepLink(urls[0]);
    }).catch(() => {});
  }, [handleBillingDeepLink]);

  // ── Actions ──

  const handleUpgrade = async (priceId: string) => {
    if (!user?.id) return;
    setActionLoading(priceId);
    try {
      const url = await invoke<string>('stripe_create_checkout_session', {
        userId: user.id,
        priceId: priceId,
      });
      await open(url);
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!subscription?.stripe_customer_id) return;
    setActionLoading('portal');
    try {
      const url = await invoke<string>('stripe_create_portal_session', {
        stripeCustomerId: subscription.stripe_customer_id,
      });
      await open(url);
    } catch (err) {
      console.error('Portal error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePurchaseCredits = async (pack: string) => {
    if (!user?.id) return;
    setActionLoading(`credit-${pack}`);
    try {
      const url = await invoke<string>('purchase_credits', {
        userId: user.id,
        pack,
      });
      await open(url);
      refreshCredits();
    } catch (err) {
      console.error('Credit purchase error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Derived state ──

  const currentPlan = subscription?.plan || 'free';
  const creditsIncluded = subscription?.credits_included ?? PLAN_CREDIT_LIMITS.free;
  const creditsUsed = subscription?.credits_used ?? 0;
  const creditPercent = creditsIncluded > 0 ? Math.min((creditsUsed / creditsIncluded) * 100, 100) : 0;
  const resetDate = stripeSub?.current_period_end
    ? new Date(stripeSub.current_period_end).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  const isFree = currentPlan === 'free';
  const statusLabel = isFree
    ? 'Free'
    : stripeSub?.status === 'active'
      ? 'Active'
      : stripeSub?.status ?? 'Inactive';

  // Find prices per plan+interval
  const getPriceFor = (plan: string, interval: string): StripePrice | undefined =>
    prices.find((p) => p.plan === plan && p.interval === interval);

  // Static fallback prices if invoke fails
  const getDisplayPrice = (plan: string, interval: string): string => {
    const price = getPriceFor(plan, interval);
    if (price) return price.display_price;
    // Static fallback
    if (plan === 'power') return interval === 'month' ? '$24.99/mo' : '$249.99/yr';
    if (plan === 'pro') return interval === 'month' ? '$49.99/mo' : '$499.99/yr';
    return '$0';
  };

  const isLoading = authLoading || loadingSub || loadingPrices;

  // ── Render ──

  return (
    <div className="settings-section">
      <div className="settings-section-title">💳 Billing</div>

      {isLoading ? (
        <div style={{ padding: 16, textAlign: 'center', opacity: 0.6 }}>
          Loading billing info…
        </div>
      ) : (
        <>
          {/* ── Current Plan & Credits ── */}
          <div className="settings-row">
            <span className="settings-label">Current Plan</span>
            <div className="settings-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{PLAN_LABELS[currentPlan] || 'Free'}</span>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: isFree ? 'var(--bg-muted, rgba(255,255,255,0.08))' : 'rgba(34,197,94,0.15)',
                  color: isFree ? 'var(--text-muted, #888)' : '#22c55e',
                  fontWeight: 600,
                }}
              >
                {statusLabel}
              </span>
            </div>
          </div>

          {/* Credit usage bar */}
          <div className="settings-row">
            <span className="settings-label">Credits Used</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span>{creditsUsed.toLocaleString()} / {creditsIncluded.toLocaleString()} credits</span>
                <span style={{ opacity: 0.6 }}>{Math.round(creditPercent)}%</span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: 'var(--bg-muted, rgba(255,255,255,0.08))',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${creditPercent}%`,
                    borderRadius: 4,
                    background: creditPercent > 90 ? '#ef4444' : creditPercent > 70 ? '#f59e0b' : 'var(--accent, #0071e3)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Reset date */}
          {resetDate && (
            <div className="settings-row">
              <span className="settings-label">Resets On</span>
              <span className="settings-value">{resetDate}</span>
            </div>
          )}

          {/* Manage subscription button */}
          {!isFree && subscription?.stripe_customer_id && (
            <div className="settings-actions" style={{ marginTop: 8, marginBottom: 16 }}>
              <button
                className="settings-button"
                onClick={handleManageSubscription}
                disabled={actionLoading === 'portal'}
              >
                {actionLoading === 'portal' ? 'Opening…' : '⚙️ Manage Subscription'}
              </button>
            </div>
          )}

          {/* ── Billing cycle toggle ── */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 0,
              margin: '20px 0 16px',
            }}
          >
            <button
              onClick={() => setBillingCycle('month')}
              style={{
                padding: '6px 18px',
                borderRadius: '8px 0 0 8px',
                border: '1px solid var(--border, rgba(255,255,255,0.1))',
                background: billingCycle === 'month' ? 'var(--accent, #0071e3)' : 'transparent',
                color: billingCycle === 'month' ? '#fff' : 'var(--text, #ccc)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('year')}
              style={{
                padding: '6px 18px',
                borderRadius: '0 8px 8px 0',
                border: '1px solid var(--border, rgba(255,255,255,0.1))',
                borderLeft: 'none',
                background: billingCycle === 'year' ? 'var(--accent, #0071e3)' : 'transparent',
                color: billingCycle === 'year' ? '#fff' : 'var(--text, #ccc)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Yearly <span style={{ fontSize: 11, color: '#22c55e' }}>Save ~17%</span>
            </button>
          </div>

          {/* ── Plan cards ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
            }}
          >
            {['free', 'power', 'pro'].map((plan) => {
              const isCurrent = currentPlan === plan;
              const features = PLAN_FEATURES[plan] || [];
              const credits = PLAN_CREDIT_LIMITS[plan] || 500;
              const displayPrice = getDisplayPrice(plan, billingCycle);
              const priceObj = getPriceFor(plan, billingCycle);

              return (
                <div
                  key={plan}
                  style={{
                    border: `1px solid ${isCurrent ? 'var(--accent, #0071e3)' : 'var(--border, rgba(255,255,255,0.1))'}`,
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    background: isCurrent ? 'rgba(0,113,227,0.06)' : 'var(--bg-surface, rgba(255,255,255,0.03))',
                  }}
                >
                  {/* Header */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>
                        {PLAN_LABELS[plan]}
                      </span>
                      {isCurrent && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: 'var(--accent, #0071e3)',
                            color: '#fff',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          Current
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
                      {displayPrice}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                      {credits.toLocaleString()} credits / month
                    </div>
                  </div>

                  {/* Features */}
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      flex: 1,
                      fontSize: 13,
                      lineHeight: 1.8,
                    }}
                  >
                    {features.map((feat, i) => (
                      <li key={i} style={{ opacity: 0.85 }}>
                        ✓ {feat}
                      </li>
                    ))}
                  </ul>

                  {/* Action */}
                  <div style={{ marginTop: 16 }}>
                    {isCurrent ? (
                      <button
                        className="settings-button"
                        disabled
                        style={{ width: '100%', opacity: 0.5, cursor: 'default' }}
                      >
                        Current Plan
                      </button>
                    ) : plan === 'free' ? (
                      !isFree && subscription?.stripe_customer_id ? (
                        <button
                          className="settings-button"
                          onClick={handleManageSubscription}
                          disabled={actionLoading === 'portal'}
                          style={{ width: '100%' }}
                        >
                          Downgrade via Portal
                        </button>
                      ) : (
                        <button
                          className="settings-button"
                          disabled
                          style={{ width: '100%', opacity: 0.5, cursor: 'default' }}
                        >
                          Free Tier
                        </button>
                      )
                    ) : (
                      <button
                        className="settings-button primary"
                        onClick={() => priceObj && handleUpgrade(priceObj.id)}
                        disabled={!!actionLoading}
                        style={{ width: '100%' }}
                      >
                        {actionLoading === priceObj?.id ? 'Redirecting…' : `Upgrade to ${PLAN_LABELS[plan]}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info */}
          <p className="settings-info" style={{ marginTop: 16 }}>
            All plans include secure local agent execution. Payments are processed via Stripe.
          </p>
          <p className="settings-tagline">
            Your agents run on your machine. Credits are for cloud-enhanced features.
          </p>

          {/* ── Credit Balance & Top-Up ── */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              💳 Credit Balance
            </div>

            {creditBalance ? (
              <>
                {creditBalance.source === 'free' ? (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>
                      {creditBalance.daily_remaining ?? 0} / {creditBalance.daily_limit ?? 0} free credits today
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 12 }}>
                      Top up to unlock more models and higher limits:
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    {creditBalance.has_active_subscription && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        marginBottom: 8,
                      }}>
                        <span style={{ fontSize: 13 }}>Monthly:</span>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          {(creditBalance.monthly_credits - creditBalance.monthly_used).toLocaleString()} / {creditBalance.monthly_credits.toLocaleString()}
                        </span>
                        <div style={{
                          flex: 1,
                          height: 6,
                          borderRadius: 3,
                          background: 'var(--bg-muted, rgba(255,255,255,0.08))',
                          overflow: 'hidden',
                          maxWidth: 120,
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${creditBalance.monthly_credits > 0 ? Math.min(((creditBalance.monthly_credits - creditBalance.monthly_used) / creditBalance.monthly_credits) * 100, 100) : 0}%`,
                            borderRadius: 3,
                            background: 'var(--accent, #0071e3)',
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                      </div>
                    )}
                    {creditBalance.deposit_balance > 0 && (
                      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>
                        Deposit: <strong>{creditBalance.deposit_balance.toLocaleString()}</strong> credits
                      </div>
                    )}
                    <div style={{ fontSize: 13, marginBottom: 12 }}>
                      Need more? Top up:
                    </div>
                  </div>
                )}

                {/* Credit Pack Buttons */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 10,
                }}>
                  {CREDIT_PACKS.map((pack) => (
                    <button
                      key={pack.id}
                      className="settings-button"
                      onClick={() => handlePurchaseCredits(pack.id)}
                      disabled={!!actionLoading}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                        padding: '10px 8px',
                        borderRadius: 10,
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>
                        {actionLoading === `credit-${pack.id}` ? 'Redirecting…' : pack.label}
                      </span>
                      <span style={{ fontSize: 11, opacity: 0.6 }}>
                        → {pack.credits.toLocaleString()} credits
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ padding: 16, textAlign: 'center', opacity: 0.6, fontSize: 13 }}>
                Loading credit balance…
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
