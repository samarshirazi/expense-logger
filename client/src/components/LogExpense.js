import React from 'react';
import ReceiptUpload from './ReceiptUpload';
import ManualEntry from './ManualEntry';
import './LogExpense.css';

function LogExpense({ onExpenseAdded }) {
  return (
    <div className="log-expense">
      <section className="log-expense-panel">
        <ReceiptUpload onExpenseAdded={onExpenseAdded} />
      </section>
      <section className="log-expense-panel">
        <ManualEntry onExpensesAdded={onExpenseAdded} />
      </section>
    </div>
  );
}

export default LogExpense;
