const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

// Load environment variables from root .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const { processReceiptWithAI } = require('../server/services/aiService');
const { uploadToGoogleDrive } = require('../server/services/googleDriveService');
const { saveExpense, getExpenses, testConnection, createExpensesTable } = require('../server/services/supabaseService');

const app = express();

app.use(cors());
app.use(express.json());

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

app.post('/api/upload-receipt', upload.single('receipt'), async (req, res) => {
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
    const expenseId = await saveExpense({
      ...expenseData,
      originalFilename: originalFilename,
      driveFileId: driveFileId,
      uploadDate: new Date().toISOString()
    });

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

app.get('/api/expenses', async (_, res) => {
  try {
    const expenses = await getExpenses();
    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
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