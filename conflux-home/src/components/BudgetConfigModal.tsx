// Conflux Home — Budget Config Modal (Settings + Bucket Management)
// Pre-fills from DB, supports edit/update/delete of existing buckets.
import { useState, useEffect } from 'react';
import '../styles/budget-pulse.css';
import type { BudgetSettings, BudgetBucket } from '../types';

interface BucketDraft {
  id?: string;        // undefined = new bucket (needs creating)
  dbId?: string;      // set if loaded from DB (needs updating)
  name: string;
  icon: string;
  monthly_goal: number;
  color: string;
}

interface NewBucketState {
  name: string;
  icon: string;
  monthly_goal: number;
  color: string;
}

interface BudgetConfig {
  payFrequency: string;
  payDates: number[];
  monthlyIncome: number;
  buckets: BucketDraft[];
}

interface ConfigModalProps {
  isOpen: boolean;
  settings: BudgetSettings | null;
  buckets: BudgetBucket[];          // loaded from DB
  onClose: () => void;
  onSaveSettings: (config: { pay_frequency: string; pay_dates: number[]; income_amount: number }) => Promise<void>;
  onUpdateBucket: (id: string, bucket: { name: string; icon: string; monthly_goal: number; color: string }) => Promise<void>;
  onCreateBucket: (bucket: { name: string; icon: string; monthly_goal: number; color: string }) => Promise<void>;
  onDeleteBucket: (id: string) => Promise<void>;
  saveStatus: 'idle' | 'saving' | 'success';
}

const DEFAULT_NEW_BUCKET: NewBucketState = { name: '', icon: '💳', monthly_goal: 0, color: '#8b5cf6' };

function freqToKey(freq: string): string {
  if (freq === 'biweekly') return 'bi-weekly';
  return freq;
}

/** Strip $ and commas before parsing a money value */
function parseMoney(val: string | number): number {
  if (typeof val === 'number') return val;
  return parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
}

export default function BudgetConfigModal({
  isOpen,
  settings,
  buckets,
  onClose,
  onSaveSettings,
  onUpdateBucket,
  onCreateBucket,
  onDeleteBucket,
  saveStatus,
}: ConfigModalProps) {
  const [payFrequency, setPayFrequency] = useState('semi-monthly');
  const [payDates, setPayDates] = useState<[number, number]>([1, 15]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [bucketList, setBucketList] = useState<BucketDraft[]>([]);  // DB buckets
  const [newBucket, setNewBucket] = useState<NewBucketState>(DEFAULT_NEW_BUCKET);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // bucket dbId pending delete

  // Pre-fill from DB whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (settings) {
      setPayFrequency(freqToKey(settings.pay_frequency));
      try {
        const dates: number[] = typeof settings.pay_dates === 'string'
          ? JSON.parse(settings.pay_dates)
          : settings.pay_dates;
        setPayDates([dates[0] ?? 1, dates[1] ?? 15]);
      } catch {
        setPayDates([1, 15]);
      }
      setMonthlyIncome(settings.income_amount);
    } else {
      setPayFrequency('semi-monthly');
      setPayDates([1, 15]);
      setMonthlyIncome(0);
    }
    // Load existing buckets from DB
    setBucketList(buckets.map(b => ({
      dbId: b.id,
      id: undefined,
      name: b.name,
      icon: b.icon || '💳',
      monthly_goal: b.monthly_goal,
      color: b.color || '#8b5cf6',
    })));
    setNewBucket(DEFAULT_NEW_BUCKET);
    setConfirmDelete(null);
  }, [isOpen, settings, buckets]);

  const addBucket = () => {
    if (!newBucket.name || !newBucket.monthly_goal) return;
    setBucketList(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9), // temp client-side id for new unsaved buckets
        name: newBucket.name,
        icon: newBucket.icon || '💳',
        monthly_goal: parseMoney(newBucket.monthly_goal),
        color: newBucket.color || '#8b5cf6',
      },
    ]);
    setNewBucket(DEFAULT_NEW_BUCKET);
  };

  const removeBucket = (key: string) => {
    // key = dbId (existing) or temp id (new)
    setBucketList(prev => prev.filter(b => (b.dbId || b.id) !== key));
  };

  const updateBucketField = (key: string, field: keyof BucketDraft, value: string | number) => {
    setBucketList(prev => prev.map(b => {
      const k = b.dbId || b.id;
      if (k !== key) return b;
      return { ...b, [field]: value };
    }));
  };

  const handleSave = async () => {
    // 1. Save settings
    await onSaveSettings({
      pay_frequency: payFrequency,
      pay_dates: [payDates[0], payDates[1]],
      income_amount: monthlyIncome,
    });

    // 2. Sync buckets: separate existing (dbId) vs new (no dbId)
    for (const bucket of bucketList) {
      if (bucket.dbId) {
        // Existing bucket — update
        await onUpdateBucket(bucket.dbId, {
          name: bucket.name,
          icon: bucket.icon,
          monthly_goal: bucket.monthly_goal,
          color: bucket.color,
        });
      } else {
        // New bucket — create
        await onCreateBucket({
          name: bucket.name,
          icon: bucket.icon,
          monthly_goal: bucket.monthly_goal,
          color: bucket.color,
        });
      }
    }

    // 3. Any previously-existing buckets that are no longer in bucketList → delete
    const currentDbIds = new Set(bucketList.filter(b => b.dbId).map(b => b.dbId));
    for (const original of buckets) {
      if (!currentDbIds.has(original.id)) {
        await onDeleteBucket(original.id);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚙️ SYSTEM CONFIGURATION</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="config-section">
            <label className="section-label">Pay Rhythm</label>
            <div className="rhythm-grid">
              {['weekly', 'bi-weekly', 'semi-monthly', 'monthly'].map((freq) => (
                <button
                  key={freq}
                  className={`rhythm-btn ${payFrequency === freq ? 'active' : ''}`}
                  onClick={() => setPayFrequency(freq)}
                >
                  {freq.replace('-', ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="config-section">
            <label className="section-label">Pay Days (Day of Month)</label>
            <div className="pay-date-inputs">
              <div className="input-group">
                <span>First Payday:</span>
                <input
                  type="number"
                  value={payDates[0]}
                  onChange={e => setPayDates([parseInt(e.target.value) || 1, payDates[1]])}
                  min="1" max="31"
                />
              </div>
              <div className="input-group">
                <span>Second Payday:</span>
                <input
                  type="number"
                  value={payDates[1]}
                  onChange={e => setPayDates([payDates[0], parseInt(e.target.value) || 15])}
                  min="1" max="31"
                />
              </div>
            </div>
          </div>

          <div className="config-section">
            <label className="section-label">Monthly Income Target</label>
            <div className="income-input-group">
              <span className="currency-icon">$</span>
              <input
                type="number"
                value={monthlyIncome}
                onChange={e => setMonthlyIncome(parseMoney(e.target.value))}
              />
            </div>
          </div>

          <div className="config-section">
            <label className="section-label">
              System Buckets
              <span className="section-hint">({bucketList.length} active)</span>
            </label>
            <div className="bucket-list">
              {bucketList.map((bucket) => {
                const key = bucket.dbId || bucket.id || '';
                return (
                  <div key={key} className="bucket-row bucket-row-edit">
                    <input
                      className="bucket-edit-icon"
                      value={bucket.icon}
                      onChange={e => updateBucketField(key, 'icon', e.target.value)}
                      maxLength={3}
                    />
                    <input
                      className="bucket-edit-name"
                      value={bucket.name}
                      onChange={e => updateBucketField(key, 'name', e.target.value)}
                      placeholder="Bucket name"
                    />
                    <input
                      className="bucket-edit-goal"
                      type="number"
                      value={bucket.monthly_goal || ''}
                      onChange={e => updateBucketField(key, 'monthly_goal', parseMoney(e.target.value))}
                      placeholder="0"
                    />
                    <input
                      className="bucket-edit-color"
                      type="color"
                      value={bucket.color || '#8b5cf6'}
                      onChange={e => updateBucketField(key, 'color', e.target.value)}
                    />
                    <button
                      className="delete-bucket-btn"
                      onClick={() => removeBucket(key)}
                      title="Remove bucket"
                    >✕</button>
                  </div>
                );
              })}
              {bucketList.length === 0 && (
                <div className="bucket-empty">No buckets configured yet. Add one below.</div>
              )}
            </div>

            <div className="add-bucket-form">
              <label className="section-label">Add New Bucket</label>
              <div className="add-bucket-grid">
                <input
                  placeholder="Name"
                  value={newBucket.name}
                  onChange={e => setNewBucket({ ...newBucket, name: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Monthly $"
                  value={newBucket.monthly_goal || ''}
                  onChange={e => setNewBucket({ ...newBucket, monthly_goal: parseMoney(e.target.value) })}
                />
                <button className="add-bucket-btn" onClick={addBucket}>+</button>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button className="cancel-btn" onClick={onClose}>Cancel</button>
            <button
              className="save-btn"
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              style={{ opacity: saveStatus === 'saving' ? 0.7 : 1 }}
            >
              {saveStatus === 'saving' ? '⟳ Syncing...' : saveStatus === 'success' ? '✓ Saved!' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
