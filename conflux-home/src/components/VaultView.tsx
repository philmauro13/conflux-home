import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { VaultFile, VaultProject, VaultTag, VaultStats, VaultViewMode } from '../types';
import VaultSidebar from './VaultSidebar';
import VaultFileCard from './VaultFileCard';
import VaultSearchBar from './VaultSearchBar';
import VaultToolbar from './VaultToolbar';
import '../styles-vault.css';

export default function VaultView() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [projects, setProjects] = useState<VaultProject[]>([]);
  const [tags, setTags] = useState<VaultTag[]>([]);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [viewMode, setViewMode] = useState<VaultViewMode>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<'recent' | 'favorites' | 'all' | 'projects' | string>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      if (searchQuery) {
        const result = await invoke<VaultFile[]>('vault_search_files', { query: searchQuery });
        setFiles(result);
      } else if (activeSection === 'recent') {
        const result = await invoke<VaultFile[]>('vault_get_recent', { limit: 50 });
        setFiles(result);
      } else if (activeSection === 'favorites') {
        const result = await invoke<VaultFile[]>('vault_get_favorites');
        setFiles(result);
      } else if (activeSection === 'all') {
        const result = await invoke<VaultFile[]>('vault_get_files', { file_type: null, limit: 100, offset: 0 });
        setFiles(result);
      } else {
        // file type filter
        const result = await invoke<VaultFile[]>('vault_get_files', { file_type: activeSection, limit: 100, offset: 0 });
        setFiles(result);
      }
    } catch (e) {
      console.error('Failed to load files:', e);
      setFiles([]);
    }
    setLoading(false);
  }, [activeSection, searchQuery]);

  const loadProjects = useCallback(async () => {
    try {
      const result = await invoke<VaultProject[]>('vault_get_projects');
      setProjects(result);
    } catch (e) { console.error('Failed to load projects:', e); }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const result = await invoke<VaultTag[]>('vault_get_tags');
      setTags(result);
    } catch (e) { console.error('Failed to load tags:', e); }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const result = await invoke<[number, number, number]>('vault_get_stats');
      setStats({ total_files: result[0], total_size: result[1], total_projects: result[2] });
    } catch (e) { console.error('Failed to load stats:', e); }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);
  useEffect(() => { loadProjects(); loadTags(); loadStats(); }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleToggleFavorite = async (id: string) => {
    await invoke('vault_toggle_favorite', { id });
    loadFiles();
  };

  const handleDelete = async (id: string) => {
    await invoke('vault_delete_file', { id });
    loadFiles();
    loadStats();
  };

  const handleCreateProject = async () => {
    const name = prompt('Project name:');
    if (!name) return;
    await invoke('vault_create_project', { name, description: null, project_type: null });
    loadProjects();
  };

  const handleEditProject = async (id: string, name: string, description: string | null) => {
    await invoke('vault_edit_project', { id, name, description });
    loadProjects();
  };

  const handleDeleteProject = async (id: string) => {
    await invoke('vault_delete_project', { id });
    if (activeSection === `project:${id}`) {
      setActiveSection('recent');
    }
    loadProjects();
  };

  const handleScan = async () => {
    // Scan the vault directory
    const home = '/home/calo/.conflux/vault';
    await invoke('vault_scan_directory', { dir_path: home });
    loadFiles();
    loadStats();
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(1)} GB`;
  };

  return (
    <div className="vault-container">
      {/* Hero Header */}
      <div className="vault-hero">
        <div className="vault-hero-glow" />
        <div className="vault-hero-content">
          <div className="vault-hero-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M32 4L8 14V28C8 42.36 18.24 55.64 32 60C45.76 55.64 56 42.36 56 28V14L32 4Z" fill="url(#shield_grad)" opacity="0.2"/>
              <path d="M32 4L8 14V28C8 42.36 18.24 55.64 32 60C45.76 55.64 56 42.36 56 28V14L32 4Z" stroke="url(#shield_grad)" strokeWidth="2" fill="none"/>
              <path d="M24 32L29 37L40 26" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="32" cy="28" r="6" fill="none" stroke="#8b5cf6" strokeWidth="1.5" opacity="0.5"/>
              <defs>
                <linearGradient id="shield_grad" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#8b5cf6"/>
                  <stop offset="1" stopColor="#3b82f6"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="vault-hero-title">Vault</h1>
          <p className="vault-hero-sub">Encrypted file storage & project folders</p>
        </div>
      </div>

      <VaultSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        projects={projects}
        tags={tags}
        onCreateProject={handleCreateProject}
        onEditProject={handleEditProject}
        onDeleteProject={handleDeleteProject}
      />
      <div className="vault-main">
        <VaultSearchBar query={searchQuery} onQueryChange={setSearchQuery} />
        <VaultToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onScan={handleScan}
          onCreateProject={handleCreateProject}
        />
        <div className="vault-content-area">
          {loading ? (
            <div className="vault-empty">
              <svg className="vault-empty-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M32 4L8 14V28C8 42.36 18.24 55.64 32 60C45.76 55.64 56 42.36 56 28V14L32 4Z" stroke="#8b5cf6" strokeWidth="2" fill="none" opacity="0.4"/>
                <path d="M24 32L29 37L40 26" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
              </svg>
              <div className="vault-empty-title">Loading...</div>
            </div>
          ) : files.length === 0 ? (
            <div className="vault-empty">
              <svg className="vault-empty-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M32 4L8 14V28C8 42.36 18.24 55.64 32 60C45.76 55.64 56 42.36 56 28V14L32 4Z" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
                <circle cx="32" cy="28" r="8" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
                <path d="M32 20V28" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <div className="vault-empty-title">
                {searchQuery ? 'No results found' : 'Vault is empty'}
              </div>
              <div className="vault-empty-desc">
                {searchQuery
                  ? `No files match "${searchQuery}"`
                  : 'Click "Scan" to index your vault directory, or files will appear here as your agents create them.'}
              </div>
              {!searchQuery && (
                <button className="vault-btn-primary" onClick={handleScan}>Scan Vault Directory</button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="vault-grid">
              {files.map(file => (
                <VaultFileCard
                  key={file.id}
                  file={file}
                  selected={selectedIds.has(file.id)}
                  onSelect={() => toggleSelect(file.id)}
                  onToggleFavorite={() => handleToggleFavorite(file.id)}
                  onDelete={() => handleDelete(file.id)}
                />
              ))}
            </div>
          ) : viewMode === 'list' ? (
            <div className="vault-list-view">
              <div className="vault-list-header">
                <div></div>
                <div>Name</div>
                <div>Type</div>
                <div>Size</div>
                <div>Modified</div>
                <div>Agent</div>
                <div></div>
              </div>
              {files.map(file => (
                <div key={file.id} className="vault-list-row" onClick={() => toggleSelect(file.id)}>
                  <div className="vault-list-icon">{getFileEmoji(file.file_type)}</div>
                  <div className="vault-list-name">{file.name}</div>
                  <div className="vault-list-cell">{file.extension || file.file_type}</div>
                  <div className="vault-list-cell">{formatSize(file.size_bytes)}</div>
                  <div className="vault-list-cell">{formatDate(file.updated_at)}</div>
                  <div className="vault-list-cell">{file.created_by ? '🤖' : '—'}</div>
                  <div>{file.is_favorite ? '⭐' : ''}</div>
                </div>
              ))}
            </div>
          ) : (
            // Timeline view
            <div className="vault-timeline">
              {groupByDate(files).map(([date, dateFiles]) => (
                <div key={date}>
                  <div className="vault-timeline-date">{date}</div>
                  <div className="vault-timeline-files">
                    {dateFiles.map(file => (
                      <VaultFileCard
                        key={file.id}
                        file={file}
                        selected={selectedIds.has(file.id)}
                        onSelect={() => toggleSelect(file.id)}
                        onToggleFavorite={() => handleToggleFavorite(file.id)}
                        onDelete={() => handleDelete(file.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {stats && (
          <div className="vault-stats-bar">
            <div className="vault-stat">
              <span>📁</span>
              <span className="vault-stat-value">{stats.total_files}</span> files
            </div>
            <div className="vault-stat">
              <span>💾</span>
              <span className="vault-stat-value">{formatSize(stats.total_size)}</span>
            </div>
            <div className="vault-stat">
              <span>📂</span>
              <span className="vault-stat-value">{stats.total_projects}</span> projects
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getFileEmoji(type: string): string {
  const map: Record<string, string> = {
    image: '🖼️', audio: '🎵', video: '🎬', code: '💻',
    document: '📄', archive: '📦', other: '📎',
  };
  return map[type] || '📎';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString();
}

function groupByDate(files: VaultFile[]): [string, VaultFile[]][] {
  const groups = new Map<string, VaultFile[]>();
  for (const f of files) {
    const date = new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(f);
  }
  return Array.from(groups.entries());
}
