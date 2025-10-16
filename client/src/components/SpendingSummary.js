import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import authService from '../services/authService';
import TimeNavigator from './TimeNavigator';
import './SpendingSummary.css';

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

function SpendingSummary({ onClose, expenses = [] }) {
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
      startDate: toLocalDateString(startOfMonth),
      endDate: toLocalDateString(endOfMonth)
    };
  });
  const [viewMode, setViewMode] = useState('summary'); // 'summary' or 'detailed'

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


  const formatDate = (dateString) => {
    if (!dateString) return 'No Date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="summary-overlay" onClick={onClose}>
      <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
        <div className="summary-header">
          <h2>📊 Spending Summary</h2>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>

        <TimeNavigator onRangeChange={handleDateRangeChange} expenses={expenses} />

        <div className="view-mode-toggle">
          <button
            className={viewMode === 'summary' ? 'active' : ''}
            onClick={() => setViewMode('summary')}
          >
            📊 Summary
          </button>
          <button
            className={viewMode === 'detailed' ? 'active' : ''}
            onClick={() => setViewMode('detailed')}
          >
            📋 Detailed View
          </button>
        </div>

        {loading ? (
          <div className="summary-loading">
            <div className="spinner"></div>
            <p>Loading summary...</p>
          </div>
        ) : summary ? (
          <div className="summary-content">
            {viewMode === 'summary' ? (
              <>
                <div className="summary-overview">
                  <div className="overview-card total">
                    <div className="overview-icon">💰</div>
                    <div className="overview-details">
                      <div className="overview-label">Total Spending</div>
                      <div className="overview-value">{formatCurrency(summary.totalSpending)}</div>
                    </div>
                  </div>

                  <div className="overview-card">
                    <div className="overview-icon">🧾</div>
                    <div className="overview-details">
                      <div className="overview-label">Total Receipts</div>
                      <div className="overview-value">{summary.expenseCount}</div>
                    </div>
                  </div>

                  <div className="overview-card">
                    <div className="overview-icon">📈</div>
                    <div className="overview-details">
                      <div className="overview-label">Average per Receipt</div>
                      <div className="overview-value">{formatCurrency(summary.averageExpense)}</div>
                    </div>
                  </div>
                </div>

                <div className="category-breakdown">
                  <h3>Category Breakdown (Item Level)</h3>
                  <div className="category-list">
                    {CATEGORIES.map(category => {
                      const amount = summary.itemCategoryTotals ? summary.itemCategoryTotals[category.id] : 0;
                      const percentage = summary.totalSpending > 0
                        ? (amount / summary.totalSpending) * 100
                        : 0;

                      return (
                        <div key={category.id} className="category-item">
                          <div className="category-item-header">
                            <span className="category-item-icon">{category.icon}</span>
                            <span className="category-item-name">{category.name}</span>
                            <span className="category-item-amount">{formatCurrency(amount)}</span>
                          </div>
                          <div className="category-item-bar">
                            <div
                              className="category-item-fill"
                              style={{
                                width: `${percentage}%`,
                                backgroundColor: category.color
                              }}
                            ></div>
                          </div>
                          <div className="category-item-percentage">{percentage.toFixed(1)}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="detailed-table-container">
                <h3>Detailed Expense Breakdown</h3>
                <div className="excel-table-wrapper">
                  <table className="excel-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Merchant</th>
                        <th>Category</th>
                        <th>Product/Item</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Total Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.detailedItems && summary.detailedItems.length > 0 ? (
                        <>
                          {summary.detailedItems.map((item, index) => {
                            const categoryInfo = CATEGORIES.find(c => c.id === item.category) || CATEGORIES[4];
                            return (
                              <tr key={index}>
                                <td>{formatDate(item.date)}</td>
                                <td>{item.merchantName}</td>
                                <td>
                                  <span className="table-category-badge" style={{ backgroundColor: categoryInfo.color }}>
                                    {categoryInfo.icon} {item.category}
                                  </span>
                                </td>
                                <td>{item.description}</td>
                                <td className="text-center">{item.quantity}</td>
                                <td className="text-right">{formatCurrency(item.unitPrice)}</td>
                                <td className="text-right total-col">{formatCurrency(item.totalPrice)}</td>
                              </tr>
                            );
                          })}
                          <tr className="total-row">
                            <td colSpan="6" className="total-label">
                              <strong>TOTAL SPENDING</strong>
                            </td>
                            <td className="text-right total-amount">
                              <strong>{formatCurrency(summary.totalSpending)}</strong>
                            </td>
                          </tr>
                        </>
                      ) : (
                        <tr>
                          <td colSpan="7" className="no-data">No expenses found for the selected date range</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {summary.dateRange.start || summary.dateRange.end ? (
              <div className="date-range-info">
                Showing data from{' '}
                {summary.dateRange.start ? new Date(summary.dateRange.start).toLocaleDateString() : 'beginning'}{' '}
                to{' '}
                {summary.dateRange.end ? new Date(summary.dateRange.end).toLocaleDateString() : 'now'}
              </div>
            ) : (
              <div className="date-range-info">Showing all-time data</div>
            )}
          </div>
        ) : (
          <div className="summary-error">
            Failed to load summary. Please try again.
          </div>
        )}
      </div>
    </div>
  );
}

export default SpendingSummary;
