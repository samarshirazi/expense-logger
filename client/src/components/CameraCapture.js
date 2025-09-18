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
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
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

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob and create file
    canvas.toBlob((blob) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = new File([blob], `receipt-${timestamp}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });

      stopCamera();
      onCapture(file);
    }, 'image/jpeg', 0.9);
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
              <p>Position receipt within the frame</p>
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