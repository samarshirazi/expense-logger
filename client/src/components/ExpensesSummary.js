import React, { useState, useEffect } from 'react';
import TimeNavigator from './TimeNavigator';
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

function ExpensesSummary({ expenses }) {
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

  const [tableData, setTableData] = useState({
    byDate: {}, // { 'YYYY-MM-DD': { Food: [], Transport: [], ... } }
    categoryTotals: { Food: 0, Transport: 0, Shopping: 0, Bills: 0, Other: 0 }
  });

  // Group items by date and category
  useEffect(() => {
    const filteredExpenses = expenses.filter(expense => {
      if (!dateRange.startDate || !dateRange.endDate) return true;
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

  const handleDateRangeChange = (range) => {
    setDateRange(range);
  };

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

  // Get sorted dates
  const sortedDates = Object.keys(tableData.byDate).sort();
  const totalSpending = Object.values(tableData.categoryTotals).reduce((sum, val) => sum + val, 0);

  return (
    <div className="expenses-summary">
      <div className="expenses-summary-header">
        <h2>Expenses Summary</h2>
        <p className="expenses-summary-subheading">
          Here you can examine your daily expenses.
        </p>
      </div>

      <TimeNavigator onRangeChange={handleDateRangeChange} expenses={expenses} />

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
                                <div key={`${item.expenseId}-${item.itemIndex}-${index}`} className="item-entry">
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
    </div>
  );
}

export default ExpensesSummary;
