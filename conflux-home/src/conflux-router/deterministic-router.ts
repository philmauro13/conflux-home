// Conflux Router — Deterministic Task-Type Router
// Selects models based on task type + tool-calling reliability.
// Sits on top of the existing ConfluxRouter for actual API calls.

import routingConfig from '../config/routing-config.json';

// ── Types ──

export type TaskType =
  | 'simple_chat'
  | 'summarize'
  | 'extract'
  | 'translate'
  | 'code_gen'
  | 'tool_orchestrate'
  | 'image_gen'
  | 'file_ops'
  | 'web_browse'
  | 'creative'
  | 'deep_reasoning'
  | 'agentic_complex';

export type ToolReliability = 'reliable' | 'basic' | 'none';

export type ModelTier = 'core' | 'pro' | 'ultra';

export interface RoutingRule {
  tier: ModelTier;
  description: string;
  min_tool_reliability: ToolReliability;
  preferred_models: string[];
}

export interface RouteSelection {
  modelAlias: string;
  tier: ModelTier;
  toolReliability: ToolReliability;
  fallbackChain: string[];
  taskType: TaskType;
  estimatedCostCredits: number;
}

// ── Config ──

const taskTypes = routingConfig.task_types as unknown as Record<string, RoutingRule>;
const toolReliability: Record<ToolReliability, string[]> = {
  reliable: routingConfig.tool_reliability.reliable,
  basic: routingConfig.tool_reliability.basic,
  none: [],
};

// ── Reliability check ──

function meetsReliability(modelAlias: string, minLevel: ToolReliability): boolean {
  if (minLevel === 'basic') {
    return (
      toolReliability.reliable.includes(modelAlias) ||
      toolReliability.basic.includes(modelAlias)
    );
  }
  if (minLevel === 'reliable') {
    return toolReliability.reliable.includes(modelAlias);
  }
  return true; // 'none' — any model qualifies
}

// ── Main Router ──

/**
 * Select the best model for a given task type.
 * Returns the model alias to use, with fallback chain.
 */
export function selectModelForTask(taskType: TaskType | string): RouteSelection | null {
  const rule = taskTypes[taskType];
  if (!rule) {
    console.warn(`[DeterministicRouter] Unknown task type: ${taskType}`);
    return null;
  }

  // Find first preferred model that meets tool reliability requirement
  const selected = rule.preferred_models.find((alias) =>
    meetsReliability(alias, rule.min_tool_reliability)
  );

  if (!selected) {
    console.warn(
      `[DeterministicRouter] No model found for task "${taskType}" with min reliability "${rule.min_tool_reliability}"`
    );
    return null;
  }

  // Build fallback chain from remaining preferred models
  const fallbackChain = rule.preferred_models.filter(
    (alias) =>
      alias !== selected && meetsReliability(alias, rule.min_tool_reliability)
  );

  // Estimate cost (credits per 1K tokens)
  const tierCosts: Record<ModelTier, number> = { core: 1, pro: 2, ultra: 5 };
  const estimatedCostCredits = tierCosts[rule.tier];

  return {
    modelAlias: selected,
    tier: rule.tier,
    toolReliability: rule.min_tool_reliability,
    fallbackChain,
    taskType: taskType as TaskType,
    estimatedCostCredits,
  };
}

/**
 * Get the tier for a task type (without selecting a specific model).
 */
export function getTierForTask(taskType: TaskType | string): ModelTier | null {
  const rule = taskTypes[taskType];
  return rule?.tier ?? null;
}

/**
 * Get all available task types with their descriptions.
 */
export function getTaskTypes(): Array<{
  type: string;
  tier: ModelTier;
  description: string;
  topModel: string;
}> {
  return Object.entries(taskTypes).map(([type, rule]) => ({
    type,
    tier: rule.tier,
    description: rule.description,
    topModel: rule.preferred_models[0],
  }));
}

/**
 * Check if a model reliably supports tool calling.
 */
export function modelSupportsTools(
  modelAlias: string,
  minLevel: ToolReliability = 'basic'
): boolean {
  return meetsReliability(modelAlias, minLevel);
}

/**
 * Get all models that reliably support tool calling.
 */
export function getReliableToolModels(): string[] {
  return [...toolReliability.reliable];
}

/**
 * Infer task type from message content (heuristic).
 * Use when the agent doesn't explicitly declare a task type.
 */
export function inferTaskType(
  messages: Array<{ role: string; content: string }>,
  hasTools: boolean
): TaskType {
  const lastUserMsg = [...messages]
    .reverse()
    .find((m) => m.role === 'user');
  const content = lastUserMsg?.content?.toLowerCase() ?? '';

  // Tool-heavy requests
  if (hasTools && (content.includes('file') || content.includes('read') || content.includes('write') || content.includes('edit'))) {
    return 'file_ops';
  }
  if (hasTools && (content.includes('search') || content.includes('browse') || content.includes('url') || content.includes('website'))) {
    return 'web_browse';
  }
  if (hasTools && (content.includes('image') || content.includes('picture') || content.includes('generate') || content.includes('wallpaper'))) {
    return 'image_gen';
  }
  if (hasTools) {
    return 'tool_orchestrate';
  }

  // Code-related
  if (
    content.includes('code') ||
    content.includes('function') ||
    content.includes('debug') ||
    content.includes('program') ||
    content.includes('script') ||
    content.includes('implement')
  ) {
    return 'code_gen';
  }

  // Reasoning-heavy
  if (
    content.includes('analyze') ||
    content.includes('research') ||
    content.includes('compare') ||
    content.includes('evaluate') ||
    content.includes('why') ||
    content.includes('explain in detail')
  ) {
    return 'deep_reasoning';
  }

  // Extraction/translation
  if (content.includes('summarize') || content.includes('summary') || content.includes('tldr')) {
    return 'summarize';
  }
  if (content.includes('extract') || content.includes('parse') || content.includes('pull out')) {
    return 'extract';
  }
  if (content.includes('translate') || content.includes('in spanish') || content.includes('in french')) {
    return 'translate';
  }

  // Creative
  if (
    content.includes('write') ||
    content.includes('story') ||
    content.includes('poem') ||
    content.includes('creative') ||
    content.includes('brainstorm')
  ) {
    return 'creative';
  }

  // Default
  return 'simple_chat';
}

/**
 * Map Conflux Home legacy aliases to the new task-type system.
 */
export function legacyAliasToTaskType(alias: string): TaskType {
  switch (alias) {
    case 'conflux-core':
    case 'conflux-fast':
      return 'simple_chat';
    case 'conflux-pro':
    case 'conflux-smart':
      return 'code_gen';
    case 'conflux-ultra':
      return 'deep_reasoning';
    case 'conflux-creative':
      return 'creative';
    case 'conflux-imagine':
      return 'image_gen';
    default:
      return 'simple_chat';
  }
}
