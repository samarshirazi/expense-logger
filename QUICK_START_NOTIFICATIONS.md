# Quick Start: Enable Push Notifications

## Step 1: Add VAPID Keys to .env

Add these lines to your `.env` file (in the root directory):

```bash
# Push Notification Configuration
VAPID_PUBLIC_KEY=BNwJhiMpNP4f4uoAr8MynvxYiqjI-8qbvEyG2U_cV6iAL5hK5lFx7y8Jl8gqhk9PqyUscTU36NrIMU0v224Imbk
VAPID_PRIVATE_KEY=IJVq8DyzhZrDDCg3EuCc7yqE9b79uFIv8onsIDO0tks
VAPID_SUBJECT=mailto:your-email@example.com

# React App Configuration
REACT_APP_API_URL=http://localhost:5000
REACT_APP_VAPID_PUBLIC_KEY=BNwJhiMpNP4f4uoAr8MynvxYiqjI-8qbvEyG2U_cV6iAL5hK5lFx7y8Jl8gqhk9PqyUscTU36NrIMU0v224Imbk
```

**Note:** Replace `your-email@example.com` with your actual email.

## Step 2: Create Database Table

Go to your Supabase Dashboard → SQL Editor and run:

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  endpoint TEXT GENERATED ALWAYS AS (subscription->>'endpoint') STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions"
  ON push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);
```

## Step 3: Restart the App

```bash
# Stop the current server (Ctrl+C if running)

# Restart
npm run dev
```

## Step 4: Test It!

1. Open http://localhost:3000
2. Log in to your account
3. After 2 seconds, you'll see a notification prompt
4. Click "Enable" and allow notifications
5. Upload a receipt
6. You should get a notification when it's processed!

## That's it!

You now have push notifications working. See `PUSH_NOTIFICATIONS_SETUP.md` for more details.

## Troubleshooting

**Notifications not appearing?**
- Check browser console for errors
- Make sure you clicked "Allow" when browser asked for permission
- Check that the `.env` file is in the root directory (not in server/ or client/)
- Make sure you restarted the app after adding environment variables

**Still having issues?**
- Open DevTools → Console and look for errors
- Check DevTools → Application → Service Workers to see if service worker is registered
- Try in a different browser (Chrome works best)
