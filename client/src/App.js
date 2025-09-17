import React, { useState, useEffect } from 'react';
import ReceiptUpload from './components/ReceiptUpload';
import ExpenseList from './components/ExpenseList';
import ExpenseDetails from './components/ExpenseDetails';
import { getExpenses } from './services/apiService';

function App() {
  const [expenses, setExpenses] = useState([]);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const data = await getExpenses();
      setExpenses(data);
    } catch (error) {
      console.error('Failed to load expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExpenseAdded = (newExpense) => {
    setExpenses(prev => [newExpense, ...prev]);
    setSelectedExpense(newExpense);
  };

  const handleExpenseSelect = (expense) => {
    setSelectedExpense(expense);
  };

  return (
    <div className="container">
      <header className="header">
        <h1>🧾 Expense Receipt Logger</h1>
        <p>Upload receipts, extract data with AI, and store in Google Drive</p>
      </header>

      <main>
        <ReceiptUpload onExpenseAdded={handleExpenseAdded} />

        {selectedExpense && (
          <ExpenseDetails
            expense={selectedExpense}
            onClose={() => setSelectedExpense(null)}
          />
        )}

        <ExpenseList
          expenses={expenses}
          loading={loading}
          onExpenseSelect={handleExpenseSelect}
          onRefresh={loadExpenses}
        />
      </main>
    </div>
  );
}

export default App;