// Conflux Home — Content Feed Hook
// Manages news, tips, challenges, fun facts, and reminders.

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ContentFeedItem } from '../types';
import { useAuthContext } from '../contexts/AuthContext';

export function useContentFeed(member_id?: string) {
  const { user } = useAuthContext();
  const user_id = user?.id || '';
  const [items, setItems] = useState<ContentFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!user_id) return;
    try {
      setLoading(true);
      const data = await invoke<ContentFeedItem[]>('feed_get_items', {
        user_id,
        member_id: member_id ?? null,
        contentType: null,
        unreadOnly: false,
      });
      setItems(data);
    } catch (e) {
      console.error('Failed to load feed:', e);
    } finally {
      setLoading(false);
    }
  }, [user_id, member_id]);

  useEffect(() => { load(); }, [load]);

  const markRead = useCallback(async (id: string) => {
    await invoke('feed_mark_read', { user_id, id });
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_read: true } : i));
  }, [user_id]);

  const toggleBookmark = useCallback(async (id: string) => {
    await invoke('feed_toggle_bookmark', { user_id, id });
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_bookmarked: !i.is_bookmarked } : i));
  }, [user_id]);

  const generate = useCallback(async (interests?: string) => {
    setGenerating(true);
    try {
      const data = await invoke<ContentFeedItem[]>('feed_generate', {
        user_id,
        member_id: member_id ?? null,
        interests: interests ?? null,
      });
      setItems(prev => [...data, ...prev]);
      return data;
    } finally {
      setGenerating(false);
    }
  }, [user_id, member_id]);

  const unreadCount = items.filter(i => !i.is_read).length;

  return { items, loading, generating, unreadCount, markRead, toggleBookmark, generate, reload: load };
}
