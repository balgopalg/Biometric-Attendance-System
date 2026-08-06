import { useState, useRef } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { HiOutlineCamera, HiOutlineX, HiOutlinePhotograph } from 'react-icons/hi';
import { useWebcam } from '../../hooks/useWebcam';
import WebcamFeed from '../recognition/WebcamFeed';
import { useTheme } from '../../context/ThemeContext';
import './FaceEnrollmentModal.css';

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

export default function FaceEnrollmentModal({ student, onClose, onSuccess }) {
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
    // Reset file input so same file can be selected again
    event.target.value = '';
  };

  const handleUploadPhoto = async () => {
    if (!uploadedPhoto) {
      toast.error('No photo selected');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);

      const response = await api.post('/admin/students/enroll', {
        user_id: student.user_id || student._id,
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
      const response = await api.post('/admin/students/enroll', {
        user_id: student.user_id || student._id,
        ...pendingData,
        force: true
      });
      toast.success(response.data.message || 'Face enrolled successfully');
      stopCamera();
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
        user_id: student.user_id || student._id,
        photo: photoB64,
        dataset_photos: capturedFrames,
      };
      setPendingData(data);

      const response = await api.post('/admin/students/enroll', data, {
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
    <div className="face-enrollment-backdrop" style={{
      position: 'fixed', inset: 0,
      background: isLight ? 'rgba(11,17,34,0.06)' : 'rgba(0, 0, 0, 0.65)',
      backdropFilter: isLight ? 'blur(3px)' : 'blur(4px)',
      WebkitBackdropFilter: isLight ? 'blur(3px)' : 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '16px', animation: 'fadeIn 300ms ease-out'
    }}>
      <div className="face-enrollment-modal" style={{
        background: isLight ? '#ffffff' : 'var(--bg-secondary)',
        borderRadius: 'var(--radius)',
        border: isLight ? '1px solid rgba(2,6,23,0.08)' : '1px solid var(--border)',
        width: '100%', maxWidth: '560px',
        maxHeight: '95vh', overflowY: 'auto',
        boxShadow: isLight ? '0 8px 24px rgba(2,6,23,0.08)' : '0 25px 50px -12px rgba(0,0,0,0.5)',
        position: 'relative', display: 'flex', flexDirection: 'column',
        animation: 'slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <div style={{ padding: '24px' }}>
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
            {useFileUpload
              ? 'Upload a clear face photo if your camera is unavailable.'
              : 'Keep your face clear and slowly move your head in a U-shape or circle while capturing for better side-profile coverage.'}
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
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{ 
                      borderRadius: 'var(--radius-md)', 
                      overflow: 'hidden', 
                      background: 'var(--bg-glass)', 
                      border: '1px solid var(--border-glass)',
                      maxHeight: '320px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      cursor: 'pointer'
                    }}
                  >
                    <img src={uploadedPhoto} alt="Selected" style={{ maxWidth: '100%', maxHeight: '320px', width: 'auto', height: 'auto', display: 'block', objectFit: 'contain' }} />
                    <button 
                      onClick={(e) => { e.stopPropagation(); setUploadedPhoto(null); }}
                      style={{
                        position: 'absolute', top: 12, right: 12,
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.5)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: 'none', cursor: 'pointer', zIndex: 10
                      }}
                    >
                      <HiOutlineX size={18} />
                    </button>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>Photo loaded. Click on image to change.</p>
                </div>
              ) : (
                <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ width: '100%', marginBottom: 16, justifyContent: 'center' }}>
                  <HiOutlinePhotograph size={16} /> Click to Select Photo
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '24px' }}>
                <WebcamFeed
                  ref={videoRef}
                  isActive={isActive}
                  error={error}
                  onFlipCamera={flipCamera}
                />
              </div>

              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {!isActive ? (
                <button
                  onClick={handleStartCamera}
                  style={{
                    width: '100%',
                    padding: '14px 16px', color: '#fff',
                    background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
                    border: 'none', borderRadius: 'var(--radius)',
                    fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    boxShadow: '0 4px 14px 0 rgba(37, 99, 235, 0.4)',
                    marginBottom: '16px'
                  }}
                >
                  <HiOutlineCamera size={18} />
                  Start Camera
                </button>
              ) : (
                <button
                  onClick={() => stopCamera()}
                  style={{
                    width: '100%',
                    padding: '14px 16px', background: 'transparent', color: 'var(--accent-rose)',
                    border: '1px solid var(--accent-rose)', borderRadius: 'var(--radius)',
                    fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '16px'
                  }}
                >
                  Stop Camera
                </button>
              )}
              {loading && (
                <div style={{ marginBottom: 16, marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>Capturing frames — move your head slowly</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{captureProgress}/{DATASET_CAPTURE_COUNT}</p>
                  </div>
                  <div style={{ width: '100%', height: 8, borderRadius: 999, background: 'var(--bg-glass)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #06b6d4, #3b82f6)', width: `${(captureProgress / DATASET_CAPTURE_COUNT) * 100}%`, transition: 'width 150ms ease' }} />
                  </div>
                </div>
              )}
            </>
          )}

          {isUploading && (
            <div className="face-enrollment-uploading-backdrop" style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10010,
              padding: 16,
              background: isLight ? 'rgba(11,17,34,0.08)' : 'rgba(2, 6, 23, 0.62)',
              backdropFilter: isLight ? 'blur(8px)' : 'blur(12px)',
              WebkitBackdropFilter: isLight ? 'blur(8px)' : 'blur(12px)',
              animation: 'fadeIn 300ms ease-out'
            }}>
              <div className="face-enrollment-uploading-modal" style={{
                position: 'relative',
                width: 'min(100%, 460px)',
                padding: '28px 26px',
                borderRadius: '24px',
                border: isLight ? '1px solid rgba(2,6,23,0.08)' : '1px solid rgba(148, 163, 184, 0.22)',
                background: isLight 
                  ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.96) 100%)'
                  : 'linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(2, 6, 23, 0.96) 100%)',
                boxShadow: isLight ? '0 8px 24px rgba(2,6,23,0.1)' : '0 30px 80px rgba(0, 0, 0, 0.45)',
                color: isLight ? '#0b1220' : '#fff',
                overflow: 'hidden',
                animation: 'slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1)'
              }}>
                <div style={{
                  position: 'absolute',
                  inset: '-40% auto auto -10%',
                  width: 220,
                  height: 220,
                  borderRadius: '50%',
                  background: isLight 
                    ? 'radial-gradient(circle, rgba(2, 132, 199, 0.12) 0%, rgba(2, 132, 199, 0) 72%)'
                    : 'radial-gradient(circle, rgba(6, 182, 212, 0.22) 0%, rgba(6, 182, 212, 0) 72%)',
                  pointerEvents: 'none',
                }} />
                <div style={{
                  position: 'absolute',
                  inset: 'auto -15% -35% auto',
                  width: 260,
                  height: 260,
                  borderRadius: '50%',
                  background: isLight 
                    ? 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0) 70%)'
                    : 'radial-gradient(circle, rgba(59, 130, 246, 0.18) 0%, rgba(59, 130, 246, 0) 70%)',
                  pointerEvents: 'none',
                }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1, marginBottom: 18 }}>
                  <div style={{
                    width: 46,
                    height: 46,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isLight 
                      ? 'linear-gradient(135deg, rgba(2, 132, 199, 0.12), rgba(59, 130, 246, 0.1))'
                      : 'linear-gradient(135deg, rgba(6, 182, 212, 0.18), rgba(59, 130, 246, 0.18))',
                    border: isLight 
                      ? '1px solid rgba(2, 132, 199, 0.22)' 
                      : '1px solid rgba(125, 211, 252, 0.28)',
                    boxShadow: isLight 
                      ? '0 0 0 6px rgba(2, 132, 199, 0.04)'
                      : '0 0 0 6px rgba(6, 182, 212, 0.06)',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: isLight 
                        ? '2px solid rgba(2,6,23,0.1)' 
                        : '2px solid rgba(255,255,255,0.2)',
                      borderTopColor: isLight ? '#0284c7' : '#67e8f9',
                      borderRightColor: isLight ? '#3b82f6' : '#60a5fa',
                      animation: 'spin 1.5s linear infinite'
                    }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 4, color: isLight ? '#0b1220' : '#fff' }}>Processing Enrollment</div>
                    <div style={{ fontSize: '0.9rem', color: isLight ? 'rgba(15,23,42,0.72)' : 'rgba(226, 232, 240, 0.78)', lineHeight: 1.5 }}>
                      Uploading dataset and preparing model. Please wait...
                    </div>
                  </div>
                </div>

                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: isLight ? '#0284c7' : 'rgba(103, 232, 249, 0.95)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      Upload progress
                    </span>
                    <span style={{ fontSize: '0.82rem', color: isLight ? 'rgba(15,23,42,0.72)' : 'rgba(226, 232, 240, 0.72)' }}>
                      {uploadProgress > 0 ? `${uploadProgress}%` : 'Preparing...'}
                    </span>
                  </div>

                  <div style={{
                    height: 12,
                    borderRadius: 999,
                    background: isLight ? 'rgba(2,6,23,0.08)' : 'rgba(255,255,255,0.08)',
                    border: isLight ? '1px solid rgba(2,6,23,0.12)' : '1px solid rgba(148, 163, 184, 0.18)',
                    overflow: 'hidden',
                    boxShadow: isLight ? 'inset 0 1px 2px rgba(0,0,0,0.04)' : 'inset 0 1px 2px rgba(0,0,0,0.28)',
                  }}>
                    <div style={{
                      width: `${uploadProgress}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: isLight 
                        ? 'linear-gradient(90deg, #0284c7 0%, #0ea5e9 45%, #3b82f6 100%)'
                        : 'linear-gradient(90deg, #22d3ee 0%, #38bdf8 45%, #3b82f6 100%)',
                      boxShadow: isLight 
                        ? '0 0 12px rgba(2, 132, 199, 0.35)'
                        : '0 0 18px rgba(56, 189, 248, 0.45)',
                      transition: 'width 180ms ease',
                      animation: uploadProgress > 0 ? 'progressGlow 2s ease-in-out infinite' : 'none'
                    }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 14, fontSize: '0.8rem', color: isLight ? 'rgba(15,23,42,0.68)' : 'rgba(226, 232, 240, 0.68)' }}>
                    <span>Capturing dataset frames and training in the background</span>
                    <span style={{ fontWeight: 700, color: isLight ? '#0284c7' : '#e0f2fe' }}>{Math.max(0, Math.min(100, uploadProgress))}%</span>
                  </div>
                </div>
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
                {loading ? 'Capturing...' : isUploading ? 'Uploading...' : 'Capture & Enroll'}
              </button>
            )}
          </div>

          {matchDetails && (
            <div className="face-enrollment-match-backdrop" style={{
              position: 'fixed', inset: 0, zIndex: 10030,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16,
              background: isLight ? 'rgba(11,17,34,0.08)' : 'rgba(2,6,23,0.45)',
              backdropFilter: isLight ? 'blur(4px)' : 'blur(6px)', 
              WebkitBackdropFilter: isLight ? 'blur(4px)' : 'blur(6px)',
              animation: 'fadeIn 300ms ease-out'
            }}>
              <div className="face-enrollment-match-modal" style={{
                width: 'min(100%, 640px)',
                borderRadius: 12,
                padding: '28px 28px',
                background: isLight ? '#ffffff' : 'var(--bg-secondary)',
                border: isLight ? '1px solid rgba(2,6,23,0.08)' : '1px solid var(--border-glass)',
                boxShadow: isLight ? '0 8px 24px rgba(2,6,23,0.08)' : '0 20px 50px rgba(2,6,23,0.48)',
                textAlign: 'center',
                color: isLight ? '#0b1220' : 'var(--text-primary)',
                animation: 'slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1)'
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%',
                  margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isLight ? 'rgba(250, 204, 21, 0.1)' : 'rgba(250, 204, 21, 0.12)', 
                  color: 'var(--accent-amber)',
                  animation: 'scaleIn 400ms cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                  <HiOutlinePhotograph size={32} />
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 10, color: isLight ? '#0b1220' : 'var(--text-primary)' }}>Similarity Match Detected</h3>
                <p style={{ fontSize: '0.95rem', color: isLight ? 'rgba(15,23,42,0.72)' : 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.5 }}>
                  This face matches <strong style={{ color: isLight ? '#071029' : 'var(--text-primary)' }}>{matchDetails.matching_user}</strong> with
                  <br /> <strong style={{ fontSize: '1.05rem', color: 'var(--accent-amber)', marginLeft: 6 }}>{(matchDetails.similarity * 100).toFixed(1)}%</strong> similarity.
                </p>
                <p style={{ fontSize: '0.92rem', color: isLight ? 'rgba(15,23,42,0.68)' : 'var(--text-secondary)', marginBottom: 20 }}>Do you want to approve this enrollment anyway?</p>

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
                      boxShadow: isLight ? '0 4px 12px rgba(250, 204, 21, 0.2)' : '0 8px 18px rgba(250, 204, 21, 0.16)',
                      transition: 'all 300ms ease'
                    }}
                    className="btn-primary"
                  >
                    {isUploading ? 'Processing...' : 'Approve & Enroll'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
