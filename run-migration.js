const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config();

async function runMigration() {
  try {
    console.log('🔄 Reading migration file...');
    const migrationPath = path.join(__dirname, 'server/migrations/20250124000001_income_savings.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📝 Migration file loaded successfully');
    console.log('🔄 Executing migration via Supabase API...');

    // Extract project ref from URL
    const projectRef = process.env.SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];

    const options = {
      hostname: `${projectRef}.supabase.co`,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    };

    const postData = JSON.stringify({
      query: migrationSQL
    });

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log('✅ Migration completed successfully!');
          console.log('📝 Created tables: income_sources, extra_income, savings_transactions, savings_goals');
        } else {
          console.log('⚠️  Response status:', res.statusCode);
          console.log('Response:', data);
          console.log('\n📝 Note: You may need to run this migration manually in Supabase SQL Editor');
          console.log('Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request failed:', error.message);
      console.log('\n📝 Please run this migration manually:');
      console.log('1. Go to your Supabase Dashboard');
      console.log('2. Navigate to SQL Editor');
      console.log('3. Paste the contents of: server/migrations/20250124000001_income_savings.sql');
      console.log('4. Click Run');
    });

    req.write(postData);
    req.end();

  } catch (error) {
    console.error('❌ Migration setup failed:', error.message);
    console.log('\n📝 Please run this migration manually:');
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Paste the contents of: server/migrations/20250124000001_income_savings.sql');
    console.log('4. Click Run');
    process.exit(1);
  }
}

runMigration();
