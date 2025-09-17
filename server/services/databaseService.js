const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '../database/expenses.db');

let db = null;

function initDatabase() {
  return new Promise((resolve, reject) => {
    const dbDir = path.dirname(dbPath);
    const fs = require('fs');

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      console.log('Connected to SQLite database');

      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY,
          merchant_name TEXT NOT NULL,
          date TEXT,
          total_amount REAL NOT NULL,
          currency TEXT DEFAULT 'USD',
          category TEXT,
          items TEXT,
          payment_method TEXT,
          tax_amount REAL,
          tip_amount REAL,
          original_filename TEXT,
          drive_file_id TEXT,
          upload_date TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) {
            console.error('Error creating expenses table:', err);
            reject(err);
          } else {
            console.log('Expenses table ready');
            resolve();
          }
        });
      });
    });
  });
}

function saveExpense(expenseData) {
  return new Promise((resolve, reject) => {
    const id = uuidv4();

    const stmt = db.prepare(`
      INSERT INTO expenses (
        id, merchant_name, date, total_amount, currency, category,
        items, payment_method, tax_amount, tip_amount,
        original_filename, drive_file_id, upload_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      id,
      expenseData.merchantName,
      expenseData.date,
      expenseData.totalAmount,
      expenseData.currency || 'USD',
      expenseData.category,
      JSON.stringify(expenseData.items || []),
      expenseData.paymentMethod,
      expenseData.taxAmount,
      expenseData.tipAmount,
      expenseData.originalFilename,
      expenseData.driveFileId,
      expenseData.uploadDate
    ], function(err) {
      if (err) {
        console.error('Error saving expense:', err);
        reject(err);
      } else {
        console.log('Expense saved with ID:', id);
        resolve(id);
      }
    });

    stmt.finalize();
  });
}

function getExpenses(limit = 50, offset = 0) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT * FROM expenses
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    db.all(query, [limit, offset], (err, rows) => {
      if (err) {
        console.error('Error fetching expenses:', err);
        reject(err);
      } else {
        const expenses = rows.map(row => ({
          id: row.id,
          merchantName: row.merchant_name,
          date: row.date,
          totalAmount: row.total_amount,
          currency: row.currency,
          category: row.category,
          items: JSON.parse(row.items || '[]'),
          paymentMethod: row.payment_method,
          taxAmount: row.tax_amount,
          tipAmount: row.tip_amount,
          originalFilename: row.original_filename,
          driveFileId: row.drive_file_id,
          uploadDate: row.upload_date,
          createdAt: row.created_at
        }));
        resolve(expenses);
      }
    });
  });
}

function getExpenseById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM expenses WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else if (!row) {
        resolve(null);
      } else {
        resolve({
          id: row.id,
          merchantName: row.merchant_name,
          date: row.date,
          totalAmount: row.total_amount,
          currency: row.currency,
          category: row.category,
          items: JSON.parse(row.items || '[]'),
          paymentMethod: row.payment_method,
          taxAmount: row.tax_amount,
          tipAmount: row.tip_amount,
          originalFilename: row.original_filename,
          driveFileId: row.drive_file_id,
          uploadDate: row.upload_date,
          createdAt: row.created_at
        });
      }
    });
  });
}

function deleteExpense(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM expenses WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}

function getExpensesByCategory(category) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM expenses WHERE category = ? ORDER BY created_at DESC',
      [category],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const expenses = rows.map(row => ({
            id: row.id,
            merchantName: row.merchant_name,
            date: row.date,
            totalAmount: row.total_amount,
            currency: row.currency,
            category: row.category,
            items: JSON.parse(row.items || '[]'),
            paymentMethod: row.payment_method,
            taxAmount: row.tax_amount,
            tipAmount: row.tip_amount,
            originalFilename: row.original_filename,
            driveFileId: row.drive_file_id,
            uploadDate: row.upload_date,
            createdAt: row.created_at
          }));
          resolve(expenses);
        }
      }
    );
  });
}

function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
    });
  }
}

module.exports = {
  initDatabase,
  saveExpense,
  getExpenses,
  getExpenseById,
  deleteExpense,
  getExpensesByCategory,
  closeDatabase
};