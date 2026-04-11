import { DreamMilestone } from '../../types';

interface Props {
  milestones: DreamMilestone[];
  onComplete: (id: string) => void;
}

export default function HorizonMilestonePath({ milestones, onComplete }: Props) {
  return (
    <div className="horizon-milestone-path">
      {milestones.map((m, i) => (
        <div key={m.id} className={`horizon-milestone ${m.is_completed ? 'completed' : ''}`}>
          <div className="horizon-milestone-dot">
            {m.is_completed ? '✓' : (i + 1)}
          </div>
          <div className="horizon-milestone-line" />
          <div className="horizon-milestone-content">
            <div className="horizon-milestone-title">{m.title}</div>
            {m.target_date && <div className="horizon-milestone-date">{m.target_date}</div>}
            {!m.is_completed && (
              <button className="horizon-milestone-complete" onClick={() => onComplete(m.id)}>Complete</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
