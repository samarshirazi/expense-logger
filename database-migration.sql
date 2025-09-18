-- Database Migration: Add User Support and Proper RLS
-- Run this SQL in your Supabase SQL Editor AFTER the initial setup

-- 1. Create users table to store additional user profile data
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add user_id column to expenses table
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Create index for better performance on user_id lookups
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 4. Create trigger to update users.updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 6. Drop the old permissive policy on expenses
DROP POLICY IF EXISTS "Allow all operations on expenses" ON expenses;

-- 7. Create proper RLS policies for expenses (user can only access their own)
CREATE POLICY "Users can view their own expenses" ON expenses
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own expenses" ON expenses
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own expenses" ON expenses
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own expenses" ON expenses
FOR DELETE USING (auth.uid() = user_id);

-- 8. Create RLS policies for users table
CREATE POLICY "Users can view their own profile" ON users
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON users
FOR INSERT WITH CHECK (auth.uid() = id);

-- 9. Create function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Create trigger to auto-create user profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 11. Update existing expenses to have user_id (if any exist without user_id)
-- This sets all existing expenses to the first user - adjust as needed
DO $$
DECLARE
  first_user_id UUID;
BEGIN
  -- Get the first user ID from auth.users
  SELECT id INTO first_user_id FROM auth.users LIMIT 1;

  -- Update expenses that don't have user_id set
  IF first_user_id IS NOT NULL THEN
    UPDATE expenses
    SET user_id = first_user_id
    WHERE user_id IS NULL;
  END IF;
END $$;

-- 12. Make user_id NOT NULL after migration
ALTER TABLE expenses ALTER COLUMN user_id SET NOT NULL;

-- 13. Drop and recreate the expense_summaries view to include user filtering
DROP VIEW IF EXISTS expense_summaries;
CREATE VIEW expense_summaries AS
SELECT
  user_id,
  DATE_TRUNC('month', date) as month,
  category,
  currency,
  COUNT(*) as transaction_count,
  SUM(total_amount) as total_amount,
  AVG(total_amount) as avg_amount,
  MIN(total_amount) as min_amount,
  MAX(total_amount) as max_amount
FROM expenses
WHERE date IS NOT NULL
GROUP BY user_id, DATE_TRUNC('month', date), category, currency
ORDER BY user_id, month DESC, category;

-- 14. Update the get_expenses_by_date_range function to include user filtering
CREATE OR REPLACE FUNCTION get_expenses_by_date_range(
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  id UUID,
  merchant_name TEXT,
  date DATE,
  total_amount DECIMAL(10,2),
  currency VARCHAR(3),
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT
    e.id,
    e.merchant_name,
    e.date,
    e.total_amount,
    e.currency,
    e.category,
    e.created_at
  FROM expenses e
  WHERE e.date >= start_date
    AND e.date <= end_date
    AND e.user_id = auth.uid()
  ORDER BY e.date DESC, e.created_at DESC;
$$;

-- 15. Grant permissions
GRANT ALL ON users TO authenticated;
GRANT SELECT ON expense_summaries TO authenticated;

-- Add helpful comments
COMMENT ON TABLE users IS 'User profiles linked to auth.users';
COMMENT ON COLUMN expenses.user_id IS 'Links expense to the user who created it';
COMMENT ON FUNCTION handle_new_user() IS 'Automatically creates user profile when new user signs up via trigger on auth.users';

-- Success message
SELECT 'Database migration completed! Users table created and RLS policies updated.' as status;