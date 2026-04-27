import React, { useCallback, useEffect, useState } from 'react';
import {
  getShoppingList,
  addShoppingItems,
  updateShoppingItem,
  deleteShoppingItem,
} from '../../services/householdApi';
import { useShoppingItemsRealtime } from '../../hooks/useShoppingRealtime';
import InStoreToggle from './InStoreToggle';

export default function ShoppingListDetail({ listId, onBack, onOpenVoice }) {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({ name: '', quantity: '', notes: '' });
  const [showPurchased, setShowPurchased] = useState(true);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await getShoppingList(listId);
      setList(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  // Live updates from other devices in this household.
  const handleRealtime = useCallback(
    (payload) => {
      const row = payload.new || payload.old;
      if (!row || row.list_id !== listId) return;
      setList((prev) => {
        if (!prev) return prev;
        const items = prev.items || [];
        if (payload.eventType === 'INSERT') {
          if (items.some((it) => it.id === payload.new.id)) return prev;
          return { ...prev, items: [...items, payload.new] };
        }
        if (payload.eventType === 'UPDATE') {
          return {
            ...prev,
            items: items.map((it) => (it.id === payload.new.id ? payload.new : it)),
          };
        }
        if (payload.eventType === 'DELETE') {
          return { ...prev, items: items.filter((it) => it.id !== payload.old.id) };
        }
        return prev;
      });
    },
    [listId]
  );
  useShoppingItemsRealtime(list?.household_id, handleRealtime);

  async function handleAdd(e) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    try {
      const { items } = await addShoppingItems(listId, [
        {
          name: draft.name.trim(),
          quantity: draft.quantity ? Number(draft.quantity) : 1,
          notes: draft.notes.trim() || null,
        },
      ]);
      setList((prev) => ({ ...prev, items: [...(prev?.items || []), ...items] }));
      setDraft({ name: '', quantity: '', notes: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggle(item) {
    const next = !item.purchased;
    // optimistic
    setList((prev) => ({
      ...prev,
      items: prev.items.map((it) =>
        it.id === item.id
          ? { ...it, purchased: next, purchased_at: next ? new Date().toISOString() : null }
          : it
      ),
    }));
    try {
      const updated = await updateShoppingItem(item.id, { purchased: next });
      setList((prev) => ({
        ...prev,
        items: prev.items.map((it) => (it.id === item.id ? updated : it)),
      }));
    } catch (err) {
      setError(err.message);
      refresh();
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Remove "${item.name}"?`)) return;
    try {
      await deleteShoppingItem(item.id);
      setList((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== item.id) }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!list) return null;

  const upcoming = (list.items || []).filter((it) => !it.purchased);
  const purchased = (list.items || []).filter((it) => it.purchased);

  return (
    <div className="shopping-detail">
      <header className="shopping-detail-header">
        <button type="button" onClick={onBack} className="link-back">← Lists</button>
        <h1>
          <span className="store-icon">{list.store_icon || '🛒'}</span> {list.name}
        </h1>
        <div className="detail-header-actions">
          <InStoreToggle listId={list.id} />
          {onOpenVoice && (
            <button type="button" className="primary voice-btn" onClick={() => onOpenVoice(list.id)}>
              🎤 Voice add
            </button>
          )}
        </div>
      </header>

      <form className="add-item-row" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="Add item (e.g. Milk)"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
        <input
          type="number"
          min="0"
          step="0.5"
          placeholder="Qty"
          value={draft.quantity}
          onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
          className="qty-input"
        />
        <button type="submit" className="primary" disabled={!draft.name.trim()}>Add</button>
      </form>

      <section className="items-section">
        <h3>Upcoming ({upcoming.length})</h3>
        {upcoming.length === 0 && <p className="muted">Nothing pending — nice work.</p>}
        <ul className="item-list">
          {upcoming.map((item) => (
            <li key={item.id} className="item-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => handleToggle(item)}
                />
                <span className="item-name">{item.name}</span>
                {item.quantity != null && Number(item.quantity) !== 1 && (
                  <span className="item-qty">× {item.quantity}{item.unit ? ` ${item.unit}` : ''}</span>
                )}
              </label>
              {item.notes && <span className="item-notes">{item.notes}</span>}
              <button type="button" className="link-danger" onClick={() => handleDelete(item)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="items-section">
        <header className="section-header">
          <h3>Purchased ({purchased.length})</h3>
          <button type="button" className="link" onClick={() => setShowPurchased((v) => !v)}>
            {showPurchased ? 'Hide' : 'Show'}
          </button>
        </header>
        {showPurchased && purchased.length === 0 && <p className="muted">Nothing checked off yet.</p>}
        {showPurchased && (
          <ul className="item-list purchased">
            {purchased.map((item) => (
              <li key={item.id} className="item-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={() => handleToggle(item)}
                  />
                  <span className="item-name strikethrough">{item.name}</span>
                  {item.quantity != null && Number(item.quantity) !== 1 && (
                    <span className="item-qty">× {item.quantity}{item.unit ? ` ${item.unit}` : ''}</span>
                  )}
                </label>
                <button type="button" className="link-danger" onClick={() => handleDelete(item)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
