/**
 * Creates the households + multi-list shopping + push tables.
 *
 * Reads migrations/20260427000000_households_shopping_push.sql and runs it
 * against the database connection string in DATABASE_URL.
 *
 * Usage:
 *   node server/create-shopping-tables.js
 *
 * Requires DATABASE_URL in .env (Supabase: Project Settings > Database >
 * Connection string in URI mode). Safe to re-run; the migration uses
 * IF NOT EXISTS / IF EXISTS guards throughout.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function run() {
  console.log('🔄 Creating households + shopping + push tables...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in .env');
    console.log('\n📝 Add DATABASE_URL to .env:');
    console.log('  1. Supabase Dashboard → Project Settings → Database');
    console.log('  2. Copy "Connection string" (URI mode)');
    console.log('  3. Paste into .env as DATABASE_URL=...');
    process.exit(1);
  }

  const sqlPath = path.join(
    __dirname,
    'migrations',
    '20260427000000_households_shopping_push.sql'
  );

  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ Migration file not found: ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');

  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const client = await pool.connect();
  console.log('✅ Connected to database');

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    console.log('\n✅ Tables created:');
    console.log('   - households');
    console.log('   - household_members');
    console.log('   - household_invites');
    console.log('   - shopping_lists');
    console.log('   - shopping_list_items');
    console.log('   - push_subscriptions');
    console.log('\n✅ RLS policies and triggers applied');
    console.log('\nNext: run `node server/migrate-to-households.js` to');
    console.log('backfill existing users into a default household.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
