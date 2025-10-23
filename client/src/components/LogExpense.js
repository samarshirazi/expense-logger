import React from 'react';
import ReceiptUpload from './ReceiptUpload';
import ManualEntry from './ManualEntry';
import './LogExpense.css';

function LogExpense({ onExpenseAdded, expenses }) {
  return (
    <div className="log-expense">
      <section className="log-expense-panel">
        <ReceiptUpload onExpenseAdded={onExpenseAdded} expenses={expenses} />
      </section>
      <section className="log-expense-panel">
        <ManualEntry onExpensesAdded={onExpenseAdded} expenses={expenses} />
      </section>
    </div>
  );
}

export default LogExpense;
