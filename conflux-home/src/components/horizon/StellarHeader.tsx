interface StellarHeaderProps {
  dreamCount: number;
  activeCount: number;
  velocity: number;
}

export default function StellarHeader({ dreamCount, activeCount, velocity }: StellarHeaderProps) {
  return (
    <div className="stellar-header">
      <div className="stellar-header-content">
        <div className="stellar-logo">
          <span className="stellar-logo-icon">🌌</span>
          <h1 className="stellar-logo-title">HORIZON NAVIGATION</h1>
        </div>
        <div className="stellar-metrics">
          <div className="stellar-metric">
            <span className="stellar-metric-icon">🚀</span>
            <span className="stellar-metric-value">{dreamCount}</span>
            <span className="stellar-metric-label">Dreams</span>
          </div>
          <div className="stellar-metric">
            <span className="stellar-metric-icon">⚡</span>
            <span className="stellar-metric-value">{velocity.toFixed(0)}%</span>
            <span className="stellar-metric-label">Velocity</span>
          </div>
          <div className="stellar-metric">
            <span className="stellar-metric-icon">🎯</span>
            <span className="stellar-metric-value">{activeCount}</span>
            <span className="stellar-metric-label">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
