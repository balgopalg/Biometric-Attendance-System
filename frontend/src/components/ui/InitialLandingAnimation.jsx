import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const STORAGE_KEY = 'faceattend-landing-seen';

export default function InitialLandingAnimation({ children }) {
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    const seen = sessionStorage.getItem(STORAGE_KEY) === '1';
    if (seen) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const durationMs = prefersReducedMotion ? 500 : 1700;

    setShowSplash(true);
    const timer = setTimeout(() => {
      setShowSplash(false);
      sessionStorage.setItem(STORAGE_KEY, '1');
    }, durationMs);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {children}

      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeOut' } }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'radial-gradient(circle at 15% 18%, rgba(34,211,238,0.28), transparent 42%), radial-gradient(circle at 85% 80%, rgba(14,165,233,0.22), transparent 44%), linear-gradient(145deg, #050816 0%, #0b1226 45%, #0f1f3a 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <motion.div
              aria-hidden
              initial={{ opacity: 0.18 }}
              animate={{ opacity: [0.18, 0.28, 0.18] }}
              transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                inset: '-20%',
                backgroundImage:
                  'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
                backgroundSize: '46px 46px',
                transform: 'perspective(700px) rotateX(58deg)',
                transformOrigin: 'center top',
              }}
            />

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: 'easeOut' }}
              style={{
                textAlign: 'center',
                padding: '0 20px',
                position: 'relative',
                zIndex: 2,
              }}
            >
              <motion.div
                animate={{ scale: [1, 1.04, 1], y: [0, -3, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: 24,
                  margin: '0 auto 16px',
                  background: 'linear-gradient(155deg, rgba(34,211,238,0.18), rgba(14,165,233,0.22))',
                  border: '1px solid rgba(255,255,255,0.16)',
                  boxShadow: '0 18px 44px rgba(14,165,233,0.24), inset 0 1px 0 rgba(255,255,255,0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
                  <rect x="2" y="2" width="52" height="52" rx="14" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
                  <motion.rect
                    x="12"
                    y="12"
                    width="32"
                    height="32"
                    rx="8"
                    stroke="#7dd3fc"
                    strokeWidth="2"
                    fill="none"
                    animate={{ opacity: [0.55, 1, 0.55] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.circle
                    cx="28"
                    cy="25"
                    r="6"
                    stroke="#bae6fd"
                    strokeWidth="2"
                    fill="none"
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <path d="M18 38c2.7-3.9 6.6-5.7 10-5.7s7.3 1.8 10 5.7" stroke="#e0f2fe" strokeWidth="2" strokeLinecap="round" />
                  <motion.rect
                    x="10"
                    y="10"
                    width="36"
                    height="4"
                    rx="2"
                    fill="#22d3ee"
                    animate={{ y: [10, 42, 10], opacity: [0.2, 0.9, 0.2] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </svg>
              </motion.div>

              <h1
                style={{
                  fontSize: 'clamp(1.65rem, 4vw, 2.45rem)',
                  lineHeight: 1.15,
                  fontWeight: 800,
                  color: '#f8fafc',
                  letterSpacing: '-0.02em',
                }}
              >
                FaceAttend
              </h1>
              <p style={{ marginTop: 9, color: 'rgba(241,245,249,0.78)', fontSize: '0.9rem', letterSpacing: '0.02em' }}>
                Fast face recognition for smarter attendance
              </p>
            </motion.div>

            <motion.div
              aria-hidden
              animate={{ x: [0, 40, 0], y: [0, -20, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                top: '16%',
                left: '8%',
                width: 180,
                height: 180,
                borderRadius: '50%',
                background: 'rgba(34,211,238,0.2)',
                filter: 'blur(10px)',
              }}
            />
            <motion.div
              aria-hidden
              animate={{ x: [0, -30, 0], y: [0, 24, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                bottom: '14%',
                right: '10%',
                width: 200,
                height: 200,
                borderRadius: '50%',
                background: 'rgba(14,165,233,0.25)',
                filter: 'blur(12px)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
