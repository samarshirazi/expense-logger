import React, { useEffect, useMemo, useRef, useState } from 'react';
import './GroceryList.css';

const STORAGE_KEY = 'expenses-grocery-list';
const QUICK_SUGGESTIONS = ['Milk', 'Eggs', 'Bread', 'Fresh fruit', 'Coffee', 'Paper towels'];

const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildItem = (overrides = {}) => ({
  id: (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  name: '',
  quantity: '',
  notes: '',
  price: null,
  plannedDate: toLocalDateString(new Date()),
  purchased: false,
  purchasedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: null,
  ...overrides
});

const sortItems = (list) => {
  return [...list].sort((a, b) => {
    if (a.purchased === b.purchased) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return a.purchased ? 1 : -1;
  });
};

const isWithinRange = (dateStr, range) => {
  if (!dateStr) return false;
  if (!range?.startDate || !range?.endDate) return true;
  return dateStr >= range.startDate && dateStr <= range.endDate;
};

function GroceryList({
  onItemsChange = () => {},
  dateRange,
  selectedDate,
  onAddExpense,
  defaultCategory = 'Food'
}) {
  const [items, setItems] = useState([]);
  const [formValues, setFormValues] = useState({ name: '', quantity: '', notes: '', price: '' });
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const statusTimeoutRef = useRef(null);
  const nameInputRef = useRef(null);

  const hasPurchased = useMemo(
    () => items.some(item => item.purchased),
    [items]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const hydrated = parsed.map(item => ({
            ...item,
            price: typeof item.price === 'number'
              ? item.price
              : item.price
                ? Number.parseFloat(item.price)
                : null,
            plannedDate: item.plannedDate || toLocalDateString(new Date(item.createdAt || Date.now())),
            purchasedAt: item.purchasedAt || null
          }));
          setItems(sortItems(hydrated));
        }
      }
    } catch (err) {
      console.error('Failed to load grocery list from storage', err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.error('Failed to store grocery list', err);
    }
  }, [items]);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (error && formValues.name.trim()) {
      setError('');
    }
  }, [error, formValues.name]);

  useEffect(() => {
    onItemsChange(items);
  }, [items, onItemsChange]);

  const resetForm = () => {
    setFormValues({ name: '', quantity: '', notes: '', price: '' });
  };

  const focusNameField = () => {
    if (nameInputRef.current) {
      nameInputRef.current.focus();
    }
  };

  const showStatus = (message) => {
    if (!message) return;
    setStatusMessage(message);
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = setTimeout(() => {
      setStatusMessage('');
    }, 3200);
  };

  const handleInputChange = (field) => (event) => {
    const value = event.target.value;
    setFormValues(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const name = formValues.name.trim();
    if (!name) {
      setError('Add an item before saving.');
      return;
    }

    const quantity = formValues.quantity.trim();
    const notes = formValues.notes.trim();
    const parsedPrice = formValues.price ? Number.parseFloat(formValues.price) : null;
    const priceValue = Number.isFinite(parsedPrice) && parsedPrice !== null ? parsedPrice : null;
    const plannedDate = selectedDate || toLocalDateString(new Date());

    const existingActive = items.find(
      item => item.name.toLowerCase() === name.toLowerCase() && !item.purchased
    );

    setItems(prev => {
      const next = [...prev];
      const index = next.findIndex(
        item => item.name.toLowerCase() === name.toLowerCase() && !item.purchased
      );

      if (index !== -1) {
        next[index] = {
          ...next[index],
          quantity: quantity || next[index].quantity,
          notes: notes || next[index].notes,
          price: priceValue !== null ? priceValue : next[index].price,
          plannedDate,
          purchased: false,
          purchasedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        return sortItems(next);
      }

      next.unshift(buildItem({
        name,
        quantity,
        notes,
        price: priceValue,
        plannedDate
      }));
      return sortItems(next);
    });

    showStatus(existingActive ? `Updated ${name}` : `Added ${name} to your list`);
    resetForm();
    focusNameField();
  };

  const toggleItem = (id) => {
    const target = items.find(item => item.id === id);
    let message = '';
    if (target) {
      message = target.purchased
        ? `Moved ${target.name} back to the list`
        : `Checked off ${target.name}`;
    }

    setItems(prev => sortItems(prev.map(item => {
      if (item.id !== id) return item;
      const purchased = !item.purchased;
      return {
        ...item,
        purchased,
        purchasedAt: purchased ? toLocalDateString(new Date()) : null,
        updatedAt: new Date().toISOString()
      };
    })));

    showStatus(message);
  };

  const removeItem = (id) => {
    const target = items.find(item => item.id === id);
    setItems(prev => prev.filter(item => item.id !== id));
    showStatus(target ? `Removed ${target.name}` : 'Removed item');
  };

  const clearPurchased = () => {
    const removed = items.filter(item => item.purchased);
    if (removed.length === 0) return;
    setItems(prev => prev.filter(item => !item.purchased));
    const names = removed.slice(0, 3).map(item => item.name).join(', ');
    const suffix = removed.length > 3 ? '…' : '';
    showStatus(`Cleared purchased items (${names}${suffix})`);
  };

  const handleQuickFill = (suggestion) => {
    setFormValues(prev => ({
      ...prev,
      name: suggestion
    }));
    focusNameField();
  };

  const handleAddExpense = (item) => {
    if (!onAddExpense || item.price === null) return;
    const expensePayload = {
      description: item.name,
      totalAmount: item.price,
      date: item.purchasedAt || item.plannedDate,
      category: defaultCategory,
      merchantName: item.name,
      notes: item.notes,
      quantity: item.quantity
    };
    onAddExpense(expensePayload);
  };

  const outstandingItems = useMemo(() => {
    if (!dateRange) return items.filter(item => !item.purchased);
    return items.filter(item => !item.purchased && isWithinRange(item.plannedDate, dateRange));
  }, [items, dateRange]);

  const purchasedItems = useMemo(() => {
    if (!dateRange) return items.filter(item => item.purchased);
    return items.filter(item => item.purchased && isWithinRange(item.purchasedAt, dateRange));
  }, [items, dateRange]);

  const spentTotal = useMemo(() => {
    return purchasedItems.reduce((sum, item) => sum + (item.price || 0), 0);
  }, [purchasedItems]);

  return (
    <div className="grocery-card" aria-labelledby="grocery-list-heading">
      <div className="grocery-header">
        <div>
          <h2 id="grocery-list-heading">Groceries & Buying List</h2>
          <p className="grocery-subtitle">
            Stay ahead of your shopping runs and keep the essentials close at hand.
          </p>
        </div>
        <div className="grocery-stats" aria-live="polite">
          <div className="grocery-count">
            {outstandingItems.length === 0 ? 'All caught up!' : `${outstandingItems.length} to buy`}
          </div>
          <div className="grocery-count spent">
            Spent: ${spentTotal.toFixed(2)}
          </div>
        </div>
      </div>

      {statusMessage && <div className="grocery-status">{statusMessage}</div>}
      {error && <div className="grocery-error">{error}</div>}

      <form className="grocery-form" onSubmit={handleSubmit}>
        <div className="grocery-form-grid">
          <div className="grocery-field">
            <label htmlFor="grocery-name">Item</label>
            <input
              id="grocery-name"
              ref={nameInputRef}
              type="text"
              placeholder="e.g., Spinach, almond milk, snacks..."
              value={formValues.name}
              onChange={handleInputChange('name')}
              autoComplete="off"
            />
          </div>
          <div className="grocery-field">
            <label htmlFor="grocery-quantity">Quantity</label>
            <input
              id="grocery-quantity"
              type="text"
              placeholder="Optional (e.g., 2 bags)"
              value={formValues.quantity}
              onChange={handleInputChange('quantity')}
            />
          </div>
        </div>
        <div className="grocery-form-grid">
          <div className="grocery-field">
            <label htmlFor="grocery-price">Price (optional)</label>
            <div className="input-with-prefix">
              <span className="prefix">$</span>
              <input
                id="grocery-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formValues.price}
                onChange={handleInputChange('price')}
              />
            </div>
          </div>
        </div>
        <div className="grocery-field">
          <label htmlFor="grocery-notes">Notes</label>
          <input
            id="grocery-notes"
            type="text"
            placeholder="Optional (brand preference, store, etc.)"
            value={formValues.notes}
            onChange={handleInputChange('notes')}
          />
        </div>

        <div className="grocery-form-actions">
          <button type="submit" className="grocery-submit">
            Add Item
          </button>
          {hasPurchased && (
            <button
              type="button"
              className="grocery-clear"
              onClick={clearPurchased}
            >
              Clear purchased
            </button>
          )}
        </div>

        <div className="grocery-quick-add">
          <span>Quick ideas:</span>
          {QUICK_SUGGESTIONS.map(suggestion => (
            <button
              type="button"
              key={suggestion}
              onClick={() => handleQuickFill(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </form>

      <ul className="grocery-items">
        {items.length === 0 ? (
          <li className="grocery-empty">
            Nothing on the list yet. Add a few items you plan to grab next.
          </li>
        ) : (
          <>
            {outstandingItems.length > 0 && (
              <li className="grocery-section-label">Upcoming</li>
            )}
            {outstandingItems.map(item => (
              <li
                key={item.id}
                className={`grocery-item ${item.purchased ? 'completed' : ''}`}
              >
                <div className="grocery-item-left">
                  <input
                    type="checkbox"
                    checked={item.purchased}
                    onChange={() => toggleItem(item.id)}
                    aria-label={item.purchased ? `Mark ${item.name} as not purchased` : `Mark ${item.name} as purchased`}
                  />
                  <div className="grocery-item-text">
                    <div className="grocery-item-name">{item.name}</div>
                    <div className="grocery-item-meta">
                      {item.quantity && (
                        <span className="grocery-item-quantity">Qty: {item.quantity}</span>
                      )}
                      {item.price !== null && (
                        <span className="grocery-item-price">${item.price.toFixed(2)}</span>
                      )}
                      {item.plannedDate && (
                        <span className="grocery-item-date">Planned: {item.plannedDate}</span>
                      )}
                      {item.notes && (
                        <span className="grocery-item-notes">{item.notes}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grocery-item-actions">
                  {item.price !== null && (
                    <button
                      type="button"
                      className="grocery-add-expense"
                      onClick={() => handleAddExpense(item)}
                    >
                      Add Expense
                    </button>
                  )}
                  <button
                    type="button"
                    className="grocery-delete"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => removeItem(item.id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}

            {purchasedItems.length > 0 && (
              <li className="grocery-section-label">Purchased</li>
            )}
            {purchasedItems.map(item => (
              <li
                key={item.id}
                className="grocery-item completed purchased"
              >
                <div className="grocery-item-left">
                  <input
                    type="checkbox"
                    checked={item.purchased}
                    onChange={() => toggleItem(item.id)}
                    aria-label={`Mark ${item.name} as not purchased`}
                  />
                  <div className="grocery-item-text">
                    <div className="grocery-item-name">{item.name}</div>
                    <div className="grocery-item-meta">
                      {item.quantity && (
                        <span className="grocery-item-quantity">Qty: {item.quantity}</span>
                      )}
                      {item.price !== null && (
                        <span className="grocery-item-price">${item.price.toFixed(2)}</span>
                      )}
                      {item.purchasedAt && (
                        <span className="grocery-item-date">Bought: {item.purchasedAt}</span>
                      )}
                      {item.notes && (
                        <span className="grocery-item-notes">{item.notes}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grocery-item-actions">
                  {item.price !== null && (
                    <button
                      type="button"
                      className="grocery-add-expense"
                      onClick={() => handleAddExpense(item)}
                    >
                      Add Expense
                    </button>
                  )}
                  <button
                    type="button"
                    className="grocery-delete"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => removeItem(item.id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}

            {outstandingItems.length === 0 && purchasedItems.length === 0 && (
              <li className="grocery-empty">
                No items in this period. Add a new item or adjust the timeline above.
              </li>
            )}
          </>
        )}
      </ul>
    </div>
  );
}

export default GroceryList;
