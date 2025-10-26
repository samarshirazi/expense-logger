import React, { useEffect, useMemo, useRef, useState } from 'react';
import './GroceryList.css';

const STORAGE_KEY = 'expenses-grocery-list';
const QUICK_SUGGESTIONS = ['Milk', 'Eggs', 'Bread', 'Fresh fruit', 'Coffee', 'Paper towels'];

const buildItem = (overrides = {}) => ({
  id: (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  name: '',
  quantity: '',
  notes: '',
  purchased: false,
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

function GroceryList() {
  const [items, setItems] = useState([]);
  const [formValues, setFormValues] = useState({ name: '', quantity: '', notes: '' });
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const statusTimeoutRef = useRef(null);
  const nameInputRef = useRef(null);

  const remainingCount = useMemo(
    () => items.filter(item => !item.purchased).length,
    [items]
  );
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
          setItems(sortItems(parsed));
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

  const resetForm = () => {
    setFormValues({ name: '', quantity: '', notes: '' });
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
          purchased: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        return sortItems(next);
      }

      next.unshift(buildItem({
        name,
        quantity,
        notes
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
      return {
        ...item,
        purchased: !item.purchased,
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

  return (
    <div className="grocery-card" aria-labelledby="grocery-list-heading">
      <div className="grocery-header">
        <div>
          <h2 id="grocery-list-heading">Groceries & Buying List</h2>
          <p className="grocery-subtitle">
            Stay ahead of your shopping runs and keep the essentials close at hand.
          </p>
        </div>
        <div className="grocery-count" aria-live="polite">
          {remainingCount === 0 ? 'All caught up!' : `${remainingCount} to buy`}
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
          items.map(item => (
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
                  {(item.quantity || item.notes) && (
                    <div className="grocery-item-meta">
                      {item.quantity && (
                        <span className="grocery-item-quantity">Qty: {item.quantity}</span>
                      )}
                      {item.notes && (
                        <span className="grocery-item-notes">{item.notes}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="grocery-delete"
                aria-label={`Remove ${item.name}`}
                onClick={() => removeItem(item.id)}
              >
                ×
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default GroceryList;
