import { useState, useRef } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { HiOutlineCamera, HiOutlineX, HiOutlinePhotograph } from 'react-icons/hi';
import { useWebcam } from '../../hooks/useWebcam';
import { useTheme } from '../../context/ThemeContext';
import WebcamFeed from '../recognition/WebcamFeed';

const DATASET_CAPTURE_COUNT = 50;
const CAPTURE_DELAY_MS = 100;
const MAX_CAPTURE_ATTEMPTS = 120;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function LecturerFaceEnrollmentModal({ lecturer, onClose, onSuccess }) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [loading, setLoading] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
  const [useFileUpload, setUseFileUpload] = useState(false);
  const [matchDetails, setMatchDetails] = useState(null);
  const [pendingData, setPendingData] = useState(null);
  const fileInputRef = useRef(null);
  const { videoRef, canvasRef, isActive, error, startCamera, stopCamera, flipCamera, captureFrame } = useWebcam({ cropSquare: true, outSize: 160 });

  const handleStartCamera = async () => {
    const started = await startCamera();
    if (!started) {
      setUseFileUpload(true);
      toast.error('Camera unavailable. Use photo upload instead.');
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    try {
      const photoB64 = await readFileAsBase64(file);
      setUploadedPhoto(photoB64);
      toast.success('Photo loaded');
    } catch {
      toast.error('Failed to read file');
    }
  };

  const handleUploadPhoto = async () => {
    if (!uploadedPhoto) {
      toast.error('No photo selected');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);

      const response = await api.post('/admin/lecturers/enroll', {
        user_id: lecturer.user_id || lecturer._id,
        photo: uploadedPhoto,
      }, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.lengthComputable) {
            const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            setUploadProgress(pct);
          }
        },
      });

      const datasetSaved = Number(response.data?.dataset_saved_count || 0);
      const warning = response.data?.dataset_warning;
      if (warning) {
        toast.error(warning);
      } else {
        toast.success(`${response.data.message || 'Face enrolled successfully'} (dataset saved: ${datasetSaved})`);
      }
      onSuccess();
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.match_found) {
        setMatchDetails(err.response.data);
        setPendingData({ photo: uploadedPhoto });
      } else {
        toast.error(err.response?.data?.error || 'Failed to enroll face');
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadedPhoto(null);
    }
  };

  const handleConfirmEnroll = async () => {
    try {
      setIsUploading(true);
      const response = await api.post('/admin/lecturers/enroll', {
        user_id: lecturer.user_id || lecturer._id,
        ...pendingData,
        force: true
      });
      toast.success(response.data.message || 'Face enrolled successfully');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to enroll face');
    } finally {
      setIsUploading(false);
      setMatchDetails(null);
      setPendingData(null);
    }
  };

  const handleCapture = async () => {
    try {
      setLoading(true);
      setCaptureProgress(0);

      const capturedFrames = [];
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

      setIsUploading(true);
      setUploadProgress(0);
      const data = {
        user_id: lecturer.user_id || lecturer._id,
        photo: photoB64,
        dataset_photos: capturedFrames,
      };
      setPendingData(data);

      const response = await api.post('/admin/lecturers/enroll', data, {
        onUploadProgress: (progressEvent) => {
          try {
            if (progressEvent.lengthComputable) {
              const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100);
              setUploadProgress(pct);
            }
          } catch (e) {
            // ignore progress errors
          }
        }
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
      if (err.response?.status === 409 && err.response.data?.match_found) {
        setMatchDetails(err.response.data);
      } else {
        toast.error(err.response?.data?.error || 'Failed to enroll face');
      }
    } finally {
      setLoading(false);
      setIsUploading(false);
      setUploadProgress(0);
      setCaptureProgress(0);
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div style={{ 
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', 
      zIndex: 60, 
      background: isLight ? 'rgba(11,17,34,0.06)' : 'rgba(0,0,0,0.65)',
      backdropFilter: isLight ? 'blur(3px)' : 'blur(4px)',
      WebkitBackdropFilter: isLight ? 'blur(3px)' : 'blur(4px)',
      padding: 16
    }}>
      <div style={{ 
        background: 'var(--bg-secondary)', 
        borderRadius: 'var(--radius-lg)', 
        border: '1px solid var(--border-glass)', 
        padding: 24, maxWidth: 540, width: '90%', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: isLight ? '0 8px 24px rgba(2,6,23,0.08)' : '0 20px 50px rgba(2,6,23,0.48)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Enroll Face for {lecturer?.name}</h2>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.2rem' }}>
            <HiOutlineX />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          {useFileUpload ? 'Upload a clear face photo if your camera is unavailable.' : 'Capture 50 frames of the lecturer\'s face. Move your head slightly in different angles for better recognition.'}
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            className={useFileUpload ? 'btn-secondary' : 'btn-primary'}
            onClick={() => {
              setUseFileUpload(false);
              setUploadedPhoto(null);
            }}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <HiOutlineCamera size={16} /> Use Camera
          </button>
          <button
            className={useFileUpload ? 'btn-primary' : 'btn-secondary'}
            onClick={() => {
              setUseFileUpload(true);
              stopCamera();
            }}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <HiOutlinePhotograph size={16} /> Upload Photo
          </button>
        </div>

        {useFileUpload ? (
          <div style={{ marginBottom: 16 }}>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
            {uploadedPhoto ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ 
                  borderRadius: 'var(--radius-md)', 
                  overflow: 'hidden', 
                  background: 'var(--bg-glass)', 
                  border: '1px solid var(--border-glass)',
                  maxHeight: '320px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <img src={uploadedPhoto} alt="Selected" style={{ maxWidth: '100%', maxHeight: '320px', width: 'auto', height: 'auto', display: 'block', objectFit: 'contain' }} />
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>Photo loaded</p>
              </div>
            ) : (
              <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ width: '100%', marginBottom: 16, justifyContent: 'center' }}>
                <HiOutlinePhotograph size={16} /> Click to Select Photo
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <WebcamFeed ref={videoRef} isActive={isActive} error={error} onFlipCamera={flipCamera} />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>

            {!isActive ? (
              <button className="btn-primary" onClick={handleStartCamera} style={{ width: '100%', marginBottom: 16, justifyContent: 'center' }}>
                <HiOutlineCamera size={16} /> Start Camera
              </button>
            ) : (
              <button
                onClick={() => stopCamera()}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px 16px', background: 'transparent', color: 'var(--accent-rose)',
                  border: '1px solid var(--accent-rose)', borderRadius: 'var(--radius)',
                  fontSize: '0.9rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '16px', opacity: loading ? 0.5 : 1,
                }}
              >
                Stop Camera
              </button>
            )}

            {loading && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600 }}>Capturing frames</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{captureProgress}/{DATASET_CAPTURE_COUNT}</p>
                </div>
                <div style={{ width: '100%', height: 6, borderRadius: 999, background: 'var(--bg-glass)' }}>
                  <div style={{ height: '100%', borderRadius: 999, background: 'var(--accent-cyan)', width: `${(captureProgress / DATASET_CAPTURE_COUNT) * 100}%`, transition: 'width 150ms ease' }} />
                </div>
              </div>
            )}
          </>
        )}

        {isUploading && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600 }}>Uploading</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{uploadProgress}%</p>
            </div>
            <div style={{ width: '100%', height: 6, borderRadius: 999, background: 'var(--bg-glass)' }}>
              <div style={{ height: '100%', borderRadius: 999, background: 'var(--accent-emerald)', width: `${uploadProgress}%`, transition: 'width 150ms ease' }} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={handleClose} disabled={loading || isUploading}>
            Cancel
          </button>
          {useFileUpload ? (
            <button className="btn-primary" onClick={handleUploadPhoto} disabled={!uploadedPhoto || isUploading}>
              {isUploading ? 'Uploading...' : 'Upload & Enroll'}
            </button>
          ) : (
            <button className="btn-primary" onClick={handleCapture} disabled={!isActive || loading || isUploading}>
              {loading ? 'Capturing...' : isUploading ? 'Uploading...' : 'Capture & Upload'}
            </button>
          )}
        </div>

        {matchDetails && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 10030,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
            background: isLight ? 'rgba(11,17,34,0.06)' : 'rgba(2,6,23,0.45)',
            backdropFilter: isLight ? 'blur(4px)' : 'blur(6px)', WebkitBackdropFilter: isLight ? 'blur(4px)' : 'blur(6px)'
          }}>
            <div style={{
              width: 'min(100%, 640px)',
              borderRadius: 12,
              padding: '28px 28px',
              background: isLight ? '#ffffff' : 'var(--bg-secondary)',
              border: isLight ? '1px solid rgba(2,6,23,0.06)' : '1px solid var(--border-glass)',
              boxShadow: isLight ? '0 8px 24px rgba(2,6,23,0.08)' : '0 20px 50px rgba(2,6,23,0.48)',
              textAlign: 'center',
              color: isLight ? '#0b1220' : 'var(--text-primary)'
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(250, 204, 21, 0.12)', color: 'var(--accent-amber)'
              }}>
                <HiOutlinePhotograph size={32} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 10 }}>Similarity Match Detected</h3>
              <p style={{ fontSize: '0.95rem', color: isLight ? 'rgba(15,23,42,0.72)' : 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.5 }}>
                This face matches <strong style={{ color: isLight ? '#071029' : 'var(--text-primary)' }}>{matchDetails.matching_user}</strong> with
                <br /> <strong style={{ fontSize: '1.05rem', color: 'var(--accent-amber)', marginLeft: 6 }}>{(matchDetails.similarity * 100).toFixed(1)}%</strong> similarity.
              </p>
              <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', marginBottom: 20 }}>Do you want to approve this enrollment anyway?</p>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  className="btn-secondary"
                  style={{ minWidth: 160, justifyContent: 'center', color: isLight ? '#0b1220' : undefined }}
                  onClick={handleClose}
                >
                  Reject & Exit
                </button>
                <button
                  onClick={handleConfirmEnroll}
                  disabled={isUploading}
                  style={{
                    minWidth: 160,
                    justifyContent: 'center',
                    background: 'var(--accent-amber)',
                    border: 'none',
                    color: isLight ? '#ffffff' : 'var(--btn-approve-text, #08122a)',
                    boxShadow: '0 8px 18px rgba(250, 204, 21, 0.16)'
                  }}
                  className="btn-primary"
                >
                  {isUploading ? 'Confirming...' : 'Approve & Enroll'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
