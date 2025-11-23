import React, { useState, useCallback } from 'react';
import axios from 'axios';
import authService from '../services/authService';
import { createExpense } from '../services/apiService';
import { getAllCategories } from '../services/categoryService';
import {
  showLocalNotification,
  getNotificationPermissionState,
  getStoredNotificationsEnabled,
  getStoredNotificationPreferences
} from '../services/notificationService';
import './ManualEntry.css';
import './CameraCapture.css';

function ManualEntry({ onExpensesAdded, expenses = [] }) {
  const [textEntry, setTextEntry] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [categories] = useState(getAllCategories());

  // Helper function to get current month key
  const getMonthKey = useCallback((dateString) => {
    return dateString.substring(0, 7); // "2024-01-15" -> "2024-01"
  }, []);

  // Helper function to check budget thresholds
  const checkBudgetThresholds = useCallback(async (addedExpenses) => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, getMonthKey]);

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

      if (response.data.success && response.data.expenses) {
        // Extract the parsed expense data for review
        const firstExpense = response.data.expenses[0];
        const normalizedExpense = firstExpense.expense
          ? firstExpense.expense
          : firstExpense.expenseData
            ? {
                ...firstExpense.expenseData,
                id: firstExpense.expenseId || firstExpense.expenseData.id || undefined
              }
            : null;

        if (normalizedExpense) {
          // Show the review modal instead of saving immediately
          setParsedData({
            ...normalizedExpense,
            paymentMethod: normalizedExpense.paymentMethod || ''
          });
          setShowReviewModal(true);
          setTextEntry('');
        }
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

  // Review modal handlers
  const handleUpdateItem = useCallback((itemIndex, field, value) => {
    setParsedData(prev => {
      if (!prev || !prev.items) return prev;

      const updatedItems = [...prev.items];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        [field]: value
      };

      // Recalculate unitPrice if quantity or totalPrice changed
      if (field === 'quantity' || field === 'totalPrice') {
        const item = updatedItems[itemIndex];
        const qty = field === 'quantity' ? parseFloat(value) || 1 : parseFloat(item.quantity) || 1;
        const total = field === 'totalPrice' ? parseFloat(value) || 0 : parseFloat(item.totalPrice) || 0;
        updatedItems[itemIndex].unitPrice = qty > 0 ? parseFloat((total / qty).toFixed(2)) : total;
      }

      // Recalculate total
      const newTotal = updatedItems.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);

      return {
        ...prev,
        items: updatedItems,
        totalAmount: parseFloat(newTotal.toFixed(2))
      };
    });
  }, []);

  const handleUpdateInfo = useCallback((field, value) => {
    setParsedData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [field]: value
      };
    });
  }, []);

  const handleAddItem = useCallback(() => {
    setParsedData(prev => {
      if (!prev) return prev;
      const newItem = {
        description: '',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        category: 'Other'
      };
      return {
        ...prev,
        items: [...(prev.items || []), newItem]
      };
    });
  }, []);

  const handleRemoveItem = useCallback((itemIndex) => {
    setParsedData(prev => {
      if (!prev || !prev.items) return prev;
      const updatedItems = prev.items.filter((_, idx) => idx !== itemIndex);
      const newTotal = updatedItems.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
      return {
        ...prev,
        items: updatedItems,
        totalAmount: parseFloat(newTotal.toFixed(2))
      };
    });
  }, []);

  const handleCancelReview = useCallback(() => {
    setShowReviewModal(false);
    setParsedData(null);
  }, []);

  const handleSaveReviewed = useCallback(async () => {
    if (!parsedData) return;

    try {
      // Create the expense via API
      const expenseData = {
        merchantName: parsedData.merchantName || 'Manual Entry',
        date: parsedData.date,
        totalAmount: parsedData.totalAmount,
        currency: parsedData.currency || 'USD',
        category: parsedData.category,
        paymentMethod: parsedData.paymentMethod || null,
        items: parsedData.items
      };

      const response = await createExpense(expenseData);

      if (response.expense) {
        // Notify parent component
        if (onExpensesAdded) {
          onExpensesAdded(response.expense);
        }

        // Check budget thresholds
        await checkBudgetThresholds([response.expense]);

        // Show notification if enabled
        const notificationsEnabled = getStoredNotificationsEnabled();
        const preferences = getStoredNotificationPreferences();
        const permissionGranted = getNotificationPermissionState() === 'granted';

        if (notificationsEnabled && permissionGranted && preferences?.newReceiptScanned) {
          await showLocalNotification('Expense Added Successfully!', {
            body: `$${parsedData.totalAmount.toFixed(2)} - ${parsedData.merchantName || 'Manual Entry'}`,
            icon: '/icon-192.svg',
            tag: 'manual-entry-processed'
          });
        }

        const itemCount = parsedData.items?.length || 0;
        let successMsg = `$${parsedData.totalAmount.toFixed(2)}`;
        if (itemCount > 0) {
          successMsg += ` (${itemCount} item${itemCount !== 1 ? 's' : ''})`;
        }
        successMsg += ' - Saved successfully!';
        setSuccess(successMsg);

        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      }

      setShowReviewModal(false);
      setParsedData(null);
    } catch (err) {
      console.error('Failed to save expense:', err);
      setError(err.message || 'Failed to save expense');
    }
  }, [parsedData, onExpensesAdded, checkBudgetThresholds]);

  return (
    <div className="manual-entry">
      <div className="manual-entry-header">
        <h3>Quick Add</h3>
      </div>

      <form onSubmit={handleSubmit} className="manual-entry-form">
        <div className="manual-entry-input-wrapper">
          <input
            type="text"
            className="manual-entry-input"
            value={textEntry}
            onChange={(e) => setTextEntry(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder='Type expense, e.g. "Coffee $5" or "Gas $40, groceries $50"'
            disabled={processing}
          />
          <button
            type="submit"
            className="manual-entry-button"
            disabled={processing || !textEntry.trim()}
          >
            {processing ? (
              <span className="button-spinner"></span>
            ) : (
              <span className="send-icon">&#10148;</span>
            )}
          </button>
        </div>

        {error && (
          <div className="manual-entry-error">
            {error}
          </div>
        )}

        {success && (
          <div className="manual-entry-success">
            {success}
          </div>
        )}
      </form>

      {/* Review Modal */}
      {showReviewModal && parsedData && (
        <div className="receipt-review-modal-overlay" onClick={handleCancelReview}>
          <div className="receipt-review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="review-modal-header">
              <h3>Review Expense</h3>
              <button className="review-close-btn" onClick={handleCancelReview}>x</button>
            </div>

            <div className="review-modal-body">
              <div className="review-merchant-info">
                <div className="review-field-group">
                  <label htmlFor="manual-merchant-name">Merchant</label>
                  <input
                    type="text"
                    id="manual-merchant-name"
                    className="review-merchant-input"
                    value={parsedData.merchantName || ''}
                    onChange={(e) => handleUpdateInfo('merchantName', e.target.value)}
                    placeholder="Merchant name"
                  />
                </div>
                <div className="review-field-group">
                  <label htmlFor="manual-receipt-date">Date</label>
                  <input
                    type="date"
                    id="manual-receipt-date"
                    className="review-date-input"
                    value={parsedData.date || ''}
                    onChange={(e) => handleUpdateInfo('date', e.target.value)}
                  />
                </div>
              </div>

              <div className="review-merchant-info">
                <div className="review-field-group">
                  <label htmlFor="manual-payment-method">Payment Method</label>
                  <input
                    type="text"
                    id="manual-payment-method"
                    className="review-merchant-input"
                    value={parsedData.paymentMethod || ''}
                    onChange={(e) => handleUpdateInfo('paymentMethod', e.target.value)}
                    placeholder="e.g., Cash, Credit Card, Debit"
                  />
                </div>
              </div>

              <div className="review-items-section">
                <div className="review-items-header">
                  <h4>Items ({parsedData.items?.length || 0})</h4>
                  <button
                    type="button"
                    className="review-add-item-btn"
                    onClick={handleAddItem}
                  >
                    + Add Item
                  </button>
                </div>
                <div className="review-items-list">
                  {parsedData.items?.map((item, index) => (
                    <div key={index} className="review-item">
                      <div className="review-item-main">
                        <input
                          type="text"
                          className="review-item-description"
                          value={item.description}
                          onChange={(e) => handleUpdateItem(index, 'description', e.target.value)}
                          placeholder="Item description"
                        />
                        <button
                          type="button"
                          className="review-item-remove-btn"
                          onClick={() => handleRemoveItem(index)}
                          title="Remove item"
                        >
                          x
                        </button>
                      </div>
                      {item.quantity > 1 && (
                        <div className="review-item-unit-price">
                          ${item.unitPrice?.toFixed(2) || '0.00'} each
                        </div>
                      )}
                      <div className="review-item-price-group">
                        <input
                          type="number"
                          className="review-item-qty"
                          value={item.quantity || 1}
                          onChange={(e) => handleUpdateItem(index, 'quantity', parseFloat(e.target.value) || 1)}
                          placeholder="Qty"
                          min="1"
                          step="1"
                        />
                        <span className="review-item-x">x</span>
                        <div className="review-item-price-input">
                          <span>$</span>
                          <input
                            type="number"
                            value={item.totalPrice || ''}
                            onChange={(e) => handleUpdateItem(index, 'totalPrice', e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </div>
                        <select
                          className="review-item-category"
                          value={item.category || 'Other'}
                          onChange={(e) => handleUpdateItem(index, 'category', e.target.value)}
                        >
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>
                              {cat.icon} {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="review-total">
                <span>Total:</span>
                <span className="review-total-amount">${parsedData.totalAmount?.toFixed(2) || '0.00'}</span>
              </div>
            </div>

            <div className="review-modal-footer">
              <button className="review-cancel-btn" onClick={handleCancelReview}>
                Cancel
              </button>
              <button className="review-save-btn" onClick={handleSaveReviewed}>
                Save Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManualEntry;
