import { useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { HiOutlineCamera, HiOutlineX } from 'react-icons/hi';
import { useWebcam } from '../../hooks/useWebcam';
import WebcamFeed from '../recognition/WebcamFeed';

export default function FaceEnrollmentModal({ student, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const { videoRef, canvasRef, isActive, error, startCamera, stopCamera, captureFrame } = useWebcam();

  const handleStartCamera = async () => {
    await startCamera();
  };

  const handleCapture = async () => {
    try {
      setLoading(true);
      const photoB64 = captureFrame();
      
      if (!photoB64) {
        toast.error('Failed to capture frame');
        return;
      }

      const response = await api.post('/admin/students/enroll', {
        user_id: student.user_id || student._id,
        photo: photoB64,
      });

      toast.success(response.data.message || 'Face enrolled successfully');
      stopCamera();
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to enroll face');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        maxWidth: 560,
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto',
        padding: 24,
        position: 'relative',
      }}>
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            padding: 6,
            fontSize: '1.2rem',
          }}
        >
          <HiOutlineX />
        </button>

        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 8 }}>
          Enroll Face for {student?.name}
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>
          Position your face clearly in the camera frame and capture a bright, clear photo.
        </p>

        {/* Webcam Feed */}
        <WebcamFeed 
          ref={videoRef} 
          isActive={isActive} 
          error={error}
        />

        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Controls */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          {!isActive ? (
            <button
              onClick={handleStartCamera}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: 'var(--accent-purple)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <HiOutlineCamera size={16} />
              Start Camera
            </button>
          ) : (
            <>
              <button
                onClick={handleCapture}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: loading ? 'var(--text-muted)' : 'var(--accent-emerald)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <HiOutlineCamera size={16} />
                {loading ? 'Enrolling...' : 'Capture & Enroll'}
              </button>
              <button
                onClick={() => stopCamera()}
                style={{
                  padding: '10px 16px',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
              }}
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
