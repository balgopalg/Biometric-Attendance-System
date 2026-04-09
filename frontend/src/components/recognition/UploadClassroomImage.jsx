import { useState, useRef } from 'react';
import { HiOutlinePhotograph, HiOutlineCheckCircle, HiOutlineExclamationCircle } from 'react-icons/hi';

const UploadClassroomImage = ({ onUpload, onClose, isLoading = false }) => {
  const [preview, setPreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setFileName(file.name);
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target.result);
    };
    reader.readAsDataURL(file);
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

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      alert('Please select an image first');
      return;
    }

    // Use the original file object directly
    onUpload(selectedFile);
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
            onChange={handleChange}
            style={{ display: 'none' }}
          />

          {!preview ? (
            <>
              <div style={{
                fontSize: 32,
                marginBottom: 12,
                color: 'var(--accent-purple)',
              }}>
                <HiOutlinePhotograph style={{ display: 'inline-block' }} />
              </div>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>
                {dragActive ? 'Drop your image here' : 'Drag and drop or click to select'}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                PNG, JPG, or WebP (max 10MB)
              </p>
            </>
          ) : (
            <>
              <img
                src={preview}
                alt="preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: 300,
                  borderRadius: 'var(--radius)',
                  marginBottom: 12,
                }}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {fileName}
              </p>
            </>
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
            disabled={!preview || isLoading}
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
