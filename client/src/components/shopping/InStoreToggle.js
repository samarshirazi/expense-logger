import React, { useEffect, useState } from 'react';
import {
  isPushNotificationSupported,
  initializePushNotifications,
} from '../../services/notificationService';
import authService from '../../services/authService';
import { setInStoreMode } from '../../services/householdApi';

/**
 * Toggle exposed in the list-detail header. When enabled:
 *   1. Ensure the user has granted notification permission and that this
 *      device has a Web Push subscription on the server (one-time setup).
 *   2. Mark the current device's subscription as "in-store" for this list,
 *      so other members' adds arrive as high-priority pushes.
 *
 * If the user toggles off, we clear the in-store flag (keeps the
 * subscription registered, just no longer high-priority).
 */
export default function InStoreToggle({ listId }) {
  const [supported] = useState(() => isPushNotificationSupported());
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [endpoint, setEndpoint] = useState(null);

  // Find any existing push subscription on mount so the toggle reflects
  // whether the device is already subscribed.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled && sub) setEndpoint(sub.endpoint);
      } catch (_) {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [supported]);

  async function ensureSubscribed() {
    const token = authService.getAccessToken();
    if (!token) throw new Error('Sign-in required');
    const result = await initializePushNotifications(token);
    if (!result?.subscription?.endpoint) {
      throw new Error('Push subscription not available');
    }
    setEndpoint(result.subscription.endpoint);
    return result.subscription.endpoint;
  }

  async function handleToggle(next) {
    setBusy(true);
    setError(null);
    try {
      const ep = endpoint || (await ensureSubscribed());
      await setInStoreMode({ endpoint: ep, active: next, listId: next ? listId : null });
      setActive(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <label className={`in-store-toggle ${active ? 'on' : 'off'}`} title="In-store mode">
      <input
        type="checkbox"
        checked={active}
        disabled={busy}
        onChange={(e) => handleToggle(e.target.checked)}
      />
      <span className="toggle-label">
        {busy ? '…' : active ? '🛒 Shopping now' : '🛒 In-store mode'}
      </span>
      {error && <span className="toggle-error">{error}</span>}
    </label>
  );
}
