import React, { useEffect, useState } from 'react';
import { previewInvite, acceptInvite } from '../../services/householdApi';
import { useHousehold } from '../../contexts/HouseholdContext';

/**
 * When the app loads with `?invite=<code>` in the URL, this component
 * shows the invite preview and lets the user accept (assuming they're
 * already signed in — App.js gates this behind auth).
 *
 * On accept it refreshes the household list and switches to the new
 * household. The query param is then cleared from the URL.
 */
export default function InviteAcceptHandler({ code, onDone }) {
  const { refresh, switchHousehold } = useHousehold();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await previewInvite(code);
        if (!cancelled) setPreview(p);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  async function handleAccept() {
    setBusy(true);
    setError(null);
    try {
      const res = await acceptInvite(code);
      await refresh();
      if (res.household_id) switchHousehold(res.household_id);
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleDismiss() {
    onDone?.();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>You've been invited</h2>
        {error && <div className="error-banner">{error}</div>}
        {!preview && !error && <p className="muted">Looking up invite…</p>}
        {preview && (
          <>
            <p>
              Join <strong>{preview.household?.name}</strong> as{' '}
              <strong>{preview.role}</strong>?
            </p>
            <p className="muted small">
              Invite was sent to {preview.email}. Expires{' '}
              {new Date(preview.expires_at).toLocaleDateString()}.
            </p>
          </>
        )}
        <div className="modal-actions">
          <button type="button" onClick={handleDismiss} disabled={busy}>
            Not now
          </button>
          {preview && (
            <button type="button" className="primary" onClick={handleAccept} disabled={busy}>
              {busy ? 'Joining…' : 'Accept invite'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
