import { motion, AnimatePresence } from 'framer-motion';
import { HiX } from 'react-icons/hi';

export default function Modal({ isOpen, onClose, title, children, width = 500 }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.4)', // Slightly softer backdrop
              backdropFilter: 'blur(3px)',
              zIndex: 100,
            }}
          />
          {/* Centering wrapper */}
          <div
            style={{
              position: 'fixed', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 101,
              pointerEvents: 'none',
              padding: '20px', // Prevent modal from hitting screen edges on small screens
            }}
          >
            {/* Panel */}
            <motion.div
              className="modal-panel-mobile"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              style={{
                width,
                maxWidth: '100%',
                maxHeight: 'calc(100vh - 40px)', // Sensible max-height based on viewport
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-primary)',
                border: '1px solid rgba(0, 0, 0, 0.08)', // Soft border
                borderRadius: '16px',
                padding: '24px',
                pointerEvents: 'auto',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.05), 0 4px 10px rgba(0, 0, 0, 0.03)', // Subtle, clean shadow
                overflow: 'hidden', // Ensures rounded corners and bounds
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
                <button
                  onClick={onClose}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'var(--bg-secondary)', border: '1px solid rgba(0,0,0,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: 'var(--text-secondary)',
                    transition: 'background 0.2s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                >
                  <HiX size={18} />
                </button>
              </div>
              
              {/* Content Wrapper */}
              <div style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                overflowY: 'auto', 
                minHeight: 0, 
                paddingRight: 4,
                marginRight: -4 // Compensate for padding to keep scrollbar at edge
              }}>
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
