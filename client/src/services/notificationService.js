// Notification Service for managing push notifications

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY || '';
const NOTIFICATION_PREFS_KEY = 'notificationPreferences';
const NOTIFICATION_ENABLED_KEY = 'notificationsEnabled';
const REMINDER_TAG = 'daily-expense-reminder';

// Track last notification times to prevent spam
const lastNotificationTimes = new Map();

export const DEFAULT_NOTIFICATION_PREFS = Object.freeze({
  dailySummary: true,
  overspendingAlert: true,
  newReceiptScanned: true,
  monthlyBudgetReminder: true,
  frequency: 'daily'
});

export function getStoredNotificationPreferences() {
  try {
    if (typeof window === 'undefined') {
      return { ...DEFAULT_NOTIFICATION_PREFS };
    }

    const stored = window.localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (!stored) {
      return { ...DEFAULT_NOTIFICATION_PREFS };
    }

    const parsed = JSON.parse(stored);
    return { ...DEFAULT_NOTIFICATION_PREFS, ...(parsed || {}) };
  } catch (error) {
    console.warn('Failed to read notification preferences:', error);
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export function saveNotificationPreferences(preferences) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const serialized = JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, ...(preferences || {}) });
    window.localStorage.setItem(NOTIFICATION_PREFS_KEY, serialized);
  } catch (error) {
    console.warn('Failed to save notification preferences:', error);
  }
}

export function getStoredNotificationsEnabled() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(NOTIFICATION_ENABLED_KEY);
    if (stored === null) {
      return null;
    }
    return stored === 'true';
  } catch (error) {
    console.warn('Failed to read notification enabled flag:', error);
    return null;
  }
}

export function setStoredNotificationsEnabled(value) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(NOTIFICATION_ENABLED_KEY, value ? 'true' : 'false');
  } catch (error) {
    console.warn('Failed to store notification enabled flag:', error);
  }
}

export function emitNotificationPreferencesChanged({
  enabled = getStoredNotificationsEnabled(),
  preferences = getStoredNotificationPreferences()
} = {}) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('notificationPreferencesChanged', {
      detail: {
        enabled,
        preferences
      }
    })
  );
}

let expenseReminderTimeoutId = null;
let expenseReminderConfig = null;
let monthlyBudgetReminderTimeoutId = null;
let monthlyBudgetReminderConfig = null;

function getDelayUntilTime(hour, minute) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

function getDelayUntilFirstOfMonth(hour = 9, minute = 0) {
  const now = new Date();
  const target = new Date(now);

  // Set to first day of next month
  target.setMonth(target.getMonth() + 1, 1);
  target.setHours(hour, minute, 0, 0);

  return target.getTime() - now.getTime();
}

export function cancelDailyExpenseReminder() {
  if (typeof window === 'undefined') {
    expenseReminderTimeoutId = null;
    expenseReminderConfig = null;
    return;
  }

  if (expenseReminderTimeoutId) {
    window.clearTimeout(expenseReminderTimeoutId);
    expenseReminderTimeoutId = null;
  }
  expenseReminderConfig = null;
}

export function scheduleDailyExpenseReminder({
  hour = 21,
  minute = 0,
  title = 'Expense reminder',
  body = 'Time to review your expenses.'
} = {}) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  cancelDailyExpenseReminder();
  expenseReminderConfig = { hour, minute, title, body };

  const delay = getDelayUntilTime(hour, minute);
  console.log(`Scheduling daily reminder in ${(delay / 1000 / 60 / 60).toFixed(2)} hours`);

  expenseReminderTimeoutId = window.setTimeout(async () => {
    await showLocalNotification(title, {
      body,
      tag: REMINDER_TAG
    });

    if (expenseReminderConfig) {
      scheduleDailyExpenseReminder(expenseReminderConfig);
    }
  }, delay);
}

export function cancelMonthlyBudgetReminder() {
  if (typeof window === 'undefined') {
    monthlyBudgetReminderTimeoutId = null;
    monthlyBudgetReminderConfig = null;
    return;
  }

  if (monthlyBudgetReminderTimeoutId) {
    window.clearTimeout(monthlyBudgetReminderTimeoutId);
    monthlyBudgetReminderTimeoutId = null;
  }
  monthlyBudgetReminderConfig = null;
}

export function scheduleMonthlyBudgetReminder({
  hour = 9,
  minute = 0,
  title = 'Monthly Budget Review',
  body = 'Start of a new month! Time to review and set your budget.'
} = {}) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  cancelMonthlyBudgetReminder();
  monthlyBudgetReminderConfig = { hour, minute, title, body };

  const delay = getDelayUntilFirstOfMonth(hour, minute);
  console.log(`Scheduling monthly budget reminder in ${(delay / 1000 / 60 / 60 / 24).toFixed(1)} days`);

  monthlyBudgetReminderTimeoutId = window.setTimeout(async () => {
    await showLocalNotification(title, {
      body,
      tag: 'monthly-budget-reminder'
    });

    // Reschedule for next month
    if (monthlyBudgetReminderConfig) {
      scheduleMonthlyBudgetReminder(monthlyBudgetReminderConfig);
    }
  }, delay);
}

/**
 * Convert VAPID public key to Uint8Array for subscription
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if push notifications are supported
 */
export function isPushNotificationSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Check current notification permission status
 */
export function getNotificationPermissionState() {
  if (!isPushNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission() {
  if (!isPushNotificationSupported()) {
    throw new Error('Push notifications are not supported in this browser');
  }

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * Register service worker
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser');
  }

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/'
    });

    console.log('Service Worker registered successfully:', registration);

    // Wait for service worker to be ready
    await navigator.serviceWorker.ready;

    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    throw error;
  }
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPushNotifications(registration) {
  if (!VAPID_PUBLIC_KEY) {
    console.warn('VAPID public key not configured. Push notifications will not work.');
    throw new Error('VAPID public key not configured');
  }

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    console.log('Push subscription created:', subscription);
    return subscription;
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    throw error;
  }
}

/**
 * Get existing push subscription
 */
export async function getPushSubscription(registration) {
  try {
    const subscription = await registration.pushManager.getSubscription();
    return subscription;
  } catch (error) {
    console.error('Failed to get push subscription:', error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications(registration) {
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      console.log('Unsubscribed from push notifications');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to unsubscribe from push notifications:', error);
    throw error;
  }
}

/**
 * Send subscription to server
 */
export async function sendSubscriptionToServer(subscription, token) {
  try {
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';

    const response = await fetch(`${apiUrl}/api/notifications/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        subscription: subscription
      })
    });

    if (!response.ok) {
      throw new Error('Failed to send subscription to server');
    }

    const data = await response.json();
    console.log('Subscription sent to server:', data);
    return data;
  } catch (error) {
    console.error('Error sending subscription to server:', error);
    throw error;
  }
}

/**
 * Initialize push notifications
 * This is the main function to call when setting up notifications
 */
export async function initializePushNotifications(token) {
  try {
    // Check if supported
    if (!isPushNotificationSupported()) {
      throw new Error('Push notifications are not supported');
    }

    // Request permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission not granted');
    }

    // Register service worker
    const registration = await registerServiceWorker();

    // Check for existing subscription
    let subscription = await getPushSubscription(registration);

    // If no subscription exists, create one
    if (!subscription && VAPID_PUBLIC_KEY) {
      subscription = await subscribeToPushNotifications(registration);
    }

    // Send subscription to server
    if (subscription && token) {
      await sendSubscriptionToServer(subscription, token);
    }

    return {
      success: true,
      subscription: subscription,
      permission: permission
    };
  } catch (error) {
    console.error('Failed to initialize push notifications:', error);
    throw error;
  }
}

/**
 * Show a local notification (doesn't require push)
 * Includes throttling to prevent notification spam
 */
export async function showLocalNotification(title, options = {}) {
  if (!isPushNotificationSupported()) {
    console.warn('Notifications not supported');
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  const tag = options.tag || 'local-notification';
  const now = Date.now();

  // Check if we've shown this notification recently (within 5 minutes)
  const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  const lastTime = lastNotificationTimes.get(tag);

  if (lastTime && (now - lastTime) < COOLDOWN_MS) {
    console.log(`[Notification] Skipping duplicate notification with tag "${tag}" (cooldown active)`);
    return;
  }

  // Update last notification time
  lastNotificationTimes.set(tag, now);

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body: options.body || '',
      icon: options.icon || '/icon-192.svg',
      badge: options.badge || '/icon-192.svg',
      vibrate: options.vibrate || [200, 100, 200],
      data: options.data || {},
      tag: tag,
      renotify: false, // Don't re-alert for same tag
      ...options
    });
    console.log(`[Notification] Shown: "${title}" (tag: ${tag})`);
  } catch (error) {
    console.error('[Notification] Failed to show:', error);
  }
}
