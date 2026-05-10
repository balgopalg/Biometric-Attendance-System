import Modal from '../../../components/ui/Modal';
import { formatCourseName } from '../../../utils/courseDisplay';

export default function BulkAssignModal({
  isOpen,
  onClose,
  bulkForm,
  setBulkForm,
  departments,
  visibleCourses,
  bulkSessions,
  bulkSemesters,
  bulkAssignAllPapers,
  setBulkAssignAllPapers,
  bulkPapers,
  eligibleBulkStudents,
  areAllBulkStudentsSelected,
  onAssign,
  isDepartmentAdmin,
  departmentName
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Assign Paper" width={520}>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 1: Department</label>
        <select
          className="input-field"
          value={bulkForm.department_id}
          onChange={(e) => {
            setBulkAssignAllPapers(false);
            setBulkForm({ department_id: e.target.value, course_id: '', academic_session: '', semester: '', paper_id: '', user_ids: [] });
          }}
          disabled={isDepartmentAdmin}
        >
          <option value="">{isDepartmentAdmin ? (departmentName || 'Department') : 'All Departments'}</option>
          {departments?.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 2: Course</label>
        <select
          className="input-field"
          value={bulkForm.course_id}
          onChange={(e) => {
            setBulkAssignAllPapers(false);
            setBulkForm({ ...bulkForm, course_id: e.target.value, academic_session: '', semester: '', paper_id: '', user_ids: [] });
          }}
        >
          <option value="">Select course</option>
          {visibleCourses.filter(c => !bulkForm.department_id || c.department_id === bulkForm.department_id).map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })} ({c.code})</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 3: Session</label>
        <select
          className="input-field"
          value={bulkForm.academic_session}
          onChange={(e) => {
            setBulkAssignAllPapers(false);
            setBulkForm({ ...bulkForm, academic_session: e.target.value, semester: '', paper_id: '', user_ids: [] });
          }}
          disabled={!bulkForm.course_id}
        >
          <option value="">Select session (optional)</option>
          {bulkSessions?.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 4: Semester</label>
        <select
          className="input-field"
          value={bulkForm.semester}
          onChange={(e) => {
            setBulkAssignAllPapers(false);
            setBulkForm({ ...bulkForm, semester: e.target.value, paper_id: '', user_ids: [] });
          }}
          disabled={!bulkForm.course_id}
        >
          <option value="">Select semester</option>
          {bulkSemesters.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 5: Paper</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={bulkAssignAllPapers}
            disabled={!bulkForm.semester || bulkPapers.length === 0}
            onChange={(e) => {
              const checked = e.target.checked;
              setBulkAssignAllPapers(checked);
              if (checked) {
                setBulkForm({ ...bulkForm, paper_id: '' });
              }
            }}
          />
          Assign all papers in selected semester ({bulkPapers.length})
        </label>
        <select
          className="input-field"
          value={bulkForm.paper_id}
          onChange={(e) => setBulkForm({ ...bulkForm, paper_id: e.target.value })}
          disabled={!bulkForm.semester || bulkAssignAllPapers}
        >
          <option value="">Select paper</option>
          {bulkPapers.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.code})</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 6: Eligible Students</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            disabled={eligibleBulkStudents.length === 0}
            checked={areAllBulkStudentsSelected}
            onChange={(e) => {
              if (e.target.checked) {
                setBulkForm({ ...bulkForm, user_ids: eligibleBulkStudents.map((s) => s.user_id || s._id) });
              } else {
                setBulkForm({ ...bulkForm, user_ids: [] });
              }
            }}
          />
          Select All
        </label>
        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: 8 }}>
          {eligibleBulkStudents.map((s) => {
            const sid = s.user_id || s._id;
            return (
              <label key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={bulkForm.user_ids.includes(sid)}
                  onChange={(e) => {
                    const ids = e.target.checked
                      ? [...bulkForm.user_ids, sid]
                      : bulkForm.user_ids.filter((id) => id !== sid);
                    setBulkForm({ ...bulkForm, user_ids: ids });
                  }}
                />
                {s.name} ({s.reg_number || 'N/A'})
              </label>
            );
          })}
          {eligibleBulkStudents.length === 0 && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 6px' }}>
              Select course and semester to load eligible students.
            </p>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={onAssign}>Assign</button>
      </div>
    </Modal>
  );
}
