-- ============================================================
-- Migration: API Billing Passthrough + 5% Fee
-- Date: 2026-04-03
-- 
-- KEY CHANGE: API router credits now use EXACT provider pricing (passthrough).
-- Users pay a 5% transaction fee on credit purchases only — never on usage.
-- 
-- Desktop app credits (credit_accounts) are UNAFFECTED.
-- ============================================================

-- ============================================================
-- 1. Ensure provider_pricing table exists with 1:1 provider costs
-- ============================================================

CREATE TABLE IF NOT EXISTS provider_pricing (
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  cost_per_1k_input NUMERIC(10,6) NOT NULL,
  cost_per_1k_output NUMERIC(10,6) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, model_id)
);

ALTER TABLE provider_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON provider_pricing FOR ALL USING (auth.role() = 'service_role');

-- Seed with current provider pricing (March/April 2026)
-- These are EXACT provider costs — no markup
INSERT INTO provider_pricing (provider, model_id, cost_per_1k_input, cost_per_1k_output) VALUES
  -- OpenAI
  ('openai', 'gpt-4o-mini', 0.000150, 0.000600),
  ('openai', 'gpt-4.1-mini', 0.000400, 0.001600),
  ('openai', 'gpt-4.1', 0.002000, 0.008000),
  ('openai', 'gpt-4o', 0.002500, 0.010000),
  ('openai', 'o3-mini', 0.001100, 0.004400),
  ('openai', 'o4-mini', 0.001100, 0.004400),
  ('openai', 'o1', 0.015000, 0.060000),
  -- Anthropic
  ('anthropic', 'claude-haiku-4-20250514', 0.000250, 0.001250),
  ('anthropic', 'claude-haiku-3.5', 0.000250, 0.001250),
  ('anthropic', 'claude-sonnet-4-20250514', 0.003000, 0.015000),
  ('anthropic', 'claude-sonnet-4.5', 0.003000, 0.015000),
  ('anthropic', 'claude-opus-4-20250514', 0.015000, 0.075000),
  -- Google
  ('google', 'gemini-2.0-flash', 0.000075, 0.000300),
  ('google', 'gemini-2.5-pro-preview', 0.001250, 0.005000),
  ('google', 'gemini-2.5-flash', 0.000150, 0.000600),
  -- DeepSeek
  ('deepseek', 'deepseek-chat', 0.000140, 0.000280),
  ('deepseek', 'deepseek-r1', 0.000550, 0.002200),
  -- xAI / Grok
  ('xai', 'grok-3-mini', 0.000300, 0.000900),
  ('xai', 'grok-4.1-fast', 0.000200, 0.000800),
  ('xai', 'grok-code-fast', 0.000200, 0.000800),
  ('xai', 'grok-4.20', 0.002000, 0.010000),
  -- Mistral
  ('mistral', 'mistral-small', 0.000100, 0.000300),
  ('mistral', 'mistral-medium', 0.000270, 0.000810),
  ('mistral', 'mistral-large', 0.002000, 0.006000),
  ('mistral', 'mistral-codestral', 0.001000, 0.003000),
  -- Cerebras
  ('cerebras', 'llama-3.3-70b-cerebras', 0.000059, 0.000059),
  ('cerebras', 'llama-3.1-8b-cerebras', 0.000030, 0.000030),
  -- Groq
  ('groq', 'llama-3.3-70b-groq', 0.000059, 0.000059),
  ('groq', 'llama-4-scout-groq', 0.000059, 0.000059),
  ('groq', 'gpt-oss-120b-groq', 0.000059, 0.000059),
  ('groq', 'kimi-k2-groq', 0.000059, 0.000059)
ON CONFLICT (provider, model_id) DO UPDATE SET
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  updated_at = now();

-- ============================================================
-- 2. Create function to compute API credit costs from provider pricing
--    This REPLACES the static model_routes credit costs for API users.
-- ============================================================

CREATE OR REPLACE FUNCTION compute_api_credit_cost(
  p_model_alias TEXT,
  p_tokens_in INTEGER,
  p_tokens_out INTEGER
)
RETURNS TABLE (
  credits_charged INTEGER,
  provider_cost_usd NUMERIC,
  model_tier TEXT
) AS $$
DECLARE
  v_provider TEXT;
  v_provider_model_id TEXT;
  v_cost_in NUMERIC;
  v_cost_out NUMERIC;
  v_raw_cost NUMERIC;
  v_tier TEXT;
BEGIN
  -- Get the provider and model mapping
  SELECT mr.provider, mr.provider_model_id, mr.tier
  INTO v_provider, v_provider_model_id, v_tier
  FROM model_routes mr
  WHERE mr.model_alias = p_model_alias AND mr.enabled = true
  LIMIT 1;

  IF v_provider IS NULL THEN
    -- Fallback: default to core tier pricing
    v_tier := 'core';
    v_cost_in := 0.000100;
    v_cost_out := 0.000300;
  ELSE
    -- Get exact provider pricing
    SELECT pp.cost_per_1k_input, pp.cost_per_1k_output
    INTO v_cost_in, v_cost_out
    FROM provider_pricing pp
    WHERE pp.provider = v_provider AND pp.model_id = v_provider_model_id;

    -- If pricing not found, use defaults based on tier
    IF v_cost_in IS NULL THEN
      IF v_tier = 'ultra' THEN
        v_cost_in := 0.002000;
        v_cost_out := 0.008000;
      ELSIF v_tier = 'pro' THEN
        v_cost_in := 0.000400;
        v_cost_out := 0.001600;
      ELSE
        v_cost_in := 0.000100;
        v_cost_out := 0.000300;
      END IF;
    END IF;
  END IF;

  -- Calculate exact provider cost
  v_raw_cost := (CEIL(p_tokens_in::NUMERIC / 1000.0) * v_cost_in)
              + (CEIL(p_tokens_out::NUMERIC / 1000.0) * v_cost_out);

  -- Convert to credits: 1 credit = $0.001 (1/10th of a cent)
  -- This makes credit numbers more readable (e.g., $9.50 = 9,500 credits)
  -- ROUND UP to ensure we never undercharge
  credits_charged := GREATEST(1, CEIL(v_raw_cost / 0.001));
  provider_cost_usd := v_raw_cost;
  model_tier := v_tier;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. Update deduct_api_credits to use dynamic pricing
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
  v_credit_result RECORD;
  v_credits INTEGER;
  v_new_balance INTEGER;
  v_actual_provider_cost NUMERIC;
BEGIN
  -- Use dynamic pricing function
  SELECT * INTO v_credit_result
  FROM compute_api_credit_cost(p_model_alias, p_tokens_in, p_tokens_out);

  v_credits := v_credit_result.credits_charged;
  v_actual_provider_cost := COALESCE(p_provider_cost_usd, v_credit_result.provider_cost_usd);

  -- Only deduct on success
  IF p_status = 'success' THEN
    UPDATE api_credit_accounts
    SET balance = GREATEST(0, balance - v_credits),
        total_consumed = total_consumed + v_credits,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;

    -- Log transaction with exact provider cost
    INSERT INTO api_credit_transactions (
      user_id, type, amount, balance_after,
      model_alias, provider, tokens_in, tokens_out, provider_cost_usd
    ) VALUES (
      p_user_id, 'usage', -v_credits, COALESCE(v_new_balance, 0),
      p_model_alias, p_provider, p_tokens_in, p_tokens_out, v_actual_provider_cost
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
    v_actual_provider_cost,
    p_latency_ms, p_status, p_fallback_used
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. Create RPC for purchasing credits with 5% fee
--    User pays $10 → gets credits worth $9.50, we keep $0.50
-- ============================================================

CREATE OR REPLACE FUNCTION purchase_api_credits(
  p_user_id UUID,
  p_amount_usd_cents INTEGER,
  p_stripe_payment_id TEXT
)
RETURNS VOID AS $$
DECLARE
  v_amount_usd NUMERIC;
  v_fee_cents INTEGER;
  v_credit_amount INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Convert cents to USD
  v_amount_usd := p_amount_usd_cents::NUMERIC / 100.0;

  -- Calculate 5% fee (round down to favor user)
  v_fee_cents := FLOOR(p_amount_usd_cents * 0.05);

  -- Credits remaining after fee, converted to credit units
  -- 1 credit = $0.001, so $9.50 = 9,500 credits
  v_credit_amount := FLOOR((p_amount_usd_cents - v_fee_cents)::NUMERIC / 0.1);

  -- Add credits to user's account
  INSERT INTO api_credit_accounts (user_id, balance, total_purchased)
  VALUES (p_user_id, v_credit_amount, v_credit_amount)
  ON CONFLICT (user_id) DO UPDATE SET
    balance = api_credit_accounts.balance + v_credit_amount,
    total_purchased = api_credit_accounts.total_purchased + v_credit_amount,
    updated_at = now()
  RETURNING balance INTO v_new_balance;

  -- Log the purchase transaction
  INSERT INTO api_credit_transactions (
    user_id, type, amount, balance_after, stripe_payment_id,
    metadata
  ) VALUES (
    p_user_id, 'purchase', v_credit_amount, v_new_balance, p_stripe_payment_id,
    jsonb_build_object(
      'amount_paid_cents', p_amount_usd_cents,
      'fee_cents', v_fee_cents,
      'credits_issued', v_credit_amount,
      'effective_price_per_credit', (p_amount_usd_cents - v_fee_cents)::NUMERIC / v_credit_amount
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. Update check_api_credits to use dynamic pricing
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
  v_credit_result RECORD;
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

  -- Calculate estimated cost using dynamic pricing
  SELECT * INTO v_credit_result
  FROM compute_api_credit_cost(p_model_alias, p_estimated_tokens_in, p_estimated_tokens_out);

  RETURN QUERY SELECT
    v_balance >= v_credit_result.credits_charged AS has_credits,
    v_credit_result.credits_charged AS estimated_cost,
    v_balance AS current_balance,
    v_credit_result.model_tier AS model_tier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Verification
-- ============================================================

SELECT 'Migration 012: API billing passthrough + 5% fee applied' AS status;
SELECT 'provider_pricing entries:' AS info, COUNT(*) AS count FROM provider_pricing;
