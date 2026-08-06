import Modal from '../../../components/ui/Modal';

export default function PromoteStudentsModal({
  isOpen,
  onClose,
  promoteSemester,
  setPromoteSemester,
  promoteSemesterOptions,
  loadingPromoteSemesters,
  promotingSelected,
  selectedCount,
  onPromote
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Promote Selected Students" width={440}>
      <div style={{ display: 'grid', gap: 12 }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
          Leave semester blank to auto-promote each student to next semester.
        </p>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>
            Target Semester (optional)
          </label>
          <select
            className="input-field"
            value={promoteSemester}
            onChange={(e) => setPromoteSemester(e.target.value)}
            disabled={loadingPromoteSemesters}
          >
            <option value="">Auto next semester</option>
            {promoteSemesterOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-secondary" onClick={onClose} disabled={promotingSelected}>Cancel</button>
          <button className="btn-primary" onClick={onPromote} disabled={promotingSelected}>
            {promotingSelected ? 'Promoting...' : `Promote ${selectedCount}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
