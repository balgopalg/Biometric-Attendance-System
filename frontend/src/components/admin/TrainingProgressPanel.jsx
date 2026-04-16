import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HiCheckCircle, HiClock, HiOutlineExclamationCircle, HiX } from 'react-icons/hi';

function getStatusMeta(status) {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        icon: HiCheckCircle,
        barColor: 'linear-gradient(90deg, var(--accent-emerald), #059669)',
        accent: 'var(--accent-emerald)',
      };
    case 'dead_letter':
    case 'failed':
      return {
        label: 'Failed',
        icon: HiOutlineExclamationCircle,
        barColor: 'linear-gradient(90deg, var(--accent-rose), #e11d48)',
        accent: 'var(--accent-rose)',
      };
    case 'queued':
      return {
        label: 'Queued',
        icon: HiClock,
        barColor: 'linear-gradient(90deg, var(--accent-amber), #ea580c)',
        accent: 'var(--accent-amber)',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        icon: HiOutlineExclamationCircle,
        barColor: 'linear-gradient(90deg, var(--text-muted), var(--text-secondary))',
        accent: 'var(--text-secondary)',
      };
    case 'cancelling':
      return {
        label: 'Cancelling',
        icon: HiClock,
        barColor: 'linear-gradient(90deg, var(--accent-amber), #ea580c)',
        accent: 'var(--accent-amber)',
      };
    default:
      return {
        label: 'Training',
        icon: HiClock,
        barColor: 'linear-gradient(90deg, var(--accent-purple), #38bdf8)',
        accent: 'var(--accent-purple)',
      };
  }
}

export default function TrainingProgressPanel({ job, onCancel, cancelling = false }) {
  const status = String(job?.status || '').toLowerCase();
  const total = Number(job?.training_total_faces ?? job?.result?.requested_count ?? job?.result?.total_faces ?? 0);
  const trained = Number(job?.training_trained_faces ?? job?.result?.success_count ?? job?.result?.trained_faces ?? 0);
  const processed = Number(job?.training_processed_faces ?? trained ?? 0);
  const failed = Number(job?.training_failed_faces ?? job?.result?.failure_count ?? 0);
  const progress = Number(job?.training_progress_percent ?? (total > 0 ? (processed / total) * 100 : 0));
  const message = job?.training_message || job?.result?.message || 'Training faces in the background';
  const meta = getStatusMeta(status);
  const StatusIcon = meta.icon;
  const canCancel = status === 'queued' || status === 'running';

  // Local state for visibility
  const [visible, setVisible] = useState(true);
  const timeoutRef = useRef(null);

  // Auto-hide after 1 min if completed or failed
  useEffect(() => {
    if (status === 'completed' || status === 'failed') {
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => setVisible(false), 60000);
      }
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [status]);

  // Manual close handler
  const handleClose = () => {
    setVisible(false);
  };

  if (!job || !visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          width: 'min(92vw, 380px)',
          zIndex: 1200,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            borderRadius: 18,
            border: '1px solid var(--border-glass)',
            background: 'linear-gradient(180deg, var(--bg-card), var(--bg-secondary))',
            boxShadow: 'var(--shadow-card)',
            backdropFilter: 'blur(16px)',
            padding: 16,
            color: 'var(--text-primary)',
            position: 'relative',
          }}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 20,
              cursor: 'pointer',
              zIndex: 2,
              padding: 2,
              borderRadius: 4,
              transition: 'background 0.2s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-glass)')}
            onMouseOut={e => (e.currentTarget.style.background = 'none')}
          >
            <HiX />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                background: 'var(--bg-glass)',
                color: meta.accent,
                flexShrink: 0,
              }}
            >
              <StatusIcon size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.95rem' }}>Face training</strong>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: meta.accent,
                  }}
                >
                  {meta.label}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.35 }}>
                {message}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                fontSize: '0.8rem',
                marginBottom: 8,
                color: 'var(--text-secondary)',
              }}
            >
              <span>Faces trained: {trained} / {total || trained || 1}</span>
              <span>{Math.max(0, Math.min(100, Math.round(progress)))}%</span>
            </div>
            <div
              style={{
                width: '100%',
                height: 10,
                borderRadius: 999,
                overflow: 'hidden',
                background: 'var(--bg-glass)',
                border: '1px solid var(--border-glass)',
              }}
            >
              <motion.div
                initial={false}
                animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                transition={{ type: 'spring', stiffness: 180, damping: 24 }}
                style={{
                  height: '100%',
                  borderRadius: 999,
                  background: meta.barColor,
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>Processed {processed} / {total || processed || 1}</span>
            <span>Failed {failed}</span>
          </div>

          {canCancel && typeof onCancel === 'function' && (
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onCancel}
                disabled={cancelling}
                className="btn-secondary"
                style={{ padding: '7px 12px', fontSize: '0.75rem' }}
              >
                {cancelling ? 'Cancelling...' : 'Cancel Training'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
