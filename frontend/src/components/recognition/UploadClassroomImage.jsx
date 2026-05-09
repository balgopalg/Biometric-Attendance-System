import { useState, useRef } from 'react';
import { HiOutlinePhotograph, HiOutlineCheckCircle, HiOutlineExclamationCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';

const UploadClassroomImage = ({ onUpload, onClose, isLoading = false }) => {
  const [previews, setPreviews] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);

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
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>
            Upload Classroom Image
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Upload a photo of the classroom to recognize and mark attendance for enrolled students.
          </p>
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
            padding: 32,
            textAlign: 'center',
            cursor: 'pointer',
            background: dragActive ? 'rgba(139, 92, 246, 0.05)' : 'transparent',
            transition: 'all 0.2s ease',
            marginBottom: 16,
          }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleChange}
            style={{ display: 'none' }}
          />

          {previews.length === 0 ? (
            <>
              <div style={{
                fontSize: 32,
                marginBottom: 12,
                color: 'var(--accent-purple)',
              }}>
                <HiOutlinePhotograph style={{ display: 'inline-block' }} />
              </div>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>
                {dragActive ? 'Drop your images here' : 'Drag and drop or click to select'}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Upload 1 to 5 classroom photos (PNG, JPG, WebP)
              </p>
            </>
          ) : (
            <div>
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
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {previews.length} image{previews.length > 1 ? 's' : ''} selected. Click or drag to replace.
              </p>
            </div>
          )}
        </div>

        {/* Options Info */}
        <div style={{
          background: 'rgba(139, 92, 246, 0.05)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          borderRadius: 'var(--radius)',
          padding: 12,
          marginBottom: 16,
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
            <HiOutlineCheckCircle size={16} style={{ marginTop: 2, flexShrink: 0, color: 'var(--accent-purple)' }} />
            <span>Clear classroom image with visible student faces</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
            <HiOutlineCheckCircle size={16} style={{ marginTop: 2, flexShrink: 0, color: 'var(--accent-purple)' }} />
            <span>Good lighting for accurate face detection</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <HiOutlineCheckCircle size={16} style={{ marginTop: 2, flexShrink: 0, color: 'var(--accent-purple)' }} />
            <span>Multiple students should be visible in frame</span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{
          display: 'flex',
          gap: 10,
          justifyContent: 'flex-end',
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
