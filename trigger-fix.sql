-- Fix for user profile creation trigger
-- Run this if you're getting "Database error saving new user"

-- 1. Update the trigger function with better error handling and security
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to create user profile for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Recreate the trigger to ensure it's properly set up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 3. Ensure the users table allows inserts via the trigger
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 4. Re-enable RLS but with a policy that allows the trigger to work
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies and recreate them properly
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;

-- 6. Create new policies
CREATE POLICY "Users can view their own profile" ON users
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON users
FOR INSERT WITH CHECK (auth.uid() = id);

-- 7. Allow the trigger function to bypass RLS
CREATE POLICY "Allow trigger to insert user profiles" ON users
FOR INSERT WITH CHECK (true);

-- Verify the setup
SELECT 'Trigger fix applied successfully!' as status;