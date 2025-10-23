import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadReceipt } from '../services/apiService';
import { showLocalNotification, getNotificationPermissionState } from '../services/notificationService';
import CameraCapture from './CameraCapture';
import './CameraCapture.css';

const ReceiptUpload = ({ onExpenseAdded, expenses = [] }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile device
  React.useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      const hasCamera = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
      setIsMobile(isMobileDevice && hasCamera);
    };

    checkMobile();
  }, []);

  // Helper function to get current month key
  const getMonthKey = useCallback((dateString) => {
    return dateString.substring(0, 7); // "2024-01-15" -> "2024-01"
  }, []);

  // Helper function to check budget thresholds
  const checkBudgetThresholds = useCallback(async (addedExpense) => {
    try {
      console.log('🔔 Checking budget thresholds for receipt...', addedExpense);

      // Get monthly budgets from localStorage
      const monthlyBudgets = JSON.parse(localStorage.getItem('monthlyBudgets') || '{}');
      const currentMonth = getMonthKey(new Date().toISOString().split('T')[0]);
      const currentBudget = monthlyBudgets[currentMonth];

      console.log('📊 Current budget:', currentBudget);

      if (!currentBudget) {
        console.log('❌ No budget found for current month');
        return;
      }

      // Use expenses from props (React state, not localStorage)
      const allExpenses = expenses || [];

      console.log('💰 Total expenses loaded:', allExpenses.length);

      // Calculate current spending by category for the month
      const monthSpending = {
        Food: 0,
        Transport: 0,
        Shopping: 0,
        Bills: 0,
        Other: 0
      };

      // Calculate spending from existing expenses
      allExpenses.forEach(expense => {
        if (expense.date && expense.date.startsWith(currentMonth)) {
          if (expense.items && expense.items.length > 0) {
            expense.items.forEach(item => {
              const itemCategory = item.category || 'Other';
              monthSpending[itemCategory] += item.totalPrice || 0;
            });
          } else {
            const category = expense.category || 'Other';
            monthSpending[category] += expense.totalAmount || 0;
          }
        }
      });

      // Add newly added expense to spending
      if (addedExpense.items && addedExpense.items.length > 0) {
        addedExpense.items.forEach(item => {
          const itemCategory = item.category || 'Other';
          monthSpending[itemCategory] += item.totalPrice || 0;
        });
      } else {
        const category = addedExpense.category || 'Other';
        monthSpending[category] += addedExpense.totalAmount || 0;
      }

      console.log('📈 Month spending by category:', monthSpending);

      // Check for categories approaching or exceeding budget
      const THRESHOLD = 0.85; // 85% of budget
      const permissionState = getNotificationPermissionState();

      console.log('🔐 Notification permission:', permissionState);

      for (const category of Object.keys(monthSpending)) {
        const budget = currentBudget[category] || 0;
        const spent = monthSpending[category] || 0;
        const percentage = budget > 0 ? (spent / budget) * 100 : 0;

        console.log(`📊 ${category}: $${spent.toFixed(2)} / $${budget.toFixed(2)} (${percentage.toFixed(1)}%)`);

        if (budget === 0) continue;

        if (percentage >= 100) {
          console.log(`⚠️ ${category} OVER BUDGET!`);
          if (permissionState === 'granted') {
            await showLocalNotification('Budget Exceeded! ⚠️', {
              body: `You've exceeded your ${category} budget! Spent $${spent.toFixed(2)} of $${budget.toFixed(2)} (${Math.round(percentage)}%)`,
              icon: '/icon-192.svg',
              tag: `budget-warning-${category}`,
              data: { category, percentage }
            });
          } else {
            console.log('❌ Cannot show notification - permission not granted');
          }
        } else if (percentage >= THRESHOLD * 100) {
          console.log(`💡 ${category} approaching budget limit!`);
          if (permissionState === 'granted') {
            await showLocalNotification('Budget Alert 💡', {
              body: `You're close to your ${category} budget limit! Spent $${spent.toFixed(2)} of $${budget.toFixed(2)} (${Math.round(percentage)}%)`,
              icon: '/icon-192.svg',
              tag: `budget-alert-${category}`,
              data: { category, percentage }
            });
          } else {
            console.log('❌ Cannot show notification - permission not granted');
          }
        }
      }
    } catch (err) {
      console.warn('Failed to check budget thresholds:', err);
    }
  }, [getMonthKey, expenses]);

  const handleFileUpload = useCallback(async (file) => {
    setUploading(true);
    setError(null);
    setSuccess(null);
    setProgress(0);

    try {
      const result = await uploadReceipt(file, (progressPercent) => {
        setProgress(progressPercent);
      });

      setSuccess('Receipt processed successfully!');

      // Use the full expense object from server response
      if (onExpenseAdded && result.expense) {
        onExpenseAdded(result.expense);

        // Check budget thresholds immediately with current expenses
        await checkBudgetThresholds(result.expense);
      }

    } catch (err) {
      setError(err.message || 'Failed to process receipt');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [onExpenseAdded, checkBudgetThresholds]);

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    await handleFileUpload(file);
  }, [handleFileUpload]);

  const handleCameraCapture = useCallback(async (file) => {
    setShowCamera(false);
    await handleFileUpload(file);
  }, [handleFileUpload]);

  const handleCameraCancel = useCallback(() => {
    setShowCamera(false);
  }, []);

  const openCamera = useCallback(() => {
    clearMessages();
    setShowCamera(true);
  }, []);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject
  } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
    disabled: uploading
  });

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const rootProps = getRootProps({
    onClick: () => {
      clearMessages();
    }
  });

  return (
    <div className="upload-section">
      <h2>Upload Receipt</h2>

      {/* Camera button for mobile devices */}
      {isMobile && !uploading && (
        <div className="camera-section">
          <button className="camera-btn" onClick={openCamera}>
            📷 Take Photo
          </button>
          <span className="camera-divider">or</span>
        </div>
      )}

      <div
        {...rootProps}
        className={`upload-zone ${isDragActive ? 'active' : ''} ${isDragReject ? 'reject' : ''}`}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <div className="processing">
            <div className="spinner"></div>
            <p>Processing receipt with AI...</p>
            {progress > 0 && (
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="upload-icon">📄</div>
            <div className="upload-text">
              {isDragActive ? (
                'Drop the receipt here...'
              ) : isMobile ? (
                'Tap to select a file from your device'
              ) : (
                'Drag & drop a receipt here, or click to select'
              )}
            </div>
            <div className="upload-subtext">
              Supports JPEG, PNG, and PDF files (max 10MB)
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
          <button
            onClick={clearMessages}
            style={{
              float: 'right',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.2rem'
            }}
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="success">
          <strong>Success:</strong> {success}
          <button
            onClick={clearMessages}
            style={{
              float: 'right',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.2rem'
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Camera capture modal */}
      {showCamera && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onCancel={handleCameraCancel}
        />
      )}

    </div>
  );
};

export default ReceiptUpload;
