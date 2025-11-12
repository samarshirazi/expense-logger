-- Migration: Add Accounts, Income, and Transfer support
-- Date: 2025-01-12
-- Description: Creates tables for managing accounts, income entries, and transfers between accounts

-- ============================================
-- 1. ACCOUNTS TABLE
-- ============================================
-- Store user's payment accounts (cards, cash, savings, etc.)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('card', 'cash', 'savings', 'bank', 'other')),
    balance DECIMAL(12, 2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',
    icon VARCHAR(10) DEFAULT '💳',
    color VARCHAR(7) DEFAULT '#667eea',
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_is_active ON accounts(is_active);

-- RLS Policies for accounts
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own accounts" ON accounts;
CREATE POLICY "Users can view their own accounts" ON accounts
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own accounts" ON accounts;
CREATE POLICY "Users can insert their own accounts" ON accounts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own accounts" ON accounts;
CREATE POLICY "Users can update their own accounts" ON accounts
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own accounts" ON accounts;
CREATE POLICY "Users can delete their own accounts" ON accounts
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 2. INCOME ENTRIES TABLE
-- ============================================
-- Store income transactions
CREATE TABLE IF NOT EXISTS income_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    source VARCHAR(200) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    date DATE NOT NULL,
    category VARCHAR(100) DEFAULT 'Salary',
    description TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurring_frequency VARCHAR(20) CHECK (recurring_frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'yearly')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_income_user_id ON income_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_income_account_id ON income_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_income_date ON income_entries(date);
CREATE INDEX IF NOT EXISTS idx_income_category ON income_entries(category);

-- RLS Policies
ALTER TABLE income_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own income" ON income_entries;
CREATE POLICY "Users can view their own income" ON income_entries
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own income" ON income_entries;
CREATE POLICY "Users can insert their own income" ON income_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own income" ON income_entries;
CREATE POLICY "Users can update their own income" ON income_entries
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own income" ON income_entries;
CREATE POLICY "Users can delete their own income" ON income_entries
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 3. TRANSFERS TABLE
-- ============================================
-- Store transfers between accounts
CREATE TABLE IF NOT EXISTS transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    from_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT different_accounts CHECK (from_account_id != to_account_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transfers_user_id ON transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from_account ON transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_account ON transfers(to_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_date ON transfers(date);

-- RLS Policies
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own transfers" ON transfers;
CREATE POLICY "Users can view their own transfers" ON transfers
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own transfers" ON transfers;
CREATE POLICY "Users can insert their own transfers" ON transfers
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own transfers" ON transfers;
CREATE POLICY "Users can update their own transfers" ON transfers
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own transfers" ON transfers;
CREATE POLICY "Users can delete their own transfers" ON transfers
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 4. UPDATE EXPENSES TABLE
-- ============================================
-- Add account_id to expenses table to track which account was used
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_account_id ON expenses(account_id);

-- Add transaction type to expenses for unified view
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20) DEFAULT 'expense' CHECK (transaction_type IN ('expense', 'income', 'transfer'));

CREATE INDEX IF NOT EXISTS idx_expenses_transaction_type ON expenses(transaction_type);

-- ============================================
-- 5. FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_income_entries_updated_at ON income_entries;
CREATE TRIGGER update_income_entries_updated_at
    BEFORE UPDATE ON income_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transfers_updated_at ON transfers;
CREATE TRIGGER update_transfers_updated_at
    BEFORE UPDATE ON transfers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update account balance on income
CREATE OR REPLACE FUNCTION update_account_balance_on_income()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.account_id IS NOT NULL THEN
        UPDATE accounts
        SET balance = balance + NEW.amount
        WHERE id = NEW.account_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update account balance on expense
CREATE OR REPLACE FUNCTION update_account_balance_on_expense()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.account_id IS NOT NULL THEN
        UPDATE accounts
        SET balance = balance - NEW.total_amount
        WHERE id = NEW.account_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update account balances on transfer
CREATE OR REPLACE FUNCTION update_account_balance_on_transfer()
RETURNS TRIGGER AS $$
BEGIN
    -- Deduct from source account
    UPDATE accounts
    SET balance = balance - NEW.amount
    WHERE id = NEW.from_account_id;

    -- Add to destination account
    UPDATE accounts
    SET balance = balance + NEW.amount
    WHERE id = NEW.to_account_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic balance updates (optional - can be disabled if manual control preferred)
-- Uncomment these if you want automatic balance updates:
/*
DROP TRIGGER IF EXISTS trigger_income_balance_update ON income_entries;
CREATE TRIGGER trigger_income_balance_update
    AFTER INSERT ON income_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_account_balance_on_income();

DROP TRIGGER IF EXISTS trigger_expense_balance_update ON expenses;
CREATE TRIGGER trigger_expense_balance_update
    AFTER INSERT ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_account_balance_on_expense();

DROP TRIGGER IF EXISTS trigger_transfer_balance_update ON transfers;
CREATE TRIGGER trigger_transfer_balance_update
    AFTER INSERT ON transfers
    FOR EACH ROW
    EXECUTE FUNCTION update_account_balance_on_transfer();
*/

-- ============================================
-- 6. SEED DEFAULT ACCOUNTS (OPTIONAL)
-- ============================================
-- Note: This will create default accounts for existing users
-- Comment out if you don't want default accounts

-- This is just a template - you'll need to insert for actual users
-- INSERT INTO accounts (user_id, name, type, balance, icon, color) VALUES
-- (auth.uid(), 'Cash', 'cash', 0.00, '💵', '#22c55e'),
-- (auth.uid(), 'Credit Card', 'card', 0.00, '💳', '#3b82f6'),
-- (auth.uid(), 'Savings', 'savings', 0.00, '🏦', '#f59e0b');

COMMIT;
