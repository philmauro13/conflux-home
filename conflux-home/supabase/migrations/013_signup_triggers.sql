-- ============================================================
-- Migration: Fix Signup Triggers — profiles + credits + sub
-- Date: 2026-03-31
--
-- Fixes:
-- 1. New users don't get a ch_profiles row → FK fails
-- 2. New users don't get a credit_accounts row → "Limit reached"
-- 3. ch_subscriptions created as 'inactive' → should be 'active' for free tier
-- 4. Adds RLS INSERT policies for trigger-created rows
-- ============================================================

-- 0. Auto-create ch_profiles for new users
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO ch_profiles (id, display_name, plan, created_at, updated_at)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'User'), 'free', now(), now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_profile ON auth.users;
CREATE TRIGGER on_auth_user_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile();

-- 1. Auto-create credit_accounts for new users (500 free credits)
CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO credit_accounts (user_id, balance, created_at, updated_at)
  VALUES (NEW.id, 500, now(), now())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't block signup if credit creation fails
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_credits ON auth.users;
CREATE TRIGGER on_auth_user_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_credits();

-- 2. Fix subscription status: free tier should be 'active' not 'inactive'
CREATE OR REPLACE FUNCTION create_user_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO ch_subscriptions (user_id, plan, status, credits_included)
  VALUES (NEW.id, 'free', 'active', 500)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger with fixed function
DROP TRIGGER IF EXISTS on_auth_user_subscription ON auth.users;
CREATE TRIGGER on_auth_user_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_subscription();

-- 3. Ensure credit_accounts has INSERT policy for triggers
DROP POLICY IF EXISTS "Allow trigger insert on credit_accounts" ON credit_accounts;
CREATE POLICY "Allow trigger insert on credit_accounts"
  ON credit_accounts FOR INSERT
  WITH CHECK (true);

-- 4. Backfill: create ch_profiles for any existing users missing them
INSERT INTO ch_profiles (id, display_name, plan, created_at, updated_at)
SELECT id, COALESCE(raw_user_meta_data->>'display_name', 'User'), 'free', now(), now()
FROM auth.users
WHERE id NOT IN (SELECT id FROM ch_profiles)
ON CONFLICT (id) DO NOTHING;

-- 5. Backfill: create credit_accounts rows for any existing users missing them
INSERT INTO credit_accounts (user_id, balance, created_at, updated_at)
SELECT id, 500, now(), now()
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM credit_accounts)
ON CONFLICT (user_id) DO NOTHING;

-- 6. Backfill: fix any existing subscriptions stuck on 'inactive' for free tier
UPDATE ch_subscriptions
SET status = 'active',
    credits_included = COALESCE(credits_included, 500)
WHERE plan = 'free' AND status = 'inactive';

-- 7. Backfill: create subscriptions for users with profiles but no subscription
INSERT INTO ch_subscriptions (user_id, plan, status, credits_included)
SELECT id, 'free', 'active', 500
FROM ch_profiles
WHERE id NOT IN (SELECT user_id FROM ch_subscriptions)
ON CONFLICT (user_id) DO NOTHING;
