import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { VaultProject, VaultTag } from '../types';

interface Props {
  activeSection: string;
  onSectionChange: (section: string) => void;
  projects: VaultProject[];
  tags: VaultTag[];
  onCreateProject: () => void;
  onEditProject: (id: string, name: string, description: string | null) => void;
  onDeleteProject: (id: string) => void;
}

const SECTIONS = [
  { key: 'recent', icon: '🕐', label: 'Recent' },
  { key: 'favorites', icon: '⭐', label: 'Favorites' },
  { key: 'all', icon: '📁', label: 'All Files' },
];

const FILE_TYPES = [
  { key: 'image', icon: '🖼️', label: 'Images' },
  { key: 'audio', icon: '🎵', label: 'Audio' },
  { key: 'video', icon: '🎬', label: 'Video' },
  { key: 'code', icon: '💻', label: 'Code' },
  { key: 'document', icon: '📄', label: 'Documents' },
];

export default function VaultSidebar({ activeSection, onSectionChange, projects, tags, onCreateProject, onEditProject, onDeleteProject }: Props) {
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);

  const handleEdit = (e: React.MouseEvent, project: VaultProject) => {
    e.stopPropagation();
    const newName = prompt('Rename project:', project.name);
    if (newName && newName.trim() && newName.trim() !== project.name) {
      onEditProject(project.id, newName.trim(), project.description ?? null);
    }
  };

  const handleDelete = (e: React.MouseEvent, project: VaultProject) => {
    e.stopPropagation();
    if (confirm(`Delete project "${project.name}"? This won't delete the files.`)) {
      onDeleteProject(project.id);
    }
  };

  return (
    <div className="vault-sidebar">
      <div className="vault-sidebar-section">
        <div className="vault-sidebar-title">Browse</div>
        <ul className="vault-folder-tree">
          {SECTIONS.map(s => (
            <li key={s.key} className={`vault-folder-item ${activeSection === s.key ? 'active' : ''}`}
                onClick={() => onSectionChange(s.key)}>
              <span className="vault-folder-icon">{s.icon}</span>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="vault-sidebar-section">
        <div className="vault-sidebar-title">File Types</div>
        <ul className="vault-folder-tree">
          {FILE_TYPES.map(t => (
            <li key={t.key} className={`vault-folder-item ${activeSection === t.key ? 'active' : ''}`}
                onClick={() => onSectionChange(t.key)}>
              <span className="vault-folder-icon">{t.icon}</span>
              <span>{t.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="vault-sidebar-section">
        <div className="vault-sidebar-title">Projects</div>
        <ul className="vault-project-list">
          {projects.map(p => (
            <li
              key={p.id}
              className={`vault-project-item ${activeSection === `project:${p.id}` ? 'active' : ''}`}
              onClick={() => onSectionChange(`project:${p.id}`)}
              onMouseEnter={() => setHoveredProject(p.id)}
              onMouseLeave={() => setHoveredProject(null)}
            >
              <span className="vault-project-icon">📂</span>
              <div className="vault-project-meta">
                <span className="vault-project-name">{p.name}</span>
                <span className="vault-project-file-count">{p.file_count} files</span>
              </div>
              {hoveredProject === p.id && (
                <div className="vault-project-actions">
                  <button className="vault-project-action-btn" onClick={(e) => handleEdit(e, p)} title="Rename">✏️</button>
                  <button className="vault-project-action-btn vault-project-action-delete" onClick={(e) => handleDelete(e, p)} title="Delete">🗑️</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <button className="vault-btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={onCreateProject}>
          + New Project
        </button>
      </div>

      {tags.length > 0 && (
        <div className="vault-sidebar-section">
          <div className="vault-sidebar-title">Tags</div>
          <div className="vault-tag-cloud">
            {tags.map(t => (
              <span key={t.id} className={`vault-tag-pill ${activeSection === `tag:${t.name}` ? 'active' : ''}`}
                    onClick={() => onSectionChange(`tag:${t.name}`)}
                    style={t.color ? { borderColor: t.color } : undefined}>
                {t.name} ({t.file_count})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
