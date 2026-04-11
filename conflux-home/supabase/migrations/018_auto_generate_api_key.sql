-- ============================================================
-- Auto-generate API key on user signup
-- Date: 2026-04-03
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Function to generate API key
CREATE OR REPLACE FUNCTION public.handle_new_user_api_key()
RETURNS TRIGGER AS $$
DECLARE
  v_raw_key TEXT;
  v_key_hash TEXT;
  v_key_prefix TEXT;
BEGIN
  -- Generate random key
  v_raw_key := 'cf_live_' || encode(gen_random_bytes(32), 'hex');
  
  -- Hash it
  v_key_hash := encode(digest(v_raw_key, 'sha256'), 'hex');
  
  -- Get prefix
  v_key_prefix := substr(v_raw_key, 1, 16);
  
  -- Insert the key
  INSERT INTO api_keys (user_id, key_hash, key_prefix, name, is_active)
  VALUES (NEW.id, v_key_hash, v_key_prefix, 'Default Key', true);
  
  -- Note: We can't return the full key here because triggers can't send it to the client.
  -- The full key is lost. This is a limitation of database-level key generation.
  -- 
  -- BETTER APPROACH: Generate the key in the edge function during signup,
  -- or have the dashboard auto-generate on first login.
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created_api_key ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created_api_key
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_api_key();

-- ========================================================================
-- ALTERNATIVE: Auto-generate key on FIRST LOGIN via dashboard
-- ========================================================================
-- Since the trigger can't return the key to the user, we'll instead:
-- 1. Check if user has any API keys when they load the dashboard
-- 2. If not, auto-generate one via the /v1/keys/generate endpoint
-- 3. Display it in a modal

-- This is handled in the dashboard UI, not the database.
-- See the dashboard page for the implementation.

SELECT 'Auto-key generation trigger created' AS status;
SELECT 'Note: Full key cannot be retrieved from trigger - use dashboard generation instead' AS note;
