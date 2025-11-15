import React, { useState } from 'react';
import axios from 'axios';
import authService from '../services/authService';
import {
  showLocalNotification,
  getNotificationPermissionState,
  getStoredNotificationsEnabled,
  getStoredNotificationPreferences
} from '../services/notificationService';
import './ManualEntry.css';

function ManualEntry({ onExpensesAdded, expenses = [] }) {
  const [textEntry, setTextEntry] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Helper function to get current month key
  const getMonthKey = (dateString) => {
    return dateString.substring(0, 7); // "2024-01-15" -> "2024-01"
  };

  // Helper function to check budget thresholds
  const checkBudgetThresholds = async (addedExpenses) => {
    try {
      // Prevent multiple calls in quick succession
      if (checkBudgetThresholds.isRunning) {
        console.log('⏭️  Budget check already in progress, skipping...');
        return;
      }

      checkBudgetThresholds.isRunning = true;
      console.log('🔔 Checking budget thresholds...', addedExpenses);

      // Get monthly budgets from localStorage
      const monthlyBudgets = JSON.parse(localStorage.getItem('monthlyBudgets') || '{}');
      const currentMonth = getMonthKey(new Date().toISOString().split('T')[0]);
      const currentBudget = monthlyBudgets[currentMonth];

      console.log('📊 Current budget:', currentBudget);

      if (!currentBudget) {
        console.log('❌ No budget found for current month');
        return;
      }

      // Use expenses from props (React state, not localStorage)
      const allExpenses = expenses || [];

      console.log('💰 Total expenses loaded:', allExpenses.length);

      // Calculate current spending by category for the month
      const monthSpending = {
        Food: 0,
        Transport: 0,
        Shopping: 0,
        Bills: 0,
        Other: 0
      };

      // Calculate spending from existing expenses
      allExpenses.forEach(expense => {
        if (expense.date && expense.date.startsWith(currentMonth)) {
          if (expense.items && expense.items.length > 0) {
            expense.items.forEach(item => {
              const itemCategory = item.category || 'Other';
              monthSpending[itemCategory] += item.totalPrice || 0;
            });
          } else {
            const category = expense.category || 'Other';
            monthSpending[category] += expense.totalAmount || 0;
          }
        }
      });

      // Add newly added expenses to spending
      addedExpenses.forEach(exp => {
        const category = exp.category || 'Other';
        monthSpending[category] += exp.totalAmount || 0;
      });

      console.log('📈 Month spending by category:', monthSpending);

      // Check for categories approaching or exceeding budget
      const THRESHOLD = 0.85; // 85% of budget
      const permissionState = getNotificationPermissionState();
      const notificationsEnabled = getStoredNotificationsEnabled();
      const preferences = getStoredNotificationPreferences();

      console.log('🔐 Notification permission:', permissionState);

      // Skip if overspending alerts are disabled
      if (!notificationsEnabled || !preferences?.overspendingAlert) {
        console.log('⏭️  Overspending alerts disabled in settings');
        return;
      }

      for (const category of Object.keys(monthSpending)) {
        const budget = currentBudget[category] || 0;
        const spent = monthSpending[category] || 0;
        const percentage = budget > 0 ? (spent / budget) * 100 : 0;

        console.log(`📊 ${category}: $${spent.toFixed(2)} / $${budget.toFixed(2)} (${percentage.toFixed(1)}%)`);

        if (budget === 0) continue;

        if (percentage >= 100) {
          console.log(`⚠️ ${category} OVER BUDGET!`);
          if (permissionState === 'granted') {
            await showLocalNotification('Budget Exceeded! ⚠️', {
              body: `You've exceeded your ${category} budget! Spent $${spent.toFixed(2)} of $${budget.toFixed(2)} (${Math.round(percentage)}%)`,
              icon: '/icon-192.svg',
              tag: `budget-warning-${category}`,
              data: { category, percentage }
            });
          } else {
            console.log('❌ Cannot show notification - permission not granted');
          }
        } else if (percentage >= THRESHOLD * 100) {
          console.log(`💡 ${category} approaching budget limit!`);
          if (permissionState === 'granted') {
            await showLocalNotification('Budget Alert 💡', {
              body: `You're close to your ${category} budget limit! Spent $${spent.toFixed(2)} of $${budget.toFixed(2)} (${Math.round(percentage)}%)`,
              icon: '/icon-192.svg',
              tag: `budget-alert-${category}`,
              data: { category, percentage }
            });
          } else {
            console.log('❌ Cannot show notification - permission not granted');
          }
        }
      }
    } catch (err) {
      console.error('Failed to check budget thresholds:', err);
    } finally {
      // Reset the running flag after a short delay
      setTimeout(() => {
        checkBudgetThresholds.isRunning = false;
      }, 1000);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!textEntry.trim()) {
      setError('Please enter some expenses');
      return;
    }

    try {
      setProcessing(true);
      setError(null);
      setSuccess(null);

      const token = authService.getAccessToken();
      const API_BASE_URL = process.env.NODE_ENV === 'production'
        ? '/api'
        : 'http://localhost:5000/api';

      const response = await axios.post(
        `${API_BASE_URL}/manual-entry`,
        { textEntry: textEntry.trim() },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        setSuccess(`✅ ${response.data.message}`);
        setTextEntry('');

        // Collect added expenses for budget checking
        const addedExpenses = [];

        // Notify parent component
        if (onExpensesAdded && response.data.expenses) {
          response.data.expenses.forEach(exp => {
            const normalizedExpense = exp.expense
              ? exp.expense
              : exp.expenseData
                ? {
                    ...exp.expenseData,
                    id: exp.expenseId || exp.expenseData.id || undefined
                  }
                : null;

            if (normalizedExpense) {
              onExpensesAdded(normalizedExpense);
              addedExpenses.push(normalizedExpense);
            }
          });
        }

        // Show notification if enabled
        const notificationsEnabled = getStoredNotificationsEnabled();
        const preferences = getStoredNotificationPreferences();
        const permissionGranted = getNotificationPermissionState() === 'granted';

        if (notificationsEnabled && permissionGranted && preferences?.newReceiptScanned) {
          const count = addedExpenses.length;
          const totalAmount = addedExpenses.reduce((sum, exp) => sum + (exp.totalAmount || 0), 0);
          await showLocalNotification('Expenses Added Successfully!', {
            body: `${count} expense${count > 1 ? 's' : ''} added: $${totalAmount.toFixed(2)} total`,
            icon: '/icon-192.svg',
            tag: 'manual-entry-processed'
          });
        }

        // Check budget thresholds immediately with current expenses
        await checkBudgetThresholds(addedExpenses);

        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      console.error('Manual entry error:', err);
      setError(err.response?.data?.details || err.message || 'Failed to process entry');
    } finally {
      setProcessing(false);
    }
  };

  const handleKeyPress = (e) => {
    // Submit on Enter (but not Shift+Enter for multiline)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="manual-entry">
      <div className="manual-entry-header">
        <span className="manual-entry-icon">✍️</span>
        <h3>Quick Add</h3>
        <span className="manual-entry-hint">Type naturally, AI will categorize</span>
      </div>

      <form onSubmit={handleSubmit} className="manual-entry-form">
        <div className="manual-entry-input-wrapper">
          <textarea
            className="manual-entry-input"
            value={textEntry}
            onChange={(e) => setTextEntry(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder='Try: "I spent $10 on food and $20 on shopping" or "Gas $40, coffee $5, groceries $50"'
            rows="2"
            disabled={processing}
          />
          <button
            type="submit"
            className="manual-entry-button"
            disabled={processing || !textEntry.trim()}
          >
            {processing ? (
              <>
                <span className="button-spinner"></span>
                Processing...
              </>
            ) : (
              <>
                <span>💬</span>
                Add
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="manual-entry-error">
            ❌ {error}
          </div>
        )}

        {success && (
          <div className="manual-entry-success">
            {success}
          </div>
        )}
      </form>

      <div className="manual-entry-examples">
        <span className="examples-title">Examples:</span>
        <button
          type="button"
          className="example-button"
          onClick={() => setTextEntry('I spent $15 on lunch at subway and $30 on gas')}
          disabled={processing}
        >
          "I spent $15 on lunch at subway and $30 on gas"
        </button>
        <button
          type="button"
          className="example-button"
          onClick={() => setTextEntry('Coffee $5, parking $10, groceries $45')}
          disabled={processing}
        >
          "Coffee $5, parking $10, groceries $45"
        </button>
      </div>
    </div>
  );
}

export default ManualEntry;
