import { KitchenDigest as DigestType } from '../types';

interface Props {
  digest: DigestType;
}

export default function KitchenDigestCard({ digest }: Props) {
  return (
    <div className="kitchen-digest-card">
      <h3 className="kitchen-digest-title">📊 Weekly Digest</h3>
      <div className="kitchen-digest-stats">
        <div className="kitchen-digest-stat">
          <span className="kitchen-digest-value">{digest.meals_cooked}</span>
          <span className="kitchen-digest-label">Meals Cooked</span>
        </div>
        <div className="kitchen-digest-stat">
          <span className="kitchen-digest-value">{digest.variety_score.toFixed(0)}%</span>
          <span className="kitchen-digest-label">Variety Score</span>
        </div>
        <div className="kitchen-digest-stat">
          <span className="kitchen-digest-value">${digest.estimated_savings.toFixed(0)}</span>
          <span className="kitchen-digest-label">Est. Savings</span>
        </div>
      </div>
      <p className="kitchen-digest-suggestion">{digest.suggestion}</p>
    </div>
  );
}
