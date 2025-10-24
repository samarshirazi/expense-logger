-- Database Migration: Add Income and Savings Support
-- Run this SQL in your Supabase SQL Editor after the user support migration
-- This adds income tracking, savings management, and savings goals

-- ============================================================
-- 1. INCOME SOURCES TABLE (Monthly recurring income)
-- ============================================================
CREATE TABLE IF NOT EXISTS income_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL, -- e.g., "Salary", "Rent Income", etc.
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) DEFAULT 'USD',
  month DATE NOT NULL, -- First day of the month (e.g., '2025-01-01')
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_income_sources_user_id ON income_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_income_sources_month ON income_sources(month);
CREATE INDEX IF NOT EXISTS idx_income_sources_user_month ON income_sources(user_id, month);

-- Enable RLS
ALTER TABLE income_sources ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own income sources" ON income_sources
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own income sources" ON income_sources
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own income sources" ON income_sources
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own income sources" ON income_sources
FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_income_sources_updated_at
    BEFORE UPDATE ON income_sources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE income_sources IS 'Regular monthly income sources (salary, rent, etc.)';
COMMENT ON COLUMN income_sources.month IS 'First day of the month this income applies to';
COMMENT ON COLUMN income_sources.is_active IS 'Whether this income source is currently active';

-- ============================================================
-- 2. EXTRA INCOME TABLE (Side hustles, one-time income)
-- ============================================================
CREATE TABLE IF NOT EXISTS extra_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) DEFAULT 'USD',
  date DATE NOT NULL,
  destination VARCHAR(20) NOT NULL CHECK (destination IN ('budget', 'savings')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_extra_income_user_id ON extra_income(user_id);
CREATE INDEX IF NOT EXISTS idx_extra_income_date ON extra_income(date);
CREATE INDEX IF NOT EXISTS idx_extra_income_destination ON extra_income(destination);

-- Enable RLS
ALTER TABLE extra_income ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own extra income" ON extra_income
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own extra income" ON extra_income
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own extra income" ON extra_income
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own extra income" ON extra_income
FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_extra_income_updated_at
    BEFORE UPDATE ON extra_income
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE extra_income IS 'One-time or irregular income (side hustles, gifts, refunds)';
COMMENT ON COLUMN extra_income.destination IS 'Where the income goes: budget or savings';

-- ============================================================
-- 3. SAVINGS TRANSACTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS savings_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal')),
  source VARCHAR(50) NOT NULL, -- 'manual', 'extra_income', 'month_end', 'goal_allocation'
  description TEXT,
  date DATE NOT NULL,
  related_goal_id UUID, -- Reference to savings_goals (added later)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_savings_transactions_user_id ON savings_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_savings_transactions_date ON savings_transactions(date);
CREATE INDEX IF NOT EXISTS idx_savings_transactions_type ON savings_transactions(transaction_type);

-- Enable RLS
ALTER TABLE savings_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own savings transactions" ON savings_transactions
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own savings transactions" ON savings_transactions
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own savings transactions" ON savings_transactions
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own savings transactions" ON savings_transactions
FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE savings_transactions IS 'All savings deposits and withdrawals';
COMMENT ON COLUMN savings_transactions.amount IS 'Positive for deposits, negative for withdrawals';
COMMENT ON COLUMN savings_transactions.source IS 'How this transaction was created';

-- ============================================================
-- 4. SAVINGS GOALS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_name TEXT NOT NULL,
  target_amount DECIMAL(10,2) NOT NULL CHECK (target_amount > 0),
  current_amount DECIMAL(10,2) DEFAULT 0 CHECK (current_amount >= 0),
  currency VARCHAR(3) DEFAULT 'USD',
  target_date DATE,
  description TEXT,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_savings_goals_user_id ON savings_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_savings_goals_completed ON savings_goals(is_completed);

-- Enable RLS
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own savings goals" ON savings_goals
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own savings goals" ON savings_goals
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own savings goals" ON savings_goals
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own savings goals" ON savings_goals
FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_savings_goals_updated_at
    BEFORE UPDATE ON savings_goals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE savings_goals IS 'User-defined savings goals with target amounts';
COMMENT ON COLUMN savings_goals.current_amount IS 'Amount currently allocated to this goal';
COMMENT ON COLUMN savings_goals.is_completed IS 'Whether the goal has been reached';

-- Now add the foreign key to savings_transactions
ALTER TABLE savings_transactions
ADD CONSTRAINT fk_savings_transactions_goal
FOREIGN KEY (related_goal_id) REFERENCES savings_goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_savings_transactions_goal_id ON savings_transactions(related_goal_id);

-- ============================================================
-- 5. USEFUL VIEWS AND FUNCTIONS
-- ============================================================

-- View: Current savings balance per user
CREATE OR REPLACE VIEW user_savings_balance AS
SELECT
  user_id,
  COALESCE(SUM(amount), 0) as total_balance,
  COUNT(*) as transaction_count,
  MAX(created_at) as last_transaction_date
FROM savings_transactions
GROUP BY user_id;

GRANT SELECT ON user_savings_balance TO authenticated;

-- View: Monthly income summary
CREATE OR REPLACE VIEW monthly_income_summary AS
SELECT
  user_id,
  month,
  COUNT(*) as source_count,
  SUM(amount) as total_income,
  currency
FROM income_sources
WHERE is_active = true
GROUP BY user_id, month, currency
ORDER BY user_id, month DESC;

GRANT SELECT ON monthly_income_summary TO authenticated;

-- Function: Get total monthly income for a user and month
CREATE OR REPLACE FUNCTION get_monthly_income(
  p_user_id UUID,
  p_month DATE
)
RETURNS DECIMAL(10,2)
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM income_sources
  WHERE user_id = p_user_id
    AND month = p_month
    AND is_active = true;
$$;

-- Function: Get current savings balance for a user
CREATE OR REPLACE FUNCTION get_savings_balance(
  p_user_id UUID
)
RETURNS DECIMAL(10,2)
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM savings_transactions
  WHERE user_id = p_user_id;
$$;

-- Function: Get unallocated savings (total savings - allocated to goals)
CREATE OR REPLACE FUNCTION get_unallocated_savings(
  p_user_id UUID
)
RETURNS DECIMAL(10,2)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    COALESCE(get_savings_balance(p_user_id), 0) -
    COALESCE((SELECT SUM(current_amount) FROM savings_goals WHERE user_id = p_user_id AND is_completed = false), 0);
$$;

-- Function: Copy previous month's income sources to new month
CREATE OR REPLACE FUNCTION copy_income_sources_to_month(
  p_user_id UUID,
  p_from_month DATE,
  p_to_month DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  copied_count INTEGER;
BEGIN
  INSERT INTO income_sources (user_id, source_name, amount, currency, month, is_active, notes)
  SELECT
    user_id,
    source_name,
    amount,
    currency,
    p_to_month,
    is_active,
    notes
  FROM income_sources
  WHERE user_id = p_user_id
    AND month = p_from_month
    AND is_active = true;

  GET DIAGNOSTICS copied_count = ROW_COUNT;
  RETURN copied_count;
END;
$$;

COMMENT ON FUNCTION copy_income_sources_to_month IS 'Copies income sources from one month to another for the same user';

-- ============================================================
-- 6. BUDGETS TABLE UPDATE (Add relationship to income)
-- ============================================================

-- Check if budgets table exists (it should from previous setup)
-- If it doesn't have user_id or month columns, this migration assumes they exist

-- Add a constraint to ensure budget doesn't exceed monthly income
-- (Optional - can be enforced in application logic instead)

-- ============================================================
-- 7. GRANT PERMISSIONS
-- ============================================================

GRANT ALL ON income_sources TO authenticated;
GRANT ALL ON extra_income TO authenticated;
GRANT ALL ON savings_transactions TO authenticated;
GRANT ALL ON savings_goals TO authenticated;

-- Success message
SELECT 'Income and Savings migration completed successfully!' as status,
       'Created 4 new tables: income_sources, extra_income, savings_transactions, savings_goals' as details;
