-- Conflux Router — Provider Config, Model Routes, API Keys
-- Run in Supabase SQL Editor
-- Date: 2026-03-29

-- ============================================================
-- 1. PROVIDER CONFIG — Our API keys for each LLM provider
-- ============================================================

CREATE TABLE IF NOT EXISTS provider_config (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    provider        TEXT UNIQUE NOT NULL,       -- 'openai', 'anthropic', 'google', 'cerebras', 'groq'
    api_key_encrypted TEXT NOT NULL,            -- OUR provider key, base64 encoded (encrypt at rest later)
    base_url        TEXT NOT NULL,              -- API base URL
    enabled         BOOLEAN NOT NULL DEFAULT true,
    priority        INTEGER NOT NULL DEFAULT 0, -- higher = preferred
    rate_limit_rpm  INTEGER NOT NULL DEFAULT 1000,
    rate_limit_tpm  INTEGER NOT NULL DEFAULT 100000,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. MODEL ROUTES — Model alias → provider mapping + credit costs
-- ============================================================

CREATE TABLE IF NOT EXISTS model_routes (
    id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    model_alias             TEXT UNIQUE NOT NULL,   -- user-facing name: 'gpt-4o', 'claude-sonnet', 'gemini-pro'
    provider                TEXT NOT NULL REFERENCES provider_config(provider),
    provider_model_id       TEXT NOT NULL,          -- actual model ID at provider (may differ from alias)
    credit_cost_per_1k_in   INTEGER NOT NULL DEFAULT 1,
    credit_cost_per_1k_out  INTEGER NOT NULL DEFAULT 2,
    max_tokens              INTEGER NOT NULL DEFAULT 4096,
    context_window          INTEGER NOT NULL DEFAULT 128000,
    enabled                 BOOLEAN NOT NULL DEFAULT true,
    fallback_model          TEXT,                   -- if this model is down, try this alias
    tier                    TEXT NOT NULL DEFAULT 'core',  -- core | pro | ultra
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. API KEYS — Developer-facing API keys (cf_live_ / cf_test_)
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id     UUID NOT NULL REFERENCES auth.users(id),
    key_hash    TEXT UNIQUE NOT NULL,           -- SHA-256 hash of the full key
    key_prefix  TEXT NOT NULL,                  -- first 12 chars for display: 'cf_live_a1b2'
    name        TEXT NOT NULL DEFAULT 'Default Key',
    is_active   BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ                    -- null = never expires
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- ============================================================
-- 4. SEED PROVIDER CONFIG
--    API keys to be set via Supabase dashboard or UPDATE statements
-- ============================================================

INSERT INTO provider_config (provider, api_key_encrypted, base_url, priority, rate_limit_rpm, rate_limit_tpm) VALUES
    ('openai',    'SET_VIA_DASHBOARD', 'https://api.openai.com/v1',            10, 500, 150000),
    ('anthropic', 'SET_VIA_DASHBOARD', 'https://api.anthropic.com/v1',         9,  400, 100000),
    ('google',    'SET_VIA_DASHBOARD', 'https://generativelanguage.googleapis.com/v1beta', 8, 300, 120000),
    ('cerebras',  'SET_VIA_DASHBOARD', 'https://api.cerebras.ai/v1',          5,  300, 100000),
    ('groq',      'SET_VIA_DASHBOARD', 'https://api.groq.com/openai/v1',      6,  300, 100000)
ON CONFLICT (provider) DO NOTHING;

-- ============================================================
-- 5. SEED MODEL ROUTES
--    Map user-facing model names to providers with credit costs
-- ============================================================

-- OpenAI models
INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier) VALUES
    ('gpt-4o',         'openai', 'gpt-4o',              5,  10, 16384, 128000, 'ultra'),
    ('gpt-4o-mini',    'openai', 'gpt-4o-mini',         1,  2,  16384, 128000, 'core'),
    ('gpt-4-turbo',    'openai', 'gpt-4-turbo',         4,  8,  4096,  128000, 'pro'),
    ('o1',             'openai', 'o1',                  8,  16, 100000, 200000, 'ultra'),
    ('o1-mini',        'openai', 'o1-mini',             2,  4,  65536, 128000, 'pro'),
    ('o3-mini',        'openai', 'o3-mini',             2,  4,  100000, 200000, 'pro')
ON CONFLICT (model_alias) DO NOTHING;

-- Anthropic models
INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier) VALUES
    ('claude-sonnet',      'anthropic', 'claude-sonnet-4-20250514',    3,  5,  16384, 200000, 'pro'),
    ('claude-haiku',       'anthropic', 'claude-haiku-4-20250514',     1,  2,  16384, 200000, 'core'),
    ('claude-opus',        'anthropic', 'claude-opus-4-20250514',      10, 20, 16384, 200000, 'ultra')
ON CONFLICT (model_alias) DO NOTHING;

-- Google models
INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier) VALUES
    ('gemini-pro',     'google', 'gemini-2.0-flash',            1,  2,  8192,  1000000, 'core'),
    ('gemini-ultra',   'google', 'gemini-2.5-pro-preview',      4,  8,  65536, 1000000, 'ultra')
ON CONFLICT (model_alias) DO NOTHING;

-- Cerebras models (free tier fast inference)
INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier) VALUES
    ('llama-3.3-70b',  'cerebras', 'llama3.3-70b',  1,  1,  8192, 128000, 'core'),
    ('llama-4-scout',  'cerebras', 'llama-4-scout-17b-16e-instruct', 1, 1, 8192, 128000, 'core')
ON CONFLICT (model_alias) DO NOTHING;

-- Groq models (free tier fast inference)
INSERT INTO model_routes (model_alias, provider, provider_model_id, credit_cost_per_1k_in, credit_cost_per_1k_out, max_tokens, context_window, tier) VALUES
    ('llama-3.3-70b-groq', 'groq', 'llama-3.3-70b-versatile', 1, 1, 32768, 128000, 'core'),
    ('mixtral-8x7b',       'groq', 'mixtral-8x7b-32768',      1, 1, 32768, 32768,  'core')
ON CONFLICT (model_alias) DO NOTHING;

-- ============================================================
-- 6. RLS POLICIES
-- ============================================================

-- provider_config: admin only (service role)
ALTER TABLE provider_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access provider_config" ON provider_config;
CREATE POLICY "Service role full access provider_config" ON provider_config
    FOR ALL USING (true) WITH CHECK (true);

-- model_routes: readable by all, writable by service role
ALTER TABLE model_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone read model routes" ON model_routes;
CREATE POLICY "Anyone read model routes" ON model_routes
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role write model routes" ON model_routes;
CREATE POLICY "Service role write model routes" ON model_routes
    FOR ALL USING (true) WITH CHECK (true);

-- api_keys: users read own, service role full access
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own api keys" ON api_keys;
CREATE POLICY "Users read own api keys" ON api_keys
    FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role full access api keys" ON api_keys;
CREATE POLICY "Service role full access api keys" ON api_keys
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 7. HELPER: Check if user has enough credits for a model call
-- ============================================================

CREATE OR REPLACE FUNCTION check_user_credits(
    p_user_id UUID,
    p_model_alias TEXT,
    p_estimated_tokens_in INTEGER DEFAULT 1000,
    p_estimated_tokens_out INTEGER DEFAULT 1000
) RETURNS TABLE (
    has_credits BOOLEAN,
    estimated_cost INTEGER,
    current_balance INTEGER,
    model_tier TEXT
) LANGUAGE plpgsql AS $$
DECLARE
    v_balance INTEGER := 0;
    v_cost_in INTEGER;
    v_cost_out INTEGER;
    v_total_cost INTEGER;
    v_tier TEXT;
BEGIN
    -- Get user balance (default to 0 if no row exists)
    SELECT COALESCE(balance, 0) INTO v_balance
    FROM credit_accounts WHERE user_id = p_user_id;

    IF v_balance IS NULL THEN
        v_balance := 0;
    END IF;

    -- Get model costs
    SELECT credit_cost_per_1k_in, credit_cost_per_1k_out, tier
    INTO v_cost_in, v_cost_out, v_tier
    FROM model_routes
    WHERE model_alias = p_model_alias AND enabled = true;

    IF v_cost_in IS NULL THEN
        v_cost_in := 1;
        v_cost_out := 2;
        v_tier := 'core';
    END IF;

    -- Calculate estimated cost (ceil to 1k blocks)
    v_total_cost := CEIL(p_estimated_tokens_in::float / 1000) * v_cost_in
                  + CEIL(p_estimated_tokens_out::float / 1000) * v_cost_out;

    RETURN QUERY SELECT
        v_balance >= v_total_cost AS has_credits,
        v_total_cost AS estimated_cost,
        v_balance AS current_balance,
        v_tier AS model_tier;
END;
$$;

-- ============================================================
-- 8. HELPER: Deduct credits after a successful API call
-- ============================================================

CREATE OR REPLACE FUNCTION deduct_credits(
    p_user_id UUID,
    p_model_alias TEXT,
    p_tokens_in INTEGER,
    p_tokens_out INTEGER,
    p_provider TEXT,
    p_status TEXT DEFAULT 'success',
    p_latency_ms INTEGER DEFAULT NULL
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_cost_in INTEGER;
    v_cost_out INTEGER;
    v_total_cost INTEGER;
    v_new_balance INTEGER;
BEGIN
    -- Get model costs
    SELECT credit_cost_per_1k_in, credit_cost_per_1k_out
    INTO v_cost_in, v_cost_out
    FROM model_routes
    WHERE model_alias = p_model_alias AND enabled = true;

    IF v_cost_in IS NULL THEN
        v_cost_in := 1;
        v_cost_out := 2;
    END IF;

    -- Calculate cost
    v_total_cost := CEIL(p_tokens_in::float / 1000) * v_cost_in
                  + CEIL(p_tokens_out::float / 1000) * v_cost_out;

    -- Deduct from balance
    UPDATE credit_accounts
    SET balance = balance - v_total_cost,
        total_consumed = total_consumed + v_total_cost,
        last_charge_at = now(),
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;

    -- Log transaction
    INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
    VALUES (p_user_id, 'usage', -v_total_cost, v_new_balance,
            format('%s: %s in / %s out tokens via %s', p_model_alias, p_tokens_in::text, p_tokens_out::text, p_provider));

    -- Log usage
    INSERT INTO usage_log (user_id, model, provider_id, tokens_used, latency_ms, status, credits_charged, call_type)
    VALUES (p_user_id, p_model_alias, p_provider, p_tokens_in + p_tokens_out, p_latency_ms, p_status, v_total_cost, 'chat');

    RETURN v_total_cost;
END;
$$;

-- ============================================================
-- DONE. Tables: provider_config, model_routes, api_keys
-- Functions: check_user_credits(), deduct_credits()
-- ============================================================
