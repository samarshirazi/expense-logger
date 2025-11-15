const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

// Load environment variables from root .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { processReceiptWithAI, parseManualEntry, generateCoachInsights } = require('../server/services/aiService');
const { uploadToGoogleDrive, deleteFromGoogleDrive } = require('../server/services/googleDriveService');
const {
  saveExpense,
  getExpenses,
  getExpenseById,
  deleteExpense,
  testConnection,
  createExpensesTable,
  updateExpenseCategory,
  updateItemCategory,
  updateExpense,
  saveCategoryBudget,
  getCategoryBudgets,
  updateCategoryBudget,
  deleteCategoryBudget,
  saveRecurringExpense,
  getRecurringExpenses,
  updateRecurringExpense,
  deleteRecurringExpense,
  processRecurringExpenses
} = require('../server/services/supabaseService');
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

// Default budget values
const DEFAULT_BUDGET = {
  Food: 500,
  Transport: 200,
  Shopping: 300,
  Bills: 400,
  Other: 100
};

// Helper function to calculate category spending for current month
async function calculateCategorySpending(userId, category, userToken) {
  const currentDate = new Date();
  const currentMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  // Get all expenses for current month
  const allExpenses = await getExpenses(userId, userToken);
  const monthExpenses = allExpenses.filter(expense => {
    return expense.date && expense.date.startsWith(currentMonth);
  });

  let categoryTotal = 0;

  // Calculate spending for the specific category
  monthExpenses.forEach(expense => {
    if (expense.items && expense.items.length > 0) {
      expense.items.forEach(item => {
        const itemCategory = item.category || 'Other';
        if (itemCategory === category) {
          categoryTotal += item.totalPrice || 0;
        }
      });
    } else {
      const expenseCategory = expense.category || 'Other';
      if (expenseCategory === category) {
        categoryTotal += expense.totalAmount || 0;
      }
    }
  });

  return categoryTotal;
}

// Helper function to check budget status and return notification message
function getBudgetAlertMessage(category, spending, budget) {
  const percentage = (spending / budget) * 100;

  if (percentage >= 100) {
    return {
      shouldAlert: true,
      message: `⚠️ Budget exceeded! You've spent $${spending.toFixed(2)} of $${budget} in ${category} (${percentage.toFixed(0)}%)`,
      severity: 'critical'
    };
  } else if (percentage >= 80) {
    return {
      shouldAlert: true,
      message: `⚠️ Approaching budget limit! You've spent $${spending.toFixed(2)} of $${budget} in ${category} (${percentage.toFixed(0)}%)`,
      severity: 'warning'
    };
  }

  return {
    shouldAlert: false,
    message: null,
    severity: 'normal'
  };
}

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
    let parsedExpenses = await parseManualEntry(textEntry);

    if (!parsedExpenses || !parsedExpenses.length) {
      console.warn('Manual entry parsing returned no data; attempting fallback parser.');
      parsedExpenses = fallbackManualEntry(textEntry);
    }

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    // Save each expense to database
    const savedExpenses = [];
    for (const expenseData of parsedExpenses) {
      console.log('Saving manual expense to database...');
      const savedExpense = await saveExpense({
        ...expenseData,
        originalFilename: null,
        driveFileId: null,
        uploadDate: new Date().toISOString()
      }, req.user.id, userToken);

      savedExpenses.push({
        expenseId: savedExpense.id,
        expenseData,
        expense: savedExpense
      });

      // Send push notification with budget checking (optional)
      if (notificationService) {
        try {
          // Determine the category for budget checking
          let category = expenseData.category || 'Other';

          // If expense has items, check each item's category
          if (expenseData.items && expenseData.items.length > 0) {
            // For multi-item expenses, check the first item's category or the most expensive
            const mainItem = expenseData.items.reduce((max, item) =>
              (item.totalPrice || 0) > (max.totalPrice || 0) ? item : max
            , expenseData.items[0]);
            category = mainItem.category || 'Other';
          }

          // Calculate current spending for this category
          const currentSpending = await calculateCategorySpending(req.user.id, category, userToken);
          const budget = DEFAULT_BUDGET[category] || 100;
          const budgetAlert = getBudgetAlertMessage(category, currentSpending, budget);

          // Prepare notification payload
          let notificationTitle = 'Manual Entry Added!';
          let notificationBody = `${expenseData.merchantName} - $${expenseData.totalAmount}`;

          // If budget alert is needed, modify the notification
          if (budgetAlert.shouldAlert) {
            notificationTitle = budgetAlert.severity === 'critical'
              ? '🚨 Budget Alert!'
              : '⚠️ Budget Warning!';
            notificationBody = `${expenseData.merchantName} - $${expenseData.totalAmount}\n${budgetAlert.message}`;
          }

          const notificationPayload = {
            title: notificationTitle,
            body: notificationBody,
            icon: '/icon-192.svg',
            badge: '/icon-192.svg',
            tag: `expense-${savedExpense.id}`,
            data: {
              url: '/',
              expenseId: savedExpense.id,
              budgetAlert: budgetAlert.shouldAlert,
              category: category
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

    const savedExpense = await saveExpense({
      ...expenseData,
      originalFilename: originalFilename,
      driveFileId: driveFileId,
      uploadDate: new Date().toISOString()
    }, req.user.id, userToken);

    // Send push notification with budget checking (optional)
    if (notificationService) {
      try {
        // Determine the category for budget checking
        let category = expenseData.category || 'Other';

        // If expense has items, check each item's category
        if (expenseData.items && expenseData.items.length > 0) {
          // For multi-item expenses, check the first item's category or the most expensive
          const mainItem = expenseData.items.reduce((max, item) =>
            (item.totalPrice || 0) > (max.totalPrice || 0) ? item : max
          , expenseData.items[0]);
          category = mainItem.category || 'Other';
        }

        // Calculate current spending for this category
        const currentSpending = await calculateCategorySpending(req.user.id, category, userToken);
        const budget = DEFAULT_BUDGET[category] || 100;
        const budgetAlert = getBudgetAlertMessage(category, currentSpending, budget);

        // Prepare notification payload
        let notificationTitle = 'Receipt Uploaded!';
        let notificationBody = `${expenseData.merchantName} - $${expenseData.totalAmount}`;

        // If budget alert is needed, modify the notification
        if (budgetAlert.shouldAlert) {
          notificationTitle = budgetAlert.severity === 'critical'
            ? '🚨 Budget Alert!'
            : '⚠️ Budget Warning!';
          notificationBody = `${expenseData.merchantName} - $${expenseData.totalAmount}\n${budgetAlert.message}`;
        }

        const notificationPayload = {
          title: notificationTitle,
          body: notificationBody,
          icon: '/icon-192.svg',
          badge: '/icon-192.svg',
          tag: `expense-${savedExpense.id}`,
          data: {
            url: '/',
            expenseId: savedExpense.id,
            budgetAlert: budgetAlert.shouldAlert,
            category: category
          }
        };

        await notificationService.sendPushToUser(req.user.id, notificationPayload, userToken);
      } catch (notifError) {
        console.warn('⚠️  Failed to send push notification:', notifError.message);
      }
    }

    res.json({
      success: true,
      expenseId: savedExpense.id,
      expense: savedExpense,
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

// Create expense directly (for manual expense form)
app.post('/api/expenses', requireAuth, async (req, res) => {
  try {
    const expenseData = req.body;

    // Validate required fields
    if (!expenseData.date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    if (!expenseData.merchantName) {
      return res.status(400).json({ error: 'Merchant name is required' });
    }

    if (expenseData.totalAmount === undefined || expenseData.totalAmount === null) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // Get the access token from the Authorization header
    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    // Prepare expense data (don't include user_id in data, it's passed separately)
    const expenseWithDefaults = {
      ...expenseData,
      currency: expenseData.currency || 'USD',
      category: expenseData.category || 'Other',
      upload_date: new Date().toISOString(),
      originalFilename: null,
      driveFileId: null
    };

    console.log('Creating manual expense for user:', req.user.id);

    const expense = await saveExpense(expenseWithDefaults, req.user.id, userToken);

    res.status(201).json({
      success: true,
      expense
    });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({
      error: 'Failed to create expense',
      details: error.message
    });
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

// ============================================================
// CATEGORY BUDGETS ENDPOINTS
// ============================================================

app.get('/api/category-budgets', requireAuth, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;
    const budgets = await getCategoryBudgets(req.user.id, userToken);
    res.json(budgets);
  } catch (error) {
    console.error('Error fetching category budgets:', error);
    res.status(500).json({ error: 'Failed to fetch category budgets', details: error.message });
  }
});

app.post('/api/category-budgets', requireAuth, async (req, res) => {
  try {
    const budgetData = req.body;

    const monthlyLimit = Number(budgetData.monthly_limit);
    if (!budgetData.category || !Number.isFinite(monthlyLimit) || monthlyLimit <= 0) {
      return res.status(400).json({ error: 'Category and a positive monthly_limit are required' });
    }

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;
    const normalizedBudget = {
      ...budgetData,
      monthly_limit: monthlyLimit
    };

    const result = await saveCategoryBudget(normalizedBudget, req.user.id, userToken);

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

app.patch('/api/category-budgets/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const budgetData = { ...req.body };

    if (!id) {
      return res.status(400).json({ error: 'Budget ID is required' });
    }

    if (budgetData.monthly_limit !== undefined && budgetData.monthly_limit !== null) {
      const parsedLimit = Number(budgetData.monthly_limit);
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        return res.status(400).json({ error: 'monthly_limit must be a positive number' });
      }
      budgetData.monthly_limit = parsedLimit;
    }

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;
    const result = await updateCategoryBudget(id, budgetData, req.user.id, userToken);

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

app.delete('/api/category-budgets/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Budget ID is required' });
    }

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;
    await deleteCategoryBudget(id, req.user.id, userToken);

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

app.get('/api/recurring-expenses', requireAuth, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;
    const recurringExpenses = await getRecurringExpenses(req.user.id, userToken);
    res.json(recurringExpenses);
  } catch (error) {
    console.error('Error fetching recurring expenses:', error);
    res.status(500).json({ error: 'Failed to fetch recurring expenses', details: error.message });
  }
});

app.post('/api/recurring-expenses', requireAuth, async (req, res) => {
  try {
    const recurringData = req.body;

    const amount = Number(recurringData.amount);
    const paymentDay = parseInt(recurringData.payment_day, 10);

    if (
      !recurringData.merchant_name ||
      !recurringData.category ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(paymentDay) ||
      paymentDay < 1 ||
      paymentDay > 31
    ) {
      return res.status(400).json({
        error: 'Merchant name, category, amount (> 0), and payment_day (1-31) are required'
      });
    }

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;

    const normalizedRecurring = {
      ...recurringData,
      amount,
      payment_day: paymentDay
    };

    const result = await saveRecurringExpense(normalizedRecurring, req.user.id, userToken);

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

app.patch('/api/recurring-expenses/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (!id) {
      return res.status(400).json({ error: 'Recurring expense ID is required' });
    }

    if (updates.amount !== undefined && updates.amount !== null) {
      const parsedAmount = Number(updates.amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }
      updates.amount = parsedAmount;
    }

    if (updates.payment_day !== undefined && updates.payment_day !== null) {
      const parsedPaymentDay = parseInt(updates.payment_day, 10);
      if (!Number.isFinite(parsedPaymentDay) || parsedPaymentDay < 1 || parsedPaymentDay > 31) {
        return res.status(400).json({ error: 'payment_day must be between 1 and 31' });
      }
      updates.payment_day = parsedPaymentDay;
    }

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;
    const result = await updateRecurringExpense(id, updates, req.user.id, userToken);

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

app.delete('/api/recurring-expenses/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Recurring expense ID is required' });
    }

    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;
    await deleteRecurringExpense(id, req.user.id, userToken);

    res.json({
      success: true,
      message: 'Recurring expense deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting recurring expense:', error);
    res.status(500).json({ error: 'Failed to delete recurring expense', details: error.message });
  }
});

app.post('/api/recurring-expenses/process', requireAuth, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const userToken = authHeader ? authHeader.substring(7) : null;
    const processedExpenses = await processRecurringExpenses(userToken);

    if (notificationService) {
      for (const { recurringExpense, createdExpense } of processedExpenses) {
        try {
          await notificationService.sendPushToUser(
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
            userToken
          );
        } catch (notifError) {
          console.warn('⚠️  Failed to send recurring expense notification:', notifError.message);
        }
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


function fallbackManualEntry(textEntry) {
  if (!textEntry || typeof textEntry !== 'string') {
    return null;
  }

  const segments = textEntry
    .split(/\n+|,|;/)
    .map(part => part.trim())
    .filter(Boolean);

  const items = [];

  segments.forEach(segment => {
    const amountMatch = segment.match(/(-?\$?\d+(?:\.\d+)?)/);
    if (!amountMatch) {
      return;
    }

    const rawAmount = amountMatch[0].replace(/\$/g, '');
    const amount = parseFloat(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    let description = segment.replace(amountMatch[0], '').replace(/\$/g, '').trim();
    if (!description) {
      description = 'Manual item';
    }

    const category = categorizeDescription(description);

    items.push({
      description,
      quantity: 1,
      unitPrice: amount,
      totalPrice: amount,
      category
    });
  });

  if (!items.length) {
    return null;
  }

  const totalAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  const merchantName = items.length === 1 ? items[0].description : 'Manual Entry';

  const now = new Date();
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return [{
    merchantName,
    date: todayDateStr,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    currency: 'USD',
    category: determineOverallCategory(merchantName, items),
    items,
    paymentMethod: 'Manual Entry',
    taxAmount: null,
    tipAmount: null
  }];
}

function categorizeDescription(description) {
  const text = (description || '').toLowerCase();

  const keywordGroups = {
    Food: ['coffee', 'lunch', 'dinner', 'breakfast', 'meal', 'grocer', 'restaurant', 'cafe', 'snack', 'pizza', 'burger', 'taco', 'salad'],
    Transport: ['uber', 'lyft', 'gas', 'fuel', 'parking', 'toll', 'metro', 'bus', 'train', 'ride'],
    Shopping: ['amazon', 'shop', 'store', 'mall', 'clothes', 'electronics', 'gift', 'appliance', 'retail', 'purchase'],
    Bills: ['bill', 'utility', 'internet', 'phone', 'subscription', 'rent', 'electric', 'water', 'insurance']
  };

  for (const [category, keywords] of Object.entries(keywordGroups)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return category;
    }
  }

  return 'Other';
}

function determineOverallCategory(merchantName, items) {
  const counts = {
    Food: 0,
    Transport: 0,
    Shopping: 0,
    Bills: 0,
    Other: 0
  };

  items.forEach(item => {
    const key = item.category || categorizeDescription(item.description) || 'Other';
    counts[key] = (counts[key] || 0) + 1;
  });

  const merchantCategory = categorizeDescription(merchantName);
  counts[merchantCategory] = (counts[merchantCategory] || 0) + 1;

  return Object.entries(counts).reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0] || 'Other';
}

module.exports = app;
