import { STUDIO_MODULES, StudioGeneration } from '../types';

interface StudioHistoryProps {
  generations: StudioGeneration[];
  selectedId: string | null;
  onSelect: (generation: StudioGeneration) => void;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function StudioHistory({ generations, selectedId, onSelect }: StudioHistoryProps) {
  if (generations.length === 0) {
    return (
      <div className="studio-history">
        <div className="studio-history-title">Generation History</div>
        <div className="studio-history-empty">No generations yet — create something!</div>
      </div>
    );
  }

  return (
    <div className="studio-history">
      <div className="studio-history-title">Generation History</div>
      <div className="studio-history-scroll">
        {generations.map((gen) => {
          const mod = STUDIO_MODULES[gen.module];
          const isActive = gen.id === selectedId;
          return (
            <button
              key={gen.id}
              className={`studio-history-card ${isActive ? 'studio-history-card-active' : ''}`}
              onClick={() => onSelect(gen)}
              title={gen.prompt}
            >
              {gen.output_url ? (
                <img
                  className="studio-history-thumb"
                  src={gen.output_url}
                  alt={gen.prompt}
                />
              ) : (
                <div className="studio-history-thumb-placeholder">
                  {mod.icon}
                </div>
              )}
              <span className="studio-history-module-badge">{mod.icon}</span>
              <div className="studio-history-card-info">
                <span className="studio-history-card-prompt">
                  {gen.prompt.length > 30 ? gen.prompt.slice(0, 30) + '…' : gen.prompt}
                </span>
                <span className="studio-history-card-time">{formatRelativeTime(gen.created_at)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
