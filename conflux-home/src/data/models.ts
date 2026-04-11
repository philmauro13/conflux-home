
export interface ModelOption {
  id: string;
  name: string;
  tier: 'free' | 'pro' | 'ultra';
  provider: string;
  quality: 'basic' | 'good' | 'excellent';
  isPaid: boolean;
}

export const ModelOptions: ModelOption[] = [
  // Free (Core)
  {
    id: 'llama3.1-8b',
    name: 'Llama 3.1 8B',
    tier: 'free',
    provider: 'Cerebras',
    quality: 'basic',
    isPaid: false,
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B (Groq)',
    tier: 'free',
    provider: 'Groq',
    quality: 'basic',
    isPaid: false,
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    tier: 'free',
    provider: 'Mistral',
    quality: 'good',
    isPaid: false,
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    tier: 'free',
    provider: 'DeepSeek',
    quality: 'good',
    isPaid: false,
  },
  {
    id: '@cf/meta/llama-3.1-8b-instruct',
    name: 'Llama 3.1 8B (Cloudflare)',
    tier: 'free',
    provider: 'Cloudflare',
    quality: 'basic',
    isPaid: false,
  },
  // Pro (Free but better)
  {
    id: 'qwen-3-235b-a22b-instruct-2507',
    name: 'Qwen 3 235B',
    tier: 'pro',
    provider: 'Cerebras',
    quality: 'excellent',
    isPaid: false,
  },
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    tier: 'pro',
    provider: 'Groq',
    quality: 'excellent',
    isPaid: false,
  },
  {
    id: 'mistral-medium-latest',
    name: 'Mistral Medium',
    tier: 'pro',
    provider: 'Mistral',
    quality: 'good',
    isPaid: false,
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 70B',
    tier: 'pro',
    provider: 'Groq',
    quality: 'excellent',
    isPaid: false,
  },
  // Ultra (Paid)
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    tier: 'ultra',
    provider: 'Anthropic',
    quality: 'excellent',
    isPaid: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    tier: 'ultra',
    provider: 'OpenAI',
    quality: 'excellent',
    isPaid: true,
  },
  {
    id: 'mimo-v2-pro',
    name: 'MiMo v2 Pro',
    tier: 'ultra',
    provider: 'Xiaomi',
    quality: 'excellent',
    isPaid: true,
  },
];

export const DEFAULT_MODEL_ID = 'mistral-small-latest';

export const DEFAULT_MODEL = ModelOptions.find(m => m.id === DEFAULT_MODEL_ID) || ModelOptions[0];
