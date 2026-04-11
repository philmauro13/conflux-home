// Conflux Router — useDeterministicRouter hook
// React hook for task-type-based model selection in components.

import { useCallback, useMemo, useRef } from 'react';
import {
  selectModelForTask,
  inferTaskType,
  getTaskTypes,
  modelSupportsTools,
  getReliableToolModels,
  legacyAliasToTaskType,
} from '../conflux-router/deterministic-router';
import type { TaskType, RouteSelection, ModelTier } from '../conflux-router/deterministic-router';

interface UseDeterministicRouterOptions {
  /** Default task type if none specified */
  defaultTaskType?: TaskType;
  /** Whether to auto-infer task type from messages */
  autoInfer?: boolean;
}

interface DeterministicRouterAPI {
  /** Select a model for a given task type */
  selectModel: (taskType: TaskType | string) => RouteSelection | null;
  /** Auto-select based on messages and tool availability */
  autoSelect: (
    messages: Array<{ role: string; content: string }>,
    hasTools: boolean
  ) => RouteSelection;
  /** Check if a model supports tools reliably */
  modelSupportsTools: (modelAlias: string) => boolean;
  /** Get all available task types */
  taskTypes: ReturnType<typeof getTaskTypes>;
  /** Get models that reliably support tool calling */
  reliableToolModels: string[];
  /** Convert legacy alias to task type */
  legacyToTaskType: (alias: string) => TaskType;
  /** Get last selection for debugging */
  lastSelection: RouteSelection | null;
}

export function useDeterministicRouter(
  options: UseDeterministicRouterOptions = {}
): DeterministicRouterAPI {
  const { defaultTaskType = 'simple_chat', autoInfer = true } = options;
  const lastSelectionRef = useRef<RouteSelection | null>(null);

  const selectModel = useCallback((taskType: TaskType | string): RouteSelection | null => {
    const selection = selectModelForTask(taskType);
    if (selection) {
      lastSelectionRef.current = selection;
    }
    return selection;
  }, []);

  const autoSelect = useCallback(
    (
      messages: Array<{ role: string; content: string }>,
      hasTools: boolean
    ): RouteSelection => {
      let taskType: TaskType;

      if (autoInfer) {
        taskType = inferTaskType(messages, hasTools);
      } else {
        taskType = defaultTaskType;
      }

      const selection = selectModelForTask(taskType);

      if (selection) {
        lastSelectionRef.current = selection;
        return selection;
      }

      // Fallback to simple_chat if the inferred type has no model
      const fallback = selectModelForTask('simple_chat');
      if (fallback) {
        lastSelectionRef.current = fallback;
        return fallback;
      }

      // Absolute fallback
      return {
        modelAlias: 'gpt-4o-mini',
        tier: 'core',
        toolReliability: 'reliable',
        fallbackChain: ['deepseek-chat', 'gemini-flash'],
        taskType: 'simple_chat',
        estimatedCostCredits: 1,
      };
    },
    [autoInfer, defaultTaskType]
  );

  const taskTypesList = useMemo(() => getTaskTypes(), []);
  const reliableTools = useMemo(() => getReliableToolModels(), []);

  return {
    selectModel,
    autoSelect,
    modelSupportsTools,
    taskTypes: taskTypesList,
    reliableToolModels: reliableTools,
    legacyToTaskType: legacyAliasToTaskType,
    lastSelection: lastSelectionRef.current,
  };
}
