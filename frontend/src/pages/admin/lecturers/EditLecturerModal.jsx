import Modal from '../../../components/ui/Modal';
import { motion } from 'framer-motion';

/**
 * Modal for editing an existing lecturer's details (name, email, department).
 */
export default function EditLecturerModal({
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
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Lecturer" width={480}>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Full Name</label>
        <input className="input-field" placeholder="Dr. John Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Email</label>
        <input className="input-field" placeholder="lecturer@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div style={{ marginBottom: 20 }}>
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={onSubmit}>Save Changes</button>
      </div>
    </Modal>
  );
}
