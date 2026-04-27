/**
 * One-shot data migration: backfill existing users into a default household.
 *
 * For every user in auth.users that is NOT yet in any household, this script:
 *   1. Creates a household named "<email>'s Home"
 *   2. Inserts the user as admin of that household
 *   3. Seeds three starter shopping lists (Walmart, Costco, Local Grocery)
 *
 * Idempotent — running it again only processes users who still aren't members.
 *
 * Usage:
 *   node server/migrate-to-households.js
 *   node server/migrate-to-households.js --dry-run    # preview only
 *
 * Requires DATABASE_URL in .env (Supabase connection string, URI mode).
 * Run AFTER `node server/create-shopping-tables.js`.
 */

require('dotenv').config();

const DRY_RUN = process.argv.includes('--dry-run');

const STARTER_LISTS = [
  { name: 'Walmart', store_name: 'Walmart', store_icon: '🛒', sort_order: 0 },
  { name: 'Costco', store_name: 'Costco', store_icon: '📦', sort_order: 1 },
  { name: 'Local Grocery', store_name: 'Local Grocery', store_icon: '🥬', sort_order: 2 },
];

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in .env');
    process.exit(1);
  }

  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  console.log(`🔄 Backfilling users into households${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

  try {
    // Find users not yet in any household
    const { rows: orphans } = await client.query(`
      SELECT u.id, u.email
      FROM auth.users u
      WHERE NOT EXISTS (
        SELECT 1 FROM household_members hm WHERE hm.user_id = u.id
      )
      ORDER BY u.created_at ASC
    `);

    if (orphans.length === 0) {
      console.log('✅ No users need backfilling — every user is already a household member.');
      return;
    }

    console.log(`Found ${orphans.length} user(s) without a household:`);
    for (const u of orphans) console.log(`   - ${u.email} (${u.id})`);
    console.log();

    if (DRY_RUN) {
      console.log('Dry run — exiting without writing.');
      return;
    }

    let created = 0;
    for (const user of orphans) {
      await client.query('BEGIN');
      try {
        const householdName = user.email
          ? `${user.email.split('@')[0]}'s Home`
          : 'My Home';

        const { rows: hRows } = await client.query(
          `INSERT INTO households (name, created_by)
           VALUES ($1, $2)
           RETURNING id`,
          [householdName, user.id]
        );
        const householdId = hRows[0].id;

        await client.query(
          `INSERT INTO household_members (household_id, user_id, role, invited_by)
           VALUES ($1, $2, 'admin', $2)`,
          [householdId, user.id]
        );

        for (const list of STARTER_LISTS) {
          await client.query(
            `INSERT INTO shopping_lists
               (household_id, name, store_name, store_icon, sort_order, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [householdId, list.name, list.store_name, list.store_icon, list.sort_order, user.id]
          );
        }

        await client.query('COMMIT');
        console.log(`✅ ${user.email} → "${householdName}" (${householdId})`);
        created++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed for ${user.email}: ${err.message}`);
      }
    }

    console.log(`\n✅ Done. Created ${created} household(s).`);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
