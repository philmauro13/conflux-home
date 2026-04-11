// Conflux Home — Transaction Log Modal (Budget View)
import { useState } from 'react';
import '../styles/budget-pulse.css';

interface TransactionLogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { bucketId: string; period: 'p1' | 'p2'; amount: number; date: string }) => void;
  buckets: { id: string; name: string; icon: string; color: string }[];
}

export function TransactionLogModal({ isOpen, onClose, onSave, buckets }: TransactionLogProps) {
  const [bucketId, setBucketId] = useState(buckets[0]?.id || '');
  const [period, setPeriod] = useState<'p1' | 'p2'>('p1');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!bucketId || !amount) return;
    onSave({ bucketId, period, amount: parseFloat(amount), date });
    setAmount('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content quick-log-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚡ LOG PAYMENT</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="config-section">
            <label className="section-label">Target Bucket</label>
            <div className="bucket-selector">
              {buckets.map(b => (
                <button
                  key={b.id}
                  className={`bucket-select-btn ${bucketId === b.id ? 'active' : ''}`}
                  onClick={() => setBucketId(b.id)}
                >
                  <span className="selector-icon">{b.icon}</span>
                  <span className="selector-name">{b.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="config-section">
            <label className="section-label">Pay Period</label>
            <div className="period-toggle">
              <button 
                className={`toggle-btn ${period === 'p1' ? 'active' : ''}`}
                onClick={() => setPeriod('p1')}
              >
                PERIOD 01
              </button>
              <button 
                className={`toggle-btn ${period === 'p2' ? 'active' : ''}`}
                onClick={() => setPeriod('p2')}
              >
                PERIOD 02
              </button>
            </div>
          </div>

          <div className="config-section">
            <label className="section-label">Amount Paid</label>
            <div className="log-amount-input">
              <span className="currency-symbol">$</span>
              <input 
                type="text" 
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
          </div>

          <div className="config-section">
            <label className="section-label">Transaction Date</label>
            <input 
              type="date" 
              value={date}
              onChange={e => setDate(e.target.value)}
              className="log-date-input"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="save-btn" onClick={handleSubmit}>Record Transaction</button>
        </div>
      </div>
    </div>
  );
}