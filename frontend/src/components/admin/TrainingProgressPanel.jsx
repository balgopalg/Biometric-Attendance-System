import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HiCheckCircle, HiClock, HiOutlineExclamationCircle, HiX, HiChevronLeft, HiChevronRight } from 'react-icons/hi';
import { useTraining } from '../../context/TrainingContext';

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

/**
 * GlobalTrainingProgressPanel — rendered once at the app root.
 * Reads training state from TrainingContext, persists across page changes.
 * Supports collapse/expand via a left-edge ribbon toggle.
 */
export default function GlobalTrainingProgressPanel() {
  const { job, cancelling, dismissed, cancelTraining, dismissTraining } = useTraining();
  const [collapsed, setCollapsed] = useState(false);

  const status    = String(job?.status || '').toLowerCase();
  const total     = Number(job?.training_total_faces ?? job?.result?.requested_count ?? job?.result?.total_faces ?? 0);
  const trained   = Number(job?.training_trained_faces ?? job?.result?.success_count ?? job?.result?.trained_faces ?? 0);
  const processed = Number(job?.training_processed_faces ?? trained ?? 0);
  const failed    = Number(job?.training_failed_faces ?? job?.result?.failure_count ?? 0);
  const progress  = Number(job?.training_progress_percent ?? (total > 0 ? (processed / total) * 100 : 0));
  const message   = job?.training_message || job?.result?.message || 'Training faces in the background';
  const meta      = getStatusMeta(status);
  const StatusIcon = meta.icon;
  const canCancel = status === 'queued' || status === 'running';

  // Auto-hide 60s after terminal state
  const timeoutRef = useRef(null);
  useEffect(() => {
    const TERMINAL = new Set(['completed', 'failed', 'dead_letter', 'cancelled']);
    if (TERMINAL.has(status)) {
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => dismissTraining(), 60000);
      }
    } else {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    }
    return () => { if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; } };
  }, [status, dismissTraining]);

  if (!job || dismissed) return null;

  const CARD_WIDTH = 380;
  const RIBBON_W   = 28; // width of collapsed ribbon

  return (
    <AnimatePresence>
      <motion.div
        key="global-training-panel"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          zIndex: 1200,
          pointerEvents: 'none',
          // Total container is always ribbon + card width; clip overflow so card hides fully
          width: CARD_WIDTH + RIBBON_W,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
        }}
      >
        {/* ── Outer wrapper: ribbon + card, slides right on collapse ── */}
        <motion.div
          animate={{ x: collapsed ? CARD_WIDTH : 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 32 }}
          style={{
            display: 'flex',
            alignItems: 'stretch',
            pointerEvents: 'auto',
            borderRadius: 18,
            overflow: 'hidden',
            border: '1px solid var(--border-glass)',
            background: 'linear-gradient(180deg, var(--bg-card), var(--bg-secondary))',
            boxShadow: 'var(--shadow-card)',
            backdropFilter: 'blur(16px)',
            color: 'var(--text-primary)',
            width: CARD_WIDTH + RIBBON_W,
          }}
        >
          {/* ── Left ribbon / toggle ── */}
          <button
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand training panel' : 'Collapse training panel'}
            title={collapsed ? 'Expand' : 'Collapse'}
            style={{
              flexShrink: 0,
              width: RIBBON_W,
              background: 'none',
              border: 'none',
              borderRight: collapsed ? 'none' : '1px solid var(--border-glass)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 0',
              color: meta.accent,
              position: 'relative',
              transition: 'background 0.18s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-glass)')}
            onMouseOut={e => (e.currentTarget.style.background = 'none')}
          >
            {/* Coloured accent strip along the ribbon */}
            <div style={{
              position: 'absolute',
              left: 0, top: 0, bottom: 0,
              width: 3,
              borderRadius: '18px 0 0 18px',
              background: meta.accent,
            }} />

            {/* Chevron icon rotates on collapse */}
            <motion.div
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            >
              <HiChevronRight size={16} />
            </motion.div>

            {/* Vertical label shown only when collapsed */}
            <AnimatePresence>
              {collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.12, duration: 0.18 }}
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: meta.accent,
                    userSelect: 'none',
                  }}
                >
                  {meta.label}
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* ── Main card content ── */}
          <div style={{ flex: 1, padding: 16, position: 'relative', minWidth: 0 }}>
            {/* Close (dismiss) button */}
            <button
              onClick={dismissTraining}
              aria-label="Close"
              style={{
                position: 'absolute', top: 10, right: 10,
                background: 'none', border: 'none',
                color: 'var(--text-secondary)', fontSize: 20,
                cursor: 'pointer', zIndex: 2, padding: 2,
                borderRadius: 4, transition: 'background 0.2s',
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-glass)')}
              onMouseOut={e => (e.currentTarget.style.background = 'none')}
            >
              <HiX />
            </button>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 12,
                display: 'grid', placeItems: 'center',
                background: 'var(--bg-glass)', color: meta.accent, flexShrink: 0,
              }}>
                <StatusIcon size={18} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.95rem' }}>Face training</strong>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: meta.accent }}>
                    {meta.label}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.35 }}>
                  {message}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.8rem', marginBottom: 8, color: 'var(--text-secondary)' }}>
                <span>Faces trained: {trained} / {total || trained || 1}</span>
                <span>{Math.max(0, Math.min(100, Math.round(progress)))}%</span>
              </div>
              <div style={{ width: '100%', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>
                <motion.div
                  initial={false}
                  animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                  transition={{ type: 'spring', stiffness: 180, damping: 24 }}
                  style={{ height: '100%', borderRadius: 999, background: meta.barColor }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span>Processed {processed} / {total || processed || 1}</span>
              <span>Failed {failed}</span>
            </div>

            {/* Cancel button */}
            {canCancel && (
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={cancelTraining}
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
      </motion.div>
    </AnimatePresence>
  );
}
