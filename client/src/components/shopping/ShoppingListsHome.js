import React, { useEffect, useState } from 'react';
import { useHousehold } from '../../contexts/HouseholdContext';
import {
  listShoppingLists,
  createShoppingList,
  deleteShoppingList,
  updateShoppingList,
} from '../../services/householdApi';

const STORE_PRESETS = [
  { name: 'Walmart', icon: '🛒' },
  { name: 'Costco', icon: '📦' },
  { name: "Sam's Club", icon: '🏬' },
  { name: 'Local Grocery', icon: '🥬' },
  { name: 'Pharmacy', icon: '💊' },
  { name: 'Hardware', icon: '🔧' },
];

export default function ShoppingListsHome({ onOpenList }) {
  const { activeHouseholdId, isAdmin } = useHousehold();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', store_icon: '🛒' });

  async function refresh() {
    if (!activeHouseholdId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listShoppingLists(activeHouseholdId);
      setLists(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHouseholdId]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    try {
      const created = await createShoppingList(activeHouseholdId, {
        name: draft.name.trim(),
        store_name: draft.name.trim(),
        store_icon: draft.store_icon || null,
      });
      setLists((prev) => [...prev, { ...created, item_count: 0, purchased_count: 0 }]);
      setDraft({ name: '', store_icon: '🛒' });
      setCreating(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleArchive(list) {
    try {
      await updateShoppingList(list.id, { is_archived: true });
      setLists((prev) => prev.filter((l) => l.id !== list.id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(list) {
    if (!isAdmin) return;
    if (!window.confirm(`Delete "${list.name}" and all its items? This can't be undone.`)) return;
    try {
      await deleteShoppingList(list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="shopping-home">
      <header className="shopping-home-header">
        <div>
          <h1>Shopping lists</h1>
          <p className="muted">Organize items by store. Tick them off in-store as you buy.</p>
        </div>
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          + New list
        </button>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="muted">Loading lists…</p>}

      {!loading && lists.length === 0 && (
        <div className="empty-state">
          <p>No shopping lists yet.</p>
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            Create your first list
          </button>
        </div>
      )}

      <div className="shopping-list-grid">
        {lists.map((list) => {
          const total = list.item_count || 0;
          const done = list.purchased_count || 0;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <article
              key={list.id}
              className="shopping-list-card"
              onClick={() => onOpenList?.(list.id)}
            >
              <header>
                <span className="store-icon">{list.store_icon || '🛒'}</span>
                <div className="store-meta">
                  <h3>{list.name}</h3>
                  {list.store_name && list.store_name !== list.name && (
                    <span className="muted small">{list.store_name}</span>
                  )}
                </div>
              </header>
              <div className="progress-row">
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="progress-label">
                  {done}/{total}
                </span>
              </div>
              <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => handleArchive(list)}>Archive</button>
                {isAdmin && (
                  <button type="button" className="danger" onClick={() => handleDelete(list)}>
                    Delete
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {creating && (
        <div className="modal-backdrop" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New shopping list</h2>
            <form onSubmit={handleCreate}>
              <label>
                Store name
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Costco"
                  autoFocus
                  required
                />
              </label>
              <div className="preset-row">
                {STORE_PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p.name}
                    onClick={() =>
                      setDraft({ name: p.name, store_icon: p.icon })
                    }
                    className={draft.name === p.name ? 'preset active' : 'preset'}
                  >
                    {p.icon} {p.name}
                  </button>
                ))}
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setCreating(false)}>Cancel</button>
                <button type="submit" className="primary" disabled={!draft.name.trim()}>
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
