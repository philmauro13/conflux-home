// Conflux Home — Content Feed Hook
// Manages news, tips, challenges, fun facts, and reminders.

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ContentFeedItem } from '../types';
import { useAuthContext } from '../contexts/AuthContext';

export function useContentFeed(memberId?: string) {
  const { user } = useAuthContext();
  const userId = user?.id || '';
  const [items, setItems] = useState<ContentFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const data = await invoke<ContentFeedItem[]>('feed_get_items', {
        userId,
        memberId: memberId ?? null,
        contentType: null,
        unreadOnly: false,
      });
      setItems(data);
    } catch (e) {
      console.error('Failed to load feed:', e);
    } finally {
      setLoading(false);
    }
  }, [userId, memberId]);

  useEffect(() => { load(); }, [load]);

  const markRead = useCallback(async (id: string) => {
    await invoke('feed_mark_read', { userId, id });
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_read: true } : i));
  }, [userId]);

  const toggleBookmark = useCallback(async (id: string) => {
    await invoke('feed_toggle_bookmark', { userId, id });
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_bookmarked: !i.is_bookmarked } : i));
  }, [userId]);

  const generate = useCallback(async (interests?: string) => {
    setGenerating(true);
    try {
      const data = await invoke<ContentFeedItem[]>('feed_generate', {
        userId,
        memberId: memberId ?? null,
        interests: interests ?? null,
      });
      setItems(prev => [...data, ...prev]);
      return data;
    } finally {
      setGenerating(false);
    }
  }, [userId, memberId]);

  const unreadCount = items.filter(i => !i.is_read).length;

  return { items, loading, generating, unreadCount, markRead, toggleBookmark, generate, reload: load };
}
