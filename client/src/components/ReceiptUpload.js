import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadReceipt } from '../services/apiService';
import CameraCapture from './CameraCapture';
import './CameraCapture.css';

const ReceiptUpload = ({ onExpenseAdded }) => {
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

      if (onExpenseAdded && result.expenseData) {
        onExpenseAdded({
          id: result.expenseId,
          ...result.expenseData,
          driveFileId: result.driveFileId,
          originalFilename: file.name,
          uploadDate: new Date().toISOString()
        });
      }

    } catch (err) {
      setError(err.message || 'Failed to process receipt');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [onExpenseAdded]);

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
