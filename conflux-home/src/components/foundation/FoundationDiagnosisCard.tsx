import React from 'react';
import type { HomeDiagnosis } from '../../types';

interface FoundationDiagnosisCardProps {
  diagnosis: HomeDiagnosis;
}

const urgencyColors: Record<string, { bg: string; color: string; border: string }> = {
  immediate: { bg: '#ef444415', color: '#ef4444', border: '#ef444430' },
  this_week: { bg: '#f59e0b15', color: '#f59e0b', border: '#f59e0b30' },
  this_month: { bg: '#3b82f615', color: '#3b82f6', border: '#3b82f630' },
  routine: { bg: '#10b98115', color: '#10b981', border: '#10b98130' },
};

const likelihoodColors: Record<string, string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#10b981',
};

const severityColors: Record<string, string> = {
  critical: '#ef4444', moderate: '#f59e0b', minor: '#94a3b8',
};

const actionLabels: Record<string, string> = {
  diy: '🔧 DIY Fix', pro: '👷 Call a Pro', monitor: '👀 Monitor',
};

const FoundationDiagnosisCard: React.FC<FoundationDiagnosisCardProps> = ({ diagnosis }) => {
  const urgency = urgencyColors[diagnosis.urgency] || urgencyColors.routine;
  const { recommended_action: action } = diagnosis;

  return (
    <div className="foundation-diagnosis-card" style={{ animation: 'foundation-slide-up-fade 0.4s ease-out' }}>
      {/* Urgency bar */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
        borderRadius: 100, fontSize: 12, fontWeight: 600, marginBottom: 12,
        background: urgency.bg, color: urgency.color, border: `1px solid ${urgency.border}`,
      }}>
        {diagnosis.urgency.replace('_', ' ').toUpperCase()}
      </div>

      {/* Symptom summary */}
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px 0', lineHeight: 1.4 }}>
        {diagnosis.symptom_summary}
      </h3>

      {/* Probable causes */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Probable Causes
        </div>
        {diagnosis.probable_causes.map((c, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
            borderBottom: i < diagnosis.probable_causes.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
          }}>
            <span className="foundation-status-badge" style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 100,
              background: `${likelihoodColors[c.likelihood]}20`, color: likelihoodColors[c.likelihood],
            }}>
              {c.likelihood}
            </span>
            <span style={{ fontSize: 13, flex: 1 }}>{c.cause}</span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 100,
              background: `${severityColors[c.severity]}20`, color: severityColors[c.severity],
            }}>
              {c.severity}
            </span>
          </div>
        ))}
      </div>

      {/* Recommended action */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          {actionLabels[action.type] || action.type}
        </div>
        {action.steps.map((step, i) => (
          <div key={i} className="foundation-action-step" style={{
            display: 'flex', gap: 8, padding: '5px 0', fontSize: 12, color: 'rgba(255,255,255,0.75)',
          }}>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600, minWidth: 18 }}>{i + 1}.</span>
            {step}
          </div>
        ))}
      </div>

      {/* Cost estimate */}
      <div className="foundation-cost-badge" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
        borderRadius: 100, background: '#10b98115', color: '#10b981', fontSize: 13, fontWeight: 600,
      }}>
        💰 ${action.estimated_cost_range.low.toFixed(0)} – ${action.estimated_cost_range.high.toFixed(0)}
      </div>
    </div>
  );
};

export default FoundationDiagnosisCard;
