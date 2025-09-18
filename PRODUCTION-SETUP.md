# Production Setup Instructions

This guide will help you fix the email confirmation URL issue and set up proper user isolation for your expense logger app.

## 🔧 Database Migration

**IMPORTANT: Run this first!** Execute the SQL in `database-migration.sql` in your Supabase SQL editor:

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/opyzkwddmmvbwfjydpyb
2. Navigate to SQL Editor
3. Copy and paste the entire content from `database-migration.sql`
4. Click "Run" to execute the migration

This will:
- ✅ Create a `users` table linked to `auth.users`
- ✅ Add `user_id` column to `expenses` table
- ✅ Set up proper Row Level Security (RLS) policies
- ✅ Ensure users can only see their own expenses
- ✅ Auto-create user profiles on signup

## 📧 Fix Email Confirmation URLs

The confirmation emails currently point to `localhost:3000`. To fix this:

### 1. Update Supabase Site URL
1. Go to Supabase Dashboard → Authentication → URL Configuration
2. Change **Site URL** from:
   ```
   http://localhost:3000
   ```
   To your Vercel app URL:
   ```
   https://your-vercel-app.vercel.app
   ```

### 2. Update Redirect URLs
Add your production URL to the **Redirect URLs** list:
```
https://your-vercel-app.vercel.app/**
http://localhost:3000/**  (keep for local development)
```

### 3. Update Client Environment Variables
In your Vercel dashboard, set these environment variables:

```bash
# Frontend (Vercel Environment Variables)
REACT_APP_SUPABASE_URL=https://opyzkwddmmvbwfjydpyb.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key

# Backend (if deploying separately)
SUPABASE_URL=https://opyzkwddmmvbwfjydpyb.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 🔒 Security Features Added

### User Isolation
- Each user can only see their own expenses
- Expenses are automatically tagged with `user_id` on creation
- Database-level security via Row Level Security (RLS)

### Auto User Profile Creation
- User profiles are automatically created when someone signs up
- Profiles store additional data like `full_name` and `preferences`

### Secure API Endpoints
All expense endpoints now require authentication:
- `POST /api/upload-receipt` - Creates expense for authenticated user
- `GET /api/expenses` - Returns only user's expenses
- `DELETE /api/expenses/:id` - Only deletes user's own expenses

## 🧪 Testing the Migration

After running the migration:

1. **Test Signup**: Create a new account
2. **Check User Table**: Verify user profile was created automatically
3. **Upload Receipt**: Ensure expense is tagged with your `user_id`
4. **Test Isolation**: Create another user and verify they can't see each other's expenses

## 📊 Database Schema After Migration

### users table
```sql
- id (UUID) → Links to auth.users(id)
- email (TEXT)
- full_name (TEXT)
- avatar_url (TEXT)
- preferences (JSONB)
- created_at, updated_at (TIMESTAMP)
```

### expenses table (updated)
```sql
- id (UUID)
- user_id (UUID) → NEW: Links to auth.users(id)
- merchant_name, date, total_amount...
- (all existing columns remain)
```

## 🚨 Important Notes

1. **Existing Data**: The migration will assign all existing expenses to the first user in your database. If you have multiple test users, you may need to manually reassign expenses.

2. **RLS Policies**: The old "allow all" policy has been replaced with user-specific policies. This means:
   - Users can only see/edit/delete their own expenses
   - Database queries are automatically filtered by `user_id`

3. **API Changes**: The `getExpensesByCategory` function now requires a `userId` parameter.

## 🔍 Verification Checklist

- [ ] Database migration completed successfully
- [ ] Supabase Site URL updated to production domain
- [ ] Redirect URLs include production domain
- [ ] Environment variables set in Vercel
- [ ] New user signup creates profile automatically
- [ ] Users can only see their own expenses
- [ ] Email confirmation links to production app

## 🆘 Troubleshooting

**Email still goes to localhost:**
- Check Supabase Authentication → URL Configuration
- Ensure Site URL is set to your Vercel domain

**Users can see each other's expenses:**
- Verify RLS policies are active: `SELECT * FROM pg_policies WHERE tablename = 'expenses';`
- Check that `user_id` column exists and is populated

**Migration fails:**
- Ensure you're running the SQL as the project owner
- Check for any existing conflicting policies or columns