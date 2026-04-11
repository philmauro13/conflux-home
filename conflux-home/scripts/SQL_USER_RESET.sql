-- ============================================================
-- Auth User Cleanup Script
-- Date: 2026-04-03
-- Purpose: Remove all test users except production accounts
-- ============================================================
-- Run in: Supabase SQL Editor
-- URL: https://supabase.com/dashboard/project/zcvhozqrssotirabdlzr/sql/new
-- ============================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT id, email 
    FROM auth.users 
    WHERE email NOT IN (
      'theconflux303@gmail.com',
      'philmauroemail@gmail.com', 
      'donziglioni@gmail.com'
    )
  LOOP
    -- Delete associated data first (foreign key cleanup)
    DELETE FROM api_keys WHERE user_id = r.id;
    DELETE FROM api_credit_accounts WHERE user_id = r.id;
    DELETE FROM api_credit_transactions WHERE user_id = r.id;
    DELETE FROM api_usage_log WHERE user_id = r.id;
    DELETE FROM credit_accounts WHERE user_id = r.id;
    DELETE FROM credit_transactions WHERE user_id = r.id;
    DELETE FROM usage_log WHERE user_id = r.id;
    DELETE FROM ch_subscriptions WHERE user_id = r.id;
    
    -- Delete the auth user
    DELETE FROM auth.users WHERE id = r.id;
    
    RAISE NOTICE 'Deleted user: %', r.email;
  END LOOP;
END $$;

-- Verify remaining users
SELECT email, created_at, email_confirmed_at 
FROM auth.users 
ORDER BY created_at;
