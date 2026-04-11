-- ============================================================
-- Migration: API Billing System
-- Date: 2026-03-30
-- Depends on: provider_pricing (already created), model_routes
-- Depends on: 006_tool_calling_and_routing.sql
-- ============================================================

-- ============================================================
-- 1. TABLE: api_credit_accounts
-- ============================================================

CREATE TABLE api_credit_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  total_purchased INTEGER NOT NULL DEFAULT 0,
  total_consumed INTEGER NOT NULL DEFAULT 0,
  total_refunded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id)
);

ALTER TABLE api_credit_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own API credits"
  ON api_credit_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON api_credit_accounts FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_api_credits_user ON api_credit_accounts(user_id);

-- ============================================================
-- 2. TABLE: api_credit_transactions
-- ============================================================

CREATE TABLE api_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'usage', 'refund', 'adjustment', 'bonus')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  stripe_payment_id TEXT,
  stripe_refund_id TEXT,
  model_alias TEXT,
  provider TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  provider_cost_usd NUMERIC(10,6) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE api_credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON api_credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON api_credit_transactions FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_api_tx_user ON api_credit_transactions(user_id, created_at DESC);
CREATE INDEX idx_api_tx_type ON api_credit_transactions(type, created_at DESC);
CREATE INDEX idx_api_tx_stripe ON api_credit_transactions(stripe_payment_id) WHERE stripe_payment_id IS NOT NULL;

-- ============================================================
-- 3. TABLE: api_usage_log
-- ============================================================

CREATE TABLE api_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  api_key_prefix TEXT,
  model_alias TEXT NOT NULL,
  provider TEXT NOT NULL,
  task_type TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  credits_charged INTEGER DEFAULT 0,
  provider_cost_usd NUMERIC(10,6) DEFAULT 0,
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'rate_limited', 'insufficient_credits')),
  fallback_used BOOLEAN DEFAULT false,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON api_usage_log FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_api_usage_user_month ON api_usage_log(user_id, created_at DESC);
CREATE INDEX idx_api_usage_created ON api_usage_log(created_at DESC);
CREATE INDEX idx_api_usage_model ON api_usage_log(model_alias, created_at DESC);

-- ============================================================
-- 4. RPC: check_api_credits
-- ============================================================

CREATE OR REPLACE FUNCTION check_api_credits(
  p_user_id UUID,
  p_model_alias TEXT,
  p_estimated_tokens_in INTEGER,
  p_estimated_tokens_out INTEGER
)
RETURNS TABLE (
  has_credits BOOLEAN,
  estimated_cost INTEGER,
  current_balance INTEGER,
  model_tier TEXT
) AS $$
DECLARE
  v_balance INTEGER;
  v_tier TEXT;
  v_cost_in NUMERIC;
  v_cost_out NUMERIC;
  v_estimated_cost INTEGER;
BEGIN
  -- Get balance
  SELECT balance INTO v_balance
  FROM api_credit_accounts
  WHERE user_id = p_user_id;

  IF v_balance IS NULL THEN
    -- Auto-create with 0 balance (free tier, rate-limited)
    INSERT INTO api_credit_accounts (user_id, balance)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
    v_balance := 0;
  END IF;

  -- Get model tier and costs from model_routes
  SELECT
    mr.tier,
    mr.credit_cost_per_1k_in,
    mr.credit_cost_per_1k_out
  INTO v_tier, v_cost_in, v_cost_out
  FROM model_routes mr
  WHERE mr.model_alias = p_model_alias AND mr.enabled = true;

  IF v_tier IS NULL THEN
    v_tier := 'core';
    v_cost_in := 1;
    v_cost_out := 2;
  END IF;

  -- Calculate estimated cost
  v_estimated_cost := CEIL(p_estimated_tokens_in / 1000.0) * v_cost_in
                    + CEIL(p_estimated_tokens_out / 1000.0) * v_cost_out;

  RETURN QUERY SELECT
    v_balance >= v_estimated_cost AS has_credits,
    v_estimated_cost AS estimated_cost,
    v_balance AS current_balance,
    v_tier AS model_tier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. RPC: deduct_api_credits
-- ============================================================

CREATE OR REPLACE FUNCTION deduct_api_credits(
  p_user_id UUID,
  p_model_alias TEXT,
  p_tokens_in INTEGER,
  p_tokens_out INTEGER,
  p_provider TEXT,
  p_status TEXT,
  p_latency_ms INTEGER,
  p_task_type TEXT DEFAULT NULL,
  p_api_key_prefix TEXT DEFAULT NULL,
  p_fallback_used BOOLEAN DEFAULT false,
  p_provider_cost_usd NUMERIC DEFAULT 0
)
RETURNS VOID AS $$
DECLARE
  v_cost_in NUMERIC;
  v_cost_out NUMERIC;
  v_credits INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Get credit costs
  SELECT credit_cost_per_1k_in, credit_cost_per_1k_out
  INTO v_cost_in, v_cost_out
  FROM model_routes
  WHERE model_alias = p_model_alias AND enabled = true;

  IF v_cost_in IS NULL THEN
    v_cost_in := 1;
    v_cost_out := 2;
  END IF;

  -- Calculate credits to deduct
  v_credits := CEIL(p_tokens_in / 1000.0) * v_cost_in
             + CEIL(p_tokens_out / 1000.0) * v_cost_out;

  -- Only deduct on success
  IF p_status = 'success' THEN
    UPDATE api_credit_accounts
    SET balance = GREATEST(0, balance - v_credits),
        total_consumed = total_consumed + v_credits,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;

    -- Log transaction
    INSERT INTO api_credit_transactions (
      user_id, type, amount, balance_after,
      model_alias, provider, tokens_in, tokens_out, provider_cost_usd
    ) VALUES (
      p_user_id, 'usage', -v_credits, COALESCE(v_new_balance, 0),
      p_model_alias, p_provider, p_tokens_in, p_tokens_out, p_provider_cost_usd
    );
  END IF;

  -- Always log usage (success or failure)
  INSERT INTO api_usage_log (
    user_id, api_key_prefix, model_alias, provider, task_type,
    tokens_in, tokens_out, credits_charged, provider_cost_usd,
    latency_ms, status, fallback_used
  ) VALUES (
    p_user_id, p_api_key_prefix, p_model_alias, p_provider, p_task_type,
    p_tokens_in, p_tokens_out,
    CASE WHEN p_status = 'success' THEN v_credits ELSE 0 END,
    p_provider_cost_usd,
    p_latency_ms, p_status, p_fallback_used
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. RPC: add_api_credits
-- ============================================================

CREATE OR REPLACE FUNCTION add_api_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_stripe_payment_id TEXT
)
RETURNS VOID AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  INSERT INTO api_credit_accounts (user_id, balance, total_purchased)
  VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET
    balance = api_credit_accounts.balance + p_amount,
    total_purchased = api_credit_accounts.total_purchased + p_amount,
    updated_at = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO api_credit_transactions (
    user_id, type, amount, balance_after, stripe_payment_id
  ) VALUES (
    p_user_id, 'purchase', p_amount, v_new_balance, p_stripe_payment_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
