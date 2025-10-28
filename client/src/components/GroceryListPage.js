import React, { useMemo, useState } from 'react';
import GroceryList from './GroceryList';
import './GroceryListPage.css';

const isWithinRange = (dateStr, range) => {
  if (!dateStr) return false;
  if (!range?.startDate || !range?.endDate) return true;
  return dateStr >= range.startDate && dateStr <= range.endDate;
};

function GroceryListPage({ onBack = () => {}, onCreateExpense = () => {}, dateRange }) {
  const [itemsSnapshot, setItemsSnapshot] = useState([]);

  const outstandingCount = useMemo(() => (
    itemsSnapshot.filter(item => !item.purchased && isWithinRange(item.plannedDate, dateRange)).length
  ), [itemsSnapshot, dateRange]);

  const purchasedCount = useMemo(() => (
    itemsSnapshot.filter(item => item.purchased && isWithinRange(item.purchasedAt, dateRange)).length
  ), [itemsSnapshot, dateRange]);

  const spentTotal = useMemo(() => (
    itemsSnapshot
      .filter(item => item.purchased && isWithinRange(item.purchasedAt, dateRange))
      .reduce((sum, item) => sum + (item.price || 0), 0)
  ), [itemsSnapshot, dateRange]);

  return (
    <div className="grocery-page">
      <header className="grocery-page-header">
        <div className="grocery-page-title">
          <h1>Shopping List</h1>
          <p>Keep track of groceries and household essentials alongside your spending.</p>
        </div>
        <button
          type="button"
          className="grocery-page-back"
          onClick={onBack}
        >
          ← Back to Expenses
        </button>
      </header>

      <section className="grocery-page-body">
        <div className="grocery-page-tip">
          <span role="img" aria-hidden="true">💡</span>
          <p>
            Items stay saved in your browser so you can plan purchases before logging the actual receipts.
            Use the timeline to review what was bought and what&apos;s still pending.
          </p>
        </div>

        <div className="grocery-summary">
          <div className="grocery-summary-card">
            <span className="label">Upcoming</span>
            <strong>{outstandingCount}</strong>
          </div>
          <div className="grocery-summary-card">
            <span className="label">Purchased</span>
            <strong>{purchasedCount}</strong>
          </div>
          <div className="grocery-summary-card">
            <span className="label">Spent</span>
            <strong>${spentTotal.toFixed(2)}</strong>
          </div>
        </div>

        <GroceryList
          dateRange={dateRange}
          selectedDate={dateRange?.startDate}
          onItemsChange={setItemsSnapshot}
          onAddExpense={onCreateExpense}
        />
      </section>
    </div>
  );
}

export default GroceryListPage;
