import { useState, useRef, useEffect } from 'react';
import { HiOutlinePhotograph, HiOutlineCheckCircle, HiOutlineExclamationCircle, HiOutlineCamera, HiOutlineRefresh, HiOutlineSwitchHorizontal, HiOutlineInformationCircle, HiOutlineX } from 'react-icons/hi';
import { useWebcam } from '../../hooks/useWebcam';
import toast from 'react-hot-toast';

const UploadClassroomImage = ({ onUpload, onClose, isLoading = false }) => {
  const [previews, setPreviews] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const fileInputRef = useRef(null);
  const tooltipRef = useRef(null);
  const { videoRef, canvasRef, isActive, error: cameraError, startCamera, stopCamera, flipCamera, captureFrame } = useWebcam();

  const handleFiles = (filesList) => {
    const validFiles = Array.from(filesList).filter(f => f.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
      toast.error('Please select image files only');
      return;
    }

    const totalFiles = selectedFiles.length + validFiles.length;
    if (totalFiles > 5) {
      toast.error('You can only upload a maximum of 5 images at a time');
      return;
    }

    const newFiles = [...selectedFiles, ...validFiles].slice(0, 5);
    setSelectedFiles(newFiles);

    // Only read newly added files, then merge with existing previews
    Promise.all(validFiles.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ name: file.name, url: e.target.result });
        reader.readAsDataURL(file);
      });
    })).then(newPreviews => {
      setPreviews(prev => [...prev, ...newPreviews].slice(0, 5));
    });
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleRemoveImage = (e, index) => {
    e.stopPropagation();
    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    setSelectedFiles(newFiles);

    const newPreviews = [...previews];
    newPreviews.splice(index, 1);
    setPreviews(newPreviews);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleCapture = async () => {
    if (isCapturing) {
      stopCamera();
      setIsCapturing(false);
    } else {
      setIsCapturing(true);
      await startCamera('environment');
    }
  };

  const handleCapture = () => {
    const dataUrl = captureFrame();
    if (!dataUrl) {
      toast.error('Failed to capture photo');
      return;
    }

    // Convert dataURL to File object
    const fetchAndConvert = async () => {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        handleFiles([file]);
        stopCamera();
        setIsCapturing(false);
      } catch (err) {
        toast.error('Error processing captured image');
      }
    };
    fetchAndConvert();
  };

  useEffect(() => {
    const onDocClick = (e) => {
      if (!showTooltip) return;
      if (tooltipRef.current && !tooltipRef.current.contains(e.target)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showTooltip]);

  const handleUpload = () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select at least one image');
      return;
    }

    onUpload(selectedFiles);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border-glass)',
        padding: 24,
        maxWidth: 500,
        width: '90%',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>
              Upload Classroom Image
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Capture or upload photos to recognize students.
            </p>
          </div>
          
          <div ref={tooltipRef} style={{ position: 'relative' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowTooltip((s) => !s); }}
              aria-expanded={showTooltip}
              style={{
                background: 'rgba(139, 92, 246, 0.1)',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'grid',
                placeItems: 'center',
                color: 'var(--accent-purple)',
                cursor: 'help'
              }}
            >
              <HiOutlineInformationCircle size={20} />
            </button>
            {showTooltip && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 8,
                width: 260,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-glass)',
                borderRadius: 12,
                padding: 14,
                boxShadow: '0 14px 30px -8px rgba(2,6,23,0.6)',
                zIndex: 20,
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                transition: 'transform 160ms ease, opacity 160ms ease',
                transformOrigin: 'top right',
                transform: showTooltip ? 'translateY(0)' : 'translateY(-6px)',
                opacity: showTooltip ? 1 : 0,
              }} role="dialog" aria-label="Capture requirements">
                <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Capture Requirements:</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}><HiOutlineCheckCircle style={{ color: 'var(--accent-purple)', flexShrink: 0 }} /> Clear image with visible faces</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}><HiOutlineCheckCircle style={{ color: 'var(--accent-purple)', flexShrink: 0 }} /> Good lighting for detection</div>
                <div style={{ display: 'flex', gap: 8 }}><HiOutlineCheckCircle style={{ color: 'var(--accent-purple)', flexShrink: 0 }} /> Multiple students in frame</div>
              </div>
            )}
          </div>
        </div>

        {/* Drag and Drop Area */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragActive ? 'var(--accent-purple)' : 'var(--border-glass)'}`,
            borderRadius: 'var(--radius)',
            padding: 0,
            minHeight: 420,
            textAlign: 'center',
            cursor: 'pointer',
            background: dragActive ? 'rgba(139, 92, 246, 0.05)' : 'transparent',
            transition: 'all 0.2s ease',
            marginBottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleChange}
            style={{ display: 'none' }}
          />

          {isCapturing ? (
            <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', minHeight: 420, background: '#000', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              
              {cameraError && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20, textAlign: 'center', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.85rem' }}>
                  <HiOutlineExclamationCircle size={24} style={{ color: '#ef4444', marginBottom: 8 }} />
                  {cameraError}
                </div>
              )}

              <div style={{ 
                position: 'absolute', 
                bottom: 0, 
                left: 0, 
                right: 0, 
                display: 'grid', 
                gridTemplateColumns: '1fr auto 1fr',
                alignItems: 'center',
                columnGap: 12,
                padding: '16px 20px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                borderRadius: '0 0 var(--radius) var(--radius)'
              }}>
                <button 
                  className="btn-secondary" 
                  onClick={(e) => { e.stopPropagation(); toggleCapture(); }}
                  style={{ 
                    justifySelf: 'start',
                    borderRadius: '50%', width: 44, height: 44, padding: 0, 
                    display: 'grid', placeItems: 'center', flexShrink: 0, 
                    border: '2px solid rgba(255,255,255,0.8)', 
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                  }}
                  title="Cancel"
                >
                  <HiOutlineX size={22} />
                </button>
                <button 
                  className="btn-primary" 
                  onClick={(e) => { e.stopPropagation(); handleCapture(); }}
                  disabled={!isActive}
                  style={{ 
                    justifySelf: 'center',
                    borderRadius: '50%', width: 68, height: 68, padding: 0, 
                    display: 'grid', placeItems: 'center', flexShrink: 0, 
                    boxShadow: '0 0 25px rgba(139, 92, 246, 0.5)', 
                    border: '5px solid #fff',
                    background: 'var(--accent-purple)'
                  }}
                  title="Capture Photo"
                >
                  <HiOutlineCamera size={34} style={{ color: '#fff' }} />
                </button>
                <button 
                  className="btn-secondary" 
                  onClick={(e) => { e.stopPropagation(); flipCamera(); }}
                  disabled={!isActive}
                  style={{ 
                    justifySelf: 'end',
                    borderRadius: '50%', width: 44, height: 44, padding: 0, 
                    display: 'grid', placeItems: 'center', flexShrink: 0, 
                    border: '2px solid rgba(255,255,255,0.8)', 
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                  }}
                  title="Switch Camera"
                >
                  <HiOutlineSwitchHorizontal size={22} />
                </button>
              </div>
            </div>
          ) : previews.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32, height: '100%', boxSizing: 'border-box', justifyContent: 'center' }}>
              <div style={{
                fontSize: 32,
                color: 'var(--accent-purple)',
              }}>
                <HiOutlinePhotograph style={{ display: 'inline-block' }} />
              </div>
              <p style={{ fontWeight: 600, marginBottom: 0 }}>
                {dragActive ? 'Drop your images here' : 'Drag and drop or click to select'}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                Upload 1 to 5 classroom photos (PNG, JPG, WebP)
              </p>
              <div style={{ width: '100%', height: '1px', background: 'var(--border-glass)', margin: '4px 0' }} />
              <button 
                className="btn-secondary" 
                onClick={(e) => { e.stopPropagation(); toggleCapture(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: '0.85rem' }}
              >
                <HiOutlineCamera size={18} /> Capture with Camera
              </button>
            </div>
          ) : (
            <div style={{ padding: 32, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 12 }}>
                {previews.map((prev, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <img
                      src={prev.url}
                      alt={`preview ${idx + 1}`}
                      style={{
                        width: 80,
                        height: 80,
                        objectFit: 'cover',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border-glass)'
                      }}
                    />
                    <button
                      onClick={(e) => handleRemoveImage(e, idx)}
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        padding: 0,
                      }}
                      title="Remove image"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                {previews.length < 5 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCapture(); }}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 'var(--radius)',
                      border: '1px dashed var(--border-glass)',
                      background: 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      color: 'var(--text-muted)',
                      fontSize: '0.65rem'
                    }}
                  >
                    <HiOutlineCamera size={20} />
                    <span>Capture</span>
                  </button>
                )}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {previews.length} image{previews.length > 1 ? 's' : ''} selected. Click or drag to add more.
              </p>
            </div>
          )}
        </div>



        {/* Buttons */}
        <div style={{
          display: 'flex',
          gap: 10,
          justifyContent: 'flex-end',
          marginTop: 16,
        }}>
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={isLoading}
            style={{ minWidth: 100 }}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleUpload}
            disabled={previews.length === 0 || isLoading}
            style={{ minWidth: 100 }}
          >
            {isLoading ? 'Processing...' : 'Upload & Recognize'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadClassroomImage;
