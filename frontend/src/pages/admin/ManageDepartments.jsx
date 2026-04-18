import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../hooks/useAuth';
import StatePanel from '../../components/ui/StatePanel';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlineOfficeBuilding, HiOutlinePlus, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';
import Modal from '../../components/ui/Modal';

export default function ManageDepartments() {
  const { isSuperAdmin } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', status: 'active' });
  const [submitting, setSubmitting] = useState(false);

  const fetchDepartments = () => {
    setLoading(true);
    setError('');
    api.get('/admin/departments', { params: { include_inactive: '1' } })
      .then((r) => setDepartments(Array.isArray(r.data) ? r.data : []))
      .catch(() => setError('Failed to load departments'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDepartments(); }, []);

  const resetForm = () => {
    setForm({ name: '', code: '', status: 'active' });
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (dept) => {
    setForm({ name: dept.name, code: dept.code, status: dept.status || 'active' });
    setEditId(dept._id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Name and code are required');
      return;
    }
    setSubmitting(true);
    try {
      if (editId) {
        await api.put(`/admin/departments/${editId}`, form);
        toast.success('Department updated');
      } else {
        await api.post('/admin/departments', form);
        toast.success('Department created');
      }
      resetForm();
      fetchDepartments();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (dept) => {
    if (!window.confirm(`Deactivate department "${dept.name}"? This will not delete users.`)) return;
    try {
      await api.delete(`/admin/departments/${dept._id}`);
      toast.success('Department deactivated');
      fetchDepartments();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="admin-page">
        <StatePanel variant="error" title="Access Denied" description="Only Super Admins can manage departments." compact />
      </div>
    );
  }

  return (
    <div className="admin-page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HiOutlineOfficeBuilding size={22} style={{ color: 'var(--accent-cyan)' }} />
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Departments</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Manage organizational departments. Each department scopes courses, papers, and users.
            </p>
          </div>
        </div>
        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.82rem' }} onClick={() => { resetForm(); setShowForm(true); }}>
          <HiOutlinePlus size={16} /> New Department
        </button>
      </div>

      {/* Create / Edit Form */}
      <Modal isOpen={showForm} onClose={resetForm} title={editId ? 'Edit Department' : 'New Department'} width={450}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Department Name *</label>
          <input className="input-field" placeholder="e.g. Computer Science" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Code *</label>
          <input className="input-field" style={{ textTransform: 'uppercase' }} placeholder="e.g. CS" value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} required maxLength={10} />
        </div>
        {editId && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Status</label>
            <select className="input-field" value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>
          <button type="button" className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : (editId ? 'Update' : 'Create')}
          </button>
        </div>
      </Modal>

      {/* Table */}
      {loading ? (
        <StatePanel variant="loading" title="Loading departments" compact />
      ) : error ? (
        <StatePanel variant="error" title="Error" description={error} actionLabel="Retry" onAction={fetchDepartments} compact />
      ) : departments.length === 0 ? (
        <StatePanel variant="empty" title="No departments yet" description="Create your first department to start organizing." compact />
      ) : (
        <div className="glass-card" style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th>Department</th>
                <th>Code</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Admins</th>
                <th style={{ textAlign: 'center' }}>Lecturers</th>
                <th style={{ textAlign: 'center' }}>Students</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => (
                <tr key={dept._id}>
                  <td style={{ fontWeight: 600, fontSize: '0.84rem' }}>{dept.name}</td>
                  <td><span className="badge badge-info" style={{ letterSpacing: '0.05em' }}>{dept.code}</span></td>
                  <td>
                    <span className={`badge ${dept.status === 'active' ? 'badge-success' : 'badge-danger'}`} style={{ textTransform: 'capitalize' }}>
                      {dept.status || 'active'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.84rem' }}>{dept.admin_count ?? 0}</td>
                  <td style={{ textAlign: 'center', fontSize: '0.84rem' }}>{dept.lecturer_count ?? 0}</td>
                  <td style={{ textAlign: 'center', fontSize: '0.84rem' }}>{dept.student_count ?? 0}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn-secondary" title="Edit" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => handleEdit(dept)}>
                        <HiOutlinePencil size={14} />
                      </button>
                      <button className="btn-secondary" title="Deactivate" style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'var(--danger)' }} onClick={() => handleDelete(dept)} disabled={dept.status === 'inactive'}>
                        <HiOutlineTrash size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
