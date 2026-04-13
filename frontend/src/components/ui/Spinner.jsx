export default function Spinner({ size = 24, ariaLabel = 'Loading' }) {
  return (
    <>
      <style>
        {`@keyframes spinner-fallback-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}
      </style>
      <span
        role="status"
        aria-label={ariaLabel}
        style={{
          width: size,
          height: size,
          border: '3px solid var(--border-glass)',
          borderTopColor: 'var(--accent-purple)',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spinner-fallback-spin 0.75s linear infinite',
        }}
      />
    </>
  );
}
