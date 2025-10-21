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
  { id: 'Food', name: 'Food', icon: '🍔', color: '#ff6b6b' },
  { id: 'Transport', name: 'Transport', icon: '🚗', color: '#4ecdc4' },
  { id: 'Shopping', name: 'Shopping', icon: '🛍️', color: '#45b7d1' },
  { id: 'Bills', name: 'Bills', icon: '💡', color: '#f9ca24' },
  { id: 'Other', name: 'Other', icon: '📦', color: '#95afc0' }
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

  const [isEditingBudgets, setIsEditingBudgets] = useState(false);
  const [tempBudgets, setTempBudgets] = useState({});
  const [viewMode, setViewMode] = useState('overview'); // 'overview', 'pie'
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  // Get current month based on selected date range
  const currentMonth = getMonthKey(dateRange?.startDate || toLocalDateString(new Date()));

  // Get budget for current month (or default if not set)
  const currentBudget = monthlyBudgets[currentMonth] || { ...DEFAULT_BUDGET };

  // Calculate spending for the ENTIRE month (not just selected range)
  const [monthSpending, setMonthSpending] = useState({});

  // Calculate spending for selected date range only
  const [rangeSpending, setRangeSpending] = useState({});

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Calculate spending for entire month
    const monthExpenses = expenses.filter(expense => {
      return expense.date && expense.date.startsWith(currentMonth);
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

    // Calculate CUMULATIVE spending from month start up to selected end date
    // This ensures daily/weekly views show cumulative totals, not just that period
    const monthStartDate = currentMonth + '-01';
    const filteredExpenses = expenses.filter(expense => {
      if (!expense.date) return false;
      if (!dateRange?.startDate || !dateRange?.endDate) return true;
      // Filter from start of month to selected end date for cumulative totals
      return expense.date >= monthStartDate && expense.date <= dateRange.endDate;
    });

    const rangeTotals = {
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
          rangeTotals[itemCategory] += item.totalPrice || 0;
        });
      } else {
        const category = expense.category || 'Other';
        rangeTotals[category] += expense.totalAmount || 0;
      }
    });

    setRangeSpending(rangeTotals);
  }, [expenses, dateRange, currentMonth]);

  const handleSaveBudgets = () => {
    const updatedBudgets = {
      ...monthlyBudgets,
      [currentMonth]: tempBudgets
    };
    setMonthlyBudgets(updatedBudgets);
    localStorage.setItem('monthlyBudgets', JSON.stringify(updatedBudgets));
    setIsEditingBudgets(false);
  };

  const handleCancelEdit = () => {
    setTempBudgets({});
    setIsEditingBudgets(false);
  };

  const handleStartEdit = () => {
    setTempBudgets({ ...currentBudget });
    setIsEditingBudgets(true);
  };

  const handleCopyPreviousMonth = () => {
    const prevMonth = getPreviousMonthKey(currentMonth);
    const prevBudget = monthlyBudgets[prevMonth];

    if (prevBudget) {
      setTempBudgets({ ...prevBudget });
    } else {
      setTempBudgets({ ...DEFAULT_BUDGET });
    }
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
    if (percentage >= 100) return '#e74c3c';
    if (percentage >= 80) return '#f39c12';
    return '#27ae60';
  };

  const getExpensesByCategory = (categoryId) => {
    return expenses.filter(expense => {
      if (!expense.date || !expense.date.startsWith(currentMonth)) return false;

      if (expense.items && expense.items.length > 0) {
        return expense.items.some(item => (item.category || 'Other') === categoryId);
      } else {
        return (expense.category || 'Other') === categoryId;
      }
    }).map(expense => {
      if (expense.items && expense.items.length > 0) {
        const relevantItems = expense.items.filter(item => (item.category || 'Other') === categoryId);
        return relevantItems.map((item, idx) => ({
          id: `${expense.id}-${idx}`,
          merchantName: expense.merchantName,
          description: item.description,
          amount: item.totalPrice || 0,
          date: expense.date,
          hasReceipt: !!expense.receiptUrl || !!expense.thumbnailUrl
        }));
      } else {
        return [{
          id: expense.id,
          merchantName: expense.merchantName,
          description: expense.merchantName,
          amount: expense.totalAmount || 0,
          date: expense.date,
          hasReceipt: !!expense.receiptUrl || !!expense.thumbnailUrl
        }];
      }
    }).flat();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const totalBudget = Object.values(currentBudget).reduce((sum, val) => sum + val, 0);
  const totalMonthSpending = Object.values(monthSpending).reduce((sum, val) => sum + val, 0);
  const totalRangeSpending = Object.values(rangeSpending).reduce((sum, val) => sum + val, 0);

  // Check if viewing the entire month or a subset (daily/weekly)
  const monthStart = currentMonth + '-01';
  const monthEndDate = new Date(currentMonth + '-01');
  monthEndDate.setMonth(monthEndDate.getMonth() + 1);
  monthEndDate.setDate(0);
  const monthEnd = toLocalDateString(monthEndDate);
  const isViewingFullMonth = dateRange?.startDate === monthStart && dateRange?.endDate === monthEnd;

  // For overview display: use range spending for daily/weekly views, month spending for full month
  const displaySpending = isViewingFullMonth ? totalMonthSpending : totalRangeSpending;
  const displayRemaining = totalBudget - displaySpending;
  const displayPercentage = getPercentage(displaySpending, totalBudget);

  // Pie Chart Component with Remaining Budget
  const PieChart = ({ data }) => {
    const spentTotal = Object.values(data).reduce((sum, val) => sum + val, 0);
    const remaining = Math.max(0, totalBudget - spentTotal);
    const grandTotal = spentTotal + remaining;

    if (grandTotal === 0) return <div className="no-data-chart">No budget data</div>;

    let currentAngle = 0;
    const segments = [];

    // Add category segments
    CATEGORIES.forEach(category => {
      const value = data[category.id] || 0;
      if (value > 0) {
        const percentage = (value / grandTotal) * 100;
        const angle = (value / grandTotal) * 360;

        segments.push({
          category: category,
          value: value,
          percentage: percentage,
          startAngle: currentAngle,
          endAngle: currentAngle + angle,
          isRemaining: false
        });

        currentAngle += angle;
      }
    });

    // Add remaining budget segment
    if (remaining > 0) {
      const percentage = (remaining / grandTotal) * 100;
      const angle = (remaining / grandTotal) * 360;

      segments.push({
        category: { id: 'Remaining', name: 'Remaining Budget', icon: '💰', color: '#27ae60' },
        value: remaining,
        percentage: percentage,
        startAngle: currentAngle,
        endAngle: currentAngle + angle,
        isRemaining: true
      });
    }

    return (
      <div className="pie-chart-container">
        <svg viewBox="0 0 200 200" className="pie-chart">
          {segments.map((seg, index) => {
            const x1 = 100 + 90 * Math.cos((seg.startAngle - 90) * Math.PI / 180);
            const y1 = 100 + 90 * Math.sin((seg.startAngle - 90) * Math.PI / 180);
            const x2 = 100 + 90 * Math.cos((seg.endAngle - 90) * Math.PI / 180);
            const y2 = 100 + 90 * Math.sin((seg.endAngle - 90) * Math.PI / 180);
            const largeArc = (seg.endAngle - seg.startAngle) > 180 ? 1 : 0;

            const path = `M 100 100 L ${x1} ${y1} A 90 90 0 ${largeArc} 1 ${x2} ${y2} Z`;

            return (
              <path
                key={seg.category.id}
                d={path}
                fill={seg.category.color}
                stroke="white"
                strokeWidth="2"
              />
            );
          })}
        </svg>
        <div className="pie-chart-legend">
          {segments.map(seg => (
            <div key={seg.category.id} className="legend-item">
              <span className="legend-color" style={{ backgroundColor: seg.category.color }}></span>
              <span className="legend-label">{seg.category.icon} {seg.category.name}</span>
              <span className="legend-value">{formatCurrency(seg.value)} ({seg.percentage.toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="budget-manage">
      <div className="budget-header">
        <h2>Budget Management</h2>
        <p className="budget-subheading">
          Set monthly budgets and track your spending - {currentMonth}
        </p>
      </div>

      {/* View Mode Toggle */}
      <div className="view-mode-selector">
        <button
          className={viewMode === 'overview' ? 'active' : ''}
          onClick={() => setViewMode('overview')}
        >
          📊 Overview
        </button>
        <button
          className={viewMode === 'pie' ? 'active' : ''}
          onClick={() => setViewMode('pie')}
        >
          🥧 Pie Chart
        </button>
      </div>

      {/* Overall Budget Summary - Only show in overview mode */}
      {viewMode === 'overview' && (
      <div className="overall-budget-card">
        <div className="overall-budget-content">
          <div className="overall-budget-info">
            <div className="overall-budget-label">{isViewingFullMonth ? 'Monthly Budget' : 'Budget'}</div>
            <div className="overall-budget-amount">{formatCurrency(totalBudget)}</div>
          </div>
          <div className="overall-budget-divider"></div>
          <div className="overall-budget-info">
            <div className="overall-budget-label">{isViewingFullMonth ? 'Spent (Month)' : 'Spent (Period)'}</div>
            <div className="overall-budget-amount" style={{ color: getStatusColor(displaySpending, totalBudget) }}>
              {formatCurrency(displaySpending)}
            </div>
          </div>
          <div className="overall-budget-divider"></div>
          <div className="overall-budget-info">
            <div className="overall-budget-label">Remaining</div>
            <div className="overall-budget-amount" style={{ color: displayRemaining >= 0 ? '#2ecc71' : '#e74c3c' }}>
              {formatCurrency(displayRemaining)}
            </div>
          </div>
        </div>
        <div className="overall-progress-bar">
          <div
            className="overall-progress-fill"
            style={{
              width: `${displayPercentage}%`,
              backgroundColor: getStatusColor(displaySpending, totalBudget)
            }}
          ></div>
        </div>
        <div className="overall-percentage">
          {displayPercentage.toFixed(1)}% of budget used {isViewingFullMonth ? 'this month' : 'in selected period'}
        </div>
      </div>
      )}

      {/* Budget Edit Controls - Only show in overview mode */}
      {viewMode === 'overview' && (
      <div className="budget-controls">
        {!isEditingBudgets ? (
          <button className="btn-edit-budgets" onClick={handleStartEdit}>
            ✏️ Edit Budget for {currentMonth}
          </button>
        ) : (
          <div className="budget-edit-actions">
            <button className="btn-copy" onClick={handleCopyPreviousMonth}>
              📋 Copy Previous Month
            </button>
            <button className="btn-save" onClick={handleSaveBudgets}>
              ✓ Save Budget
            </button>
            <button className="btn-cancel" onClick={handleCancelEdit}>
              ✕ Cancel
            </button>
          </div>
        )}
      </div>
      )}

      {/* Charts View */}
      {viewMode === 'pie' && (
        <div className="chart-section">
          <h3>Spending Distribution</h3>
          <PieChart data={rangeSpending} />
        </div>
      )}

      {/* AI Review Button - Mobile Only */}
      {isMobile && viewMode === 'overview' && (
        <button className="ai-review-chip">
          💬 Review with AI
        </button>
      )}

      {/* Category Budgets - Mobile Compact Grid */}
      {isMobile && viewMode === 'overview' && (
        <div className="category-grid-mobile">
          {CATEGORIES.map(category => {
            const budget = currentBudget[category.id];
            const monthActual = monthSpending[category.id] || 0;
            const percentage = getPercentage(monthActual, budget);
            const statusColor = getStatusColor(monthActual, budget);
            const categoryExpenses = getExpensesByCategory(category.id);
            const itemCount = categoryExpenses.length;

            return (
              <div
                key={category.id}
                className="category-card-compact"
                onClick={() => setExpandedCategory(category.id)}
              >
                <div className="category-card-badge" style={{ backgroundColor: category.color }}>
                  {itemCount}
                </div>
                <div className="category-card-icon" style={{ color: category.color }}>
                  {category.icon}
                </div>
                <div className="category-card-name">{category.name}</div>
                <div className="category-card-amount" style={{ color: statusColor }}>
                  {formatCurrency(monthActual)}
                </div>
                <div className="category-card-progress">
                  <div
                    className="category-card-progress-fill"
                    style={{
                      width: `${percentage}%`,
                      background: `linear-gradient(90deg, ${category.color}dd, ${category.color})`
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Category Budgets - Desktop View - Only show in overview mode */}
      {!isMobile && viewMode === 'overview' && (
        <div className="category-budgets">
          {CATEGORIES.map(category => {
            const budget = isEditingBudgets ? (tempBudgets[category.id] || 0) : currentBudget[category.id];
            const monthActual = monthSpending[category.id] || 0;
            const rangeActual = rangeSpending[category.id] || 0;
            const percentage = getPercentage(monthActual, budget);
            const remaining = budget - monthActual;
            const statusColor = getStatusColor(monthActual, budget);

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
                          value={tempBudgets[category.id] || 0}
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
                        <span className="budget-amount-label">Spent (Month)</span>
                        <span className="budget-amount-value" style={{ color: statusColor }}>
                          {formatCurrency(monthActual)}
                        </span>
                      </div>
                      {dateRange.startDate !== currentMonth + '-01' && (
                        <div className="budget-amount-item">
                          <span className="budget-amount-label">Spent (Range)</span>
                          <span className="budget-amount-value">
                            {formatCurrency(rangeActual)}
                          </span>
                        </div>
                      )}
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
      )}

      {/* Bottom Sheet for Expanded Category - Mobile Only */}
      {isMobile && expandedCategory && (
        <div className="bottom-sheet-overlay" onClick={() => setExpandedCategory(null)}>
          <div className="bottom-sheet-category" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />
            {(() => {
              const category = CATEGORIES.find(c => c.id === expandedCategory);
              const budget = currentBudget[expandedCategory];
              const monthActual = monthSpending[expandedCategory] || 0;
              const percentage = getPercentage(monthActual, budget);
              const remaining = budget - monthActual;
              const statusColor = getStatusColor(monthActual, budget);
              const categoryExpenses = getExpensesByCategory(expandedCategory);

              return (
                <>
                  <div className="bottom-sheet-header-category">
                    <div className="bottom-sheet-category-icon" style={{ color: category.color }}>
                      {category.icon}
                    </div>
                    <div className="bottom-sheet-category-info">
                      <h3>{category.name}</h3>
                      <div className="bottom-sheet-category-stats">
                        <span className="stat-item">
                          <span className="stat-label">Spent:</span>
                          <span className="stat-value" style={{ color: statusColor }}>
                            {formatCurrency(monthActual)}
                          </span>
                        </span>
                        <span className="stat-divider">•</span>
                        <span className="stat-item">
                          <span className="stat-label">Budget:</span>
                          <span className="stat-value">{formatCurrency(budget)}</span>
                        </span>
                        <span className="stat-divider">•</span>
                        <span className="stat-item">
                          <span className="stat-label">Left:</span>
                          <span className="stat-value" style={{ color: remaining >= 0 ? '#27ae60' : '#e74c3c' }}>
                            {formatCurrency(remaining)}
                          </span>
                        </span>
                      </div>
                      <div className="bottom-sheet-progress">
                        <div
                          className="bottom-sheet-progress-fill"
                          style={{
                            width: `${percentage}%`,
                            background: `linear-gradient(90deg, ${category.color}dd, ${category.color})`
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bottom-sheet-expenses">
                    <div className="bottom-sheet-expenses-title">
                      {categoryExpenses.length} Transaction{categoryExpenses.length !== 1 ? 's' : ''}
                    </div>
                    {categoryExpenses.length > 0 ? (
                      <div className="expenses-list-compact">
                        {categoryExpenses.map(exp => (
                          <div key={exp.id} className="expense-item-compact">
                            <div className="expense-item-main">
                              <div className="expense-item-info">
                                <div className="expense-item-title">{exp.description}</div>
                                {exp.merchantName !== exp.description && (
                                  <div className="expense-item-merchant">{exp.merchantName}</div>
                                )}
                              </div>
                              <div className="expense-item-amount" style={{ color: category.color }}>
                                {formatCurrency(exp.amount)}
                              </div>
                            </div>
                            <div className="expense-item-meta">
                              <span className="expense-item-date">{formatDate(exp.date)}</span>
                              {exp.hasReceipt && (
                                <>
                                  <span className="meta-dot">•</span>
                                  <span className="expense-item-tag">📎 Receipt</span>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-expenses">No expenses in this category yet</div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Floating Add Button - Mobile Only */}
      {isMobile && (
        <button className="floating-add-btn">
          + Add Expense
        </button>
      )}
    </div>
  );
}

export default BudgetManage;
