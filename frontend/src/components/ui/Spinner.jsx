export default function Spinner({ size = 24, ariaLabel = 'Loading' }) {
  return (
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
        animation: 'spin 0.75s linear infinite',
      }}
    />
  );
}
