-- Migration 005: Fill model catalog gaps + populate fallback chains
-- Date: 2026-03-30
-- Source: model-catalog/MASTER_CATALOG.json gap analysis

-- ============================================================
-- 1. ADD MISSING ANTHROPIC MODELS
-- ============================================================

INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier, fallback_model) VALUES
    ('claude-sonnet-4.5',  'anthropic', 'claude-sonnet-4-5-20250929', 3, 15, 64000, 200000, 'ultra', 'claude-sonnet'),
    ('claude-haiku-3.5',   'anthropic', 'claude-3-5-haiku-20241022', 1, 4,  8192,  200000, 'core',  'claude-haiku')
ON CONFLICT (model_alias) DO NOTHING;

-- ============================================================
-- 2. ADD MISSING CEREBRAS MODELS (free tier)
-- ============================================================

INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier, fallback_model) VALUES
    ('qwen-3-235b-cerebras',    'cerebras', 'qwen-3-235b-a22b-instruct-2507', 1, 1, 4096, 131072, 'core', 'llama-3.3-70b-groq'),
    ('glm-4.7-cerebras',        'cerebras', 'zai-glm-4.7',                    1, 1, 4096, 131072, 'core', 'llama-3.3-70b-groq')
ON CONFLICT (model_alias) DO NOTHING;

-- ============================================================
-- 3. ADD MISSING CLOUDFLARE MODELS (free tier)
-- ============================================================

INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier, fallback_model) VALUES
    ('kimi-k2.5-cf',              'cloudflare', '@cf/moonshotai/kimi-k2.5',                       1, 1, 4096, 256000, 'core', 'llama-3.3-70b-cf'),
    ('llama-3.1-70b-cf',          'cloudflare', '@cf/meta/llama-3.1-70b-instruct-fp8-fast',         1, 1, 4096, 131000, 'core', 'llama-3.3-70b-cf'),
    ('llama-3.1-8b-cf',           'cloudflare', '@cf/meta/llama-3.1-8b-instruct-fp8-fast',          1, 1, 4096, 131000, 'core', 'llama-3.1-70b-cf'),
    ('deepseek-r1-distill-cf',    'cloudflare', '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',    1, 2, 4096, 131000, 'core', 'deepseek-r1'),
    ('mistral-small-3.1-cf',      'cloudflare', '@cf/mistralai/mistral-small-3.1-24b-instruct',     1, 1, 4096, 131000, 'core', 'mistral-small'),
    ('qwen2.5-coder-cf',          'cloudflare', '@cf/qwen/qwen2.5-coder-32b-instruct',             1, 1, 4096, 131000, 'core', 'llama-3.3-70b-cf'),
    ('gemma-3-12b-cf',            'cloudflare', '@cf/google/gemma-3-12b-it',                        1, 1, 4096, 131000, 'core', 'gemini-flash')
ON CONFLICT (model_alias) DO NOTHING;

-- ============================================================
-- 4. ADD MISSING GROQ MODELS (free tier)
-- ============================================================

INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier, fallback_model) VALUES
    ('qwen3-32b-groq',   'groq', 'qwen/qwen3-32b',                        1, 1, 4096, 131072, 'core', 'llama-3.3-70b-groq'),
    ('gpt-oss-20b-groq',  'groq', 'openai/gpt-oss-20b',                    1, 1, 4096, 131072, 'core', 'gpt-oss-120b-groq'),
    ('kimi-k2-groq',      'groq', 'moonshotai/kimi-k2-instruct-0905',      1, 2, 4096, 262144, 'pro',  'kimi-k2.5-cf')
ON CONFLICT (model_alias) DO NOTHING;

-- ============================================================
-- 5. ADD MISSING MISTRAL MODELS
-- ============================================================

INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier, fallback_model) VALUES
    ('ministral-3b',  'mistral', 'ministral-3b-2512',   1, 1, 4096, 131072, 'core', 'ministral-8b'),
    ('ministral-14b', 'mistral', 'ministral-14b-2512',  1, 1, 4096, 262144, 'core', 'mistral-small')
ON CONFLICT (model_alias) DO NOTHING;

-- ============================================================
-- 6. POPULATE FALLBACK CHAINS FOR EXISTING MODELS
--    Primary → same provider → same tier → cross provider
-- ============================================================

-- Ultra tier fallbacks (premium → premium)
UPDATE model_routes SET fallback_model = 'claude-sonnet'      WHERE model_alias = 'claude-opus';
UPDATE model_routes SET fallback_model = 'gpt-4.1'            WHERE model_alias = 'claude-sonnet';
UPDATE model_routes SET fallback_model = 'gpt-4o'             WHERE model_alias = 'gpt-4.1';
UPDATE model_routes SET fallback_model = 'grok-3'             WHERE model_alias = 'gpt-4o';
UPDATE model_routes SET fallback_model = 'claude-sonnet'      WHERE model_alias = 'grok-3';
UPDATE model_routes SET fallback_model = 'gemini-2.5-flash'   WHERE model_alias = 'gemini-pro';
UPDATE model_routes SET fallback_model = 'o4-mini'            WHERE model_alias = 'o1';
UPDATE model_routes SET fallback_model = 'o3-mini'            WHERE model_alias = 'o3';
UPDATE model_routes SET fallback_model = 'claude-sonnet'      WHERE model_alias = 'grok-4.20';

-- Pro tier fallbacks (pro → pro → core)
UPDATE model_routes SET fallback_model = 'gemini-2.5-flash'   WHERE model_alias = 'deepseek-r1';
UPDATE model_routes SET fallback_model = 'gpt-4.1-mini'       WHERE model_alias = 'gemini-2.5-flash';
UPDATE model_routes SET fallback_model = 'grok-code-fast'     WHERE model_alias = 'gpt-4.1-mini';
UPDATE model_routes SET fallback_model = 'mistral-large'      WHERE model_alias = 'grok-code-fast';
UPDATE model_routes SET fallback_model = 'mistral-codestral'  WHERE model_alias = 'mistral-large';
UPDATE model_routes SET fallback_model = 'mimo-v2-pro'        WHERE model_alias = 'mistral-codestral';
UPDATE model_routes SET fallback_model = 'deepseek-r1'        WHERE model_alias = 'mimo-v2-pro';
UPDATE model_routes SET fallback_model = 'deepseek-r1'        WHERE model_alias = 'mimo-v2-omni';
UPDATE model_routes SET fallback_model = 'gpt-4.1-mini'       WHERE model_alias = 'o3-mini';
UPDATE model_routes SET fallback_model = 'o3-mini'            WHERE model_alias = 'o4-mini';
UPDATE model_routes SET fallback_model = 'gpt-4.1-mini'       WHERE model_alias = 'codex-mini';
UPDATE model_routes SET fallback_model = 'gpt-oss-120b-groq'  WHERE model_alias = 'gpt-oss-120b-cerebras';
UPDATE model_routes SET fallback_model = 'gpt-oss-120b-cf'    WHERE model_alias = 'gpt-oss-120b-groq';
UPDATE model_routes SET fallback_model = 'gpt-oss-120b-cerebras' WHERE model_alias = 'gpt-oss-120b-cf';

-- Core tier fallbacks (core → core)
UPDATE model_routes SET fallback_model = 'gpt-4o-mini'        WHERE model_alias = 'claude-haiku';
UPDATE model_routes SET fallback_model = 'deepseek-chat'      WHERE model_alias = 'gpt-4o-mini';
UPDATE model_routes SET fallback_model = 'llama-3.3-70b-groq' WHERE model_alias = 'deepseek-chat';
UPDATE model_routes SET fallback_model = 'grok-3-mini'        WHERE model_alias = 'gemini-flash';
UPDATE model_routes SET fallback_model = 'mistral-small'      WHERE model_alias = 'grok-3-mini';
UPDATE model_routes SET fallback_model = 'llama-3.3-70b-groq' WHERE model_alias = 'grok-4.1-fast';
UPDATE model_routes SET fallback_model = 'llama-3.3-70b-cf'   WHERE model_alias = 'llama-3.1-8b-cerebras';
UPDATE model_routes SET fallback_model = 'llama-3.3-70b-cf'   WHERE model_alias = 'llama-3.1-8b-groq';
UPDATE model_routes SET fallback_model = 'llama-4-scout-cf'   WHERE model_alias = 'llama-3.3-70b-cf';
UPDATE model_routes SET fallback_model = 'llama-3.3-70b-groq' WHERE model_alias = 'llama-3.3-70b-groq';
UPDATE model_routes SET fallback_model = 'llama-3.3-70b-groq' WHERE model_alias = 'llama-4-scout-cf';
UPDATE model_routes SET fallback_model = 'llama-4-scout-cf'   WHERE model_alias = 'llama-4-scout-groq';
UPDATE model_routes SET fallback_model = 'gemini-flash'       WHERE model_alias = 'mimo-v2';
UPDATE model_routes SET fallback_model = 'mistral-small'      WHERE model_alias = 'ministral-8b';
UPDATE model_routes SET fallback_model = 'deepseek-chat'      WHERE model_alias = 'mistral-medium';
UPDATE model_routes SET fallback_model = 'llama-3.3-70b-groq' WHERE model_alias = 'mistral-small';
UPDATE model_routes SET fallback_model = 'llama-4-scout-groq' WHERE model_alias = 'pixtral-12b';
UPDATE model_routes SET fallback_model = 'gpt-4o-mini'        WHERE model_alias = 'gpt-4.1-nano';

-- ============================================================
-- 7. VERIFY — should return 55+ models
-- ============================================================
-- SELECT count(*) as total_models, tier, count(*) FILTER (WHERE fallback_model IS NOT NULL) as with_fallback
-- FROM model_routes WHERE enabled = true GROUP BY tier ORDER BY tier;
