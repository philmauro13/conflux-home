import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { VaultFile, VaultProject, VaultProjectDetail, VaultTag, VaultStats } from '../types';

export function useVault() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanDirectory = useCallback(async (dirPath: string): Promise<VaultFile[]> => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<VaultFile[]>('vault_scan_directory', { dirPath });
      setLoading(false);
      return result;
    } catch (e) {
      setError(String(e));
      setLoading(false);
      return [];
    }
  }, []);

  const getFiles = useCallback(async (fileType?: string, limit = 100, offset = 0): Promise<VaultFile[]> => {
    try {
      return await invoke<VaultFile[]>('vault_get_files', { fileType: fileType || null, limit, offset });
    } catch (e) { setError(String(e)); return []; }
  }, []);

  const searchFiles = useCallback(async (query: string): Promise<VaultFile[]> => {
    try {
      return await invoke<VaultFile[]>('vault_search_files', { query });
    } catch (e) { setError(String(e)); return []; }
  }, []);

  const getFile = useCallback(async (id: string): Promise<VaultFile | null> => {
    try {
      return await invoke<VaultFile | null>('vault_get_file', { id });
    } catch (e) { setError(String(e)); return null; }
  }, []);

  const deleteFile = useCallback(async (id: string): Promise<boolean> => {
    try {
      await invoke('vault_delete_file', { id });
      return true;
    } catch (e) { setError(String(e)); return false; }
  }, []);

  const toggleFavorite = useCallback(async (id: string): Promise<boolean> => {
    try {
      await invoke('vault_toggle_favorite', { id });
      return true;
    } catch (e) { setError(String(e)); return false; }
  }, []);

  const getRecent = useCallback(async (limit = 20): Promise<VaultFile[]> => {
    try {
      return await invoke<VaultFile[]>('vault_get_recent', { limit });
    } catch (e) { setError(String(e)); return []; }
  }, []);

  const getFavorites = useCallback(async (): Promise<VaultFile[]> => {
    try {
      return await invoke<VaultFile[]>('vault_get_favorites');
    } catch (e) { setError(String(e)); return []; }
  }, []);

  const getStats = useCallback(async (): Promise<VaultStats | null> => {
    try {
      const result = await invoke<[number, number, number]>('vault_get_stats');
      return { total_files: result[0], total_size: result[1], total_projects: result[2] };
    } catch (e) { setError(String(e)); return null; }
  }, []);

  const createProject = useCallback(async (name: string, description?: string, projectType?: string): Promise<string | null> => {
    try {
      return await invoke<string>('vault_create_project', { name, description: description || null, projectType: projectType || null });
    } catch (e) { setError(String(e)); return null; }
  }, []);

  const getProjects = useCallback(async (): Promise<VaultProject[]> => {
    try {
      return await invoke<VaultProject[]>('vault_get_projects');
    } catch (e) { setError(String(e)); return []; }
  }, []);

  const getProjectDetail = useCallback(async (projectId: string): Promise<VaultProjectDetail | null> => {
    try {
      return await invoke<VaultProjectDetail | null>('vault_get_project_detail', { projectId });
    } catch (e) { setError(String(e)); return null; }
  }, []);

  const addFileToProject = useCallback(async (projectId: string, fileId: string, role?: string): Promise<boolean> => {
    try {
      await invoke('vault_add_file_to_project', { projectId, fileId, role: role || null });
      return true;
    } catch (e) { setError(String(e)); return false; }
  }, []);

  const removeFileFromProject = useCallback(async (projectId: string, fileId: string): Promise<boolean> => {
    try {
      await invoke('vault_remove_file_from_project', { projectId, fileId });
      return true;
    } catch (e) { setError(String(e)); return false; }
  }, []);

  const deleteProject = useCallback(async (id: string): Promise<boolean> => {
    try {
      await invoke('vault_delete_project', { id });
      return true;
    } catch (e) { setError(String(e)); return false; }
  }, []);

  const getTags = useCallback(async (): Promise<VaultTag[]> => {
    try {
      return await invoke<VaultTag[]>('vault_get_tags');
    } catch (e) { setError(String(e)); return []; }
  }, []);

  const tagFile = useCallback(async (fileId: string, tagName: string): Promise<boolean> => {
    try {
      await invoke('vault_tag_file', { fileId, tagName });
      return true;
    } catch (e) { setError(String(e)); return false; }
  }, []);

  const untagFile = useCallback(async (fileId: string, tagId: string): Promise<boolean> => {
    try {
      await invoke('vault_untag_file', { fileId, tagId });
      return true;
    } catch (e) { setError(String(e)); return false; }
  }, []);

  return {
    loading, error,
    scanDirectory, getFiles, searchFiles, getFile, deleteFile, toggleFavorite,
    getRecent, getFavorites, getStats,
    createProject, getProjects, getProjectDetail, addFileToProject, removeFileFromProject, deleteProject,
    getTags, tagFile, untagFile,
  };
}
