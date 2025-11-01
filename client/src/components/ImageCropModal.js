import React, { useRef, useState } from 'react';
import Cropper from 'react-cropper';
import 'react-cropper/node_modules/cropperjs/dist/cropper.min.css';
import './ImageCropModal.css';

const ImageCropModal = ({ imageUrl, onCropComplete, onCancel }) => {
  const cropperRef = useRef(null);
  const [loading, setLoading] = useState(false);

  const handleCrop = async () => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) return;

    try {
      setLoading(true);

      // Get cropped canvas
      const canvas = cropper.getCroppedCanvas({
        maxWidth: 2048,
        maxHeight: 2048,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });

      // Convert to blob
      canvas.toBlob((blob) => {
        if (!blob) {
          console.error('Failed to create blob');
          setLoading(false);
          return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = new File([blob], `receipt-${timestamp}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now()
        });

        onCropComplete(file);
        setLoading(false);
      }, 'image/jpeg', 0.95);

    } catch (error) {
      console.error('Error cropping image:', error);
      setLoading(false);
    }
  };

  return (
    <div className="crop-modal">
      <div className="crop-modal-header">
        <h3>Crop Receipt</h3>
        <button className="close-button" onClick={onCancel}>×</button>
      </div>

      <div className="crop-container">
        <Cropper
          ref={cropperRef}
          src={imageUrl}
          style={{ height: '100%', width: '100%' }}
          guides={true}
          viewMode={1}
          dragMode="move"
          scalable={true}
          zoomable={true}
          cropBoxMovable={true}
          cropBoxResizable={true}
          background={false}
          responsive={true}
          autoCropArea={0.9}
          checkOrientation={false}
          movable={true}
          rotatable={true}
        />
      </div>

      <div className="crop-controls">
        <div className="crop-hint">
          Drag corners to adjust crop area
        </div>

        <div className="crop-buttons">
          <button
            className="button secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="button primary"
            onClick={handleCrop}
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Crop & Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropModal;
