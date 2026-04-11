import React, { useState } from 'react';
import type { WarrantyAlert } from '../../types';

interface FoundationVaultProps {
  alerts: WarrantyAlert[];
}

function getUrgencyStyle(days: number): { bg: string; color: string; border: string; label: string } {
  if (days < 30) return { bg: '#ef444415', color: '#ef4444', border: '#ef444430', label: 'Expiring Soon' };
  if (days < 60) return { bg: '#f59e0b15', color: '#f59e0b', border: '#f59e0b30', label: 'Attention' };
  return { bg: '#10b98115', color: '#10b981', border: '#10b98130', label: 'Active' };
}

const FoundationVault: React.FC<FoundationVaultProps> = ({ alerts }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (alerts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
        🛡️ All warranties are current — no expiring soon!
      </div>
    );
  }

  const sorted = [...alerts].sort((a, b) => a.days_remaining - b.days_remaining);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {sorted.map((alert, i) => {
        const urgency = getUrgencyStyle(alert.days_remaining);
        const isOpen = expanded[alert.appliance] || false;

        return (
          <div key={i} className="foundation-warranty-card" style={{
            padding: 16, borderRadius: 12,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{alert.appliance}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                  Expires: {alert.warranty_expiry}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {alert.days_remaining < 60 && (
                  <span className="foundation-alert-beacon" style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: urgency.color, display: 'inline-block',
                    animation: alert.days_remaining < 30 ? 'foundation-pulse 1.5s infinite' : 'none',
                    boxShadow: alert.days_remaining < 30 ? `0 0 6px ${urgency.color}80` : 'none',
                  }} />
                )}
                <span className="foundation-status-badge" style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100,
                  background: urgency.bg, color: urgency.color, border: `1px solid ${urgency.border}`,
                }}>
                  {alert.days_remaining} days
                </span>
              </div>
            </div>

            {/* Action recommended */}
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>
              💡 {alert.action_recommended}
            </div>

            {/* Expandable checklist */}
            {alert.claim_checklist.length > 0 && (
              <div>
                <button
                  onClick={() => setExpanded(prev => ({ ...prev, [alert.appliance]: !isOpen }))}
                  style={{
                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {isOpen ? '▼' : '▶'} Claim Checklist
                </button>
                {isOpen && (
                  <div style={{
                    marginTop: 8, padding: 10, borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {alert.claim_checklist.map((item, j) => (
                      <div key={j} style={{
                        display: 'flex', gap: 8, padding: '4px 0', fontSize: 12,
                        color: 'rgba(255,255,255,0.65)',
                      }}>
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>☐</span>
                        {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default FoundationVault;
