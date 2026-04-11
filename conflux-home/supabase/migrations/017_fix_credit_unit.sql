-- Fix credit unit: 1 credit = $0.001 (1/10th cent) instead of $0.00001
-- This makes credit numbers more user-friendly

-- Update compute_api_credit_cost function
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
  -- Minimum 1 credit per call to prevent free usage
  credits_charged := GREATEST(1, CEIL(v_raw_cost / 0.001));
  provider_cost_usd := v_raw_cost;
  model_tier := v_tier;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update purchase_api_credits to use new credit unit
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
      'effective_price_per_credit', (p_amount_usd_cents - v_fee_cents)::NUMERIC / GREATEST(1, v_credit_amount)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'Credit unit updated: 1 credit = $0.001' AS status;
