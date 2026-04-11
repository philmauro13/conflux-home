// Conflux Home — Provider Settings v5 (Cloud-Only)
// All inference runs through the Conflux cloud router.
// No local API key management needed.

import { useState, useEffect, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { useCredits } from '../../hooks/useCredits';
import { useAuth } from '../../hooks/useAuth';

// ── Types ──

interface CloudModel {
  id: string;
  name?: string;
  provider?: string;
  tier?: string;
}

type RouterStatus = 'checking' | 'connected' | 'disconnected';

// ── Constants ──

const CLOUD_ROUTER_URL = import.meta.env.VITE_CLOUD_ROUTER_URL ?? 'https://www.theconflux.com';
const MODELS_ENDPOINT = `${CLOUD_ROUTER_URL}/v1/models`;
const PRICING_URL = 'https://theconflux.ai/pricing';

const TIER_CONFIG: Record<string, { label: string; emoji: string; color: string; tagline: string }> = {
  core: { label: 'Core', emoji: '🟢', color: '#34c759', tagline: 'Free. Fast. Always on.' },
  pro: { label: 'Pro', emoji: '🔵', color: '#0071e3', tagline: 'Smart. Best daily driver.' },
  ultra: { label: 'Ultra', emoji: '🟣', color: '#7b2fff', tagline: 'The best model wins.' },
};

// ── Component ──

export default function ProviderSettings() {
  const { user } = useAuth();
  const { balance: creditBalance, loading: creditsLoading } = useCredits();

  const [routerStatus, setRouterStatus] = useState<RouterStatus>('checking');
  const [routerLatency, setRouterLatency] = useState<number | null>(null);
  const [models, setModels] = useState<CloudModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  // ── Check cloud router status ──
  const checkRouterStatus = useCallback(async () => {
    setRouterStatus('checking');
    const start = Date.now();
    try {
      const res = await fetch(MODELS_ENDPOINT, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      const latency = Date.now() - start;
      setRouterLatency(latency);

      if (res.ok) {
        setRouterStatus('connected');
        const data = await res.json();
        const modelList = Array.isArray(data) ? data : data?.data ?? [];
        setModels(modelList);
      } else {
        setRouterStatus('disconnected');
      }
    } catch {
      setRouterLatency(null);
      setRouterStatus('disconnected');
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkRouterStatus();
  }, [checkRouterStatus]);

  // ── Group models by tier ──
  const modelsByTier = models.reduce<Record<string, CloudModel[]>>((acc, m) => {
    const tier = m.tier ?? 'core';
    if (!acc[tier]) acc[tier] = [];
    acc[tier].push(m);
    return acc;
  }, {});

  // ── Credit display ──
  const getCreditDisplay = () => {
    if (!user) return { label: 'Sign in for credits', sublabel: null };
    if (creditsLoading) return { label: 'Loading…', sublabel: null };
    if (!creditBalance) return { label: 'Unable to load', sublabel: null };

    if (creditBalance.source === 'free') {
      return {
        label: `${creditBalance.daily_remaining ?? 0} free credits today`,
        sublabel: `Limit: ${creditBalance.daily_limit ?? 0}/day`,
      };
    }

    const total = creditBalance.total_available;
    return {
      label: `${total.toLocaleString()} credits available`,
      sublabel: creditBalance.has_active_subscription
        ? `${creditBalance.monthly_credits - creditBalance.monthly_used} of ${creditBalance.monthly_credits} monthly remaining`
        : creditBalance.deposit_balance > 0
          ? `Deposit: ${creditBalance.deposit_balance.toLocaleString()} credits`
          : null,
    };
  };

  const credit = getCreditDisplay();

  // ── Render ──

  return (
    <div className="settings-section">
      <div className="settings-section-title">☁️ Cloud Router</div>

      <div style={{
        fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5,
      }}>
        All inference runs through the Conflux cloud router — fast, secure, no keys to manage.
      </div>

      {/* ── Router Status ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 12,
      }}>
        <span className={`status-dot ${routerStatus === 'connected' ? 'connected' : routerStatus === 'disconnected' ? 'disconnected' : ''}`}
          style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: routerStatus === 'connected' ? '#34c759' : routerStatus === 'disconnected' ? '#ff3b30' : '#ff9f0a',
            boxShadow: routerStatus === 'connected' ? '0 0 8px rgba(52,199,89,0.5)' : 'none',
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {routerStatus === 'connected' ? 'Connected' : routerStatus === 'disconnected' ? 'Disconnected' : 'Checking…'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {CLOUD_ROUTER_URL}
            {routerLatency !== null && routerStatus === 'connected' && ` · ${routerLatency}ms`}
          </div>
        </div>
        <button
          onClick={checkRouterStatus}
          style={{
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 12px', fontSize: 11,
            color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600,
          }}
        >
          ↻ Check
        </button>
      </div>

      {/* ── Credit Balance ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 12,
      }}>
        <span style={{ fontSize: 22 }}>💳</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {credit.label}
          </div>
          {credit.sublabel && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {credit.sublabel}
            </div>
          )}
        </div>
        <button
          onClick={() => open(PRICING_URL)}
          style={{
            background: '#0071e3', border: 'none', borderRadius: 8,
            padding: '6px 14px', fontSize: 11, fontWeight: 700,
            color: '#fff', cursor: 'pointer',
          }}
        >
          Buy Credits
        </button>
      </div>

      {/* ── Available Models ── */}
      <div style={{ marginTop: 4 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
          marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          Available Models
        </div>

        {modelsLoading ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12 }}>
            Loading models…
          </div>
        ) : models.length === 0 ? (
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', padding: 12,
            background: 'rgba(255,255,255,0.02)', borderRadius: 10,
            border: '1px solid var(--border)',
          }}>
            {routerStatus === 'disconnected'
              ? 'Unable to reach cloud router. Check your connection.'
              : 'No models available.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['core', 'pro', 'ultra'].map(tier => {
              const tierModels = modelsByTier[tier];
              if (!tierModels || tierModels.length === 0) return null;
              const config = TIER_CONFIG[tier] ?? TIER_CONFIG.core;

              return (
                <div
                  key={tier}
                  style={{
                    background: `linear-gradient(135deg, ${config.color}08, ${config.color}03)`,
                    border: `1px solid ${config.color}30`,
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>{config.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {config.label}
                    </span>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10,
                      background: `${config.color}15`, color: config.color, fontWeight: 600,
                    }}>
                      {tierModels.length} model{tierModels.length !== 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: 11, color: config.color, fontWeight: 500, marginLeft: 'auto' }}>
                      {config.tagline}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {tierModels.map(m => (
                      <span
                        key={m.id}
                        style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 6,
                          background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)',
                          fontFamily: 'monospace', border: '1px solid var(--border)',
                        }}
                      >
                        {m.name ?? m.id}
                        {m.provider && (
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 6 }}>
                            {m.provider}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Pricing Link ── */}
      <div style={{
        marginTop: 16, padding: 14, background: 'rgba(0,113,227,0.06)',
        border: '1px solid rgba(0,113,227,0.15)', borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 22 }}>🚀</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Need more power?
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Upgrade your plan for higher limits, more models, and priority access.
          </div>
        </div>
        <button
          onClick={() => open(PRICING_URL)}
          style={{
            background: 'transparent', border: '1px solid #0071e3',
            borderRadius: 8, padding: '6px 14px', fontSize: 11,
            fontWeight: 700, color: '#0071e3', cursor: 'pointer',
          }}
        >
          View Plans →
        </button>
      </div>

      {/* ── Info ── */}
      <div style={{
        marginTop: 16, padding: 12, background: 'rgba(255,255,255,0.02)',
        borderRadius: 10, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text-secondary)' }}>How it works:</strong><br />
        Your messages are sent to the Conflux cloud router with your account token.
        The router picks the best provider, handles failover, and streams the response back.
        No API keys needed on your device.
      </div>
    </div>
  );
}
