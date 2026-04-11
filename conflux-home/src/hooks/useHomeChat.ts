import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { HomeChatMessage } from '../types';
import { useAuthContext } from '../contexts/AuthContext';

export function useHomeChat() {
  const [messages, setMessages] = useState<HomeChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuthContext();

  const send = useCallback(async (message: string) => {
    if (!user?.id) return;
    const userMessage: HomeChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);
    try {
      const response = await invoke<HomeChatMessage>('home_chat', { user_id: user.id, message });
      setMessages(prev => [...prev, response]);
    } catch (e) {
      console.error('Failed to send chat message:', e);
      // Remove the optimistic user message on failure
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  return { messages, loading, send };
}
