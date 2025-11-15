const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function createTables() {
  console.log('\n🔄 Creating budgets and recurring expenses tables...\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials in .env file');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Read the migration file
  const migrationPath = path.join(__dirname, 'migrations', 'add-budgets-recurring.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  // Split into individual statements
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (!statement) continue;

    console.log(`🔄 Executing statement ${i + 1}/${statements.length}...`);

    try {
      const { data, error } = await supabase.rpc('exec_sql', { sql: statement });

      if (error) {
        // Some errors are okay (like "already exists")
        if (error.message.includes('already exists') || error.message.includes('IF NOT EXISTS')) {
          console.log(`⏭️  Skipped (already exists)`);
        } else {
          console.error(`❌ Error:`, error.message);
        }
      } else {
        console.log(`✅ Success`);
      }
    } catch (err) {
      console.error(`❌ Error:`, err.message);
    }
  }

  console.log('\n✅ Migration process completed!');
  console.log('🎉 Budgets & Recurring Expenses tables should now be ready\n');
}

createTables();
