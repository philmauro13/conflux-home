import { useStudio } from '../hooks/useStudio';
import { convertFileSrc } from '@tauri-apps/api/core';
import { STUDIO_MODULES } from '../types';

function getThumbnailUrl(gen: { output_url: string | null; output_path: string | null }): string | null {
  if (gen.output_url?.startsWith('http')) return gen.output_url;
  if (gen.output_path) return convertFileSrc(gen.output_path);
  return null;
}

export default function HistoryStrip() {
  const { generations, selectedGeneration, selectGeneration } = useStudio();

  if (generations.length === 0) {
    return null;
  }

  return (
    <div className="studio-history-strip">
      <div className="history-strip-header">
        <span className="history-strip-title">History</span>
      </div>
      <div className="history-strip-scroll">
        {generations.map((gen) => {
          const thumb = getThumbnailUrl(gen);
          const isActive = selectedGeneration?.id === gen.id;
          const mod = STUDIO_MODULES[gen.module];

          return (
            <button
              key={gen.id}
              className={`history-strip-item ${isActive ? 'active' : ''}`}
              onClick={() => selectGeneration(gen)}
              title={`${mod.icon} ${gen.prompt}`}
            >
              {thumb ? (
                <img src={thumb} alt={gen.prompt} className="history-strip-thumb" />
              ) : (
                <div className="history-strip-placeholder">
                  {mod.icon}
                </div>
              )}
              <span className="history-strip-module-badge">{mod.icon}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
