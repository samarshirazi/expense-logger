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

  const [categorizedItems, setCategorizedItems] = useState({
    Food: [],
    Transport: [],
    Shopping: [],
    Bills: [],
    Other: []
  });

  const [categoryTotals, setCategoryTotals] = useState({
    Food: 0,
    Transport: 0,
    Shopping: 0,
    Bills: 0,
    Other: 0
  });

  // Filter and categorize expenses based on date range
  useEffect(() => {
    const filteredExpenses = expenses.filter(expense => {
      if (!dateRange.startDate || !dateRange.endDate) return true;
      return expense.date >= dateRange.startDate && expense.date <= dateRange.endDate;
    });

    const organized = {
      Food: [],
      Transport: [],
      Shopping: [],
      Bills: [],
      Other: []
    };

    const totals = {
      Food: 0,
      Transport: 0,
      Shopping: 0,
      Bills: 0,
      Other: 0
    };

    filteredExpenses.forEach(expense => {
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

          if (organized[itemCategory]) {
            organized[itemCategory].push(itemWithMetadata);
            totals[itemCategory] += item.totalPrice || 0;
          } else {
            organized['Other'].push(itemWithMetadata);
            totals['Other'] += item.totalPrice || 0;
          }
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

        if (organized[category]) {
          organized[category].push(expenseAsItem);
          totals[category] += expense.totalAmount || 0;
        } else {
          organized['Other'].push(expenseAsItem);
          totals['Other'] += expense.totalAmount || 0;
        }
      }
    });

    setCategorizedItems(organized);
    setCategoryTotals(totals);
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

  const totalSpending = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);

  return (
    <div className="expenses-summary">
      <div className="expenses-summary-header">
        <h2>Expenses Summary</h2>
        <p className="expenses-summary-subheading">
          Here you can examine your daily expenses.
        </p>
      </div>

      <TimeNavigator onRangeChange={handleDateRangeChange} expenses={expenses} />

      <div className="summary-main-content">
        {/* Date Range Info on the left */}
        <div className="date-info-sidebar">
          <div className="date-info-card">
            <div className="date-info-icon">📅</div>
            <div className="date-info-content">
              <div className="date-info-label">Selected Period</div>
              <div className="date-info-dates">
                <div className="date-info-date">{formatDate(dateRange.startDate)}</div>
                <div className="date-info-separator">to</div>
                <div className="date-info-date">{formatDate(dateRange.endDate)}</div>
              </div>
            </div>
          </div>

          <div className="total-spending-card">
            <div className="total-spending-icon">💰</div>
            <div className="total-spending-content">
              <div className="total-spending-label">Total Spending</div>
              <div className="total-spending-amount">{formatCurrency(totalSpending)}</div>
            </div>
          </div>
        </div>

        {/* Categories in horizontal row at the top with products below */}
        <div className="categories-content">
          <div className="categories-horizontal">
            {CATEGORIES.map(category => (
              <div
                key={category.id}
                className="category-tab"
                style={{ borderBottomColor: category.color }}
              >
                <span className="category-tab-icon">{category.icon}</span>
                <span className="category-tab-name">{category.name}</span>
                <span className="category-tab-total">{formatCurrency(categoryTotals[category.id])}</span>
                <span className="category-tab-count">
                  ({categorizedItems[category.id]?.length || 0})
                </span>
              </div>
            ))}
          </div>

          {/* Products listed under categories */}
          <div className="products-by-category">
            {CATEGORIES.map(category => {
              const items = categorizedItems[category.id] || [];
              if (items.length === 0) return null;

              return (
                <div key={category.id} className="category-section">
                  <div
                    className="category-section-header"
                    style={{ backgroundColor: category.color }}
                  >
                    <span className="category-section-icon">{category.icon}</span>
                    <span className="category-section-name">{category.name}</span>
                    <span className="category-section-count">{items.length} items</span>
                  </div>

                  <div className="category-products-list">
                    {items.map((item, index) => (
                      <div key={`${item.expenseId}-${item.itemIndex}-${index}`} className="product-item">
                        <div className="product-item-left">
                          <div className="product-item-name">
                            {item.description || item.merchantName}
                            {item.quantity && item.quantity > 1 && ` (×${item.quantity})`}
                          </div>
                          <div className="product-item-meta">
                            {item.merchantName} • {formatDate(item.date)}
                          </div>
                        </div>
                        <div className="product-item-amount">
                          {formatCurrency(item.totalPrice || 0, item.currency)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="category-section-total">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(categoryTotals[category.id])}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {totalSpending === 0 && (
            <div className="no-expenses-message">
              <div className="no-expenses-icon">📭</div>
              <h3>No expenses found</h3>
              <p>Try selecting a different date range or add some expenses.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExpensesSummary;
