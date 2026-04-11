-- ============================================================
-- Migration: Sync model_routes + routing_config with routing-config.json
-- Date: 2026-04-01
--
-- Ensures ALL models from the deterministic router config exist
-- in the DB so the edge function router can find them.
-- Also adds missing providers and puts free-tier models first.
-- ============================================================

-- 1. Add missing providers
INSERT INTO provider_config (provider, api_key_encrypted, base_url, priority, rate_limit_rpm, rate_limit_tpm) VALUES
    ('deepseek',  'SET_VIA_DASHBOARD', 'https://api.deepseek.com/v1',         7, 300, 100000),
    ('xai',       'SET_VIA_DASHBOARD', 'https://api.x.ai/v1',                 7, 300, 100000),
    ('mistral',   'SET_VIA_DASHBOARD', 'https://api.mistral.ai/v1',           7, 300, 100000),
    ('cloudflare','SET_VIA_DASHBOARD', 'https://api.cloudflare.com/client/v4/accounts/36d37d313aa8598b2735b28b4211862b/ai/v1', 4, 500, 200000),
    ('mimo',      'SET_VIA_DASHBOARD', 'https://api.mimo.ai/v1',              7, 300, 100000)
ON CONFLICT (provider) DO NOTHING;

-- 2. Insert ALL models into model_routes
-- Free providers (Cerebras, Groq, Cloudflare) get 0 credit cost
-- Paid providers get standard costs

-- ── FREE TIER: Cerebras (0 credits) ──
INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier, enabled) VALUES
    ('llama-3.1-8b-cerebras',    'cerebras', 'llama3.1-8b',                    0, 0, 8192,  128000, 'core', true),
    ('llama-3.3-70b',            'cerebras', 'llama3.3-70b',                   0, 0, 8192,  128000, 'core', true),
    ('llama-4-scout',            'cerebras', 'llama-4-scout-17b-16e-instruct', 0, 0, 8192,  128000, 'core', true),
    ('qwen-3-235b-cerebras',     'cerebras', 'qwen-3-235b-a22b',               0, 0, 8192,  128000, 'core', true),
    ('glm-4.7-cerebras',         'cerebras', 'glm-4.7',                        0, 0, 8192,  128000, 'core', true),
    ('gpt-oss-120b-cerebras',    'cerebras', 'gpt-oss-120b',                   0, 0, 8192,  128000, 'core', true)
ON CONFLICT (model_alias) DO UPDATE SET enabled = true, credit_cost_per_1k_in = 0, credit_cost_per_1k_out = 0;

-- ── FREE TIER: Groq (0 credits) ──
INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier, enabled) VALUES
    ('llama-3.1-8b-groq',        'groq', 'llama-3.1-8b-instant',              0, 0, 8192,  128000, 'core', true),
    ('llama-3.3-70b-groq',       'groq', 'llama-3.3-70b-versatile',           0, 0, 32768, 128000, 'core', true),
    ('llama-4-scout-groq',       'groq', 'llama-4-scout-17b-16e-instruct',    0, 0, 32768, 128000, 'core', true),
    ('mixtral-8x7b',             'groq', 'mixtral-8x7b-32768',                0, 0, 32768, 32768,  'core', true),
    ('qwen3-32b-groq',           'groq', 'qwen/qwen3-32b',                    0, 0, 32768, 128000, 'core', true),
    ('gpt-oss-120b-groq',        'groq', 'openai/gpt-oss-120b',               0, 0, 32768, 128000, 'core', true),
    ('gpt-oss-20b-groq',         'groq', 'openai/gpt-oss-20b',                0, 0, 32768, 128000, 'core', true),
    ('kimi-k2-groq',             'groq', 'moonshotai/kimi-k2-instruct',       0, 0, 32768, 128000, 'pro', true)
ON CONFLICT (model_alias) DO UPDATE SET enabled = true, credit_cost_per_1k_in = 0, credit_cost_per_1k_out = 0;

-- ── FREE TIER: Cloudflare Workers AI (0 credits) ──
INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier, enabled) VALUES
    ('llama-3.3-70b-cf',         'cloudflare', '@cf/meta/llama-3.3-70b-instruct',    0, 0, 8192, 128000, 'core', true),
    ('llama-4-scout-cf',         'cloudflare', '@cf/meta/llama-4-scout-17b-16e',    0, 0, 8192, 128000, 'core', true),
    ('llama-3.1-8b-cf',          'cloudflare', '@cf/meta/llama-3.1-8b-instruct',    0, 0, 8192, 128000, 'core', true),
    ('llama-3.1-70b-cf',         'cloudflare', '@cf/meta/llama-3.1-70b-instruct',   0, 0, 8192, 128000, 'core', true),
    ('gpt-oss-120b-cf',          'cloudflare', '@cf/openai/gpt-oss-120b',           0, 0, 8192, 128000, 'core', true),
    ('qwen2.5-coder-cf',         'cloudflare', '@cf/qwen/qwen2.5-coder-32b',       0, 0, 8192, 128000, 'core', true),
    ('mistral-small-3.1-cf',     'cloudflare', '@cf/mistral/mistral-small-3.1',     0, 0, 8192, 128000, 'core', true),
    ('gemma-3-12b-cf',           'cloudflare', '@cf/google/gemma-3-12b-it',         0, 0, 8192, 128000, 'core', true),
    ('kimi-k2.5-cf',             'cloudflare', '@cf/moonshotai/kimi-k2.5',          0, 0, 8192, 128000, 'core', true),
    ('deepseek-r1-distill-cf',   'cloudflare', '@cf/deepseek/deepseek-r1-distill', 0, 0, 8192, 128000, 'core', true)
ON CONFLICT (model_alias) DO UPDATE SET enabled = true, credit_cost_per_1k_in = 0, credit_cost_per_1k_out = 0;

-- ── CORE TIER: Paid models (1 credit in, 1 credit out) ──
INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier, enabled) VALUES
    ('gpt-4o-mini',      'openai',     'gpt-4o-mini',                    1, 1, 16384, 128000, 'core', true),
    ('gpt-4.1-nano',     'openai',     'gpt-4.1-nano',                   1, 1, 16384, 128000, 'core', true),
    ('claude-haiku',      'anthropic',  'claude-haiku-4-20250514',        1, 1, 16384, 200000, 'core', true),
    ('claude-haiku-3.5',  'anthropic',  'claude-3-5-haiku-20241022',      1, 1, 16384, 200000, 'core', true),
    ('deepseek-chat',     'deepseek',   'deepseek-chat',                  1, 1, 16384, 128000, 'core', true),
    ('gemini-flash',      'google',     'gemini-2.0-flash',               1, 1, 8192,  1000000, 'core', true),
    ('grok-3-mini',       'xai',        'grok-3-mini',                    1, 1, 16384, 128000, 'core', true),
    ('grok-4.1-fast',     'xai',        'grok-4.1-fast',                  1, 1, 16384, 128000, 'core', true),
    ('mistral-small',     'mistral',    'mistral-small-latest',           1, 1, 16384, 128000, 'core', true),
    ('mistral-medium',    'mistral',    'mistral-medium-latest',          1, 1, 16384, 128000, 'core', true),
    ('gemini-pro',        'google',     'gemini-2.0-flash',               1, 1, 8192,  1000000, 'core', true),
    ('mimo-v2',           'mimo',       'mimo-v2',                        1, 1, 8192,  128000, 'core', true),
    ('ministral-8b',      'mistral',    'ministral-8b-latest',            1, 1, 8192,  128000, 'core', true)
ON CONFLICT (model_alias) DO UPDATE SET enabled = true;

-- ── PRO TIER (2 credits in, 2 credits out) ──
INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier, enabled) VALUES
    ('gemini-2.5-flash',  'google',     'gemini-2.5-flash-preview',     2, 2, 65536, 1000000, 'pro', true),
    ('gpt-4.1-mini',      'openai',     'gpt-4.1-mini',                  2, 2, 32768, 1000000, 'pro', true),
    ('deepseek-r1',       'deepseek',   'deepseek-reasoner',             2, 2, 16384, 128000, 'pro', true),
    ('o3-mini',           'openai',     'o3-mini',                        2, 2, 100000,200000, 'pro', true),
    ('o4-mini',           'openai',     'o4-mini',                        2, 2, 100000,200000, 'pro', true),
    ('codex-mini',        'openai',     'codex-mini-latest',              2, 2, 100000,200000, 'pro', true),
    ('grok-code-fast',    'xai',        'grok-code-fast',                2, 2, 16384, 128000, 'pro', true),
    ('mimo-v2-pro',       'mimo',       'mimo-v2-pro',                    2, 2, 16384, 128000, 'pro', true),
    ('mimo-v2-omni',      'mimo',       'mimo-v2-omni',                   2, 2, 16384, 128000, 'pro', true),
    ('mistral-large',     'mistral',    'mistral-large-latest',           2, 2, 16384, 128000, 'pro', true),
    ('mistral-codestral', 'mistral',    'codestral-latest',               2, 2, 16384, 128000, 'pro', true)
ON CONFLICT (model_alias) DO UPDATE SET enabled = true;

-- ── ULTRA TIER (5 credits in, 5 credits out) ──
INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier, enabled) VALUES
    ('claude-opus',       'anthropic',  'claude-opus-4-20250514',       5, 5, 16384, 200000, 'ultra', true),
    ('claude-sonnet',     'anthropic',  'claude-sonnet-4-20250514',     5, 5, 16384, 200000, 'ultra', true),
    ('claude-sonnet-4.5', 'anthropic',  'claude-3-5-sonnet-20241022',   5, 5, 16384, 200000, 'ultra', true),
    ('gpt-4.1',           'openai',     'gpt-4.1',                       5, 5, 32768, 1000000,'ultra', true),
    ('gpt-4o',            'openai',     'gpt-4o',                        5, 5, 16384, 128000, 'ultra', true),
    ('gemini-ultra',      'google',     'gemini-2.5-pro-preview',        5, 5, 65536, 1000000,'ultra', true),
    ('grok-3',            'xai',        'grok-3',                        5, 5, 16384, 128000, 'ultra', true),
    ('grok-4.20',         'xai',        'grok-4.20',                     5, 5, 16384, 128000, 'ultra', true),
    ('o1',                'openai',     'o1',                            5, 5, 100000,200000, 'ultra', true),
    ('o3',                'openai',     'o3',                            5, 5, 100000,200000, 'ultra', true)
ON CONFLICT (model_alias) DO UPDATE SET enabled = true;

-- 3. Update routing_config to put FREE models first for simple_chat
-- Free-tier users should hit 0-cost models before paid ones
UPDATE routing_config SET
  preferred_models = ARRAY[
    'llama-3.3-70b-cf',       -- free: Cloudflare
    'llama-3.3-70b-groq',     -- free: Groq
    'llama-3.3-70b',          -- free: Cerebras
    'llama-4-scout-cf',       -- free: Cloudflare
    'llama-4-scout-groq',     -- free: Groq
    'gpt-oss-120b-groq',      -- free: Groq
    'gpt-4o-mini',            -- paid: cheapest OpenAI
    'deepseek-chat',          -- paid: cheap DeepSeek
    'gemini-flash',           -- paid: cheap Google
    'grok-3-mini',            -- paid: cheap xAI
    'mistral-small'           -- paid: cheap Mistral
  ],
  min_tool_reliability = 'basic',
  updated_at = now()
WHERE task_type = 'simple_chat';

UPDATE routing_config SET
  preferred_models = ARRAY[
    'llama-3.3-70b-cf',
    'llama-3.3-70b-groq',
    'llama-3.3-70b',
    'gpt-4o-mini',
    'claude-haiku',
    'deepseek-chat',
    'mistral-medium',
    'gemini-flash'
  ],
  min_tool_reliability = 'basic',
  updated_at = now()
WHERE task_type = 'summarize';

UPDATE routing_config SET
  preferred_models = ARRAY[
    'llama-3.3-70b-cf',
    'llama-3.3-70b-groq',
    'llama-3.3-70b',
    'gpt-4o-mini',
    'deepseek-chat',
    'claude-haiku',
    'grok-4.1-fast',
    'mistral-small'
  ],
  min_tool_reliability = 'basic',
  updated_at = now()
WHERE task_type = 'extract';

UPDATE routing_config SET
  preferred_models = ARRAY[
    'llama-3.3-70b-cf',
    'llama-3.3-70b-groq',
    'llama-3.3-70b',
    'gpt-4o-mini',
    'deepseek-chat',
    'claude-haiku',
    'gemini-flash',
    'mistral-medium'
  ],
  min_tool_reliability = 'basic',
  updated_at = now()
WHERE task_type = 'translate';

-- 4. Also update the edge function TASK_TYPES to match
-- (This is done in code — see index.ts update)
