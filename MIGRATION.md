# Migration Guide: Households + Multi-list Shopping + Push

This release adds:

- **Multi-user households**: invite people to share data via email
- **Roles**: `admin` (manages members + settings) and `member` (uses everything)
- **Multi-list shopping**: organize items by store (Walmart, Costco, …)
- **Voice + AI item entry**: speak items, AI parses, you confirm before saving
- **Realtime sync** + **web push notifications** for in-store shopping

## Prerequisites

- Node.js installed
- A `.env` file with `DATABASE_URL` set to your Supabase Postgres connection
  string (Supabase Dashboard → Project Settings → Database → Connection
  string, **URI mode**).

If `DATABASE_URL` is not yet in your `.env`, copy it from `.env.example` and
fill it in. You'll also want to add the new entries `RESEND_API_KEY`,
`INVITE_FROM_EMAIL`, and `APP_URL` for invite emails to work.

## Step 0 — Install new dependencies

Phase 2 adds `pg` (used by the migration scripts) and `resend` (invite
emails). From `server/`:

```bash
cd server && npm install
```

## Step 1 — Create the new tables

```bash
node server/create-shopping-tables.js
```

This runs `server/migrations/20260427000000_households_shopping_push.sql`
inside a single transaction. It creates these tables (all with RLS enabled
and Supabase auth-aware policies):

- `households`
- `household_members`
- `household_invites`
- `shopping_lists`
- `shopping_list_items`
- `push_subscriptions`

Plus two helper SQL functions: `is_household_member(uuid)` and
`is_household_admin(uuid)`.

The script is **idempotent** — safe to re-run. All `CREATE` statements use
`IF NOT EXISTS` and policies use `DROP POLICY IF EXISTS` before recreating.

## Step 2 — Backfill existing users

```bash
node server/migrate-to-households.js --dry-run   # preview first
node server/migrate-to-households.js             # actually write
```

For every existing user who isn't yet in a household, this:

1. Creates a household named `"<email-prefix>'s Home"`
2. Adds the user as `admin`
3. Seeds three starter shopping lists: **Walmart**, **Costco**, **Local
   Grocery** (you can rename, archive, or delete these from the UI later).

This is also idempotent — re-running only processes users still without a
household.

## Step 3 — Generate VAPID keys for push notifications

Web Push (Phase 5) needs a VAPID keypair. Generate one:

```bash
npx web-push generate-vapid-keys
```

Paste into `.env`:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@yourdomain.com
REACT_APP_VAPID_PUBLIC_KEY=<same as VAPID_PUBLIC_KEY>
```

Without these, the "In-store mode" toggle is hidden and adds-by-other-members
won't send pushes. The rest of the app keeps working.

## Step 4 — Realtime sync

The migration in Step 1 already adds `shopping_list_items` and
`shopping_lists` to the `supabase_realtime` publication, so live updates
work out of the box. No extra config needed beyond having
`REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` set in your
client `.env` (which you already have for auth).

If you ever need to verify, run:
```sql
SELECT pubname, tablename FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime'
   AND tablename IN ('shopping_list_items', 'shopping_lists');
```
You should see two rows.

## Verify

After Step 2, run this query in the Supabase SQL editor:

```sql
SELECT
  u.email,
  h.name AS household,
  hm.role,
  (SELECT count(*) FROM shopping_lists WHERE household_id = h.id) AS lists
FROM auth.users u
JOIN household_members hm ON hm.user_id = u.id
JOIN households h ON h.id = hm.household_id
ORDER BY u.created_at;
```

Each user should appear once with `role = 'admin'` and `lists = 3`.

## Rollback (if needed)

The migration is non-destructive — it only adds new tables and does not modify
any existing schema. To roll back:

```sql
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS shopping_list_items CASCADE;
DROP TABLE IF EXISTS shopping_lists CASCADE;
DROP TABLE IF EXISTS household_invites CASCADE;
DROP TABLE IF EXISTS household_members CASCADE;
DROP TABLE IF EXISTS households CASCADE;
DROP FUNCTION IF EXISTS is_household_member(uuid);
DROP FUNCTION IF EXISTS is_household_admin(uuid);
```

Existing user data (expenses, budgets, etc.) is untouched by this migration.
