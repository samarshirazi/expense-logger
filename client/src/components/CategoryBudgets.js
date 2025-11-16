import React, { useState, useEffect } from 'react';
import { getCategoryBudgets, saveCategoryBudget, deleteCategoryBudget } from '../services/apiService';
import { getAllCategories } from '../services/categoryService';
import './CategoryBudgets.css';

function CategoryBudgets() {
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    fetchBudgets();
    setCategories(getAllCategories());
  }, []);

  const notifyBudgetsUpdated = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('categoryBudgetsUpdated'));
    }
  };

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

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this budget?')) {
      return;
    }

    try {
      setError(null);
      await deleteCategoryBudget(id);
      await fetchBudgets();
      notifyBudgetsUpdated();
    } catch (err) {
      console.error('Error deleting budget:', err);
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="category-budgets-loading">Loading budgets...</div>;
  }

  const getBudgetForCategory = (categoryName) => {
    return budgets.find(b => b.category === categoryName);
  };

  const openAddModal = (category) => {
    setSelectedCategory(category);
    setBudgetAmount('');
    setIsEditMode(false);
    setShowModal(true);
    setError(null);
  };

  const openEditModal = (category, budget) => {
    setSelectedCategory(category);
    setBudgetAmount(budget.monthly_limit.toString());
    setIsEditMode(true);
    setShowModal(true);
    setError(null);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedCategory(null);
    setBudgetAmount('');
    setIsEditMode(false);
    setError(null);
  };

  const handleSaveBudget = async () => {
    if (!budgetAmount || parseFloat(budgetAmount) <= 0) {
      setError('Please enter a valid budget amount');
      return;
    }

    try {
      setError(null);
      await saveCategoryBudget({
        category: selectedCategory.name,
        monthly_limit: parseFloat(budgetAmount),
        currency: 'USD'
      });

      await fetchBudgets();
      notifyBudgetsUpdated();
      closeModal();
    } catch (err) {
      console.error('Error saving budget:', err);
      setError(err.message);
    }
  };

  return (
    <div className="category-budgets-container">
      <div className="category-budgets-header">
        <h2>Category Budgets</h2>
      </div>

      <div className="budgets-list">
        {categories.map(category => {
          const budget = getBudgetForCategory(category.name);

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

                {budget && (
                  <div className="budget-amount">
                    <span className="amount-label">Monthly Limit:</span>
                    <span className="amount-value">${parseFloat(budget.monthly_limit).toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="budget-actions">
                {!budget ? (
                  <button
                    className="add-btn"
                    onClick={() => openAddModal(category)}
                  >
                    Add Budget
                  </button>
                ) : (
                  <>
                    <button
                      className="edit-btn"
                      onClick={() => openEditModal(category, budget)}
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

      {/* Budget Modal */}
      {showModal && selectedCategory && (
        <div className="budget-modal-overlay" onClick={closeModal}>
          <div className="budget-modal" onClick={(e) => e.stopPropagation()}>
            <div className="budget-modal-header">
              <h3>Set Budget</h3>
              <button className="modal-close-btn" onClick={closeModal}>×</button>
            </div>

            <div className="budget-modal-body">
              <div className="modal-category-display">
                <span className="modal-category-icon" style={{ backgroundColor: selectedCategory.color }}>
                  {selectedCategory.icon}
                </span>
                <span className="modal-category-name">{selectedCategory.name}</span>
              </div>

              {error && <div className="modal-error-message">{error}</div>}

              <div className="modal-budget-input">
                <label htmlFor="budget-amount">Budget Monthly Limit</label>
                <div className="input-with-currency">
                  <span className="currency-symbol">$</span>
                  <input
                    type="number"
                    id="budget-amount"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    autoFocus
                  />
                </div>
              </div>
            </div>

            <div className="budget-modal-footer">
              <button className="modal-cancel-btn" onClick={closeModal}>
                Cancel
              </button>
              <button className="modal-done-btn" onClick={handleSaveBudget}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CategoryBudgets;
