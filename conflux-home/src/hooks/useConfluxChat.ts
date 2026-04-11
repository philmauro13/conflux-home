// Conflux Home — Conflux Chat Hook
// Drop-in replacement for useAgentChat that routes through Conflux Router.
// Falls back to Gateway if Conflux Router has no API keys configured.

import { useState, useEffect, useCallback, useRef } from 'react';
import { ConfluxRouter } from '../conflux-router';
import { QuotaExceededError } from '../conflux-router/types';
import type { UserQuota } from '../conflux-router/types';
import type { AgentMessage } from '../types';

export interface UseConfluxChatResult {
  messages: AgentMessage[];
  sendMessage: (content: string) => Promise<void>;
  streaming: boolean;
  thinking: boolean;
  error: string | null;
  quota: UserQuota | null;
  remainingCalls: number;
  isQuotaExceeded: boolean;
  mode: 'conflux' | 'gateway'; // which backend is active
}

let messageCounter = 0;
function nextId(): string {
  return `msg-${Date.now()}-${++messageCounter}`;
}

function timestamp(): string {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ── Agent personality system prompts ──
const AGENT_PERSONAS: Record<string, string> = {
  conflux: 'You are Conflux, a strategic business partner. You think in terms of revenue, leverage, and compounding value. Be direct, analytical, and ambitious.',
  helix: 'You are Helix, a market research analyst. You find data, validate claims, and surface competitive intelligence. Be thorough and evidence-based.',
  forge: 'You are Forge, a builder and creator. You turn ideas into working products. Be practical, fast, and focused on shipping.',
  quanta: 'You are Quanta, quality control. You verify, test, and ensure everything meets high standards. Be meticulous and honest about flaws.',
  prism: 'You are Prism, the system orchestrator. You coordinate missions, manage workflows, and keep everything running smoothly.',
  pulse: 'You are Pulse, the growth engine. You think about marketing, audience, distribution, and launch strategy. Be creative and data-driven.',
  vector: 'You are Vector, the CEO and venture capitalist. You evaluate opportunities, allocate resources, and make strategic bets. Be decisive.',
  spectra: 'You are Spectra, the task decomposer. You break complex goals into clear, actionable steps. Be structured and thorough.',
  luma: 'You are Luma, the launcher. You execute plans and get things done. Be energetic and results-focused.',
  catalyst: 'You are Catalyst, the everyday assistant. You help with daily tasks, planning, and organization. Be friendly and helpful.',
};

/**
 * Detect if Conflux Router has API keys available.
 * Checks localStorage for stored keys.
 */
export function hasConfluxKeys(): boolean {
  if (typeof localStorage === 'undefined') return false;
  // Check for any CONFLUX_* keys in localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('conflux-api-key-')) return true;
  }
  return false;
}

/**
 * Get or create a user ID for quota tracking.
 */
function getUserId(): string {
  if (typeof localStorage === 'undefined') return 'anonymous';
  let id = localStorage.getItem('conflux-user-id');
  if (!id) {
    id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('conflux-user-id', id);
  }
  return id;
}

export function useConfluxChat(agentId: string | null): UseConfluxChatResult {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [mode, setMode] = useState<'conflux' | 'gateway'>('gateway');
  const routerRef = useRef<ConfluxRouter | null>(null);

  // Initialize router when agentId changes
  useEffect(() => {
    if (!agentId) {
      routerRef.current = null;
      setMessages([]);
      return;
    }

    const userId = getUserId();
    const router = new ConfluxRouter(userId, 'free');
    router.start();
    routerRef.current = router;
    setQuota(router.getQuota());
    setMode('conflux');

    // Reset messages when agent changes
    setMessages([]);
    setError(null);

    return () => {
      router.stop();
    };
  }, [agentId]);

  const sendMessage = useCallback(async (content: string) => {
    const router = routerRef.current;
    if (!router || !agentId) return;

    // Add user message to UI
    const userMsg: AgentMessage = {
      id: nextId(),
      agentId: 'user',
      content,
      timestamp: timestamp(),
      type: 'user',
    };
    setMessages(prev => [...prev, userMsg]);

    // Create placeholder assistant message for streaming
    const assistantId = nextId();
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

    try {
      // Build message history for context
      const history = messages.map(m => ({
        role: m.type === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      }));

      // Add system prompt + current message
      const persona = AGENT_PERSONAS[agentId] ?? `You are ${agentId}, a helpful AI assistant.`;
      const chatMessages = [
        { role: 'system' as const, content: persona },
        ...history,
        { role: 'user' as const, content },
      ];

      setThinking(false);

      // Stream the response
      await router.chatStream(
        {
          model: 'conflux-fast',
          messages: chatMessages,
          stream: true,
        },
        (chunk) => {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? { ...m, content: m.content + chunk }
                : m
            )
          );
        },
      );

      // Update quota after successful send
      setQuota(router.getQuota());
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        setError('You\'ve used all 50 free calls today! Upgrade to Pro for unlimited access.');
        setQuota(err.quota);
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId && m.content === ''
              ? { ...m, content: '[Daily limit reached — upgrade to Pro for unlimited calls]' }
              : m
          )
        );
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMsg);
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId && m.content === ''
              ? { ...m, content: `[Error: ${errorMsg}]` }
              : m
          )
        );
      }
    } finally {
      setThinking(false);
      setStreaming(false);
    }
  }, [agentId, messages]);

  const remainingCallsValue = quota
    ? quota.tier === 'free' ? Math.max(0, quota.maxCallsPerDay - quota.callsToday) : Infinity
    : 50;

  return {
    messages,
    sendMessage,
    streaming,
    thinking,
    error,
    quota,
    remainingCalls: remainingCallsValue,
    isQuotaExceeded: quota ? quota.tier === 'free' && quota.callsToday >= quota.maxCallsPerDay : false,
    mode,
  };
}
