import React, { useState, useEffect } from 'react';
import { getCategoryBudgets, saveCategoryBudget, deleteCategoryBudget } from '../services/apiService';
import { getAllCategories } from '../services/categoryService';
import './CategoryBudgets.css';

function CategoryBudgets() {
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    category: '',
    monthly_limit: '',
    currency: 'USD'
  });

  useEffect(() => {
    fetchBudgets();
    setCategories(getAllCategories());
  }, []);

  const fetchBudgets = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCategoryBudgets();
      setBudgets(data);
    } catch (err) {
      console.error('Error fetching budgets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.category || !formData.monthly_limit) {
      setError('Please select a category and enter a monthly limit');
      return;
    }

    try {
      setError(null);
      await saveCategoryBudget({
        category: formData.category,
        monthly_limit: parseFloat(formData.monthly_limit),
        currency: formData.currency
      });

      setFormData({ category: '', monthly_limit: '', currency: 'USD' });
      setShowForm(false);
      await fetchBudgets();
    } catch (err) {
      console.error('Error saving budget:', err);
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this budget?')) {
      return;
    }

    try {
      setError(null);
      await deleteCategoryBudget(id);
      await fetchBudgets();
    } catch (err) {
      console.error('Error deleting budget:', err);
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

  if (loading) {
    return <div className="category-budgets-loading">Loading budgets...</div>;
  }

  return (
    <div className="category-budgets-container">
      <div className="category-budgets-header">
        <h2>Category Budgets</h2>
        <button
          className="add-budget-btn"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ Add Budget'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && (
        <form className="budget-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="category">Category</label>
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
            <label htmlFor="monthly_limit">Monthly Limit</label>
            <div className="input-with-currency">
              <span className="currency-symbol">$</span>
              <input
                type="number"
                id="monthly_limit"
                value={formData.monthly_limit}
                onChange={(e) => setFormData({ ...formData, monthly_limit: e.target.value })}
                placeholder="0.00"
                step="0.01"
                min="0"
                required
              />
            </div>
          </div>

          <button type="submit" className="submit-budget-btn">
            Save Budget
          </button>
        </form>
      )}

      <div className="budgets-list">
        {budgets.length === 0 ? (
          <div className="no-budgets">
            <p>No budgets set yet</p>
            <p className="hint">Click "Add Budget" to set a monthly spending limit for a category</p>
          </div>
        ) : (
          budgets.map(budget => (
            <div
              key={budget.id}
              className="budget-item"
              style={{ borderLeftColor: getCategoryColor(budget.category) }}
            >
              <div className="budget-info">
                <div className="budget-category">
                  <span className="category-icon">{getCategoryIcon(budget.category)}</span>
                  <span className="category-name">{budget.category}</span>
                </div>
                <div className="budget-amount">
                  <span className="amount-label">Monthly Limit:</span>
                  <span className="amount-value">${parseFloat(budget.monthly_limit).toFixed(2)}</span>
                </div>
                {!budget.is_active && (
                  <span className="inactive-badge">Inactive</span>
                )}
              </div>
              <div className="budget-actions">
                <button
                  className="delete-btn"
                  onClick={() => handleDelete(budget.id)}
                  title="Delete budget"
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

export default CategoryBudgets;
