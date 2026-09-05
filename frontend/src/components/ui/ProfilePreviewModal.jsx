import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiX, HiOutlineDownload } from 'react-icons/hi';
import { FaUser, FaFileAlt, FaCalendarAlt, FaGlobe, FaDesktop } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { toPng } from 'html-to-image';

export default function ProfilePreviewModal({
  isOpen,
  onClose,
  imageSrc,
  name = '',
  role = 'student',
  regNumber = null,
  department = null,
  course = null,
  session = null,
}) {
  const [downloading, setDownloading] = useState(false);
  const [qrSrc, setQrSrc] = useState('');
  const cardRef = useRef(null);

  const isStudent = role === 'student';
  const roleTitle = isStudent ? 'Student Identity Card' : 'Faculty Identity Card';

  const initials = name.trim()
    ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?';

  // Generate QR code
  useEffect(() => {
    if (!isOpen) return;
    const generateQr = async () => {
      try {
        const qrModule = await import('qrcode');
        const QRCode = qrModule.default || qrModule;
        const qrData = [
          `Name: ${name || 'N/A'}`,
          `Roll No: ${regNumber || 'N/A'}`,
          `Session: ${session || 'N/A'}`,
          `Programme: ${course || 'N/A'}`,
          `Dept: ${department || 'N/A'}`
        ].join('\n');
        
        const url = await QRCode.toDataURL(qrData, { margin: 1, width: 70, color: { dark: '#000', light: '#fff' } });
        setQrSrc(url);
      } catch (err) {
        console.error('QR Code generation failed:', err);
      }
    };
    generateQr();
  }, [isOpen, name, regNumber, session, course, department]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleDownloadPng = async () => {
    if (downloading || !cardRef.current) return;
    setDownloading(true);
    const toastId = toast.loading('Generating ID card…');
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2, // 319x506 * 2 = 638x1012 (Exact CR80 Portrait @ 300dpi)
        backgroundColor: '#f8f9fa',
        style: {
          transform: 'none', // Ensure modal transforms don't distort output
        }
      });
      const link = document.createElement('a');
      const safeName = (name || role || 'id-card').toLowerCase().replace(/[^a-z0-9]/g, '_');
      link.download = `${safeName}_id_card.png`;
      link.href = dataUrl;
      link.click();
      toast.success('ID card downloaded!', { id: toastId });
    } catch (err) {
      console.error('ID card generation failed:', err);
      toast.error('Failed to generate card. Please try again.', { id: toastId });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(2, 6, 23, 0.72)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 390,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'center',
            }}
          >
            {/* Action Bar */}
            <div style={{
              width: '100%', maxWidth: 319, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <button
                type="button"
                onClick={handleDownloadPng}
                disabled={downloading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8,
                  background: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600,
                  cursor: downloading ? 'not-allowed' : 'pointer',
                  opacity: downloading ? 0.7 : 1,
                  boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
                }}
              >
                <HiOutlineDownload size={15} color="#38bdf8" />
                <span>{downloading ? 'Exporting...' : 'Download PNG'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                title="Close"
                style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  color: '#cbd5e1', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
                }}
              >
                <HiX size={18} />
              </button>
            </div>

            {/* Template ID Card - CR80 Vertical */}
            <div
              ref={cardRef}
              style={{
                width: 319,
                height: 506,
                backgroundColor: '#f8f9fa',
                borderRadius: 18,
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.15)',
                overflow: 'hidden',
                position: 'relative',
                fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                color: '#111',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Header */}
              <div style={{
                backgroundColor: '#1a3a6c',
                color: 'white',
                textAlign: 'center',
                padding: '20px 15px 15px',
                borderBottom: '4px solid #c5a977',
                position: 'relative'
              }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: 0.5, color: '#ffffff' }}>Utkal University</h1>
                <p style={{ margin: '5px 0 0', fontSize: 10, color: '#d1d5db' }}>Vani Vihar, Bhubaneswar, Odisha, 751994</p>
              </div>

              {/* Title */}
              <div style={{
                textAlign: 'center',
                fontSize: 18,
                fontWeight: 700,
                color: '#212529',
                margin: '15px 0 10px'
              }}>
                {roleTitle}
              </div>

              {/* Media Section */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                padding: '0 25px',
                marginBottom: 5
              }}>
                <div style={{
                  border: '2px solid #c5a977',
                  padding: 3,
                  background: 'white',
                  borderRadius: 2
                }}>
                  {imageSrc ? (
                    <img 
                      src={imageSrc} 
                      alt="Photo" 
                      crossOrigin="anonymous"
                      style={{ width: 95, height: 125, objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ 
                      width: 95, height: 125, display: 'flex', alignItems: 'center', 
                      justifyContent: 'center', background: '#1a3a6c', color: 'white', 
                      fontSize: 32, fontWeight: 'bold' 
                    }}>
                      {initials}
                    </div>
                  )}
                </div>
                {qrSrc ? (
                  <img 
                    src={qrSrc} 
                    alt="QR Code" 
                    style={{ width: 75, height: 75, objectFit: 'contain', marginTop: 5 }}
                  />
                ) : (
                  <div style={{ width: 75, height: 75, marginTop: 5, background: '#eee' }} />
                )}
              </div>

              {/* Details Section */}
              <div style={{ 
                padding: '0 25px 25px', 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-evenly' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #dee2e6', paddingBottom: 6, fontSize: 13 }}>
                  <span style={{ width: 20, display: 'inline-block', color: '#88929c', fontSize: 12, textAlign: 'left' }}>
                    <FaUser />
                  </span>
                  <span style={{ color: '#495057', width: 80, flexShrink: 0 }}>Name :</span>
                  <span style={{ fontWeight: 700, color: '#111', flex: 1, wordBreak: 'break-word', lineHeight: 1.2 }}>{name || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #dee2e6', paddingBottom: 6, fontSize: 13 }}>
                  <span style={{ width: 20, display: 'inline-block', color: '#88929c', fontSize: 12, textAlign: 'left' }}>
                    <FaFileAlt />
                  </span>
                  <span style={{ color: '#495057', width: 80, flexShrink: 0 }}>Roll No. :</span>
                  <span style={{ fontWeight: 700, color: '#111', flex: 1, wordBreak: 'break-word', lineHeight: 1.2 }}>{regNumber || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #dee2e6', paddingBottom: 6, fontSize: 13 }}>
                  <span style={{ width: 20, display: 'inline-block', color: '#88929c', fontSize: 12, textAlign: 'left' }}>
                    <FaCalendarAlt />
                  </span>
                  <span style={{ color: '#495057', width: 80, flexShrink: 0 }}>Session :</span>
                  <span style={{ fontWeight: 700, color: '#111', flex: 1, wordBreak: 'break-word', lineHeight: 1.2 }}>{session || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #dee2e6', paddingBottom: 6, fontSize: 13 }}>
                  <span style={{ width: 20, display: 'inline-block', color: '#88929c', fontSize: 12, textAlign: 'left' }}>
                    <FaGlobe />
                  </span>
                  <span style={{ color: '#495057', width: 80, flexShrink: 0 }}>Programme :</span>
                  <span style={{ fontWeight: 700, color: '#111', flex: 1, wordBreak: 'break-word', lineHeight: 1.2 }}>{course || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
                  <span style={{ width: 20, display: 'inline-block', color: '#88929c', fontSize: 12, textAlign: 'left' }}>
                    <FaDesktop />
                  </span>
                  <span style={{ color: '#495057', width: 80, flexShrink: 0 }}>Dept :</span>
                  <span style={{ fontWeight: 700, color: '#111', flex: 1, wordBreak: 'break-word', lineHeight: 1.2 }}>{department || 'N/A'}</span>
                </div>
              </div>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
