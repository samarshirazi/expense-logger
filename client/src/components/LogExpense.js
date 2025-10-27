import React from 'react';
import ReceiptUpload from './ReceiptUpload';
import ManualEntry from './ManualEntry';
import ManualExpenseForm from './ManualExpenseForm';
import './LogExpense.css';

function LogExpense({ onExpenseAdded, expenses, prefillExpense = null, onPrefillConsumed = () => {} }) {
  return (
    <div className="log-expense">
      <section className="log-expense-panel">
        <ReceiptUpload onExpenseAdded={onExpenseAdded} expenses={expenses} />
      </section>
      <section className="log-expense-panel">
        <ManualEntry onExpensesAdded={onExpenseAdded} expenses={expenses} />
      </section>
      <section className="log-expense-panel full-width">
        <ManualExpenseForm
          onExpenseAdded={onExpenseAdded}
          expenses={expenses}
          prefill={prefillExpense}
          onPrefillConsumed={onPrefillConsumed}
        />
      </section>
    </div>
  );
}

export default LogExpense;
