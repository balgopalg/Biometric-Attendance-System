import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import Modal from '../../components/ui/Modal';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlinePlus, HiOutlineSearch, HiOutlineTrash, HiOutlinePencil } from 'react-icons/hi';

const EMPTY_FORM = { name: '', code: '', course_id: '', lecturer_id: '', semester: '' };

export default function ManagePapers() {
  const [papers, setPapers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [lecturers, setLecturers] = useState([]);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingPaper, setEditingPaper] = useState(null);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ course_id: '', lecturer_id: '', semester: '' });

  const [form, setForm] = useState(EMPTY_FORM);

  const fetchMetadata = () => {
    api.get('/admin/courses').then((r) => setCourses(r.data)).catch(() => {});
    api.get('/admin/lecturers').then((r) => setLecturers(r.data)).catch(() => {});
  };

  const fetchPapers = () => {
    const params = {};
    if (filters.course_id) params.course_id = filters.course_id;
    if (filters.lecturer_id) params.lecturer_id = filters.lecturer_id;
    if (filters.semester) params.semester = filters.semester;
    api.get('/admin/papers', { params }).then((r) => setPapers(r.data)).catch(() => {});
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    fetchPapers();
  }, [filters.course_id, filters.lecturer_id, filters.semester]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return papers.filter((p) =>
      p.name?.toLowerCase().includes(q)
      || p.code?.toLowerCase().includes(q)
      || p.course_name?.toLowerCase().includes(q)
      || p.lecturer_name?.toLowerCase().includes(q)
    );
  }, [papers, search]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c._id === form.course_id) || null,
    [courses, form.course_id]
  );

  const selectedFilterCourse = useMemo(
    () => courses.find((c) => c._id === filters.course_id) || null,
    [courses, filters.course_id]
  );

  const filteredLecturers = useMemo(() => {
    if (!filters.course_id) return lecturers;
    return lecturers.filter((l) => (l.assigned_course_ids || []).includes(filters.course_id));
  }, [lecturers, filters.course_id]);

  const formLecturers = useMemo(() => {
    if (!form.course_id) return lecturers;
    return lecturers.filter((l) => (l.assigned_course_ids || []).includes(form.course_id));
  }, [lecturers, form.course_id]);

  const formSemesterOptions = useMemo(() => {
    const durationYears = Number(selectedCourse?.course_duration || 0);
    const maxSemesters = durationYears > 0 ? durationYears * 2 : 0;
    if (maxSemesters <= 0) return [];
    return Array.from({ length: maxSemesters }, (_, i) => i + 1);
  }, [selectedCourse]);

  const filterSemesterOptions = useMemo(() => {
    const durationYears = Number(selectedFilterCourse?.course_duration || 0);
    const maxSemesters = durationYears > 0 ? durationYears * 2 : 0;
    if (maxSemesters <= 0) return [];
    return Array.from({ length: maxSemesters }, (_, i) => i + 1);
  }, [selectedFilterCourse]);

  useEffect(() => {
    if (!form.course_id && form.semester) {
      setForm((prev) => ({ ...prev, semester: '' }));
      return;
    }

    if (formSemesterOptions.length === 0 || !form.semester) return;
    if (!formSemesterOptions.includes(Number(form.semester))) {
      setForm((prev) => ({ ...prev, semester: '' }));
    }
  }, [form.course_id, form.semester, formSemesterOptions]);

  useEffect(() => {
    if (!filters.course_id && filters.semester) {
      setFilters((prev) => ({ ...prev, semester: '' }));
      return;
    }

    if (!filters.semester || filterSemesterOptions.length === 0) return;
    if (!filterSemesterOptions.includes(Number(filters.semester))) {
      setFilters((prev) => ({ ...prev, semester: '' }));
    }
  }, [filters.course_id, filters.semester, filterSemesterOptions]);

  useEffect(() => {
    if (!form.lecturer_id || formLecturers.length === 0 || !form.course_id) return;
    const isAllowed = formLecturers.some((l) => l._id === form.lecturer_id);
    if (!isAllowed) {
      setForm((prev) => ({ ...prev, lecturer_id: '' }));
    }
  }, [form.course_id, form.lecturer_id, formLecturers]);

  const handleAdd = async () => {
    try {
      await api.post('/admin/papers', form);
      toast.success('Subject created');
      setShowAdd(false);
      setForm(EMPTY_FORM);
      fetchPapers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const openEdit = (paper) => {
    setEditingPaper(paper);
    setForm({
      name: paper.name || '',
      code: paper.code || '',
      course_id: paper.course_id || '',
      lecturer_id: paper.lecturer_id || '',
      semester: String(paper.semester || ''),
    });
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    if (!editingPaper) return;
    try {
      await api.put(`/admin/papers/${editingPaper._id}`, form);
      toast.success('Subject updated');
      setShowEdit(false);
      setEditingPaper(null);
      setForm(EMPTY_FORM);
      fetchPapers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update subject');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this subject?')) return;
    try {
      await api.delete(`/admin/papers/${id}`);
      toast.success('Deleted');
      fetchPapers();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const PaperForm = ({ onSubmit, submitLabel }) => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Name</label>
          <input className="input-field" placeholder="Data Structures" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Code</label>
          <input className="input-field" placeholder="CS201" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Course</label>
          <select
            className="input-field"
            value={form.course_id}
            onChange={(e) => setForm({ ...form, course_id: e.target.value, semester: '', lecturer_id: '' })}
          >
            <option value="">Select course</option>
            {courses.map((c) => <option key={c._id} value={c._id}>{c.name} ({c.code})</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Semester</label>
          <select
            className="input-field"
            value={form.semester}
            onChange={(e) => setForm({ ...form, semester: e.target.value })}
            disabled={!form.course_id || formSemesterOptions.length === 0}
          >
            <option value="">{form.course_id ? 'Select semester' : 'Select course first'}</option>
            {formSemesterOptions.map((s) => <option key={s} value={s}>Semester {s}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Lecturer</label>
        <select className="input-field" value={form.lecturer_id} onChange={(e) => setForm({ ...form, lecturer_id: e.target.value })}>
          <option value="">Unassigned</option>
          {formLecturers.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
        </select>
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
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Papers</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{papers.length} papers in current filter</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }}>
          <HiOutlinePlus size={16} /> Add Subject
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative' }}>
          <HiOutlineSearch size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="search-input" placeholder="Search by name/code/course/lecturer..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          className="input-field"
          value={filters.course_id}
          onChange={(e) => setFilters({
            ...filters,
            course_id: e.target.value,
            semester: '',
            lecturer_id: '',
          })}
        >
          <option value="">All Courses</option>
          {courses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <select
          className="input-field"
          value={filters.semester}
          onChange={(e) => setFilters({ ...filters, semester: e.target.value })}
          disabled={!filters.course_id || filterSemesterOptions.length === 0}
        >
          <option value="">{filters.course_id ? 'All Semesters' : 'Select Course First'}</option>
          {filterSemesterOptions.map((s) => <option key={s} value={s}>Semester {s}</option>)}
        </select>
        <select className="input-field" value={filters.lecturer_id} onChange={(e) => setFilters({ ...filters, lecturer_id: e.target.value })}>
          <option value="">All Lecturers</option>
          {filteredLecturers.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
        </select>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Course</th>
              <th>Lecturer</th>
              <th>Semester</th>
              <th>Classes Held</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p._id}>
                <td><span className="badge badge-purple">{p.code}</span></td>
                <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{p.name}</td>
                <td>{p.course_name || 'Unassigned'}</td>
                <td>{p.lecturer_name || 'Unassigned'}</td>
                <td>{p.semester ? `Semester ${p.semester}` : 'N/A'}</td>
                <td>{p.total_classes}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="icon-btn" title="Edit" onClick={() => openEdit(p)}><HiOutlinePencil size={15} /></button>
                    <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(p._id)}><HiOutlineTrash size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No papers found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Subject" width={520}>
        {PaperForm({ onSubmit: handleAdd, submitLabel: 'Create Subject' })}
      </Modal>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Subject" width={520}>
        {PaperForm({ onSubmit: handleUpdate, submitLabel: 'Save Changes' })}
      </Modal>
    </motion.div>
  );
}
