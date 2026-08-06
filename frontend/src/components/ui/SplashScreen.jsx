import { motion } from 'framer-motion';

export default function SplashScreen() {
  const isLightTheme = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: isLightTheme ? 'rgba(240, 242, 245, 0.98)' : 'rgba(10, 14, 26, 0.98)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Glow behind */}
        <motion.div
          animate={{
            scale: [1, 1.25, 1],
            opacity: [0.15, 0.35, 0.15],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'var(--gradient-cool)',
            filter: 'blur(70px)',
            zIndex: 0
          }}
        />

        {/* Scanner Ring 1 */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute',
            width: 150,
            height: 150,
            borderRadius: '50%',
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: isLightTheme ? 'rgba(15, 23, 42, 0.2)' : 'rgba(255,255,255,0.1)',
            borderTopColor: 'var(--accent-cyan)',
            borderBottomColor: 'var(--accent-indigo)',
            zIndex: 1
          }}
        />

        {/* Scanner Ring 2 */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          style={{
            position: 'absolute',
            width: 120,
            height: 120,
            borderRadius: '50%',
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: 'transparent',
            borderRightColor: 'var(--accent-emerald)',
            borderLeftColor: isLightTheme ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255,255,255,0.05)',
            zIndex: 1
          }}
        />

        {/* Center Icon (Face / Biometric) */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}
          style={{
            zIndex: 2,
            width: 86,
            height: 86,
            borderRadius: '24px',
            background: isLightTheme ? 'rgba(255, 255, 255, 0.78)' : 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: isLightTheme ? '1px solid rgba(15, 23, 42, 0.12)' : '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isLightTheme
              ? '0 20px 40px -14px rgba(8, 145, 178, 0.28), inset 0 0 20px rgba(8, 145, 178, 0.14)'
              : '0 25px 50px -12px rgba(0,0,0,0.5), inset 0 0 20px rgba(6, 182, 212, 0.2)',
          }}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="url(#faceGradient)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <defs>
              <linearGradient id="faceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" />      {/* Cyan */}
                <stop offset="50%" stopColor="#3b82f6" />     {/* Blue */}
                <stop offset="100%" stopColor={isLightTheme ? '#7c3aed' : '#8b5cf6'} />    {/* Violet */}
              </linearGradient>
            </defs>
            <motion.path 
              d="M7 4.5h2.2M4.5 7v2.2M16.8 4.5H19M19.5 7v2.2M4.5 16.8V19H7M17 19h2.2v-2.2" 
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.5, ease: "easeInOut", delay: 0.3 }}
            />
            <motion.circle 
              cx="12" cy="9" r="2.6"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "backOut", delay: 1.0 }}
            />
            <motion.path
              d="M7.6 16.8C8.6 14.7 10.1 13.7 12 13.7C13.9 13.7 15.4 14.7 16.4 16.8"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.9, ease: 'easeInOut', delay: 1.15 }}
            />
          </svg>
        </motion.div>
      </div>

    </motion.div>
  );
}
