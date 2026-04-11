import { VaultViewMode } from '../types';

interface Props {
  viewMode: VaultViewMode;
  onViewModeChange: (mode: VaultViewMode) => void;
  onScan: () => void;
  onCreateProject: () => void;
}

export default function VaultToolbar({ viewMode, onViewModeChange, onScan, onCreateProject }: Props) {
  return (
    <div className="vault-toolbar">
      <div className="vault-toolbar-group">
        <button className={`vault-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => onViewModeChange('grid')} title="Grid view">⊞</button>
        <button className={`vault-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => onViewModeChange('list')} title="List view">☰</button>
        <button className={`vault-view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
                onClick={() => onViewModeChange('timeline')} title="Timeline view">⏱</button>
      </div>
      <div className="vault-toolbar-group">
        <button className="vault-btn-secondary" onClick={onScan}>🔄 Scan</button>
        <button className="vault-btn-primary" onClick={onCreateProject}>+ New Project</button>
      </div>
    </div>
  );
}
