export default function Pagination({ page, total, perPage, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  if (total <= perPage) {
    return null;
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
      <button
        className="btn-secondary"
        disabled={!canGoPrev}
        onClick={() => canGoPrev && onPageChange(page - 1)}
        style={{ padding: '6px 16px', fontSize: '0.8rem' }}
      >
        Previous
      </button>
      <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        Page {page} of {totalPages}
      </span>
      <button
        className="btn-secondary"
        disabled={!canGoNext}
        onClick={() => canGoNext && onPageChange(page + 1)}
        style={{ padding: '6px 16px', fontSize: '0.8rem' }}
      >
        Next
      </button>
    </div>
  );
}
