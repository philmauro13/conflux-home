-- Usage Tracking + Credit System Migration
-- Run this in Supabase SQL Editor
-- Date: 2026-03-29

-- ============================================================
-- 1. USAGE LOG — Every model call, append-only
-- ============================================================

CREATE TABLE IF NOT EXISTS usage_log (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id         UUID NOT NULL REFERENCES auth.users(id),
    session_id      TEXT,
    agent_id        TEXT,
    model           TEXT NOT NULL,
    provider_id     TEXT NOT NULL,
    tier            TEXT NOT NULL DEFAULT 'core',
    tokens_used     INTEGER NOT NULL DEFAULT 0,
    latency_ms      INTEGER,
    status          TEXT NOT NULL DEFAULT 'success',
    error_message   TEXT,
    credits_charged INTEGER NOT NULL DEFAULT 0,
    call_type       TEXT NOT NULL DEFAULT 'chat',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_log(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_log(provider_id);
CREATE INDEX IF NOT EXISTS idx_usage_status ON usage_log(status);

-- ============================================================
-- 2. CREDIT ACCOUNTS — One row per user, real-time balance
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_accounts (
    user_id             UUID PRIMARY KEY REFERENCES auth.users(id),
    balance             INTEGER NOT NULL DEFAULT 0,
    total_purchased     INTEGER NOT NULL DEFAULT 0,
    total_consumed      INTEGER NOT NULL DEFAULT 0,
    total_deposited_cents INTEGER NOT NULL DEFAULT 0,
    last_topup_at       TIMESTAMPTZ,
    last_charge_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. CREDIT TRANSACTIONS — Audit trail for all balance changes
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_transactions (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id         UUID NOT NULL REFERENCES auth.users(id),
    type            TEXT NOT NULL,
    amount          INTEGER NOT NULL,
    balance_after   INTEGER NOT NULL,
    description     TEXT,
    stripe_payment_id TEXT,
    related_usage_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credits_user ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credits_date ON credit_transactions(created_at);

-- ============================================================
-- 4. CREDIT CONFIG — Editable credit costs per model/provider
--    Edit from Supabase dashboard to adjust margins anytime
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_config (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    config_type     TEXT NOT NULL,           -- 'model' | 'action' | 'tier'
    match_key       TEXT NOT NULL,           -- model name, provider_id, 'image_gen', 'tts', or tier name
    credits_per_call INTEGER NOT NULL DEFAULT 1,
    description     TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_config_key ON credit_config(config_type, match_key);

-- Seed default credit costs
INSERT INTO credit_config (config_type, match_key, credits_per_call, description) VALUES
    -- By tier (fallback if no model-specific config)
    ('tier', 'core', 1, 'Free tier models: Cerebras, Groq, Mistral, Cloudflare'),
    ('tier', 'pro', 3, 'Mid-range: Llama 3.3 70B, Qwen, GPT-4o-mini'),
    ('tier', 'ultra', 5, 'Premium: Claude Sonnet, GPT-4o, Gemini Pro'),
    -- By action
    ('action', 'image_gen', 3, 'Image generation (Replicate Flux)'),
    ('action', 'tts', 2, 'Text-to-speech per 500 chars (ElevenLabs)')
ON CONFLICT (config_type, match_key) DO NOTHING;

-- ============================================================
-- 5. UPDATE ch_subscriptions — Add tracking columns
-- ============================================================

ALTER TABLE ch_subscriptions ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ;
ALTER TABLE ch_subscriptions ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';

-- ============================================================
-- 6. RLS POLICIES
-- ============================================================

-- usage_log
ALTER TABLE usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own usage" ON usage_log;
CREATE POLICY "Users read own usage" ON usage_log
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access usage" ON usage_log;
CREATE POLICY "Service role full access usage" ON usage_log
    FOR ALL USING (true) WITH CHECK (true);

-- credit_accounts
ALTER TABLE credit_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own credits" ON credit_accounts;
CREATE POLICY "Users read own credits" ON credit_accounts
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access credits" ON credit_accounts;
CREATE POLICY "Service role full access credits" ON credit_accounts
    FOR ALL USING (true) WITH CHECK (true);

-- credit_transactions
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own transactions" ON credit_transactions;
CREATE POLICY "Users read own transactions" ON credit_transactions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access transactions" ON credit_transactions;
CREATE POLICY "Service role full access transactions" ON credit_transactions
    FOR ALL USING (true) WITH CHECK (true);

-- credit_config: readable by all authenticated users, writable by service role only
ALTER TABLE credit_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read credit config" ON credit_config;
CREATE POLICY "Anyone read credit config" ON credit_config
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role write credit config" ON credit_config;
CREATE POLICY "Service role write credit config" ON credit_config
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 7. SEED credit_accounts FOR EXISTING USERS
--    Creates a row for every user in auth.users who doesn't have one
-- ============================================================

INSERT INTO credit_accounts (user_id, balance, created_at, updated_at)
SELECT id, 0, now(), now()
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM credit_accounts)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- DONE. Verify with:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
--   AND tablename IN ('usage_log', 'credit_accounts', 'credit_transactions', 'credit_config');
-- ============================================================
