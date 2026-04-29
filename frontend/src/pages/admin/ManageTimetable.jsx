import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineCalendar, HiOutlineFilter, HiOutlinePencil, HiOutlineRefresh, HiOutlineTrash, HiOutlineDownload, HiOutlineEye, HiOutlineCheck } from 'react-icons/hi';
import toast from 'react-hot-toast';

import api from '../../api/axios';
import Modal from '../../components/ui/Modal';
import StatePanel from '../../components/ui/StatePanel';
import WeeklyTimetableGrid from '../../components/timetable/WeeklyTimetableGrid';
import { useAuth } from '../../hooks/useAuth';
import { formatCourseName } from '../../utils/courseDisplay';

const CREATE_DEFAULTS = {
  department_id: '',
  course_id: '',
  academic_session: '',
  semester: '',
  max_classes_per_day: '',
  class_duration_minutes: '60',
  class_start_time: '09:00',
  class_end_time: '16:00',
  recess_start_time: '12:30',
  recess_end_time: '13:00',
  status: 'draft',
};

const FILTER_DEFAULTS = {
  department_id: '',
  course_id: '',
  academic_session: '',
  semester: '',
  status: '',
};

const createFormSignature = (form) => ([
  form.department_id || '',
  form.course_id || '',
  form.academic_session || '',
  form.semester || '',
  form.max_classes_per_day || '',
  form.class_duration_minutes || '',
  form.class_start_time || '',
  form.class_end_time || '',
  form.recess_start_time || '',
  form.recess_end_time || '',
  form.status || 'draft',
].join('|'));

export default function ManageTimetable() {
  const { isDepartmentAdmin, departmentId, departmentName } = useAuth();

  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);

  const [filters, setFilters] = useState(() => ({
    ...FILTER_DEFAULTS,
    department_id: isDepartmentAdmin ? String(departmentId || '') : '',
  }));
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [filterAcademicSessions, setFilterAcademicSessions] = useState([]);
  const [filterSemesters, setFilterSemesters] = useState([]);

  const [timetables, setTimetables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(() => ({
    ...CREATE_DEFAULTS,
    department_id: isDepartmentAdmin ? String(departmentId || '') : '',
  }));
  const [createCourses, setCreateCourses] = useState([]);
  const [createAcademicSessions, setCreateAcademicSessions] = useState([]);
  const [createSemesters, setCreateSemesters] = useState([]);
  const [createMaxClassOptions, setCreateMaxClassOptions] = useState([]);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [createConflictRetry, setCreateConflictRetry] = useState(null);

  const [editingPaperOptions, setEditingPaperOptions] = useState([]);
  const [isEditModeInView, setIsEditModeInView] = useState(false);
  const [slotEditor, setSlotEditor] = useState(null);
  const [slotEditorTargetKey, setSlotEditorTargetKey] = useState('');
  const [slotEditorPaperId, setSlotEditorPaperId] = useState('');
  const [savingSlotEdit, setSavingSlotEdit] = useState(false);

  const [selectedTimetable, setSelectedTimetable] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const timetableExportRef = useRef(null);

  const loadDepartments = async () => {
    if (isDepartmentAdmin) {
      setDepartments(departmentId ? [{ _id: departmentId, name: departmentName || 'Department' }] : []);
      return;
    }

    try {
      const res = await api.get('/admin/departments');
      setDepartments(Array.isArray(res.data) ? res.data : []);
    } catch {
      setDepartments([]);
    }
  };

  const loadCoursesForDepartment = async (depId, setter) => {
    if (!depId) {
      setter([]);
      return;
    }
    try {
      const res = await api.get('/admin/courses', { params: { department_id: depId } });
      const items = Array.isArray(res.data?.items) ? res.data.items : (Array.isArray(res.data) ? res.data : []);
      setter(items);
    } catch {
      setter([]);
    }
  };

  const loadTimetables = async () => {
    if (!filters.department_id && !isDepartmentAdmin) {
      setTimetables([]);
      setSelectedTimetable(null);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = {
        include_slots: false,
      };
      if (filters.department_id) params.department_id = filters.department_id;
      if (filters.course_id) params.course_id = filters.course_id;
      if (filters.academic_session) params.academic_session = filters.academic_session;
      if (filters.semester) params.semester = filters.semester;
      if (filters.status) params.status = filters.status;

      const res = await api.get('/timetable/admin', { params });
      const items = Array.isArray(res.data) ? res.data : [];
      setTimetables(items);

      if (!items.length) {
        setSelectedTimetable(null);
        setShowViewModal(false);
      } else if (selectedTimetable && !items.some((it) => it._id === selectedTimetable._id)) {
        setSelectedTimetable(null);
        setShowViewModal(false);
      }
    } catch (err) {
      setTimetables([]);
      setSelectedTimetable(null);
      setError(err.response?.data?.error || 'Failed to load timetables.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTimetableDetails = async (timetableId) => {
    const params = { include_slots: true };
    if (filters.department_id) params.department_id = filters.department_id;
    if (filters.course_id) params.course_id = filters.course_id;
    if (filters.academic_session) params.academic_session = filters.academic_session;
    if (filters.semester) params.semester = filters.semester;
    if (filters.status) params.status = filters.status;

    const res = await api.get('/timetable/admin', { params });
    const fullItems = Array.isArray(res.data) ? res.data : [];
    return fullItems.find((item) => item._id === timetableId) || null;
  };

  const loadCreateAcademicMetadata = async (depId, courseId) => {
    if (!depId || !courseId) {
      setCreateAcademicSessions([]);
      setCreateSemesters([]);
      return;
    }

    try {
      const res = await api.get('/timetable/academic-sessions', {
        params: {
          department_id: depId,
          course_id: courseId,
        },
      });
      const sessions = Array.isArray(res.data?.academic_sessions) ? res.data.academic_sessions : [];
      const semesters = Array.isArray(res.data?.semester_options) ? res.data.semester_options : [];
      setCreateAcademicSessions(sessions);
      setCreateSemesters(semesters);
      setCreateForm((prev) => ({
        ...prev,
        academic_session: prev.academic_session || sessions[0] || '',
        semester: prev.semester || (semesters.length ? String(semesters[0]) : ''),
      }));
    } catch {
      setCreateAcademicSessions([]);
      setCreateSemesters([]);
    }
  };

  const loadCreateMaxClassOptions = async (depId, courseId, semester) => {
    if (!depId || !courseId || !semester) {
      setCreateMaxClassOptions([]);
      setCreateForm((prev) => ({ ...prev, max_classes_per_day: '' }));
      return;
    }

    try {
      const res = await api.get('/timetable/papers', {
        params: {
          department_id: depId,
          course_id: courseId,
          semester,
        },
      });
      const papers = Array.isArray(res.data) ? res.data : [];
      const count = papers.length;
      const options = count > 0 ? Array.from({ length: count }, (_, idx) => String(idx + 1)) : [];
      setCreateMaxClassOptions(options);
      setCreateForm((prev) => ({
        ...prev,
        max_classes_per_day: options.includes(prev.max_classes_per_day) ? prev.max_classes_per_day : (options[0] || ''),
      }));
    } catch {
      setCreateMaxClassOptions([]);
      setCreateForm((prev) => ({ ...prev, max_classes_per_day: '' }));
    }
  };

  const loadFilterAcademicMetadata = async (depId, courseId) => {
    if (!depId || !courseId) {
      setFilterAcademicSessions([]);
      setFilterSemesters([]);
      setFilters((prev) => ({ ...prev, academic_session: '', semester: '' }));
      return;
    }

    try {
      const res = await api.get('/timetable/academic-sessions', {
        params: {
          department_id: depId,
          course_id: courseId,
        },
      });
      const sessions = Array.isArray(res.data?.academic_sessions) ? res.data.academic_sessions : [];
      const semesters = Array.isArray(res.data?.semester_options) ? res.data.semester_options : [];
      setFilterAcademicSessions(sessions);
      setFilterSemesters(semesters);
      setFilters((prev) => ({
        ...prev,
        academic_session: sessions.includes(prev.academic_session) ? prev.academic_session : (sessions[0] || ''),
        semester: semesters.map(String).includes(prev.semester) ? prev.semester : (semesters.length ? String(semesters[0]) : ''),
      }));
    } catch {
      setFilterAcademicSessions([]);
      setFilterSemesters([]);
      setFilters((prev) => ({ ...prev, academic_session: '', semester: '' }));
    }
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  useEffect(() => {
    const depId = isDepartmentAdmin ? String(departmentId || '') : filters.department_id;
    if (isDepartmentAdmin && depId && depId !== filters.department_id) {
      setFilters((prev) => ({ ...prev, department_id: depId }));
      return;
    }
    loadCoursesForDepartment(depId, setCourses);
  }, [filters.department_id, isDepartmentAdmin, departmentId]);

  useEffect(() => {
    loadTimetables();
  }, [filters.department_id, filters.course_id, filters.academic_session, filters.semester, filters.status]);

  useEffect(() => {
    if (!showCreate) return;
    const depId = createForm.department_id;
    loadCoursesForDepartment(depId, setCreateCourses);
  }, [showCreate, createForm.department_id]);

  useEffect(() => {
    if (!showCreate) return;
    loadCreateAcademicMetadata(createForm.department_id, createForm.course_id);
  }, [showCreate, createForm.department_id, createForm.course_id]);

  useEffect(() => {
    if (!showCreate) return;
    loadCreateMaxClassOptions(createForm.department_id, createForm.course_id, createForm.semester);
  }, [showCreate, createForm.department_id, createForm.course_id, createForm.semester]);

  useEffect(() => {
    loadFilterAcademicMetadata(filters.department_id, filters.course_id);
  }, [filters.department_id, filters.course_id]);

  const openCreateModal = () => {
    setShowCreate(true);
    setCreateForm({
      ...CREATE_DEFAULTS,
      department_id: isDepartmentAdmin ? String(departmentId || '') : filters.department_id || '',
    });
    setCreateAcademicSessions([]);
    setCreateSemesters([]);
    setCreateMaxClassOptions([]);
    setCreateCourses([]);
    setCreateConflictRetry(null);
  };

  const handleCreateGenerate = async () => {
    if (!createForm.department_id || !createForm.course_id || !createForm.academic_session || !createForm.semester) {
      toast.error('Department, course, academic session and semester are required');
      return;
    }

    const signature = createFormSignature(createForm);
    const shouldRetryWithRandomization = createConflictRetry?.signature === signature;

    setSubmittingCreate(true);
    try {
      const res = await api.post('/timetable/admin/generate', {
        ...createForm,
        semester: Number(createForm.semester),
        max_classes_per_day: createForm.max_classes_per_day ? Number(createForm.max_classes_per_day) : undefined,
        class_duration_minutes: Number(createForm.class_duration_minutes),
        retry_on_conflict: shouldRetryWithRandomization,
        retry_attempts: shouldRetryWithRandomization ? 12 : undefined,
        randomize_seed: shouldRetryWithRandomization ? Date.now() : undefined,
      });
      const created = res?.data || null;

      toast.success('Timetable generated successfully');
      setCreateConflictRetry(null);
      setShowCreate(false);

      if (created) {
        setSelectedTimetable(created);
        setShowViewModal(true);
        setFilters((prev) => ({
          ...prev,
          department_id: created.department_id || prev.department_id,
          course_id: created.course_id || '',
          academic_session: created.academic_session || '',
          semester: created.semester ? String(created.semester) : '',
          status: '',
        }));
      }

      await loadTimetables();
    } catch (err) {
      const statusCode = err?.response?.status;
      const message = err?.response?.data?.error || 'Failed to generate timetable';
      const hasConflictPayload = Boolean(err?.response?.data?.conflicts);
      if (statusCode === 409 && hasConflictPayload) {
        setCreateConflictRetry({ signature, at: Date.now() });
        toast.error('Conflict detected. Click Generate Timetable again to retry with randomized order.');
      } else {
        setCreateConflictRetry(null);
        toast.error(message);
      }
    } finally {
      setSubmittingCreate(false);
    }
  };

  const openEditModal = async (timetableRow) => {
    try {
      const full = await fetchTimetableDetails(timetableRow._id);
      if (!full) {
        toast.error('Unable to load timetable details');
        return;
      }

      const papersRes = await api.get('/timetable/papers', {
        params: {
          department_id: full.department_id,
          course_id: full.course_id,
          semester: full.semester,
        },
      });

      const paperOptions = Array.isArray(papersRes.data) ? papersRes.data : [];
      setEditingPaperOptions(paperOptions);
      setSelectedTimetable(full);
      setIsEditModeInView(true);
      setShowViewModal(true);
    } catch {
      toast.error('Unable to open edit view');
    }
  };

  const handleRegenerate = async (timetableRow) => {
    const confirmed = window.confirm('Regenerate this timetable and overwrite its slots?');
    if (!confirmed) return;

    try {
      await api.post(`/timetable/admin/${timetableRow._id}/regenerate`, {
        class_duration_minutes: Number(createForm.class_duration_minutes || 60),
        class_start_time: createForm.class_start_time || '09:00',
        class_end_time: createForm.class_end_time || '16:00',
        recess_start_time: createForm.recess_start_time || '12:30',
        recess_end_time: createForm.recess_end_time || '13:00',
      });
      toast.success('Timetable regenerated');
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to regenerate timetable');
    }
  };

  const handleActivate = async (timetableRow) => {
    try {
      await api.patch(`/timetable/admin/${timetableRow._id}/status`, { status: 'active' });
      toast.success('Timetable activated');
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to activate timetable');
    }
  };

  const handleView = async (timetableRow) => {
    try {
      const full = await fetchTimetableDetails(timetableRow._id);
      if (!full) {
        toast.error('Unable to load timetable details');
        return;
      }
      setSelectedTimetable(full);
      setIsEditModeInView(false);
      setEditingPaperOptions([]);
      setSlotEditor(null);
      setShowViewModal(true);
    } catch {
      toast.error('Unable to view timetable');
    }
  };

  const handleOpenSlotEditor = (slot) => {
    if (!slot) return;
    const options = Array.isArray(slot.mergedOptions) && slot.mergedOptions.length ? slot.mergedOptions : [slot];
    const target = options[0];
    const targetKey = `${target.day || ''}|${target.start_time || ''}|${target.end_time || ''}`;
    setSlotEditor({ ...slot, mergedOptions: options });
    setSlotEditorTargetKey(targetKey);
    setSlotEditorPaperId(target.paper_id || '');
  };

  const activeSlotEditorOption = useMemo(() => {
    if (!slotEditor) return null;
    const options = Array.isArray(slotEditor.mergedOptions) && slotEditor.mergedOptions.length
      ? slotEditor.mergedOptions
      : [slotEditor];
    return options.find((opt) => `${opt.day || ''}|${opt.start_time || ''}|${opt.end_time || ''}` === slotEditorTargetKey) || options[0] || null;
  }, [slotEditor, slotEditorTargetKey]);

  const handleSaveSlotEdit = async () => {
    if (!selectedTimetable?._id || !activeSlotEditorOption) return;

    setSavingSlotEdit(true);
    try {
      await api.put(`/timetable/admin/${selectedTimetable._id}/slots`, {
        slots: [
          {
            slot_id: activeSlotEditorOption._id,
            day: activeSlotEditorOption.day,
            day_index: activeSlotEditorOption.day_index,
            start_time: activeSlotEditorOption.start_time,
            end_time: activeSlotEditorOption.end_time,
            start_minutes: activeSlotEditorOption.start_minutes,
            end_minutes: activeSlotEditorOption.end_minutes,
            paper_id: slotEditorPaperId || '',
          },
        ],
      });

      const refreshed = await fetchTimetableDetails(selectedTimetable._id);
      if (refreshed) {
        setSelectedTimetable(refreshed);
      }
      setSlotEditor(null);
      toast.success('Slot updated');
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update slot');
    } finally {
      setSavingSlotEdit(false);
    }
  };

  const handleDelete = async (timetableRow) => {
    const confirmed = window.confirm(`Delete this timetable (${timetableRow.course_name || 'Course'} - Semester ${timetableRow.semester || 'N/A'})?`);
    if (!confirmed) return;

    try {
      await api.delete(`/timetable/admin/${timetableRow._id}`);
      toast.success('Timetable deleted successfully');
      if (selectedTimetable?._id === timetableRow._id) {
        setSelectedTimetable(null);
        setShowViewModal(false);
      }
      await loadTimetables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete timetable');
    }
  };

  const handleExportPdf = async () => {
    if (!selectedTimetable || !timetableExportRef.current) return;
    try {
      const target = timetableExportRef.current;
      const popup = window.open('', '_blank', 'width=1200,height=900');
      if (!popup) {
        toast.error('Please allow popups to export PDF');
        return;
      }

      const linkTags = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map((node) => node.outerHTML)
        .join('\n');
      const styleTags = Array.from(document.querySelectorAll('style'))
        .map((node) => node.outerHTML)
        .join('\n');
      const theme = document.documentElement.getAttribute('data-theme');
      const clone = target.cloneNode(true);

      popup.document.open();
      popup.document.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Timetable Export</title>
            ${linkTags}
            ${styleTags}
            <style>
              @page { size: landscape; margin: 10mm; }
              html, body { margin: 0; padding: 0; background: #ffffff; }
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                color: var(--text-primary);
              }
              .timetable-print-root {
                width: max-content;
                min-width: 100%;
                padding: 14px;
                background: #ffffff;
              }
              .timetable-print-root .glass-card {
                box-shadow: none !important;
              }
              .timetable-print-root button,
              .timetable-print-root .timetable-cell-edit-btn {
                display: none !important;
              }
            </style>
          </head>
          <body>
            <div class="timetable-print-root"></div>
          </body>
        </html>
      `);
      popup.document.close();

      if (theme) {
        popup.document.documentElement.setAttribute('data-theme', theme);
      }

      const mount = popup.document.querySelector('.timetable-print-root');
      if (!mount) {
        popup.close();
        throw new Error('Unable to prepare print preview');
      }

      mount.appendChild(clone);

      const ready = popup.document.fonts?.ready;
      if (ready?.then) {
        await ready.catch(() => undefined);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));

      popup.focus();
      popup.print();
    } catch (err) {
      console.error('PDF export failed:', err);
      const errorText = err?.message ? `Failed to export PDF: ${err.message}` : 'Failed to export PDF';
      toast.error(errorText);
    }
  };

  const statusBadgeClass = (status) => {
    const value = String(status || '').toLowerCase();
    if (value === 'active') return 'badge badge-success';
    if (value === 'draft') return 'badge badge-info';
    return 'badge badge-warning';
  };

  const currentCourseOptions = useMemo(() => {
    if (!filters.department_id) return [];
    return courses;
  }, [courses, filters.department_id]);

  return (
    <div className="admin-page">
      <div className="courses-toolbar" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Manage Timetable</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 3 }}>All generated timetables are listed below.</p>
        </div>
        <button className="btn-primary" onClick={openCreateModal}>
          <HiOutlineCalendar size={16} /> Create Timetable
        </button>
      </div>

      <div className="mobile-filters-toggle-wrap" style={{ marginBottom: 8 }}>
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

      <div className="glass-card" style={{ padding: 14, marginBottom: 12 }}>
        <div className={`timetable-filter-grid ${showMobileFilters ? 'is-mobile-open' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <select
            className="input-field"
            value={filters.department_id}
            onChange={(e) => setFilters((prev) => ({ ...prev, department_id: e.target.value, course_id: '', academic_session: '', semester: '' }))}
            disabled={isDepartmentAdmin}
          >
            <option value="">{isDepartmentAdmin ? (departmentName || 'Department') : 'All Departments'}</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>

          <select
            className="input-field"
            value={filters.course_id}
            onChange={(e) => setFilters((prev) => ({ ...prev, course_id: e.target.value, academic_session: '', semester: '' }))}
            disabled={!filters.department_id}
          >
            <option value="">All Courses</option>
            {currentCourseOptions.map((c) => (
              <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })}</option>
            ))}
          </select>

          <select
            className="input-field"
            value={filters.academic_session}
            onChange={(e) => setFilters((prev) => ({ ...prev, academic_session: e.target.value }))}
            disabled={!filters.course_id}
          >
            <option value="">All Academic Sessions</option>
            {filterAcademicSessions.map((session) => (
              <option key={session} value={session}>{session}</option>
            ))}
          </select>

          <select
            className="input-field"
            value={filters.semester}
            onChange={(e) => setFilters((prev) => ({ ...prev, semester: e.target.value }))}
            disabled={!filters.course_id}
          >
            <option value="">All Semesters</option>
            {filterSemesters.map((sem) => (
              <option key={sem} value={String(sem)}>Semester {sem}</option>
            ))}
          </select>

          <select className="input-field" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {loading ? <StatePanel variant="loading" title="Loading timetables" description="Fetching generated timetable rows." compact /> : null}
      {!loading && error ? <StatePanel variant="error" title="Unable to load timetables" description={error} actionLabel="Retry" onAction={loadTimetables} compact /> : null}
      {!loading && !error && timetables.length === 0 ? <StatePanel variant="empty" title="No timetables found" description="Create your first timetable using the button above." compact /> : null}

      {!loading && !error && timetables.length > 0 ? (
        <div className="glass-card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Course</th>
                  <th>Semester</th>
                  <th>Session</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {timetables.map((row) => (
                  <tr key={row._id} style={{ background: selectedTimetable?._id === row._id ? 'var(--bg-glass)' : 'transparent' }}>
                    <td>{row.department_name || 'N/A'}</td>
                    <td>{formatCourseName(row.course_name || 'N/A', { status: row.course_status })}</td>
                    <td>Semester {row.semester || 'N/A'}</td>
                    <td>{row.academic_session || 'N/A'}</td>
                    <td><span className={statusBadgeClass(row.status)}>{row.status || 'draft'}</span></td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                        <button
                          className="btn-secondary"
                          style={{ width: 34, height: 34, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          title="View"
                          aria-label="View"
                          onClick={() => handleView(row)}
                        >
                          <HiOutlineEye size={16} />
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ width: 34, height: 34, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Edit"
                          aria-label="Edit"
                          onClick={() => openEditModal(row)}
                        >
                          <HiOutlinePencil size={16} />
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ width: 34, height: 34, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Regenerate"
                          aria-label="Regenerate"
                          onClick={() => handleRegenerate(row)}
                        >
                          <HiOutlineRefresh size={16} />
                        </button>
                        {String(row.status || '').toLowerCase() !== 'active' ? (
                          <button
                            className="btn-primary"
                            style={{ width: 34, height: 34, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Activate"
                            aria-label="Activate"
                            onClick={() => handleActivate(row)}
                          >
                            <HiOutlineCheck size={16} />
                          </button>
                        ) : null}
                        <button
                          className="btn-secondary"
                          style={{ width: 34, height: 34, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Delete"
                          aria-label="Delete"
                          onClick={() => handleDelete(row)}
                        >
                          <HiOutlineTrash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal isOpen={showViewModal && Boolean(selectedTimetable)} onClose={() => setShowViewModal(false)} title="View Timetable" width={980}>
        {selectedTimetable ? (
          <>
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {isEditModeInView ? (
                  <span className="badge badge-info" style={{ alignSelf: 'center' }}>Edit Mode</span>
                ) : null}
              </div>
              <button className="btn-secondary" onClick={handleExportPdf}>
                <HiOutlineDownload size={15} /> Export PDF
              </button>
            </div>
            <div ref={timetableExportRef} style={{ background: '#fff' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                {selectedTimetable.department_name || 'Department'} · {selectedTimetable.course_name || 'Course'} · Semester {selectedTimetable.semester || 'N/A'} · Session {selectedTimetable.academic_session || 'N/A'}
              </p>
              <WeeklyTimetableGrid
                slots={selectedTimetable.slots || []}
                title="Generated Weekly Timetable"
                recessStartTime={selectedTimetable.recess_start_time || selectedTimetable.generation_meta?.recess_start_time || ''}
                recessEndTime={selectedTimetable.recess_end_time || selectedTimetable.generation_meta?.recess_end_time || ''}
                classDurationMinutes={selectedTimetable.class_duration_minutes || selectedTimetable.generation_meta?.class_duration_minutes}
                classStartTime={selectedTimetable.class_start_time || selectedTimetable.generation_meta?.class_start_time || ''}
                classEndTime={selectedTimetable.class_end_time || selectedTimetable.generation_meta?.class_end_time || ''}
                editable={isEditModeInView}
                onEditSlot={handleOpenSlotEditor}
              />
            </div>
          </>
        ) : null}
      </Modal>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Timetable" width={720}>
        <div className="timetable-filter-grid is-mobile-open" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <select
            className="input-field"
            value={createForm.department_id}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, department_id: e.target.value, course_id: '', academic_session: '', semester: '', max_classes_per_day: '' }))}
            disabled={isDepartmentAdmin}
          >
            <option value="">{isDepartmentAdmin ? (departmentName || 'Department') : 'Select Department'}</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>

          <select
            className="input-field"
            value={createForm.course_id}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, course_id: e.target.value, academic_session: '', semester: '', max_classes_per_day: '' }))}
            disabled={!createForm.department_id}
          >
            <option value="">Select Course</option>
            {createCourses.map((c) => (
              <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })}</option>
            ))}
          </select>

          <select
            className="input-field"
            value={createForm.academic_session}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, academic_session: e.target.value }))}
            disabled={!createForm.course_id}
          >
            <option value="">Select Academic Session</option>
            {createAcademicSessions.map((session) => (
              <option key={session} value={session}>{session}</option>
            ))}
          </select>

          <select
            className="input-field"
            value={createForm.semester}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, semester: e.target.value, max_classes_per_day: '' }))}
            disabled={!createForm.course_id}
          >
            <option value="">Select Semester</option>
            {createSemesters.map((sem) => (
              <option key={sem} value={String(sem)}>Semester {sem}</option>
            ))}
          </select>

          <select
            className="input-field"
            value={createForm.max_classes_per_day}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, max_classes_per_day: e.target.value }))}
            disabled={!createForm.course_id || !createForm.semester || createMaxClassOptions.length === 0}
          >
            <option value="">Max Classes / Day</option>
            {createMaxClassOptions.map((count) => (
              <option key={count} value={count}>{count}</option>
            ))}
          </select>

          <input className="input-field" type="number" min="30" max="180" placeholder="Each Class Duration (minutes)" value={createForm.class_duration_minutes} onChange={(e) => setCreateForm((prev) => ({ ...prev, class_duration_minutes: e.target.value }))} />
          <input className="input-field" type="time" value={createForm.class_start_time} onChange={(e) => setCreateForm((prev) => ({ ...prev, class_start_time: e.target.value }))} />
          <input className="input-field" type="time" value={createForm.class_end_time} onChange={(e) => setCreateForm((prev) => ({ ...prev, class_end_time: e.target.value }))} />
          <input className="input-field" type="time" value={createForm.recess_start_time} onChange={(e) => setCreateForm((prev) => ({ ...prev, recess_start_time: e.target.value }))} />
          <input className="input-field" type="time" value={createForm.recess_end_time} onChange={(e) => setCreateForm((prev) => ({ ...prev, recess_end_time: e.target.value }))} />

          <select className="input-field" value={createForm.status} onChange={(e) => setCreateForm((prev) => ({ ...prev, status: e.target.value }))}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
          </select>
        </div>

        {createConflictRetry?.signature === createFormSignature(createForm) ? (
          <p style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--warning-700, #9a6700)' }}>
            Conflict was detected in the previous attempt. Next click will retry using randomized assignment order against current DB conflicts.
          </p>
        ) : null}

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleCreateGenerate} disabled={submittingCreate}>
            <HiOutlineCalendar size={16} />
            {' '}
            {submittingCreate
              ? 'Generating...'
              : (createConflictRetry?.signature === createFormSignature(createForm)
                ? 'Generate Timetable (Retry)'
                : 'Generate Timetable')}
          </button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(slotEditor)} onClose={() => setSlotEditor(null)} title="Edit Timetable Slot" width={460}>
        {slotEditor ? (
          <>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 10 }}>
              {activeSlotEditorOption?.day} ({activeSlotEditorOption?.start_time} - {activeSlotEditorOption?.end_time})
            </p>
            {(slotEditor.mergedOptions || []).length > 1 ? (
              <select
                className="input-field"
                style={{ marginBottom: 10 }}
                value={slotEditorTargetKey}
                onChange={(e) => {
                  const key = e.target.value;
                  setSlotEditorTargetKey(key);
                  const options = slotEditor.mergedOptions || [];
                  const target = options.find((opt) => `${opt.day || ''}|${opt.start_time || ''}|${opt.end_time || ''}` === key);
                  setSlotEditorPaperId(target?.paper_id || '');
                }}
              >
                {(slotEditor.mergedOptions || []).map((opt, idx) => {
                  const key = `${opt.day || ''}|${opt.start_time || ''}|${opt.end_time || ''}`;
                  return (
                    <option key={`${key}-${idx}`} value={key}>
                      {opt.day} ({opt.start_time} - {opt.end_time})
                    </option>
                  );
                })}
              </select>
            ) : null}
            <select
              className="input-field"
              value={slotEditorPaperId}
              onChange={(e) => setSlotEditorPaperId(e.target.value)}
            >
              <option value="">No Classes</option>
              {editingPaperOptions.map((paper) => (
                <option key={paper._id} value={paper._id}>{paper.code} - {paper.name}</option>
              ))}
            </select>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-secondary" onClick={() => setSlotEditor(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveSlotEdit} disabled={savingSlotEdit}>
                {savingSlotEdit ? 'Saving...' : 'Save'}
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
