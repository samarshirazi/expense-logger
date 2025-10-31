import React, { useState, useEffect } from 'react';
import {
  isPushNotificationSupported,
  getNotificationPermissionState,
  initializePushNotifications,
  setStoredNotificationsEnabled,
  emitNotificationPreferencesChanged,
  getStoredNotificationPreferences
} from '../services/notificationService';
import './NotificationPrompt.css';

function NotificationPrompt({ user, onComplete }) {
  const [notificationState, setNotificationState] = useState('checking');
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkNotificationSupport();
  }, []);

  const checkNotificationSupport = () => {
    if (!isPushNotificationSupported()) {
      setNotificationState('unsupported');
      return;
    }

    const permission = getNotificationPermissionState();
    setNotificationState(permission);
  };

  const handleEnableNotifications = async () => {
    try {
      setError(null);
      setNotificationState('requesting');

      const result = await initializePushNotifications(user?.accessToken);

      if (result.success) {
        setStoredNotificationsEnabled(true);
        emitNotificationPreferencesChanged({
          enabled: true,
          preferences: getStoredNotificationPreferences()
        });
        setNotificationState('granted');
        if (onComplete) {
          onComplete(true);
        }
      }
    } catch (err) {
      console.error('Error enabling notifications:', err);
      setError(err.message);
      setNotificationState('denied');
      setStoredNotificationsEnabled(false);
      emitNotificationPreferencesChanged({
        enabled: false,
        preferences: getStoredNotificationPreferences()
      });
      if (onComplete) {
        onComplete(false);
      }
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setStoredNotificationsEnabled(false);
    emitNotificationPreferencesChanged({
      enabled: false,
      preferences: getStoredNotificationPreferences()
    });
    if (onComplete) {
      onComplete(false);
    }
  };

  // Don't show if already granted, denied, or dismissed
  if (notificationState === 'granted' || notificationState === 'denied' || dismissed) {
    return null;
  }

  // Don't show if not supported
  if (notificationState === 'unsupported') {
    return null;
  }

  // Don't show if checking or requesting
  if (notificationState === 'checking' || notificationState === 'requesting') {
    return null;
  }

  return (
    <div className="notification-prompt">
      <div className="notification-prompt-content">
        <div className="notification-prompt-icon">🔔</div>
        <div className="notification-prompt-text">
          <h3>Enable Notifications</h3>
          <p>Get notified when your receipts are processed and expenses are added.</p>
        </div>
        <div className="notification-prompt-actions">
          <button
            className="btn-enable-notifications"
            onClick={handleEnableNotifications}
            disabled={notificationState === 'requesting'}
          >
            {notificationState === 'requesting' ? 'Enabling...' : 'Enable'}
          </button>
          <button
            className="btn-dismiss-notifications"
            onClick={handleDismiss}
          >
            Not Now
          </button>
        </div>
      </div>
      {error && (
        <div className="notification-prompt-error">
          Error: {error}
        </div>
      )}
    </div>
  );
}

export default NotificationPrompt;
