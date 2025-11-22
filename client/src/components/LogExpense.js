import React, { useState, useEffect } from 'react';
import ReceiptUpload from './ReceiptUpload';
import ManualEntry from './ManualEntry';
import ManualExpenseForm from './ManualExpenseForm';
import './LogExpense.css';

function LogExpense({ onExpenseAdded, expenses, prefillExpense = null, onPrefillConsumed = () => {} }) {
  const [activePanel, setActivePanel] = useState(null); // 'manual', 'upload', or 'camera'

  // Lock body scroll when panel is open
  useEffect(() => {
    if (activePanel) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [activePanel]);

  const handleClosePanel = () => {
    setActivePanel(null);
  };

  return (
    <div className="log-expense-chat">
      {/* Action buttons panel - shows when a panel is active */}
      {activePanel && (
        <div className="chat-panel-overlay" onClick={handleClosePanel}>
          <div className="chat-panel" onClick={(e) => e.stopPropagation()}>
            <button className="chat-panel-close" onClick={handleClosePanel}>×</button>

            {activePanel === 'manual' && (
              <ManualExpenseForm
                onExpenseAdded={(expense) => {
                  onExpenseAdded(expense);
                  handleClosePanel();
                }}
                expenses={expenses}
                prefill={prefillExpense}
                onPrefillConsumed={onPrefillConsumed}
              />
            )}

            {(activePanel === 'upload' || activePanel === 'camera') && (
              <ReceiptUpload
                onExpenseAdded={(expense) => {
                  onExpenseAdded(expense);
                  handleClosePanel();
                }}
                expenses={expenses}
                openCamera={activePanel === 'camera'}
              />
            )}
          </div>
        </div>
      )}

      {/* Main chat-style input area */}
      <div className="chat-input-container">
        <div className="chat-input-area">
          <ManualEntry onExpensesAdded={onExpenseAdded} expenses={expenses} />
        </div>

        {/* Action buttons below input */}
        <div className="chat-action-buttons">
          <button
            className="chat-action-btn"
            onClick={() => setActivePanel('manual')}
          >
            Add Manually
          </button>
          <button
            className="chat-action-btn"
            onClick={() => setActivePanel('upload')}
          >
            Upload Receipt
          </button>
          <button
            className="chat-action-btn"
            onClick={() => setActivePanel('camera')}
          >
            Take Picture
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogExpense;
