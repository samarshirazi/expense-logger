-- RLS Policy Fix for Expense Upload Issues
-- Run this SQL in your Supabase SQL Editor

-- First, check if user_id column exists and create it if needed
DO $$
BEGIN
  -- Add user_id column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'expenses' AND column_name = 'user_id') THEN
    ALTER TABLE expenses ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
  END IF;
END $$;

-- Drop all existing RLS policies for expenses table
DROP POLICY IF EXISTS "Allow all operations on expenses" ON expenses;
DROP POLICY IF EXISTS "Users can view own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can insert own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can update own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can delete own expenses" ON expenses;

-- Enable RLS on expenses table
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Create new RLS policies that properly handle user authentication

-- Policy for SELECT (viewing expenses)
CREATE POLICY "Users can view own expenses" ON expenses
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy for INSERT (creating expenses)
CREATE POLICY "Users can insert own expenses" ON expenses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy for UPDATE (modifying expenses)
CREATE POLICY "Users can update own expenses" ON expenses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy for DELETE (removing expenses)
CREATE POLICY "Users can delete own expenses" ON expenses
  FOR DELETE
  USING (auth.uid() = user_id);

-- Update existing expenses to assign them to the first user (if any exist without user_id)
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

-- Make user_id NOT NULL (after assigning existing records)
ALTER TABLE expenses ALTER COLUMN user_id SET NOT NULL;

-- Grant necessary permissions
GRANT ALL ON expenses TO authenticated;

-- Grant sequence permissions (try different sequence names that might exist)
DO $$
BEGIN
  -- Try to grant permissions on the sequence (it might have a different name)
  IF EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_name = 'expenses_id_seq') THEN
    GRANT USAGE ON SEQUENCE expenses_id_seq TO authenticated;
  ELSIF EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_name = 'expenses_pkey_seq') THEN
    GRANT USAGE ON SEQUENCE expenses_pkey_seq TO authenticated;
  ELSIF EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_name LIKE '%expenses%id%seq') THEN
    -- Find and grant on any expenses id sequence
    EXECUTE (SELECT 'GRANT USAGE ON SEQUENCE ' || sequence_name || ' TO authenticated;'
             FROM information_schema.sequences
             WHERE sequence_name LIKE '%expenses%id%seq'
             LIMIT 1);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- If sequence doesn't exist or we can't find it, that's ok
    RAISE NOTICE 'Could not grant sequence permissions, but continuing...';
END $$;

-- Test the policies by checking if a user can select from expenses
-- This should work when run by an authenticated user
-- SELECT 'RLS policies configured successfully!' as status;

-- If you have issues, you can temporarily disable RLS for testing:
-- ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
-- Remember to re-enable it: ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;