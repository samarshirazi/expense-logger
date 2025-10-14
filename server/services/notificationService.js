const webpush = require('web-push');
const { initSupabase } = require('./supabaseService');

// VAPID keys should be generated once and stored in environment variables
// You can generate them by running: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:your-email@example.com';

// Configure web-push with VAPID details
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log('✅ Web Push configured with VAPID keys');
} else {
  console.warn('⚠️  VAPID keys not configured. Push notifications will not work.');
  console.warn('   Generate keys with: npx web-push generate-vapid-keys');
}

/**
 * Save push subscription to database
 */
async function saveSubscription(userId, subscription, userToken = null) {
  try {
    const { createClient } = require('@supabase/supabase-js');

    // Create Supabase client with user's access token for RLS
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: {
          headers: {
            Authorization: `Bearer ${userToken}`
          }
        }
      });
    } else {
      supabase = initSupabase();
    }

    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        subscription: subscription,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,endpoint',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log('Push subscription saved:', data);
    return data;
  } catch (error) {
    console.error('Error saving push subscription:', error);
    throw error;
  }
}

/**
 * Get all subscriptions for a user
 */
async function getUserSubscriptions(userId, userToken = null) {
  try {
    const { createClient } = require('@supabase/supabase-js');

    // Create Supabase client with user's access token for RLS
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: {
          headers: {
            Authorization: `Bearer ${userToken}`
          }
        }
      });
    } else {
      supabase = initSupabase();
    }

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching user subscriptions:', error);
    throw error;
  }
}

/**
 * Delete a subscription
 */
async function deleteSubscription(userId, endpoint) {
  try {
    const supabase = initSupabase();
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('subscription->>endpoint', endpoint);

    if (error) {
      throw error;
    }

    console.log('Push subscription deleted');
    return true;
  } catch (error) {
    console.error('Error deleting push subscription:', error);
    throw error;
  }
}

/**
 * Send push notification to a subscription
 */
async function sendPushNotification(subscription, payload) {
  try {
    const payloadString = typeof payload === 'string'
      ? payload
      : JSON.stringify(payload);

    await webpush.sendNotification(subscription, payloadString);
    console.log('Push notification sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending push notification:', error);

    // Handle expired/invalid subscriptions
    if (error.statusCode === 410 || error.statusCode === 404) {
      console.log('Subscription expired or invalid, should be removed');
    }

    throw error;
  }
}

/**
 * Send push notification to all user's devices
 */
async function sendPushToUser(userId, payload, userToken = null) {
  try {
    const subscriptions = await getUserSubscriptions(userId, userToken);

    if (subscriptions.length === 0) {
      console.log('No push subscriptions found for user:', userId);
      return { sent: 0, failed: 0 };
    }

    const results = await Promise.allSettled(
      subscriptions.map(sub => sendPushNotification(sub.subscription, payload))
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`Push notifications sent: ${sent} succeeded, ${failed} failed`);

    return { sent, failed };
  } catch (error) {
    console.error('Error sending push to user:', error);
    throw error;
  }
}

/**
 * Create push subscriptions table if it doesn't exist
 */
async function createPushSubscriptionsTable() {
  try {
    const supabase = initSupabase();
    // Check if table exists by trying to query it
    const { error: queryError } = await supabase
      .from('push_subscriptions')
      .select('id')
      .limit(1);

    // If table doesn't exist, we'll get an error
    if (queryError && queryError.message.includes('does not exist')) {
      console.log('Creating push_subscriptions table...');

      // Note: This requires admin privileges. You may need to create this manually
      // or use Supabase migrations. Here's the SQL for reference:
      console.log(`
⚠️  Please run this SQL in your Supabase SQL editor:

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
      `);

      return false;
    } else if (!queryError) {
      console.log('✅ push_subscriptions table exists');
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking/creating push_subscriptions table:', error);
    return false;
  }
}

module.exports = {
  saveSubscription,
  getUserSubscriptions,
  deleteSubscription,
  sendPushNotification,
  sendPushToUser,
  createPushSubscriptionsTable
};
