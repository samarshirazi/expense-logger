import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import authService from '../services/authService';
import TimeNavigator from './TimeNavigator';
import './Dashboard.css';

function Dashboard({ expenses }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(() => {
    // Default to this month
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    return {
      startDate: startOfMonth.toISOString().split('T')[0],
      endDate: endOfMonth.toISOString().split('T')[0]
    };
  });

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      const token = authService.getAccessToken();
      const API_BASE_URL = process.env.NODE_ENV === 'production'
        ? '/api'
        : 'http://localhost:5000/api';

      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);

      const response = await axios.get(`${API_BASE_URL}/expenses/summary?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      setSummary(response.data);
    } catch (error) {
      console.error('Failed to load summary:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange.startDate, dateRange.endDate]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleDateRangeChange = (range) => {
    setDateRange(range);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const CATEGORIES = [
    { id: 'Food', name: 'Food', icon: '🍔', color: '#ff6b6b' },
    { id: 'Transport', name: 'Transport', icon: '🚗', color: '#4ecdc4' },
    { id: 'Shopping', name: 'Shopping', icon: '🛍️', color: '#45b7d1' },
    { id: 'Bills', name: 'Bills', icon: '💡', color: '#f9ca24' },
    { id: 'Other', name: 'Other', icon: '📦', color: '#95afc0' }
  ];

  if (loading && !summary) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  // Filter expenses by date range for recent expenses section
  const filteredExpenses = expenses.filter(expense => {
    if (!dateRange.startDate || !dateRange.endDate) return true;
    const expenseDate = new Date(expense.date);
    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);
    return expenseDate >= start && expenseDate <= end;
  });

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Overview of your spending</p>
      </div>

      <TimeNavigator onRangeChange={handleDateRangeChange} expenses={expenses} />

      <div className="stats-grid">
        <div className="stat-card total">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-label">Total Spending</div>
            <div className="stat-value">{formatCurrency(summary?.totalSpending || 0)}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🧾</div>
          <div className="stat-content">
            <div className="stat-label">Total Receipts</div>
            <div className="stat-value">{summary?.expenseCount || 0}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <div className="stat-label">Average Expense</div>
            <div className="stat-value">{formatCurrency(summary?.averageExpense || 0)}</div>
          </div>
        </div>
      </div>

      <div className="dashboard-section">
        <h2>Spending by Category</h2>
        <div className="category-breakdown-grid">
          {CATEGORIES.map(category => {
            const amount = summary?.itemCategoryTotals?.[category.id] || 0;
            const percentage = summary?.totalSpending > 0
              ? (amount / summary.totalSpending) * 100
              : 0;

            return (
              <div key={category.id} className="category-card">
                <div className="category-card-header">
                  <span className="category-icon" style={{ color: category.color }}>
                    {category.icon}
                  </span>
                  <span className="category-name">{category.name}</span>
                </div>
                <div className="category-amount">{formatCurrency(amount)}</div>
                <div className="category-bar">
                  <div
                    className="category-bar-fill"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: category.color
                    }}
                  ></div>
                </div>
                <div className="category-percentage">{percentage.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dashboard-section">
        <h2>Recent Expenses</h2>
        <div className="recent-expenses">
          {filteredExpenses.slice(0, 5).map((expense, index) => (
            <div key={index} className="recent-expense-item">
              <div className="recent-expense-icon">
                {CATEGORIES.find(c => c.id === expense.category)?.icon || '📦'}
              </div>
              <div className="recent-expense-info">
                <div className="recent-expense-name">{expense.merchantName}</div>
                <div className="recent-expense-date">
                  {new Date(expense.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>
              <div className="recent-expense-amount">
                {formatCurrency(expense.totalAmount)}
              </div>
            </div>
          ))}
          {filteredExpenses.length === 0 && (
            <div className="no-expenses">
              <p>No expenses in this time period. Try selecting a different date range!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
