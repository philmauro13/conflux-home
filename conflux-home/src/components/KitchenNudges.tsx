import { KitchenNudge } from '../types';

interface Props {
  nudges: KitchenNudge[];
  onAction: (nudge: KitchenNudge) => void;
}

export default function KitchenNudges({ nudges, onAction }: Props) {
  if (nudges.length === 0) return null;
  return (
    <div className="kitchen-nudges">
      {nudges.map((n, i) => (
        <div key={i} className="kitchen-nudge-card" onClick={() => onAction(n)}>
          <span className="kitchen-nudge-emoji">{n.emoji}</span>
          <div className="kitchen-nudge-content">
            <p className="kitchen-nudge-message">{n.message}</p>
            <span className="kitchen-nudge-action">{n.action_label} →</span>
          </div>
        </div>
      ))}
    </div>
  );
}
