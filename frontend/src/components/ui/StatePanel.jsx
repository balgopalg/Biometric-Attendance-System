import Spinner from './Spinner';
import { createPortal } from 'react-dom';

const variants = {
  loading: {
    title: 'Loading data',
    accent: 'var(--accent-cyan)',
  },
  empty: {
    title: 'Nothing to show yet',
    accent: 'var(--text-muted)',
  },
  error: {
    title: 'Something went wrong',
    accent: 'var(--accent-rose)',
  },
};

export default function StatePanel({
  variant = 'empty',
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}) {
  const cfg = variants[variant] || variants.empty;

  if (variant === 'loading') {
    const overlay = (
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          background: 'rgba(2, 6, 23, 0.34)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      >
        <section
          className="glass-card"
          role="status"
          aria-label={title || cfg.title}
          style={{
            width: 'min(420px, calc(100vw - 32px))',
            padding: 22,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Spinner size={compact ? 22 : 28} ariaLabel={title || cfg.title} />

          <h3 style={{ fontSize: compact ? '0.9rem' : '1rem', fontWeight: 700 }}>
            {title || cfg.title}
          </h3>

          {description ? (
            <p style={{ color: 'var(--text-muted)', fontSize: compact ? '0.78rem' : '0.84rem', maxWidth: 540 }}>
              {description}
            </p>
          ) : null}
        </section>
      </div>
    );

    if (typeof document !== 'undefined' && document.body) {
      return createPortal(overlay, document.body);
    }

    return overlay;
  }

  return (
    <section
      className="glass-card"
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      style={{
        padding: compact ? 16 : 26,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: variant === 'loading' ? 14 : 10,
          height: variant === 'loading' ? 14 : 10,
          borderRadius: '50%',
          background: cfg.accent,
          boxShadow: `0 0 0 ${variant === 'loading' ? 3 : 4}px color-mix(in srgb, ${cfg.accent} 18%, transparent)`,
          opacity: variant === 'loading' ? 0.8 : 1,
        }}
      />

      <h3 style={{ fontSize: compact ? '0.9rem' : '1rem', fontWeight: 700 }}>
        {title || cfg.title}
      </h3>

      {description ? (
        <p style={{ color: 'var(--text-muted)', fontSize: compact ? '0.78rem' : '0.84rem', maxWidth: 540 }}>
          {description}
        </p>
      ) : null}

      {actionLabel && onAction ? (
        <button className="btn-secondary" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
