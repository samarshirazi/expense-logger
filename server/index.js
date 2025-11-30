const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { processReceiptWithAI, parseManualEntry, generateCoachInsights } = require('./services/aiService');
const { uploadToGoogleDrive, deleteFromGoogleDrive } = require('./services/googleDriveService');
const {
  saveExpense, getExpenses, getExpenseById, deleteExpense, testConnection, createExpensesTable,
  updateExpenseCategory, updateItemCategory, updateExpense, createCategoryLearningTable,
  learnCategoryCorrection, getLearnedCategories, createIncomeSavingsTables,
  // Income and Savings
  saveIncomeSource, getIncomeSources, updateIncomeSource, deleteIncomeSource,
  saveExtraIncome, getExtraIncome, deleteExtraIncome,
  saveSavingsTransaction, getSavingsTransactions, getSavingsBalance,
  saveSavingsGoal, getSavingsGoals, updateSavingsGoal, deleteSavingsGoal,
  // Category Budgets
  saveCategoryBudget, getCategoryBudgets, updateCategoryBudget, deleteCategoryBudget,
  // Recurring Expenses
  saveRecurringExpense, getRecurringExpenses, updateRecurringExpense, deleteRecurringExpense, processRecurringExpenses
} = require('./services/supabaseService');
const { signUp, signIn, signOut, requireAuth } = require('./services/authService');
const { saveSubscription, sendPushToUser, createPushSubscriptionsTable } = require('./services/notificationService');

const app = express();
const PORT = process.env.PORT || 5000;

// Enhanced CORS configuration for development (allows network access)
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // In production, you might want to restrict origins
    callback(null, true);
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

app.use(express.json());

// Add request logging for debugging
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} from ${req.ip}`);
  next();
});

// Authentication endpoints
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await signUp(email, password, { fullName });

    res.json({
      success: true,
      user: result.user,
      session: result.session,
      message: 'User created successfully'
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(400).json({
      error: 'Signup failed',
      details: error.message
    });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await signIn(email, password);

    res.json({
      success: true,
      user: result.user,
      session: result.session,
      message: 'Signed in successfully'
    });

  } catch (error) {
    console.error('Signin error:', error);
    res.status(401).json({
      error: 'Login failed',
      details: error.message
    });
  }
});

app.post('/api/auth/signout', async (req, res) => {
  try {
    await signOut();

    res.json({
      success: true,
      message: 'Signed out successfully'
    });

  } catch (error) {
    console.error('Signout error:', error);
    res.status(500).json({
      error: 'Signout failed',
      details: error.message
    });
  }
});

// Notification endpoints
app.post('/api/notifications/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }

    const result = await saveSubscription(req.user.id, subscription, req.token);

    res.json({
      success: true,
      subscription: result,
      message: 'Subscription saved successfully'
    });

  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({
      error: 'Failed to save subscription',
      details: error.message
    });
  }
});

app.post('/api/notifications/test', requireAuth, async (req, res) => {
  try {
    const payload = {
      title: 'Test Notification',
      body: 'This is a test notification from Expense Logger!',
      icon: '/icon-192.svg',
      data: {
        url: '/'
      }
    };

    const result = await sendPushToUser(req.user.id, payload, req.token);

    res.json({
      success: true,
      result: result,
      message: 'Test notification sent'
    });

  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({
      error: 'Failed to send test notification',
      details: error.message
    });
  }
});

// Use memory storage for Vercel compatibility
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: (_, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG) and PDF files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Parse manual entry text without saving (for review modal)
app.post('/api/parse-manual-entry', requireAuth, async (req, res) => {
  try {
    const { textEntry } = req.body;

    if (!textEntry || typeof textEntry !== 'string') {
      return res.status(400).json({ error: 'Text entry is required' });
    }

    console.log('Parsing manual entry (no save)...');
    const parsedExpenses = await parseManualEntry(textEntry);

    // Return parsed data without saving - user will review and save via /api/expenses
    res.json({
      success: true,
      count: parsedExpenses.length,
      expenses: parsedExpenses.map(exp => ({
        expenseData: exp,
        expense: exp
      }))
    });

  } catch (error) {
    console.error('Error parsing manual entry:', error);
    res.status(500).json({
      error: 'Failed to parse manual entry',
      details: error.message
    });
  }
});

// Legacy endpoint that parses AND saves (kept for backwards compatibility)
app.post('/api/manual-entry', requireAuth, async (req, res) => {
  try {
    const { textEntry } = req.body;

    if (!textEntry || typeof textEntry !== 'string') {
      return res.status(400).json({ error: 'Text entry is required' });
    }

    console.log('Processing manual entry...');
    const parsedExpenses = await parseManualEntry(textEntry);

    // Save each expense to database
    const savedExpenses = [];
    for (const expenseData of parsedExpenses) {
      console.log('Saving manual expense to database...');
      const savedExpense = await saveExpense({
        ...expenseData,
        originalFilename: null,
        driveFileId: null,
        uploadDate: new Date().toISOString()
      }, req.user.id, req.token);

      savedExpenses.push({
        expenseId: savedExpense.id,
        expenseData,
        expense: savedExpense
      });

      // Send push notification
      try {
        const notificationPayload = {
          title: 'Manual Entry Added!',
          body: `${expenseData.merchantName} - $${expenseData.totalAmount}`,
          icon: '/icon-192.svg',
          badge: '/icon-192.svg',
          tag: `expense-${savedExpense.id}`,
          data: {
            url: '/',
            expenseId: savedExpense.id
          }
        };
        await sendPushToUser(req.user.id, notificationPayload, req.token);
      } catch (notifError) {
        console.warn('⚠️  Failed to send push notification:', notifError.message);
      }
    }

    res.json({
      success: true,
      count: savedExpenses.length,
      expenses: savedExpenses,
      message: `${savedExpenses.length} expense(s) added successfully`
    });

  } catch (error) {
    console.error('Error processing manual entry:', error);
    res.status(500).json({
      error: 'Failed to process manual entry',
      details: error.message
    });
  }
});

// Create expense directly (for manual expense form)
app.post('/api/expenses', requireAuth, async (req, res) => {
  try {
    const expenseData = req.body;

    // Validate required fields
    if (!expenseData.date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    if (!expenseData.totalAmount || expenseData.totalAmount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    console.log('Creating manual expense...');
    const savedExpense = await saveExpense({
      ...expenseData,
      originalFilename: null,
      driveFileId: null,
      uploadDate: new Date().toISOString()
    }, req.user.id, req.token);

    // Send push notification
    try {
      const notificationPayload = {
        title: 'Expense Added!',
        body: `${expenseData.merchantName || expenseData.description} - $${expenseData.totalAmount}`,
        icon: '/icon-192.svg',
        badge: '/icon-192.svg',
        tag: `expense-${savedExpense.id}`,
        data: {
          url: '/',
          expenseId: savedExpense.id
        }
      };
      await sendPushToUser(req.user.id, notificationPayload, req.token);
    } catch (notifError) {
      console.warn('⚠️  Failed to send push notification:', notifError.message);
    }

    res.json({
      success: true,
      expenseId: savedExpense.id,
      expense: savedExpense,
      message: 'Expense added successfully'
    });

  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({
      error: 'Failed to create expense',
      details: error.message
    });
  }
});

// Category Learning endpoints
app.post('/api/category-learning', requireAuth, async (req, res) => {
  try {
    const { merchantName, description, category } = req.body;

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    const result = await learnCategoryCorrection(
      req.user.id,
      merchantName,
      description,
      category
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error learning category:', error);
    res.status(500).json({
      error: 'Failed to learn category correction',
      details: error.message
    });
  }
});

app.get('/api/category-learning', requireAuth, async (req, res) => {
  try {
    const learned = await getLearnedCategories(req.user.id);

    res.json({
      success: true,
      data: learned
    });
  } catch (error) {
    console.error('Error getting learned categories:', error);
    res.status(500).json({
      error: 'Failed to get learned categories',
      details: error.message
    });
  }
});

app.post('/api/ai/coach', requireAuth, async (req, res) => {
  try {
    const { conversation, analysis } = req.body || {};

    if (!analysis) {
      return res.status(400).json({ error: 'Analysis data is required' });
    }

    const result = await generateCoachInsights({
      conversation,
      analysis: {
        ...analysis,
        userId: req.user?.id || null,
        generatedAt: new Date().toISOString()
      }
    });

    res.json({
      success: true,
      message: result.message,
      usage: result.usage || null
    });
  } catch (error) {
    console.error('AI coach error:', error);
    res.status(500).json({
      error: 'Failed to generate AI coach insights',
      details: error.message
    });
  }
});

app.post('/api/upload-receipt', requireAuth, upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const originalFilename = req.file.originalname;
    const mimeType = req.file.mimetype;

    console.log('Processing receipt with AI...');
    const expenseData = await processReceiptWithAI(fileBuffer, originalFilename, mimeType);

    console.log('Uploading to Google Drive...');
    let driveFileId = null;
    try {
      driveFileId = await uploadToGoogleDrive(fileBuffer, originalFilename, mimeType, req.user.email);
    } catch (driveError) {
      console.warn('⚠️  Google Drive upload failed, continuing without it:', driveError.message);
      driveFileId = 'drive_upload_failed';
    }

    console.log('Saving expense to database...');
    const savedExpense = await saveExpense({
      ...expenseData,
      originalFilename: originalFilename,
      driveFileId: driveFileId,
      uploadDate: new Date().toISOString()
    }, req.user.id, req.token);

    // Send push notification for successful receipt processing
    try {
      const notificationPayload = {
        title: 'Receipt Processed!',
        body: `${expenseData.merchantName || 'Expense'} - $${expenseData.totalAmount || '0.00'}`,
        icon: '/icon-192.svg',
        badge: '/icon-192.svg',
        tag: `expense-${savedExpense.id}`,
        data: {
          url: '/',
          expenseId: savedExpense.id
        }
      };
      await sendPushToUser(req.user.id, notificationPayload, req.token);
    } catch (notifError) {
      console.warn('⚠️  Failed to send push notification:', notifError.message);
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      expense: savedExpense,
      message: 'Receipt processed successfully'
    });

  } catch (error) {
    console.error('Error processing receipt:', error);

    res.status(500).json({
      error: 'Failed to process receipt',
      details: error.message
    });
  }
});

app.get('/api/expenses', requireAuth, async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(Number.isFinite(requestedLimit) ? Math.max(requestedLimit, 1) : 1000, 10000);
    const requestedOffset = Number.parseInt(req.query.offset, 10);
    const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

    const expenses = await getExpenses(req.user.id, limit, offset, req.token);
    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

app.get('/api/expenses/summary', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const expenses = await getExpenses(req.user.id, 10000, 0, req.token);

    // Filter by date range if provided
    let filteredExpenses = expenses;
    if (startDate || endDate) {
      filteredExpenses = expenses.filter(expense => {
        const expenseDate = expense.date ? new Date(expense.date) : null;
        if (!expenseDate) return false;

        if (startDate && expenseDate < new Date(startDate)) return false;
        if (endDate && expenseDate > new Date(endDate)) return false;

        return true;
      });
    }

    // Calculate totals by category
    const categoryTotals = {
      Food: 0,
      Transport: 0,
      Shopping: 0,
      Bills: 0,
      Other: 0
    };

    // Calculate item-level category totals
    const itemCategoryTotals = {
      Food: 0,
      Transport: 0,
      Shopping: 0,
      Bills: 0,
      Other: 0
    };

    // Build detailed items list for Excel-like view
    const detailedItems = [];

    let totalSpending = 0;

    filteredExpenses.forEach(expense => {
      const amount = expense.totalAmount || 0;
      totalSpending += amount;

      // Receipt-level category
      const category = expense.category || 'Other';
      categoryTotals[category] = (categoryTotals[category] || 0) + amount;

      // Item-level categories and detailed items
      if (expense.items && Array.isArray(expense.items)) {
        expense.items.forEach(item => {
          const itemCategory = item.category || 'Other';
          const itemPrice = item.totalPrice || item.unitPrice || 0;
          itemCategoryTotals[itemCategory] = (itemCategoryTotals[itemCategory] || 0) + itemPrice;

          // Add to detailed items list
          detailedItems.push({
            date: expense.date,
            merchantName: expense.merchantName || 'Unknown',
            category: itemCategory,
            description: item.description || 'Unknown Item',
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || itemPrice,
            totalPrice: itemPrice
          });
        });
      } else {
        // If no items, add the expense itself as a single item
        detailedItems.push({
          date: expense.date,
          merchantName: expense.merchantName || 'Unknown',
          category: category,
          description: expense.merchantName || 'Expense',
          quantity: 1,
          unitPrice: amount,
          totalPrice: amount
        });
      }
    });

    // Sort detailed items by date (newest first)
    detailedItems.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(0);
      const dateB = b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });

    res.json({
      totalSpending,
      expenseCount: filteredExpenses.length,
      dateRange: {
        start: startDate || null,
        end: endDate || null
      },
      categoryTotals,
      itemCategoryTotals,
      averageExpense: filteredExpenses.length > 0 ? totalSpending / filteredExpenses.length : 0,
      detailedItems: detailedItems
    });

  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

app.patch('/api/expenses/:id/category', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { category } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Expense ID is required' });
    }

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    console.log(`Updating expense ${id} category to ${category}...`);
    const result = await updateExpenseCategory(id, category, req.user.id, req.token);

    res.json({
      success: true,
      expense: result,
      message: 'Category updated successfully'
    });

  } catch (error) {
    console.error('Error updating expense category:', error);
    res.status(500).json({
      error: 'Failed to update category',
      details: error.message
    });
  }
});

app.patch('/api/expenses/:expenseId/items/:itemIndex/category', requireAuth, async (req, res) => {
  try {
    const { expenseId, itemIndex } = req.params;
    const { category } = req.body;

    if (!expenseId) {
      return res.status(400).json({ error: 'Expense ID is required' });
    }

    if (itemIndex === undefined || itemIndex === null) {
      return res.status(400).json({ error: 'Item index is required' });
    }

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    const itemIndexNum = parseInt(itemIndex, 10);
    if (isNaN(itemIndexNum)) {
      return res.status(400).json({ error: 'Item index must be a number' });
    }

    console.log(`Updating expense ${expenseId} item ${itemIndexNum} category to ${category}...`);
    const result = await updateItemCategory(expenseId, itemIndexNum, category, req.user.id, req.token);

    res.json({
      success: true,
      expense: result,
      message: 'Item category updated successfully'
    });

  } catch (error) {
    console.error('Error updating item category:', error);
    res.status(500).json({
      error: 'Failed to update item category',
      details: error.message
    });
  }
});

app.patch('/api/expenses/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Expense ID is required' });
    }

    console.log(`Updating expense ${id}...`, updates);

    // Get the current expense
    const expense = await getExpenseById(id, req.user.id, req.token);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Merge updates
    const updatedExpense = { ...expense, ...updates };

    const result = await updateExpense(id, updatedExpense, req.user.id, req.token);

    res.json({
      success: true,
      expense: result,
      message: 'Expense updated successfully'
    });

  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({
      error: 'Failed to update expense',
      details: error.message
    });
  }
});

app.patch('/api/expenses/:expenseId/items/:itemIndex', requireAuth, async (req, res) => {
  try {
    const { expenseId, itemIndex } = req.params;
    const updates = req.body;

    if (!expenseId) {
      return res.status(400).json({ error: 'Expense ID is required' });
    }

    if (itemIndex === undefined || itemIndex === null) {
      return res.status(400).json({ error: 'Item index is required' });
    }

    const itemIndexNum = parseInt(itemIndex, 10);
    if (isNaN(itemIndexNum)) {
      return res.status(400).json({ error: 'Item index must be a number' });
    }

    console.log(`Updating expense ${expenseId} item ${itemIndexNum}...`, updates);

    // Get the current expense
    const expense = await getExpenseById(expenseId, req.user.id, req.token);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (!expense.items || !Array.isArray(expense.items)) {
      return res.status(400).json({ error: 'Expense has no items' });
    }

    if (itemIndexNum < 0 || itemIndexNum >= expense.items.length) {
      return res.status(400).json({ error: 'Item index out of range' });
    }

    // Update the specific item
    expense.items[itemIndexNum] = {
      ...expense.items[itemIndexNum],
      ...updates
    };

    // Save the updated expense
    const result = await updateExpense(expenseId, expense, req.user.id, req.token);

    res.json({
      success: true,
      expense: result,
      message: 'Item updated successfully'
    });

  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({
      error: 'Failed to update item',
      details: error.message
    });
  }
});

app.delete('/api/expenses/:expenseId/items/:itemIndex', requireAuth, async (req, res) => {
  try {
    const { expenseId, itemIndex } = req.params;

    if (!expenseId) {
      return res.status(400).json({ error: 'Expense ID is required' });
    }

    if (itemIndex === undefined || itemIndex === null) {
      return res.status(400).json({ error: 'Item index is required' });
    }

    const itemIndexNum = parseInt(itemIndex, 10);
    if (isNaN(itemIndexNum)) {
      return res.status(400).json({ error: 'Item index must be a number' });
    }

    console.log(`Deleting expense ${expenseId} item ${itemIndexNum}...`);

    // Get the current expense
    const expense = await getExpenseById(expenseId, req.user.id, req.token);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (!expense.items || !Array.isArray(expense.items)) {
      return res.status(400).json({ error: 'Expense has no items' });
    }

    if (itemIndexNum < 0 || itemIndexNum >= expense.items.length) {
      return res.status(400).json({ error: 'Item index out of range' });
    }

    // Remove the item
    expense.items.splice(itemIndexNum, 1);

    // If no items left, delete the entire expense
    if (expense.items.length === 0) {
      console.log('No items left, deleting entire expense...');
      await deleteExpense(expenseId, req.user.id, req.token);

      // Delete from Google Drive if file exists
      if (expense.driveFileId) {
        try {
          await deleteFromGoogleDrive(expense.driveFileId);
        } catch (driveError) {
          console.warn('⚠️  Google Drive deletion failed:', driveError.message);
        }
      }

      return res.json({
        success: true,
        message: 'Item deleted and expense removed (no items remaining)',
        expenseDeleted: true
      });
    }

    // Save the updated expense
    const result = await updateExpense(expenseId, expense, req.user.id, req.token);

    res.json({
      success: true,
      expense: result,
      message: 'Item deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({
      error: 'Failed to delete item',
      details: error.message
    });
  }
});

app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Expense ID is required' });
    }

    // Get expense data first to retrieve Google Drive file ID
    console.log('Fetching expense details for deletion...');
    const expense = await getExpenseById(id, req.user.id, req.token);

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    console.log('Deleting expense from database...');
    await deleteExpense(id, req.user.id, req.token);

    // Delete from Google Drive if file exists
    if (expense.driveFileId) {
      console.log('Deleting file from Google Drive...');
      try {
        await deleteFromGoogleDrive(expense.driveFileId);
      } catch (driveError) {
        console.warn('⚠️  Google Drive deletion failed, but continuing:', driveError.message);
        // Don't fail the entire operation if Google Drive deletion fails
      }
    }

    res.json({
      success: true,
      message: 'Expense and receipt deleted successfully',
      id: id,
      driveFileDeleted: !!expense.driveFileId
    });

  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({
      error: 'Failed to delete expense',
      details: error.message
    });
  }
});

// ============================================================
// INCOME SOURCES ENDPOINTS
// ============================================================

// Get all income sources for user (optionally filtered by month)
app.get('/api/income-sources', requireAuth, async (req, res) => {
  try {
    const { month } = req.query;
    const incomeSources = await getIncomeSources(req.user.id, month || null, req.token);
    res.json(incomeSources);
  } catch (error) {
    console.error('Error fetching income sources:', error);
    res.status(500).json({ error: 'Failed to fetch income sources', details: error.message });
  }
});

// Create a new income source
app.post('/api/income-sources', requireAuth, async (req, res) => {
  try {
    const incomeData = req.body;

    if (!incomeData.sourceName || !incomeData.amount || !incomeData.month) {
      return res.status(400).json({ error: 'Source name, amount, and month are required' });
    }

    const result = await saveIncomeSource(incomeData, req.user.id, req.token);

    res.json({
      success: true,
      incomeSource: result,
      message: 'Income source added successfully'
    });
  } catch (error) {
    console.error('Error creating income source:', error);
    res.status(500).json({ error: 'Failed to create income source', details: error.message });
  }
});

// Update an income source
app.patch('/api/income-sources/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Income source ID is required' });
    }

    const result = await updateIncomeSource(id, updates, req.user.id, req.token);

    res.json({
      success: true,
      incomeSource: result,
      message: 'Income source updated successfully'
    });
  } catch (error) {
    console.error('Error updating income source:', error);
    res.status(500).json({ error: 'Failed to update income source', details: error.message });
  }
});

// Delete an income source
app.delete('/api/income-sources/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Income source ID is required' });
    }

    await deleteIncomeSource(id, req.user.id, req.token);

    res.json({
      success: true,
      message: 'Income source deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting income source:', error);
    res.status(500).json({ error: 'Failed to delete income source', details: error.message });
  }
});

// ============================================================
// EXTRA INCOME ENDPOINTS
// ============================================================

// Get extra income entries (optionally filtered by date range)
app.get('/api/extra-income', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const extraIncome = await getExtraIncome(req.user.id, startDate || null, endDate || null, req.token);
    res.json(extraIncome);
  } catch (error) {
    console.error('Error fetching extra income:', error);
    res.status(500).json({ error: 'Failed to fetch extra income', details: error.message });
  }
});

// Create a new extra income entry
app.post('/api/extra-income', requireAuth, async (req, res) => {
  try {
    const incomeData = req.body;

    if (!incomeData.description || !incomeData.amount || !incomeData.date || !incomeData.destination) {
      return res.status(400).json({ error: 'Description, amount, date, and destination are required' });
    }

    if (!['budget', 'savings'].includes(incomeData.destination)) {
      return res.status(400).json({ error: 'Destination must be either "budget" or "savings"' });
    }

    const result = await saveExtraIncome(incomeData, req.user.id, req.token);

    // If destination is savings, also create a savings transaction
    if (incomeData.destination === 'savings') {
      await saveSavingsTransaction({
        amount: incomeData.amount,
        transactionType: 'deposit',
        source: 'extra_income',
        description: `Extra income: ${incomeData.description}`,
        date: incomeData.date
      }, req.user.id, req.token);
    }

    res.json({
      success: true,
      extraIncome: result,
      message: 'Extra income added successfully'
    });
  } catch (error) {
    console.error('Error creating extra income:', error);
    res.status(500).json({ error: 'Failed to create extra income', details: error.message });
  }
});

// Delete an extra income entry
app.delete('/api/extra-income/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Extra income ID is required' });
    }

    await deleteExtraIncome(id, req.user.id, req.token);

    res.json({
      success: true,
      message: 'Extra income deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting extra income:', error);
    res.status(500).json({ error: 'Failed to delete extra income', details: error.message });
  }
});

// ============================================================
// SAVINGS ENDPOINTS
// ============================================================

// Get savings balance
app.get('/api/savings/balance', requireAuth, async (req, res) => {
  try {
    const balance = await getSavingsBalance(req.user.id, req.token);
    res.json(balance);
  } catch (error) {
    console.error('Error fetching savings balance:', error);
    res.status(500).json({ error: 'Failed to fetch savings balance', details: error.message });
  }
});

// Get savings transactions
app.get('/api/savings/transactions', requireAuth, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const transactions = await getSavingsTransactions(
      req.user.id,
      parseInt(limit),
      parseInt(offset),
      req.token
    );
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching savings transactions:', error);
    res.status(500).json({ error: 'Failed to fetch savings transactions', details: error.message });
  }
});

// Create a savings transaction (deposit or withdrawal)
app.post('/api/savings/transactions', requireAuth, async (req, res) => {
  try {
    const transactionData = req.body;

    if (!transactionData.amount || !transactionData.transactionType || !transactionData.source || !transactionData.date) {
      return res.status(400).json({ error: 'Amount, transaction type, source, and date are required' });
    }

    if (!['deposit', 'withdrawal'].includes(transactionData.transactionType)) {
      return res.status(400).json({ error: 'Transaction type must be either "deposit" or "withdrawal"' });
    }

    const result = await saveSavingsTransaction(transactionData, req.user.id, req.token);

    res.json({
      success: true,
      transaction: result,
      message: 'Savings transaction recorded successfully'
    });
  } catch (error) {
    console.error('Error creating savings transaction:', error);
    res.status(500).json({ error: 'Failed to create savings transaction', details: error.message });
  }
});

// ============================================================
// SAVINGS GOALS ENDPOINTS
// ============================================================

// Get all savings goals
app.get('/api/savings/goals', requireAuth, async (req, res) => {
  try {
    const { includeCompleted } = req.query;
    const goals = await getSavingsGoals(req.user.id, includeCompleted === 'true', req.token);
    res.json(goals);
  } catch (error) {
    console.error('Error fetching savings goals:', error);
    res.status(500).json({ error: 'Failed to fetch savings goals', details: error.message });
  }
});

// Create a new savings goal
app.post('/api/savings/goals', requireAuth, async (req, res) => {
  try {
    const goalData = req.body;

    if (!goalData.goalName || !goalData.targetAmount) {
      return res.status(400).json({ error: 'Goal name and target amount are required' });
    }

    const result = await saveSavingsGoal(goalData, req.user.id, req.token);

    res.json({
      success: true,
      goal: result,
      message: 'Savings goal created successfully'
    });
  } catch (error) {
    console.error('Error creating savings goal:', error);
    res.status(500).json({ error: 'Failed to create savings goal', details: error.message });
  }
});

// Update a savings goal
app.patch('/api/savings/goals/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Goal ID is required' });
    }

    const result = await updateSavingsGoal(id, updates, req.user.id, req.token);

    res.json({
      success: true,
      goal: result,
      message: 'Savings goal updated successfully'
    });
  } catch (error) {
    console.error('Error updating savings goal:', error);
    res.status(500).json({ error: 'Failed to update savings goal', details: error.message });
  }
});

// Delete a savings goal
app.delete('/api/savings/goals/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Goal ID is required' });
    }

    await deleteSavingsGoal(id, req.user.id, req.token);

    res.json({
      success: true,
      message: 'Savings goal deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting savings goal:', error);
    res.status(500).json({ error: 'Failed to delete savings goal', details: error.message });
  }
});

// ============================================================
// CATEGORY BUDGETS ENDPOINTS
// ============================================================

// Get all category budgets for user
app.get('/api/category-budgets', requireAuth, async (req, res) => {
  try {
    const budgets = await getCategoryBudgets(req.user.id, req.token);
    res.json(budgets);
  } catch (error) {
    console.error('Error fetching category budgets:', error);
    res.status(500).json({ error: 'Failed to fetch category budgets', details: error.message });
  }
});

// Create or update category budget
app.post('/api/category-budgets', requireAuth, async (req, res) => {
  try {
    const budgetData = req.body;

    if (!budgetData.category || !budgetData.monthly_limit) {
      return res.status(400).json({ error: 'Category and monthly_limit are required' });
    }

    const result = await saveCategoryBudget(budgetData, req.user.id, req.token);

    res.json({
      success: true,
      budget: result,
      message: 'Category budget saved successfully'
    });
  } catch (error) {
    console.error('Error saving category budget:', error);
    res.status(500).json({ error: 'Failed to save category budget', details: error.message });
  }
});

// Update category budget
app.patch('/api/category-budgets/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const budgetData = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Budget ID is required' });
    }

    const result = await updateCategoryBudget(id, budgetData, req.user.id, req.token);

    res.json({
      success: true,
      budget: result,
      message: 'Category budget updated successfully'
    });
  } catch (error) {
    console.error('Error updating category budget:', error);
    res.status(500).json({ error: 'Failed to update category budget', details: error.message });
  }
});

// Delete category budget
app.delete('/api/category-budgets/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Budget ID is required' });
    }

    await deleteCategoryBudget(id, req.user.id, req.token);

    res.json({
      success: true,
      message: 'Category budget deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting category budget:', error);
    res.status(500).json({ error: 'Failed to delete category budget', details: error.message });
  }
});

// ============================================================
// RECURRING EXPENSES ENDPOINTS
// ============================================================

// Get all recurring expenses for user
app.get('/api/recurring-expenses', requireAuth, async (req, res) => {
  try {
    const recurringExpenses = await getRecurringExpenses(req.user.id, req.token);
    res.json(recurringExpenses);
  } catch (error) {
    console.error('Error fetching recurring expenses:', error);
    res.status(500).json({ error: 'Failed to fetch recurring expenses', details: error.message });
  }
});

// Create recurring expense
app.post('/api/recurring-expenses', requireAuth, async (req, res) => {
  try {
    const recurringData = req.body;

    if (!recurringData.merchant_name || !recurringData.amount || !recurringData.category || !recurringData.payment_day) {
      return res.status(400).json({ error: 'Merchant name, amount, category, and payment day are required' });
    }

    const result = await saveRecurringExpense(recurringData, req.user.id, req.token);

    res.json({
      success: true,
      recurringExpense: result,
      message: 'Recurring expense created successfully'
    });
  } catch (error) {
    console.error('Error creating recurring expense:', error);
    res.status(500).json({ error: 'Failed to create recurring expense', details: error.message });
  }
});

// Update recurring expense
app.patch('/api/recurring-expenses/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const recurringData = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Recurring expense ID is required' });
    }

    const result = await updateRecurringExpense(id, recurringData, req.user.id, req.token);

    res.json({
      success: true,
      recurringExpense: result,
      message: 'Recurring expense updated successfully'
    });
  } catch (error) {
    console.error('Error updating recurring expense:', error);
    res.status(500).json({ error: 'Failed to update recurring expense', details: error.message });
  }
});

// Delete recurring expense
app.delete('/api/recurring-expenses/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Recurring expense ID is required' });
    }

    await deleteRecurringExpense(id, req.user.id, req.token);

    res.json({
      success: true,
      message: 'Recurring expense deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting recurring expense:', error);
    res.status(500).json({ error: 'Failed to delete recurring expense', details: error.message });
  }
});

// Process recurring expenses (can be called manually or via cron)
app.post('/api/recurring-expenses/process', requireAuth, async (req, res) => {
  try {
    const processedExpenses = await processRecurringExpenses(req.token);

    // Send notifications for each processed expense
    for (const { recurringExpense, createdExpense } of processedExpenses) {
      try {
        await sendPushToUser(
          req.user.id,
          {
            title: 'Recurring Expense Added',
            body: `${recurringExpense.merchant_name} - $${recurringExpense.amount} has been automatically added to your expenses.`,
            tag: 'recurring-expense',
            data: {
              url: '/expenses',
              expenseId: createdExpense.id
            }
          },
          req.token
        );
      } catch (notifError) {
        console.error('Error sending notification:', notifError);
      }
    }

    res.json({
      success: true,
      processedCount: processedExpenses.length,
      expenses: processedExpenses,
      message: `Processed ${processedExpenses.length} recurring expense(s)`
    });
  } catch (error) {
    console.error('Error processing recurring expenses:', error);
    res.status(500).json({ error: 'Failed to process recurring expenses', details: error.message });
  }
});

// ============================================================
// ACCOUNTS ENDPOINTS
// ============================================================

// Get all accounts for user
app.get('/api/accounts', requireAuth, async (req, res) => {
  try {
    const { getAccounts } = require('./services/supabaseService');
    const accounts = await getAccounts(req.user.id, req.token);
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts', details: error.message });
  }
});

// Create a new account
app.post('/api/accounts', requireAuth, async (req, res) => {
  try {
    const { saveAccount } = require('./services/supabaseService');
    const accountData = req.body;

    if (!accountData.name || !accountData.type) {
      return res.status(400).json({ error: 'Account name and type are required' });
    }

    const result = await saveAccount(accountData, req.user.id, req.token);

    res.json({
      success: true,
      account: result,
      message: 'Account created successfully'
    });
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Failed to create account', details: error.message });
  }
});

// Update an account
app.patch('/api/accounts/:id', requireAuth, async (req, res) => {
  try {
    const { updateAccount } = require('./services/supabaseService');
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const result = await updateAccount(id, updates, req.user.id, req.token);

    res.json({
      success: true,
      account: result,
      message: 'Account updated successfully'
    });
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account', details: error.message });
  }
});

// Delete an account
app.delete('/api/accounts/:id', requireAuth, async (req, res) => {
  try {
    const { deleteAccount } = require('./services/supabaseService');
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    await deleteAccount(id, req.user.id, req.token);

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account', details: error.message });
  }
});

// ============================================================
// INCOME ENTRIES ENDPOINTS (New unified income)
// ============================================================

// Get all income entries for user
app.get('/api/income', requireAuth, async (req, res) => {
  try {
    const { getIncomeEntries } = require('./services/supabaseService');
    const { startDate, endDate } = req.query;
    const incomeEntries = await getIncomeEntries(req.user.id, startDate || null, endDate || null, req.token);
    res.json(incomeEntries);
  } catch (error) {
    console.error('Error fetching income entries:', error);
    res.status(500).json({ error: 'Failed to fetch income entries', details: error.message });
  }
});

// Create a new income entry
app.post('/api/income', requireAuth, async (req, res) => {
  try {
    const { saveIncomeEntry } = require('./services/supabaseService');
    const incomeData = req.body;

    if (!incomeData.source || !incomeData.amount || !incomeData.date) {
      return res.status(400).json({ error: 'Source, amount, and date are required' });
    }

    const result = await saveIncomeEntry(incomeData, req.user.id, req.token);

    res.json({
      success: true,
      income: result,
      message: 'Income entry added successfully'
    });
  } catch (error) {
    console.error('Error creating income entry:', error);
    res.status(500).json({ error: 'Failed to create income entry', details: error.message });
  }
});

// Update an income entry
app.patch('/api/income/:id', requireAuth, async (req, res) => {
  try {
    const { updateIncomeEntry } = require('./services/supabaseService');
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Income entry ID is required' });
    }

    const result = await updateIncomeEntry(id, updates, req.user.id, req.token);

    res.json({
      success: true,
      income: result,
      message: 'Income entry updated successfully'
    });
  } catch (error) {
    console.error('Error updating income entry:', error);
    res.status(500).json({ error: 'Failed to update income entry', details: error.message });
  }
});

// Delete an income entry
app.delete('/api/income/:id', requireAuth, async (req, res) => {
  try {
    const { deleteIncomeEntry } = require('./services/supabaseService');
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Income entry ID is required' });
    }

    await deleteIncomeEntry(id, req.user.id, req.token);

    res.json({
      success: true,
      message: 'Income entry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting income entry:', error);
    res.status(500).json({ error: 'Failed to delete income entry', details: error.message });
  }
});

// ============================================================
// TRANSFERS ENDPOINTS
// ============================================================

// Get all transfers for user
app.get('/api/transfers', requireAuth, async (req, res) => {
  try {
    const { getTransfers } = require('./services/supabaseService');
    const { startDate, endDate } = req.query;
    const transfers = await getTransfers(req.user.id, startDate || null, endDate || null, req.token);
    res.json(transfers);
  } catch (error) {
    console.error('Error fetching transfers:', error);
    res.status(500).json({ error: 'Failed to fetch transfers', details: error.message });
  }
});

// Create a new transfer
app.post('/api/transfers', requireAuth, async (req, res) => {
  try {
    const { saveTransfer } = require('./services/supabaseService');
    const transferData = req.body;

    if (!transferData.from_account_id || !transferData.to_account_id || !transferData.amount || !transferData.date) {
      return res.status(400).json({ error: 'From account, to account, amount, and date are required' });
    }

    if (transferData.from_account_id === transferData.to_account_id) {
      return res.status(400).json({ error: 'Source and destination accounts must be different' });
    }

    const result = await saveTransfer(transferData, req.user.id, req.token);

    res.json({
      success: true,
      transfer: result,
      message: 'Transfer created successfully'
    });
  } catch (error) {
    console.error('Error creating transfer:', error);
    res.status(500).json({ error: 'Failed to create transfer', details: error.message });
  }
});

// Update a transfer
app.patch('/api/transfers/:id', requireAuth, async (req, res) => {
  try {
    const { updateTransfer } = require('./services/supabaseService');
    const { id } = req.params;
    const updates = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Transfer ID is required' });
    }

    if (updates.from_account_id && updates.to_account_id && updates.from_account_id === updates.to_account_id) {
      return res.status(400).json({ error: 'Source and destination accounts must be different' });
    }

    const result = await updateTransfer(id, updates, req.user.id, req.token);

    res.json({
      success: true,
      transfer: result,
      message: 'Transfer updated successfully'
    });
  } catch (error) {
    console.error('Error updating transfer:', error);
    res.status(500).json({ error: 'Failed to update transfer', details: error.message });
  }
});

// Delete a transfer
app.delete('/api/transfers/:id', requireAuth, async (req, res) => {
  try {
    const { deleteTransfer } = require('./services/supabaseService');
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Transfer ID is required' });
    }

    await deleteTransfer(id, req.user.id, req.token);

    res.json({
      success: true,
      message: 'Transfer deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting transfer:', error);
    res.status(500).json({ error: 'Failed to delete transfer', details: error.message });
  }
});

// ============================================================
// UNIFIED TRANSACTIONS ENDPOINT
// ============================================================

// Get all transactions (expenses, income, transfers) combined
app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const { getAllTransactions } = require('./services/supabaseService');
    const { startDate, endDate, type } = req.query;
    const transactions = await getAllTransactions(req.user.id, startDate || null, endDate || null, type || null, req.token);
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions', details: error.message });
  }
});

app.get('/health', (_, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Centralized error handler to ensure consistent JSON responses
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  const message = err?.message || 'Unexpected server error';
  const status = err?.status || err?.statusCode || 500;

  res.status(status).json({ error: message });
});

async function startServer() {
  try {
    console.log('🚀 Starting Expense Receipt Logger server...');

    // Test Supabase connection
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('❌ Failed to connect to Supabase');
      process.exit(1);
    }

    // Create expenses table if it doesn't exist
    await createExpensesTable();

    // Create push subscriptions table if it doesn't exist
    await createPushSubscriptionsTable();

    // Create category learning table if it doesn't exist
    await createCategoryLearningTable();

    // Check/create income and savings tables
    await createIncomeSavingsTables();

    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Frontend: http://localhost:3000`);
      console.log(`🔧 API: http://localhost:${PORT}`);
      console.log(`❤️  Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
