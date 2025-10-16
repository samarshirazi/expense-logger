import React, { useState } from 'react';
import axios from 'axios';
import authService from '../services/authService';
import './ManualEntry.css';

function ManualEntry({ onExpensesAdded }) {
  const [textEntry, setTextEntry] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!textEntry.trim()) {
      setError('Please enter some expenses');
      return;
    }

    try {
      setProcessing(true);
      setError(null);
      setSuccess(null);

      const token = authService.getAccessToken();
      const API_BASE_URL = process.env.NODE_ENV === 'production'
        ? '/api'
        : 'http://localhost:5000/api';

      const response = await axios.post(
        `${API_BASE_URL}/manual-entry`,
        { textEntry: textEntry.trim() },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        setSuccess(`✅ ${response.data.message}`);
        setTextEntry('');

        // Notify parent component
        if (onExpensesAdded && response.data.expenses) {
          response.data.expenses.forEach(exp => {
            onExpensesAdded(exp.expenseData);
          });
        }

        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      console.error('Manual entry error:', err);
      setError(err.response?.data?.details || err.message || 'Failed to process entry');
    } finally {
      setProcessing(false);
    }
  };

  const handleKeyPress = (e) => {
    // Submit on Enter (but not Shift+Enter for multiline)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="manual-entry">
      <div className="manual-entry-header">
        <span className="manual-entry-icon">✍️</span>
        <h3>Quick Add</h3>
        <span className="manual-entry-hint">Type naturally, AI will categorize</span>
      </div>

      <form onSubmit={handleSubmit} className="manual-entry-form">
        <div className="manual-entry-input-wrapper">
          <textarea
            className="manual-entry-input"
            value={textEntry}
            onChange={(e) => setTextEntry(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder='Try: "I spent $10 on food and $20 on shopping" or "Gas $40, coffee $5, groceries $50"'
            rows="2"
            disabled={processing}
          />
          <button
            type="submit"
            className="manual-entry-button"
            disabled={processing || !textEntry.trim()}
          >
            {processing ? (
              <>
                <span className="button-spinner"></span>
                Processing...
              </>
            ) : (
              <>
                <span>💬</span>
                Add
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="manual-entry-error">
            ❌ {error}
          </div>
        )}

        {success && (
          <div className="manual-entry-success">
            {success}
          </div>
        )}
      </form>

      <div className="manual-entry-examples">
        <span className="examples-title">Examples:</span>
        <button
          type="button"
          className="example-button"
          onClick={() => setTextEntry('I spent $15 on lunch at subway and $30 on gas')}
          disabled={processing}
        >
          "I spent $15 on lunch at subway and $30 on gas"
        </button>
        <button
          type="button"
          className="example-button"
          onClick={() => setTextEntry('Coffee $5, parking $10, groceries $45')}
          disabled={processing}
        >
          "Coffee $5, parking $10, groceries $45"
        </button>
      </div>
    </div>
  );
}

export default ManualEntry;
