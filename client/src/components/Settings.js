import React, { useEffect, useMemo, useState } from 'react';
import './Settings.css';
import { isPushNotificationSupported, requestNotificationPermission, showLocalNotification } from '../services/notificationService';

const THEME_OPTIONS = [
  { id: 'system', label: 'System default' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' }
];

const Settings = ({ onShowNotificationPrompt, onOpenCoach }) => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [coachAutoOpen, setCoachAutoOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('coach:autoOpen') === 'true';
    } catch (error) {
      return false;
    }
  });
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'system';
    try {
      return window.localStorage.getItem('theme:preference') || 'system';
    } catch (error) {
      return 'system';
    }
  });
  const [themeApplied, setThemeApplied] = useState(false);

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  useEffect(() => {
    if (!themeApplied) {
      applyTheme(theme);
      setThemeApplied(true);
    }
  }, [theme, themeApplied]);

  const themeDescription = useMemo(() => {
    switch (theme) {
      case 'light':
        return 'Bright layout with light background and dark text.';
      case 'dark':
        return 'Dimmed layout to reduce glare in low-light environments.';
      default:
        return 'Tracks your operating system setting automatically.';
    }
  }, [theme]);

  const applyTheme = (value) => {
    if (typeof document === 'undefined') {
      return;
    }
    const root = document.documentElement;
    if (value === 'light') {
      root.dataset.theme = 'light';
    } else if (value === 'dark') {
      root.dataset.theme = 'dark';
    } else {
      delete root.dataset.theme;
    }
  };

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
    setCoachAutoOpen(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('coach:autoOpen', String(next));
        } catch (error) {
          console.warn('Failed to store coach preference:', error);
        }
      }
      return next;
    });
  };

  const handleThemeChange = (value) => {
    setTheme(value);
    applyTheme(value);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('theme:preference', value);
      } catch (error) {
        console.warn('Failed to store theme preference:', error);
      }
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
            <label key={option.id} className={`settings-theme-card ${theme === option.id ? 'active' : ''}`}>
              <input
                type="radio"
                name="theme"
                value={option.id}
                checked={theme === option.id}
                onChange={() => handleThemeChange(option.id)}
              />
              <span className="settings-theme-title">{option.label}</span>
              <span className="settings-theme-description">
                {option.id === theme ? themeDescription : ''}
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Settings;
