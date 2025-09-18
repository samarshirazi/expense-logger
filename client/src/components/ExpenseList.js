import React, { useState } from 'react';
import { deleteExpense } from '../services/apiService';

const ExpenseList = ({ expenses, loading, onExpenseSelect, onRefresh }) => {
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'N/A';
    }
  };

  const formatAmount = (amount, currency = 'USD') => {
    if (typeof amount !== 'number') return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const handleDeleteClick = (e, expenseId) => {
    e.stopPropagation(); // Prevent triggering onExpenseSelect
    setConfirmDeleteId(expenseId);
  };

  const handleConfirmDelete = async (expenseId) => {
    try {
      setDeletingId(expenseId);
      await deleteExpense(expenseId);
      setConfirmDeleteId(null);
      setDeletingId(null);
      onRefresh(); // Refresh the expense list
    } catch (error) {
      console.error('Failed to delete expense:', error);
      alert(`Failed to delete expense: ${error.message}`);
      setDeletingId(null);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDeleteId(null);
  };

  if (loading) {
    return (
      <div className="expenses-list">
        <div className="expenses-header">
          <h2 className="expenses-title">Recent Expenses</h2>
        </div>
        <div className="processing">
          <div className="spinner"></div>
          <p>Loading expenses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="expenses-list">
      <div className="expenses-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="expenses-title">Recent Expenses</h2>
          <button className="btn" onClick={onRefresh}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {expenses.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
          <p>No expenses yet. Upload your first receipt to get started!</p>
        </div>
      ) : (
        <div>
          {expenses.map((expense) => (
            <div key={expense.id}>
              <div
                className="expense-item"
                onClick={() => onExpenseSelect(expense)}
              >
                <div className="expense-summary">
                  <div>
                    <div className="expense-merchant">
                      {expense.merchantName || 'Unknown Merchant'}
                    </div>
                    <div className="expense-date">
                      {formatDate(expense.date)} • {expense.category || 'Other'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="expense-amount">
                      {formatAmount(expense.totalAmount, expense.currency)}
                    </div>
                    <button
                      className="delete-btn"
                      onClick={(e) => handleDeleteClick(e, expense.id)}
                      disabled={deletingId === expense.id}
                      style={{
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        opacity: deletingId === expense.id ? 0.6 : 1
                      }}
                    >
                      {deletingId === expense.id ? '⏳' : '🗑️'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Confirmation Dialog */}
              {confirmDeleteId === expense.id && (
                <div style={{
                  background: '#fff3cd',
                  border: '1px solid #ffeaa7',
                  borderRadius: '4px',
                  padding: '1rem',
                  margin: '0.5rem 0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  <p style={{ margin: '0 0 1rem 0', color: '#856404' }}>
                    Are you sure you want to delete this expense from <strong>{expense.merchantName}</strong>?
                    This action cannot be undone.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleConfirmDelete(expense.id)}
                      style={{
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={handleCancelDelete}
                      style={{
                        background: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {expenses.length > 0 && (
        <div style={{ padding: '1rem', textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
          Showing {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default ExpenseList;