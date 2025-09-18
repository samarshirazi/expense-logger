const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

// Load environment variables from root .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { processReceiptWithAI } = require('../server/services/aiService');
const { uploadToGoogleDrive, deleteFromGoogleDrive } = require('../server/services/googleDriveService');
const { saveExpense, getExpenses, getExpenseById, deleteExpense, testConnection, createExpensesTable } = require('../server/services/supabaseService');
const { signUp, signIn, signOut, requireAuth } = require('../server/services/authService');

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
      driveFileId = await uploadToGoogleDrive(fileBuffer, originalFilename, mimeType);
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
    const expenses = await getExpenses(req.user.id);
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
    const expense = await getExpenseById(id, req.user.id);

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    console.log('Deleting expense from database...');
    await deleteExpense(id, req.user.id);

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