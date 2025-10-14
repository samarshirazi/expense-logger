const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { processReceiptWithAI } = require('./services/aiService');
const { uploadToGoogleDrive, deleteFromGoogleDrive } = require('./services/googleDriveService');
const { saveExpense, getExpenses, getExpenseById, deleteExpense, testConnection, createExpensesTable } = require('./services/supabaseService');
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

    const result = await saveSubscription(req.user.id, subscription);

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

    const result = await sendPushToUser(req.user.id, payload);

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
      await sendPushToUser(req.user.id, notificationPayload);
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
