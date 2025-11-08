import React, { useRef, useState, useEffect, useCallback } from 'react';
import './ImageCropModal.css';

const ImageCropModal = ({ imageUrl, onCropComplete, onCancel }) => {
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Crop box state (as percentages of image size)
  const [cropBox, setCropBox] = useState({
    x: 10, // 10% from left
    y: 10, // 10% from top
    width: 80, // 80% of image width
    height: 80 // 80% of image height
  });

  const [dragging, setDragging] = useState(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const getEventPosition = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const handlePointerDown = (e, handle) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
    const pos = getEventPosition(e);
    setDragStart(pos);
  };

  const handlePointerMove = useCallback((e) => {
    if (!dragging || !imageRef.current || !containerRef.current) return;

    const pos = getEventPosition(e);
    const container = containerRef.current.getBoundingClientRect();
    const deltaX = ((pos.x - dragStart.x) / container.width) * 100;
    const deltaY = ((pos.y - dragStart.y) / container.height) * 100;

    setDragStart(pos);

    setCropBox(prev => {
      let newBox = { ...prev };

      switch (dragging) {
        case 'move':
          newBox.x = Math.max(0, Math.min(100 - prev.width, prev.x + deltaX));
          newBox.y = Math.max(0, Math.min(100 - prev.height, prev.y + deltaY));
          break;
        // Corner handles
        case 'nw':
          newBox.x = prev.x + deltaX;
          newBox.y = prev.y + deltaY;
          newBox.width = prev.width - deltaX;
          newBox.height = prev.height - deltaY;
          break;
        case 'ne':
          newBox.y = prev.y + deltaY;
          newBox.width = prev.width + deltaX;
          newBox.height = prev.height - deltaY;
          break;
        case 'sw':
          newBox.x = prev.x + deltaX;
          newBox.width = prev.width - deltaX;
          newBox.height = prev.height + deltaY;
          break;
        case 'se':
          newBox.width = prev.width + deltaX;
          newBox.height = prev.height + deltaY;
          break;
        // Edge handles
        case 'n':
          newBox.y = prev.y + deltaY;
          newBox.height = prev.height - deltaY;
          break;
        case 's':
          newBox.height = prev.height + deltaY;
          break;
        case 'w':
          newBox.x = prev.x + deltaX;
          newBox.width = prev.width - deltaX;
          break;
        case 'e':
          newBox.width = prev.width + deltaX;
          break;
        default:
          break;
      }

      // Ensure minimum size and bounds
      newBox.width = Math.max(20, Math.min(100 - newBox.x, newBox.width));
      newBox.height = Math.max(20, Math.min(100 - newBox.y, newBox.height));
      newBox.x = Math.max(0, Math.min(100 - newBox.width, newBox.x));
      newBox.y = Math.max(0, Math.min(100 - newBox.height, newBox.y));

      return newBox;
    });
  }, [dragging, dragStart]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging) {
      document.addEventListener('mousemove', handlePointerMove);
      document.addEventListener('mouseup', handlePointerUp);
      document.addEventListener('touchmove', handlePointerMove);
      document.addEventListener('touchend', handlePointerUp);
      return () => {
        document.removeEventListener('mousemove', handlePointerMove);
        document.removeEventListener('mouseup', handlePointerUp);
        document.removeEventListener('touchmove', handlePointerMove);
        document.removeEventListener('touchend', handlePointerUp);
      };
    }
  }, [dragging, handlePointerMove, handlePointerUp]);

  const handleCrop = async () => {
    if (!imageRef.current) return;

    try {
      setLoading(true);

      const img = imageRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Calculate actual pixel values from percentages
      const cropX = (cropBox.x / 100) * img.naturalWidth;
      const cropY = (cropBox.y / 100) * img.naturalHeight;
      const cropWidth = (cropBox.width / 100) * img.naturalWidth;
      const cropHeight = (cropBox.height / 100) * img.naturalHeight;

      canvas.width = cropWidth;
      canvas.height = cropHeight;

      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
      );

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

      <div className="crop-container" ref={containerRef}>
        <img
          ref={imageRef}
          src={imageUrl}
          alt="Crop preview"
          className="crop-image"
          onLoad={() => setImageLoaded(true)}
          draggable={false}
        />

        {imageLoaded && (
          <>
            {/* Dark overlay */}
            <div className="crop-overlay" />

            {/* Crop box */}
            <div
              className="crop-box"
              style={{
                left: `${cropBox.x}%`,
                top: `${cropBox.y}%`,
                width: `${cropBox.width}%`,
                height: `${cropBox.height}%`,
              }}
              onMouseDown={(e) => handlePointerDown(e, 'move')}
              onTouchStart={(e) => handlePointerDown(e, 'move')}
            >
              {/* Grid overlay for alignment */}
              <div className="crop-grid">
                <div className="grid-line grid-line-v" style={{ left: '33.33%' }} />
                <div className="grid-line grid-line-v" style={{ left: '66.66%' }} />
                <div className="grid-line grid-line-h" style={{ top: '33.33%' }} />
                <div className="grid-line grid-line-h" style={{ top: '66.66%' }} />
              </div>

              {/* Corner handles */}
              <div
                className="crop-handle corner nw"
                onMouseDown={(e) => handlePointerDown(e, 'nw')}
                onTouchStart={(e) => handlePointerDown(e, 'nw')}
              />
              <div
                className="crop-handle corner ne"
                onMouseDown={(e) => handlePointerDown(e, 'ne')}
                onTouchStart={(e) => handlePointerDown(e, 'ne')}
              />
              <div
                className="crop-handle corner sw"
                onMouseDown={(e) => handlePointerDown(e, 'sw')}
                onTouchStart={(e) => handlePointerDown(e, 'sw')}
              />
              <div
                className="crop-handle corner se"
                onMouseDown={(e) => handlePointerDown(e, 'se')}
                onTouchStart={(e) => handlePointerDown(e, 'se')}
              />

              {/* Edge handles */}
              <div
                className="crop-handle edge n"
                onMouseDown={(e) => handlePointerDown(e, 'n')}
                onTouchStart={(e) => handlePointerDown(e, 'n')}
              />
              <div
                className="crop-handle edge s"
                onMouseDown={(e) => handlePointerDown(e, 's')}
                onTouchStart={(e) => handlePointerDown(e, 's')}
              />
              <div
                className="crop-handle edge w"
                onMouseDown={(e) => handlePointerDown(e, 'w')}
                onTouchStart={(e) => handlePointerDown(e, 'w')}
              />
              <div
                className="crop-handle edge e"
                onMouseDown={(e) => handlePointerDown(e, 'e')}
                onTouchStart={(e) => handlePointerDown(e, 'e')}
              />
            </div>
          </>
        )}
      </div>

      <div className="crop-controls">
        <div className="crop-hint">
          Drag corners or edges to adjust • Drag center to move
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
            disabled={loading || !imageLoaded}
          >
            {loading ? 'Processing...' : 'Crop & Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropModal;
