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

module.exports = {
  initSupabase,
  testConnection,
  createExpensesTable,
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
  getLearnedCategories
};