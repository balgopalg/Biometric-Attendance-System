import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import StatePanel from '../../components/ui/StatePanel';
import { formatCourseName } from '../../utils/courseDisplay';
import { exportToExcel, exportToCSV, EXPORT_COLUMN_PRESETS } from '../../utils/excelExport';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlinePlus, HiOutlineSearch, HiOutlinePencil, HiOutlineTrash, HiOutlineFilter, HiOutlineDownload } from 'react-icons/hi';
import { useAuth } from '../../hooks/useAuth';

const EMPTY_FORM = { name: '', code: '', department: '', course_duration: '' };
const PAGE_SIZE = 10;

const extractItems = (data) => (Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []));
export default function ManageCourses() {
  const { isSuperAdmin, isDepartmentAdmin, departmentId, departmentName } = useAuth();
  const [departments, setDepartments] = useState([]);

  const [courses, setCourses] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [totalCourses, setTotalCourses] = useState(0);
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ department_id: '', duration: '', status: '' });
  const [form, setForm] = useState(EMPTY_FORM);
  const [reassignForm, setReassignForm] = useState({
    from_course_id: '',
    to_course_id: '',
    move_students: true,
    move_papers: true,
  });
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [coursesError, setCoursesError] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [exportingCourses, setExportingCourses] = useState(false);

  // Fetch departments for Super Admin
  const fetchDepartments = () => {
    api.get('/admin/departments').then((r) => setDepartments(Array.isArray(r.data) ? r.data : [])).catch(() => setDepartments([]));
  };

  const fetchMetadata = () => {
    const params = {};
    if (isSuperAdmin && filters.department_id) params.department_id = filters.department_id;
    if (isDepartmentAdmin) params.department_id = departmentId;
    api.get('/admin/courses', { params }).then((r) => setAllCourses(extractItems(r.data))).catch(() => {});
  };

  const fetchCourses = async (nextPage = 1) => {
    setLoadingCourses(true);
    setCoursesError('');
    const params = {};
    params.page = nextPage;
    params.per_page = PAGE_SIZE;
    if (search) params.q = search;
    if (filters.department_id) params.department_id = filters.department_id;
    if (filters.duration) params.course_duration = filters.duration;
    if (filters.status) params.status = filters.status;
    try {
      const r = await api.get('/admin/courses', { params });
      const items = Array.isArray(r.data?.items) ? r.data.items : (Array.isArray(r.data) ? r.data : []);
      const resolvedTotal = Number(r.data?.total || items.length || 0);
      const maxPage = Math.max(1, Math.ceil(resolvedTotal / PAGE_SIZE));
      if (resolvedTotal > 0 && nextPage > maxPage) {
        await fetchCourses(maxPage);
        return;
      }
      setCourses(items);
      setTotalCourses(resolvedTotal);
      setPage(Number(r.data?.page || nextPage));
    } catch (err) {
      setCourses([]);
      setTotalCourses(0);
      setCoursesError(err.response?.data?.error || 'Failed to load courses.');
    } finally {
      setLoadingCourses(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) fetchDepartments();
  }, [isSuperAdmin]);

  // Fetch all courses with current filters for export (no pagination)
  const fetchAllCoursesForExport = async () => {
    try {
      const all = [];
      let current = 1;
      let more = true;
      while (more) {
        const params = {};
        params.page = current;
        params.per_page = 100;
        if (search) params.q = search;
        if (filters.department_id) params.department_id = filters.department_id;
        if (filters.duration) params.course_duration = filters.duration;
        if (filters.status) params.status = filters.status;
        const r = await api.get('/admin/courses', { params });
        const items = Array.isArray(r.data?.items) ? r.data.items : (Array.isArray(r.data) ? r.data : []);
        all.push(...items);
        const total = Number(r.data?.total || items.length || 0);
        const pages = Math.max(1, Math.ceil(total / 100));
        if (current >= pages) more = false;
        else current += 1;
      }
      return all;
    } catch (err) {
      console.error('Failed to fetch all courses for export', err);
      throw new Error('Failed to fetch all courses for export');
    }
  };

  useEffect(() => {
    if (isDepartmentAdmin && departmentId) {
      setFilters((prev) => ({ ...prev, department_id: departmentId }));
    }
  }, [isDepartmentAdmin, departmentId]);

  useEffect(() => {
    fetchMetadata();
  }, [filters.department_id]);

  useEffect(() => {
    fetchCourses(1);
  }, [filters.department_id, filters.duration, filters.status, search]);

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
    if (!form.department?.trim()) {
      toast.error('Please select a department');
      return;
    }
    const matchedDepartment = departments.find((dept) => dept.name === form.department);
    try {
      await api.post('/admin/courses', {
        ...form,
        department_id: isDepartmentAdmin ? departmentId : (matchedDepartment?._id || ''),
      });
      toast.success('Course created');
      setShowAdd(false);
      setForm({ ...EMPTY_FORM, department: isDepartmentAdmin && departmentName ? departmentName : '' });
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
      setForm({ ...EMPTY_FORM, department: isDepartmentAdmin && departmentName ? departmentName : '' });
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

  const handleExportCourses = async () => {
    setExportingCourses(true);
    try {
      const all = await fetchAllCoursesForExport();
      if (all.length === 0) {
        toast.error('No courses to export');
        return;
      }

      try {
        await exportToExcel({
          data: all,
          columns: EXPORT_COLUMN_PRESETS.COURSES,
          fileName: 'Courses',
          sheetName: 'Courses',
        });
        toast.success(`Exported ${all.length} courses to Excel`);
      } catch (xlsxError) {
        if (xlsxError.message.includes('xlsx')) {
          exportToCSV({
            data: all,
            columns: EXPORT_COLUMN_PRESETS.COURSES,
            fileName: 'Courses',
          });
          toast.success(`Exported ${all.length} courses to CSV`);
        } else {
          throw xlsxError;
        }
      }
    } catch (err) {
      toast.error(err.message || 'Failed to export courses');
    } finally {
      setExportingCourses(false);
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
        {isSuperAdmin ? (
          <select className="input-field" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
            <option value="">Select department</option>
            {departments.map((dept) => (
              <option key={dept._id} value={dept.name}>{dept.name} ({dept.code})</option>
            ))}
            {form.department && !departments.some((dept) => dept.name === form.department) ? (
              <option value={form.department}>{form.department}</option>
            ) : null}
          </select>
        ) : (
          <input className="input-field" value={departmentName || form.department} readOnly disabled />
        )}
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

  // Department options for filter
  const departmentOptions = useMemo(() => {
    if (isDepartmentAdmin && departmentName) {
      return [{ value: departmentId, label: departmentName }];
    }
    return departments.map((d) => ({ value: d._id, label: d.name }));
  }, [departments]);

  if (!loadingCourses && coursesError) {
    return (
      <div className="admin-page">
        <StatePanel variant="error" title="Unable to load courses" description={coursesError} actionLabel="Retry" onAction={() => fetchCourses(page)} compact />
      </div>
    );
  }

  return (
    <div className="admin-page">

      <div className="courses-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Courses</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{totalCourses} courses in current filter</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={handleExportCourses} disabled={totalCourses === 0 || exportingCourses} title="Export all filtered courses to Excel">
            <HiOutlineDownload size={16} /> {exportingCourses ? 'Exporting...' : `Export (${totalCourses})`}
          </button>
          <button className="btn-primary" onClick={() => { setForm({ ...EMPTY_FORM, department: isDepartmentAdmin && departmentName ? departmentName : '' }); setShowAdd(true); }}>
            <HiOutlinePlus size={16} /> Add Course
          </button>
        </div>
      </div>

      <div className="mobile-filters-toggle-wrap courses-mobile-filters-toggle-wrap">
        <button
          className="icon-btn mobile-filters-icon-btn"
          type="button"
          title={showMobileFilters ? 'Hide filters' : 'Show filters'}
          aria-label={showMobileFilters ? 'Hide filters' : 'Show filters'}
          aria-expanded={showMobileFilters}
          onClick={() => setShowMobileFilters((prev) => !prev)}
        >
          <HiOutlineFilter size={18} />
        </button>
      </div>

      {inactiveCourses.length > 0 && (
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={() => openReassign('')}>
            Reassign Inactive Course Data
          </button>
        </div>
      )}

      <div className={`courses-filter-grid ${showMobileFilters ? 'is-mobile-open' : ''}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative' }}>
          <HiOutlineSearch size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="search-input"
            placeholder="Search by name, code, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Department Filter */}
        <select
          className="input-field"
          value={filters.department_id}
          onChange={(e) => {
            setFilters({ department_id: e.target.value, duration: '', status: '' });
          }}
          disabled={isDepartmentAdmin}
        >
          <option value="">{isDepartmentAdmin ? (departmentName || 'Department') : 'All Departments'}</option>
          {departmentOptions.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>

        <select className="input-field" value={filters.duration} onChange={(e) => setFilters({ ...filters, duration: e.target.value })}>
          <option value="">All Durations</option>
          {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}
        </select>
        <select className="input-field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="glass-card">
        {loadingCourses ? (
          <StatePanel variant="loading" title="Loading courses" description="Fetching course records and filters." compact />
        ) : null}

        {!loadingCourses && coursesError ? (
          <StatePanel variant="error" title="Unable to load courses" description={coursesError} actionLabel="Retry" onAction={() => fetchCourses(page)} compact />
        ) : null}

        {!loadingCourses && !coursesError && filtered.length === 0 ? (
          <StatePanel variant="empty" title="No courses found" description="Try changing filters or add a new course." compact />
        ) : null}

        {!loadingCourses && !coursesError && filtered.length > 0 ? (
          <div className="table-scroll courses-table-scroll">
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
                    <div className="courses-row-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
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
            </tbody>
          </table>
          </div>
        ) : null}
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
    </div>
  );
}
