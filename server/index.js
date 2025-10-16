const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { processReceiptWithAI, parseManualEntry } = require('./services/aiService');
const { uploadToGoogleDrive, deleteFromGoogleDrive } = require('./services/googleDriveService');
const { saveExpense, getExpenses, getExpenseById, deleteExpense, testConnection, createExpensesTable, updateExpenseCategory } = require('./services/supabaseService');
const { signUp, signIn, signOut, requireAuth } = require('./services/authService');
const { saveSubscription, sendPushToUser, createPushSubscriptionsTable } = require('./services/notificationService');

const app = express();
const PORT = process.env.PORT || 5000;

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
      const expenseId = await saveExpense({
        ...expenseData,
        originalFilename: null,
        driveFileId: null,
        uploadDate: new Date().toISOString()
      }, req.user.id, req.token);

      savedExpenses.push({
        expenseId,
        expenseData
      });

      // Send push notification
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
    const expenseId = await saveExpense({
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
        tag: `expense-${expenseId}`,
        data: {
          url: '/',
          expenseId: expenseId
        }
      };
      await sendPushToUser(req.user.id, notificationPayload, req.token);
    } catch (notifError) {
      console.warn('⚠️  Failed to send push notification:', notifError.message);
      // Don't fail the request if notification fails
    }

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
    const expenses = await getExpenses(req.user.id, 50, 0, req.token);
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
