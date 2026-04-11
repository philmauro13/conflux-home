import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface IntroState {
  currentStep: number;
  inputs: Record<string, string>; // agentId -> user input
  completed: boolean;
}

export function useIntroductions(
  userId: string,
  familyMemberId?: string,
  selectedAgentIds?: string[],
  onComplete?: () => void
) {
  const [state, setState] = useState<IntroState>(() => {
    const stored = localStorage.getItem('conflux-introductions-state');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // ignore
      }
    }
    return {
      currentStep: 0,
      inputs: {},
      completed: false,
    };
  });

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem('conflux-introductions-state', JSON.stringify(state));
  }, [state]);

  // Mark introductions as complete
  const markComplete = useCallback(() => {
    setState(prev => ({ ...prev, completed: true }));
    localStorage.setItem('conflux-introductions-complete', 'true');
    onComplete?.();
  }, [onComplete]);

  // Move to next step
  const nextStep = useCallback(() => {
    setState(prev => {
      const next = prev.currentStep + 1;
      const totalSteps = selectedAgentIds?.length ?? 0;
      if (next >= totalSteps) {
        // All done, call onComplete after a small delay
        setTimeout(markComplete, 100);
        return { ...prev, currentStep: next, completed: true };
      }
      return { ...prev, currentStep: next };
    });
  }, [selectedAgentIds, markComplete]);

  // Skip remaining steps (complete silently)
  const skipRemaining = useCallback(() => {
    markComplete();
  }, [markComplete]);

  // Set input for current agent
  const setInput = useCallback((agentId: string, value: string) => {
    setState(prev => ({
      ...prev,
      inputs: { ...prev.inputs, [agentId]: value },
    }));
  }, []);

  // Save user inputs to app databases after ceremony completes
  const saveInputs = useCallback(async () => {
    // For each agent's input, call the appropriate Tauri command.
    // If exact commands don't exist, we persist to localStorage and add TODO.
    console.log('[Introductions] Saving inputs:', state.inputs);
    // TODO: Implement Tauri calls for each agent's starter config.
    // For now, we store the inputs in localStorage for later processing.
    localStorage.setItem('conflux-introductions-pending', JSON.stringify(state.inputs));
  }, [state.inputs]);

  // When completed, save inputs (but only once)
  useEffect(() => {
    if (state.completed && Object.keys(state.inputs).length > 0) {
      saveInputs();
    }
  }, [state.completed, state.inputs, saveInputs]);

  return {
    currentStep: state.currentStep,
    inputs: state.inputs,
    completed: state.completed,
    nextStep,
    skipRemaining,
    setInput,
    saveInputs,
  };
}