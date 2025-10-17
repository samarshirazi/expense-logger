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

function BudgetManage({ expenses }) {
  const [dateRange, setDateRange] = useState(() => {
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
  const [viewMode, setViewMode] = useState('overview'); // 'overview', 'pie', 'bar', 'comparison'

  // Get current month based on selected date range
  const currentMonth = getMonthKey(dateRange.startDate);

  // Get budget for current month (or default if not set)
  const currentBudget = monthlyBudgets[currentMonth] || { ...DEFAULT_BUDGET };

  // Calculate spending for the ENTIRE month (not just selected range)
  const [monthSpending, setMonthSpending] = useState({});

  // Calculate spending for selected date range only
  const [rangeSpending, setRangeSpending] = useState({});

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

    // Calculate spending for selected date range
    const filteredExpenses = expenses.filter(expense => {
      if (!expense.date) return false;
      if (!dateRange.startDate || !dateRange.endDate) return true;
      return expense.date >= dateRange.startDate && expense.date <= dateRange.endDate;
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

  const handleDateRangeChange = (range) => {
    setDateRange(range);
  };

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

  const totalBudget = Object.values(currentBudget).reduce((sum, val) => sum + val, 0);
  const totalMonthSpending = Object.values(monthSpending).reduce((sum, val) => sum + val, 0);
  const totalRangeSpending = Object.values(rangeSpending).reduce((sum, val) => sum + val, 0);

  // Check if viewing the entire month or a subset (daily/weekly)
  const monthStart = currentMonth + '-01';
  const monthEndDate = new Date(currentMonth + '-01');
  monthEndDate.setMonth(monthEndDate.getMonth() + 1);
  monthEndDate.setDate(0);
  const monthEnd = toLocalDateString(monthEndDate);
  const isViewingFullMonth = dateRange.startDate === monthStart && dateRange.endDate === monthEnd;

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

  // Month-to-Month Comparison Bar Graph
  const MonthComparisonChart = () => {
    // Get current month and previous month
    const prevMonthKey = getPreviousMonthKey(currentMonth);

    // Calculate current month spending by category
    const currentMonthData = { ...monthSpending };

    // Calculate previous month spending by category
    const prevMonthExpenses = expenses.filter(expense => {
      return expense.date && expense.date.startsWith(prevMonthKey);
    });

    const prevMonthData = {
      Food: 0,
      Transport: 0,
      Shopping: 0,
      Bills: 0,
      Other: 0
    };

    prevMonthExpenses.forEach(expense => {
      if (expense.items && expense.items.length > 0) {
        expense.items.forEach(item => {
          const itemCategory = item.category || 'Other';
          prevMonthData[itemCategory] += item.totalPrice || 0;
        });
      } else {
        const category = expense.category || 'Other';
        prevMonthData[category] += expense.totalAmount || 0;
      }
    });

    const hasPrevMonthData = Object.values(prevMonthData).some(val => val > 0);

    // Get month labels
    const currentMonthDate = new Date(currentMonth + '-01');
    const prevMonthDate = new Date(prevMonthKey + '-01');
    const currentLabel = currentMonthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const prevLabel = prevMonthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    // Calculate max value for scaling
    const allValues = [...Object.values(currentMonthData), ...Object.values(prevMonthData)];
    const maxValue = Math.max(...allValues, 1);

    return (
      <div className="month-comparison-chart">
        <div className="month-comparison-legend">
          {hasPrevMonthData && (
            <div className="month-legend-item">
              <span className="month-legend-box" style={{ backgroundColor: '#95afc0' }}></span>
              <span>{prevLabel}</span>
            </div>
          )}
          <div className="month-legend-item">
            <span className="month-legend-box" style={{ backgroundColor: '#667eea' }}></span>
            <span>{currentLabel}</span>
          </div>
        </div>

        <div className="month-comparison-bars">
          {CATEGORIES.map(category => {
            const prevAmount = prevMonthData[category.id] || 0;
            const currentAmount = currentMonthData[category.id] || 0;
            const prevHeight = maxValue > 0 ? (prevAmount / maxValue) * 100 : 0;
            const currentHeight = maxValue > 0 ? (currentAmount / maxValue) * 100 : 0;

            return (
              <div key={category.id} className="month-comparison-group">
                <div className="month-comparison-category">
                  <span className="month-category-icon">{category.icon}</span>
                  <span className="month-category-name">{category.name}</span>
                </div>
                <div className="month-bars-wrapper">
                  {hasPrevMonthData && (
                    <div className="month-bar-container">
                      <div className="month-bar-amount">{formatCurrency(prevAmount)}</div>
                      <div
                        className="month-bar"
                        style={{
                          height: `${prevHeight}%`,
                          backgroundColor: '#95afc0'
                        }}
                      ></div>
                    </div>
                  )}
                  <div className="month-bar-container">
                    <div className="month-bar-amount">{formatCurrency(currentAmount)}</div>
                    <div
                      className="month-bar"
                      style={{
                        height: `${currentHeight}%`,
                        backgroundColor: '#667eea'
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
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

      <TimeNavigator onRangeChange={handleDateRangeChange} expenses={expenses} />

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
        <button
          className={viewMode === 'bar' ? 'active' : ''}
          onClick={() => setViewMode('bar')}
        >
          📊 Bar Graph
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

      {viewMode === 'bar' && (
        <div className="chart-section">
          <h3>Month-to-Month Comparison</h3>
          <MonthComparisonChart />
        </div>
      )}

      {/* Category Budgets - Only show in overview mode */}
      {viewMode === 'overview' && (
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
    </div>
  );
}

export default BudgetManage;
