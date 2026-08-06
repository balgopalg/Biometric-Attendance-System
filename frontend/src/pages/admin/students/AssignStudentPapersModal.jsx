import Modal from '../../../components/ui/Modal';

export default function AssignStudentPapersModal({
  isOpen,
  onClose,
  paperStudent,
  loadingStudentPapers,
  paperOptions,
  selectedPaperIds,
  setSelectedPaperIds,
  savingStudentPapers,
  onSave
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Student Subjects" width={560}>
      <div style={{ marginBottom: 10, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
        <strong>{paperStudent?.name || 'Student'}</strong>
        {paperStudent?.current_semester ? ` · Semester ${paperStudent.current_semester}` : ''}
      </div>

      {loadingStudentPapers ? (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading subjects...</p>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Selected: {selectedPaperIds.length} / {paperOptions.length}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setSelectedPaperIds(paperOptions.map((paper) => paper._id))}
                disabled={paperOptions.length === 0 || selectedPaperIds.length === paperOptions.length}
              >
                Select All
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setSelectedPaperIds([])}
                disabled={selectedPaperIds.length === 0}
              >
                Clear All
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: 8, marginBottom: 14 }}>
            {paperOptions.map((paper) => (
              <label key={paper._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', cursor: 'pointer', fontSize: '0.84rem' }}>
                <input
                  type="checkbox"
                  checked={selectedPaperIds.includes(paper._id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPaperIds((prev) => [...new Set([...prev, paper._id])]);
                    } else {
                      setSelectedPaperIds((prev) => prev.filter((id) => id !== paper._id));
                    }
                  }}
                />
                {paper.name} ({paper.code || 'NA'})
              </label>
            ))}
            {paperOptions.length === 0 && (
              <p style={{ margin: 0, padding: '6px 8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                No subjects found for this student's current semester.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn-secondary" onClick={onClose} disabled={savingStudentPapers}>Cancel</button>
            <button className="btn-primary" onClick={onSave} disabled={savingStudentPapers || loadingStudentPapers}>
              {savingStudentPapers ? 'Saving...' : 'Save Subjects'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
