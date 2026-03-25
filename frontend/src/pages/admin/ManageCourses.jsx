import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import Modal from '../../components/ui/Modal';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlinePlus, HiOutlineSearch, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';

const EMPTY_FORM = { name: '', code: '', department: '', course_duration: '' };

export default function ManageCourses() {
  const [courses, setCourses] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [search, setSearch] = useState('');
  const [durationFilter, setDurationFilter] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchCourses = () => {
    const params = {};
    if (durationFilter) params.course_duration = durationFilter;
    api.get('/admin/courses', { params }).then((r) => setCourses(r.data)).catch(() => {});
  };

  useEffect(fetchCourses, [durationFilter]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return courses.filter((c) =>
      c.name?.toLowerCase().includes(q)
      || c.code?.toLowerCase().includes(q)
      || c.department?.toLowerCase().includes(q)
    );
  }, [courses, search]);

  const handleAdd = async () => {
    try {
      await api.post('/admin/courses', form);
      toast.success('Course created');
      setShowAdd(false);
      setForm(EMPTY_FORM);
      fetchCourses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const openEdit = (course) => {
    setEditingCourse(course);
    setForm({
      name: course.name || '',
      code: course.code || '',
      department: course.department || '',
      course_duration: String(course.course_duration || ''),
    });
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    if (!editingCourse) return;
    try {
      await api.put(`/admin/courses/${editingCourse._id}`, form);
      toast.success('Course updated');
      setShowEdit(false);
      setEditingCourse(null);
      setForm(EMPTY_FORM);
      fetchCourses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update course');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this course?')) return;
    try {
      await api.delete(`/admin/courses/${id}`);
      toast.success('Deleted');
      fetchCourses();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const CourseForm = ({ onSubmit, submitLabel }) => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Name</label>
          <input className="input-field" placeholder="e.g. MCA" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Code</label>
          <input className="input-field" placeholder="e.g. MCA-01" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Department</label>
        <input className="input-field" placeholder="e.g. Computer Science" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Number of Academic Years</label>
          <select className="input-field" value={form.course_duration} onChange={(e) => setForm({ ...form, course_duration: e.target.value })}>
            <option value="">Select duration</option>
            {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn-secondary" onClick={() => { setShowAdd(false); setShowEdit(false); }}>Cancel</button>
        <button className="btn-primary" onClick={onSubmit}>{submitLabel}</button>
      </div>
    </>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' } }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Courses</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{courses.length} courses in current filter</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }}>
          <HiOutlinePlus size={16} /> Add Course
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative' }}>
          <HiOutlineSearch size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="search-input"
            placeholder="Search by name, code, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input-field" value={durationFilter} onChange={(e) => setDurationFilter(e.target.value)}>
          <option value="">All Durations</option>
          {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}
        </select>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Department</th>
              <th>Duration</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c._id}>
                <td><span className="badge badge-info">{c.code}</span></td>
                <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</td>
                <td>{c.department || 'N/A'}</td>
                <td>{c.course_duration ? `${c.course_duration} year${c.course_duration > 1 ? 's' : ''}` : 'N/A'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="icon-btn" title="Edit" onClick={() => openEdit(c)}><HiOutlinePencil size={15} /></button>
                    <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(c._id)}><HiOutlineTrash size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No courses found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Course" width={500}>
        {CourseForm({ onSubmit: handleAdd, submitLabel: 'Create Course' })}
      </Modal>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Course" width={500}>
        {CourseForm({ onSubmit: handleUpdate, submitLabel: 'Save Changes' })}
      </Modal>
    </motion.div>
  );
}
