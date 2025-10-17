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

  // Remaining = Monthly Budget - Total Spent in Month So Far
  const totalRemaining = totalBudget - totalMonthSpending;
  const totalPercentage = getPercentage(totalMonthSpending, totalBudget);

  // Simple Pie Chart Component
  const PieChart = ({ data }) => {
    const total = Object.values(data).reduce((sum, val) => sum + val, 0);
    if (total === 0) return <div className="no-data-chart">No spending data</div>;

    let currentAngle = 0;
    const segments = CATEGORIES.map(category => {
      const value = data[category.id] || 0;
      const percentage = (value / total) * 100;
      const angle = (value / total) * 360;

      const segment = {
        category: category,
        value: value,
        percentage: percentage,
        startAngle: currentAngle,
        endAngle: currentAngle + angle
      };

      currentAngle += angle;
      return segment;
    }).filter(seg => seg.value > 0);

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

  // Time Comparison Bar Chart - Shows weekly or monthly spending comparison
  const TimeComparisonChart = () => {
    // Determine if we're showing weeks or months based on date range
    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);
    const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    // If date range is more than 60 days, show monthly comparison, otherwise show weekly
    const showMonthly = daysDiff > 60;

    let periods = [];

    if (showMonthly) {
      // Get last 6 months including current
      const monthsToShow = 6;
      const currentDate = new Date(dateRange.endDate);

      for (let i = monthsToShow - 1; i >= 0; i--) {
        const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const monthKey = getMonthKey(toLocalDateString(targetDate));
        const monthName = targetDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

        const monthTotal = expenses
          .filter(expense => expense.date && expense.date.startsWith(monthKey))
          .reduce((sum, expense) => {
            if (expense.items && expense.items.length > 0) {
              return sum + expense.items.reduce((itemSum, item) => itemSum + (item.totalPrice || 0), 0);
            }
            return sum + (expense.totalAmount || 0);
          }, 0);

        periods.push({ label: monthName, amount: monthTotal, key: monthKey });
      }
    } else {
      // Show weekly breakdown of current month
      const monthStart = new Date(currentMonth + '-01');
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

      // Get all weeks in the current month
      let currentWeekStart = new Date(monthStart);
      let weekNum = 1;

      while (currentWeekStart <= monthEnd) {
        const currentWeekEnd = new Date(currentWeekStart);
        currentWeekEnd.setDate(currentWeekStart.getDate() + 6);

        const weekEndCapped = currentWeekEnd > monthEnd ? monthEnd : currentWeekEnd;
        const weekStartStr = toLocalDateString(currentWeekStart);
        const weekEndStr = toLocalDateString(weekEndCapped);

        const weekTotal = expenses
          .filter(expense => expense.date && expense.date >= weekStartStr && expense.date <= weekEndStr)
          .reduce((sum, expense) => {
            if (expense.items && expense.items.length > 0) {
              return sum + expense.items.reduce((itemSum, item) => itemSum + (item.totalPrice || 0), 0);
            }
            return sum + (expense.totalAmount || 0);
          }, 0);

        const weekLabel = `Week ${weekNum}`;
        periods.push({ label: weekLabel, amount: weekTotal, key: weekStartStr });

        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        weekNum++;
      }
    }

    const maxAmount = Math.max(...periods.map(p => p.amount), 1);

    return (
      <div className="time-comparison-chart">
        <div className="comparison-bars">
          {periods.map((period, index) => {
            const heightPercent = (period.amount / maxAmount) * 100;
            const color = index === periods.length - 1 ? '#667eea' : '#95afc0';

            return (
              <div key={period.key} className="comparison-bar-group">
                <div className="comparison-bar-wrapper">
                  <div className="comparison-amount">{formatCurrency(period.amount)}</div>
                  <div
                    className="comparison-bar"
                    style={{
                      height: `${heightPercent}%`,
                      backgroundColor: color
                    }}
                  ></div>
                </div>
                <div className="comparison-label">{period.label}</div>
              </div>
            );
          })}
        </div>
        <div className="comparison-info">
          {showMonthly ? '📅 Monthly Comparison (Last 6 Months)' : '📊 Weekly Breakdown'}
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
          📊 Bar Chart
        </button>
      </div>

      {/* Overall Budget Summary - Only show in overview mode */}
      {viewMode === 'overview' && (
      <div className="overall-budget-card">
        <div className="overall-budget-content">
          <div className="overall-budget-info">
            <div className="overall-budget-label">Monthly Budget</div>
            <div className="overall-budget-amount">{formatCurrency(totalBudget)}</div>
          </div>
          <div className="overall-budget-divider"></div>
          <div className="overall-budget-info">
            <div className="overall-budget-label">Spent So Far</div>
            <div className="overall-budget-amount" style={{ color: getStatusColor(totalMonthSpending, totalBudget) }}>
              {formatCurrency(totalMonthSpending)}
            </div>
          </div>
          <div className="overall-budget-divider"></div>
          <div className="overall-budget-info">
            <div className="overall-budget-label">Remaining</div>
            <div className="overall-budget-amount" style={{ color: totalRemaining >= 0 ? '#2ecc71' : '#e74c3c' }}>
              {formatCurrency(totalRemaining)}
            </div>
          </div>
        </div>
        <div className="overall-progress-bar">
          <div
            className="overall-progress-fill"
            style={{
              width: `${totalPercentage}%`,
              backgroundColor: getStatusColor(totalMonthSpending, totalBudget)
            }}
          ></div>
        </div>
        <div className="overall-percentage">
          {totalPercentage.toFixed(1)}% of monthly budget used
        </div>
        {dateRange.startDate !== currentMonth + '-01' && (
          <div className="range-info">
            <small>Selected period spending: {formatCurrency(totalRangeSpending)}</small>
          </div>
        )}
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
          <h3>Spending Comparison</h3>
          <TimeComparisonChart />
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
