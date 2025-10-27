import React from 'react';
import GroceryList from './GroceryList';
import './GroceryListPage.css';

function GroceryListPage({ onBack = () => {} }) {
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
            Check things off as you shop, then hop back to expenses when you&apos;re done.
          </p>
        </div>
        <GroceryList />
      </section>
    </div>
  );
}

export default GroceryListPage;
