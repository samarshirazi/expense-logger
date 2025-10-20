import React, { useEffect, useMemo, useState } from 'react';
import './Settings.css';
import { isPushNotificationSupported, requestNotificationPermission, showLocalNotification } from '../services/notificationService';

const THEME_OPTIONS = [
  { id: 'system', label: 'System default' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' }
];

const MOOD_OPTIONS = [
  {
    id: 'motivator_roast',
    title: 'Motivator + Roast',
    description: 'Upbeat coaching with playful jabs to keep you accountable.'
  },
  {
    id: 'motivator_serious',
    title: 'Motivator + Serious',
    description: 'Encouraging tone paired with straight-laced financial guidance.'
  }
];

const Settings = ({
  onShowNotificationPrompt,
  onOpenCoach,
  themePreference,
  onThemeChange,
  coachMood,
  onCoachMoodChange,
  coachAutoOpen,
  onCoachAutoOpenChange
}) => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const themeDescription = useMemo(() => {
    switch (themePreference) {
      case 'light':
        return 'Bright layout with light background and dark text.';
      case 'dark':
        return 'Dimmed layout to reduce glare in low-light environments.';
      default:
        return 'Tracks your operating system setting automatically.';
    }
  }, [themePreference]);

  const handleNotificationToggle = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }

    if (!isPushNotificationSupported()) {
      console.warn('Push notifications are not supported in this browser.');
      return;
    }

    const permission = await requestNotificationPermission();
    const granted = permission === 'granted';
    setNotificationsEnabled(granted);
    if (!granted && onShowNotificationPrompt) {
      onShowNotificationPrompt();
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

  const handleMoodChange = (value) => {
    if (onCoachMoodChange) {
      onCoachMoodChange(value);
    }
  };

  const handleThemeSelection = (value) => {
    if (onThemeChange) {
      onThemeChange(value);
    }
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
        <div className="settings-hint">
          Tip: we’ll ask for permission the first time you enable notifications.
        </div>
      </section>

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
          When enabled, Finch will pop in right after fresh data arrives.
        </div>
        <div className="settings-mood-options">
          {MOOD_OPTIONS.map(option => (
            <label
              key={option.id}
              className={`settings-mood-card ${coachMood === option.id ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="coach-mood"
                value={option.id}
                checked={coachMood === option.id}
                onChange={() => handleMoodChange(option.id)}
              />
              <span className="settings-mood-title">{option.title}</span>
              <span className="settings-mood-description">{option.description}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <header className="settings-section-header">
          <div>
            <h2>Themes</h2>
            <p>Match the app to your mood or follow your system.</p>
          </div>
        </header>
        <div className="settings-theme-options">
          {THEME_OPTIONS.map(option => (
            <label
              key={option.id}
              className={`settings-theme-card ${themePreference === option.id ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="theme"
                value={option.id}
                checked={themePreference === option.id}
                onChange={() => handleThemeSelection(option.id)}
              />
              <span className="settings-theme-title">{option.label}</span>
              <span className="settings-theme-description">
                {option.id === themePreference ? themeDescription : ''}
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Settings;
