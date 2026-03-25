import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import Modal from '../../components/ui/Modal';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineTrash,
  HiOutlineKey,
  HiOutlineCheckCircle,
  HiOutlineClipboardCopy,
  HiOutlineClipboardList,
} from 'react-icons/hi';

const EMPTY_FORM = { name: '', email: '' };

export default function ManageLecturers() {
  const [lecturers, setLecturers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [papers, setPapers] = useState([]);

  const [showAdd, setShowAdd] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const [createdCreds, setCreatedCreds] = useState(null);
  const [selectedLecturer, setSelectedLecturer] = useState(null);
  const [assignedPaperIds, setAssignedPaperIds] = useState([]);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ course_id: '', semester: '', paper_id: '' });
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchMetadata = () => {
    api.get('/admin/courses').then((r) => setCourses(r.data)).catch(() => {});
    api.get('/admin/papers').then((r) => setPapers(r.data)).catch(() => {});
  };

  const fetchLecturers = () => {
    const params = {};
    if (filters.course_id) params.course_id = filters.course_id;
    if (filters.semester) params.semester = filters.semester;
    if (filters.paper_id) params.paper_id = filters.paper_id;
    api.get('/admin/lecturers', { params }).then((r) => setLecturers(r.data)).catch(() => {});
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    fetchLecturers();
  }, [filters.course_id, filters.semester, filters.paper_id]);

  const semesterOptions = useMemo(() => {
    const values = new Set();
    papers.forEach((p) => {
      if (filters.course_id && p.course_id !== filters.course_id) return;
      const sem = Number(p.semester || 0);
      if (Number.isFinite(sem) && sem > 0) values.add(sem);
    });
    return Array.from(values).sort((a, b) => a - b);
  }, [papers, filters.course_id]);

  const filteredPapers = useMemo(() => {
    return papers.filter((p) => {
      const matchCourse = !filters.course_id || p.course_id === filters.course_id;
      const matchSemester = !filters.semester || String(p.semester || '') === String(filters.semester);
      return matchCourse && matchSemester;
    });
  }, [papers, filters.course_id, filters.semester]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return lecturers.filter((l) =>
      l.name?.toLowerCase().includes(q)
      || l.email?.toLowerCase().includes(q)
      || (l.assigned_papers || []).some((s) => s.toLowerCase().includes(q))
    );
  }, [lecturers, search]);

  const handleAdd = async () => {
    try {
      const res = await api.post('/admin/lecturers', { ...form, role: 'lecturer' });
      const data = res.data;
      setShowAdd(false);
      setForm(EMPTY_FORM);
      setCreatedCreds({
        name: data.name,
        email: data.email,
        temp_password: data.temp_password,
      });
      setShowCreds(true);
      fetchLecturers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this lecturer?')) return;
    try {
      await api.delete(`/admin/lecturers/${id}`);
      toast.success('Deleted');
      fetchLecturers();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleResetPassword = async (id, name) => {
    if (!window.confirm(`Reset password for ${name}?`)) return;
    try {
      const res = await api.post(`/admin/lecturers/${id}/reset-password`);
      setCreatedCreds({
        name,
        temp_password: res.data.temp_password,
        isReset: true,
      });
      setShowCreds(true);
    } catch (err) {
      toast.error('Failed to reset password');
    }
  };

  const handleResetPin = async (id, name) => {
    if (!window.confirm(`Reset PIN for ${name}?`)) return;
    try {
      const res = await api.post(`/admin/lecturers/${id}/reset-pin`);
      toast.success(`New PIN for ${name}: ${res.data.pin}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset PIN');
    }
  };

  const openAssignModal = async (lecturer) => {
    try {
      const res = await api.get(`/admin/lecturers/${lecturer._id}/papers`);
      setSelectedLecturer(lecturer);
      setAssignedPaperIds((res.data.assigned || []).map((p) => p._id));
      setShowAssign(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load assignments');
    }
  };

  const handleSaveAssignments = async () => {
    if (!selectedLecturer) return;
    try {
      await api.put(`/admin/lecturers/${selectedLecturer._id}/papers`, { paper_ids: assignedPaperIds });
      toast.success('Paper assignments updated');
      setShowAssign(false);
      setSelectedLecturer(null);
      setAssignedPaperIds([]);
      fetchLecturers();
      fetchMetadata();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update assignments');
    }
  };

  const copyCredentials = () => {
    if (!createdCreds) return;
    const text = `Name: ${createdCreds.name}\n${createdCreds.email ? `Email: ${createdCreds.email}\n` : ''}Temp Password: ${createdCreds.temp_password}`;
    navigator.clipboard.writeText(text);
    toast.success('Credentials copied');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' } }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Lecturers</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{lecturers.length} lecturers in current filter</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }}>
          <HiOutlinePlus size={16} /> Add Lecturer
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative' }}>
          <HiOutlineSearch size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="search-input" placeholder="Search by name, email or subject..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input-field" value={filters.course_id} onChange={(e) => setFilters({ course_id: e.target.value, semester: '', paper_id: '' })}>
          <option value="">All Courses</option>
          {courses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>

        <select className="input-field" value={filters.semester} onChange={(e) => setFilters({ ...filters, semester: e.target.value, paper_id: '' })}>
          <option value="">All Semesters</option>
          {semesterOptions.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
        </select>

        <select className="input-field" value={filters.paper_id} onChange={(e) => setFilters({ ...filters, paper_id: e.target.value })}>
          <option value="">All Papers</option>
          {filteredPapers.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Assigned Papers</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l._id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: 'var(--gradient-warm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      color: '#fff',
                      flexShrink: 0,
                    }}>
                      {l.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{l.name}</span>
                  </div>
                </td>
                <td>{l.email}</td>
                <td>
                  {(l.assigned_papers || []).length === 0 ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No papers</span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {l.assigned_papers.map((paper, idx) => (
                        <span key={`${l._id}-paper-${idx}`} className="badge badge-info">{paper}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="icon-btn" title="Manage Assignments" onClick={() => openAssignModal(l)}>
                      <HiOutlineClipboardList size={15} />
                    </button>
                    <button className="icon-btn" title="Reset PIN" onClick={() => handleResetPin(l._id, l.name)}>
                      <HiOutlineKey size={15} />
                    </button>
                    <button className="icon-btn" title="Reset Password" onClick={() => handleResetPassword(l._id, l.name)}>
                      <HiOutlineKey size={15} />
                    </button>
                    <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(l._id)}>
                      <HiOutlineTrash size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No lecturers found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Lecturer" width={480}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Full Name</label>
          <input className="input-field" placeholder="Dr. John Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Email</label>
          <input className="input-field" placeholder="lecturer@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          A temporary password will be generated automatically. Lecturers will create or update their own PIN from their dashboard.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleAdd}>Create Lecturer</button>
        </div>
      </Modal>

      <Modal isOpen={showAssign} onClose={() => setShowAssign(false)} title={`Edit Assignments${selectedLecturer ? ` - ${selectedLecturer.name}` : ''}`} width={600}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>
          Select all papers this lecturer teaches. A lecturer can handle multiple papers across different courses.
        </p>
        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: 8, marginBottom: 16 }}>
          {papers.map((p) => {
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
                {p.name} ({p.code}) {p.course_name ? `- ${p.course_name}` : ''}
              </label>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-secondary" onClick={() => setShowAssign(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleSaveAssignments}>Save Assignments</button>
        </div>
      </Modal>

      <Modal isOpen={showCreds} onClose={() => setShowCreds(false)} title="" width={460}>
        <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <HiOutlineCheckCircle size={22} style={{ color: 'var(--accent-emerald)' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
              {createdCreds?.isReset ? 'Password Reset' : 'Lecturer Created'}
            </h3>
          </div>

          <div style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: 'var(--radius)',
            padding: '16px 20px',
            marginBottom: 16,
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Name:</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{createdCreds?.name}</span>
            </div>
            {createdCreds?.email && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Email:</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{createdCreds.email}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Temp Password:</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-purple)', fontFamily: 'monospace' }}>
                {createdCreds?.temp_password}
              </span>
            </div>
          </div>

          <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={copyCredentials}>
            <HiOutlineClipboardCopy size={16} /> Copy credentials
          </button>
        </div>
      </Modal>
    </motion.div>
  );
}
