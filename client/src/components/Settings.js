import React, { useEffect, useState } from 'react';
import './Settings.css';
import {
  isPushNotificationSupported,
  initializePushNotifications,
  showLocalNotification,
  getStoredNotificationPreferences,
  saveNotificationPreferences,
  getStoredNotificationsEnabled,
  setStoredNotificationsEnabled,
  emitNotificationPreferencesChanged
} from '../services/notificationService';


const Settings = ({
  onShowNotificationPrompt,
  onOpenCoach,
  coachAutoOpen,
  onCoachAutoOpenChange
}) => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof Notification === 'undefined') {
      return false;
    }
    const stored = getStoredNotificationsEnabled();
    if (stored === null) {
      return Notification.permission === 'granted';
    }
    return stored;
  });
  const [notificationPrefs, setNotificationPrefs] = useState(() => getStoredNotificationPreferences());
  const [showMuteConfirm, setShowMuteConfirm] = useState(false);

  useEffect(() => {
    saveNotificationPreferences(notificationPrefs);
  }, [notificationPrefs]);

  useEffect(() => {
    setStoredNotificationsEnabled(notificationsEnabled);
  }, [notificationsEnabled]);

  useEffect(() => {
    emitNotificationPreferencesChanged({
      enabled: notificationsEnabled,
      preferences: notificationPrefs
    });
  }, [notificationsEnabled, notificationPrefs]);

  const handleNotificationToggle = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      void showLocalNotification('Notifications Disabled', {
        body: 'Reminders and alerts are paused.',
        tag: 'notifications-disabled'
      });
      return;
    }

    if (!isPushNotificationSupported()) {
      console.warn('Push notifications are not supported in this browser.');
      return;
    }

    try {
      const result = await initializePushNotifications();
      const granted = result?.permission === 'granted';
      setNotificationsEnabled(granted);

      if (granted) {
        void showLocalNotification('Notifications Enabled', {
          body: 'Daily expense reminders will arrive at 9 PM.',
          tag: 'notifications-enabled'
        });
      } else if (onShowNotificationPrompt) {
        onShowNotificationPrompt();
      }
    } catch (error) {
      console.error('Failed to enable notifications:', error);
      setNotificationsEnabled(false);
      if (onShowNotificationPrompt) {
        onShowNotificationPrompt();
      }
    }
  };

  const handleTestNotification = async () => {
    if (!notificationsEnabled) {
      await handleNotificationToggle();
      return;
    }

    try {
      await showLocalNotification('Expense Logger', {
        body: 'Test notification: You are all set!',
        tag: 'settings-test'
      });
    } catch (error) {
      console.error('Failed to show test notification:', error);
    }
  };

  const handleCoachAutoOpenToggle = () => {
    if (onCoachAutoOpenChange) {
      onCoachAutoOpenChange(!coachAutoOpen);
    }
  };

  const handleNotificationPrefToggle = (key) => {
    setNotificationPrefs(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleFrequencyChange = (frequency) => {
    setNotificationPrefs(prev => ({
      ...prev,
      frequency
    }));
  };

  const handleMuteAll = () => {
    setNotificationPrefs({
      dailySummary: false,
      overspendingAlert: false,
      newReceiptScanned: false,
      monthlyBudgetReminder: false,
      frequency: notificationPrefs.frequency
    });
    setShowMuteConfirm(false);
    showLocalNotification('Notifications Muted', {
      body: 'All notification types have been disabled.',
      tag: 'mute-all'
    });
  };

  return (
    <div className="settings">
      <section className="settings-section">
        <header className="settings-section-header">
          <div>
            <h2>Notifications</h2>
            <p>Choose how you hear about new expenses, summaries, and reminders.</p>
          </div>
        </header>

        <div className="settings-row">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={handleNotificationToggle}
            />
            <span className="settings-toggle-slider" />
            <span className="settings-toggle-label">Enable push notifications</span>
          </label>
          <button
            type="button"
            className="settings-action-button"
            onClick={handleTestNotification}
          >
            Send test notification
          </button>
        </div>

        {notificationsEnabled && (
          <>
            <div className="settings-divider"></div>

            <div className="settings-subsection">
              <h3 className="settings-subsection-title">Notification Types</h3>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={notificationPrefs.dailySummary}
                  onChange={() => handleNotificationPrefToggle('dailySummary')}
                />
                <span className="settings-toggle-slider" />
                <div className="settings-toggle-info">
                  <span className="settings-toggle-label">Daily Summary</span>
                  <span className="settings-toggle-description">Get a recap of your spending every day at 9 PM</span>
                </div>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={notificationPrefs.overspendingAlert}
                  onChange={() => handleNotificationPrefToggle('overspendingAlert')}
                />
                <span className="settings-toggle-slider" />
                <div className="settings-toggle-info">
                  <span className="settings-toggle-label">Overspending Alert</span>
                  <span className="settings-toggle-description">Warns when you exceed budget limits</span>
                </div>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={notificationPrefs.newReceiptScanned}
                  onChange={() => handleNotificationPrefToggle('newReceiptScanned')}
                />
                <span className="settings-toggle-slider" />
                <div className="settings-toggle-info">
                  <span className="settings-toggle-label">New Receipt Scanned</span>
                  <span className="settings-toggle-description">Confirms when receipts are processed</span>
                </div>
              </label>

              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={notificationPrefs.monthlyBudgetReminder}
                  onChange={() => handleNotificationPrefToggle('monthlyBudgetReminder')}
                />
                <span className="settings-toggle-slider" />
                <div className="settings-toggle-info">
                  <span className="settings-toggle-label">Monthly Budget Reminder</span>
                  <span className="settings-toggle-description">Reminds you to review your budget</span>
                </div>
              </label>
            </div>

            <div className="settings-divider"></div>

            <div className="settings-subsection">
              <h3 className="settings-subsection-title">Notification Frequency</h3>
              <div className="settings-frequency-options">
                <label className={`settings-frequency-card ${notificationPrefs.frequency === 'instant' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="frequency"
                    value="instant"
                    checked={notificationPrefs.frequency === 'instant'}
                    onChange={() => handleFrequencyChange('instant')}
                  />
                  <span className="settings-frequency-icon">⚡</span>
                  <span className="settings-frequency-label">Instant</span>
                </label>

                <label className={`settings-frequency-card ${notificationPrefs.frequency === 'daily' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="frequency"
                    value="daily"
                    checked={notificationPrefs.frequency === 'daily'}
                    onChange={() => handleFrequencyChange('daily')}
                  />
                  <span className="settings-frequency-icon">📅</span>
                  <span className="settings-frequency-label">Daily</span>
                </label>

                <label className={`settings-frequency-card ${notificationPrefs.frequency === 'weekly' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="frequency"
                    value="weekly"
                    checked={notificationPrefs.frequency === 'weekly'}
                    onChange={() => handleFrequencyChange('weekly')}
                  />
                  <span className="settings-frequency-icon">📊</span>
                  <span className="settings-frequency-label">Weekly</span>
                </label>
              </div>
            </div>

            <div className="settings-divider"></div>

            <div className="settings-row">
              <button
                type="button"
                className="settings-mute-button"
                onClick={() => setShowMuteConfirm(true)}
              >
                🔕 Mute All Notifications
              </button>
            </div>
          </>
        )}

        <div className="settings-hint">
          Tip: we'll ask for permission the first time you enable notifications.
        </div>
      </section>

      {showMuteConfirm && (
        <div className="modal-overlay" onClick={() => setShowMuteConfirm(false)}>
          <div className="mute-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Mute All Notifications?</h3>
            <p>This will disable all notification types. You can re-enable them individually later.</p>
            <div className="mute-confirm-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowMuteConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-confirm"
                onClick={handleMuteAll}
              >
                Mute All
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="settings-section">
        <header className="settings-section-header">
          <div>
            <h2>AI Coach</h2>
            <p>Your personal spending companion living inside the dashboard.</p>
          </div>
        </header>
        <div className="settings-row">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={coachAutoOpen}
              onChange={handleCoachAutoOpenToggle}
            />
            <span className="settings-toggle-slider" />
            <span className="settings-toggle-label">Open automatically after new insights</span>
          </label>
          <button
            type="button"
            className="settings-action-button"
            onClick={onOpenCoach}
          >
            Open coach in dashboard
          </button>
        </div>
        <div className="settings-hint">
          When enabled, the AI coach will pop in right after fresh data arrives.
        </div>
      </section>
    </div>
  );
};

export default Settings;
