import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadReceipt } from '../services/apiService';
import {
  showLocalNotification,
  getNotificationPermissionState,
  getStoredNotificationsEnabled,
  getStoredNotificationPreferences
} from '../services/notificationService';
import './CameraCapture.css';

const ReceiptUpload = ({ onExpenseAdded, expenses = [] }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const cameraInputRef = React.useRef(null);
  const [scannedData, setScannedData] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

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
      // Prevent multiple calls in quick succession
      if (checkBudgetThresholds.isRunning) {
        console.log('⏭️  Budget check already in progress, skipping...');
        return;
      }

      checkBudgetThresholds.isRunning = true;
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
      const notificationsEnabled = getStoredNotificationsEnabled();
      const preferences = getStoredNotificationPreferences();

      console.log('🔐 Notification permission:', permissionState);

      // Skip if overspending alerts are disabled
      if (!notificationsEnabled || !preferences?.overspendingAlert) {
        console.log('⏭️  Overspending alerts disabled in settings');
        return;
      }

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
    } finally {
      // Reset the running flag after a short delay
      setTimeout(() => {
        checkBudgetThresholds.isRunning = false;
      }, 1000);
    }
  }, [getMonthKey, expenses]);

  const handleSaveScannedReceipt = useCallback(async () => {
    if (!scannedData) return;

    try {
      // Call onExpenseAdded with the reviewed data
      if (onExpenseAdded) {
        await onExpenseAdded(scannedData);
        await checkBudgetThresholds(scannedData);

        const merchantName = scannedData?.merchantName || 'Receipt';
        const totalAmount = scannedData?.totalAmount || 0;
        const itemCount = scannedData?.items?.length || 0;

        let successMsg = `${merchantName}: $${totalAmount.toFixed(2)}`;
        if (itemCount > 0) {
          successMsg += ` (${itemCount} item${itemCount !== 1 ? 's' : ''})`;
        }
        successMsg += ' - Saved successfully!';
        setSuccess(successMsg);
      }

      setShowReviewModal(false);
      setScannedData(null);
    } catch (err) {
      setError(err.message || 'Failed to save expense');
    }
  }, [scannedData, onExpenseAdded, checkBudgetThresholds]);

  const handleCancelReview = useCallback(() => {
    setShowReviewModal(false);
    setScannedData(null);
  }, []);

  const handleUpdateScannedItem = useCallback((itemIndex, field, value) => {
    setScannedData(prev => {
      if (!prev || !prev.items) return prev;

      const updatedItems = [...prev.items];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        [field]: value
      };

      // Recalculate total if prices changed
      const newTotal = updatedItems.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);

      return {
        ...prev,
        items: updatedItems,
        totalAmount: newTotal
      };
    });
  }, []);

  const handleFileUpload = useCallback(async (file) => {
    // Upload directly without cropping
    setUploading(true);
    setError(null);
    setSuccess(null);
    setProgress(0);

    try {
      const result = await uploadReceipt(file, (progressPercent) => {
        setProgress(progressPercent);
      });

      const normalizedExpense = result.expense
        ? result.expense
        : (result.expenseData
          ? {
              ...result.expenseData,
              id: result.expenseId || result.expenseData.id || undefined
            }
          : null);

      // Show notification if enabled
      const notificationsEnabled = getStoredNotificationsEnabled();
      const preferences = getStoredNotificationPreferences();
      const permissionGranted = getNotificationPermissionState() === 'granted';

      if (notificationsEnabled && permissionGranted && preferences?.newReceiptScanned) {
        const merchantName = normalizedExpense?.merchantName || 'Receipt';
        const totalAmount = normalizedExpense?.totalAmount || 0;
        await showLocalNotification('Receipt Processed Successfully!', {
          body: `${merchantName}: $${totalAmount.toFixed(2)} added to your expenses`,
          icon: '/icon-192.svg',
          tag: 'receipt-processed'
        });
      }

      // Show review modal instead of immediately saving
      if (normalizedExpense) {
        setScannedData(normalizedExpense);
        setShowReviewModal(true);
      } else {
        setSuccess('Receipt processed successfully!');
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

  const handleCameraClick = useCallback(() => {
    clearMessages();
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  }, []);

  const handleCameraInputChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileUpload(file);
    }
    // Reset input so the same file can be selected again if needed
    e.target.value = '';
  }, [handleFileUpload]);

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
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraInputChange}
            style={{ display: 'none' }}
          />
          <button className="camera-btn" onClick={handleCameraClick}>
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

      {/* Review Modal */}
      {showReviewModal && scannedData && (
        <div className="receipt-review-modal-overlay" onClick={handleCancelReview}>
          <div className="receipt-review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="review-modal-header">
              <h3>Review Scanned Receipt</h3>
              <button className="review-close-btn" onClick={handleCancelReview}>×</button>
            </div>

            <div className="review-modal-body">
              <div className="review-merchant-info">
                <p className="review-merchant">{scannedData.merchantName}</p>
                <p className="review-date">{scannedData.date || 'Date not detected'}</p>
              </div>

              <div className="review-items-section">
                <h4>Items ({scannedData.items?.length || 0})</h4>
                <div className="review-items-list">
                  {scannedData.items?.map((item, index) => (
                    <div key={index} className="review-item">
                      <input
                        type="text"
                        className="review-item-description"
                        value={item.description}
                        onChange={(e) => handleUpdateScannedItem(index, 'description', e.target.value)}
                        placeholder="Item description"
                      />
                      <div className="review-item-price-group">
                        <input
                          type="number"
                          className="review-item-qty"
                          value={item.quantity || 1}
                          onChange={(e) => handleUpdateScannedItem(index, 'quantity', parseFloat(e.target.value) || 1)}
                          placeholder="Qty"
                          min="1"
                          step="1"
                        />
                        <span className="review-item-x">×</span>
                        <div className="review-item-price-input">
                          <span>$</span>
                          <input
                            type="number"
                            value={item.totalPrice || ''}
                            onChange={(e) => handleUpdateScannedItem(index, 'totalPrice', e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="review-total">
                <span>Total:</span>
                <span className="review-total-amount">${scannedData.totalAmount?.toFixed(2) || '0.00'}</span>
              </div>
            </div>

            <div className="review-modal-footer">
              <button className="review-cancel-btn" onClick={handleCancelReview}>
                Cancel
              </button>
              <button className="review-save-btn" onClick={handleSaveScannedReceipt}>
                Save Receipt
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ReceiptUpload;
