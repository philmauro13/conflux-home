-- Fix RLS on ch_subscriptions to allow service role writes
-- Run this in the Supabase SQL Editor

-- Allow service role to do everything on ch_subscriptions
CREATE POLICY IF NOT EXISTS "Service role full access" 
ON ch_subscriptions
FOR ALL
USING (true)
WITH CHECK (true);

-- Also ensure the table has a unique constraint on user_id for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ch_subscriptions_user_id_key' 
    AND conrelid = 'ch_subscriptions'::regclass
  ) THEN
    ALTER TABLE ch_subscriptions ADD CONSTRAINT ch_subscriptions_user_id_key UNIQUE (user_id);
  END IF;
END $$;
