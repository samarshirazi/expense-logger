-- Simple RLS Fix for Expense Upload Issues
-- Run this SQL in your Supabase SQL Editor

-- Step 1: Add user_id column if it doesn't exist
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Create index for performance
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);

-- Step 3: Drop all existing RLS policies
DROP POLICY IF EXISTS "Allow all operations on expenses" ON expenses;
DROP POLICY IF EXISTS "Users can view own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can insert own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can update own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can delete own expenses" ON expenses;

-- Step 4: Enable RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Step 5: Create new RLS policies
CREATE POLICY "Users can view own expenses" ON expenses
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own expenses" ON expenses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expenses" ON expenses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own expenses" ON expenses
  FOR DELETE
  USING (auth.uid() = user_id);

-- Step 6: Assign existing expenses to first user (if any exist without user_id)
UPDATE expenses
SET user_id = (SELECT id FROM auth.users LIMIT 1)
WHERE user_id IS NULL;

-- Step 7: Make user_id required
ALTER TABLE expenses ALTER COLUMN user_id SET NOT NULL;

-- Step 8: Grant basic permissions
GRANT ALL ON expenses TO authenticated;

-- Success message
SELECT 'RLS policies fixed! Try uploading a receipt now.' as status;