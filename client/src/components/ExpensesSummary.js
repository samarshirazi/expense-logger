import React, { useState, useEffect } from 'react';
import { updateExpenseItem, updateExpense } from '../services/apiService';
import './ExpensesSummary.css';

// Helper function to format date in local timezone (avoids timezone shift)
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

function ExpensesSummary({ expenses, dateRange }) {
  const [viewMode, setViewMode] = useState('summary'); // 'summary' or 'linegraph'

  // Month selectors for line graph
  const currentMonth = getMonthKey(toLocalDateString(new Date()));
  const [selectedMonth1, setSelectedMonth1] = useState(currentMonth);
  const [selectedMonth2, setSelectedMonth2] = useState(() => getPreviousMonthKey(currentMonth));

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({
    description: '',
    totalPrice: '',
    date: ''
  });

  const [tableData, setTableData] = useState({
    byDate: {}, // { 'YYYY-MM-DD': { Food: [], Transport: [], ... } }
    categoryTotals: { Food: 0, Transport: 0, Shopping: 0, Bills: 0, Other: 0 }
  });

  // Group items by date and category
  useEffect(() => {
    const filteredExpenses = expenses.filter(expense => {
      if (!dateRange?.startDate || !dateRange?.endDate) return true;
      return expense.date >= dateRange.startDate && expense.date <= dateRange.endDate;
    });

    const byDate = {};
    const categoryTotals = {
      Food: 0,
      Transport: 0,
      Shopping: 0,
      Bills: 0,
      Other: 0
    };

    filteredExpenses.forEach(expense => {
      const date = expense.date;

      if (!byDate[date]) {
        byDate[date] = {
          Food: [],
          Transport: [],
          Shopping: [],
          Bills: [],
          Other: []
        };
      }

      if (expense.items && expense.items.length > 0) {
        expense.items.forEach((item, itemIndex) => {
          const itemCategory = item.category || 'Other';
          const itemWithMetadata = {
            ...item,
            expenseId: expense.id,
            itemIndex: itemIndex,
            merchantName: expense.merchantName,
            date: expense.date,
            currency: expense.currency
          };

          byDate[date][itemCategory].push(itemWithMetadata);
          categoryTotals[itemCategory] += item.totalPrice || 0;
        });
      } else {
        const category = expense.category || 'Other';
        const expenseAsItem = {
          description: expense.merchantName,
          totalPrice: expense.totalAmount,
          quantity: 1,
          expenseId: expense.id,
          itemIndex: -1,
          merchantName: expense.merchantName,
          date: expense.date,
          currency: expense.currency
        };

        byDate[date][category].push(expenseAsItem);
        categoryTotals[category] += expense.totalAmount || 0;
      }
    });

    setTableData({ byDate, categoryTotals });
  }, [expenses, dateRange]);

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No date';
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Handle item click to edit
  const handleItemClick = (item) => {
    setEditItem(item);
    setEditForm({
      description: item.description || item.merchantName || '',
      totalPrice: item.totalPrice || 0,
      date: item.date || ''
    });
    setShowEditModal(true);
  };

  // Handle edit form submission
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editItem) return;

    try {
      if (editItem.itemIndex === -1) {
        // Whole expense
        await updateExpense(editItem.expenseId, {
          merchantName: editForm.description,
          totalAmount: parseFloat(editForm.totalPrice),
          date: editForm.date
        });
      } else {
        // Individual item
        await updateExpenseItem(editItem.expenseId, editItem.itemIndex, {
          description: editForm.description,
          totalPrice: parseFloat(editForm.totalPrice)
        });
        // Also update parent expense date
        await updateExpense(editItem.expenseId, { date: editForm.date });
      }

      setShowEditModal(false);
      setEditItem(null);

      // Reload page to refresh data
      window.location.reload();
    } catch (err) {
      console.error('Update failed:', err);
      alert(`Failed to update: ${err.message}`);
    }
  };

  // Get sorted dates
  const sortedDates = Object.keys(tableData.byDate).sort();
  const totalSpending = Object.values(tableData.categoryTotals).reduce((sum, val) => sum + val, 0);

  // Line Graph Component for month comparison
  const MonthLineGraph = () => {
    // Get budget from localStorage
    const DEFAULT_BUDGET = {
      Food: 500,
      Transport: 200,
      Shopping: 300,
      Bills: 400,
      Other: 100
    };

    const monthlyBudgets = JSON.parse(localStorage.getItem('monthlyBudgets') || '{}');
    const month1Budget = monthlyBudgets[selectedMonth1] || DEFAULT_BUDGET;
    const month2Budget = monthlyBudgets[selectedMonth2] || DEFAULT_BUDGET;

    // Calculate total budget for each month
    const totalMonth1Budget = Object.values(month1Budget).reduce((sum, val) => sum + val, 0);
    const totalMonth2Budget = Object.values(month2Budget).reduce((sum, val) => sum + val, 0);

    // Calculate spending for month 1 by day
    const month1Expenses = expenses.filter(expense => {
      return expense.date && expense.date.startsWith(selectedMonth1);
    });

    // Calculate spending for month 2 by day
    const month2Expenses = expenses.filter(expense => {
      return expense.date && expense.date.startsWith(selectedMonth2);
    });

    // Group by day of month (1-31)
    const month1ByDay = {};
    const month2ByDay = {};

    month1Expenses.forEach(expense => {
      const day = parseInt(expense.date.split('-')[2], 10);
      if (!month1ByDay[day]) month1ByDay[day] = 0;

      if (expense.items && expense.items.length > 0) {
        expense.items.forEach(item => {
          month1ByDay[day] += item.totalPrice || 0;
        });
      } else {
        month1ByDay[day] += expense.totalAmount || 0;
      }
    });

    month2Expenses.forEach(expense => {
      const day = parseInt(expense.date.split('-')[2], 10);
      if (!month2ByDay[day]) month2ByDay[day] = 0;

      if (expense.items && expense.items.length > 0) {
        expense.items.forEach(item => {
          month2ByDay[day] += item.totalPrice || 0;
        });
      } else {
        month2ByDay[day] += expense.totalAmount || 0;
      }
    });

    // Get month labels
    const [year1, monthNum1] = selectedMonth1.split('-').map(Number);
    const [year2, monthNum2] = selectedMonth2.split('-').map(Number);
    const month1Date = new Date(year1, monthNum1 - 1, 1);
    const month2Date = new Date(year2, monthNum2 - 1, 1);
    const month1Label = month1Date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const month2Label = month2Date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    // Fixed max day to 31
    const maxDay = 31;

    // Calculate cumulative spending for each day
    const month1Cumulative = {};
    const month2Cumulative = {};
    let month1Running = 0;
    let month2Running = 0;

    for (let day = 1; day <= maxDay; day++) {
      month1Running += month1ByDay[day] || 0;
      month2Running += month2ByDay[day] || 0;
      month1Cumulative[day] = month1Running;
      month2Cumulative[day] = month2Running;
    }

    // Use the maximum budget as the Y-axis max value
    const maxValue = Math.max(totalMonth1Budget, totalMonth2Budget, month1Running, month2Running, 100);

    // Create SVG points for line graph
    const width = 600;
    const height = 300;
    const padding = 50;
    const graphWidth = width - (padding * 2);
    const graphHeight = height - (padding * 2);

    const month1Points = [];
    const month2Points = [];

    for (let day = 1; day <= maxDay; day++) {
      const x = padding + ((day - 1) / (maxDay - 1)) * graphWidth;
      const y1 = padding + graphHeight - ((month1Cumulative[day] || 0) / maxValue) * graphHeight;
      const y2 = padding + graphHeight - ((month2Cumulative[day] || 0) / maxValue) * graphHeight;

      month1Points.push(`${x},${y1}`);
      month2Points.push(`${x},${y2}`);
    }

    return (
      <div className="line-graph-container">
        {/* Month Selectors */}
        <div className="month-selectors">
          <div className="month-selector-group">
            <label>First Month:</label>
            <input
              type="month"
              value={selectedMonth1}
              onChange={(e) => setSelectedMonth1(e.target.value)}
              className="month-select"
            />
          </div>
          <div className="month-selector-group">
            <label>Second Month:</label>
            <input
              type="month"
              value={selectedMonth2}
              onChange={(e) => setSelectedMonth2(e.target.value)}
              className="month-select"
            />
          </div>
        </div>

        {/* Legend */}
        <div className="line-graph-legend">
          <div className="legend-item">
            <span className="legend-line" style={{ backgroundColor: '#667eea' }}></span>
            <span>{month1Label} Spending</span>
          </div>
          <div className="legend-item">
            <span className="legend-line" style={{ backgroundColor: '#f093fb' }}></span>
            <span>{month2Label} Spending</span>
          </div>
          <div className="legend-item">
            <span className="legend-line" style={{ backgroundColor: '#27ae60', borderStyle: 'dashed' }}></span>
            <span>{month1Label} Budget</span>
          </div>
          <div className="legend-item">
            <span className="legend-line" style={{ backgroundColor: '#e74c3c', borderStyle: 'dashed' }}></span>
            <span>{month2Label} Budget</span>
          </div>
        </div>

        {/* SVG Line Graph */}
        <div className="line-graph-svg-container">
          <svg viewBox={`0 0 ${width} ${height}`} className="line-graph-svg">
            {/* Grid lines */}
            <g className="grid-lines">
              {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
                <line
                  key={ratio}
                  x1={padding}
                  y1={padding + graphHeight * (1 - ratio)}
                  x2={width - padding}
                  y2={padding + graphHeight * (1 - ratio)}
                  stroke="#e0e0e0"
                  strokeWidth="1"
                />
              ))}
            </g>

            {/* Y-axis labels */}
            <g className="y-axis-labels">
              {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
                const value = maxValue * ratio;
                return (
                  <text
                    key={ratio}
                    x={padding - 5}
                    y={padding + graphHeight * (1 - ratio) + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="#666"
                    fontWeight="500"
                  >
                    ${Math.round(value).toLocaleString()}
                  </text>
                );
              })}
            </g>

            {/* X-axis day labels */}
            <g className="x-axis-labels">
              {[1, 5, 10, 15, 20, 25, 31].map(day => {
                const x = padding + ((day - 1) / (maxDay - 1)) * graphWidth;
                return (
                  <text
                    key={day}
                    x={x}
                    y={height - padding + 20}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#666"
                    fontWeight="500"
                  >
                    {day}
                  </text>
                );
              })}
            </g>

            {/* Month 1 line */}
            <polyline
              points={month1Points.join(' ')}
              fill="none"
              stroke="#667eea"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Month 2 line */}
            <polyline
              points={month2Points.join(' ')}
              fill="none"
              stroke="#f093fb"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Budget line for Month 1 */}
            <line
              x1={padding}
              y1={padding + graphHeight - (totalMonth1Budget / maxValue) * graphHeight}
              x2={width - padding}
              y2={padding + graphHeight - (totalMonth1Budget / maxValue) * graphHeight}
              stroke="#27ae60"
              strokeWidth="2"
              strokeDasharray="8,4"
              opacity="0.7"
            />

            {/* Budget line for Month 2 */}
            <line
              x1={padding}
              y1={padding + graphHeight - (totalMonth2Budget / maxValue) * graphHeight}
              x2={width - padding}
              y2={padding + graphHeight - (totalMonth2Budget / maxValue) * graphHeight}
              stroke="#e74c3c"
              strokeWidth="2"
              strokeDasharray="8,4"
              opacity="0.7"
            />

            {/* X-axis */}
            <line
              x1={padding}
              y1={height - padding}
              x2={width - padding}
              y2={height - padding}
              stroke="#333"
              strokeWidth="2"
            />

            {/* Y-axis */}
            <line
              x1={padding}
              y1={padding}
              x2={padding}
              y2={height - padding}
              stroke="#333"
              strokeWidth="2"
            />

            {/* X-axis label */}
            <text
              x={width / 2}
              y={height - 5}
              textAnchor="middle"
              fontSize="14"
              fill="#333"
              fontWeight="bold"
            >
              Day of Month
            </text>

            {/* Y-axis label */}
            <text
              x={15}
              y={height / 2}
              textAnchor="middle"
              fontSize="14"
              fill="#333"
              fontWeight="bold"
              transform={`rotate(-90, 15, ${height / 2})`}
            >
              Cumulative Spending
            </text>
          </svg>
        </div>

        {/* Totals */}
        <div className="line-graph-totals">
          <div className="total-box" style={{ borderColor: '#667eea' }}>
            <div className="total-label">{month1Label} Spending</div>
            <div className="total-amount">{formatCurrency(month1Running)}</div>
            <div className="total-budget">Budget: {formatCurrency(totalMonth1Budget)}</div>
            <div className={`total-status ${month1Running > totalMonth1Budget ? 'over-budget' : 'under-budget'}`}>
              {month1Running > totalMonth1Budget ? '⚠️ Over Budget' : '✅ Under Budget'}
            </div>
          </div>
          <div className="total-box" style={{ borderColor: '#f093fb' }}>
            <div className="total-label">{month2Label} Spending</div>
            <div className="total-amount">{formatCurrency(month2Running)}</div>
            <div className="total-budget">Budget: {formatCurrency(totalMonth2Budget)}</div>
            <div className={`total-status ${month2Running > totalMonth2Budget ? 'over-budget' : 'under-budget'}`}>
              {month2Running > totalMonth2Budget ? '⚠️ Over Budget' : '✅ Under Budget'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="expenses-summary">
      <div className="expenses-summary-header">
        <h2>Expenses Summary</h2>
        <p className="expenses-summary-subheading">
          Here you can examine your daily expenses.
        </p>
      </div>

      {/* View Mode Toggle */}
      <div className="view-mode-selector">
        <button
          className={viewMode === 'summary' ? 'active' : ''}
          onClick={() => setViewMode('summary')}
        >
          📋 Summary
        </button>
        <button
          className={viewMode === 'linegraph' ? 'active' : ''}
          onClick={() => setViewMode('linegraph')}
        >
          📈 Line Graph
        </button>
      </div>

      {viewMode === 'linegraph' && <MonthLineGraph />}

      {/* Mobile Card Layout */}
      {viewMode === 'summary' && (
      <div className="mobile-expenses-view">
        {sortedDates.length === 0 ? (
          <div className="no-expenses-message">
            <div className="no-expenses-icon">📭</div>
            <h3>No expenses found</h3>
            <p>Try selecting a different date range or add some expenses.</p>
          </div>
        ) : (
          <>
            {sortedDates.map(date => {
              // Calculate total for this date
              const dateTotal = CATEGORIES.reduce((sum, category) => {
                const items = tableData.byDate[date][category.id] || [];
                return sum + items.reduce((catSum, item) => catSum + (item.totalPrice || 0), 0);
              }, 0);

              return (
                <div key={date} className="mobile-date-card">
                  <div className="mobile-date-header">
                    <span>{formatDate(date)}</span>
                    <span className="mobile-date-total">{formatCurrency(dateTotal)}</span>
                  </div>

                  {CATEGORIES.map(category => {
                    const items = tableData.byDate[date][category.id] || [];
                    if (items.length === 0) return null;

                    return (
                      <div key={category.id} className="mobile-category-section">
                        <div className="mobile-category-header" style={{ borderLeftColor: category.color }}>
                          <span>{category.icon}</span>
                          <span>{category.name}</span>
                        </div>
                        <div className="mobile-category-items">
                          {items.map((item, index) => (
                            <div
                              key={`${item.expenseId}-${item.itemIndex}-${index}`}
                              className="mobile-item"
                              onClick={() => handleItemClick(item)}
                              style={{ cursor: 'pointer' }}
                            >
                              <div className="mobile-item-description">
                                {item.description || item.merchantName}
                                {item.quantity && item.quantity > 1 && ` (×${item.quantity})`}
                              </div>
                              <div className="mobile-item-price">
                                {formatCurrency(item.totalPrice || 0, item.currency)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div className="mobile-grand-total">
              <div className="mobile-grand-total-label">Grand Total</div>
              <div className="mobile-grand-total-amount">{formatCurrency(totalSpending)}</div>
            </div>
          </>
        )}
      </div>
      )}

      {/* Desktop Table Layout */}
      {viewMode === 'summary' && (
      <div className="excel-table-wrapper">
        <table className="excel-table">
          <thead>
            <tr>
              <th className="date-column">Date</th>
              {CATEGORIES.map(category => (
                <th key={category.id} style={{ borderTopColor: category.color }}>
                  <div className="category-header-cell">
                    <span className="category-icon">{category.icon}</span>
                    <span className="category-name">{category.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedDates.length === 0 ? (
              <tr>
                <td colSpan={CATEGORIES.length + 1} className="no-data">
                  <div className="no-expenses-message">
                    <div className="no-expenses-icon">📭</div>
                    <h3>No expenses found</h3>
                    <p>Try selecting a different date range or add some expenses.</p>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {sortedDates.map(date => (
                  <tr key={date}>
                    <td className="date-cell">
                      <div className="date-cell-content">
                        {formatDate(date)}
                      </div>
                    </td>
                    {CATEGORIES.map(category => {
                      const items = tableData.byDate[date][category.id] || [];
                      return (
                        <td key={category.id} className="category-cell">
                          {items.length > 0 ? (
                            <div className="items-list">
                              {items.map((item, index) => (
                                <div
                                  key={`${item.expenseId}-${item.itemIndex}-${index}`}
                                  className="item-entry"
                                  onClick={() => handleItemClick(item)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <div className="item-description">
                                    {item.description || item.merchantName}
                                    {item.quantity && item.quantity > 1 && ` (×${item.quantity})`}
                                  </div>
                                  <div className="item-price">
                                    {formatCurrency(item.totalPrice || 0, item.currency)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="empty-cell">—</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Total row */}
                <tr className="total-row">
                  <td className="total-label">
                    <strong>TOTAL</strong>
                  </td>
                  {CATEGORIES.map(category => (
                    <td key={category.id} className="total-cell">
                      <strong>{formatCurrency(tableData.categoryTotals[category.id])}</strong>
                    </td>
                  ))}
                </tr>
                {/* Grand total row */}
                <tr className="grand-total-row">
                  <td className="grand-total-label">
                    <strong>GRAND TOTAL</strong>
                  </td>
                  <td colSpan={CATEGORIES.length} className="grand-total-cell">
                    <strong>{formatCurrency(totalSpending)}</strong>
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Item</h3>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label htmlFor="description">Description</label>
                <input
                  type="text"
                  id="description"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="totalPrice">Price</label>
                <input
                  type="number"
                  id="totalPrice"
                  step="0.01"
                  value={editForm.totalPrice}
                  onChange={(e) => setEditForm({ ...editForm, totalPrice: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="date">Date</label>
                <input
                  type="date"
                  id="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-cancel"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExpensesSummary;
