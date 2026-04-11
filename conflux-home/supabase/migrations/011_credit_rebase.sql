-- ============================================================
-- Migration: Credit Rebase to Penny Credits
-- Date: 2026-03-30
-- 
-- BREAKING CHANGE: Credit unit rebased from arbitrary to $0.01
-- Old credits and new credits are NOT equivalent.
-- Existing user balances are NOT migrated (they'll reset).
-- ============================================================

-- 1. Update per-model credit costs based on actual provider pricing
-- 1 credit = $0.01 provider cost, minimum 1 credit per direction
UPDATE model_routes SET
  credit_cost_per_1k_in = CASE model_alias
    -- Ultra tier (expensive models)
    WHEN 'claude-opus' THEN 2
    WHEN 'o1' THEN 2
    WHEN 'o3' THEN 1
    WHEN 'gpt-4.1' THEN 1
    WHEN 'gpt-4o' THEN 1
    WHEN 'claude-sonnet' THEN 1
    WHEN 'claude-sonnet-4.5' THEN 1
    WHEN 'grok-3' THEN 1
    WHEN 'grok-4.20' THEN 1
    WHEN 'gemini-pro' THEN 1
    -- Pro tier
    WHEN 'gpt-4.1-mini' THEN 1
    WHEN 'o3-mini' THEN 1
    WHEN 'o4-mini' THEN 1
    WHEN 'codex-mini' THEN 1
    WHEN 'deepseek-r1' THEN 1
    WHEN 'mistral-large' THEN 1
    -- Core tier and everything else stays at 1
    ELSE 1
  END,
  credit_cost_per_1k_out = CASE model_alias
    -- Ultra tier (output is more expensive)
    WHEN 'claude-opus' THEN 8       -- $0.075/1K out
    WHEN 'o1' THEN 6                -- $0.060/1K out
    WHEN 'o3' THEN 4                -- $0.040/1K out
    WHEN 'claude-sonnet' THEN 2     -- $0.015/1K out
    WHEN 'claude-sonnet-4.5' THEN 2 -- $0.015/1K out
    WHEN 'grok-3' THEN 2            -- $0.015/1K out
    WHEN 'grok-4.20' THEN 2         -- $0.015/1K out
    WHEN 'gpt-4.1' THEN 1           -- $0.008/1K out
    WHEN 'gpt-4o' THEN 1            -- $0.010/1K out
    WHEN 'gemini-pro' THEN 1        -- $0.005/1K out
    -- Pro tier
    WHEN 'codex-mini' THEN 1        -- $0.006/1K out
    WHEN 'mistral-large' THEN 1     -- $0.006/1K out
    WHEN 'deepseek-r1' THEN 1       -- $0.002/1K out
    -- Core/standard tier stays at 1
    ELSE 1
  END;

-- 2. Reset existing user credit balances to new tier allocations
--    Old balances in old credit units are meaningless in the new system.
--    Power users get 1500 new credits, Pro gets 3000.
UPDATE credit_accounts SET
  balance = 500,  -- Free tier default
  updated_at = now()
WHERE user_id IN (
  SELECT user_id FROM ch_subscriptions WHERE plan = 'free'
);

UPDATE credit_accounts SET
  balance = 1500,  -- Power tier
  updated_at = now()
WHERE user_id IN (
  SELECT user_id FROM ch_subscriptions WHERE plan = 'power'
);

UPDATE credit_accounts SET
  balance = 3000,  -- Pro tier
  updated_at = now()
WHERE user_id IN (
  SELECT user_id FROM ch_subscriptions WHERE plan = 'pro'
);

-- 3. Reset API credit balances (old packs are obsolete)
--    Grant a one-time goodwill bonus to existing API users
UPDATE api_credit_accounts SET
  balance = 200,  -- goodwill: ~100 requests in new system
  updated_at = now()
WHERE balance > 0;

-- Log the rebase as an adjustment transaction
INSERT INTO api_credit_transactions (user_id, type, amount, balance_after, metadata)
SELECT 
  user_id, 'adjustment', 200 - balance, 200,
  '{"reason": "credit_rebase_v2", "note": "Credits rebased to penny system. 1 credit = $0.01"}'::jsonb
FROM api_credit_accounts
WHERE balance != 200;

-- 4. Update credit_config if it exists (for in-app credit system)
--    Note: The app credit system uses check_user_credits/deduct_credits RPCs
--    which read credit_cost_per_1k_in/out from model_routes — those are updated above.
