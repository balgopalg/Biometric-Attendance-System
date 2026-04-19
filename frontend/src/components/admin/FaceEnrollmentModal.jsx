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
      position: 'fixed', inset: 0,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '16px'
    }}>
      <div className="glass-card" style={{
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        width: '100%', maxWidth: '560px',
        maxHeight: '95vh', overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        position: 'relative', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '24px' }}>
          {/* Close button */}
          <button
            onClick={handleClose}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '4px'
            }}
          >
            <HiOutlineX size={22} />
          </button>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px', paddingRight: '24px' }}>
            Enroll Face for {student?.name}
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
            Keep your face clear and slowly move your head in a U-shape or circle while capturing for better side-profile coverage.
          </p>

          {/* Webcam Feed */}
          <div style={{ marginBottom: '24px' }}>
            <WebcamFeed 
              ref={videoRef} 
              isActive={isActive} 
              error={error}
            />
          </div>

          {/* Hidden canvas for frame capture */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Controls */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px'
          }}>
            {!isActive ? (
              <button
                onClick={handleStartCamera}
                style={{
                  padding: '14px 16px', color: '#fff',
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
                  border: 'none', borderRadius: 'var(--radius)',
                  fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: '0 4px 14px 0 rgba(37, 99, 235, 0.4)'
                }}
              >
                <HiOutlineCamera size={18} />
                Start Camera
              </button>
            ) : (
              <>
                <button
                  onClick={handleCapture}
                  disabled={loading}
                  style={{
                    padding: '14px 16px',
                    background: loading ? 'var(--text-muted)' : 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                    color: '#fff', border: 'none', borderRadius: 'var(--radius)',
                    fontSize: '0.95rem', fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    opacity: loading ? 0.7 : 1,
                    boxShadow: loading ? 'none' : '0 4px 14px 0 rgba(59, 130, 246, 0.4)'
                  }}
                >
                  <HiOutlineCamera size={18} />
                  {loading ? `Capturing ${captureProgress}...` : 'Capture & Enroll'}
                </button>
                <button
                  onClick={() => stopCamera()}
                  style={{
                    padding: '14px 16px', background: 'transparent', color: 'var(--accent-rose)',
                    border: '1px solid var(--accent-rose)', borderRadius: 'var(--radius)',
                    fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  Stop
                </button>
              </>
            )}
          </div>
          {loading && (
            <p style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--accent-cyan)', textAlign: 'center', fontWeight: 600, letterSpacing: '0.5px' }}>
              Recording... Please keep moving your head slowly.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
