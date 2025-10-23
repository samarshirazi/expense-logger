import React, { useState, useEffect } from 'react';
import './BudgetManage.css';

// Helper function to format date in local timezone
const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get month key (YYYY-MM) from date
const getMonthKey = (dateString) => {
  return dateString.substring(0, 7); // "2024-01-15" -> "2024-01"
};

// Get previous month key
const getPreviousMonthKey = (monthKey) => {
  const [year, month] = monthKey.split('-').map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
};

const CATEGORIES = [
  { id: 'Food', name: 'Food', icon: '🍔', color: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' },
  { id: 'Transport', name: 'Transport', icon: '🚗', color: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)' },
  { id: 'Shopping', name: 'Shopping', icon: '🛍️', color: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)' },
  { id: 'Bills', name: 'Bills', icon: '💡', color: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },
  { id: 'Other', name: 'Other', icon: '📦', color: 'linear-gradient(135deg, #c2e9fb 0%, #a1c4fd 100%)' }
];

const DEFAULT_BUDGET = {
  Food: 500,
  Transport: 200,
  Shopping: 300,
  Bills: 400,
  Other: 100
};

function BudgetManage({ expenses, dateRange }) {
  // Per-month budgets stored as { "2024-01": { Food: 500, ... }, "2024-02": { ... } }
  const [monthlyBudgets, setMonthlyBudgets] = useState(() => {
    const saved = localStorage.getItem('monthlyBudgets');
    if (saved) {
      return JSON.parse(saved);
    }
    // Initialize current month with default budget
    const currentMonth = getMonthKey(toLocalDateString(new Date()));
    return { [currentMonth]: { ...DEFAULT_BUDGET } };
  });

  const [editingCategory, setEditingCategory] = useState(null);
  const [tempBudgetValue, setTempBudgetValue] = useState(0);
  const [showAISuggestions, setShowAISuggestions] = useState(true);
  const [autoAdjust, setAutoAdjust] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Use dateRange from props to determine current month
  const selectedMonth = dateRange?.startDate
    ? getMonthKey(dateRange.startDate)
    : getMonthKey(toLocalDateString(new Date()));

  // Calculate spending for the ENTIRE month and selected range
  const [monthSpending, setMonthSpending] = useState({});

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize budget for current month if not exists
  useEffect(() => {
    if (!monthlyBudgets[selectedMonth]) {
      const updatedBudgets = {
        ...monthlyBudgets,
        [selectedMonth]: { ...DEFAULT_BUDGET }
      };
      setMonthlyBudgets(updatedBudgets);
      localStorage.setItem('monthlyBudgets', JSON.stringify(updatedBudgets));
    }
  }, [selectedMonth, monthlyBudgets]);

  useEffect(() => {
    // Calculate spending for entire month
    const monthExpenses = expenses.filter(expense => {
      return expense.date && expense.date.startsWith(selectedMonth);
    });

    const monthTotals = {
      Food: 0,
      Transport: 0,
      Shopping: 0,
      Bills: 0,
      Other: 0
    };

    monthExpenses.forEach(expense => {
      if (expense.items && expense.items.length > 0) {
        expense.items.forEach(item => {
          const itemCategory = item.category || 'Other';
          monthTotals[itemCategory] += item.totalPrice || 0;
        });
      } else {
        const category = expense.category || 'Other';
        monthTotals[category] += expense.totalAmount || 0;
      }
    });

    setMonthSpending(monthTotals);
  }, [expenses, dateRange, selectedMonth]);

  const currentBudget = monthlyBudgets[selectedMonth] || { ...DEFAULT_BUDGET };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getPercentage = (actual, budget) => {
    if (budget === 0) return 0;
    return (actual / budget) * 100;
  };

  const getProgressColor = (percentage) => {
    if (percentage >= 90) return '#ef4444';
    if (percentage >= 70) return '#fbbf24';
    return '#10b981';
  };

  const totalBudget = Object.values(currentBudget).reduce((sum, val) => sum + val, 0);
  const totalMonthSpending = Object.values(monthSpending).reduce((sum, val) => sum + val, 0);
  const totalPercentage = getPercentage(totalMonthSpending, totalBudget);

  // Calculate AI suggestions based on actual spending
  const getAISuggestionData = () => {
    const categoriesOverBudget = [];
    const categoriesNearBudget = [];

    CATEGORIES.forEach(cat => {
      const budget = currentBudget[cat.id] || 0;
      const spent = monthSpending[cat.id] || 0;
      const percentage = getPercentage(spent, budget);

      if (percentage >= 100) {
        categoriesOverBudget.push({ name: cat.name, percentage, spent, budget });
      } else if (percentage >= 80) {
        categoriesNearBudget.push({ name: cat.name, percentage, spent, budget });
      }
    });

    return { categoriesOverBudget, categoriesNearBudget };
  };

  const { categoriesOverBudget, categoriesNearBudget } = getAISuggestionData();
  const shouldShowAISuggestions = categoriesOverBudget.length > 0 || categoriesNearBudget.length > 0;

  // Generate dynamic AI message
  const getAIMessage = () => {
    if (categoriesOverBudget.length > 0) {
      const names = categoriesOverBudget.map(c => c.name).join(' and ');
      return `You've exceeded your budget in ${names}. Consider adjusting your budgets or reducing spending.`;
    } else if (categoriesNearBudget.length > 0) {
      const names = categoriesNearBudget.map(c => c.name).join(' and ');
      return `You're approaching your budget limit in ${names}. Want to rebalance before you overspend?`;
    }
    return "Your spending is on track! Keep up the good work.";
  };

  // AI Summary calculation
  const getAISummary = () => {
    const prevMonth = getPreviousMonthKey(selectedMonth);
    const prevBudget = monthlyBudgets[prevMonth];

    if (prevBudget) {
      const prevSpending = expenses.filter(e => e.date && e.date.startsWith(prevMonth))
        .reduce((sum, e) => sum + (e.totalAmount || 0), 0);
      const diff = ((totalMonthSpending - prevSpending) / prevSpending * 100);

      if (diff < 0) {
        return `You're pacing ${Math.abs(diff).toFixed(0)}% lower than last month.`;
      } else {
        return `You're spending ${diff.toFixed(0)}% more than last month.`;
      }
    }

    return "Track your spending to get personalized insights.";
  };

  // Open edit modal for category
  const openEditModal = (categoryId) => {
    setEditingCategory(categoryId);
    setTempBudgetValue(currentBudget[categoryId] || 0);
  };

  // Close edit modal
  const closeEditModal = () => {
    setEditingCategory(null);
    setTempBudgetValue(0);
  };

  // Save budget for category
  const saveBudget = () => {
    if (!editingCategory) return;

    const updatedBudgets = {
      ...monthlyBudgets,
      [selectedMonth]: {
        ...currentBudget,
        [editingCategory]: tempBudgetValue
      }
    };

    setMonthlyBudgets(updatedBudgets);
    localStorage.setItem('monthlyBudgets', JSON.stringify(updatedBudgets));
    closeEditModal();
    showNotification('Budget updated successfully!');
  };

  // Reset all budgets
  const resetBudgets = () => {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm('Are you sure you want to reset all budgets for this month? This will set all budgets to $0.')) {
      return;
    }

    const updatedBudgets = {
      ...monthlyBudgets,
      [selectedMonth]: {
        Food: 0,
        Transport: 0,
        Shopping: 0,
        Bills: 0,
        Other: 0
      }
    };

    setMonthlyBudgets(updatedBudgets);
    localStorage.setItem('monthlyBudgets', JSON.stringify(updatedBudgets));
    showNotification('All budgets have been reset');
  };

  // AI Suggest feature
  const handleAISuggest = () => {
    showNotification('AI is analyzing your spending patterns...');

    setTimeout(() => {
      showNotification('AI suggestions ready! Check the panel for recommendations.');
    }, 2000);
  };

  // Rebalance budgets intelligently
  const handleRebalance = () => {
    showNotification('Rebalancing budgets based on AI suggestions...');

    setTimeout(() => {
      const rebalanced = { ...currentBudget };

      // Only adjust categories that are over or near budget
      [...categoriesOverBudget, ...categoriesNearBudget].forEach(item => {
        const categoryId = CATEGORIES.find(c => c.name === item.name)?.id;
        if (categoryId) {
          const spent = monthSpending[categoryId] || 0;
          // For over-budget: set to 110% of spending
          // For near-budget: set to 120% of current budget
          if (item.percentage >= 100) {
            rebalanced[categoryId] = Math.ceil(spent * 1.1);
          } else {
            rebalanced[categoryId] = Math.ceil(currentBudget[categoryId] * 1.2);
          }
        }
      });

      // Keep other categories unchanged
      CATEGORIES.forEach(cat => {
        if (!rebalanced[cat.id]) {
          rebalanced[cat.id] = currentBudget[cat.id];
        }
      });

      const updatedBudgets = {
        ...monthlyBudgets,
        [selectedMonth]: rebalanced
      };

      setMonthlyBudgets(updatedBudgets);
      localStorage.setItem('monthlyBudgets', JSON.stringify(updatedBudgets));
      setShowAISuggestions(false); // Hide panel after rebalancing
      showNotification('Budgets rebalanced successfully!');
    }, 1500);
  };

  // Save all changes
  const saveChanges = () => {
    localStorage.setItem('monthlyBudgets', JSON.stringify(monthlyBudgets));
    showNotification('All changes saved successfully!');
  };

  // Show notification
  const showNotification = (message) => {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 2rem;
      right: 2rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      z-index: 2000;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  };

  // Circular progress SVG gradient setup
  useEffect(() => {
    const svg = document.querySelector('.progress-ring');
    if (svg && !svg.querySelector('#gradient')) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      gradient.setAttribute('id', 'gradient');
      gradient.setAttribute('x1', '0%');
      gradient.setAttribute('y1', '0%');
      gradient.setAttribute('x2', '100%');
      gradient.setAttribute('y2', '100%');

      const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.setAttribute('style', 'stop-color:#667eea;stop-opacity:1');

      const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop2.setAttribute('offset', '100%');
      stop2.setAttribute('style', 'stop-color:#764ba2;stop-opacity:1');

      gradient.appendChild(stop1);
      gradient.appendChild(stop2);
      defs.appendChild(gradient);
      svg.insertBefore(defs, svg.firstChild);
    }
  }, []);

  // Calculate circular progress
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (Math.min(totalPercentage, 100) / 100) * circumference;

  return (
    <div className="budget-manage-modern">
      {/* Top Section */}
      <header className="budget-page-header">
        <div className="budget-header-content">
          <div className="budget-title-section">
            <h1>Manage Budgets</h1>
            <p className="budget-subtitle">Set monthly limits for your spending categories.</p>
          </div>
          <div className="budget-header-controls">
            <button className="ai-suggest-btn" onClick={handleAISuggest}>
              <span className="emoji">💬</span>
              <span className="btn-text">Ask AI for Smart Budgets</span>
              <span className="btn-text-mobile">AI</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="budget-main-content">
        <div className="budget-content-grid">
          {/* Left Column: Overview + Categories */}
          <div className="budget-left-column">
            {/* Budget Overview Card */}
            <div className="budget-card budget-overview-card">
              <h2 className="budget-card-title">Budget Overview</h2>
              <div className="budget-overview-content">
                <div className="circular-progress">
                  <svg className="progress-ring" width="200" height="200" viewBox="0 0 200 200">
                    <circle className="progress-ring-bg" cx="100" cy="100" r="80"></circle>
                    <circle
                      className="progress-ring-fill"
                      cx="100"
                      cy="100"
                      r="80"
                      style={{
                        strokeDasharray: circumference,
                        strokeDashoffset: progressOffset
                      }}
                    ></circle>
                  </svg>
                  <div className="progress-text">
                    <div className="progress-percent">{Math.round(totalPercentage)}%</div>
                    <div className="progress-label">spent</div>
                  </div>
                </div>
                <div className="overview-stats">
                  <div className="stat-row">
                    <span className="stat-label">Spent</span>
                    <span className="stat-value spent">{formatCurrency(totalMonthSpending)}</span>
                  </div>
                  <div className="stat-row">
                    <span className="stat-label">Budget</span>
                    <span className="stat-value">{formatCurrency(totalBudget)}</span>
                  </div>
                </div>
              </div>
              <div className="ai-summary">
                <span className="ai-icon">✨</span>
                <span>{getAISummary()}</span>
              </div>
            </div>

            {/* Mobile AI Alert */}
            {isMobile && shouldShowAISuggestions && showAISuggestions && (
              <div className="budget-card ai-panel-mobile">
                <div className="ai-content-mobile">
                  <div className="ai-header-mobile">
                    <span className="ai-icon-mobile">
                      {categoriesOverBudget.length > 0 ? '⚠️' : '💡'}
                    </span>
                    <span className="ai-title-mobile">AI Alert</span>
                    <button
                      className="ai-close-mobile"
                      onClick={() => setShowAISuggestions(false)}
                    >
                      ×
                    </button>
                  </div>
                  <p className="ai-message-mobile">
                    {getAIMessage()}
                  </p>
                  {(categoriesOverBudget.length > 0 || categoriesNearBudget.length > 0) && (
                    <button className="btn-rebalance-mobile" onClick={handleRebalance}>
                      Rebalance Budgets
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Category Budget Cards */}
            <div className="categories-section">
              <h2 className="section-title">Category Budgets</h2>
              <div className="category-grid">
                {CATEGORIES.map(category => {
                  const budget = currentBudget[category.id] || 0;
                  const spent = monthSpending[category.id] || 0;
                  const percentage = getPercentage(spent, budget);
                  const progressColor = getProgressColor(percentage);

                  return (
                    <div
                      key={category.id}
                      className="category-card"
                      onClick={() => openEditModal(category.id)}
                    >
                      <div className="category-header">
                        <div className="category-info">
                          <div className="category-icon" style={{ background: category.color }}>
                            {category.icon}
                          </div>
                          <div className="category-name">{category.name}</div>
                        </div>
                        <div className="edit-icon">✏️</div>
                      </div>
                      <div className="category-amounts">
                        <span className="amount-spent">Spent {formatCurrency(spent)}</span>
                        <span className="amount-budget">Budget {formatCurrency(budget)}</span>
                      </div>
                      <div className="progress-bar-container">
                        <div
                          className="progress-bar"
                          style={{
                            width: `${Math.min(percentage, 100)}%`,
                            background: progressColor
                          }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: AI Suggestions */}
          {!isMobile && shouldShowAISuggestions && showAISuggestions && (
            <div className="budget-right-column">
              <div className="budget-card ai-panel">
                <h3 className="budget-card-title">AI Suggestions</h3>
                <div className="ai-content">
                  <div className="ai-icon-large">
                    {categoriesOverBudget.length > 0 ? '⚠️' : '💡'}
                  </div>
                  <p className="ai-message">
                    {getAIMessage()}
                  </p>
                  {(categoriesOverBudget.length > 0 || categoriesNearBudget.length > 0) && (
                    <div className="ai-actions">
                      <button className="btn-secondary" onClick={() => setShowAISuggestions(false)}>Ignore</button>
                      <button className="btn-gradient" onClick={handleRebalance}>Rebalance</button>
                    </div>
                  )}
                  <div className="ai-toggle">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={autoAdjust}
                        onChange={(e) => setAutoAdjust(e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <span className="toggle-label">Auto-adjust next month's budgets</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="action-bar">
        <button className="btn-reset" onClick={resetBudgets}>Reset All Budgets</button>
        <button className="btn-save" onClick={saveChanges}>
          <span className="save-icon">💾</span>
          <span>Save Changes</span>
        </button>
      </div>

      {/* Mobile Floating Save Button */}
      {isMobile && (
        <button className="floating-save-btn" onClick={saveChanges}>
          <span>💾</span>
        </button>
      )}

      {/* Edit Budget Modal */}
      {editingCategory && (
        <div className="modal-overlay active" onClick={closeEditModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit {editingCategory} Budget</h3>
              <button className="modal-close" onClick={closeEditModal}>×</button>
            </div>
            <div className="modal-body">
              <div
                className="modal-category-icon"
                style={{
                  background: CATEGORIES.find(c => c.id === editingCategory)?.color
                }}
              >
                {CATEGORIES.find(c => c.id === editingCategory)?.icon}
              </div>
              <div className="modal-form">
                <label htmlFor="budgetInput">Monthly Budget</label>
                <div className="input-with-currency">
                  <span className="currency-symbol">$</span>
                  <input
                    type="number"
                    id="budgetInput"
                    placeholder="0.00"
                    step="0.01"
                    value={tempBudgetValue}
                    onChange={(e) => setTempBudgetValue(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="slider-container">
                  <input
                    type="range"
                    id="budgetSlider"
                    min="0"
                    max="1000"
                    step="10"
                    value={tempBudgetValue}
                    onChange={(e) => setTempBudgetValue(parseFloat(e.target.value))}
                  />
                  <div className="slider-labels">
                    <span>$0</span>
                    <span>$1,000</span>
                  </div>
                </div>
                <div className="current-spending">
                  <span>Current spending: </span>
                  <strong>{formatCurrency(monthSpending[editingCategory] || 0)}</strong>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeEditModal}>Cancel</button>
              <button className="btn-gradient" onClick={saveBudget}>Save Budget</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BudgetManage;
