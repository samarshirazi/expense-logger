require('dotenv').config();

async function createTables() {
  console.log('🔄 Creating Income & Savings tables...\n');

  const statements = [
    // Income Sources Table
    `CREATE TABLE IF NOT EXISTS income_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      source_name TEXT NOT NULL,
      amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
      currency VARCHAR(3) DEFAULT 'USD',
      month DATE NOT NULL,
      is_active BOOLEAN DEFAULT true,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,

    // Extra Income Table
    `CREATE TABLE IF NOT EXISTS extra_income (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
      currency VARCHAR(3) DEFAULT 'USD',
      date DATE NOT NULL,
      destination VARCHAR(20) NOT NULL CHECK (destination IN ('budget', 'savings')),
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,

    // Savings Transactions Table
    `CREATE TABLE IF NOT EXISTS savings_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      amount DECIMAL(10,2) NOT NULL,
      transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal')),
      source VARCHAR(50) NOT NULL,
      description TEXT,
      date DATE NOT NULL,
      related_goal_id UUID,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`,

    // Savings Goals Table
    `CREATE TABLE IF NOT EXISTS savings_goals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      goal_name TEXT NOT NULL,
      target_amount DECIMAL(10,2) NOT NULL CHECK (target_amount > 0),
      current_amount DECIMAL(10,2) DEFAULT 0 CHECK (current_amount >= 0),
      currency VARCHAR(3) DEFAULT 'USD',
      target_date DATE,
      description TEXT,
      is_completed BOOLEAN DEFAULT false,
      completed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )`
  ];

  // Check if we have DATABASE_URL
  if (process.env.DATABASE_URL) {
    console.log('✅ DATABASE_URL found, connecting...\n');
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      const client = await pool.connect();
      console.log('✅ Connected to database!\n');

      for (let i = 0; i < statements.length; i++) {
        console.log(`🔄 Creating table ${i + 1}/${statements.length}...`);
        await client.query(statements[i]);
        console.log(`✅ Table ${i + 1} created successfully!`);
      }

      // Create indexes
      console.log('\n🔄 Creating indexes...');
      await client.query('CREATE INDEX IF NOT EXISTS idx_income_sources_user_id ON income_sources(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_income_sources_month ON income_sources(month)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_extra_income_user_id ON extra_income(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_savings_transactions_user_id ON savings_transactions(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_savings_goals_user_id ON savings_goals(user_id)');
      console.log('✅ Indexes created!');

      // Add foreign key constraint
      console.log('\n🔄 Adding foreign key constraints...');
      await client.query(`ALTER TABLE savings_transactions ADD CONSTRAINT IF NOT EXISTS fk_savings_transactions_goal FOREIGN KEY (related_goal_id) REFERENCES savings_goals(id) ON DELETE SET NULL`);
      console.log('✅ Foreign key constraints added!');

      // Enable RLS
      console.log('\n🔄 Enabling Row Level Security...');
      await client.query('ALTER TABLE income_sources ENABLE ROW LEVEL SECURITY');
      await client.query('ALTER TABLE extra_income ENABLE ROW LEVEL SECURITY');
      await client.query('ALTER TABLE savings_transactions ENABLE ROW LEVEL SECURITY');
      await client.query('ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY');
      console.log('✅ RLS enabled!');

      // Create RLS policies
      console.log('\n🔄 Creating RLS policies...');
      const policies = [
        // Income sources policies
        `CREATE POLICY IF NOT EXISTS "Users can view their own income sources" ON income_sources FOR SELECT USING (auth.uid() = user_id)`,
        `CREATE POLICY IF NOT EXISTS "Users can insert their own income sources" ON income_sources FOR INSERT WITH CHECK (auth.uid() = user_id)`,
        `CREATE POLICY IF NOT EXISTS "Users can update their own income sources" ON income_sources FOR UPDATE USING (auth.uid() = user_id)`,
        `CREATE POLICY IF NOT EXISTS "Users can delete their own income sources" ON income_sources FOR DELETE USING (auth.uid() = user_id)`,

        // Extra income policies
        `CREATE POLICY IF NOT EXISTS "Users can view their own extra income" ON extra_income FOR SELECT USING (auth.uid() = user_id)`,
        `CREATE POLICY IF NOT EXISTS "Users can insert their own extra income" ON extra_income FOR INSERT WITH CHECK (auth.uid() = user_id)`,
        `CREATE POLICY IF NOT EXISTS "Users can update their own extra income" ON extra_income FOR UPDATE USING (auth.uid() = user_id)`,
        `CREATE POLICY IF NOT EXISTS "Users can delete their own extra income" ON extra_income FOR DELETE USING (auth.uid() = user_id)`,

        // Savings transactions policies
        `CREATE POLICY IF NOT EXISTS "Users can view their own savings transactions" ON savings_transactions FOR SELECT USING (auth.uid() = user_id)`,
        `CREATE POLICY IF NOT EXISTS "Users can insert their own savings transactions" ON savings_transactions FOR INSERT WITH CHECK (auth.uid() = user_id)`,
        `CREATE POLICY IF NOT EXISTS "Users can update their own savings transactions" ON savings_transactions FOR UPDATE USING (auth.uid() = user_id)`,
        `CREATE POLICY IF NOT EXISTS "Users can delete their own savings transactions" ON savings_transactions FOR DELETE USING (auth.uid() = user_id)`,

        // Savings goals policies
        `CREATE POLICY IF NOT EXISTS "Users can view their own savings goals" ON savings_goals FOR SELECT USING (auth.uid() = user_id)`,
        `CREATE POLICY IF NOT EXISTS "Users can insert their own savings goals" ON savings_goals FOR INSERT WITH CHECK (auth.uid() = user_id)`,
        `CREATE POLICY IF NOT EXISTS "Users can update their own savings goals" ON savings_goals FOR UPDATE USING (auth.uid() = user_id)`,
        `CREATE POLICY IF NOT EXISTS "Users can delete their own savings goals" ON savings_goals FOR DELETE USING (auth.uid() = user_id)`,
      ];

      for (const policy of policies) {
        await client.query(policy);
      }
      console.log('✅ RLS policies created!');

      client.release();
      await pool.end();

      console.log('\n✅✅✅ All tables created successfully! ✅✅✅');
      console.log('📝 Created: income_sources, extra_income, savings_transactions, savings_goals');
      console.log('🎉 Income & Savings feature is now ready to use!');

    } catch (error) {
      console.error('❌ Error:', error.message);
      console.log('\n📝 You need to add DATABASE_URL to your .env file');
      console.log('Get it from: Supabase Dashboard > Project Settings > Database > Connection string (URI mode)');
    }
  } else {
    console.log('❌ DATABASE_URL not found in .env file');
    console.log('\n📝 To create the tables automatically, add DATABASE_URL to your .env:');
    console.log('1. Go to Supabase Dashboard');
    console.log('2. Click Project Settings > Database');
    console.log('3. Copy the Connection string (URI mode)');
    console.log('4. Add to .env: DATABASE_URL=your_connection_string');
    console.log('5. Run this script again: node create-tables.js');
  }
}

createTables();
