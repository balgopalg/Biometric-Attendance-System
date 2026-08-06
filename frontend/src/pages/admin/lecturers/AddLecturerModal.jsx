import Modal from '../../../components/ui/Modal';

/**
 * Modal for adding a new lecturer with name, email and department fields.
 */
export default function AddLecturerModal({
  isOpen,
  onClose,
  form,
  setForm,
  onSubmit,
  departments,
  isSuperAdmin,
  isDepartmentAdmin,
  departmentName,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Lecturer" width={480}>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Full Name</label>
        <input className="input-field" placeholder="Dr. John Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Email</label>
        <input className="input-field" placeholder="lecturer@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Primary Department</label>
        <select
          className="input-field"
          value={form.department}
          onChange={(e) => setForm({ ...form, department: e.target.value })}
          disabled={isDepartmentAdmin}
        >
          <option value="" disabled={isSuperAdmin}>
            {isDepartmentAdmin ? (departmentName || 'Department') : 'Select Primary Department...'}
          </option>
          {departments.map((d) => (
            <option key={d._id} value={d.name}>{d.name}</option>
          ))}
        </select>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        A temporary password will be generated automatically. Lecturers will create or update their own PIN from their dashboard.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={onSubmit}>Create Lecturer</button>
      </div>
    </Modal>
  );
}
