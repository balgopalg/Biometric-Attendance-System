import Modal from '../../../components/ui/Modal';
import { formatCourseName } from '../../../utils/courseDisplay';

export default function StudentFormModal({ 
  isOpen, 
  onClose, 
  title, 
  form, 
  setForm, 
  onSubmit, 
  submitLabel, 
  departments, 
  formCourses, 
  isSuperAdmin, 
  isDepartmentAdmin, 
  departmentName,
  isEdit 
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} width={560}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Full Name</label>
          <input className="input-field" placeholder="John Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Email</label>
          <input className="input-field" placeholder="student@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Department</label>
          <select
            className="input-field"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value, course_id: '' })}
            disabled={isDepartmentAdmin}
          >
            <option value="" disabled={isSuperAdmin}>
              {isDepartmentAdmin ? (departmentName || 'Department') : 'Select department'}
            </option>
            {departments.map((d) => (
              <option key={d._id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Course</label>
          <select
            className="input-field"
            value={form.course_id}
            onChange={(e) => setForm({ ...form, course_id: e.target.value })}
            disabled={!isDepartmentAdmin && !form.department}
          >
            <option value="">Select course</option>
            {formCourses.map((c) => (
              <option key={c._id} value={c._id}>
                {formatCourseName(c.name, { status: c.status })} ({c.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Mobile No (Optional)</label>
          <input className="input-field" placeholder="10-digit mobile number" value={form.mobile_no} onChange={(e) => setForm({ ...form, mobile_no: e.target.value })} />
        </div>
      </div>

      {isEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Roll No.</label>
            <input className="input-field" placeholder="Update roll number" />
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Registration No.</label>
            <input className="input-field" placeholder="Update registration number" value={form.reg_number || ''} onChange={(e) => setForm({ ...form, reg_number: e.target.value })} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={onSubmit}>{submitLabel}</button>
      </div>
    </Modal>
  );
}
