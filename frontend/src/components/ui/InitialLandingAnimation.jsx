import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const STORAGE_KEY = 'bioattend-landing-seen';

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
              background: 'radial-gradient(circle at 20% 20%, rgba(6,182,212,0.24), transparent 45%), radial-gradient(circle at 80% 80%, rgba(139,92,246,0.3), transparent 50%), linear-gradient(140deg, #0a0e1a, #111827)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
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
                animate={{ scale: [1, 1.08, 1], rotate: [0, 3, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 20,
                  margin: '0 auto 14px',
                  background: 'var(--gradient-primary)',
                  boxShadow: '0 14px 36px rgba(6,182,212,0.22)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 24,
                  letterSpacing: '0.02em',
                }}
              >
                B
              </motion.div>

              <h1
                style={{
                  fontSize: 'clamp(1.55rem, 4vw, 2.35rem)',
                  lineHeight: 1.15,
                  fontWeight: 800,
                  color: '#f8fafc',
                  letterSpacing: '-0.02em',
                }}
              >
                BioAttend
              </h1>
              <p style={{ marginTop: 8, color: 'rgba(241,245,249,0.75)', fontSize: '0.9rem' }}>
                Smart attendance, ready to launch
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
                width: 160,
                height: 160,
                borderRadius: '50%',
                background: 'rgba(6,182,212,0.18)',
                filter: 'blur(8px)',
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
                background: 'rgba(139,92,246,0.22)',
                filter: 'blur(10px)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
