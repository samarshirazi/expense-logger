import React, { useState, useEffect } from 'react';
import { getRecurringExpenses, createRecurringExpense, deleteRecurringExpense, updateRecurringExpense } from '../services/apiService';
import { getAllCategories } from '../services/categoryService';
import './RecurringExpenses.css';

function RecurringExpenses() {
  const [recurringExpenses, setRecurringExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    merchant_name: '',
    product_name: '',
    amount: '',
    category: '',
    payment_day: '',
    notes: ''
  });

  useEffect(() => {
    fetchRecurringExpenses();
    setCategories(getAllCategories());
  }, []);

  const fetchRecurringExpenses = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRecurringExpenses();
      setRecurringExpenses(data);
    } catch (err) {
      console.error('Error fetching recurring expenses:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.merchant_name || !formData.amount || !formData.category || !formData.payment_day) {
      setError('Please fill in all required fields');
      return;
    }

    const paymentDay = parseInt(formData.payment_day);
    if (paymentDay < 1 || paymentDay > 31) {
      setError('Payment day must be between 1 and 31');
      return;
    }

    try {
      setError(null);
      await createRecurringExpense({
        merchant_name: formData.merchant_name,
        product_name: formData.product_name || null,
        amount: parseFloat(formData.amount),
        category: formData.category,
        payment_day: paymentDay,
        notes: formData.notes || null
      });

      setFormData({
        merchant_name: '',
        product_name: '',
        amount: '',
        category: '',
        payment_day: '',
        notes: ''
      });
      setShowForm(false);
      await fetchRecurringExpenses();
    } catch (err) {
      console.error('Error creating recurring expense:', err);
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this recurring expense?')) {
      return;
    }

    try {
      setError(null);
      await deleteRecurringExpense(id);
      await fetchRecurringExpenses();
    } catch (err) {
      console.error('Error deleting recurring expense:', err);
      setError(err.message);
    }
  };

  const handleToggleActive = async (expense) => {
    try {
      setError(null);
      await updateRecurringExpense(expense.id, {
        is_active: !expense.is_active
      });
      await fetchRecurringExpenses();
    } catch (err) {
      console.error('Error toggling recurring expense:', err);
      setError(err.message);
    }
  };

  const getCategoryIcon = (categoryName) => {
    const category = categories.find(c => c.name === categoryName);
    return category?.icon || '📦';
  };

  const getCategoryColor = (categoryName) => {
    const category = categories.find(c => c.name === categoryName);
    return category?.color || '#95afc0';
  };

  const getOrdinalSuffix = (day) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  if (loading) {
    return <div className="recurring-expenses-loading">Loading recurring expenses...</div>;
  }

  return (
    <div className="recurring-expenses-container">
      <div className="recurring-expenses-header">
        <h2>Consistent Expenses</h2>
        <button
          className="add-recurring-btn"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ Add Expense'}
        </button>
      </div>

      <p className="recurring-expenses-description">
        Set up expenses that occur every month, and they'll be automatically added on the specified day.
      </p>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <form className="recurring-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="merchant_name">Merchant Name *</label>
              <input
                type="text"
                id="merchant_name"
                value={formData.merchant_name}
                onChange={(e) => setFormData({ ...formData, merchant_name: e.target.value })}
                placeholder="e.g., Netflix, Spotify"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="product_name">Product/Service</label>
              <input
                type="text"
                id="product_name"
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                placeholder="e.g., Premium Subscription"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="amount">Amount *</label>
              <div className="input-with-currency">
                <span className="currency-symbol">$</span>
                <input
                  type="number"
                  id="amount"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="category">Category *</label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                required
              >
                <option value="">Select a category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.name}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="payment_day">Payment Day *</label>
              <input
                type="number"
                id="payment_day"
                value={formData.payment_day}
                onChange={(e) => setFormData({ ...formData, payment_day: e.target.value })}
                placeholder="1-31"
                min="1"
                max="31"
                required
              />
              <small>Day of the month (1-31)</small>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Optional notes about this expense"
              rows="2"
            />
          </div>

          <button type="submit" className="submit-recurring-btn">
            Add Recurring Expense
          </button>
        </form>
      )}

      <div className="recurring-expenses-list">
        {recurringExpenses.length === 0 ? (
          <div className="no-recurring">
            <p>No recurring expenses set yet</p>
            <p className="hint">Click "Add Expense" to set up an expense that repeats every month</p>
          </div>
        ) : (
          recurringExpenses.map(expense => (
            <div
              key={expense.id}
              className={`recurring-item ${!expense.is_active ? 'inactive' : ''}`}
              style={{ borderLeftColor: getCategoryColor(expense.category) }}
            >
              <div className="recurring-info">
                <div className="recurring-header">
                  <div className="merchant-info">
                    <span className="category-icon">{getCategoryIcon(expense.category)}</span>
                    <div>
                      <h3>{expense.merchant_name}</h3>
                      {expense.product_name && <p className="product-name">{expense.product_name}</p>}
                    </div>
                  </div>
                  <div className="recurring-amount">
                    ${parseFloat(expense.amount).toFixed(2)}
                  </div>
                </div>

                <div className="recurring-details">
                  <div className="detail-item">
                    <span className="detail-label">Category:</span>
                    <span className="detail-value">{expense.category}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Payment Day:</span>
                    <span className="detail-value">
                      {expense.payment_day}{getOrdinalSuffix(expense.payment_day)} of each month
                    </span>
                  </div>
                  {expense.last_processed_date && (
                    <div className="detail-item">
                      <span className="detail-label">Last Processed:</span>
                      <span className="detail-value">
                        {new Date(expense.last_processed_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                {expense.notes && (
                  <div className="recurring-notes">
                    <strong>Notes:</strong> {expense.notes}
                  </div>
                )}

                {!expense.is_active && (
                  <div className="inactive-badge">Paused</div>
                )}
              </div>

              <div className="recurring-actions">
                <button
                  className={`toggle-btn ${expense.is_active ? 'pause' : 'resume'}`}
                  onClick={() => handleToggleActive(expense)}
                  title={expense.is_active ? 'Pause' : 'Resume'}
                >
                  {expense.is_active ? 'Pause' : 'Resume'}
                </button>
                <button
                  className="delete-btn"
                  onClick={() => handleDelete(expense.id)}
                  title="Delete"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default RecurringExpenses;
