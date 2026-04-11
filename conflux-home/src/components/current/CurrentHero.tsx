import React from 'react';
import type { DailyBriefing, BriefingItem } from '../../types';

interface CurrentHeroProps {
  briefing: DailyBriefing | null;
  loading: boolean;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function RelevanceBadge({ score }: { score: number }) {
  const label = score >= 80 ? 'High' : score >= 50 ? 'Medium' : 'Low';
  return (
    <span className="current-hero-item-relevance">
      {label} · {score}%
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="current-hero">
      <div className="current-hero-header">
        <div className="current-hero-greeting" style={{ opacity: 0.3 }}>
          Loading briefing...
        </div>
      </div>
      <div className="current-hero-items">
        {[1, 2, 3].map((i) => (
          <div key={i} className="current-hero-item" style={{ opacity: 0.2 + i * 0.1 }}>
            <div className="current-hero-item-icon">⏳</div>
            <div className="current-hero-item-content">
              <div className="current-hero-item-title">...</div>
              <div className="current-hero-item-body">Loading...</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="current-hero">
      <div className="current-hero-header">
        <div className="current-hero-greeting">Your Briefing</div>
      </div>
      <div className="current-hero-empty">
        <p>🌀</p>
        <p>Generating your first briefing...</p>
        <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>
          Analyzing your signals, ripples, and patterns to build a personalized intelligence report.
        </p>
      </div>
    </div>
  );
}

export default function CurrentHero({ briefing, loading }: CurrentHeroProps) {
  if (loading && !briefing) return <LoadingSkeleton />;
  if (!briefing) return <EmptyState />;

  return (
    <div className="current-hero">
      <div className="current-hero-header">
        <h2 className="current-hero-greeting">{briefing.greeting}</h2>
        <span className="current-live-dot" title="Live signal feed" />
        <span className="current-hero-date">{formatDate(briefing.generated_at)}</span>
      </div>
      <div className="current-hero-items">
        {briefing.items.map((item: BriefingItem, idx: number) => (
          <div key={idx} className="current-hero-item">
            <div className="current-hero-item-icon">{item.icon}</div>
            <div className="current-hero-item-content">
              <div className="current-hero-item-title">{item.title}</div>
              <div className="current-hero-item-body">{item.summary}</div>
              <RelevanceBadge score={item.relevance_score} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
