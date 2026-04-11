import React from 'react';
import type { PredictedFailure } from '../../types';

interface FoundationPredictionsGridProps {
  predictions: PredictedFailure[];
}

const urgencyConfig: Record<string, { label: string; bg: string; color: string }> = {
  high: { label: 'High', bg: '#ef444420', color: '#ef4444' },
  medium: { label: 'Medium', bg: '#f59e0b20', color: '#f59e0b' },
  low: { label: 'Low', bg: '#10b98120', color: '#10b981' },
};

function getProbabilityColor(prob: number): string {
  if (prob >= 0.7) return '#ef4444';
  if (prob >= 0.4) return '#f59e0b';
  return '#10b981';
}

const FoundationPredictionsGrid: React.FC<FoundationPredictionsGridProps> = ({ predictions }) => {
  if (predictions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
        🔍 No failure predictions right now — all systems looking good!
      </div>
    );
  }

  const sorted = [...predictions].sort((a, b) => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sorted.map((p, i) => {
        const agePercent = Math.min(100, Math.round((p.current_age_years / p.expected_lifespan) * 100));
        const probPercent = Math.round(p.failure_probability_next_6mo * 100);
        const urgency = urgencyConfig[p.urgency] || urgencyConfig.low;

        return (
          <div key={i} className="foundation-prediction-card" style={{
            padding: 16, borderRadius: 12,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{p.appliance_name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                  {p.current_age_years}yr / {p.expected_lifespan}yr lifespan
                </div>
              </div>
              <span className="foundation-status-badge" style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100,
                background: urgency.bg, color: urgency.color,
              }}>
                {urgency.label}
              </span>
            </div>

            {/* Age/lifespan bar */}
            <div className="foundation-progress-bar" style={{
              height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', marginBottom: 10, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3, width: `${agePercent}%`,
                background: getProbabilityColor(agePercent / 100),
                transition: 'width 0.5s ease',
              }} />
            </div>

            {/* Failure probability */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                fontSize: 20, fontWeight: 700,
                color: getProbabilityColor(p.failure_probability_next_6mo),
              }}>
                {probPercent}%
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>failure risk (6mo)</span>
            </div>

            {/* Warning signs */}
            {p.warning_signs_to_watch.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  Warning Signs
                </div>
                {p.warning_signs_to_watch.map((sign, j) => (
                  <div key={j} style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', padding: '2px 0' }}>
                    ⚠️ {sign}
                  </div>
                ))}
              </div>
            )}

            {/* Replacement cost */}
            <div className="foundation-cost-badge" style={{
              display: 'inline-flex', padding: '3px 10px', borderRadius: 100,
              background: '#3b82f615', color: '#3b82f6', fontSize: 12, fontWeight: 600,
            }}>
              💰 ${p.estimated_replacement_cost.toFixed(0)} replacement
            </div>

            {/* Recommended action */}
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              💡 {p.recommended_action}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default FoundationPredictionsGrid;
