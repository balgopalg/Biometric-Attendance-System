import Modal from '../../../components/ui/Modal';
import { formatCourseName } from '../../../utils/courseDisplay';

/**
 * Modal for managing paper assignments for a lecturer with department/course/semester filters.
 */
export default function AssignPapersModal({
  isOpen,
  onClose,
  selectedLecturer,
  departments,
  assignmentFilters,
  setAssignmentFilters,
  assignmentFilterCourses,
  assignmentFilterSemesters,
  assignmentFilteredPapers,
  assignedPaperIds,
  setAssignedPaperIds,
  onSave,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit Assignments${selectedLecturer ? ` - ${selectedLecturer.name}` : ''}`} width={600}>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>
        Select all papers this lecturer teaches. Use the filters below to narrow the list.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
        <select
          className="input-field"
          value={assignmentFilters.department_id}
          onChange={(e) => setAssignmentFilters({ department_id: e.target.value, course_id: '', semester: '' })}
        >
          <option value="">All Departments</option>
          {departments.map((dept) => (
            <option key={dept._id} value={dept._id}>{dept.name}</option>
          ))}
        </select>
        <select
          className="input-field"
          value={assignmentFilters.course_id}
          onChange={(e) => setAssignmentFilters((prev) => ({ ...prev, course_id: e.target.value, semester: '' }))}
          disabled={assignmentFilterCourses.length === 0}
        >
          <option value="">All Courses</option>
          {assignmentFilterCourses.map((course) => (
            <option key={course._id} value={course._id}>{formatCourseName(course.name, { status: course.status })}</option>
          ))}
        </select>
        <select
          className="input-field"
          value={assignmentFilters.semester}
          onChange={(e) => setAssignmentFilters((prev) => ({ ...prev, semester: e.target.value }))}
          disabled={assignmentFilterSemesters.length === 0}
        >
          <option value="">All Semesters</option>
          {assignmentFilterSemesters.map((semester) => (
            <option key={semester} value={String(semester)}>Semester {semester}</option>
          ))}
        </select>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: 8, marginBottom: 16 }}>
        {assignmentFilteredPapers.map((p) => {
          const checked = assignedPaperIds.includes(p._id);
          return (
            <label key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', fontSize: '0.82rem' }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...assignedPaperIds, p._id]
                    : assignedPaperIds.filter((id) => id !== p._id);
                  setAssignedPaperIds(next);
                }}
              />
              {p.name}{p.code ? ` [${p.code}]` : ''} {p.course_name ? `- ${formatCourseName(p.course_name, { isInactive: p.is_course_inactive, status: p.course_status })}` : ''}
            </label>
          );
        })}
        {assignmentFilteredPapers.length === 0 && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 6px' }}>
            No subjects match the selected filters.
          </p>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={onSave}>Save Assignments</button>
      </div>
    </Modal>
  );
}
