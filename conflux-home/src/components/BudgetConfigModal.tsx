// Conflux Home — Budget Config Modal (Onboarding & Settings)
import { useState } from 'react';
import '../styles/budget-pulse.css';

interface Bucket {
  id: string;
  name: string;
  icon: string;
  monthly_goal: number;
  color: string;
}

interface NewBucketState {
  name?: string;
  goal?: number;
  icon?: string;
  color?: string;
}

interface BudgetConfig {
  payFrequency: 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly';
  payDates: { p1: number; p2: number };
  monthlyIncome: number;
  buckets: Bucket[];
}

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: BudgetConfig) => void;
  saveStatus: 'idle' | 'saving' | 'success';
}

const DEFAULT_BUCKETS: Bucket[] = [
  { id: 'rent', name: 'Rent/Water', icon: '🏠', monthly_goal: 1760, color: '#10b981' },
  { id: 'ins', name: 'Insurance', icon: '🛡️', monthly_goal: 90, color: '#3b82f6' },
  { id: 'savings', name: 'Savings', icon: '🏦', monthly_goal: 280, color: '#06b6d4' },
];

export default function BudgetConfigModal({ isOpen, onClose, onSave, saveStatus }: ConfigModalProps) {
  // Single unified view
  const [config, setConfig] = useState<BudgetConfig>({
    payFrequency: 'semi-monthly',
    payDates: { p1: 1, p2: 15 },
    monthlyIncome: 4400,
    buckets: DEFAULT_BUCKETS,
  });

  const [newBucket, setNewBucket] = useState<NewBucketState>({ icon: '💳', color: '#8b5cf6' });

  if (!isOpen) return null;

  const addBucket = () => {
    if (!newBucket.name || !newBucket.goal) return;
    const bucket: Bucket = {
      id: Math.random().toString(36).substr(2, 9),
      name: newBucket.name,
      icon: newBucket.icon || '💳',
      monthly_goal: parseFloat(newBucket.goal.toString()),
      color: newBucket.color || '#8b5cf6',
    };
    setConfig({ ...config, buckets: [...config.buckets, bucket] });
    setNewBucket({ icon: '💳', color: '#8b5cf6', name: '', goal: undefined });
  };

  const removeBucket = (id: string) => {
    setConfig({ ...config, buckets: config.buckets.filter(b => b.id !== id) });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚙️ SYSTEM CONFIGURATION</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
            <>
              <div className="config-section">
                <label className="section-label">Pay Rhythm</label>
                <div className="rhythm-grid">
                  {['weekly', 'bi-weekly', 'semi-monthly', 'monthly'].map((freq) => (
                    <button
                      key={freq}
                      className={`rhythm-btn ${config.payFrequency === freq ? 'active' : ''}`}
                      onClick={() => setConfig({ ...config, payFrequency: freq as any })}
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
                      value={config.payDates.p1} 
                      onChange={e => setConfig({ ...config, payDates: { ...config.payDates, p1: parseInt(e.target.value) } })}
                      min="1" max="31"
                    />
                  </div>
                  <div className="input-group">
                    <span>Second Payday:</span>
                    <input 
                      type="number" 
                      value={config.payDates.p2} 
                      onChange={e => setConfig({ ...config, payDates: { ...config.payDates, p2: parseInt(e.target.value) } })}
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
                    value={config.monthlyIncome}
                    onChange={e => setConfig({ ...config, monthlyIncome: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </>

          <div className="config-section">
            <label className="section-label">System Buckets</label>
            <div className="bucket-list">
                {config.buckets.map(bucket => (
                  <div key={bucket.id} className="bucket-row">
                    <span className="bucket-row-icon">{bucket.icon}</span>
                    <span className="bucket-row-name">{bucket.name}</span>
                    <span className="bucket-row-goal">{`$${bucket.monthly_goal}`}</span>
                    <button className="delete-bucket-btn" onClick={() => removeBucket(bucket.id)}>✕</button>
                  </div>
                ))}
              </div>

              <div className="add-bucket-form">
                <label className="section-label">Add New Bucket</label>
                <div className="add-bucket-grid">
                  <input 
                    placeholder="Bucket Name" 
                    value={newBucket.name || ''}
                    onChange={e => setNewBucket({ ...newBucket, name: e.target.value })}
                  />
                  <input 
                    type="number" 
                    placeholder="Monthly Total" 
                    value={newBucket.goal || ''}
                    onChange={e => setNewBucket({ ...newBucket, goal: parseFloat(e.target.value) })}
                  />
                  <button className="add-bucket-btn" onClick={addBucket}>+</button>
                </div>
            </div>
          </div>

          <div className="modal-footer">
            <button className="cancel-btn" onClick={onClose}>Cancel</button>
            <button className="save-btn" onClick={() => onSave(config)} disabled={saveStatus !== 'idle'} style={{ opacity: saveStatus !== 'idle' ? 0.7 : 1 }}>
              {saveStatus === 'saving' ? 'Syncing...' : saveStatus === 'success' ? '✓ Saved!' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
