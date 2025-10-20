const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

// Load environment variables from root .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { processReceiptWithAI, parseManualEntry, generateCoachInsights } = require('../server/services/aiService');
const { uploadToGoogleDrive, deleteFromGoogleDrive } = require('../server/services/googleDriveService');
const { saveExpense, getExpenses, getExpenseById, deleteExpense, testConnection, createExpensesTable, updateExpenseCategory, updateItemCategory, updateExpense } = require('../server/services/supabaseService');
const { signUp, signIn, signOut, requireAuth } = require('../server/services/authService');

// Try to load notification service, but make it optional
let notificationService = null;
try {
  notificationService = require('../server/services/notificationService');
  console.log('✅ Notification service loaded');
} catch (error) {
  console.warn('⚠️  Notification service not available:', error.message);
}

const app = express();

app.use(cors());
app.use(express.json());

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

// Notification endpoints
app.post('/api/notifications/subscribe', requireAuth, async (req, res) => {
  try {
    if (!notificationService) {
      return res.status(503).json({ error: 'Notification service is not available' });
    }

    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    const result = await notificationService.saveSubscription(req.user.id, subscription, userToken);

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
    if (!notificationService) {
      return res.status(503).json({ error: 'Notification service is not available' });
    }

    const payload = {
      title: 'Test Notification',
      body: 'This is a test notification from Expense Logger!',
      icon: '/icon-192.svg',
      data: {
        url: '/'
      }
    };

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    const result = await notificationService.sendPushToUser(req.user.id, payload, userToken);

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

app.post('/api/ai/coach', requireAuth, async (req, res) => {
  try {
    const { conversation, analysis } = req.body || {};

    if (!analysis) {
      return res.status(400).json({ error: 'Analysis data is required' });
    }

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    const result = await generateCoachInsights({
      conversation,
      analysis: {
        ...analysis,
        userId: req.user?.id || null,
        generatedAt: new Date().toISOString(),
        token: userToken || null
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

app.post('/api/manual-entry', requireAuth, async (req, res) => {
  try {
    const { textEntry } = req.body;

    if (!textEntry || typeof textEntry !== 'string') {
      return res.status(400).json({ error: 'Text entry is required' });
    }

    console.log('Processing manual entry...');
    const parsedExpenses = await parseManualEntry(textEntry);

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    // Save each expense to database
    const savedExpenses = [];
    for (const expenseData of parsedExpenses) {
      console.log('Saving manual expense to database...');
      const expenseId = await saveExpense({
        ...expenseData,
        originalFilename: null,
        driveFileId: null,
        uploadDate: new Date().toISOString()
      }, req.user.id, userToken);

      savedExpenses.push({
        expenseId,
        expenseData
      });

      // Send push notification (optional)
      if (notificationService) {
        try {
          const notificationPayload = {
            title: 'Manual Entry Added!',
            body: `${expenseData.merchantName} - $${expenseData.totalAmount}`,
            icon: '/icon-192.svg',
            badge: '/icon-192.svg',
            tag: `expense-${expenseId}`,
            data: {
              url: '/',
              expenseId: expenseId
            }
          };
          await notificationService.sendPushToUser(req.user.id, notificationPayload, userToken);
        } catch (notifError) {
          console.warn('⚠️  Failed to send push notification:', notifError.message);
        }
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
      // Upload to user-specific Google Drive folder
      driveFileId = await uploadToGoogleDrive(fileBuffer, originalFilename, mimeType, req.user.email);
    } catch (driveError) {
      console.warn('⚠️  Google Drive upload failed, continuing without it:', driveError.message);
      driveFileId = 'drive_upload_failed';
    }

    console.log('Saving expense to database...');
    // Get the access token from the Authorization header
    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null; // Remove "Bearer " prefix

    const expenseId = await saveExpense({
      ...expenseData,
      originalFilename: originalFilename,
      driveFileId: driveFileId,
      uploadDate: new Date().toISOString()
    }, req.user.id, userToken);

    res.json({
      success: true,
      expenseId: expenseId,
      expenseData: expenseData,
      driveFileId: driveFileId,
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
    // Get the access token from the Authorization header
    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null; // Remove "Bearer " prefix

    const expenses = await getExpenses(req.user.id, 50, 0, userToken);
    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

app.get('/api/expenses/summary', requireAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    const expenses = await getExpenses(req.user.id, 10000, 0, userToken);

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
    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    const result = await updateExpenseCategory(id, category, req.user.id, userToken);

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
    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    const result = await updateItemCategory(expenseId, itemIndexNum, category, req.user.id, userToken);

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

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    // Get the current expense
    const expense = await getExpenseById(id, req.user.id, userToken);
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Merge updates
    const updatedExpense = { ...expense, ...updates };

    const result = await updateExpense(id, updatedExpense, req.user.id, userToken);

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

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    // Get the current expense
    const expense = await getExpenseById(expenseId, req.user.id, userToken);
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
    const result = await updateExpense(expenseId, expense, req.user.id, userToken);

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

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    // Get the current expense
    const expense = await getExpenseById(expenseId, req.user.id, userToken);
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
      await deleteExpense(expenseId, req.user.id, userToken);

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
    const result = await updateExpense(expenseId, expense, req.user.id, userToken);

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

    // Get the access token from the Authorization header
    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null; // Remove "Bearer " prefix

    // Get expense data first to retrieve Google Drive file ID
    console.log('Fetching expense details for deletion...');
    const expense = await getExpenseById(id, req.user.id, userToken);

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    console.log('Deleting expense from database...');
    await deleteExpense(id, req.user.id, userToken);

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

app.get('/api/health', (_, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Centralized error handler for serverless deployments
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled API error:', err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  const message = err?.message || 'Unexpected server error';
  const status = err?.status || err?.statusCode || 500;

  res.status(status).json({ error: message });
});

// Initialize database on startup for serverless
async function init() {
  try {
    console.log('🚀 Initializing Expense Receipt Logger API...');

    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('❌ Failed to connect to Supabase');
      return;
    }

    await createExpensesTable();

    if (notificationService) {
      await notificationService.createPushSubscriptionsTable();
    } else {
      console.log('⚠️  Skipping push subscriptions table creation (service not available)');
    }

    console.log('✅ API initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize API:', error);
  }
}

// Initialize on first request (serverless)
let initialized = false;
app.use(async (req, res, next) => {
  if (!initialized) {
    await init();
    initialized = true;
  }
  next();
});

module.exports = app;
