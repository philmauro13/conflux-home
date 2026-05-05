// Conflux Home — Echo Counselor Hook
// Manages counseling sessions, crisis detection, gratitude, and grounding exercises

import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type {
  EchoCounselorSession,
  EchoCounselorMessage,
  EchoCounselorState,
  EchoCrisisFlag,
  EchoGratitudeEntry,
  EchoGroundingExercise,
  EchoStartSessionRequest,
  EchoSendMessageRequest,
  EchoWeeklyLetter,
  EchoEveningReminderSettings,
  CrisisLevel,
} from '../types';
import { detectCrisis, getContextualOpening, getRandomOpening, COUNSELOR_SYSTEM_PROMPT } from '../lib/echo-counselor-prompts';

export function useEchoCounselor() {
  const [state, setState] = useState<EchoCounselorState | null>(null);
  const [messages, setMessages] = useState<EchoCounselorMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [crisisAlert, setCrisisAlert] = useState<EchoCrisisFlag | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // -- Load State -------------------------------------------
  const loadState = useCallback(async () => {
    try {
      const s = await invoke<EchoCounselorState>('echo_counselor_get_state');
      setState(s);
    } catch (e) {
      console.error('Failed to load counselor state:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  // -- Load Session Messages --------------------------------
  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const msgs = await invoke<EchoCounselorMessage[]>('echo_counselor_get_messages', { sessionId });
      setMessages(msgs);
    } catch (e) { console.error('Failed:', e); }
  }, []);

  const setCurrentSessionData = useCallback((session: EchoCounselorSession) => {
    setState(prev => prev ? { ...prev, current_session: session } : null);
  }, []);

  // -- Start Session ----------------------------------------
  const startSession = useCallback(async (opening?: string) => {
    try {
      const req: EchoStartSessionRequest = { opening };
      const session = await invoke<EchoCounselorSession>('echo_counselor_start_session', { req });
      
      // Load the counselor's opening message
      await loadMessages(session.id);
      await loadState();
      
      return session;
    } catch (e) {
      console.error('Failed to start session:', e);
      return null;
    }
  }, [loadMessages, loadState]);

  // Send message to current session
  const sendMessage = useCallback(async (sessionId: string, content: string) => {
    // Pre-check: crisis detection on user input
    const crisis = detectCrisis(content);
    if (crisis.level === 'critical' || crisis.level === 'moderate') {
      // Flag it in the backend — the counselor model will also be made aware
      try {
        const flag = await invoke<EchoCrisisFlag>('echo_counselor_flag_crisis', {
          session_id: sessionId,
          content,
          severity: crisis.level,
          detectedText: crisis.matchedText ?? '',
        });
        if (crisis.level === 'critical') {
          setCrisisAlert(flag);
        }
      } catch (e) {
        console.error('Failed to flag crisis:', e);
      }
    }

    setSending(true);
    try {
      // Add user message immediately for responsive UI
      const userMsg: EchoCounselorMessage = {
        id: `temp-${Date.now()}`,
        session_id: sessionId,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMsg]);

      // Send to counselor (async, will do LLM call and database writes)
      const response = await invoke<EchoCounselorMessage>('echo_counselor_send_message', {
        session_id: sessionId,
        content,
      });
      
      setMessages(prev => [...prev, response]);
      await loadState();
      
      return response;
    } catch (e) {
      console.error('Failed to send message:', e);
      throw e;
    } finally {
      setSending(false);
    }
  }, [loadState]);

  // -- End Session ------------------------------------------
  const endSession = useCallback(async (sessionId: string) => {
    try {
      await invoke('echo_counselor_end_session', { sessionId });
      await loadState();
    } catch (e) {
      console.error('Failed to end session:', e);
    }
  }, [loadState]);

  // -- Gratitude --------------------------------------------
  const writeGratitude = useCallback(async (items: string[], context?: string) => {
    try {
      await invoke('echo_counselor_write_gratitude', { items, context: context ?? null });
      await loadState();
    } catch (e) {
      console.error('Failed to write gratitude:', e);
    }
  }, [loadState]);

  const getGratitudeEntries = useCallback(async (limit?: number) => {
    try {
      return await invoke<EchoGratitudeEntry[]>('echo_counselor_get_gratitude', { limit: limit ?? 30 });
    } catch (e) {
      console.error('Failed to get gratitude:', e);
      return [];
    }
  }, []);

  // -- Grounding Exercises ----------------------------------
  const getExercises = useCallback(async () => {
    try {
      return await invoke<EchoGroundingExercise[]>('echo_counselor_get_exercises');
    } catch (e) {
      console.error('Failed to get exercises:', e);
      return [];
    }
  }, []);

  const completeExercise = useCallback(async (exerciseId: string) => {
    try {
      await invoke('echo_counselor_complete_exercise', { exerciseId });
      await loadState();
    } catch (e) {
      console.error('Failed to complete exercise:', e);
    }
  }, [loadState]);

  // -- Counselor Journal -------------------------------------
  const getCounselorJournal = useCallback(async (limit?: number) => {
    try {
      return await invoke<EchoCounselorSession[]>('echo_counselor_get_reflections', { limit: limit ?? 10 });
    } catch (e) {
      console.error('Failed to get counselor journal:', e);
      return [];
    }
  }, []);

  const markReflectionRead = useCallback(async (sessionId: string) => {
    try {
      await invoke('echo_counselor_mark_reflection_read', { sessionId });
      await loadState();
    } catch (e) {
      console.error('Failed to mark reflection read:', e);
    }
  }, [loadState]);

  // -- Dismiss Crisis Alert ---------------------------------
  const dismissCrisis = useCallback(() => {
    setCrisisAlert(null);
  }, []);

  // -- Get Opening ------------------------------------------
  const getOpening = useCallback((): string => {
    if (!state) return getRandomOpening();
    
    const daysSince = state.last_check_in
      ? Math.floor((Date.now() - new Date(state.last_check_in).getTime()) / 86400000)
      : 999;

    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' as const
      : hour < 17 ? 'afternoon' as const
      : hour < 21 ? 'evening' as const
      : 'night' as const;

    // Try to get last mood from most recent session
    const lastMood = state.recent_sessions?.[0]?.summary ?? null;

    return getContextualOpening({
      lastMood,
      streak: state.current_streak,
      daysSinceLastSession: daysSince === 0 ? undefined : daysSince,
      timeOfDay,
      hasPendingExercise: state.pending_exercises.length > 0,
    });
  }, [state]);

  // -- Weekly Mirror Letter ----------------------------------
  const generateWeeklyLetter = useCallback(async () => {
    try {
      return await invoke<EchoWeeklyLetter>('echo_counselor_generate_weekly_letter');
    } catch (e) {
      console.error('Failed to generate weekly letter:', e);
      return null;
    }
  }, []);

  const getWeeklyLetter = useCallback(async () => {
    try {
      return await invoke<EchoWeeklyLetter | null>('echo_counselor_get_weekly_letter');
    } catch (e) {
      console.error('Failed to get weekly letter:', e);
      return null;
    }
  }, []);

  const getWeeklyLetterHistory = useCallback(async (limit?: number) => {
    try {
      return await invoke<EchoWeeklyLetter[]>('echo_counselor_get_weekly_letter_history', { limit: limit ?? 4 });
    } catch (e) {
      console.error('Failed to get weekly letter history:', e);
      return [];
    }
  }, []);

  // -- Evening Reminder --------------------------------------
  const getEveningReminder = useCallback(async () => {
    try {
      return await invoke<{ enabled: boolean; hour: number; minute: number } | null>('echo_counselor_get_evening_reminder');
    } catch (e) {
      console.error('Failed to get evening reminder:', e);
      return null;
    }
  }, []);

  const setEveningReminder = useCallback(async (settings: EchoEveningReminderSettings) => {
    try {
      await invoke<string>('echo_counselor_set_evening_reminder', {
        enabled: settings.enabled,
        hour: settings.hour ?? null,
        minute: settings.minute ?? null,
      });
    } catch (e) {
      console.error('Failed to set evening reminder:', e);
    }
  }, []);

  return {
    state,
    messages,
    loading,
    sending,
    crisisAlert,
    startSession,
    loadMessages,
    sendMessage,
    endSession,
    writeGratitude,
    getGratitudeEntries,
    getExercises,
    completeExercise,
    getCounselorJournal,
    markReflectionRead,
    dismissCrisis,
    getOpening,
    generateWeeklyLetter,
    getWeeklyLetter,
    getWeeklyLetterHistory,
    getEveningReminder,
    setEveningReminder,
    setCurrentSessionData,
    refresh: loadState,
  };
}