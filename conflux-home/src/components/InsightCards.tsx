import React, { useEffect, useState } from 'react';
import { useCrossAppInsights, type OrbitInsight } from '../hooks/useCrossAppInsights';
import { playOrbitInsightDiscovered } from '../lib/sound';

interface InsightCardsProps {
  insights?: OrbitInsight[];
}

const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
};

const APP_ICONS: Record<string, string> = {
  budget: '💰',
  kitchen: '🍳',
  dreams: '🎯',
  orbit: '🌀',
};

function InsightCard({ insight }: { insight: OrbitInsight }) {
  const color = PRIORITY_COLORS[insight.priority] ?? '#3b82f6';
  
  return (
    <div className="mc-insight-card" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="mc-insight-header">
        <span className="mc-insight-icon">{insight.icon}</span>
        <span className="mc-insight-title">{insight.title}</span>
        <span className="mc-insight-confidence" style={{ color }}>
          {Math.round(insight.confidence * 100)}% confidence
        </span>
      </div>
      
      <p className="mc-insight-message">{insight.message}</p>
      
      <div className="mc-insight-sources">
        {insight.source_apps.map(app => (
          <span key={app} className="mc-source-badge">
            {APP_ICONS[app] ?? '📋'} {app}
          </span>
        ))}
      </div>
      
      {insight.action_suggestion && (
        <button className="mc-insight-action">
          → {insight.action_suggestion}
        </button>
      )}
    </div>
  );
}

export function InsightCards({ insights: propInsights }: InsightCardsProps) {
  const { insights: hookInsights, loading } = useCrossAppInsights();
  const insights = propInsights ?? hookInsights;
  const [isVisible, setIsVisible] = useState(false);
  
  // Trigger insight sound when insights load
  useEffect(() => {
    if (!loading && insights.length > 0 && !isVisible) {
      playOrbitInsightDiscovered();
      // Staggered entry animation
      setTimeout(() => setIsVisible(true), 100);
    }
  }, [loading, insights.length, isVisible]);
  
  if (loading) {
    return <div className="mc-insights-loading">Synthesizing insights...</div>;
  }
  
  if (insights.length === 0) {
    return (
      <div className="mc-insights-empty">
        <p>🧠 No cross-app insights yet.</p>
        <p className="mc-insights-hint">Insights appear when patterns are detected across your apps.</p>
      </div>
    );
  }
  
  return (
    <div className="mc-insights-section">
      <h3 className="mc-section-title">🧠 Cross-App Intelligence</h3>
      <div className="mc-insights-grid">
        {insights.map((insight, index) => (
          <div
            key={insight.id}
            className={`mc-insight-card-wrapper${isVisible ? ' visible' : ''}`}
            style={{ animationDelay: `${index * 0.08}s` }}
          >
            <InsightCard insight={insight} />
          </div>
        ))}
      </div>
    </div>
  );
}
