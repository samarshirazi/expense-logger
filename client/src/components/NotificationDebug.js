import React, { useState } from 'react';
import authService from '../services/authService';
import { initializePushNotifications } from '../services/notificationService';

function NotificationDebug() {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const enableNotifications = async () => {
    try {
      setError('');
      setStatus('Enabling notifications...');

      const user = authService.getCurrentUser();
      const token = authService.getAccessToken();

      if (!user || !token) {
        throw new Error('Not logged in. Please sign in first.');
      }

      const result = await initializePushNotifications(token);

      if (result.success) {
        setStatus('✅ Notifications enabled successfully!\nYou can now test them.');
      } else {
        throw new Error('Failed to initialize notifications');
      }
    } catch (err) {
      console.error('Enable notifications error:', err);
      setError(err.message);
      setStatus('');
    }
  };

  const testNotification = async () => {
    try {
      setError('');
      setStatus('Sending test notification...');

      const user = authService.getCurrentUser();
      const token = authService.getAccessToken();

      if (!user || !token) {
        throw new Error('Not logged in. Please sign in first.');
      }

      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/notifications/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Test notification failed');
      }

      const data = await response.json();
      setStatus(`Success! Sent: ${data.result.sent}, Failed: ${data.result.failed}`);

      if (data.result.sent === 0) {
        setError('No subscriptions found. Did you enable notifications?');
      }
    } catch (err) {
      console.error('Test notification error:', err);
      setError(err.message);
      setStatus('');
    }
  };

  const checkNotificationStatus = () => {
    const permissionStatus = Notification.permission;
    const serviceWorkerStatus = 'serviceWorker' in navigator ? 'Supported' : 'Not supported';
    const pushStatus = 'PushManager' in window ? 'Supported' : 'Not supported';
    const vapidKey = process.env.REACT_APP_VAPID_PUBLIC_KEY;

    setStatus(`
Permission: ${permissionStatus}
Service Worker: ${serviceWorkerStatus}
Push API: ${pushStatus}
VAPID Key: ${vapidKey ? 'Configured (' + vapidKey.substring(0, 20) + '...)' : 'NOT SET'}
    `);
  };

  return (
    <div style={{
      padding: '20px',
      margin: '20px 0',
      border: '2px dashed #007bff',
      borderRadius: '8px',
      backgroundColor: '#f8f9fa'
    }}>
      <h3 style={{ marginTop: 0 }}>Notification Debug Panel</h3>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
        <button
          onClick={checkNotificationStatus}
          style={{
            padding: '10px 15px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Check Status
        </button>

        <button
          onClick={enableNotifications}
          style={{
            padding: '10px 15px',
            backgroundColor: '#6f42c1',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Enable Notifications
        </button>

        <button
          onClick={testNotification}
          style={{
            padding: '10px 15px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Test Notification
        </button>
      </div>

      {status && (
        <div style={{
          padding: '10px',
          backgroundColor: '#d1ecf1',
          border: '1px solid #bee5eb',
          borderRadius: '5px',
          marginBottom: '10px',
          whiteSpace: 'pre-wrap'
        }}>
          {status}
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px',
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '5px',
          color: '#721c24'
        }}>
          Error: {error}
        </div>
      )}
    </div>
  );
}

export default NotificationDebug;
