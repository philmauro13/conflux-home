// InsightCard.tsx — Proactive AI insight cards for Pulse
import '../styles/budget-pulse.css';

interface Insight {
  pattern_type: string;
  message: string;
  severity: string;
  category: string | null;
  amount: number | null;
}

const SEVERITY_ICONS: Record<string, string> = {
  info: '💡',
  warning: '⚠️',
  alert: '🚨',
};

export default function InsightCard({ insight, index }: { insight: Insight; index: number }) {
  return (
    <div
      className={`pulse-insight-card severity-${insight.severity}`}
      style={{ animationDelay: `${index * 0.12}s` }}
    >
      <span className="pulse-insight-icon">{SEVERITY_ICONS[insight.severity]}</span>
      <div>
        <div className="pulse-insight-text">{insight.message}</div>
        {insight.category && (
          <div className="pulse-insight-category">{insight.category}</div>
        )}
      </div>
    </div>
  );
}
