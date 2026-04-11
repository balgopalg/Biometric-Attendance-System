import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import { formatCourseName } from '../../utils/courseDisplay';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlinePlus, HiOutlineSearch, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';

const EMPTY_FORM = { name: '', code: '', department: '', course_duration: '' };
const PAGE_SIZE = 10;

export default function ManageCourses() {
  const [courses, setCourses] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [totalCourses, setTotalCourses] = useState(0);
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [search, setSearch] = useState('');
  const [durationFilter, setDurationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [reassignForm, setReassignForm] = useState({
    from_course_id: '',
    to_course_id: '',
    move_students: true,
    move_papers: true,
  });

  const fetchMetadata = () => {
    api.get('/admin/courses').then((r) => setAllCourses(r.data)).catch(() => {});
  };

  const fetchCourses = (nextPage = 1) => {
    const params = {};
    params.page = nextPage;
    params.per_page = PAGE_SIZE;
    if (search) params.q = search;
    if (durationFilter) params.course_duration = durationFilter;
    if (statusFilter) params.status = statusFilter;
    api.get('/admin/courses', { params }).then((r) => {
      const items = Array.isArray(r.data?.items) ? r.data.items : (Array.isArray(r.data) ? r.data : []);
      const resolvedTotal = Number(r.data?.total || items.length || 0);
      const maxPage = Math.max(1, Math.ceil(resolvedTotal / PAGE_SIZE));
      if (resolvedTotal > 0 && nextPage > maxPage) {
        fetchCourses(maxPage);
        return;
      }
      setCourses(items);
      setTotalCourses(resolvedTotal);
      setPage(Number(r.data?.page || nextPage));
    }).catch(() => {});
  };

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    fetchCourses(1);
  }, [durationFilter, statusFilter, search]);

  const filtered = courses;

  const activeCourses = useMemo(
    () => allCourses.filter((c) => String(c.status || 'active').toLowerCase() === 'active'),
    [allCourses]
  );

  const inactiveCourses = useMemo(
    () => allCourses.filter((c) => String(c.status || 'active').toLowerCase() !== 'active'),
    [allCourses]
  );

  const reassignTargetCourses = useMemo(
    () => activeCourses.filter((c) => c._id !== reassignForm.from_course_id),
    [activeCourses, reassignForm.from_course_id]
  );

  const handleAdd = async () => {
    try {
      await api.post('/admin/courses', form);
      toast.success('Course created');
      setShowAdd(false);
      setForm(EMPTY_FORM);
      fetchMetadata();
      fetchCourses(1);
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
      fetchMetadata();
      fetchCourses(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update course');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Mark this course inactive? Linked students/subjects will become read-only.')) return;
    try {
      const res = await api.delete(`/admin/courses/${id}`);
      const detachedCount = Number(res.data?.detached_lecturer_assignments || 0);
      toast.success(`Course marked inactive. Removed ${detachedCount} lecturer subject assignment(s).`);
      fetchMetadata();
      fetchCourses(1);
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleReactivate = async (id) => {
    try {
      await api.put(`/admin/courses/${id}`, { status: 'active' });
      toast.success('Course reactivated');
      fetchMetadata();
      fetchCourses(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reactivate');
    }
  };

  const openReassign = (fromCourseId = '') => {
    setReassignForm({
      from_course_id: fromCourseId,
      to_course_id: '',
      move_students: true,
      move_papers: true,
    });
    setShowReassign(true);
  };

  const handleReassign = async () => {
    if (!reassignForm.from_course_id || !reassignForm.to_course_id) {
      toast.error('Select both source and target course');
      return;
    }
    if (!reassignForm.move_students && !reassignForm.move_papers) {
      toast.error('Select at least one entity type to move');
      return;
    }

    try {
      const res = await api.post('/admin/courses/reassign', reassignForm);
      const movedStudents = Number(res.data?.moved_students || 0);
      const movedPapers = Number(res.data?.moved_papers || 0);
      toast.success(`Reassigned successfully (students: ${movedStudents}, subjects: ${movedPapers})`);
      setShowReassign(false);
      fetchMetadata();
      fetchCourses(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reassign');
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
    <motion.div className="admin-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' } }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Courses</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{totalCourses} courses in current filter</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }}>
          <HiOutlinePlus size={16} /> Add Course
        </button>
      </div>

      {inactiveCourses.length > 0 && (
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={() => openReassign('')}>
            Reassign Inactive Course Data
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
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
        <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
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
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c._id}>
                <td><span className="badge badge-info">{c.code}</span></td>
                <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{formatCourseName(c.name, { status: c.status })}</td>
                <td>{c.department || 'N/A'}</td>
                <td>{c.course_duration ? `${c.course_duration} year${c.course_duration > 1 ? 's' : ''}` : 'N/A'}</td>
                <td>
                  <span className={`badge ${String(c.status || 'active').toLowerCase() === 'active' ? 'badge-success' : 'badge-warning'}`}>
                    {String(c.status || 'active').toLowerCase()}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="icon-btn" title="Edit" onClick={() => openEdit(c)}><HiOutlinePencil size={15} /></button>
                    {String(c.status || 'active').toLowerCase() === 'active' ? (
                      <button className="icon-btn danger" title="Mark Inactive" onClick={() => handleDelete(c._id)}><HiOutlineTrash size={15} /></button>
                    ) : (
                      <>
                        <button className="icon-btn" title="Reassign" onClick={() => openReassign(c._id)}>R</button>
                        <button className="icon-btn" title="Reactivate" onClick={() => handleReactivate(c._id)}><HiOutlinePlus size={15} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No courses found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={totalCourses} perPage={PAGE_SIZE} onPageChange={fetchCourses} />

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Course" width={500}>
        {CourseForm({ onSubmit: handleAdd, submitLabel: 'Create Course' })}
      </Modal>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Course" width={500}>
        {CourseForm({ onSubmit: handleUpdate, submitLabel: 'Save Changes' })}
      </Modal>

      <Modal isOpen={showReassign} onClose={() => setShowReassign(false)} title="Reassign Course Data" width={520}>
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Move students and/or subjects from an inactive course to an active one.
          </p>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>From (Inactive Course)</label>
            <select
              className="input-field"
              value={reassignForm.from_course_id}
              onChange={(e) => setReassignForm({ ...reassignForm, from_course_id: e.target.value, to_course_id: '' })}
            >
              <option value="">Select source course</option>
              {inactiveCourses.map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })} ({c.code})</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>To (Active Course)</label>
            <select
              className="input-field"
              value={reassignForm.to_course_id}
              onChange={(e) => setReassignForm({ ...reassignForm, to_course_id: e.target.value })}
              disabled={!reassignForm.from_course_id}
            >
              <option value="">Select target course</option>
              {reassignTargetCourses.map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })} ({c.code})</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 14 }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={reassignForm.move_students}
                onChange={(e) => setReassignForm({ ...reassignForm, move_students: e.target.checked })}
              />
              Move students
            </label>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={reassignForm.move_papers}
                onChange={(e) => setReassignForm({ ...reassignForm, move_papers: e.target.checked })}
              />
              Move subjects
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button className="btn-secondary" onClick={() => setShowReassign(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleReassign}>Reassign</button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
