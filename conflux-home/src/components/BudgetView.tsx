// Conflux Home - Budget View (The Matrix v2 - Clean + Onboarding)
// Zero-based budgeting with a "Spreadsheet-on-Steroids" UI.

import { useState, useMemo, useEffect } from 'react';
import { useBudget } from '../hooks/useBudget';
import { useBudgetEngine } from '../hooks/useBudgetEngine';
import { useAuth } from '../hooks/useAuth';
import PulseParticles from './PulseParticles';
import BudgetConfigModal from './BudgetConfigModal';
import { TransactionLogModal } from './TransactionLogModal';
import { parseBudgetCommand } from '../hooks/useBudgetAI';
import PulseBoot from './PulseBoot';
import PulseOnboarding, { hasCompletedPulseOnboarding } from './PulseOnboarding';
import PulseTour, { hasCompletedPulseTour } from './PulseTour';
import { playSuccess } from '../lib/sound';
import { triggerFairyNudge } from '../lib/triggerFairyNudge';
import '../styles/budget-pulse.css';
import '../styles/pulse-onboarding-v2.css';

function formatMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BudgetView() {
  const { user: authUser } = useAuth();
  const { period, prevPeriod, nextPeriod } = useBudget();
  const {
    settings,
    buckets,
    allocations,
    transactions,
    updateSettings,
    logTransaction,
    createBucket,
    updateBucket,
    deleteBucket,
    deleteTransaction,
    parseNatural,
    refreshData,
    loading
  } = useBudgetEngine();

  // Proactive nudge: Pulse — fire fairy when opened with no transactions this month
  const [fairyNudgeFired, setFairyNudgeFired] = useState(false);
  useEffect(() => {
    if (loading || fairyNudgeFired) return;
    const thisMonthTx = (transactions ?? []).filter(tx => {
      const d = new Date(tx.date + 'T00:00:00');
      const p = new Date(period + '-01T00:00:00');
      return d.getMonth() === p.getMonth() && d.getFullYear() === p.getFullYear();
    });
    const key = 'conflux-pulse-fairy-nudged';
    if (thisMonthTx.length === 0 && !localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      setFairyNudgeFired(true);
      triggerFairyNudge({
        id: 'pulse-first-visit',
        text: 'No spending tracked this month — say "I spent $50 on groceries" to start.',
        app: 'budget',
        priority: 'info',
      });
    }
  }, [loading, transactions, period, fairyNudgeFired]);

  // Boot → Onboarding → Tour state
  const [bootDone, setBootDone] = useState(() => localStorage.getItem('pulse-boot-done') === 'true');
  const hasOnboarded = hasCompletedPulseOnboarding();
  const hasTakenTour = hasCompletedPulseTour();
  const [showOnboarding, setShowOnboarding] = useState(!bootDone && !hasOnboarded);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [showTour, setShowTour] = useState(!bootDone ? false : !hasTakenTour);
  const [tourComplete, setTourComplete] = useState(false);

  // After onboarding completes, refresh data so newly saved buckets appear immediately
  useEffect(() => {
    if (onboardingComplete) {
      console.log('[BudgetView] Onboarding complete - reloading data from DB');
      refreshData();
    }
  }, [onboardingComplete, refreshData]);

  // Debug: Force reload on mount to ensure we see manual DB entries
  useEffect(() => {
    console.log('[BudgetView] Mounting - user:', authUser?.id, 'settings:', settings, 'buckets:', buckets.length);
    refreshData();
  }, [refreshData, authUser?.id]);

  // Debug: Log when data changes
  useEffect(() => {
    console.log('[BudgetView] Data updated - settings:', JSON.stringify(settings), 'buckets:', buckets.length, 'loading:', loading);
  }, [settings, buckets, loading]);

  const [activeBucket, setActiveBucket] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [nlpInput, setNlpInput] = useState('');
  const [nlpParsed, setNlpParsed] = useState<{ entry_type: string; category: string; amount: number; description: string } | null>(null);
  const [nlpConfirming, setNlpConfirming] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [showTxHistory, setShowTxHistory] = useState(false);

  // Proactive nudge placeholder - shown when there's not much data yet
  const showNudgePlaceholder = buckets.length < 3 || !settings?.income_amount;

  // Derived State for the Matrix
  const totalIncome = settings?.income_amount || 0;
  const totalObligations = buckets.reduce((sum, b) => sum + (b.monthly_goal || 0), 0);
  const surplus = totalIncome - totalObligations;

  // Helper to get allocation for a specific bucket and "period"
  const getAllocation = (bucketId: string, p: number) => {
    const bucket = buckets.find(b => b.id === bucketId);
    if (!bucket) return 0;

    const goal = bucket.monthly_goal || 0;
    const freq = settings?.pay_frequency;

    if (freq === 'biweekly') {
      // 26 pays a year. Each pay is (Monthly * 12) / 26
      return (goal * 12) / 26;
    }
    if (freq === 'weekly') {
      // 52 pays a year.
      return (goal * 12) / 52;
    }
    if (freq === 'monthly') {
      return p === 1 ? goal : 0;
    }

    // Default: Semi-monthly (24 pays)
    return goal / 2;
  };

  /** Strip $ and commas before parsing a money value */
  const parseMoney = (val: string | number): number => {
    if (typeof val === 'number') return val;
    return parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
  };

  // Helper to get actual paid amount
  const getPaid = (bucketId: string) => {
    return transactions
      .filter(t => t.bucket_id === bucketId && t.status === 'reconciled')
      .reduce((sum, t) => sum + t.amount, 0);
  };

  const [editingCell, setEditingCell] = useState<{ id: string; period: 'p1' | 'p2' } | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleCellClick = (bucketId: string, period: 'p1' | 'p2', val: number) => {
    setEditingCell({ id: bucketId, period });
    setEditValue(val.toString());
  };

  const handleCellEdit = async (bucketId: string, period: 'p1' | 'p2', val: number) => {
    // Placeholder for updateAllocation call
    setEditingCell(null);
  };

  // ── NLP Input Handler ──────────────────────────────────────
  const handleNlpSubmit = async () => {
    if (!nlpInput.trim()) return;
    try {
      const parsed = await parseNatural(nlpInput);
      setNlpParsed(parsed);
      setNlpConfirming(true);
    } catch (err) {
      console.error('[BudgetView] NLP parse failed:', err);
    }
  };

  const handleNlpConfirm = async () => {
    if (!nlpParsed) return;
    try {
      const bucketName = nlpParsed.category;
      const bucket = buckets.find(b => b.name.toLowerCase().includes(bucketName));
      if (!bucket) {
        alert(`No bucket found for category "${bucketName}". Add a bucket first in Config.`);
        return;
      }
      await logTransaction({
        bucket_id: bucket.id,
        amount: nlpParsed.amount,
        date: new Date().toISOString().split('T')[0],
        status: 'reconciled',
        description: nlpParsed.description,
        category: nlpParsed.category,
      });
      playSuccess();
      setNlpInput('');
      setNlpParsed(null);
      setNlpConfirming(false);
    } catch (err) {
      console.error('[BudgetView] NLP confirm failed:', err);
    }
  };

  const handleNlpCancel = () => {
    setNlpParsed(null);
    setNlpConfirming(false);
  };

  // Save config from onboarding setup flow
  return (
    <div className="budget-matrix-v2">
      <div className="matrix-bg-effects" />
      <PulseParticles />

      {/* ── Boot Sequence ── */}
      {!bootDone && (
        <PulseBoot
          onComplete={() => {
            localStorage.setItem('pulse-boot-done', 'true');
            setBootDone(true);
          }}
        />
      )}

      {/* ── Onboarding ── */}
      {bootDone && showOnboarding && !onboardingComplete && (
        <PulseOnboarding
          onComplete={() => {
            setOnboardingComplete(true);
            setShowOnboarding(false);
            if (!hasTakenTour) setShowTour(true);
          }}
        />
      )}

      {/* ── Guided Tour ── */}
      {bootDone && !showOnboarding && showTour && !tourComplete && (
        <PulseTour
          onComplete={() => {
            setTourComplete(true);
          }}
        />
      )}

      {/* Proactive Nudge Placeholder */}
      {showNudgePlaceholder && !showOnboarding && (
        <div className="pulse-proactive pulse-proactive-placeholder">
          <span className="pulse-proactive-icon">💡</span>
          <div className="pulse-proactive-content">
            <div className="pulse-proactive-title">Pulse is watching...</div>
            <div className="pulse-proactive-body">
              Configure your pay schedule and add buckets to unlock proactive insights.
            </div>
          </div>
        </div>
      )}

      {!showNudgePlaceholder && !showOnboarding && (
        <div className="pulse-proactive">
          <span className="pulse-proactive-icon">📊</span>
          <div className="pulse-proactive-content">
            <div className="pulse-proactive-title">Pulse Insight</div>
            <div className="pulse-proactive-body">
              You're tracking {buckets.length} buckets with ${(settings?.income_amount || 0).toLocaleString()} monthly income.
              {surplus > 0 ? ` $${surplus.toLocaleString()} projected surplus.` : ` ${Math.abs(surplus).toLocaleString()} deficit.`}
            </div>
          </div>
        </div>
      )}

      {/* ── The Pulse: Financial Cockpit ── */}
      <div className="budget-cockpit">
        <div className="cockpit-gauge">
          <div className="gauge-label">Monthly Income</div>
          <div className="gauge-value income">{formatMoney(totalIncome)}</div>
          <div className="gauge-pulse"></div>
        </div>
        <div className="cockpit-gauge">
          <div className="gauge-label">Total Obligations</div>
          <div className="gauge-value">{formatMoney(totalObligations)}</div>
        </div>
        <div className="cockpit-gauge">
          <div className="gauge-label">Projected Surplus</div>
          <div className="gauge-value surplus">{formatMoney(surplus)}</div>
          <div className="gauge-indicator">● ONLINE</div>
        </div>
      </div>

      {/* ── Natural Language Input ── */}
      <div className="pulse-nlp-bar">
        <div className="nlp-input-wrap">
          <span className="nlp-icon">💬</span>
          <input
            className="nlp-input"
            placeholder="Tell Pulse what happened... e.g. spent $47 at Costco"
            value={nlpInput}
            onChange={e => setNlpInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleNlpSubmit()}
          />
          <button className="nlp-submit-btn" onClick={handleNlpSubmit} disabled={!nlpInput.trim()}>
            Send
          </button>
        </div>
        {nlpConfirming && nlpParsed && (
          <div className="nlp-confirm-card">
            <div className="nlp-confirm-label">Did Pulse understand correctly?</div>
            <div className="nlp-confirm-detail">
              <span className="nlp-type-badge">{nlpParsed.entry_type.toUpperCase()}</span>
              <span className="nlp-amount">${nlpParsed.amount.toFixed(2)}</span>
              <span className="nlp-category">for <strong>{nlpParsed.category}</strong></span>
            </div>
            <div className="nlp-confirm-actions">
              <button className="nlp-yes-btn" onClick={handleNlpConfirm}>✓ Yes, log it</button>
              <button className="nlp-no-btn" onClick={handleNlpCancel}>✕ Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Matrix Header ── */}
      <div className="matrix-header">
        <div className="matrix-nav">
          <button className="matrix-btn" onClick={prevPeriod}>←</button>
          <h2 className="matrix-title">{period} // ALLOCATION GRID</h2>
          <button className="matrix-btn" onClick={nextPeriod}>→</button>
        </div>
        <div className="matrix-controls">
          <button className="btn-primary" onClick={() => setIsLogOpen(true)}>⚡ LOG PAYMENT</button>
          <button className="btn-secondary" onClick={() => setShowTxHistory(v => !v)}>
            {showTxHistory ? '▲ HIDE HISTORY' : `📋 HISTORY (${transactions.length})`}
          </button>
          <button className="btn-secondary" onClick={() => setIsConfigOpen(true)}>⚙️ CONFIG</button>
        </div>
      </div>

      {/* ── The Grid ── */}
      <div className="matrix-container">
        <div className="grid-wrapper">
          {/* Column Headers */}
          <div className="grid-row header-row">
            <div className="grid-cell col-bucket">BUCKET ID</div>
            <div className="grid-cell col-pay">ALLOCATED P1</div>
            <div className="grid-cell col-paid">ACTUAL PAID P1</div>
            <div className="grid-cell col-pay">ALLOCATED P2</div>
            <div className="grid-cell col-paid">ACTUAL PAID P2</div>
            <div className="grid-cell col-meter">STATUS & TOTAL</div>
          </div>

          {/* Data Rows */}
          {buckets.map((bucket, index) => {
            const p1Alloc = getAllocation(bucket.id, 1);
            const p2Alloc = getAllocation(bucket.id, 2);
            const totalAlloc = p1Alloc + p2Alloc;
            const totalPaid = getPaid(bucket.id);
            const goal = bucket.monthly_goal || 0;
            const pct = goal > 0 ? Math.min((totalPaid / goal) * 100, 100) : 0;
            const isFull = totalPaid >= goal;

            return (
              <div
                key={bucket.id}
                className={`grid-row data-row ${activeBucket === bucket.id ? 'active' : ''}`}
                style={{ '--row-index': index } as React.CSSProperties}
                onMouseEnter={() => setActiveBucket(bucket.id)}
                onMouseLeave={() => setActiveBucket(null)}
              >
                <div className="grid-cell col-bucket">
                  <span className="bucket-icon" style={{ color: bucket.color || undefined }}>{bucket.icon || '💳'}</span>
                  <span className="bucket-label">{bucket.name}</span>
                </div>

                <div className="grid-cell col-pay interactive" onClick={() => handleCellClick(bucket.id, 'p1', p1Alloc)}>
                  {editingCell?.id === bucket.id && editingCell?.period === 'p1' ? (
                    <input
                      autoFocus
                      className="cell-edit-input"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => handleCellEdit(bucket.id, 'p1', parseMoney(editValue))}
                      onKeyDown={e => e.key === 'Enter' && handleCellEdit(bucket.id, 'p1', parseMoney(editValue))}
                    />
                  ) : (
                    <span className="pay-amount">{formatMoney(p1Alloc)}</span>
                  )}
                </div>

                <div className="grid-cell col-paid">
                  <span className={`paid-val ${totalPaid >= p1Alloc ? 'settled' : 'pending'}`}>
                    {formatMoney(totalPaid >= p1Alloc ? p1Alloc : totalPaid)}
                  </span>
                </div>

                <div className="grid-cell col-pay interactive" onClick={() => handleCellClick(bucket.id, 'p2', p2Alloc)}>
                  {editingCell?.id === bucket.id && editingCell?.period === 'p2' ? (
                    <input
                      autoFocus
                      className="cell-edit-input"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => handleCellEdit(bucket.id, 'p2', parseMoney(editValue))}
                      onKeyDown={e => e.key === 'Enter' && handleCellEdit(bucket.id, 'p2', parseMoney(editValue))}
                    />
                  ) : (
                    <span className="pay-amount">{formatMoney(p2Alloc)}</span>
                  )}
                </div>

                <div className="grid-cell col-paid">
                  <span className={`paid-val ${totalPaid >= goal ? 'settled' : 'pending'}`}>
                    {formatMoney(totalPaid > p1Alloc ? totalPaid - p1Alloc : 0)}
                  </span>
                </div>

                <div className="grid-cell col-meter">
                  <div className="meter-info">
                    <span className="meter-total">Goal: {formatMoney(goal)}</span>
                    <span className={`meter-label ${isFull ? 'complete' : 'due'}`}>
                      {isFull ? 'SECURED' : `${formatMoney(goal - totalPaid)} DUE`}
                    </span>
                  </div>
                  <div className="meter-track">
                    <div
                      className="meter-fill"
                      style={{ width: `${pct}%`, backgroundColor: isFull ? '#10b981' : (bucket.color || '#10b981') }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BudgetConfigModal
        isOpen={isConfigOpen}
        settings={settings}
        buckets={buckets}
        onClose={() => setIsConfigOpen(false)}
        onSaveSettings={async (config) => {
          setSaveStatus('saving');
          try {
            await updateSettings({
              pay_frequency: config.pay_frequency,
              pay_dates: config.pay_dates,
              income_amount: config.income_amount,
            });
          } catch (err) {
            console.error('❌ Failed to save settings:', err);
            throw err;
          } finally {
            setSaveStatus('idle');
          }
        }}
        onUpdateBucket={async (id, bucket) => {
          await updateBucket(id, bucket);
        }}
        onCreateBucket={async (bucket) => {
          await createBucket(bucket);
        }}
        onDeleteBucket={async (id) => {
          await deleteBucket(id);
        }}
        saveStatus={saveStatus}
      />

      {/* ── Transaction History ── */}
      {showTxHistory && (
        <div className="tx-history-panel">
          <div className="tx-history-header">TRANSACTION LOG</div>
          {transactions.length === 0 ? (
            <div className="tx-history-empty">No transactions logged yet.</div>
          ) : (
            <div className="tx-history-list">
              {[...transactions].reverse().map(tx => {
                const bucket = buckets.find(b => b.id === tx.bucket_id);
                return (
                  <div key={tx.id} className="tx-history-row">
                    <div className="tx-row-left">
                      <span className="tx-icon">{bucket?.icon || '💳'}</span>
                      <div className="tx-row-info">
                        <span className="tx-row-bucket">{bucket?.name || 'Uncategorized'}</span>
                        <span className="tx-row-desc">{tx.description || tx.merchant || '—'}</span>
                        <span className="tx-row-date">{tx.date}</span>
                      </div>
                    </div>
                    <div className="tx-row-right">
                      <span className={`tx-amount ${tx.amount >= 0 ? 'income' : ''}`}>
                        {tx.amount >= 0 ? '+' : ''}{formatMoney(tx.amount)}
                      </span>
                      <span className={`tx-status ${tx.status}`}>{tx.status}</span>
                      <button
                        className="tx-delete-btn"
                        onClick={async () => {
                          if (confirm(`Delete this ${formatMoney(tx.amount)} transaction?`)) {
                            await deleteTransaction(tx.id);
                          }
                        }}
                        title="Delete transaction"
                      >✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <TransactionLogModal
        isOpen={isLogOpen}
        onClose={() => setIsLogOpen(false)}
        buckets={buckets.map(b => ({
          id: b.id,
          name: b.name,
          icon: b.icon || '💳',
          color: b.color || '#10b981'
        }))}
        onSave={async (data: { bucketId: string; amount: number; date: string }) => {
          await logTransaction({
            bucket_id: data.bucketId,
            amount: data.amount,
            date: data.date,
            status: 'reconciled',
          });
          playSuccess();
          setIsLogOpen(false);
        }}
      />
    </div>
  );
}
