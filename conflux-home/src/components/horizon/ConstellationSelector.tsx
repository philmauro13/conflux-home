import type { Dream } from '../../types';

interface ConstellationSelectorProps {
  dreams: Dream[];
  selectedDreamId: string | null;
  onSelect: (dreamId: string) => void;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  housing: '🏠',
  education: '🎓',
  health: '💪',
  career: '💼',
  travel: '✈️',
  family: '👨‍👩‍👧‍👦',
  personal: '🌟',
  financial: '💰',
  creative: '🎨',
};

export default function ConstellationSelector({
  dreams,
  selectedDreamId,
  onSelect,
}: ConstellationSelectorProps) {
  return (
    <div className="constellation-selector">
      <h3 className="constellation-selector-label">SELECT CONSTELLATION</h3>
      <div className="constellation-list">
        {dreams.map((dream) => (
          <button
            key={dream.id}
            className={`constellation-item ${selectedDreamId === dream.id ? 'active' : ''}`}
            onClick={() => onSelect(dream.id)}
          >
            <span className="constellation-emoji">
              {CATEGORY_EMOJIS[dream.category] || '✨'}
            </span>
            <span className="constellation-name">{dream.title}</span>
            <div className="constellation-progress-bar">
              <div
                className="constellation-progress-fill"
                style={{ width: `${dream.progress}%` }}
              />
            </div>
            <span className="constellation-pct">{dream.progress.toFixed(0)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}
