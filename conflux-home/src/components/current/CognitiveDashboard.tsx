import React from 'react';
import type { CognitivePattern, CategoryDistribution } from '../../types';

interface CognitiveDashboardProps {
  pattern: CognitivePattern | null;
  loading: boolean;
}

function MetricCard({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <div className="current-cognitive-card">
      <div className="current-cognitive-card-icon">{icon}</div>
      <div className="current-cognitive-card-value">{value}</div>
      <div className="current-cognitive-card-label">{label}</div>
    </div>
  );
}

function CategoryBar({ dist }: { dist: CategoryDistribution }) {
  const trendIcon = dist.trend === 'up' ? '↑' : dist.trend === 'down' ? '↓' : '→';
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
        <span>{dist.category}</span>
        <span style={{ opacity: 0.6 }}>{dist.percentage}% {trendIcon}</span>
      </div>
      <div className="current-cognitive-bar">
        <div className="current-cognitive-bar-fill" style={{ width: `${dist.percentage}%` }} />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="current-cognitive">
      <div className="current-cognitive-header">
        <h3>Cognitive Dashboard</h3>
      </div>
      <div className="current-cognitive-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="current-cognitive-card" style={{ opacity: 0.15 }}>
            <div className="current-cognitive-card-icon">⏳</div>
            <div className="current-cognitive-card-value">--</div>
            <div className="current-cognitive-card-label">Loading</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CognitiveDashboard({ pattern, loading }: CognitiveDashboardProps) {
  if (loading && !pattern) return <LoadingState />;
  if (!pattern) return (
    <div className="current-cognitive">
      <div className="current-cognitive-header">
        <h3>Cognitive Dashboard</h3>
      </div>
      <p style={{ opacity: 0.5, padding: '1rem' }}>Not enough data yet. Keep reading to build your profile.</p>
    </div>
  );

  const totalCategories = pattern.category_distribution.length;
  const topCategory = pattern.category_distribution[0];

  return (
    <div className="current-cognitive">
      <div className="current-cognitive-header">
        <h3>Cognitive Dashboard</h3>
        <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>{pattern.time_range}</span>
      </div>

      <div className="current-cognitive-grid">
        <MetricCard
          icon="📊"
          value={`${totalCategories}`}
          label="Categories Tracked"
        />
        <MetricCard
          icon="🎯"
          value={topCategory?.category || 'N/A'}
          label="Top Focus Area"
        />
        <MetricCard
          icon="📈"
          value={pattern.tone_trend}
          label="Tone Trend"
        />
        <MetricCard
          icon="🔍"
          value={`${pattern.blind_spots.length}`}
          label="Blind Spots"
        />
      </div>

      <div style={{ marginTop: '16px' }}>
        <h4 style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '8px' }}>Category Distribution</h4>
        {pattern.category_distribution.map((dist) => (
          <CategoryBar key={dist.category} dist={dist} />
        ))}
      </div>

      {pattern.blind_spots.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <h4 style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '8px' }}>Blind Spots</h4>
          <ul style={{ paddingLeft: '1.2rem', opacity: 0.7, fontSize: '0.85rem' }}>
            {pattern.blind_spots.map((spot, i) => (
              <li key={i} style={{ marginBottom: '4px' }}>{spot}</li>
            ))}
          </ul>
        </div>
      )}

      {pattern.focus_shift && (
        <div style={{ marginTop: '16px' }}>
          <h4 style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '4px' }}>Focus Shift</h4>
          <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>{pattern.focus_shift}</p>
        </div>
      )}

      {pattern.recommendation && (
        <div style={{
          marginTop: '16px',
          background: 'rgba(100, 180, 255, 0.06)',
          border: '1px solid rgba(100, 180, 255, 0.15)',
          borderRadius: '10px',
          padding: '12px 16px',
        }}>
          <h4 style={{ fontSize: '0.85rem', marginBottom: '4px' }}>💡 Recommendation</h4>
          <p style={{ fontSize: '0.85rem', opacity: 0.85 }}>{pattern.recommendation}</p>
        </div>
      )}
    </div>
  );
}
