// Notification Service for managing push notifications

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY || '';

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
 */
export async function showLocalNotification(title, options = {}) {
  if (!isPushNotificationSupported()) {
    console.warn('Notifications not supported');
    return;
  }

  if (Notification.permission === 'granted') {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body: options.body || '',
      icon: options.icon || '/icon-192.svg',
      badge: options.badge || '/icon-192.svg',
      vibrate: options.vibrate || [200, 100, 200],
      data: options.data || {},
      tag: options.tag || 'local-notification',
      ...options
    });
  }
}
