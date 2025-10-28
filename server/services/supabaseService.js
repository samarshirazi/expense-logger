const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function initSupabase() {
  if (supabase) return supabase;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file');
  }

  supabase = createClient(supabaseUrl, supabaseKey);
  return supabase;
}

async function testConnection() {
  try {
    const supabase = initSupabase();
    const { data, error } = await supabase.from('expenses').select('count').limit(1);

    if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist yet
      throw error;
    }

    console.log('✅ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }
}

async function createExpensesTable() {
  try {
    const supabase = initSupabase();

    // Check if table exists by trying to select from it
    const { error: selectError } = await supabase
      .from('expenses')
      .select('id')
      .limit(1);

    if (!selectError) {
      console.log('✅ Expenses table already exists');

      // Check if user_id column exists and add it if it doesn't
      try {
        await supabase
          .from('expenses')
          .select('user_id')
          .limit(1);
        console.log('✅ User_id column already exists');
      } catch (columnError) {
        console.log('📝 Adding user_id column to expenses table...');
        const addColumnSQL = `
          ALTER TABLE expenses
          ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

          -- Create index for user_id
          CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);

          -- Update RLS policies for multiuser support
          DROP POLICY IF EXISTS "Allow all operations on expenses" ON expenses;

          -- Users can only see their own expenses
          CREATE POLICY "Users can view own expenses" ON expenses
          FOR SELECT USING (auth.uid() = user_id);

          -- Users can insert their own expenses
          CREATE POLICY "Users can insert own expenses" ON expenses
          FOR INSERT WITH CHECK (auth.uid() = user_id);

          -- Users can update their own expenses
          CREATE POLICY "Users can update own expenses" ON expenses
          FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

          -- Users can delete their own expenses
          CREATE POLICY "Users can delete own expenses" ON expenses
          FOR DELETE USING (auth.uid() = user_id);
        `;

        console.log('Please run this SQL in your Supabase dashboard to add multiuser support:');
        console.log(addColumnSQL);
      }

      return true;
    }

    // Create table using SQL
    const { data, error } = await supabase.rpc('create_expenses_table');

    if (error) {
      console.log('📝 Creating expenses table via SQL...');

      // Alternative: Create table using raw SQL if RPC doesn't work
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS expenses (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
          merchant_name TEXT NOT NULL,
          date DATE,
          total_amount DECIMAL(10,2) NOT NULL,
          currency VARCHAR(3) DEFAULT 'USD',
          category TEXT,
          items JSONB,
          payment_method TEXT,
          tax_amount DECIMAL(10,2),
          tip_amount DECIMAL(10,2),
          original_filename TEXT,
          drive_file_id TEXT,
          upload_date TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Create indexes for better performance
        CREATE INDEX IF NOT EXISTS idx_expenses_merchant ON expenses(merchant_name);
        CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
        CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
        CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
        CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);

        -- Enable Row Level Security
        ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

        -- Create RLS policies for multiuser support
        -- Users can only see their own expenses
        CREATE POLICY "Users can view own expenses" ON expenses
        FOR SELECT USING (auth.uid() = user_id);

        -- Users can insert their own expenses
        CREATE POLICY "Users can insert own expenses" ON expenses
        FOR INSERT WITH CHECK (auth.uid() = user_id);

        -- Users can update their own expenses
        CREATE POLICY "Users can update own expenses" ON expenses
        FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

        -- Users can delete their own expenses
        CREATE POLICY "Users can delete own expenses" ON expenses
        FOR DELETE USING (auth.uid() = user_id);
      `;

      // Note: You'll need to run this SQL manually in Supabase dashboard
      console.log('Please run this SQL in your Supabase dashboard:');
      console.log(createTableSQL);

      return false;
    }

    console.log('✅ Expenses table created successfully');
    return true;

  } catch (error) {
    console.error('❌ Error creating expenses table:', error.message);
    return false;
  }
}

async function createIncomeSavingsTables() {
  try {
    const supabase = initSupabase();

    // Check if tables exist by trying to select from them
    const { error: incomeError } = await supabase
      .from('income_sources')
      .select('id')
      .limit(1);

    const { error: extraIncomeError } = await supabase
      .from('extra_income')
      .select('id')
      .limit(1);

    const { error: savingsError } = await supabase
      .from('savings_transactions')
      .select('id')
      .limit(1);

    const { error: goalsError } = await supabase
      .from('savings_goals')
      .select('id')
      .limit(1);

    if (!incomeError && !extraIncomeError && !savingsError && !goalsError) {
      console.log('✅ Income & Savings tables already exist');
      return true;
    }

    console.log('📝 Income & Savings tables need to be created');
    console.log('⚠️  Please run the SQL migration file: server/migrations/20250124000001_income_savings.sql');
    console.log('   You can run it in your Supabase SQL Editor at: https://supabase.com/dashboard/project/_/sql');

    // Read and log the migration file path for easy access
    const migrationPath = require('path').join(__dirname, '..', 'migrations', '20250124000001_income_savings.sql');
    console.log(`   Migration file location: ${migrationPath}`);

    return false;

  } catch (error) {
    console.error('❌ Error checking income/savings tables:', error.message);
    return false;
  }
}

async function saveExpense(expenseData, userId, userToken = null) {
  try {
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

    const expenseRecord = {
      user_id: userId,
      merchant_name: expenseData.merchantName,
      date: expenseData.date,
      total_amount: expenseData.totalAmount,
      currency: expenseData.currency || 'USD',
      category: expenseData.category,
      items: expenseData.items || [],
      payment_method: expenseData.paymentMethod,
      tax_amount: expenseData.taxAmount,
      tip_amount: expenseData.tipAmount,
      original_filename: expenseData.originalFilename,
      drive_file_id: expenseData.driveFileId,
      upload_date: expenseData.uploadDate || new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('expenses')
      .insert([expenseRecord])
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log('✅ Expense saved to Supabase:', data.id);
    return data.id;

  } catch (error) {
    console.error('❌ Error saving expense to Supabase:', error);
    throw new Error(`Failed to save expense: ${error.message}`);
  }
}

async function getExpenses(userId, limit = 50, offset = 0, userToken = null) {
  try {
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
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    // Transform data to match frontend expectations
    const expenses = data.map(row => ({
      id: row.id,
      merchantName: row.merchant_name,
      date: row.date,
      totalAmount: parseFloat(row.total_amount),
      currency: row.currency,
      category: row.category,
      items: row.items || [],
      paymentMethod: row.payment_method,
      taxAmount: row.tax_amount ? parseFloat(row.tax_amount) : null,
      tipAmount: row.tip_amount ? parseFloat(row.tip_amount) : null,
      originalFilename: row.original_filename,
      driveFileId: row.drive_file_id,
      uploadDate: row.upload_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return expenses;

  } catch (error) {
    console.error('❌ Error fetching expenses from Supabase:', error);
    throw new Error(`Failed to fetch expenses: ${error.message}`);
  }
}

async function getExpenseById(id, userId, userToken = null) {
  try {
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
      .from('expenses')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw error;
    }

    // Transform data to match frontend expectations
    return {
      id: data.id,
      merchantName: data.merchant_name,
      date: data.date,
      totalAmount: parseFloat(data.total_amount),
      currency: data.currency,
      category: data.category,
      items: data.items || [],
      paymentMethod: data.payment_method,
      taxAmount: data.tax_amount ? parseFloat(data.tax_amount) : null,
      tipAmount: data.tip_amount ? parseFloat(data.tip_amount) : null,
      originalFilename: data.original_filename,
      driveFileId: data.drive_file_id,
      uploadDate: data.upload_date,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };

  } catch (error) {
    console.error('❌ Error fetching expense by ID from Supabase:', error);
    throw new Error(`Failed to fetch expense: ${error.message}`);
  }
}

async function deleteExpense(id, userId, userToken = null) {
  try {
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

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    console.log('✅ Expense deleted from Supabase:', id);
    return true;

  } catch (error) {
    console.error('❌ Error deleting expense from Supabase:', error);
    throw new Error(`Failed to delete expense: ${error.message}`);
  }
}

async function getExpensesByCategory(category, userId) {
  try {
    const supabase = initSupabase();

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('category', category)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Transform data to match frontend expectations
    const expenses = data.map(row => ({
      id: row.id,
      merchantName: row.merchant_name,
      date: row.date,
      totalAmount: parseFloat(row.total_amount),
      currency: row.currency,
      category: row.category,
      items: row.items || [],
      paymentMethod: row.payment_method,
      taxAmount: row.tax_amount ? parseFloat(row.tax_amount) : null,
      tipAmount: row.tip_amount ? parseFloat(row.tip_amount) : null,
      originalFilename: row.original_filename,
      driveFileId: row.drive_file_id,
      uploadDate: row.upload_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return expenses;

  } catch (error) {
    console.error('❌ Error fetching expenses by category from Supabase:', error);
    throw new Error(`Failed to fetch expenses: ${error.message}`);
  }
}

// Real-time subscription for expenses (optional feature)
function subscribeToExpenses(callback) {
  const supabase = initSupabase();

  const subscription = supabase
    .channel('expenses')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'expenses'
    }, callback)
    .subscribe();

  return subscription;
}

async function updateExpenseCategory(id, category, userId, userToken = null) {
  try {
    // Validate category is not empty
    if (!category || typeof category !== 'string') {
      throw new Error('Invalid category. Category must be a non-empty string.');
    }

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
      .from('expenses')
      .update({
        category: category,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log('✅ Expense category updated in Supabase:', id);
    return {
      id: data.id,
      category: data.category,
      updatedAt: data.updated_at
    };

  } catch (error) {
    console.error('❌ Error updating expense category in Supabase:', error);
    throw new Error(`Failed to update expense category: ${error.message}`);
  }
}

async function updateItemCategory(expenseId, itemIndex, category, userId, userToken = null) {
  try {
    // Validate category is not empty
    if (!category || typeof category !== 'string') {
      throw new Error('Invalid category. Category must be a non-empty string.');
    }

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

    // First, fetch the expense to get current items
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('items')
      .eq('id', expenseId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    // Update the specific item's category
    const items = expense.items || [];
    if (itemIndex < 0 || itemIndex >= items.length) {
      throw new Error(`Invalid item index: ${itemIndex}`);
    }

    items[itemIndex] = {
      ...items[itemIndex],
      category: category
    };

    // Update the expense with modified items
    const { data, error } = await supabase
      .from('expenses')
      .update({
        items: items,
        updated_at: new Date().toISOString()
      })
      .eq('id', expenseId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`✅ Item ${itemIndex} category updated in expense ${expenseId}`);
    return {
      id: data.id,
      items: data.items,
      updatedAt: data.updated_at
    };

  } catch (error) {
    console.error('❌ Error updating item category in Supabase:', error);
    throw new Error(`Failed to update item category: ${error.message}`);
  }
}

async function updateExpense(id, expenseData, userId, userToken = null) {
  try {
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

    // Build update object with database column names
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (expenseData.merchantName !== undefined) updateData.merchant_name = expenseData.merchantName;
    if (expenseData.date !== undefined) updateData.date = expenseData.date;
    if (expenseData.totalAmount !== undefined) updateData.total_amount = expenseData.totalAmount;
    if (expenseData.currency !== undefined) updateData.currency = expenseData.currency;
    if (expenseData.category !== undefined) updateData.category = expenseData.category;
    if (expenseData.items !== undefined) updateData.items = expenseData.items;
    if (expenseData.paymentMethod !== undefined) updateData.payment_method = expenseData.paymentMethod;
    if (expenseData.taxAmount !== undefined) updateData.tax_amount = expenseData.taxAmount;
    if (expenseData.tipAmount !== undefined) updateData.tip_amount = expenseData.tipAmount;

    const { data, error } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log('✅ Expense updated in Supabase:', id);

    // Transform data back to frontend format
    return {
      id: data.id,
      merchantName: data.merchant_name,
      date: data.date,
      totalAmount: parseFloat(data.total_amount),
      currency: data.currency,
      category: data.category,
      items: data.items || [],
      paymentMethod: data.payment_method,
      taxAmount: data.tax_amount ? parseFloat(data.tax_amount) : null,
      tipAmount: data.tip_amount ? parseFloat(data.tip_amount) : null,
      originalFilename: data.original_filename,
      driveFileId: data.drive_file_id,
      uploadDate: data.upload_date,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };

  } catch (error) {
    console.error('❌ Error updating expense in Supabase:', error);
    throw new Error(`Failed to update expense: ${error.message}`);
  }
}

async function createCategoryLearningTable() {
  try {
    const supabase = initSupabase();

    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS category_learning (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL,
          merchant_name VARCHAR(255),
          description_pattern VARCHAR(255),
          learned_category VARCHAR(50) NOT NULL,
          confidence_score INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, merchant_name, description_pattern)
        );

        CREATE INDEX IF NOT EXISTS idx_category_learning_user_merchant ON category_learning(user_id, merchant_name);
        CREATE INDEX IF NOT EXISTS idx_category_learning_user_desc ON category_learning(user_id, description_pattern);
      `
    });

    if (error) {
      console.warn('Category learning table may already exist:', error.message);
    } else {
      console.log('✅ Category learning table ready');
    }
  } catch (error) {
    console.warn('Note: Category learning table setup skipped:', error.message);
  }
}

async function learnCategoryCorrection(userId, merchantName, description, category) {
  try {
    const supabase = initSupabase();

    const { data, error } = await supabase
      .from('category_learning')
      .upsert({
        user_id: userId,
        merchant_name: merchantName || null,
        description_pattern: description || null,
        learned_category: category,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,merchant_name,description_pattern'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error learning category:', error);
    throw error;
  }
}

async function getLearnedCategories(userId) {
  try {
    const supabase = initSupabase();

    const { data, error } = await supabase
      .from('category_learning')
      .select('*')
      .eq('user_id', userId)
      .order('confidence_score', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting learned categories:', error);
    return [];
  }
}

// ============================================================
// INCOME SOURCES FUNCTIONS
// ============================================================

async function saveIncomeSource(incomeData, userId, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    const incomeRecord = {
      user_id: userId,
      source_name: incomeData.sourceName,
      amount: incomeData.amount,
      currency: incomeData.currency || 'USD',
      month: incomeData.month,
      is_active: incomeData.isActive !== undefined ? incomeData.isActive : true,
      notes: incomeData.notes || null
    };

    const { data, error } = await supabase
      .from('income_sources')
      .insert([incomeRecord])
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Income source saved:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Error saving income source:', error);
    throw new Error(`Failed to save income source: ${error.message}`);
  }
}

async function getIncomeSources(userId, month = null, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    let query = supabase
      .from('income_sources')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (month) {
      query = query.eq('month', month);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data.map(row => ({
      id: row.id,
      sourceName: row.source_name,
      amount: parseFloat(row.amount),
      currency: row.currency,
      month: row.month,
      isActive: row.is_active,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (error) {
    console.error('❌ Error fetching income sources:', error);
    throw new Error(`Failed to fetch income sources: ${error.message}`);
  }
}

async function updateIncomeSource(id, incomeData, userId, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (incomeData.sourceName !== undefined) updateData.source_name = incomeData.sourceName;
    if (incomeData.amount !== undefined) updateData.amount = incomeData.amount;
    if (incomeData.currency !== undefined) updateData.currency = incomeData.currency;
    if (incomeData.month !== undefined) updateData.month = incomeData.month;
    if (incomeData.isActive !== undefined) updateData.is_active = incomeData.isActive;
    if (incomeData.notes !== undefined) updateData.notes = incomeData.notes;

    const { data, error } = await supabase
      .from('income_sources')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Income source updated:', id);
    return data;
  } catch (error) {
    console.error('❌ Error updating income source:', error);
    throw new Error(`Failed to update income source: ${error.message}`);
  }
}

async function deleteIncomeSource(id, userId, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    const { error } = await supabase
      .from('income_sources')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    console.log('✅ Income source deleted:', id);
    return true;
  } catch (error) {
    console.error('❌ Error deleting income source:', error);
    throw new Error(`Failed to delete income source: ${error.message}`);
  }
}

// ============================================================
// EXTRA INCOME FUNCTIONS
// ============================================================

async function saveExtraIncome(incomeData, userId, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    const incomeRecord = {
      user_id: userId,
      description: incomeData.description,
      amount: incomeData.amount,
      currency: incomeData.currency || 'USD',
      date: incomeData.date,
      destination: incomeData.destination, // 'budget' or 'savings'
      notes: incomeData.notes || null
    };

    const { data, error } = await supabase
      .from('extra_income')
      .insert([incomeRecord])
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Extra income saved:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Error saving extra income:', error);
    throw new Error(`Failed to save extra income: ${error.message}`);
  }
}

async function getExtraIncome(userId, startDate = null, endDate = null, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    let query = supabase
      .from('extra_income')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data, error } = await query;

    if (error) throw error;

    return data.map(row => ({
      id: row.id,
      description: row.description,
      amount: parseFloat(row.amount),
      currency: row.currency,
      date: row.date,
      destination: row.destination,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (error) {
    console.error('❌ Error fetching extra income:', error);
    throw new Error(`Failed to fetch extra income: ${error.message}`);
  }
}

async function deleteExtraIncome(id, userId, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    const { error } = await supabase
      .from('extra_income')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    console.log('✅ Extra income deleted:', id);
    return true;
  } catch (error) {
    console.error('❌ Error deleting extra income:', error);
    throw new Error(`Failed to delete extra income: ${error.message}`);
  }
}

// ============================================================
// SAVINGS FUNCTIONS
// ============================================================

async function saveSavingsTransaction(transactionData, userId, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    const transactionRecord = {
      user_id: userId,
      amount: transactionData.amount,
      transaction_type: transactionData.transactionType, // 'deposit' or 'withdrawal'
      source: transactionData.source, // 'manual', 'extra_income', 'month_end', etc.
      description: transactionData.description || null,
      date: transactionData.date,
      related_goal_id: transactionData.relatedGoalId || null
    };

    const { data, error } = await supabase
      .from('savings_transactions')
      .insert([transactionRecord])
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Savings transaction saved:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Error saving savings transaction:', error);
    throw new Error(`Failed to save savings transaction: ${error.message}`);
  }
}

async function getSavingsTransactions(userId, limit = 50, offset = 0, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    const { data, error } = await supabase
      .from('savings_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return data.map(row => ({
      id: row.id,
      amount: parseFloat(row.amount),
      transactionType: row.transaction_type,
      source: row.source,
      description: row.description,
      date: row.date,
      relatedGoalId: row.related_goal_id,
      createdAt: row.created_at
    }));
  } catch (error) {
    console.error('❌ Error fetching savings transactions:', error);
    throw new Error(`Failed to fetch savings transactions: ${error.message}`);
  }
}

async function getSavingsBalance(userId, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    const { data, error } = await supabase
      .from('user_savings_balance')
      .select('total_balance, transaction_count, last_transaction_date')
      .eq('user_id', userId)
      .single();

    if (error) {
      // If no transactions yet, return 0
      if (error.code === 'PGRST116') {
        return { totalBalance: 0, transactionCount: 0, lastTransactionDate: null };
      }
      throw error;
    }

    return {
      totalBalance: parseFloat(data.total_balance || 0),
      transactionCount: data.transaction_count || 0,
      lastTransactionDate: data.last_transaction_date
    };
  } catch (error) {
    console.error('❌ Error fetching savings balance:', error);
    throw new Error(`Failed to fetch savings balance: ${error.message}`);
  }
}

// ============================================================
// SAVINGS GOALS FUNCTIONS
// ============================================================

async function saveSavingsGoal(goalData, userId, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    const goalRecord = {
      user_id: userId,
      goal_name: goalData.goalName,
      target_amount: goalData.targetAmount,
      current_amount: goalData.currentAmount || 0,
      currency: goalData.currency || 'USD',
      target_date: goalData.targetDate || null,
      description: goalData.description || null
    };

    const { data, error } = await supabase
      .from('savings_goals')
      .insert([goalRecord])
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Savings goal created:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Error creating savings goal:', error);
    throw new Error(`Failed to create savings goal: ${error.message}`);
  }
}

async function getSavingsGoals(userId, includeCompleted = false, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    let query = supabase
      .from('savings_goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!includeCompleted) {
      query = query.eq('is_completed', false);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data.map(row => ({
      id: row.id,
      goalName: row.goal_name,
      targetAmount: parseFloat(row.target_amount),
      currentAmount: parseFloat(row.current_amount),
      currency: row.currency,
      targetDate: row.target_date,
      description: row.description,
      isCompleted: row.is_completed,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (error) {
    console.error('❌ Error fetching savings goals:', error);
    throw new Error(`Failed to fetch savings goals: ${error.message}`);
  }
}

async function updateSavingsGoal(id, goalData, userId, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (goalData.goalName !== undefined) updateData.goal_name = goalData.goalName;
    if (goalData.targetAmount !== undefined) updateData.target_amount = goalData.targetAmount;
    if (goalData.currentAmount !== undefined) updateData.current_amount = goalData.currentAmount;
    if (goalData.currency !== undefined) updateData.currency = goalData.currency;
    if (goalData.targetDate !== undefined) updateData.target_date = goalData.targetDate;
    if (goalData.description !== undefined) updateData.description = goalData.description;
    if (goalData.isCompleted !== undefined) {
      updateData.is_completed = goalData.isCompleted;
      if (goalData.isCompleted) {
        updateData.completed_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from('savings_goals')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Savings goal updated:', id);
    return data;
  } catch (error) {
    console.error('❌ Error updating savings goal:', error);
    throw new Error(`Failed to update savings goal: ${error.message}`);
  }
}

async function deleteSavingsGoal(id, userId, userToken = null) {
  try {
    let supabase;
    if (userToken) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${userToken}` } }
      });
    } else {
      supabase = initSupabase();
    }

    const { error } = await supabase
      .from('savings_goals')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    console.log('✅ Savings goal deleted:', id);
    return true;
  } catch (error) {
    console.error('❌ Error deleting savings goal:', error);
    throw new Error(`Failed to delete savings goal: ${error.message}`);
  }
}

module.exports = {
  initSupabase,
  testConnection,
  createExpensesTable,
  createIncomeSavingsTables,
  saveExpense,
  getExpenses,
  getExpenseById,
  deleteExpense,
  getExpensesByCategory,
  subscribeToExpenses,
  updateExpenseCategory,
  updateItemCategory,
  updateExpense,
  createCategoryLearningTable,
  learnCategoryCorrection,
  getLearnedCategories,
  // Income sources
  saveIncomeSource,
  getIncomeSources,
  updateIncomeSource,
  deleteIncomeSource,
  // Extra income
  saveExtraIncome,
  getExtraIncome,
  deleteExtraIncome,
  // Savings transactions
  saveSavingsTransaction,
  getSavingsTransactions,
  getSavingsBalance,
  // Savings goals
  saveSavingsGoal,
  getSavingsGoals,
  updateSavingsGoal,
  deleteSavingsGoal
};