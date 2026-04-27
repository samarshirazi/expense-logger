/**
 * Service-role Supabase client for server-side operations that need to
 * bypass RLS (e.g., invite acceptance, lookups across users).
 *
 * Application-level membership checks are still enforced in each service —
 * RLS is defense-in-depth.
 */

const { createClient } = require('@supabase/supabase-js');

let adminClient = null;

function getAdminClient() {
  if (adminClient) return adminClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'Set them in .env to use household/shopping endpoints.'
    );
  }

  adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

module.exports = { getAdminClient };
