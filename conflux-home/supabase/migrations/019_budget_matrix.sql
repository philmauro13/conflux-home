-- ============================================================
-- Migration: Budget Matrix — Zero-Based Budgeting System
-- Date: 2026-04-04
-- Description: Cloud-side tables for the Matrix budget app
--              Implements zero-based budgeting with buckets (envelopes),
--              allocations per pay period, and transaction tracking.
-- ============================================================

-- ── Budget Settings ─────────────────────────────────────────
-- Stores user's payroll configuration and income details

CREATE TABLE IF NOT EXISTS budget_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pay_frequency TEXT NOT NULL CHECK (pay_frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  pay_dates JSONB,                -- e.g., [1, 15] for semimonthly, or ["2026-04-04", "2026-04-18"] for specific dates
  income_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id)
);

ALTER TABLE budget_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own budget settings"
  ON budget_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own budget settings"
  ON budget_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own budget settings"
  ON budget_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON budget_settings FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_budget_settings_user ON budget_settings(user_id);

-- ── Budget Buckets (Envelopes) ──────────────────────────────
-- Categories for allocating income (e.g., "Housing", "Groceries", "Emergency Fund")

CREATE TABLE IF NOT EXISTS budget_buckets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,                     -- emoji or icon identifier
  monthly_goal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  color TEXT,                    -- hex color for UI
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE budget_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own buckets"
  ON budget_buckets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own buckets"
  ON budget_buckets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own buckets"
  ON budget_buckets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own buckets"
  ON budget_buckets FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON budget_buckets FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_budget_buckets_user ON budget_buckets(user_id);
CREATE INDEX idx_budget_buckets_active ON budget_buckets(is_active) WHERE is_active = true;

-- ── Pay Periods ─────────────────────────────────────────────
-- Generated or manual pay periods for allocation tracking

CREATE TABLE IF NOT EXISTS budget_pay_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  pay_date DATE NOT NULL,
  income_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'current', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE budget_pay_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pay periods"
  ON budget_pay_periods FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own pay periods"
  ON budget_pay_periods FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pay periods"
  ON budget_pay_periods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own pay periods"
  ON budget_pay_periods FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON budget_pay_periods FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_budget_pay_periods_user ON budget_pay_periods(user_id);
CREATE INDEX idx_budget_pay_periods_date ON budget_pay_periods(pay_date);

-- ── Budget Allocations ──────────────────────────────────────
-- How much to allocate from each paycheck to each bucket

CREATE TABLE IF NOT EXISTS budget_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_id UUID NOT NULL REFERENCES budget_buckets(id) ON DELETE CASCADE,
  pay_period_id UUID NOT NULL REFERENCES budget_pay_periods(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(bucket_id, pay_period_id)  -- One allocation per bucket per pay period
);

ALTER TABLE budget_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own allocations"
  ON budget_allocations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own allocations"
  ON budget_allocations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own allocations"
  ON budget_allocations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own allocations"
  ON budget_allocations FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON budget_allocations FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_budget_allocations_user ON budget_allocations(user_id);
CREATE INDEX idx_budget_allocations_bucket ON budget_allocations(bucket_id);
CREATE INDEX idx_budget_allocations_period ON budget_allocations(pay_period_id);

-- ── Budget Transactions ─────────────────────────────────────
-- Actual spending or income logged against buckets

CREATE TABLE IF NOT EXISTS budget_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_id UUID NOT NULL REFERENCES budget_buckets(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,  -- Positive for income, negative for expense
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'reconciled', 'disputed')),
  description TEXT,
  merchant TEXT,
  category TEXT,                   -- Optional override of bucket category
  receipt_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE budget_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON budget_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON budget_transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON budget_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON budget_transactions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON budget_transactions FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX idx_budget_transactions_user ON budget_transactions(user_id);
CREATE INDEX idx_budget_transactions_bucket ON budget_transactions(bucket_id);
CREATE INDEX idx_budget_transactions_date ON budget_transactions(date);
CREATE INDEX idx_budget_transactions_status ON budget_transactions(status);

-- ── Helper Functions ─────────────────────────────────────────

-- Get bucket balance (allocated - spent) for current month
CREATE OR REPLACE FUNCTION get_bucket_balance(p_bucket_id UUID, p_user_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_allocated NUMERIC;
  v_spent NUMERIC;
BEGIN
  -- Sum allocations for current month
  SELECT COALESCE(SUM(ba.amount), 0) INTO v_allocated
  FROM budget_allocations ba
  JOIN budget_pay_periods bpp ON ba.pay_period_id = bpp.id
  WHERE ba.bucket_id = p_bucket_id
    AND ba.user_id = p_user_id
    AND DATE_TRUNC('month', bpp.pay_date) = DATE_TRUNC('month', now());

  -- Sum transactions for current month
  SELECT COALESCE(SUM(bt.amount), 0) INTO v_spent
  FROM budget_transactions bt
  WHERE bt.bucket_id = p_bucket_id
    AND bt.user_id = p_user_id
    AND DATE_TRUNC('month', bt.date) = DATE_TRUNC('month', now())
    AND bt.amount < 0;  -- Expenses only

  RETURN v_allocated + v_spent;  -- v_spent is negative
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create default buckets on user signup
CREATE OR REPLACE FUNCTION create_default_budget_buckets()
RETURNS TRIGGER AS $$
BEGIN
  -- Housing
  INSERT INTO budget_buckets (user_id, name, icon, monthly_goal, color)
  VALUES (NEW.id, 'Housing', '🏠', 0, '#ef4444');
  
  -- Groceries
  INSERT INTO budget_buckets (user_id, name, icon, monthly_goal, color)
  VALUES (NEW.id, 'Groceries', '🛒', 0, '#f59e0b');
  
  -- Transportation
  INSERT INTO budget_buckets (user_id, name, icon, monthly_goal, color)
  VALUES (NEW.id, 'Transportation', '🚗', 0, '#3b82f6');
  
  -- Utilities
  INSERT INTO budget_buckets (user_id, name, icon, monthly_goal, color)
  VALUES (NEW.id, 'Utilities', '💡', 0, '#8b5cf6');
  
  -- Emergency Fund
  INSERT INTO budget_buckets (user_id, name, icon, monthly_goal, color)
  VALUES (NEW.id, 'Emergency Fund', '🛡️', 0, '#22c55e');
  
  -- Fun Money
  INSERT INTO budget_buckets (user_id, name, icon, monthly_goal, color)
  VALUES (NEW.id, 'Fun Money', '🎉', 0, '#ec4899');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_budget_user_created ON auth.users;
CREATE TRIGGER on_budget_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_default_budget_buckets();

-- ── Views for Dashboard ─────────────────────────────────────

-- Current month budget summary per user
CREATE OR REPLACE VIEW budget_monthly_summary AS
SELECT
  bs.user_id,
  bs.income_amount,
  bs.pay_frequency,
  COALESCE(SUM(DISTINCT bb.monthly_goal), 0) as total_monthly_goals,
  COUNT(DISTINCT CASE WHEN bb.is_active THEN bb.id END) as active_buckets,
  COUNT(DISTINCT bpp.id) FILTER (WHERE bpp.status = 'current') as current_pay_periods
FROM budget_settings bs
LEFT JOIN budget_buckets bb ON bb.user_id = bs.user_id AND bb.is_active = true
LEFT JOIN budget_pay_periods bpp ON bpp.user_id = bs.user_id
GROUP BY bs.user_id, bs.income_amount, bs.pay_frequency;

-- Bucket balance view
CREATE OR REPLACE VIEW budget_bucket_balances AS
SELECT
  bb.id as bucket_id,
  bb.user_id,
  bb.name,
  bb.icon,
  bb.monthly_goal,
  bb.color,
  COALESCE(SUM(ba.amount), 0) as total_allocated,
  COALESCE(SUM(CASE WHEN bt.amount < 0 THEN bt.amount ELSE 0 END), 0) as total_spent,
  COALESCE(SUM(ba.amount), 0) + COALESCE(SUM(CASE WHEN bt.amount < 0 THEN bt.amount ELSE 0 END), 0) as remaining
FROM budget_buckets bb
LEFT JOIN budget_allocations ba ON ba.bucket_id = bb.id
LEFT JOIN budget_transactions bt ON bt.bucket_id = bb.id AND DATE_TRUNC('month', bt.date) = DATE_TRUNC('month', now())
WHERE bb.is_active = true
GROUP BY bb.id, bb.user_id, bb.name, bb.icon, bb.monthly_goal, bb.color;

-- Add comment to migration
COMMENT ON TABLE budget_settings IS 'User payroll configuration for zero-based budgeting';
COMMENT ON TABLE budget_buckets IS 'Budget categories (envelopes) for allocating income';
COMMENT ON TABLE budget_pay_periods IS 'Paycheck periods for allocation scheduling';
COMMENT ON TABLE budget_allocations IS 'Income allocation from each paycheck to budget buckets';
COMMENT ON TABLE budget_transactions IS 'Actual spending and income logged against buckets';

SELECT 'Budget Matrix schema migration complete' AS status;
