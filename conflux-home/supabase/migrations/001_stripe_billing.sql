-- Stripe billing migration for ch_subscriptions
-- Adds columns needed for Stripe integration and credit tracking

ALTER TABLE ch_subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE ch_subscriptions ADD COLUMN IF NOT EXISTS credits_included INTEGER DEFAULT 500;
ALTER TABLE ch_subscriptions ADD COLUMN IF NOT EXISTS credits_used INTEGER DEFAULT 0;

-- Drop old constraint and add new one with enterprise plan
ALTER TABLE ch_subscriptions DROP CONSTRAINT IF EXISTS ch_subscriptions_plan_check;
ALTER TABLE ch_subscriptions ADD CONSTRAINT ch_subscriptions_plan_check 
  CHECK (plan IN ('free', 'power', 'pro', 'enterprise'));
