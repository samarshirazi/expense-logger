import React from 'react';

const ExpenseList = ({ expenses, loading, onExpenseSelect, onRefresh }) => {
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
            <div
              key={expense.id}
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
                <div className="expense-amount">
                  {formatAmount(expense.totalAmount, expense.currency)}
                </div>
              </div>
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