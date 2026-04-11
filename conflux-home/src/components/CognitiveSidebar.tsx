import React from 'react';
import type { CognitivePattern, CategoryDistribution } from '../types';

interface CognitiveSidebarProps {
  pattern: CognitivePattern | null;
  loading: boolean;
  onAnalyze?: () => void;
}

function getColorForIndex(index: number): string {
  const colors = ['cyan', 'emerald', 'amber', 'violet'];
  return colors[index % colors.length];
}

function getCategoryColor(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes('budget') || cat.includes('money') || cat.includes('finance')) return 'emerald';
  if (cat.includes('dream') || cat.includes('goal') || cat.includes('aspir')) return 'amber';
  if (cat.includes('creative') || cat.includes('design') || cat.includes('art')) return 'violet';
  return 'cyan';
}

function TrendMiniChart({ data }: { data: number[] }) {
  // Normalize data to 0-40 range for SVG
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 40 - ((val - min) / range) * 40;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `0,40 ${points} 100,40`;

  return (
    <svg className="cognitive-trend-chart" viewBox="0 0 100 40" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--radar-cyan)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--radar-cyan)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon className="cognitive-trend-area" points={areaPoints} />
      <polyline className="cognitive-trend-line" points={points} />
    </svg>
  );
}

export default function CognitiveSidebar({ pattern, loading, onAnalyze }: CognitiveSidebarProps) {
  if (loading && !pattern) {
    return (
      <div className="cognitive-sidebar">
        <h3 className="cognitive-sidebar-title">Intelligence</h3>
        <div style={{ opacity: 0.3, fontFamily: 'var(--radar-font-mono)', fontSize: '0.8rem' }}>
          Analyzing cognitive patterns...
        </div>
      </div>
    );
  }

  if (!pattern) {
    return (
      <div className="cognitive-sidebar">
        <h3 className="cognitive-sidebar-title">Intelligence</h3>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px', opacity: 0.4 }}>🧠</div>
          <p style={{
            fontFamily: 'var(--radar-font-mono)',
            fontSize: '0.7rem',
            color: 'var(--radar-text-muted)',
            margin: '0 0 14px 0',
          }}>
            No cognitive data yet
          </p>
          {onAnalyze && (
            <button
              onClick={onAnalyze}
              style={{
                fontFamily: 'var(--radar-font-mono)',
                fontSize: '0.65rem',
                padding: '8px 14px',
                background: 'var(--radar-surface)',
                border: '1px solid var(--radar-border)',
                borderRadius: 'var(--radar-radius-sm)',
                color: 'var(--radar-text-secondary)',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Run Analysis
            </button>
          )}
        </div>
      </div>
    );
  }

  // Derived stats
  const totalCategories = pattern.category_distribution.length;
  const topCategory = pattern.category_distribution[0];
  const readingVelocity = pattern.category_distribution.reduce((sum, c) => sum + c.count, 0);

  // Fake trend data from category distribution (for visualization)
  const trendData = pattern.category_distribution.map(c => c.percentage);

  return (
    <div className="cognitive-sidebar">
      <h3 className="cognitive-sidebar-title">Intelligence</h3>

      {/* Learning Velocity */}
      <div className="cognitive-stat">
        <div className="cognitive-stat-label">Learning Velocity</div>
        <div className="cognitive-stat-value">{readingVelocity}</div>
        <div className="cognitive-stat-trend stable">
          signals this period
        </div>
      </div>

      {/* Categories tracked */}
      <div className="cognitive-stat">
        <div className="cognitive-stat-label">Focus Areas</div>
        <div className="cognitive-stat-value">{totalCategories}</div>
        <div className="cognitive-stat-trend stable">
          active categories
        </div>
      </div>

      {/* Top focus */}
      {topCategory && (
        <div className="cognitive-stat">
          <div className="cognitive-stat-label">Primary Focus</div>
          <div className="cognitive-stat-value" style={{ fontSize: '1rem' }}>
            {topCategory.category}
          </div>
          <div className={`cognitive-stat-trend ${topCategory.trend === 'up' ? 'up' : topCategory.trend === 'down' ? 'down' : 'stable'}`}>
            {topCategory.trend === 'up' ? '↑' : topCategory.trend === 'down' ? '↓' : '→'} {topCategory.percentage}%
          </div>
        </div>
      )}

      {/* Trend chart */}
      <TrendMiniChart data={trendData} />

      {/* Category breakdown */}
      <div className="cognitive-categories">
        <div className="cognitive-stat-label" style={{ marginBottom: '10px' }}>Distribution</div>
        {pattern.category_distribution.map((dist, idx) => {
          const colorClass = getCategoryColor(dist.category);
          return (
            <div key={dist.category} className="cognitive-category-item">
              <span className="cognitive-category-name">
                <span className={`cognitive-category-dot ${colorClass}`} />
                {dist.category}
              </span>
              <span className="cognitive-category-pct">{dist.percentage}%</span>
            </div>
          );
        })}
      </div>

      {/* Tone trend */}
      {pattern.tone_trend && (
        <div className="cognitive-stat" style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--radar-border)' }}>
          <div className="cognitive-stat-label">Tone</div>
          <div style={{
            fontFamily: 'var(--radar-font-mono)',
            fontSize: '0.8rem',
            color: 'var(--radar-text-secondary)',
          }}>
            {pattern.tone_trend}
          </div>
        </div>
      )}

      {/* Blind spots */}
      {pattern.blind_spots && pattern.blind_spots.length > 0 && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--radar-border)' }}>
          <div className="cognitive-stat-label" style={{ marginBottom: '6px' }}>Blind Spots</div>
          <ul style={{
            paddingLeft: '14px',
            margin: 0,
            fontSize: '0.7rem',
            color: 'var(--radar-text-muted)',
            fontFamily: 'var(--radar-font-mono)',
          }}>
            {pattern.blind_spots.slice(0, 3).map((spot, i) => (
              <li key={i} style={{ marginBottom: '3px' }}>{spot}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendation */}
      {pattern.recommendation && (
        <div style={{
          marginTop: '14px',
          padding: '12px',
          background: 'rgba(6, 182, 212, 0.06)',
          border: '1px solid rgba(6, 182, 212, 0.15)',
          borderRadius: 'var(--radar-radius-sm)',
        }}>
          <div className="cognitive-stat-label" style={{ marginBottom: '4px', color: 'var(--radar-cyan)' }}>
            💡 Insight
          </div>
          <p style={{
            fontSize: '0.7rem',
            color: 'var(--radar-text-secondary)',
            lineHeight: 1.4,
            margin: 0,
          }}>
            {pattern.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}
