import React, { useRef, useState, useCallback } from 'react';
import './CameraCapture.css';

const CameraCapture = ({ onCapture, onCancel }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // Default to back camera

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      // Use lower resolution to avoid memory issues
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          aspectRatio: { ideal: 16/9 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setIsReady(true);
        };
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Unable to access camera. Please check permissions and try again.');
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsReady(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isReady) {
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      // Maximum dimensions to avoid memory issues
      const MAX_WIDTH = 1280;
      const MAX_HEIGHT = 1280;

      let sourceWidth = video.videoWidth;
      let sourceHeight = video.videoHeight;
      let targetWidth = sourceWidth;
      let targetHeight = sourceHeight;

      // Calculate scaled dimensions while maintaining aspect ratio
      if (sourceWidth > MAX_WIDTH || sourceHeight > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / sourceWidth, MAX_HEIGHT / sourceHeight);
        targetWidth = Math.floor(sourceWidth * ratio);
        targetHeight = Math.floor(sourceHeight * ratio);
      }

      console.log(`Capturing photo: ${sourceWidth}x${sourceHeight} → ${targetWidth}x${targetHeight}`);

      // Set canvas dimensions to scaled size
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // Draw video frame to canvas with scaling
      context.drawImage(video, 0, 0, targetWidth, targetHeight);

      // Convert to blob with compression (0.75 quality for smaller file size)
      canvas.toBlob((blob) => {
        if (!blob) {
          setError('Failed to capture photo. Please try again.');
          return;
        }

        // Check if blob is too large (> 5MB) and warn
        const sizeMB = blob.size / 1024 / 1024;
        console.log(`Photo captured: ${sizeMB.toFixed(2)}MB`);

        if (blob.size > 5 * 1024 * 1024) {
          console.warn(`Captured image is large: ${sizeMB.toFixed(2)}MB`);
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = new File([blob], `receipt-${timestamp}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now()
        });

        // Clean up canvas to free memory
        context.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;

        stopCamera();
        onCapture(file);
      }, 'image/jpeg', 0.75);

    } catch (err) {
      console.error('Photo capture error:', err);
      setError('Unable to capture photo due to low memory. Try closing other apps and retry.');
      stopCamera();
    }
  }, [isReady, onCapture, stopCamera]);

  const handleCancel = useCallback(() => {
    stopCamera();
    onCancel();
  }, [stopCamera, onCancel]);

  const toggleCamera = useCallback(() => {
    stopCamera();
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, [stopCamera]);

  // Start camera when component mounts
  React.useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  return (
    <div className="camera-capture">
      <div className="camera-header">
        <h3>📷 Take Photo of Receipt</h3>
        <button className="close-button" onClick={handleCancel}>×</button>
      </div>

      {error && (
        <div className="camera-error">
          <p>{error}</p>
          <button onClick={startCamera}>Try Again</button>
        </div>
      )}

      <div className="camera-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-video"
          style={{ display: error ? 'none' : 'block' }}
        />

        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {isReady && (
          <div className="camera-overlay">
            <div className="capture-guide">
              <div className="guide-frame"></div>
              <p>Position your receipt to fill the frame for best results</p>
            </div>
          </div>
        )}
      </div>

      {isReady && (
        <div className="camera-controls">
          <button className="camera-button secondary" onClick={toggleCamera}>
            🔄 Flip Camera
          </button>
          <button className="camera-button primary" onClick={capturePhoto}>
            📸 Capture
          </button>
          <button className="camera-button secondary" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default CameraCapture;