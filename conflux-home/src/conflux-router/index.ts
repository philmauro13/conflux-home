// Conflux Home — Conflux Router SDK
// Main entry point. Replaces OpenRouter dependency with our own routing layer.
//
// Usage:
//   import { ConfluxRouter } from './conflux-router';
//   const router = new ConfluxRouter('user-123', 'free');
//   router.start();
//   const response = await router.chat({ model: 'conflux-fast', messages: [...] });

export { ConfluxRouter } from './router';

export type {
  Provider,
  ProviderTier,
  ModelConfig,
  RateLimit,
  UserQuota,
  UserTier,
  ProviderHealth,
  RouterConfig,
  RouterChatRequest,
  RouterChatMessage,
  RouterChatResponse,
  RouterChatChoice,
  RouterStreamChunk,
  Capability,
  ModelQuality,
  ApiFormat,
} from './types';

export {
  QuotaExceededError,
  NoHealthyProviderError,
  ProviderError,
} from './types';

export {
  CORE_PROVIDERS,
  PRO_PROVIDERS,
  ULTRA_PROVIDERS,
  ALIAS_MAP,
  getProvidersForTier,
  getProvidersForAlias,
  findModelForAlias,
} from './providers';

export {
  selectModelForTask,
  getTierForTask,
  getTaskTypes,
  modelSupportsTools,
  getReliableToolModels,
  inferTaskType,
  legacyAliasToTaskType,
} from './deterministic-router';

export type { TaskType, ToolReliability, ModelTier, RouteSelection } from './deterministic-router';

export { useDeterministicRouter } from './useDeterministicRouter';

export {
  loadQuota,
  saveQuota,
  hasQuota,
  incrementQuota,
  remainingCalls,
  resetQuota,
} from './quota';

export {
  getCachedHealth,
  isProviderHealthy,
  getHealthyProviders,
  checkAllProviders,
  startHealthMonitor,
  getHealthSummary,
} from './health';
