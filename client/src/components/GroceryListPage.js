import React, { useCallback, useMemo, useState } from 'react';
import TimeNavigator from './TimeNavigator';
import GroceryList from './GroceryList';
import './GroceryListPage.css';

const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getInitialRange = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return {
    startDate: toLocalDateString(start),
    endDate: toLocalDateString(end)
  };
};

const isWithinRange = (dateStr, range) => {
  if (!dateStr) return false;
  if (!range?.startDate || !range?.endDate) return true;
  return dateStr >= range.startDate && dateStr <= range.endDate;
};

function GroceryListPage({ onBack = () => {}, onCreateExpense = () => {} }) {
  const [timelineState, setTimelineState] = useState({
    viewMode: 'month',
    currentDate: new Date()
  });
  const [dateRange, setDateRange] = useState(getInitialRange);
  const [itemsSnapshot, setItemsSnapshot] = useState([]);

  const handleRangeChange = useCallback((range) => {
    setDateRange(range);
  }, []);

  const navigatorExpenses = useMemo(() => {
    return itemsSnapshot
      .filter(item => item.price && (item.purchasedAt || item.plannedDate))
      .map(item => ({
        id: item.id,
        date: item.purchasedAt || item.plannedDate,
        totalAmount: item.price,
        merchantName: item.name,
        category: item.purchased ? 'Purchased' : 'Planned'
      }));
  }, [itemsSnapshot]);

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

        <div className="grocery-timeline">
          <div className="shared-timeline-container without-button">
            <TimeNavigator
              onRangeChange={handleRangeChange}
              expenses={navigatorExpenses}
              timelineState={timelineState}
              onTimelineStateChange={setTimelineState}
              adjustEnabled={true}
            />
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
        </div>

        <GroceryList
          dateRange={dateRange}
          selectedDate={dateRange.startDate}
          onItemsChange={setItemsSnapshot}
          onAddExpense={onCreateExpense}
        />
      </section>
    </div>
  );
}

export default GroceryListPage;
