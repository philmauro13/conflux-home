import { Dream, DreamVelocity } from '../../types';

interface Props {
  dream: Dream;
  velocity: DreamVelocity;
  onSelect: (id: string) => void;
}

export default function HorizonGoalCard({ dream, velocity, onSelect }: Props) {
  return (
    <div className="horizon-goal-card" onClick={() => onSelect(dream.id)}>
      <div className="horizon-goal-header">
        <span className="horizon-goal-emoji">{dream.category === 'career' ? '💼' : dream.category === 'health' ? '💪' : dream.category === 'creative' ? '🎨' : '⭐'}</span>
        <h3 className="horizon-goal-title">{dream.title}</h3>
      </div>
      <div className="horizon-altitude-bar">
        <div className="horizon-altitude-fill" style={{ width: `${velocity.progress_pct}%` }} />
        <span className="horizon-altitude-label">{velocity.progress_pct.toFixed(0)}%</span>
      </div>
      <div className="horizon-goal-meta">
        <span>{velocity.milestones_completed}/{velocity.milestones_total} milestones</span>
        <span className={`horizon-pace ${velocity.pace}`}>{velocity.pace.replace('_', ' ')}</span>
      </div>
    </div>
  );
}
