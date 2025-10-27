import React, { useState, useEffect } from 'react';
import { createExpense } from '../services/apiService';
import './ManualExpenseForm.css';
import { getAllCategories } from '../services/categoryService';

// Helper to get local date string without timezone shift
const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function ManualExpenseForm({ onExpenseAdded, expenses = [], prefill = null, onPrefillConsumed = () => {} }) {
  const [categories, setCategories] = useState(getAllCategories());
  const [formData, setFormData] = useState({
    merchantName: '',
    description: '',
    totalAmount: '',
    category: '',
    date: getLocalDateString(),
    paymentMethod: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Listen for category updates
  useEffect(() => {
    const handleCategoriesUpdated = () => {
      setCategories(getAllCategories());
    };

    window.addEventListener('categoriesUpdated', handleCategoriesUpdated);

    return () => {
      window.removeEventListener('categoriesUpdated', handleCategoriesUpdated);
    };
  }, []);

  useEffect(() => {
    if (!prefill) return;

    setFormData({
      merchantName: prefill.merchantName || '',
      description: prefill.description || '',
      totalAmount: prefill.totalAmount ? String(prefill.totalAmount) : '',
      category: prefill.category || 'Food',
      date: prefill.date || getLocalDateString(),
      paymentMethod: prefill.paymentMethod || ''
    });

    setError(null);
    setSuccess(null);

    onPrefillConsumed();
  }, [prefill, onPrefillConsumed]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // Create expense object
      const expenseData = {
        merchantName: formData.merchantName || formData.description,
        date: formData.date,
        totalAmount: parseFloat(formData.totalAmount),
        category: formData.category,
        paymentMethod: formData.paymentMethod || null,
        currency: 'USD',
        items: [{
          description: formData.description,
          totalPrice: parseFloat(formData.totalAmount),
          quantity: 1,
          category: formData.category
        }]
      };

      const response = await createExpense(expenseData);

      setSuccess('Expense added successfully!');

      // Reset form
      setFormData({
        merchantName: '',
        description: '',
        totalAmount: '',
        category: '',
        date: getLocalDateString(),
        paymentMethod: ''
      });

      // Notify parent component
      if (onExpenseAdded) {
        onExpenseAdded(response.expense);
      }

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);

    } catch (err) {
      console.error('Failed to create expense:', err);
      setError(err.message || 'Failed to create expense. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="manual-expense-form">
      <h2>Add Expense Manually</h2>
      <p className="form-subtitle">Enter expense details to track your spending</p>

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="merchantName">
              Merchant Name
              <span className="optional">(optional)</span>
            </label>
            <input
              type="text"
              id="merchantName"
              name="merchantName"
              value={formData.merchantName}
              onChange={handleChange}
              placeholder="e.g., Walmart, Amazon, Starbucks"
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">
              Description
              <span className="required">*</span>
            </label>
            <input
              type="text"
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="e.g., Groceries, Coffee, Gas"
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="totalAmount">
              Cost
              <span className="required">*</span>
            </label>
            <div className="input-with-prefix">
              <span className="prefix">$</span>
              <input
                type="number"
                id="totalAmount"
                name="totalAmount"
                value={formData.totalAmount}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                min="0"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="category">
              Category
              <span className="required">*</span>
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              required
            >
              <option value="">Select Category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="date">
              Date
              <span className="required">*</span>
            </label>
            <input
              type="date"
              id="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="paymentMethod">
              Payment Method
              <span className="optional">(optional)</span>
            </label>
            <input
              type="text"
              id="paymentMethod"
              name="paymentMethod"
              value={formData.paymentMethod}
              onChange={handleChange}
              placeholder="e.g., Cash, Credit Card, Debit Card, Venmo, PayPal"
            />
          </div>
        </div>

        {error && (
          <div className="form-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {success && (
          <div className="form-success">
            <strong>Success:</strong> {success}
          </div>
        )}

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Adding...' : '💾 Add Expense'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ManualExpenseForm;
