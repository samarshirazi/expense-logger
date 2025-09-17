const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { processReceiptWithAI } = require('./services/aiService');
const { uploadToGoogleDrive } = require('./services/googleDriveService');
const { saveExpense, getExpenses, testConnection, createExpensesTable } = require('./services/supabaseService');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
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

    const filePath = req.file.path;

    console.log('Processing receipt with AI...');
    const expenseData = await processReceiptWithAI(filePath);

    console.log('Uploading to Google Drive...');
    const driveFileId = await uploadToGoogleDrive(filePath, req.file.originalname);

    console.log('Saving expense to database...');
    const expenseId = await saveExpense({
      ...expenseData,
      originalFilename: req.file.originalname,
      driveFileId: driveFileId,
      uploadDate: new Date().toISOString()
    });

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      expenseId: expenseId,
      expenseData: expenseData,
      driveFileId: driveFileId,
      message: 'Receipt processed successfully'
    });

  } catch (error) {
    console.error('Error processing receipt:', error);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Failed to process receipt',
      details: error.message
    });
  }
});

app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await getExpenses();
    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
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