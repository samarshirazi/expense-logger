import React, { useState } from 'react';
import { useHousehold } from '../../contexts/HouseholdContext';
import { acceptInvite, previewInvite } from '../../services/householdApi';

/**
 * Shown when the user has zero households. Lets them either create a new
 * household (becomes admin) or paste an invite code to join an existing one.
 */
export default function HouseholdOnboarding() {
  const { createAndActivate, refresh } = useHousehold();
  const [tab, setTab] = useState('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [previewing, setPreviewing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createAndActivate(name.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    setBusy(true);
    setError(null);
    try {
      const p = await previewInvite(code.trim());
      setPreviewing(p);
    } catch (err) {
      setError(err.message);
      setPreviewing(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    setBusy(true);
    setError(null);
    try {
      await acceptInvite(code.trim());
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="household-onboarding">
      <div className="household-onboarding-card">
        <h2>Welcome to your shared household</h2>
        <p className="muted">
          A household lets you share shopping lists, expenses, and budgets
          with the people you live or work with.
        </p>

        <div className="tab-row">
          <button
            type="button"
            className={tab === 'create' ? 'tab active' : 'tab'}
            onClick={() => { setTab('create'); setError(null); }}
          >
            Create new
          </button>
          <button
            type="button"
            className={tab === 'join' ? 'tab active' : 'tab'}
            onClick={() => { setTab('join'); setError(null); setPreviewing(null); }}
          >
            Join with invite code
          </button>
        </div>

        {tab === 'create' && (
          <form onSubmit={handleCreate} className="onboarding-form">
            <label>
              Household name
              <input
                type="text"
                placeholder="e.g. The Sharma Family, or Cafe Ops"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </label>
            <p className="muted small">
              You'll be the admin. We'll seed three starter shopping lists
              (Walmart, Costco, Local Grocery) — you can rename or delete them later.
            </p>
            <button type="submit" disabled={busy || !name.trim()} className="primary">
              {busy ? 'Creating…' : 'Create household'}
            </button>
          </form>
        )}

        {tab === 'join' && (
          <div className="onboarding-form">
            <label>
              Invite code
              <input
                type="text"
                placeholder="Paste the code from your invite email"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            {!previewing && (
              <button type="button" onClick={handlePreview} disabled={!code.trim() || busy}>
                {busy ? 'Checking…' : 'Look up invite'}
              </button>
            )}
            {previewing && (
              <div className="invite-preview">
                <p>
                  You're invited to join <strong>{previewing.household?.name}</strong>{' '}
                  as <strong>{previewing.role}</strong>.
                </p>
                <button type="button" className="primary" onClick={handleAccept} disabled={busy}>
                  {busy ? 'Joining…' : 'Accept invite'}
                </button>
              </div>
            )}
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
