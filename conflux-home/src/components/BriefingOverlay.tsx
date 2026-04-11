import React from 'react';
import type { DailyBriefing, BriefingItem } from '../types';

interface BriefingOverlayProps {
  briefing: DailyBriefing | null;
  loading: boolean;
  generating: boolean;
  onClose: () => void;
  onGenerate: () => void;
}

function BriefingItemCard({ item }: { item: BriefingItem }) {
  return (
    <div className="briefing-item">
      <div className="briefing-item-header">
        <span className="briefing-item-icon">{item.icon}</span>
        <div className="briefing-item-content">
          <h4 className="briefing-item-title">{item.title}</h4>
          <p className="briefing-item-body">{item.summary}</p>
        </div>
      </div>
      <span className="briefing-item-relevance">
        Relevance: {item.relevance_score}%
      </span>
    </div>
  );
}

export default function BriefingOverlay({
  briefing,
  loading,
  generating,
  onClose,
  onGenerate,
}: BriefingOverlayProps) {
  return (
    <div className="briefing-overlay" onClick={onClose}>
      <div className="briefing-panel" onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button className="briefing-close" onClick={onClose} title="Close briefing">
          ✕
        </button>

        {/* Header */}
        <h2 className="briefing-title">Daily Briefing</h2>
        <p className="briefing-subtitle">
          {briefing
            ? `Generated ${new Date(briefing.generated_at).toLocaleString()}`
            : 'AI-powered intelligence synthesis'}
        </p>

        {/* Content */}
        {loading && !briefing ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 0',
            color: 'var(--radar-text-muted)',
            fontFamily: 'var(--radar-font-mono)',
            fontSize: '0.8rem',
          }}>
            <div className="radar-spinner" style={{ margin: '0 auto 12px' }} />
            Loading briefing...
          </div>
        ) : !briefing ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px', opacity: 0.5 }}>🎯</div>
            <p style={{
              fontFamily: 'var(--radar-font-mono)',
              fontSize: '0.8rem',
              color: 'var(--radar-text-secondary)',
              marginBottom: '16px',
            }}>
              No briefing available yet. Generate one to see your top 3 must-know signals.
            </p>
            <button
              className="briefing-generate-btn"
              onClick={onGenerate}
              disabled={generating}
            >
              {generating ? '✨ Generating...' : '✨ Generate Briefing'}
            </button>
          </div>
        ) : (
          <>
            {/* Greeting */}
            {briefing.greeting && (
              <p style={{
                fontFamily: 'var(--radar-font-body)',
                fontSize: '0.95rem',
                color: 'var(--radar-text-primary)',
                marginBottom: '20px',
                fontStyle: 'italic',
                opacity: 0.9,
              }}>
                {briefing.greeting}
              </p>
            )}

            {/* Top items */}
            <div className="briefing-items">
              {briefing.items.slice(0, 3).map((item, idx) => (
                <BriefingItemCard key={idx} item={item} />
              ))}
            </div>

            {/* Regenerate button */}
            <button
              className="briefing-generate-btn"
              onClick={onGenerate}
              disabled={generating}
            >
              {generating ? '🔄 Regenerating...' : '🔄 Regenerate Briefing'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
