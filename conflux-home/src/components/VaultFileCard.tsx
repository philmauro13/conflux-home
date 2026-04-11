import { VaultFile } from '../types';

interface Props {
  file: VaultFile;
  selected: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}

function getFileEmoji(type: string): string {
  const map: Record<string, string> = {
    image: '🖼️', audio: '🎵', video: '🎬', code: '💻',
    document: '📄', archive: '📦', other: '📎',
  };
  return map[type] || '📎';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

export default function VaultFileCard({ file, selected, onSelect, onToggleFavorite, onDelete }: Props) {
  return (
    <div className={`vault-file-card ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="vault-file-thumb">
        {file.file_type === 'image' && file.thumbnail_path ? (
          <img src={`file://${file.thumbnail_path}`} alt={file.name} loading="lazy" />
        ) : file.file_type === 'image' ? (
          <img src={`file://${file.path}`} alt={file.name} loading="lazy" />
        ) : (
          <div className="vault-file-icon-large">{getFileEmoji(file.file_type)}</div>
        )}
        <div className="vault-file-type-badge">{file.extension || file.file_type}</div>
        <span className={`vault-file-favorite ${file.is_favorite ? 'is-fav' : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}>
          {file.is_favorite ? '⭐' : '☆'}
        </span>
      </div>
      <div className="vault-file-info">
        <div className="vault-file-name" title={file.name}>{file.name}</div>
        <div className="vault-file-meta">
          <span>{formatSize(file.size_bytes)}</span>
          {file.created_by && <span className="vault-file-agent">🤖</span>}
        </div>
      </div>
    </div>
  );
}
