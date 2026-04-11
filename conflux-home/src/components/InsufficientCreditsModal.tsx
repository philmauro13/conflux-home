import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { useCredits } from '../hooks/useCredits';
import { useAuth } from '../hooks/useAuth';

interface InsufficientCreditsModalProps {
  onClose: () => void;
  onSeePlans?: () => void;
}

const RECOMMENDED_PACK = { id: 'l', label: '$20', credits: 7000 };

export default function InsufficientCreditsModal({ onClose, onSeePlans }: InsufficientCreditsModalProps) {
  const { user } = useAuth();
  const { balance } = useCredits();
  const [purchasing, setPurchasing] = useState(false);

  const handleDeposit = useCallback(async () => {
    if (!user?.id) return;
    setPurchasing(true);
    try {
      const url = await invoke<string>('purchase_credits', {
        userId: user.id,
        pack: RECOMMENDED_PACK.id,
      });
      await open(url);
      onClose();
    } catch (err) {
      console.error('Credit purchase error:', err);
    } finally {
      setPurchasing(false);
    }
  }, [user, onClose]);

  const isFree = !balance || balance.source === 'free';
  const isSubscriber = balance?.has_active_subscription ?? false;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--bg-card, #1a1a2e)',
          border: '1px solid var(--border, rgba(255,255,255,0.1))',
          borderRadius: 16,
          padding: 32,
          maxWidth: 400,
          width: '90%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Icon */}
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>

        {/* Title */}
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
          Out of Credits
        </h2>

        {/* Message */}
        <p style={{ fontSize: 14, opacity: 0.7, margin: '0 0 24px', lineHeight: 1.5 }}>
          {isFree
            ? "You've used all your free credits for today. Top up to keep chatting with any model."
            : isSubscriber
              ? "You've used all your monthly credits. Top up your deposit to continue without interruption."
              : "You don't have enough credits. Top up to start using any model."
          }
        </p>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={handleDeposit}
            disabled={purchasing}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--accent, #0071e3)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: purchasing ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {purchasing
              ? 'Redirecting…'
              : `Deposit ${RECOMMENDED_PACK.label} → ${RECOMMENDED_PACK.credits.toLocaleString()} credits`
            }
          </button>
          {onSeePlans && (
            <button
              onClick={() => { onClose(); onSeePlans(); }}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                border: '1px solid var(--border, rgba(255,255,255,0.15))',
                background: 'transparent',
                color: 'var(--text, #ccc)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              See Plans
            </button>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={onClose}
          style={{
            marginTop: 16,
            background: 'none',
            border: 'none',
            color: 'var(--text-muted, #888)',
            fontSize: 12,
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
