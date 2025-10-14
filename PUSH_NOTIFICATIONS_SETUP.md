# Push Notifications Setup Guide

This guide will help you set up push notifications for the Expense Logger web app.

## Overview

The app now supports **Web Push Notifications** that work on:
- ✅ Chrome (Desktop & Android)
- ✅ Firefox (Desktop & Android)
- ✅ Edge (Desktop & Android)
- ✅ Opera (Desktop & Android)
- ⚠️ Safari (Limited support on iOS 16.4+, better on macOS)

## Setup Steps

### 1. Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required for web push notifications.

Run this command in your project root:

```bash
npx web-push generate-vapid-keys
```

This will output something like:

```
=======================================
Public Key:
BEL...your-public-key...xyz

Private Key:
abc...your-private-key...123
=======================================
```

### 2. Add Keys to Environment Variables

Add these keys to your `.env` file:

```bash
# Push Notification Configuration
VAPID_PUBLIC_KEY=BEL...your-public-key...xyz
VAPID_PRIVATE_KEY=abc...your-private-key...123
VAPID_SUBJECT=mailto:your-email@example.com

# React App Configuration
REACT_APP_VAPID_PUBLIC_KEY=BEL...your-public-key...xyz
```

**Important:**
- The `VAPID_PUBLIC_KEY` must be added in **both** server and client env vars
- Use the **same public key** for both `VAPID_PUBLIC_KEY` and `REACT_APP_VAPID_PUBLIC_KEY`
- Replace `your-email@example.com` with your actual email

### 3. Create Supabase Database Table

Run this SQL in your Supabase SQL Editor:

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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies
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

### 4. Restart Your Application

```bash
# Stop the current server (Ctrl+C)

# Restart both server and client
npm run dev
```

## How It Works

### User Flow

1. **User logs in** to the app
2. **Notification prompt appears** after 2 seconds
3. **User clicks "Enable"** to allow notifications
4. **Browser asks for permission**
5. **Subscription is saved** to the database
6. **User receives notifications** when:
   - A receipt is successfully processed
   - An expense is added

### Testing Notifications

You can test notifications using the API endpoint:

```bash
curl -X POST http://localhost:5000/api/notifications/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Or use the browser console after enabling notifications:

```javascript
fetch('http://localhost:5000/api/notifications/test', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('supabase.auth.token')
  }
})
```

## Notification Events

The app automatically sends notifications for:

1. **Receipt Processed** - When a receipt is uploaded and processed with AI
   - Shows merchant name and total amount
   - Clicking opens the app

## Troubleshooting

### Notifications Not Working?

1. **Check browser support:**
   ```javascript
   console.log('Push supported:', 'PushManager' in window);
   console.log('Notification permission:', Notification.permission);
   ```

2. **Check VAPID keys are set:**
   - Server: Check `.env` file has `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
   - Client: Check `.env` file has `REACT_APP_VAPID_PUBLIC_KEY`

3. **Check service worker is registered:**
   - Open DevTools → Application → Service Workers
   - You should see `service-worker.js` registered

4. **Check database table exists:**
   - Go to Supabase Dashboard → Table Editor
   - Look for `push_subscriptions` table

5. **Check browser console for errors**

### Permission Denied?

If user denies notification permission:
- They need to manually allow it in browser settings
- Chrome: Click the lock icon in address bar → Site Settings → Notifications
- Firefox: Click the shield icon → Permissions → Notifications

## Browser Compatibility

| Browser | Desktop | Mobile | Notes |
|---------|---------|--------|-------|
| Chrome | ✅ Yes | ✅ Yes | Full support |
| Firefox | ✅ Yes | ✅ Yes | Full support |
| Safari | ⚠️ Limited | ⚠️ Very Limited | iOS 16.4+ only, requires app to be added to home screen |
| Edge | ✅ Yes | ✅ Yes | Full support |
| Opera | ✅ Yes | ✅ Yes | Full support |

## Production Deployment

When deploying to production:

1. **Update VAPID_SUBJECT** with your production domain:
   ```bash
   VAPID_SUBJECT=mailto:support@yourdomain.com
   ```

2. **Update REACT_APP_API_URL** to your production API:
   ```bash
   REACT_APP_API_URL=https://api.yourdomain.com
   ```

3. **Ensure HTTPS** - Push notifications require HTTPS in production (except localhost)

4. **Test on multiple browsers** before going live

## Security Notes

- ⚠️ **Never commit VAPID private key** to version control
- ✅ Keep VAPID keys in `.env` file (gitignored)
- ✅ Use different VAPID keys for development and production
- ✅ VAPID public key is safe to expose to clients

## Future Enhancements

Potential features to add:
- [ ] Notification preferences (what types of notifications to receive)
- [ ] Quiet hours (don't send notifications during certain times)
- [ ] Weekly expense summary notifications
- [ ] Receipt expiration reminders
- [ ] Custom notification sounds

## Resources

- [Web Push Protocol](https://developers.google.com/web/fundamentals/push-notifications)
- [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [web-push npm package](https://www.npmjs.com/package/web-push)
