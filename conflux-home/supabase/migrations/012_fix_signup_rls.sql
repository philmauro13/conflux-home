-- ============================================================
-- Migration: Fix Signup RLS — "database error saving new user"
-- Date: 2026-03-31
--
-- Root cause: The on_auth_user_created trigger runs as 
-- supabase_auth_admin, which doesn't match existing RLS policies.
-- Both user_profiles and ch_profiles lacked INSERT policies.
-- ============================================================

-- 1. Fix user_profiles: allow trigger to insert new profiles
DROP POLICY IF EXISTS "Allow trigger insert on user_profiles" ON user_profiles;
CREATE POLICY "Allow trigger insert on user_profiles"
  ON user_profiles FOR INSERT
  WITH CHECK (true);

-- 2. Fix ch_profiles: allow trigger to insert new profiles
DROP POLICY IF EXISTS "Allow trigger insert on ch_profiles" ON ch_profiles;
CREATE POLICY "Allow trigger insert on ch_profiles"
  ON ch_profiles FOR INSERT
  WITH CHECK (true);

-- 3. Verify the trigger function exists and is correct
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't block signup if profile creation fails
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Also harden the legacy ch_profiles trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.ch_profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't block signup if profile creation fails
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Ensure ch_subscriptions also has an insert policy for triggers
DROP POLICY IF EXISTS "Allow trigger insert on ch_subscriptions" ON ch_subscriptions;
CREATE POLICY "Allow trigger insert on ch_subscriptions"
  ON ch_subscriptions FOR INSERT
  WITH CHECK (true);

-- 6. Create default subscription for new users (if not exists)
CREATE OR REPLACE FUNCTION create_user_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO ch_subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'inactive')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_subscription ON auth.users;
CREATE TRIGGER on_auth_user_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_subscription();
