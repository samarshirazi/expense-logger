import React, { useState, useEffect } from 'react';
import TimeNavigator from './TimeNavigator';
import './BudgetManage.css';

// Helper function to format date in local timezone
const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const CATEGORIES = [
  { id: 'Food', name: 'Food', icon: '🍔', color: '#ff6b6b' },
  { id: 'Transport', name: 'Transport', icon: '🚗', color: '#4ecdc4' },
  { id: 'Shopping', name: 'Shopping', icon: '🛍️', color: '#45b7d1' },
  { id: 'Bills', name: 'Bills', icon: '💡', color: '#f9ca24' },
  { id: 'Other', name: 'Other', icon: '📦', color: '#95afc0' }
];

function BudgetManage({ expenses }) {
  const [dateRange, setDateRange] = useState(() => {
    // Default to this month
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    return {
      startDate: toLocalDateString(startOfMonth),
      endDate: toLocalDateString(endOfMonth)
    };
  });

  // Budget state - stored in localStorage for now
  const [budgets, setBudgets] = useState(() => {
    const saved = localStorage.getItem('categoryBudgets');
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      Food: 500,
      Transport: 200,
      Shopping: 300,
      Bills: 400,
      Other: 100
    };
  });

  const [isEditingBudgets, setIsEditingBudgets] = useState(false);
  const [tempBudgets, setTempBudgets] = useState(budgets);

  // Calculate actual spending per category for the selected date range
  const [actualSpending, setActualSpending] = useState({
    Food: 0,
    Transport: 0,
    Shopping: 0,
    Bills: 0,
    Other: 0
  });

  useEffect(() => {
    const filteredExpenses = expenses.filter(expense => {
      if (!dateRange.startDate || !dateRange.endDate) return true;
      return expense.date >= dateRange.startDate && expense.date <= dateRange.endDate;
    });

    const spending = {
      Food: 0,
      Transport: 0,
      Shopping: 0,
      Bills: 0,
      Other: 0
    };

    filteredExpenses.forEach(expense => {
      if (expense.items && expense.items.length > 0) {
        expense.items.forEach(item => {
          const itemCategory = item.category || 'Other';
          spending[itemCategory] += item.totalPrice || 0;
        });
      } else {
        const category = expense.category || 'Other';
        spending[category] += expense.totalAmount || 0;
      }
    });

    setActualSpending(spending);
  }, [expenses, dateRange]);

  const handleDateRangeChange = (range) => {
    setDateRange(range);
  };

  const handleSaveBudgets = () => {
    setBudgets(tempBudgets);
    localStorage.setItem('categoryBudgets', JSON.stringify(tempBudgets));
    setIsEditingBudgets(false);
  };

  const handleCancelEdit = () => {
    setTempBudgets(budgets);
    setIsEditingBudgets(false);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getPercentage = (actual, budget) => {
    if (budget === 0) return 0;
    return Math.min((actual / budget) * 100, 100);
  };

  const getStatusColor = (actual, budget) => {
    const percentage = (actual / budget) * 100;
    if (percentage >= 100) return '#e74c3c'; // Red - over budget
    if (percentage >= 80) return '#f39c12'; // Orange - close to budget
    return '#27ae60'; // Green - within budget
  };

  const totalBudget = Object.values(budgets).reduce((sum, val) => sum + val, 0);
  const totalSpending = Object.values(actualSpending).reduce((sum, val) => sum + val, 0);
  const totalPercentage = getPercentage(totalSpending, totalBudget);

  return (
    <div className="budget-manage">
      <div className="budget-header">
        <h2>Budget Management</h2>
        <p className="budget-subheading">
          Set budgets for each category and track your spending
        </p>
      </div>

      <TimeNavigator onRangeChange={handleDateRangeChange} expenses={expenses} />

      {/* Overall Budget Summary */}
      <div className="overall-budget-card">
        <div className="overall-budget-content">
          <div className="overall-budget-info">
            <div className="overall-budget-label">Total Budget</div>
            <div className="overall-budget-amount">{formatCurrency(totalBudget)}</div>
          </div>
          <div className="overall-budget-divider"></div>
          <div className="overall-budget-info">
            <div className="overall-budget-label">Total Spending</div>
            <div className="overall-budget-amount" style={{ color: getStatusColor(totalSpending, totalBudget) }}>
              {formatCurrency(totalSpending)}
            </div>
          </div>
          <div className="overall-budget-divider"></div>
          <div className="overall-budget-info">
            <div className="overall-budget-label">Remaining</div>
            <div className="overall-budget-amount" style={{ color: totalBudget - totalSpending >= 0 ? '#27ae60' : '#e74c3c' }}>
              {formatCurrency(totalBudget - totalSpending)}
            </div>
          </div>
        </div>
        <div className="overall-progress-bar">
          <div
            className="overall-progress-fill"
            style={{
              width: `${totalPercentage}%`,
              backgroundColor: getStatusColor(totalSpending, totalBudget)
            }}
          ></div>
        </div>
        <div className="overall-percentage">
          {totalPercentage.toFixed(1)}% of budget used
        </div>
      </div>

      {/* Budget Edit Controls */}
      <div className="budget-controls">
        {!isEditingBudgets ? (
          <button className="btn-edit-budgets" onClick={() => setIsEditingBudgets(true)}>
            ✏️ Edit Budgets
          </button>
        ) : (
          <div className="budget-edit-actions">
            <button className="btn-save" onClick={handleSaveBudgets}>
              ✓ Save Budgets
            </button>
            <button className="btn-cancel" onClick={handleCancelEdit}>
              ✕ Cancel
            </button>
          </div>
        )}
      </div>

      {/* Category Budgets */}
      <div className="category-budgets">
        {CATEGORIES.map(category => {
          const budget = isEditingBudgets ? tempBudgets[category.id] : budgets[category.id];
          const actual = actualSpending[category.id];
          const percentage = getPercentage(actual, budget);
          const remaining = budget - actual;
          const statusColor = getStatusColor(actual, budget);

          return (
            <div key={category.id} className="budget-category-card">
              <div className="budget-category-header" style={{ backgroundColor: category.color }}>
                <span className="budget-category-icon">{category.icon}</span>
                <span className="budget-category-name">{category.name}</span>
              </div>

              <div className="budget-category-content">
                {isEditingBudgets ? (
                  <div className="budget-input-group">
                    <label>Monthly Budget</label>
                    <div className="budget-input-wrapper">
                      <span className="budget-currency">$</span>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={tempBudgets[category.id]}
                        onChange={(e) => setTempBudgets({
                          ...tempBudgets,
                          [category.id]: parseFloat(e.target.value) || 0
                        })}
                        className="budget-input"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="budget-amounts">
                    <div className="budget-amount-item">
                      <span className="budget-amount-label">Budget</span>
                      <span className="budget-amount-value">{formatCurrency(budget)}</span>
                    </div>
                    <div className="budget-amount-item">
                      <span className="budget-amount-label">Spent</span>
                      <span className="budget-amount-value" style={{ color: statusColor }}>
                        {formatCurrency(actual)}
                      </span>
                    </div>
                    <div className="budget-amount-item">
                      <span className="budget-amount-label">Remaining</span>
                      <span className="budget-amount-value" style={{ color: remaining >= 0 ? '#27ae60' : '#e74c3c' }}>
                        {formatCurrency(remaining)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="budget-progress-bar">
                  <div
                    className="budget-progress-fill"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: statusColor
                    }}
                  ></div>
                </div>
                <div className="budget-percentage">
                  {percentage.toFixed(1)}% used
                  {percentage >= 100 && <span className="over-budget-badge">⚠️ Over Budget</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default BudgetManage;
