import { DreamVelocity } from '../../types';

interface Props {
  velocity: DreamVelocity;
}

export default function HorizonVelocity({ velocity }: Props) {
  return (
    <div className="horizon-velocity-card">
      <h3 className="horizon-velocity-title">📊 Velocity</h3>
      <div className="horizon-velocity-stats">
        <div className="horizon-velocity-stat">
          <span className="horizon-velocity-value">{velocity.milestones_completed}/{velocity.milestones_total}</span>
          <span className="horizon-velocity-label">Milestones</span>
        </div>
        <div className="horizon-velocity-stat">
          <span className="horizon-velocity-value">{velocity.tasks_completed}/{velocity.tasks_total}</span>
          <span className="horizon-velocity-label">Tasks</span>
        </div>
        <div className="horizon-velocity-stat">
          <span className="horizon-velocity-value">{velocity.progress_pct.toFixed(0)}%</span>
          <span className="horizon-velocity-label">Progress</span>
        </div>
      </div>
      <div className={`horizon-pace-indicator ${velocity.pace}`}>
        {velocity.pace === 'ahead' ? '🚀 Ahead of schedule' : velocity.pace === 'on_track' ? '✅ On track' : '🐢 Behind schedule'}
      </div>
    </div>
  );
}
