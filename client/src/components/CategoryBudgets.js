import React, { useState, useEffect } from 'react';
import { getCategoryBudgets, saveCategoryBudget, deleteCategoryBudget } from '../services/apiService';
import { getAllCategories } from '../services/categoryService';
import './CategoryBudgets.css';

function CategoryBudgets() {
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
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

  const getBudgetForCategory = (categoryName) => {
    return budgets.find(b => b.category === categoryName);
  };

  const handleAddClick = (category) => {
    setEditingCategory(category.name);
    setFormData({ ...formData, category: category.name, monthly_limit: '' });
  };

  const handleSave = async (categoryName) => {
    if (!formData.monthly_limit) {
      setError('Please enter a monthly limit');
      return;
    }

    try {
      setError(null);
      await saveCategoryBudget({
        category: categoryName,
        monthly_limit: parseFloat(formData.monthly_limit),
        currency: 'USD'
      });

      setFormData({ category: '', monthly_limit: '', currency: 'USD' });
      setEditingCategory(null);
      await fetchBudgets();
    } catch (err) {
      console.error('Error saving budget:', err);
      setError(err.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    setFormData({ category: '', monthly_limit: '', currency: 'USD' });
  };

  return (
    <div className="category-budgets-container">
      <div className="category-budgets-header">
        <h2>Category Budgets</h2>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="budgets-list">
        {categories.map(category => {
          const budget = getBudgetForCategory(category.name);
          const isEditing = editingCategory === category.name;

          return (
            <div
              key={category.id}
              className="budget-item"
              style={{ borderLeftColor: category.color }}
            >
              <div className="budget-info">
                <div className="budget-category">
                  <span className="category-icon">{category.icon}</span>
                  <span className="category-name">{category.name}</span>
                </div>

                {budget && !isEditing ? (
                  <div className="budget-amount">
                    <span className="amount-label">Monthly Limit:</span>
                    <span className="amount-value">${parseFloat(budget.monthly_limit).toFixed(2)}</span>
                  </div>
                ) : isEditing ? (
                  <div className="budget-edit-form">
                    <div className="input-with-currency">
                      <span className="currency-symbol">$</span>
                      <input
                        type="number"
                        value={formData.monthly_limit}
                        onChange={(e) => setFormData({ ...formData, monthly_limit: e.target.value })}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        autoFocus
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="budget-actions">
                {!budget && !isEditing ? (
                  <button
                    className="add-btn"
                    onClick={() => handleAddClick(category)}
                  >
                    Add Budget
                  </button>
                ) : isEditing ? (
                  <>
                    <button
                      className="save-btn"
                      onClick={() => handleSave(category.name)}
                    >
                      Save
                    </button>
                    <button
                      className="cancel-btn"
                      onClick={handleCancelEdit}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="edit-btn"
                      onClick={() => {
                        setEditingCategory(category.name);
                        setFormData({ ...formData, category: category.name, monthly_limit: budget.monthly_limit });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => handleDelete(budget.id)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CategoryBudgets;
