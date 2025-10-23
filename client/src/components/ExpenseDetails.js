import React from 'react';

const ExpenseDetails = ({ expense, onClose }) => {
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      // Parse date string as local date to avoid timezone shift
      const [year, month, day] = dateString.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
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

  const getGoogleDriveLink = (fileId) => {
    if (!fileId) return null;
    return `https://drive.google.com/file/d/${fileId}/view`;
  };

  return (
    <div className="expense-details">
      <div className="expense-header">
        <div>
          <h2 className="merchant-name">{expense.merchantName || 'Unknown Merchant'}</h2>
          {expense.category && (
            <span className="category-badge">{expense.category}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="amount">
            {formatAmount(expense.totalAmount, expense.currency)}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ×
          </button>
        </div>
      </div>

      <div className="expense-info">
        <div className="info-item">
          <span className="info-label">Date</span>
          <span className="info-value">{formatDate(expense.date)}</span>
        </div>

        <div className="info-item">
          <span className="info-label">Payment Method</span>
          <span className="info-value">{expense.paymentMethod || 'N/A'}</span>
        </div>

        {expense.taxAmount && (
          <div className="info-item">
            <span className="info-label">Tax</span>
            <span className="info-value">
              {formatAmount(expense.taxAmount, expense.currency)}
            </span>
          </div>
        )}

        {expense.tipAmount && (
          <div className="info-item">
            <span className="info-label">Tip</span>
            <span className="info-value">
              {formatAmount(expense.tipAmount, expense.currency)}
            </span>
          </div>
        )}

        <div className="info-item">
          <span className="info-label">Uploaded</span>
          <span className="info-value">
            {formatDate(expense.uploadDate || expense.createdAt)}
          </span>
        </div>

        {expense.driveFileId && (
          <div className="info-item">
            <span className="info-label">Receipt</span>
            <span className="info-value">
              <a
                href={getGoogleDriveLink(expense.driveFileId)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#667eea',
                  textDecoration: 'none',
                  fontWeight: '500'
                }}
              >
                📎 View in Google Drive
              </a>
            </span>
          </div>
        )}
      </div>

      {expense.items && expense.items.length > 0 && (
        <div className="items-list">
          <h3 className="items-title">Items</h3>
          {expense.items.map((item, index) => (
            <div key={index} className="item">
              <span className="item-description">{item.description}</span>
              {item.quantity && (
                <span className="item-quantity">Qty: {item.quantity}</span>
              )}
              <span className="item-price">
                {formatAmount(item.totalPrice || item.unitPrice, expense.currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {expense.originalFilename && (
        <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666' }}>
          Original file: {expense.originalFilename}
        </div>
      )}
    </div>
  );
};

export default ExpenseDetails;