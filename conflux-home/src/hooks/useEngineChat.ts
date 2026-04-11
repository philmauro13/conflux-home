// Conflux Home — Engine Chat Hook
// Routes chat through the Conflux Engine (Rust) via Tauri commands.
// This replaces useConfluxChat — conversations persist in SQLite, tools available.

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { syncSessionToEngine } from '@/lib/syncSession';
import { supabase } from '@/lib/supabase';
import type { AgentMessage } from '../types';
import { useAuthContext } from '../contexts/AuthContext';

export interface UseEngineChatResult {
  messages: AgentMessage[];
  sendMessage: (content: string) => Promise<void>;
  streaming: boolean;
  thinking: boolean;
  error: string | null;
  remainingCalls: number;
  credits: number;
  isQuotaExceeded: boolean;
  mode: 'engine';
  sessionId: string | null;
  loadSession: (sessionId: string) => Promise<void>;
}

let messageCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++messageCounter}`;
}

function timestamp(): string {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

interface EngineSession {
  id: string;
  agent_id: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface EngineMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  tool_name?: string;
  tokens_used: number;
  model?: string;
  provider_id?: string;
  latency_ms?: number;
  created_at: string;
}

interface QuotaData {
  calls_used: number;
}

interface StreamDonePayload {
  content: string;
  model: string;
  provider_id: string;
  provider_name: string;
  tokens_used: number;
  latency_ms: number;
  calls_remaining: number;
  credits_remaining?: number;
  credit_source?: string;
}

export function useEngineChat(agentId: string | null, userId?: string): UseEngineChatResult {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingCalls, setRemainingCalls] = useState(50);
  const [credits, setCredits] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const unlistenFnsRef = useRef<(() => void)[]>([]);
  
  // Use AuthContext user.id if no explicit userId provided
  const { user } = useAuthContext();
  const authUserId = userId ?? user?.id;

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      unlistenFnsRef.current.forEach(fn => fn());
      unlistenFnsRef.current = [];
    };
  }, []);

  // When agent changes, load or create a session and its messages
  useEffect(() => {
    if (!agentId) {
      setMessages([]);
      setSessionId(null);
      return;
    }

    let cancelled = false;

    async function initSession() {
      try {
        // Try to get existing sessions for this agent
        const sessions = await invoke<EngineSession[]>('engine_get_sessions', { limit: 50 });
        const agentSession = sessions.find(s => s.agent_id === agentId);

        if (agentSession && !cancelled) {
          setSessionId(agentSession.id);
          await loadMessages(agentSession.id);
        } else if (!cancelled) {
          // Create new session
          const session = await invoke<EngineSession>('engine_create_session', { agentId });
          setSessionId(session.id);
          setMessages([]);
        }

        // Load quota
        const quota = await invoke<QuotaData>('engine_get_quota');
        if (!cancelled) {
          const limit = 50; // free_daily_limit
          setRemainingCalls(Math.max(0, limit - quota.calls_used));
        }

        // Load cloud credits if authenticated
        if (authUserId) {
          try {
            const balance = await invoke<{ total_available: number }>('get_credit_balance', { userId: authUserId });
            if (!cancelled) setCredits(balance.total_available ?? 0);
          } catch {
            // Cloud credits not available — engine falls back to local quota
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[useEngineChat] Failed to init session:', err);
          setError('Engine not available — using direct mode');
        }
      }
    }

    initSession();
    setError(null);

    return () => { cancelled = true; };
  }, [agentId, userId, user?.id]);

  async function loadMessages(sid: string) {
    try {
      const history = await invoke<EngineMessage[]>('engine_get_messages', { sessionId: sid, limit: 50 });
      const uiMessages: AgentMessage[] = history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          id: m.id,
          agentId: m.role === 'user' ? 'user' : (agentId ?? 'unknown'),
          content: m.content,
          timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          type: m.role === 'user' ? 'user' as const : 'agent' as const,
        }));
      setMessages(uiMessages);
    } catch (err) {
      console.error('[useEngineChat] Failed to load messages:', err);
    }
  }

  const loadSession = useCallback(async (sid: string) => {
    setSessionId(sid);
    await loadMessages(sid);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!agentId || !sessionId) return;

    // Add user message to UI immediately
    const userMsg: AgentMessage = {
      id: nextId(),
      agentId: 'user',
      content,
      timestamp: timestamp(),
      type: 'user',
    };
    setMessages(prev => [...prev, userMsg]);

    // Create placeholder for assistant response
    const assistantId = nextId();
    assistantIdRef.current = assistantId;
    const assistantMsg: AgentMessage = {
      id: assistantId,
      agentId,
      content: '',
      timestamp: timestamp(),
      type: 'agent',
    };
    setMessages(prev => [...prev, assistantMsg]);

    setThinking(true);
    setStreaming(true);
    setError(null);

    // Clean up previous listeners
    unlistenFnsRef.current.forEach(fn => fn());
    unlistenFnsRef.current = [];

    try {
      // Listen for streaming chunks
      const unlistenChunk = await listen<{ text: string }>('engine:chunk', (event) => {
        setThinking(false);
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantIdRef.current
              ? { ...m, content: m.content + event.payload.text }
              : m
          )
        );
      });

      // Listen for thinking state
      const unlistenThinking = await listen('engine:thinking', () => {
        setThinking(true);
      });

      // Listen for completion
      const unlistenDone = await listen<StreamDonePayload>('engine:done', (event) => {
        const data = event.payload;
        setRemainingCalls(data.calls_remaining);
        // Update credits if cloud credit info is available
        if (data.credits_remaining !== undefined && data.credits_remaining !== null) {
          setCredits(data.credits_remaining);
        }
        setStreaming(false);
        setThinking(false);

        // If streaming chunks didn't arrive (non-streaming path), set final content
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantIdRef.current && m.content === ''
              ? { ...m, content: data.content }
              : m
          )
        );

        // Reload messages from DB to capture tool call entries
        if (sessionId) {
          invoke<EngineMessage[]>('engine_get_messages', { sessionId, limit: 50 })
            .then(history => {
              const uiMessages: AgentMessage[] = history
                .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
                .map(m => ({
                  id: m.id,
                  agentId: m.role === 'user' ? 'user' : m.role === 'tool' ? 'system' : (agentId ?? 'unknown'),
                  content: m.role === 'tool' && m.tool_name
                    ? `🔧 **${m.tool_name}**\n${m.content}`
                    : m.content,
                  timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                  type: m.role === 'user' ? 'user' as const : m.role === 'tool' ? 'system' as const : 'agent' as const,
                }));
              setMessages(uiMessages);
            })
            .catch(() => {}); // non-critical
        }
      });

      // Listen for errors
      const unlistenError = await listen<string>('engine:error', (event) => {
        setError(event.payload);
        setStreaming(false);
        setThinking(false);
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantIdRef.current && m.content === ''
              ? { ...m, content: `[Engine error: ${event.payload}]` }
              : m
          )
        );
      });

      unlistenFnsRef.current = [unlistenChunk, unlistenThinking, unlistenDone, unlistenError];

      // Ensure we have a fresh JWT before making the request
      console.log('[useEngineChat] ══════════════════════════════════════════');
      console.log('[useEngineChat] 🚀 Starting sendMessage...');
      console.log('[useEngineChat] Session ID:', sessionId);
      console.log('[useEngineChat] Agent ID:', agentId);
      console.log('[useEngineChat] Message:', content);
      console.log('[useEngineChat] Syncing session before chat...');
      const syncResult = await syncSessionToEngine();
      
      if (!syncResult) {
        const errorMsg = 'Failed to sync session — please sign in again';
        console.error('[useEngineChat] ❌', errorMsg);
        console.log('[useEngineChat] ══════════════════════════════════════════');
        setError(errorMsg);
        setStreaming(false);
        setThinking(false);
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantIdRef.current && m.content === ''
              ? { ...m, content: `[${errorMsg}]` }
              : m
          )
        );
        return;
      }
      
      console.log('[useEngineChat] Sync result:', syncResult);
      console.log('[useEngineChat] ✅ Session synced successfully!');

      // Fire the streaming chat command
      console.log('[useEngineChat] Invoking engine_chat_stream...');
      await invoke('engine_chat_stream', {
        req: {
          session_id: sessionId,
          agent_id: agentId,
          message: content,
          max_tokens: null,
        },
      });
      console.log('[useEngineChat] ✅ engine_chat_stream invoke completed');
      console.log('[useEngineChat] ══════════════════════════════════════════');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Engine chat failed';
      setError(errorMsg);
      setStreaming(false);
      setThinking(false);
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantIdRef.current && m.content === ''
            ? { ...m, content: `[Error: ${errorMsg}]` }
            : m
        )
      );
    }
  }, [agentId, sessionId]);

  return {
    messages,
    sendMessage,
    streaming,
    thinking,
    error,
    remainingCalls,
    credits,
    isQuotaExceeded: remainingCalls <= 0,
    mode: 'engine',
    sessionId,
    loadSession,
  };
}
