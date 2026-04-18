import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../hooks/useAuth';
import StatePanel from '../../components/ui/StatePanel';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlineUserGroup, HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineKey } from 'react-icons/hi';
import Modal from '../../components/ui/Modal';

export default function ManageDepartmentAdmins() {
  const { isSuperAdmin } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', department_id: '', initial_password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [tempPassInfo, setTempPassInfo] = useState(null);

  const fetchData = () => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/admin/department-admins'),
      api.get('/admin/departments'),
    ])
      .then(([adminsRes, deptsRes]) => {
        setAdmins(Array.isArray(adminsRes.data) ? adminsRes.data : []);
        setDepartments(Array.isArray(deptsRes.data) ? deptsRes.data : []);
      })
      .catch(() => setError('Failed to load data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setForm({ name: '', email: '', department_id: '', initial_password: '' });
    setEditId(null);
    setShowForm(false);
    setTempPassInfo(null);
  };

  const handleEdit = (admin) => {
    setForm({
      name: admin.name || '',
      email: admin.email || '',
      department_id: admin.department_id ? String(admin.department_id) : '',
      initial_password: '',
    });
    setEditId(admin._id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editId) {
        await api.put(`/admin/department-admins/${editId}`, {
          name: form.name,
          department_id: form.department_id,
        });
        toast.success('Department admin updated');
        resetForm();
      } else {
        if (!form.name || !form.email || !form.department_id) {
          toast.error('Name, email, and department are required');
          setSubmitting(false);
          return;
        }
        const res = await api.post('/admin/department-admins', form);
        toast.success('Department admin created');
        setTempPassInfo({
          email: form.email,
          password: res.data?.temp_password || form.initial_password || '(auto-generated)',
        });
        setForm({ name: '', email: '', department_id: '', initial_password: '' });
        setEditId(null);
        setShowForm(false);
      }
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (admin) => {
    if (!window.confirm(`Delete department admin "${admin.name}" (${admin.email})? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/department-admins/${admin._id}`);
      toast.success('Department admin deleted');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const handleResetPassword = async (admin) => {
    if (!window.confirm(`Reset password for ${admin.email}?`)) return;
    try {
      const res = await api.post(`/admin/department-admins/${admin._id}/reset-password`);
      setTempPassInfo({ email: admin.email, password: res.data?.temp_password || '(generated)' });
      toast.success('Password reset');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Reset failed');
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="admin-page">
        <StatePanel variant="error" title="Access Denied" description="Only Super Admins can manage department administrators." compact />
      </div>
    );
  }

  return (
    <div className="admin-page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HiOutlineUserGroup size={22} style={{ color: 'var(--accent-purple)' }} />
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Department Admins</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Create and manage department-level administrators. Each is scoped to one department.
            </p>
          </div>
        </div>
        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.82rem' }} onClick={() => { resetForm(); setShowForm(true); }}>
          <HiOutlinePlus size={16} /> New Dept. Admin
        </button>
      </div>

      {/* Temp Password Banner */}
      {tempPassInfo && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: 16, marginBottom: 16, borderLeft: '4px solid var(--accent-cyan)' }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6 }}>🔑 Temporary Credentials</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Email: <strong>{tempPassInfo.email}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;
            Password: <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 4 }}>{tempPassInfo.password}</code>
          </p>
          <button className="btn-secondary" style={{ marginTop: 8, padding: '4px 12px', fontSize: '0.75rem' }} onClick={() => setTempPassInfo(null)}>Dismiss</button>
        </motion.div>
      )}

      {/* Create / Edit Form */}
      <Modal isOpen={showForm} onClose={resetForm} title={editId ? 'Edit Department Admin' : 'New Department Admin'} width={500}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Full Name *</label>
          <input className="input-field" placeholder="Jane Smith" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
        </div>
        {!editId && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Email *</label>
            <input className="input-field" type="email" placeholder="jane@university.edu" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Department *</label>
          <select className="input-field" value={form.department_id} onChange={(e) => setForm(f => ({ ...f, department_id: e.target.value }))} required>
            <option value="">— Select Department —</option>
            {departments.filter(d => d.status === 'active').map(d => (
              <option key={d._id} value={d._id}>{d.name} ({d.code})</option>
            ))}
          </select>
        </div>
        {!editId && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Initial Password (optional)</label>
            <input className="input-field" type="text" placeholder="Auto-generated if blank" value={form.initial_password} onChange={(e) => setForm(f => ({ ...f, initial_password: e.target.value }))} />
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
        <StatePanel variant="loading" title="Loading department admins" compact />
      ) : error ? (
        <StatePanel variant="error" title="Error" description={error} actionLabel="Retry" onAction={fetchData} compact />
      ) : admins.length === 0 ? (
        <StatePanel variant="empty" title="No department admins yet" description="Create a department admin to delegate department-level management." compact />
      ) : (
        <div className="glass-card" style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <tr key={admin._id}>
                  <td style={{ fontWeight: 600, fontSize: '0.84rem' }}>{admin.name}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{admin.email}</td>
                  <td>
                    <span className="badge badge-info">{admin.department_code || '—'}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 8 }}>{admin.department_name || ''}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn-secondary" title="Edit" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => handleEdit(admin)}>
                        <HiOutlinePencil size={14} />
                      </button>
                      <button className="btn-secondary" title="Reset Password" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => handleResetPassword(admin)}>
                        <HiOutlineKey size={14} />
                      </button>
                      <button className="btn-secondary" title="Delete" style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'var(--danger)' }} onClick={() => handleDelete(admin)}>
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
