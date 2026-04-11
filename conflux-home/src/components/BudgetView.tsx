// Conflux Home — Budget View (The Matrix v2 - Clean)
// Zero-based budgeting with a "Spreadsheet-on-Steroids" UI.

import { useState, useMemo, useEffect } from 'react';
import { useBudget } from '../hooks/useBudget';
import { useBudgetEngine } from '../hooks/useBudgetEngine';
import { useAuth } from '../hooks/useAuth';
import PulseParticles from './PulseParticles';
import BudgetConfigModal from './BudgetConfigModal';
import { TransactionLogModal } from './TransactionLogModal';
import { parseBudgetCommand } from '../hooks/useBudgetAI';
import '../styles/budget-pulse.css';

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
    refreshData,
    loading 
  } = useBudgetEngine();

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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');

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

  return (
    <div className="budget-matrix-v2">
      <div className="matrix-bg-effects" />
      <PulseParticles />

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

      {/* ── Matrix Header ── */}
      <div className="matrix-header">
        <div className="matrix-nav">
          <button className="matrix-btn" onClick={prevPeriod}>←</button>
          <h2 className="matrix-title">{period} // ALLOCATION GRID</h2>
          <button className="matrix-btn" onClick={nextPeriod}>→</button>
        </div>
        <div className="matrix-controls">
          <button className="btn-primary" onClick={() => setIsLogOpen(true)}>⚡ LOG PAYMENT</button>
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
          {buckets.map((bucket) => {
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
                      onBlur={() => handleCellEdit(bucket.id, 'p1', parseFloat(editValue))}
                      onKeyDown={e => e.key === 'Enter' && handleCellEdit(bucket.id, 'p1', parseFloat(editValue))}
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
                      onBlur={() => handleCellEdit(bucket.id, 'p2', parseFloat(editValue))}
                      onKeyDown={e => e.key === 'Enter' && handleCellEdit(bucket.id, 'p2', parseFloat(editValue))}
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
        onClose={() => setIsConfigOpen(false)}
        saveStatus={saveStatus}
        onSave={async (config) => {
          console.log('💾 Config Save Triggered:', config);
          setSaveStatus('saving');
          try {
            // 1. Update Global Settings
            console.log('📡 Sending settings to backend...');
            await updateSettings({
              pay_frequency: config.payFrequency,
              pay_dates: [config.payDates.p1, config.payDates.p2],
              income_amount: config.monthlyIncome,
            });
            console.log('✅ Settings saved.');

            // 2. Sync Buckets
            const existingIds = new Set(buckets.map(b => b.id));
            console.log('🪣 Existing DB buckets:', existingIds);
            
            for (const bucket of config.buckets) {
              if (!existingIds.has(bucket.id)) {
                console.log('➕ Creating new bucket:', bucket.name);
                await createBucket({
                  name: bucket.name,
                  icon: bucket.icon,
                  monthly_goal: bucket.monthly_goal,
                  color: bucket.color
                });
              }
            }

            setSaveStatus('success');
            console.log('🔄 Refreshing data from DB...');
            await refreshData();
            console.log('💾 Data refreshed. New bucket count:', buckets.length);
            
            setTimeout(() => {
              setSaveStatus('idle');
              setIsConfigOpen(false);
            }, 1500);
          } catch (err) {
            console.error('❌ Failed to save config:', err);
            setSaveStatus('idle');
          }
        }}
      />

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
            status: 'settled',
          });
          setIsLogOpen(false);
        }}
      />
    </div>
  );
}
