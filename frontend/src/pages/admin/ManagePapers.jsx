import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import useAdminPreference from '../../hooks/useAdminPreference';
import { formatCourseName } from '../../utils/courseDisplay';
import Modal from '../../components/ui/Modal';
import SoftLockWrapper from '../../components/ui/SoftLockWrapper';
import Pagination from '../../components/ui/Pagination';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlinePlus, HiOutlineSearch, HiOutlineTrash, HiOutlinePencil } from 'react-icons/hi';

const EMPTY_FORM = { name: '', code: '', course_id: '', lecturer_id: '', semester: '' };
const PAGE_SIZE = 10;

export default function ManagePapers() {
  const [papers, setPapers] = useState([]);
  const [totalPapers, setTotalPapers] = useState(0);
  const [page, setPage] = useState(1);
  const [courses, setCourses] = useState([]);
  const [lecturers, setLecturers] = useState([]);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingPaper, setEditingPaper] = useState(null);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ course_id: '', lecturer_id: '', semester: '' });
  const [showInactiveRows, setShowInactiveRows] = useAdminPreference('show_inactive_faded_rows', true);

  const [form, setForm] = useState(EMPTY_FORM);

  const fetchMetadata = () => {
    api.get('/admin/courses').then((r) => setCourses(r.data)).catch(() => {});
    api.get('/admin/lecturers').then((r) => setLecturers(r.data)).catch(() => {});
  };

  const fetchPapers = (nextPage = 1) => {
    const params = {};
    params.page = nextPage;
    params.per_page = PAGE_SIZE;
    if (search) params.q = search;
    if (filters.course_id) params.course_id = filters.course_id;
    if (filters.lecturer_id) params.lecturer_id = filters.lecturer_id;
    if (filters.semester) params.semester = filters.semester;
    api.get('/admin/papers', { params }).then((r) => {
      const items = Array.isArray(r.data?.items) ? r.data.items : (Array.isArray(r.data) ? r.data : []);
      const resolvedTotal = Number(r.data?.total || items.length || 0);
      const maxPage = Math.max(1, Math.ceil(resolvedTotal / PAGE_SIZE));
      if (resolvedTotal > 0 && nextPage > maxPage) {
        fetchPapers(maxPage);
        return;
      }
      setPapers(items);
      setTotalPapers(resolvedTotal);
      setPage(Number(r.data?.page || nextPage));
    }).catch(() => {});
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    fetchPapers(1);
  }, [filters.course_id, filters.lecturer_id, filters.semester, search]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c._id === form.course_id) || null,
    [courses, form.course_id]
  );

  const selectedFilterCourse = useMemo(
    () => courses.find((c) => c._id === filters.course_id) || null,
    [courses, filters.course_id]
  );

  const isInactiveCourseSelected = useMemo(
    () => String(selectedFilterCourse?.status || 'active').toLowerCase() !== 'active',
    [selectedFilterCourse]
  );

  const effectiveShowInactiveRows = showInactiveRows || isInactiveCourseSelected;

  const filtered = useMemo(
    () => (effectiveShowInactiveRows ? papers : papers.filter((p) => !p.is_course_inactive)),
    [papers, effectiveShowInactiveRows]
  );

  const filteredLecturers = useMemo(() => {
    if (!filters.course_id) return lecturers;
    return lecturers.filter((l) => (l.assigned_course_ids || []).includes(filters.course_id));
  }, [lecturers, filters.course_id]);

  const formLecturers = useMemo(() => {
    if (!form.course_id) return lecturers;
    const linkedLecturers = lecturers.filter((l) => (l.assigned_course_ids || []).includes(form.course_id));
    return linkedLecturers.length > 0 ? linkedLecturers : lecturers;
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

  const activeCourses = useMemo(
    () => courses.filter((c) => String(c.status || 'active').toLowerCase() === 'active'),
    [courses]
  );

  const visibleCourses = showInactiveRows ? courses : activeCourses;

  useEffect(() => {
    if (showInactiveRows) return;
    if (filters.course_id && !activeCourses.some((course) => course._id === filters.course_id)) {
      setFilters((prev) => ({ ...prev, course_id: '', semester: '', lecturer_id: '' }));
    }
  }, [activeCourses, filters.course_id, showInactiveRows]);

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
    if (!form.lecturer_id) {
      toast.error('Please assign a lecturer');
      return;
    }
    try {
      await api.post('/admin/papers', form);
      toast.success('Subject created');
      setShowAdd(false);
      setForm(EMPTY_FORM);
      fetchPapers(1);
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
      fetchPapers(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update subject');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this subject?')) return;
    try {
      await api.delete(`/admin/papers/${id}`);
      toast.success('Deleted');
      fetchPapers(1);
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
            {activeCourses.map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })} ({c.code})</option>)}
          </select>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
            Pick any lecturer. Course-linked filtering is used only when available.
          </p>
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
          <option value="">Select lecturer</option>
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
    <motion.div className="admin-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' } }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Papers</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{totalPapers} papers in current filter</p>
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
          {visibleCourses.map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })}</option>)}
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

      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={showInactiveRows}
            onChange={(e) => setShowInactiveRows(e.target.checked)}
          />
          Show faded rows (inactive-course subjects)
        </label>
      </div>

      {!showInactiveRows && isInactiveCourseSelected && (
        <div className="glass-card" style={{ padding: '10px 12px', marginBottom: 12, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Showing subjects for selected inactive course.
        </div>
      )}

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
              <tr key={p._id} className={p.is_course_inactive ? 'faded-entity' : ''}>
                <td><span className="badge badge-purple">{p.code}</span></td>
                <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{p.name}</td>
                <td>{p.course_name ? formatCourseName(p.course_name, { isInactive: p.is_course_inactive }) : 'Unassigned'}</td>
                <td>{p.lecturer_name || 'Unassigned'}</td>
                <td>{p.semester ? `Semester ${p.semester}` : 'N/A'}</td>
                <td>{p.total_classes}</td>
                <td>
                  <SoftLockWrapper locked={p.is_course_inactive} title="Locked: course inactive">
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="icon-btn" title={p.is_course_inactive ? 'Locked: course inactive' : 'Edit'} onClick={() => openEdit(p)} disabled={p.is_course_inactive}><HiOutlinePencil size={15} /></button>
                      <button className="icon-btn danger" title={p.is_course_inactive ? 'Locked: course inactive' : 'Delete'} onClick={() => handleDelete(p._id)} disabled={p.is_course_inactive}><HiOutlineTrash size={15} /></button>
                    </div>
                  </SoftLockWrapper>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No papers found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={totalPapers} perPage={PAGE_SIZE} onPageChange={fetchPapers} />

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Subject" width={520}>
        {PaperForm({ onSubmit: handleAdd, submitLabel: 'Create Subject' })}
      </Modal>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Subject" width={520}>
        {PaperForm({ onSubmit: handleUpdate, submitLabel: 'Save Changes' })}
      </Modal>
    </motion.div>
  );
}
