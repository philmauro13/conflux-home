// Conflux Home — Engine Chat Hook
// Routes chat through the Conflux Engine (Rust) via Tauri commands.
// This replaces useConfluxChat — conversations persist in SQLite, tools available.

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
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
  createNewSession: () => Promise<string>; // returns new session ID
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
  title: string | null;
  message_count: number;
  total_tokens: number;
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

export function useEngineChat(agent_id: string | null, user_id?: string): UseEngineChatResult {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingCalls, setRemainingCalls] = useState(50);
  const [credits, setCredits] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Always-current refs — avoid stale closures
  const sessionIdRef = useRef<string | null>(null);
  const agentIdRef = useRef<string | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const unlistenFnsRef = useRef<UnlistenFn[]>([]);

  // Use AuthContext user.id if no explicit user_id provided
  const { user } = useAuthContext();
  const authUserId = user_id ?? user?.id;

  // Keep refs in sync with state
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    agentIdRef.current = agent_id;
  }, [agent_id]);

  // ── Internal: clear all Tauri event listeners ──
  function cleanupListeners() {
    unlistenFnsRef.current.forEach(fn => fn());
    unlistenFnsRef.current = [];
  }

  // ── Internal: load messages for a session (replaces, doesn't append) ──
  async function loadMessagesForSession(sid: string) {
    const currentSid = sessionIdRef.current; // capture at call time

    // Clear listeners + messages immediately
    cleanupListeners();
    setMessages([]);

    try {
      const history = await invoke<EngineMessage[]>('engine_get_messages', { session_id: sid, limit: 50 });

      // Ignore if session changed while waiting for DB
      if (sessionIdRef.current !== currentSid) return;

      const currentAgentId = agentIdRef.current;
      const uiMessages: AgentMessage[] = history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          id: m.id,
          agentId: m.role === 'user' ? 'user' : (currentAgentId ?? 'unknown'),
          content: m.content,
          timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          type: m.role === 'user' ? 'user' as const : 'agent' as const,
        }));
      setMessages(uiMessages);
    } catch (err) {
      console.error('[useEngineChat] Failed to load messages:', err);
      if (sessionIdRef.current === currentSid) setMessages([]);
    }
  }

  // ── Internal: create a new session for the current agent ──
  async function createSessionForAgent(): Promise<string> {
    const currentAgentId = agent_id ?? agentIdRef.current;
    if (!currentAgentId) throw new Error('No agent selected');
    const session = await invoke<EngineSession>('engine_create_session', { agent_id: currentAgentId });
    return session.id;
  }

  // ── Cleanup listeners on unmount ──
  useEffect(() => {
    return () => {
      cleanupListeners();
    };
  }, []);

  // ── When agent changes, load or create a session ──
  useEffect(() => {
    if (!agent_id) {
      cleanupListeners();
      setMessages([]);
      setSessionId(null);
      sessionIdRef.current = null;
      return;
    }

    let cancelled = false;

    async function initSession() {
      try {
        // Try to get existing sessions for this agent
        const sessions = await invoke<EngineSession[]>('engine_get_sessions', { limit: 50 });
        if (cancelled) return;

        const agentSession = sessions.find(s => s.agent_id === agent_id);

        if (agentSession) {
          setSessionId(agentSession.id);
          sessionIdRef.current = agentSession.id;
          await loadMessagesForSession(agentSession.id);
        } else {
          // Create new session for this agent
          const session = await invoke<EngineSession>('engine_create_session', { agent_id: agent_id });
          if (cancelled) return;
          setSessionId(session.id);
          sessionIdRef.current = session.id;
          setMessages([]);
        }

        // Load quota
        const quota = await invoke<QuotaData>('engine_get_quota');
        if (!cancelled) {
          setRemainingCalls(Math.max(0, 50 - quota.calls_used));
        }

        // Load cloud credits if authenticated
        if (authUserId) {
          try {
            const balance = await invoke<{ total_available: number }>('get_credit_balance', { user_id: authUserId });
            if (!cancelled) setCredits(balance.total_available ?? 0);
          } catch {
            // Cloud credits not available
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[useEngineChat] Failed to init session:', err);
          setError('Engine not available — please restart');
        }
      }
    }

    cleanupListeners();
    initSession();
    setError(null);

    return () => { cancelled = true; };
  }, [agent_id, user_id, user?.id]);

  // ── Load a specific session by ID (from session sidebar) ──
  const loadSession = useCallback(async (sid: string) => {
    cleanupListeners();
    setSessionId(sid);
    sessionIdRef.current = sid;
    await loadMessagesForSession(sid);
  }, []); // no deps — uses refs

  // ── Create a new session (for "New Session" button) ──
  const createNewSession = useCallback(async (): Promise<string> => {
    const currentAgentId = agent_id ?? agentIdRef.current;
    if (!currentAgentId) throw new Error('No agent selected');

    cleanupListeners();
    const session = await invoke<EngineSession>('engine_create_session', { agent_id: currentAgentId });
    setSessionId(session.id);
    sessionIdRef.current = session.id;
    setMessages([]);
    return session.id;
  }, [agent_id]); // depends on agent_id so it picks up the right agent

  // ── Send a message ──
  const sendMessage = useCallback(async (content: string) => {
    const currentSessionId = sessionIdRef.current;
    const currentAgentId = agent_id ?? agentIdRef.current;
    if (!currentAgentId || !currentSessionId) {
      console.warn('[useEngineChat] sendMessage called with no session or agent');
      return;
    }

    cleanupListeners();

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
      agentId: currentAgentId,
      content: '',
      timestamp: timestamp(),
      type: 'agent',
    };
    setMessages(prev => [...prev, assistantMsg]);

    setThinking(true);
    setStreaming(true);
    setError(null);

    // ── Set up Tauri event listeners ──
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

    const unlistenThinking = await listen('engine:thinking', () => {
      setThinking(true);
    });

    const unlistenDone = await listen<StreamDonePayload>('engine:done', (event) => {
      const data = event.payload;
      setRemainingCalls(data.calls_remaining);
      if (data.credits_remaining !== undefined && data.credits_remaining !== null) {
        setCredits(data.credits_remaining);
      }
      setStreaming(false);
      setThinking(false);

      // If streaming didn't populate content, set it from the event
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantIdRef.current && m.content === ''
            ? { ...m, content: data.content, model: data.model }
            : m
        )
      );
      // Note: DB reload removed — full message reload causes UI flicker/disappearance.
      // Tool call display can be added incrementally if needed later.
    });

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

    // ── Sync session and send ──
    const syncResult = await syncSessionToEngine();
    if (!syncResult) {
      const errorMsg = 'Failed to sync session — please sign in again';
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

    await invoke('engine_chat_stream', {
      req: {
        session_id: currentSessionId,
        agent_id: currentAgentId,
        message: content,
        max_tokens: null,
      },
    });
  }, [agent_id]); // only agent_id dependency — sessionId always read from ref

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
    createNewSession,
  };
}
