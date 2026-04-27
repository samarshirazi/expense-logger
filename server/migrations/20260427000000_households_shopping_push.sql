-- ============================================================
-- Database Migration: Households, Multi-list Shopping, Push
-- ============================================================
-- Adds:
--   - households + household_members + household_invites (multi-user support)
--   - shopping_lists + shopping_list_items (store-organized shopping)
--   - push_subscriptions (web push for in-store notifications)
--
-- Run AFTER previous migrations (income/savings/etc.) are applied.
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS guards throughout).
--
-- Structure: tables first, then helper functions, then RLS policies and
-- triggers — so that helper functions can reference the tables they depend
-- on (SQL-language functions resolve references at creation time).
-- ============================================================

-- ============================================================
-- SECTION 1: TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (household_id, user_id)
);

CREATE TABLE IF NOT EXISTS household_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  code TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  store_name TEXT,
  store_icon TEXT,
  is_archived BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC(10,2) DEFAULT 1,
  unit TEXT,
  notes TEXT,
  price DECIMAL(10,2),
  planned_date DATE,
  purchased BOOLEAN DEFAULT false,
  purchased_at TIMESTAMP WITH TIME ZONE,
  purchased_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'voice', 'suggestion', 'import')),
  expense_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  in_store_mode BOOLEAN DEFAULT false,
  in_store_list_id UUID REFERENCES shopping_lists(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- SECTION 2: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_households_created_by ON households(created_by);
CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_household_invites_email ON household_invites(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_household_invites_code ON household_invites(code);
CREATE INDEX IF NOT EXISTS idx_household_invites_household ON household_invites(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_household ON shopping_lists(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_archived ON shopping_lists(household_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list ON shopping_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_household ON shopping_list_items(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_purchased ON shopping_list_items(list_id, purchased);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_in_store ON push_subscriptions(in_store_list_id) WHERE in_store_mode = true;

-- ============================================================
-- SECTION 3: HELPER FUNCTIONS (membership checks)
-- ============================================================
-- SECURITY DEFINER so RLS policies on other tables can call these without
-- recursing into household_members' own RLS policy.

CREATE OR REPLACE FUNCTION is_household_member(hid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = hid AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_household_admin(hid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = hid AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================================
-- SECTION 4: ROW LEVEL SECURITY + POLICIES
-- ============================================================

-- HOUSEHOLDS
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their households" ON households;
CREATE POLICY "Members can view their households" ON households
  FOR SELECT USING (is_household_member(id));

DROP POLICY IF EXISTS "Authenticated users can create households" ON households;
CREATE POLICY "Authenticated users can create households" ON households
  FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Admins can update households" ON households;
CREATE POLICY "Admins can update households" ON households
  FOR UPDATE USING (is_household_admin(id));

DROP POLICY IF EXISTS "Admins can delete households" ON households;
CREATE POLICY "Admins can delete households" ON households
  FOR DELETE USING (is_household_admin(id));

-- HOUSEHOLD_MEMBERS
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Self-row visibility (simple equality, no helper function — avoids any
-- chance of recursion since helpers themselves query this table).
DROP POLICY IF EXISTS "Users can view their own membership rows" ON household_members;
CREATE POLICY "Users can view their own membership rows" ON household_members
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all household members" ON household_members;
CREATE POLICY "Admins can view all household members" ON household_members
  FOR SELECT USING (is_household_admin(household_id));

DROP POLICY IF EXISTS "Admins can insert members" ON household_members;
CREATE POLICY "Admins can insert members" ON household_members
  FOR INSERT WITH CHECK (is_household_admin(household_id));

DROP POLICY IF EXISTS "Admins can update members" ON household_members;
CREATE POLICY "Admins can update members" ON household_members
  FOR UPDATE USING (is_household_admin(household_id));

DROP POLICY IF EXISTS "Admins can delete members" ON household_members;
CREATE POLICY "Admins can delete members" ON household_members
  FOR DELETE USING (is_household_admin(household_id));

DROP POLICY IF EXISTS "Users can leave a household" ON household_members;
CREATE POLICY "Users can leave a household" ON household_members
  FOR DELETE USING (user_id = auth.uid());

-- HOUSEHOLD_INVITES
ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view invites" ON household_invites;
CREATE POLICY "Admins can view invites" ON household_invites
  FOR SELECT USING (is_household_admin(household_id));

DROP POLICY IF EXISTS "Admins can create invites" ON household_invites;
CREATE POLICY "Admins can create invites" ON household_invites
  FOR INSERT WITH CHECK (is_household_admin(household_id) AND auth.uid() = invited_by);

DROP POLICY IF EXISTS "Admins can revoke invites" ON household_invites;
CREATE POLICY "Admins can revoke invites" ON household_invites
  FOR DELETE USING (is_household_admin(household_id));

-- Note: invite acceptance is performed by the server using the service role
-- (the invitee may not yet be a household member). The server validates the
-- code, marks used_at, and inserts the household_members row.

-- SHOPPING_LISTS
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view shopping lists" ON shopping_lists;
CREATE POLICY "Members can view shopping lists" ON shopping_lists
  FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "Members can create shopping lists" ON shopping_lists;
CREATE POLICY "Members can create shopping lists" ON shopping_lists
  FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "Members can update shopping lists" ON shopping_lists;
CREATE POLICY "Members can update shopping lists" ON shopping_lists
  FOR UPDATE USING (is_household_member(household_id));

DROP POLICY IF EXISTS "Admins can delete shopping lists" ON shopping_lists;
CREATE POLICY "Admins can delete shopping lists" ON shopping_lists
  FOR DELETE USING (is_household_admin(household_id));

-- SHOPPING_LIST_ITEMS
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view items" ON shopping_list_items;
CREATE POLICY "Members can view items" ON shopping_list_items
  FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "Members can add items" ON shopping_list_items;
CREATE POLICY "Members can add items" ON shopping_list_items
  FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "Members can update items" ON shopping_list_items;
CREATE POLICY "Members can update items" ON shopping_list_items
  FOR UPDATE USING (is_household_member(household_id));

DROP POLICY IF EXISTS "Members can delete items" ON shopping_list_items;
CREATE POLICY "Members can delete items" ON shopping_list_items
  FOR DELETE USING (is_household_member(household_id));

-- PUSH_SUBSCRIPTIONS — only the user themself
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users manage their own push subscriptions" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- SECTION 5: TRIGGERS (updated_at)
-- ============================================================
-- update_updated_at_column() is defined in an earlier migration
-- (20250112000001_accounts_income_transfers.sql). We reuse it here.

DROP TRIGGER IF EXISTS update_households_updated_at ON households;
CREATE TRIGGER update_households_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shopping_lists_updated_at ON shopping_lists;
CREATE TRIGGER update_shopping_lists_updated_at
  BEFORE UPDATE ON shopping_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shopping_list_items_updated_at ON shopping_list_items;
CREATE TRIGGER update_shopping_list_items_updated_at
  BEFORE UPDATE ON shopping_list_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SECTION 6: COMMENTS
-- ============================================================

COMMENT ON TABLE households IS 'Top-level multi-user grouping (e.g., a family or business).';
COMMENT ON TABLE household_members IS 'Joins users to a household with a role (admin or member).';
COMMENT ON TABLE household_invites IS 'Pending email invites; consumed by the server when the invitee signs up.';
COMMENT ON TABLE shopping_lists IS 'Store-themed shopping lists owned by a household.';
COMMENT ON TABLE shopping_list_items IS 'Items inside a shopping list. Tick purchased to check off in-store.';
COMMENT ON TABLE push_subscriptions IS 'Web Push subscription endpoints, one row per device per user.';
COMMENT ON COLUMN shopping_list_items.source IS 'How the item was added: manual, voice, suggestion, or import.';
COMMENT ON COLUMN shopping_list_items.expense_id IS 'Set when this item has been logged as an expense.';
COMMENT ON COLUMN push_subscriptions.in_store_mode IS 'When true, this device is actively shopping; other members'' adds become high-priority pushes.';
