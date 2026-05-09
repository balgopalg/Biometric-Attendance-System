import { useState, useRef } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { HiOutlineCamera, HiOutlineX, HiOutlineIdentification, HiOutlinePhotograph } from 'react-icons/hi';
import { useWebcam } from '../../hooks/useWebcam';
import WebcamFeed from '../recognition/WebcamFeed';

const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function LecturerFaceSearchModal({ isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [matchedLecturer, setMatchedLecturer] = useState(null);
  const [searchFrame, setSearchFrame] = useState(null);
  const [useFileUpload, setUseFileUpload] = useState(false);
  const [uploadedPhoto, setUploadedPhoto] = useState(null);
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
    event.target.value = '';
  };

  const handleFindFace = async () => {
    let frame;
    if (useFileUpload) {
      if (!uploadedPhoto) {
        toast.error('Please upload a photo first.');
        return;
      }
      frame = uploadedPhoto;
    } else {
      frame = captureFrame();
      if (!frame) {
        toast.error('Failed to capture frame. Ensure camera is active.');
        return;
      }
    }

    try {
      setLoading(true);
      const res = await api.post('/recognition/find-lecturer', { frame });
      setSearchFrame(frame);
      setMatchedLecturer(res.data.lecturer);
      toast.success('Lecturer identified!');
      if (!useFileUpload) stopCamera();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Lecturer not identified');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    setMatchedLecturer(null);
    setSearchFrame(null);
    setUploadedPhoto(null);
    onClose();
  };

  if (!isOpen) return null;

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
            Find Lecturer by Face
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
            {useFileUpload 
              ? 'Upload a clear face photo to identify the lecturer.'
              : "Scan a lecturer's face to identify them and view their details."}
          </p>

          {!matchedLecturer ? (
            <>
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

                  <button
                    className="btn-primary"
                    onClick={handleFindFace}
                    disabled={loading || !uploadedPhoto}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {loading ? 'Identifying...' : 'Identify Lecturer'}
                  </button>
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
                    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                      <button
                        className="btn-secondary"
                        onClick={() => stopCamera()}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        Stop Camera
                      </button>
                      <button
                        className="btn-primary"
                        onClick={handleFindFace}
                        disabled={loading}
                        style={{ flex: 2, justifyContent: 'center' }}
                      >
                        {loading ? 'Identifying...' : 'Identify Lecturer'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'left', animation: 'fadeIn 0.3s ease-out' }}>
              <div className="results-container" style={{ 
                background: 'var(--bg-glass)', 
                padding: 20, 
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-glass)',
                marginBottom: 20
              }}>
                <div className="photos-row" style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 100px', minWidth: 100 }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Scan Preview</span>
                    <div style={{ 
                      width: '100%', 
                      aspectRatio: '1/1',
                      borderRadius: 'var(--radius-sm)', 
                      overflow: 'hidden', 
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)'
                    }}>
                      <img src={searchFrame} alt="Scan preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  </div>

                  <div style={{ flex: '1 1 100px', minWidth: 100 }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Profile Photo</span>
                    <div style={{ 
                      width: '100%', 
                      aspectRatio: '1/1',
                      borderRadius: 'var(--radius-sm)', 
                      overflow: 'hidden', 
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)'
                    }}>
                      {matchedLecturer.photo_url ? (
                        <img 
                          src={`${api.defaults.baseURL}${matchedLecturer.photo_url}`} 
                          alt={matchedLecturer.name} 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                          <HiOutlineIdentification size={32} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="details-col" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{matchedLecturer.name}</h3>
                  <div className="info-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, auto) 1fr', gap: '4px 12px', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Email:</span>
                    <span style={{ fontWeight: 600 }}>{matchedLecturer.email}</span>
                    
                    <span style={{ color: 'var(--text-muted)' }}>Dept:</span>
                    <span style={{ fontWeight: 600 }}>{matchedLecturer.department}</span>
                  </div>
                  <div style={{ 
                    fontSize: '0.8rem', 
                    color: 'var(--accent-emerald)', 
                    marginTop: 12,
                    padding: '4px 8px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    borderRadius: 4,
                    display: 'inline-block',
                    width: 'fit-content'
                  }}>
                    Match Confidence: {(matchedLecturer.similarity * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              
              <button 
                className="btn-primary" 
                onClick={() => {
                  setMatchedLecturer(null);
                  setSearchFrame(null);
                  if (!useFileUpload) handleStartCamera();
                }} 
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Scan Another
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
            <button className="btn-secondary" onClick={handleClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
