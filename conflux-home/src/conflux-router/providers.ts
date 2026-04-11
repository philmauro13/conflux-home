// Conflux Router — Provider Registry v4
// All providers aggregated by Conflux Router. Direct API calls, no middlemen.
// Free tier first. Paid providers require key configuration.
// API keys come from environment variables — NEVER hardcode secrets.

import type { Provider } from './types';

function env(key: string, fallback = ''): string {
  return import.meta.env[key] ?? fallback;
}

// ── Core Tier — Free providers, $0 marginal cost ──

export const CORE_PROVIDERS: Provider[] = [
  {
    id: 'cerebras-llama-8b',
    name: 'Cerebras Llama 3.1 8B',
    tier: 'free',
    apiFormat: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKey: env('VITE_CEREBRAS_API_KEY'),
    models: [
      {
        id: 'llama3.1-8b',
        alias: 'conflux-core',
        maxTokens: 8192,
        costPer1kTokens: 0,
        quality: 'basic',
      },
    ],
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 500, tokensPerMinute: 60_000 },
    healthEndpoint: 'https://api.cerebras.ai/v1/models',
    priority: 1,
    capabilities: ['chat'],
  },
  {
    id: 'groq-llama-8b',
    name: 'Groq Llama 3.1 8B',
    tier: 'free',
    apiFormat: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: env('VITE_GROQ_API_KEY'),
    models: [
      {
        id: 'llama-3.1-8b-instant',
        alias: 'conflux-core',
        maxTokens: 8192,
        costPer1kTokens: 0,
        quality: 'basic',
      },
    ],
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 250, tokensPerMinute: 70_000 },
    healthEndpoint: 'https://api.groq.com/openai/v1/models',
    priority: 2,
    capabilities: ['chat'],
  },
  {
    id: 'mistral-small',
    name: 'Mistral Small',
    tier: 'free',
    apiFormat: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKey: env('VITE_MISTRAL_API_KEY'),
    models: [
      {
        id: 'mistral-small-latest',
        alias: 'conflux-core',
        maxTokens: 8192,
        costPer1kTokens: 0,
        quality: 'good',
      },
    ],
    rateLimit: { requestsPerMinute: 60, requestsPerDay: 1000, tokensPerMinute: 500_000 },
    healthEndpoint: 'https://api.mistral.ai/v1/models',
    priority: 3,
    capabilities: ['chat'],
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    tier: 'free',
    apiFormat: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: env('VITE_DEEPSEEK_API_KEY'),
    models: [
      {
        id: 'deepseek-chat',
        alias: 'conflux-core',
        maxTokens: 8192,
        costPer1kTokens: 0,
        quality: 'good',
      },
    ],
    rateLimit: { requestsPerMinute: 60, requestsPerDay: 500, tokensPerMinute: 1_000_000 },
    healthEndpoint: 'https://api.deepseek.com/v1/models',
    priority: 4,
    capabilities: ['chat'],
  },
  {
    id: 'cloudflare-llama-8b',
    name: 'Cloudflare Llama 3.1 8B',
    tier: 'free',
    apiFormat: 'openai',
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${env('VITE_CLOUDFLARE_ACCOUNT_ID')}/ai/v1`,
    apiKey: env('VITE_CLOUDFLARE_API_KEY'),
    models: [
      {
        id: '@cf/meta/llama-3.1-8b-instruct',
        alias: 'conflux-core',
        maxTokens: 4096,
        costPer1kTokens: 0,
        quality: 'basic',
      },
    ],
    rateLimit: { requestsPerMinute: 50, requestsPerDay: 10000, tokensPerMinute: 100_000 },
    healthEndpoint: 'https://api.cloudflare.com/client/v4/user',
    priority: 5,
    capabilities: ['chat', 'image', 'stt'],
  },
];

// ── Pro Tier — Smart free models + low-cost premium ──

export const PRO_PROVIDERS: Provider[] = [
  {
    id: 'cerebras-qwen-235b',
    name: 'Cerebras Qwen 3 235B',
    tier: 'free',
    apiFormat: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKey: env('VITE_CEREBRAS_API_KEY'),
    models: [
      {
        id: 'qwen-3-235b-a22b-instruct-2507',
        alias: 'conflux-pro',
        maxTokens: 8192,
        costPer1kTokens: 0,
        quality: 'excellent',
      },
    ],
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 500, tokensPerMinute: 60_000 },
    healthEndpoint: 'https://api.cerebras.ai/v1/models',
    priority: 1,
    capabilities: ['chat'],
  },
  {
    id: 'groq-llama-70b',
    name: 'Groq Llama 3.3 70B',
    tier: 'free',
    apiFormat: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: env('VITE_GROQ_API_KEY'),
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        alias: 'conflux-pro',
        maxTokens: 8192,
        costPer1kTokens: 0,
        quality: 'excellent',
      },
    ],
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 250, tokensPerMinute: 70_000 },
    healthEndpoint: 'https://api.groq.com/openai/v1/models',
    priority: 2,
    capabilities: ['chat'],
  },
  {
    id: 'mistral-medium',
    name: 'Mistral Medium',
    tier: 'free',
    apiFormat: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKey: env('VITE_MISTRAL_API_KEY'),
    models: [
      {
        id: 'mistral-medium-latest',
        alias: 'conflux-pro',
        maxTokens: 8192,
        costPer1kTokens: 0,
        quality: 'good',
      },
    ],
    rateLimit: { requestsPerMinute: 60, requestsPerDay: 1000, tokensPerMinute: 500_000 },
    healthEndpoint: 'https://api.mistral.ai/v1/models',
    priority: 3,
    capabilities: ['chat'],
  },
  {
    id: 'groq-deepseek-70b',
    name: 'Groq DeepSeek R1 70B',
    tier: 'free',
    apiFormat: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: env('VITE_GROQ_API_KEY'),
    models: [
      {
        id: 'deepseek-r1-distill-llama-70b',
        alias: 'conflux-pro',
        maxTokens: 8192,
        costPer1kTokens: 0,
        quality: 'excellent',
      },
    ],
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 250, tokensPerMinute: 70_000 },
    healthEndpoint: 'https://api.groq.com/openai/v1/models',
    priority: 4,
    capabilities: ['chat'],
  },
];

// ── Ultra Tier — Premium models (require API key configuration) ──

export const ULTRA_PROVIDERS: Provider[] = [
  {
    id: 'anthropic-claude-sonnet',
    name: 'Claude Sonnet 4',
    tier: 'paid',
    apiFormat: 'openai', // We handle Anthropic format in Rust adapter
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'CONFLUX_ANTHROPIC_API_KEY',
    models: [
      {
        id: 'claude-sonnet-4-20250514',
        alias: 'conflux-ultra',
        maxTokens: 16384,
        costPer1kTokens: 0.003,
        quality: 'excellent',
      },
    ],
    rateLimit: { requestsPerMinute: 50, requestsPerDay: 1000, tokensPerMinute: 400_000 },
    healthEndpoint: 'https://api.anthropic.com/v1/models',
    priority: 1,
    capabilities: ['chat'],
    headers: { 'anthropic-version': '2023-06-01' },
  },
  {
    id: 'openai-gpt4o',
    name: 'GPT-4o',
    tier: 'paid',
    apiFormat: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'CONFLUX_OPENAI_API_KEY',
    models: [
      {
        id: 'gpt-4o',
        alias: 'conflux-ultra',
        maxTokens: 16384,
        costPer1kTokens: 0.005,
        quality: 'excellent',
      },
    ],
    rateLimit: { requestsPerMinute: 500, requestsPerDay: 10000, tokensPerMinute: 2_000_000 },
    healthEndpoint: 'https://api.openai.com/v1/models',
    priority: 2,
    capabilities: ['chat', 'image', 'tts', 'stt'],
  },
  {
    id: 'xiaomi-mimo-pro',
    name: 'MiMo v2 Pro',
    tier: 'paid',
    apiFormat: 'openai',
    baseUrl: 'https://api.xiaomi.com/v1', // TODO: confirm
    apiKeyEnv: 'CONFLUX_XIAOMI_API_KEY',
    models: [
      {
        id: 'mimo-v2-pro',
        alias: 'conflux-ultra',
        maxTokens: 1000000,
        costPer1kTokens: 0.005,
        quality: 'excellent',
      },
    ],
    rateLimit: { requestsPerMinute: 60, requestsPerDay: 1000, tokensPerMinute: 1_000_000 },
    healthEndpoint: 'https://api.xiaomi.com/v1/models',
    priority: 3,
    capabilities: ['chat'],
  },
];

// ── TTS Providers ──

export const TTS_PROVIDERS: Provider[] = [
  {
    id: 'openai-tts',
    name: 'OpenAI TTS',
    tier: 'paid',
    apiFormat: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'CONFLUX_OPENAI_API_KEY',
    models: [
      { id: 'tts-1', alias: 'conflux-voice', maxTokens: 4096, costPer1kTokens: 0.015, quality: 'good' },
      { id: 'tts-1-hd', alias: 'conflux-voice-hd', maxTokens: 4096, costPer1kTokens: 0.030, quality: 'excellent' },
    ],
    rateLimit: { requestsPerMinute: 50, requestsPerDay: 5000, tokensPerMinute: 100_000 },
    healthEndpoint: 'https://api.openai.com/v1/models',
    priority: 1,
    capabilities: ['tts'],
  },
];

// ── Image Generation Providers ──

export const IMAGE_PROVIDERS: Provider[] = [
  {
    id: 'cloudflare-image',
    name: 'Cloudflare Workers AI',
    tier: 'free',
    apiFormat: 'openai',
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${env('VITE_CLOUDFLARE_ACCOUNT_ID')}/ai/v1`,
    apiKey: env('VITE_CLOUDFLARE_API_KEY'),
    models: [
      { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', alias: 'conflux-imagine', maxTokens: 0, costPer1kTokens: 0, quality: 'good' },
    ],
    rateLimit: { requestsPerMinute: 50, requestsPerDay: 10000, tokensPerMinute: 0 },
    healthEndpoint: 'https://api.cloudflare.com/client/v4/user',
    priority: 1,
    capabilities: ['image'],
  },
  {
    id: 'openai-image',
    name: 'OpenAI Image Gen',
    tier: 'paid',
    apiFormat: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'CONFLUX_OPENAI_API_KEY',
    models: [
      { id: 'gpt-image-1', alias: 'conflux-imagine', maxTokens: 0, costPer1kTokens: 0.005, quality: 'excellent' },
      { id: 'dall-e-3', alias: 'conflux-imagine', maxTokens: 0, costPer1kTokens: 0.040, quality: 'good' },
    ],
    rateLimit: { requestsPerMinute: 5, requestsPerDay: 500, tokensPerMinute: 0 },
    healthEndpoint: 'https://api.openai.com/v1/models',
    priority: 2,
    capabilities: ['image'],
  },
];

// ── Model Alias Map ──
// Maps our friendly aliases to which providers can serve them

export const ALIAS_MAP: Record<string, string[]> = {
  'conflux-core':      ['cerebras-llama-8b', 'groq-llama-8b', 'mistral-small', 'deepseek-chat', 'cloudflare-llama-8b'],
  'conflux-fast':      ['cerebras-llama-8b', 'groq-llama-8b', 'mistral-small', 'cloudflare-llama-8b'], // legacy alias
  'conflux-pro':       ['cerebras-qwen-235b', 'groq-llama-70b', 'mistral-medium', 'groq-deepseek-70b'],
  'conflux-smart':     ['cerebras-qwen-235b', 'groq-llama-70b'], // legacy alias
  'conflux-creative':  ['mistral-medium', 'deepseek-chat'],
  'conflux-ultra':     ['anthropic-claude-sonnet', 'openai-gpt4o', 'xiaomi-mimo-pro'],
  'conflux-vision':    [], // No free vision providers yet
  'conflux-imagine':   ['cloudflare-image', 'openai-image'],
  'conflux-voice':     ['openai-tts'],
  'conflux-local':     [], // Ollama — handled separately
};

// ── Helpers ──

/** Get all providers for a given tier (free + paid if tier is pro/ultra) */
export function getProvidersForTier(tier: 'free' | 'pro' | 'team'): Provider[] {
  if (tier === 'free') {
    return [...CORE_PROVIDERS];
  }
  return [...CORE_PROVIDERS, ...PRO_PROVIDERS, ...ULTRA_PROVIDERS];
}

/** Get providers that can serve a given alias */
export function getProvidersForAlias(
  alias: string,
  tier: 'free' | 'pro' | 'team',
): Provider[] {
  const providerIds = ALIAS_MAP[alias] ?? [];
  const pool = getProvidersForTier(tier);
  return pool
    .filter((p) => providerIds.includes(p.id))
    .sort((a, b) => a.priority - b.priority);
}

/** Find the model config for a given alias on a provider */
export function findModelForAlias(
  provider: Provider,
  alias: string,
): Provider['models'][0] | null {
  return provider.models.find((m) => m.alias === alias) ?? null;
}
