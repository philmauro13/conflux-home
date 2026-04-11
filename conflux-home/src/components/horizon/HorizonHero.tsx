import { DreamVelocity } from '../../types';

interface Props {
  title: string;
  velocity: DreamVelocity | null;
}

export default function HorizonHero({ title, velocity }: Props) {
  const pct = velocity?.progress_pct ?? 0;

  return (
    <div className="horizon-hero">
      <div className="horizon-sky" />
      <div className="horizon-mountains" />
      <div className="horizon-summit-glow" style={{ opacity: pct / 100 }} />
      <div className="horizon-hero-content">
        <h2 className="horizon-hero-title">⭐ {title}</h2>
        {velocity && (
          <div className="horizon-hero-stats">
            <span className="horizon-pace-badge" data-pace={velocity.pace}>
              {velocity.pace === 'ahead' ? '🚀 Ahead' : velocity.pace === 'on_track' ? '✅ On Track' : '🐢 Behind'}
            </span>
            {velocity.days_remaining !== null && (
              <span className="horizon-days">{velocity.days_remaining} days left</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
