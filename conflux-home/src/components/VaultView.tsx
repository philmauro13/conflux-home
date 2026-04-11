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
        const result = await invoke<VaultFile[]>('vault_get_files', { fileType: null, limit: 100, offset: 0 });
        setFiles(result);
      } else {
        // file type filter
        const result = await invoke<VaultFile[]>('vault_get_files', { fileType: activeSection, limit: 100, offset: 0 });
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
    await invoke('vault_create_project', { name, description: null, projectType: null });
    loadProjects();
  };

  const handleScan = async () => {
    // Scan the vault directory
    const home = '/home/calo/.conflux/vault';
    await invoke('vault_scan_directory', { dirPath: home });
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
      <VaultSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        projects={projects}
        tags={tags}
        onCreateProject={handleCreateProject}
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
              <div className="vault-empty-icon">⏳</div>
              <div className="vault-empty-title">Loading...</div>
            </div>
          ) : files.length === 0 ? (
            <div className="vault-empty">
              <div className="vault-empty-icon">📦</div>
              <div className="vault-empty-title">
                {searchQuery ? 'No results found' : 'No files yet'}
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
