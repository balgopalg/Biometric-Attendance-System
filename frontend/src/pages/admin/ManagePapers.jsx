import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import useAdminPreference from '../../hooks/useAdminPreference';
import { formatCourseName } from '../../utils/courseDisplay';
import { exportToExcel, exportToCSV } from '../../utils/excelExport';
import Modal from '../../components/ui/Modal';
import SoftLockWrapper from '../../components/ui/SoftLockWrapper';
import Pagination from '../../components/ui/Pagination';
import StatePanel from '../../components/ui/StatePanel';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlinePlus, HiOutlineSearch, HiOutlineTrash, HiOutlinePencil, HiOutlineDownload, HiOutlineFilter, HiOutlineDotsHorizontal, HiOutlineUpload } from 'react-icons/hi';
import { useAuth } from '../../hooks/useAuth';

const EMPTY_FORM = { name: '', code: '', department_id: '', course_id: '', lecturer_id: '', semester: '' };
const PAGE_SIZE = 10;

const extractItems = (data) => (Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []));
export default function ManagePapers() {
  const { isSuperAdmin, isDepartmentAdmin, departmentId, departmentName } = useAuth();
  const [departments, setDepartments] = useState([]);

  const [papers, setPapers] = useState([]);
  const [totalPapers, setTotalPapers] = useState(0);
  const [page, setPage] = useState(1);
  const [courses, setCourses] = useState([]);
  const [lecturers, setLecturers] = useState([]);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingPaper, setEditingPaper] = useState(null);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ department_id: '', course_id: '', lecturer_id: '', semester: '' });
  const [showInactiveRows, setShowInactiveRows] = useAdminPreference('show_inactive_faded_rows', true);

  const [form, setForm] = useState(EMPTY_FORM);
  const [loadingPapers, setLoadingPapers] = useState(false);
  const [papersError, setPapersError] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showMobileOptions, setShowMobileOptions] = useState(false);
  const [exportingPapers, setExportingPapers] = useState(false);
  const [importingPapers, setImportingPapers] = useState(false);
  const [importFile, setImportFile] = useState(null);

  // Fetch departments for Super Admin
  const fetchDepartments = () => {
    api.get('/admin/departments').then((r) => setDepartments(Array.isArray(r.data) ? r.data : [])).catch(() => setDepartments([]));
  };

  const fetchMetadata = () => {
    const params = {};
    if (isSuperAdmin && filters.department_id) params.department_id = filters.department_id;
    if (isDepartmentAdmin) params.department_id = departmentId;
    api.get('/admin/courses', { params }).then((r) => setCourses(extractItems(r.data))).catch(() => {});
    api.get('/admin/lecturers', { params }).then((r) => setLecturers(extractItems(r.data))).catch(() => {});
  };

  const fetchPapers = (nextPage = 1) => {
    setLoadingPapers(true);
    setPapersError('');
    const params = {};
    params.page = nextPage;
    params.per_page = PAGE_SIZE;
    if (search) params.q = search;
    if (filters.department_id) params.department_id = filters.department_id;
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
    }).catch((err) => {
      setPapers([]);
      setTotalPapers(0);
      setPapersError(err.response?.data?.error || 'Failed to load papers.');
    }).finally(() => setLoadingPapers(false));
  };

  useEffect(() => {
    if (isSuperAdmin) fetchDepartments();
  }, [isSuperAdmin]);

  // Fetch all papers with current filters for export (no pagination)
  const fetchAllPapersForExport = async () => {
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
        if (filters.course_id) params.course_id = filters.course_id;
        if (filters.lecturer_id) params.lecturer_id = filters.lecturer_id;
        if (filters.semester) params.semester = filters.semester;
        const r = await api.get('/admin/papers', { params });
        const items = Array.isArray(r.data?.items) ? r.data.items : (Array.isArray(r.data) ? r.data : []);
        all.push(...items);
        const total = Number(r.data?.total || items.length || 0);
        const pages = Math.max(1, Math.ceil(total / 100));
        if (current >= pages) more = false;
        else current += 1;
      }
      return all;
    } catch (err) {
      console.error('Error fetching all papers for export', err);
      throw new Error('Failed to fetch all papers for export');
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
    fetchPapers(1);
  }, [filters.department_id, filters.course_id, filters.lecturer_id, filters.semester, search]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c._id === form.course_id) || null,
    [courses, form.course_id]
  );

  const selectedFilterCourse = useMemo(
    () => courses.find((c) => c._id === filters.course_id) || null,
    [courses, filters.course_id]
  );

  const selectedFormDepartment = useMemo(
    () => departments.find((d) => d._id === form.department_id) || null,
    [departments, form.department_id]
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

  const formDepartmentCourses = useMemo(() => {
    if (!form.department_id) return activeCourses;
    const departmentNameMatch = selectedFormDepartment?.name || '';
    return activeCourses.filter((course) => String(course.department || '') === departmentNameMatch);
  }, [activeCourses, form.department_id, selectedFormDepartment]);

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
    if (!form.department_id) {
      toast.error('Please select a department');
      return;
    }
    try {
      await api.post('/admin/papers', form);
      toast.success('Paper created');
      setShowAdd(false);
      setForm({ ...EMPTY_FORM, department_id: isDepartmentAdmin && departmentId ? departmentId : '' });
      fetchPapers(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const openEdit = (paper) => {
    const paperCourse = courses.find((course) => course._id === paper.course_id) || null;
    const paperDepartment = departments.find((dept) => dept.name === (paperCourse?.department || '')) || null;
    setEditingPaper(paper);
    setForm({
      name: paper.name || '',
      code: paper.code || '',
      department_id: paperDepartment?._id || paper.department_id || '',
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
      toast.success('Paper updated');
      setShowEdit(false);
      setEditingPaper(null);
      setForm({ ...EMPTY_FORM, department_id: isDepartmentAdmin && departmentId ? departmentId : '' });
      fetchPapers(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update paper');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this paper?')) return;
    try {
      await api.delete(`/admin/papers/${id}`);
      toast.success('Deleted');
      fetchPapers(1);
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleExportPapers = async () => {
    setExportingPapers(true);
    try {
      const all = await fetchAllPapersForExport();
      if (all.length === 0) {
        toast.error('No papers to export');
        return;
      }

      const exportData = all.map((p) => ({
        name: p.name || '',
        code: p.code || '',
        course: p.course_name || '',
        semester: p.semester || '',
        lecturer: p.lecturer_name || '',
        status: p.is_course_inactive ? 'Inactive Course' : 'Active',
      }));

      try {
        await exportToExcel({
          data: exportData,
          columns: [
            { key: 'name', header: 'Paper Name' },
            { key: 'code', header: 'Code' },
            { key: 'course', header: 'Course' },
            { key: 'semester', header: 'Semester' },
            { key: 'lecturer', header: 'Lecturer' },
            { key: 'status', header: 'Status' },
          ],
          fileName: 'Papers',
          sheetName: 'Papers',
        });
        toast.success(`Exported ${all.length} papers to Excel`);
      } catch (xlsxError) {
        if (xlsxError.message.includes('xlsx')) {
          exportToCSV({
            data: exportData,
            columns: [
              { key: 'name', header: 'Paper Name' },
              { key: 'code', header: 'Code' },
              { key: 'course', header: 'Course' },
              { key: 'semester', header: 'Semester' },
              { key: 'lecturer', header: 'Lecturer' },
              { key: 'status', header: 'Status' },
            ],
            fileName: 'Papers',
          });
          toast.success(`Exported ${all.length} papers to CSV`);
        } else {
          throw xlsxError;
        }
      }
    } catch (err) {
      toast.error(err.message || 'Failed to export papers');
    } finally {
      setExportingPapers(false);
    }
  };

  const handleOpenImportModal = () => {
    setImportFile(null);
    setShowImport(true);
  };

  const _pickField = (row, keys) => {
    const entries = Object.entries(row || {});
    for (const key of keys) {
      const normalizedNeedle = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
      const found = entries.find(([header]) => String(header).toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedNeedle);
      if (found && String(found[1] || '').trim()) {
        return String(found[1]).trim();
      }
    }
    return '';
  };

  const handleImportPapers = async () => {
    const file = importFile;
    if (!file) return;

    setImportingPapers(true);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) {
        toast.error('The selected file has no sheets');
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!rows.length) {
        toast.error('No rows found in the sheet');
        return;
      }

      const courseByCode = new Map(courses.map((course) => [String(course.code || '').toLowerCase(), course]));
      const courseByName = new Map(courses.map((course) => [String(course.name || '').toLowerCase(), course]));
      const lecturerByEmail = new Map(lecturers.map((lec) => [String(lec.email || '').toLowerCase(), lec]));
      const lecturerByName = new Map(lecturers.map((lec) => [String(lec.name || '').toLowerCase(), lec]));

      let created = 0;
      const failures = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const rowNo = index + 2;
        const name = _pickField(row, ['name', 'papername', 'paper']);
        const code = _pickField(row, ['code', 'papercode']);
        const courseRef = _pickField(row, ['course', 'coursename', 'coursecode']);
        const semesterRaw = _pickField(row, ['semester', 'sem']);
        const lecturerRef = _pickField(row, ['lecturer', 'lecturername', 'lectureremail']);

        if (!name || !code || !courseRef || !semesterRaw) {
          failures.push(`Row ${rowNo}: name, code, course, semester are required`);
          continue;
        }

        const semester = Number(semesterRaw);
        if (!Number.isFinite(semester) || semester <= 0) {
          failures.push(`Row ${rowNo}: semester must be a positive number`);
          continue;
        }

        const course = courseByCode.get(courseRef.toLowerCase()) || courseByName.get(courseRef.toLowerCase());
        if (!course?._id) {
          failures.push(`Row ${rowNo}: course '${courseRef}' not found`);
          continue;
        }

        let lecturerId = '';
        if (lecturerRef) {
          const lecturer = lecturerByEmail.get(lecturerRef.toLowerCase()) || lecturerByName.get(lecturerRef.toLowerCase());
          if (!lecturer?._id) {
            failures.push(`Row ${rowNo}: lecturer '${lecturerRef}' not found`);
            continue;
          }
          lecturerId = lecturer._id;
        }

        try {
          await api.post('/admin/papers', {
            name,
            code,
            course_id: course._id,
            semester,
            lecturer_id: lecturerId || '',
          });
          created += 1;
        } catch (err) {
          failures.push(`Row ${rowNo}: ${err.response?.data?.error || 'failed to create paper'}`);
        }
      }

      if (created > 0) {
        toast.success(`Imported ${created} paper${created > 1 ? 's' : ''}`);
      }

      if (failures.length > 0) {
        toast.error(`Import completed with ${failures.length} issue${failures.length > 1 ? 's' : ''}`);
        console.warn('Paper import issues:', failures);
      }

      await fetchPapers(1);
    } catch (err) {
      toast.error(err?.message || 'Failed to import papers');
    } finally {
      setImportingPapers(false);
      setImportFile(null);
      setShowImport(false);
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

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Department</label>
        {isSuperAdmin ? (
          <select
            className="input-field"
            value={form.department_id}
            onChange={(e) => setForm({ ...form, department_id: e.target.value, course_id: '', semester: '', lecturer_id: '' })}
          >
            <option value="">Select department</option>
            {departments.map((dept) => (
              <option key={dept._id} value={dept._id}>{dept.name} ({dept.code})</option>
            ))}
          </select>
        ) : (
          <input className="input-field" value={departmentName || 'Department'} readOnly disabled />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Course</label>
          <select
            className="input-field"
            value={form.course_id}
            onChange={(e) => setForm({ ...form, course_id: e.target.value, semester: '', lecturer_id: '' })}
            disabled={isSuperAdmin && !form.department_id}
          >
            <option value="">{isSuperAdmin ? (form.department_id ? 'Select course' : 'Select department first') : 'Select course'}</option>
            {(isSuperAdmin ? formDepartmentCourses : activeCourses).map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })} ({c.code})</option>)}
          </select>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
            {isSuperAdmin ? 'Choose a department first, then select one of its courses.' : 'Pick any lecturer. Course-linked filtering is used only when available.'}
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
        <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Lecturer (Optional)</label>
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

  if (!loadingPapers && papersError) {
    return (
      <div className="admin-page">
        <StatePanel variant="error" title="Unable to load papers" description={papersError} actionLabel="Retry" onAction={() => fetchPapers(page)} compact />
      </div>
    );
  }

  return (
    <div className="admin-page">

      <div className="papers-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Papers</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{totalPapers} papers in current filter</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" title="Import papers from Excel" onClick={handleOpenImportModal} disabled={importingPapers}>
            <HiOutlineUpload size={16} /> {importingPapers ? 'Importing...' : 'Import Excel'}
          </button>
          <button className="btn-secondary" title="Export all filtered papers to Excel" onClick={handleExportPapers} disabled={totalPapers === 0 || exportingPapers}>
            <HiOutlineDownload size={16} /> {exportingPapers ? 'Exporting...' : `Export (${totalPapers})`}
          </button>
          <button className="btn-primary" onClick={() => { setForm({ ...EMPTY_FORM, department_id: isDepartmentAdmin && departmentId ? departmentId : '' }); setShowAdd(true); }}>
            <HiOutlinePlus size={16} /> Add Paper
          </button>
        </div>
      </div>

      <div className="mobile-filters-toggle-wrap papers-mobile-filters-toggle-wrap">
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
        <button
          className="icon-btn mobile-filters-icon-btn"
          type="button"
          title="Options"
          aria-label="Options"
          onClick={() => setShowMobileOptions(true)}
        >
          <HiOutlineDotsHorizontal size={18} />
        </button>
      </div>

      <div className={`filter-bar papers-filter-grid ${showMobileFilters ? 'is-mobile-open' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ position: 'relative' }}>
          <HiOutlineSearch size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="search-input" style={{ maxWidth: '100%' }} placeholder="Search by name/code/course/lecturer..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* Department Filter */}
        <select
          className="input-field"
          value={filters.department_id}
          onChange={(e) => {
            setFilters({ department_id: e.target.value, course_id: '', lecturer_id: '', semester: '' });
          }}
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
          onChange={(e) => setFilters({ ...filters, course_id: e.target.value, semester: '', lecturer_id: '' })}
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

      <div className="desktop-fade-rows-control" role="group" aria-label="Faded rows visibility">
        <span>Fade Rows</span>
        <label className="rows-toggle-switch">
          <input
            type="checkbox"
            checked={showInactiveRows}
            onChange={(e) => setShowInactiveRows(e.target.checked)}
            aria-label="Toggle faded rows"
          />
          <span className="rows-toggle-track">
            <span className="rows-toggle-thumb" />
          </span>
        </label>
      </div>

      {!showInactiveRows && isInactiveCourseSelected && (
        <div className="glass-card" style={{ padding: '10px 12px', marginBottom: 12, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Showing papers for selected inactive course.
        </div>
      )}

      <div className="glass-card">
        {loadingPapers ? (
          <StatePanel variant="loading" title="Loading papers" description="Fetching paper records for selected filters." compact />
        ) : null}

        {!loadingPapers && papersError ? (
          <StatePanel variant="error" title="Unable to load papers" description={papersError} actionLabel="Retry" onAction={() => fetchPapers(page)} compact />
        ) : null}

        {!loadingPapers && !papersError && filtered.length === 0 ? (
          <StatePanel variant="empty" title="No papers found" description="Try changing filters or create a new paper." compact />
        ) : null}

        {!loadingPapers && !papersError && filtered.length > 0 ? (
        <div className="table-scroll papers-table-scroll">
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
                    <div className="papers-row-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="icon-btn" title={p.is_course_inactive ? 'Locked: course inactive' : 'Edit'} onClick={() => openEdit(p)} disabled={p.is_course_inactive}><HiOutlinePencil size={15} /></button>
                      <button className="icon-btn danger" title={p.is_course_inactive ? 'Locked: course inactive' : 'Delete'} onClick={() => handleDelete(p._id)} disabled={p.is_course_inactive}><HiOutlineTrash size={15} /></button>
                    </div>
                  </SoftLockWrapper>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        ) : null}
      </div>

      <Pagination page={page} total={totalPapers} perPage={PAGE_SIZE} onPageChange={fetchPapers} />

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Paper" width={520}>
        {PaperForm({ onSubmit: handleAdd, submitLabel: 'Create Paper' })}
      </Modal>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Paper" width={520}>
        {PaperForm({ onSubmit: handleUpdate, submitLabel: 'Save Changes' })}
      </Modal>

      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Import Papers" width={520}>
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Upload an Excel or CSV file with columns: <strong>name</strong>, <strong>code</strong>, <strong>course</strong>, <strong>semester</strong>. Lecturer is optional.
          </p>
          <input
            className="input-field"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button className="btn-secondary" onClick={() => setShowImport(false)} disabled={importingPapers}>Cancel</button>
            <button className="btn-primary" onClick={handleImportPapers} disabled={!importFile || importingPapers}>
              {importingPapers ? 'Importing...' : 'Upload and Import'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showMobileOptions} onClose={() => setShowMobileOptions(false)} title="Paper Options" width={420}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div
            className="btn-secondary"
            style={{ justifyContent: 'space-between', cursor: 'default' }}
          >
            <span>Fade Rows</span>
            <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showInactiveRows}
                onChange={(e) => setShowInactiveRows(e.target.checked)}
                aria-label="Toggle faded rows"
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
              />
              <span
                style={{
                  width: 38,
                  height: 22,
                  borderRadius: 999,
                  background: showInactiveRows ? 'var(--accent-emerald)' : 'var(--text-muted)',
                  transition: 'background 160ms ease',
                  position: 'relative',
                  display: 'inline-block',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: showInactiveRows ? 18 : 2,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left 160ms ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  }}
                />
              </span>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
