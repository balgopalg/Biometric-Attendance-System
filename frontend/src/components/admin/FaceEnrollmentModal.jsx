import { useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { HiOutlineCamera, HiOutlineX } from 'react-icons/hi';
import { useWebcam } from '../../hooks/useWebcam';
import WebcamFeed from '../recognition/WebcamFeed';

const DATASET_CAPTURE_COUNT = 50;
const CAPTURE_DELAY_MS = 100;
const MAX_CAPTURE_ATTEMPTS = 120;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function FaceEnrollmentModal({ student, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const { videoRef, canvasRef, isActive, error, startCamera, stopCamera, captureFrame } = useWebcam();

  const handleStartCamera = async () => {
    await startCamera();
  };

  const handleCapture = async () => {
    try {
      setLoading(true);
      setCaptureProgress(0);

      const capturedFrames = [];
      // Give camera stream a short warm-up so frame dimensions stabilize.
      await sleep(350);

      let attempts = 0;
      while (capturedFrames.length < DATASET_CAPTURE_COUNT && attempts < MAX_CAPTURE_ATTEMPTS) {
        attempts += 1;
        const frame = captureFrame();
        if (frame) {
          capturedFrames.push(frame);
          setCaptureProgress(capturedFrames.length);
        }
        await sleep(CAPTURE_DELAY_MS);
      }

      if (capturedFrames.length === 0) {
        toast.error('Failed to capture dataset frames. Please ensure camera is active and face is visible.');
        return;
      }

      if (capturedFrames.length < DATASET_CAPTURE_COUNT) {
        toast('Warning: captured fewer frames than expected. Continuing with available frames.');
      }

      const photoB64 = capturedFrames[Math.floor(capturedFrames.length / 2)] || captureFrame();
      if (!photoB64) {
        toast.error('Failed to capture frame');
        return;
      }

      const response = await api.post('/admin/students/enroll', {
        user_id: student.user_id || student._id,
        photo: photoB64,
        dataset_photos: capturedFrames,
      });

      const datasetSaved = Number(response.data?.dataset_saved_count || 0);
      const warning = response.data?.dataset_warning;
      if (warning) {
        toast.error(warning);
      } else {
        toast.success(`${response.data.message || 'Face enrolled successfully'} (dataset saved: ${datasetSaved})`);
      }
      stopCamera();
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to enroll face');
    } finally {
      setLoading(false);
      setCaptureProgress(0);
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
          Keep your face clear and slowly move your head in a U-shape or circle while capturing for better side-profile coverage.
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
                {loading ? `Capturing ${captureProgress}/${DATASET_CAPTURE_COUNT}...` : 'Capture 50 & Enroll'}
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
        {loading && (
          <p style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Capturing dataset frames. Please keep moving your head slowly for different angles.
          </p>
        )}
      </div>
    </div>
  );
}
