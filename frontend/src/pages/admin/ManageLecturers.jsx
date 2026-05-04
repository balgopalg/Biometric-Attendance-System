import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../api/axios';
import { formatCourseName } from '../../utils/courseDisplay';
import { exportToExcel, exportToCSV, EXPORT_COLUMN_PRESETS } from '../../utils/excelExport';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import StatePanel from '../../components/ui/StatePanel';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import {
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineFilter,
  HiOutlineTrash,
  HiOutlineKey,
  HiOutlineCheckCircle,
  HiOutlineClipboardCopy,
  HiOutlineClipboardList,
  HiOutlineDocumentAdd,
  HiOutlineDownload,
  HiOutlineDotsHorizontal,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
} from 'react-icons/hi';

const EMPTY_FORM = { name: '', email: '' };
const PAGE_SIZE = 10;

const extractItems = (data) => (Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []));

const buildTempPassword = (length = 14) => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = `${upper}${lower}${digits}${symbols}`;

  const cryptoObj = globalThis.crypto;
  const randomIndex = (max) => {
    if (cryptoObj?.getRandomValues) {
      const bytes = new Uint32Array(1);
      cryptoObj.getRandomValues(bytes);
      return bytes[0] % max;
    }
    return Math.floor(Math.random() * max);
  };
  const pick = (chars) => chars[randomIndex(chars.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};
export default function ManageLecturers() {
  const { isSuperAdmin, isDepartmentAdmin, departmentId, departmentName } = useAuth();
  const [departments, setDepartments] = useState([]);

  const [lecturers, setLecturers] = useState([]);
  const [totalLecturers, setTotalLecturers] = useState(0);
  const [page, setPage] = useState(1);
  const [courses, setCourses] = useState([]);
  const [papers, setPapers] = useState([]);

  const [showAdd, setShowAdd] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [showAssign, setShowAssign] = useState(false);

  const [createdCreds, setCreatedCreds] = useState(null);
  const [selectedLecturer, setSelectedLecturer] = useState(null);
  const [assignedPaperIds, setAssignedPaperIds] = useState([]);
  const [assignmentFilters, setAssignmentFilters] = useState({ department_id: '', course_id: '', semester: '' });

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ department_id: '', course_id: '', semester: '', paper_id: '' });
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showMobileOperations, setShowMobileOperations] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loadingLecturers, setLoadingLecturers] = useState(false);
  const [lecturersError, setLecturersError] = useState('');
  const [exportingLecturers, setExportingLecturers] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [excelImporting, setExcelImporting] = useState(false);
  const [excelResults, setExcelResults] = useState(null);
  const [openDepartmentPopover, setOpenDepartmentPopover] = useState({ lecturerId: '', department: '' });
  const [activePopoverCourses, setActivePopoverCourses] = useState({});
  const excelFileInputRef = useRef(null);
  const hasFetchedLecturersRef = useRef(false);
  const previousQueryRef = useRef({
    search: '',
    filters: { department_id: '', course_id: '', semester: '', paper_id: '' },
  });

  // Fetch departments for Super Admin
  const fetchDepartments = () => {
    api.get('/admin/departments').then((r) => setDepartments(Array.isArray(r.data) ? r.data : [])).catch(() => setDepartments([]));
  };

  const fetchMetadata = () => {
    const params = {};
    if (isSuperAdmin && filters.department_id) params.department_id = filters.department_id;
    if (isDepartmentAdmin) params.department_id = departmentId;
    api.get('/admin/courses', { params }).then((r) => setCourses(extractItems(r.data))).catch(() => {});
    api.get('/admin/papers', { params }).then((r) => setPapers(extractItems(r.data))).catch(() => {});
  };

  const fetchLecturers = (nextPage = 1, options = {}) => {
    const silent = Boolean(options.silent);
    if (!silent) setLoadingLecturers(true);
    setLecturersError('');
    const params = {};
    params.page = nextPage;
    params.per_page = PAGE_SIZE;
    if (search) params.q = search;
    if (filters.department_id) params.department_id = filters.department_id;
    if (filters.course_id) params.course_id = filters.course_id;
    if (filters.semester) params.semester = filters.semester;
    if (filters.paper_id) params.paper_id = filters.paper_id;
    api.get('/admin/lecturers', { params }).then((r) => {
      const items = Array.isArray(r.data?.items) ? r.data.items : (Array.isArray(r.data) ? r.data : []);
      const resolvedTotal = Number(r.data?.total || items.length || 0);
      const maxPage = Math.max(1, Math.ceil(resolvedTotal / PAGE_SIZE));
      if (resolvedTotal > 0 && nextPage > maxPage) {
        fetchLecturers(maxPage);
        return;
      }
      setLecturers(items);
      setTotalLecturers(resolvedTotal);
      setPage(Number(r.data?.page || nextPage));
    }).catch((err) => {
      setLecturers([]);
      setTotalLecturers(0);
      setLecturersError(err.response?.data?.error || 'Failed to load lecturers.');
    }).finally(() => {
      if (!silent) setLoadingLecturers(false);
    });
  };

  useEffect(() => {
    if (isSuperAdmin) fetchDepartments();
  }, [isSuperAdmin]);

  // Fetch all lecturers with current filters for export (no pagination)
  const fetchAllLecturersForExport = async () => {
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
        if (filters.semester) params.semester = filters.semester;
        if (filters.paper_id) params.paper_id = filters.paper_id;
        // eslint-disable-next-line no-await-in-loop
        const r = await api.get('/admin/lecturers', { params });
        const items = Array.isArray(r.data?.items) ? r.data.items : (Array.isArray(r.data) ? r.data : []);
        all.push(...items);
        const total = Number(r.data?.total || items.length || 0);
        const pages = Math.max(1, Math.ceil(total / 100));
        if (current >= pages) more = false;
        else current += 1;
      }
      return all;
    } catch (err) {
      console.error('Error fetching all lecturers for export', err);
      throw new Error('Failed to fetch all lecturers for export');
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
    if (!openDepartmentPopover.lecturerId || !openDepartmentPopover.department) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.lecturer-dept-popover-surface')) return;
      setOpenDepartmentPopover({ lecturerId: '', department: '' });
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [openDepartmentPopover]);

  useEffect(() => {
    const previous = previousQueryRef.current;
    const searchChanged = previous.search !== search;
    const filtersChanged =
      previous.filters.department_id !== filters.department_id
      || previous.filters.course_id !== filters.course_id
      || previous.filters.semester !== filters.semester
      || previous.filters.paper_id !== filters.paper_id;

    const silent = hasFetchedLecturersRef.current && searchChanged && !filtersChanged;

    fetchLecturers(1, { silent });

    previousQueryRef.current = {
      search,
      filters: {
        department_id: filters.department_id,
        course_id: filters.course_id,
        semester: filters.semester,
        paper_id: filters.paper_id,
      },
    };
    hasFetchedLecturersRef.current = true;
  }, [filters.department_id, filters.course_id, filters.semester, filters.paper_id, search]);

  const semesterOptions = useMemo(() => {
    const values = new Set();
    papers.forEach((p) => {
      if (filters.course_id && p.course_id !== filters.course_id) return;
      const sem = Number(p.semester || 0);
      if (Number.isFinite(sem) && sem > 0) values.add(sem);
    });
    return Array.from(values).sort((a, b) => a - b);
  }, [papers, filters.course_id]);

  const courseMap = useMemo(() => {
    const map = new Map();
    courses.forEach((course) => {
      map.set(String(course._id || ''), course);
    });
    return map;
  }, [courses]);

  const filteredPapers = useMemo(() => {
    const selectedDepartmentName = departments.find((dept) => dept._id === filters.department_id)?.name || '';

    return papers.filter((p) => {
      const course = courseMap.get(String(p.course_id || ''));
      const matchDepartment = !filters.department_id
        || course?.department_id === filters.department_id
        || (selectedDepartmentName && String(course?.department || '').toLowerCase() === selectedDepartmentName.toLowerCase());
      const matchCourse = !filters.course_id || p.course_id === filters.course_id;
      const matchSemester = !filters.semester || String(p.semester || '') === String(filters.semester);
      return matchDepartment && matchCourse && matchSemester;
    });
  }, [papers, courseMap, departments, filters.department_id, filters.course_id, filters.semester]);

  const assignmentFilterDepartmentName = useMemo(
    () => departments.find((dept) => dept._id === assignmentFilters.department_id)?.name || '',
    [departments, assignmentFilters.department_id]
  );

  const assignmentFilterCourses = useMemo(() => {
    if (!assignmentFilters.department_id) return courses;
    return courses.filter((course) => (
      course.department_id === assignmentFilters.department_id
      || (assignmentFilterDepartmentName && String(course.department || '').toLowerCase() === assignmentFilterDepartmentName.toLowerCase())
    ));
  }, [courses, assignmentFilterDepartmentName, assignmentFilters.department_id]);

  const assignmentFilterSemesters = useMemo(() => {
    const values = new Set();
    papers.forEach((paper) => {
      const course = courseMap.get(String(paper.course_id || ''));
      const matchesDepartment = !assignmentFilters.department_id
        || course?.department_id === assignmentFilters.department_id
        || (assignmentFilterDepartmentName && String(course?.department || '').toLowerCase() === assignmentFilterDepartmentName.toLowerCase());
      const matchesCourse = !assignmentFilters.course_id || paper.course_id === assignmentFilters.course_id;
      if (!matchesDepartment || !matchesCourse) return;
      const semesterValue = Number(paper.semester || 0);
      if (Number.isFinite(semesterValue) && semesterValue > 0) values.add(semesterValue);
    });
    return Array.from(values).sort((a, b) => a - b);
  }, [assignmentFilterDepartmentName, assignmentFilters.course_id, assignmentFilters.department_id, courseMap, papers]);

  const assignmentFilteredPapers = useMemo(() => {
    return papers.filter((paper) => {
      const course = courseMap.get(String(paper.course_id || ''));
      const matchesDepartment = !assignmentFilters.department_id
        || course?.department_id === assignmentFilters.department_id
        || (assignmentFilterDepartmentName && String(course?.department || '').toLowerCase() === assignmentFilterDepartmentName.toLowerCase());
      const matchesCourse = !assignmentFilters.course_id || paper.course_id === assignmentFilters.course_id;
      const matchesSemester = !assignmentFilters.semester || String(paper.semester || '') === String(assignmentFilters.semester);
      return matchesDepartment && matchesCourse && matchesSemester;
    });
  }, [assignmentFilterDepartmentName, assignmentFilters.course_id, assignmentFilters.department_id, assignmentFilters.semester, courseMap, papers]);

  const paperMap = useMemo(() => {
    const map = new Map();
    papers.forEach((paper) => {
      map.set(String(paper._id || ''), paper);
    });
    return map;
  }, [papers]);

  const getLecturerDepartmentGroups = (lecturer) => {
    const groups = new Map();
    const assignedPaperIds = Array.isArray(lecturer?.assigned_paper_ids) ? lecturer.assigned_paper_ids : [];

    assignedPaperIds.forEach((paperId) => {
      const paper = paperMap.get(String(paperId || ''));
      if (!paper) return;
      const course = courseMap.get(String(paper.course_id || ''));
      const deptName = String(course?.department || lecturer?.department || 'Unassigned Department').trim();
      const subjectLabel = `${paper.name || 'Untitled Paper'}${paper.code ? ` (${paper.code})` : ''}`;
      const courseCode = String(course?.code || course?.name || 'GEN').trim().toUpperCase();

      if (!groups.has(deptName)) groups.set(deptName, new Map());
      const departmentCourses = groups.get(deptName);
      if (!departmentCourses.has(courseCode)) departmentCourses.set(courseCode, []);
      departmentCourses.get(courseCode).push(subjectLabel);
    });

    if (groups.size === 0) {
      const fallbackSubjects = Array.isArray(lecturer?.assigned_papers) ? lecturer.assigned_papers.filter(Boolean) : [];
      if (fallbackSubjects.length > 0) {
        const fallbackDept = String(lecturer?.department || 'Unassigned Department').trim();
        groups.set(fallbackDept, new Map([['General', fallbackSubjects]]));
      } else if (lecturer?.department) {
        groups.set(String(lecturer.department).trim(), new Map([['General', []]]));
      }
    }

    return Array.from(groups.entries()).map(([department, courseGroups]) => {
      const coursesList = Array.from(courseGroups.entries()).map(([courseCode, subjects]) => ({
        courseCode,
        subjects,
      }));
      return {
      department,
      courses: coursesList,
      }; 
    });
  };

  const getDefaultCourseName = (coursesList) => {
    if (!Array.isArray(coursesList) || coursesList.length === 0) return '';
    const preferredMca = coursesList.find((course) => String(course.courseCode || '').toLowerCase().includes('mca'));
    if (preferredMca) return preferredMca.courseCode;
    return coursesList[0].courseCode;
  };

  const openDepartmentWithDefaultCourse = (lecturerId, group) => {
    const department = group?.department || '';
    if (!department) return;

    const isAlreadyOpen = openDepartmentPopover.lecturerId === lecturerId && openDepartmentPopover.department === department;
    if (isAlreadyOpen) {
      setOpenDepartmentPopover({ lecturerId: '', department: '' });
      return;
    }

    const popoverKey = `${lecturerId}::${department}`;
    const defaultCourse = getDefaultCourseName(group?.courses || []);
    setActivePopoverCourses((prev) => ({
      ...prev,
      [popoverKey]: defaultCourse,
    }));
    setOpenDepartmentPopover({ lecturerId, department });
  };

  const handleAdd = async () => {
    if (!form.name?.trim() || !form.email?.trim()) {
      toast.error('Name and Email are required');
      return;
    }
    if (!form.department?.trim()) {
      toast.error('Primary Department is required');
      return;
    }

    try {
      const initialPassword = buildTempPassword();
      const res = await api.post('/admin/lecturers', { ...form, role: 'lecturer', initial_password: initialPassword });
      const data = res.data;
      setShowAdd(false);
      setForm({ ...EMPTY_FORM, department: isDepartmentAdmin && departmentName ? departmentName : '' });
      if (data?.temp_password) {
        setCreatedCreds({
          name: data.name,
          email: data.email,
          temp_password: data.temp_password,
        });
        setShowCreds(true);
      }
      toast.success(data?.message || 'Lecturer created');
      fetchLecturers(page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this lecturer?')) return;
    try {
      await api.delete(`/admin/lecturers/${id}`);
      toast.success('Deleted');
      fetchLecturers(page);
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleResetPassword = async (id, name) => {
    if (!window.confirm(`Reset password for ${name}?`)) return;
    try {
      const res = await api.post(`/admin/lecturers/${id}/reset-password`);
      const tempPassword = res.data?.temp_password;
      if (tempPassword) {
        setCreatedCreds({
          name,
          temp_password: tempPassword,
          isReset: true,
        });
        setShowCreds(true);
      }
      toast.success(res.data?.message || 'Password reset');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
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
      setAssignmentFilters({
        department_id: lecturer?.department_id || filters.department_id || '',
        course_id: filters.course_id || '',
        semester: filters.semester || '',
      });
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
      fetchLecturers(page);
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

  const handleLecturerExcelImport = async () => {
    if (!excelFile) { toast.error('Please select an Excel file'); return; }
    const fd = new FormData();
    fd.append('file', excelFile);
    try {
      setExcelImporting(true);
      const res = await api.post('/admin/lecturers/import-excel', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setExcelResults(res.data);
      toast.success(res.data.message || 'Import complete');
      fetchLecturers(page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setExcelImporting(false);
    }
  };

  const handleExportLecturers = async () => {
    setExportingLecturers(true);
    try {
      const all = await fetchAllLecturersForExport();
      if (all.length === 0) {
        toast.error('No lecturers to export');
        return;
      }

      try {
        await exportToExcel({
          data: all,
          columns: EXPORT_COLUMN_PRESETS.LECTURERS,
          fileName: 'Lecturers',
          sheetName: 'Lecturers',
        });
        toast.success(`Exported ${all.length} lecturers to Excel`);
      } catch (xlsxError) {
        if (xlsxError.message.includes('xlsx')) {
          exportToCSV({
            data: all,
            columns: EXPORT_COLUMN_PRESETS.LECTURERS,
            fileName: 'Lecturers',
          });
          toast.success(`Exported ${all.length} lecturers to CSV`);
        } else {
          throw xlsxError;
        }
      }
    } catch (err) {
      toast.error(err.message || 'Failed to export lecturers');
    } finally {
      setExportingLecturers(false);
    }
  };

  const openLecturerImportModal = () => {
    setExcelFile(null);
    setExcelResults(null);
    if (excelFileInputRef.current) excelFileInputRef.current.value = '';
    setShowExcelImport(true);
  };

  const openAddLecturerModal = () => {
    setForm({ ...EMPTY_FORM, department: isDepartmentAdmin && departmentName ? departmentName : '' });
    setShowAdd(true);
  };

  if (!loadingLecturers && lecturersError) {
    return (
      <div className="admin-page">
        <StatePanel variant="error" title="Unable to load lecturers" description={lecturersError} actionLabel="Retry" onAction={() => fetchLecturers(page)} compact />
      </div>
    );
  }

  return (
    <div className="admin-page">

      <div className="lecturers-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Lecturers</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{totalLecturers} lecturers in current filter</p>
          <div className="lecturers-toolbar-actions-mobile">
            <button
              className="btn-secondary"
              title="Import lecturers from Excel"
              onClick={openLecturerImportModal}
            >
              <HiOutlineDocumentAdd size={16} /> Import Excel
            </button>
            <button className="btn-primary" onClick={openAddLecturerModal}>
              <HiOutlinePlus size={16} /> Add Lecturer
            </button>
          </div>
        </div>
        <div className="lecturers-toolbar-actions-primary" style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" title="Export all filtered lecturers to Excel" onClick={handleExportLecturers} disabled={totalLecturers === 0 || exportingLecturers}>
            <HiOutlineDownload size={16} /> {exportingLecturers ? 'Exporting...' : `Export (${totalLecturers})`}
          </button>
          <button className="btn-secondary" title="Import lecturers from Excel" onClick={openLecturerImportModal}>
            <HiOutlineDocumentAdd size={16} /> Import Excel
          </button>
          <button className="btn-primary" onClick={openAddLecturerModal}>
            <HiOutlinePlus size={16} /> Add Lecturer
          </button>
        </div>
      </div>

      <div className="mobile-filters-toggle-wrap lecturers-mobile-filters-toggle-wrap">
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
          title="Quick actions"
          aria-label="Quick actions"
          onClick={() => setShowMobileOperations(true)}
        >
          <HiOutlineDotsHorizontal size={18} />
        </button>
      </div>

      <div className={`lecturers-filter-grid ${showMobileFilters ? 'is-mobile-open' : ''}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative' }}>
          <HiOutlineSearch size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="search-input" placeholder="Search by name, email or subject..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* Department Filter */}
        <select
          className="input-field"
          value={filters.department_id}
          onChange={(e) => {
            setFilters({ department_id: e.target.value, course_id: '', semester: '', paper_id: '' });
          }}
          disabled={isDepartmentAdmin}
        >
          <option value="">{isDepartmentAdmin ? (departmentName || 'Department') : 'All Departments'}</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>{d.name}</option>
          ))}
        </select>

        <select className="input-field" value={filters.course_id} onChange={(e) => setFilters({ ...filters, course_id: e.target.value, semester: '', paper_id: '' })}>
          <option value="">All Courses</option>
          {courses.map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })}</option>)}
        </select>

        <select className="input-field" value={filters.semester} onChange={(e) => setFilters({ ...filters, semester: e.target.value, paper_id: '' })}>
          <option value="">All Semesters</option>
          {semesterOptions.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
        </select>

        <select className="input-field" value={filters.paper_id} onChange={(e) => setFilters({ ...filters, paper_id: e.target.value })}>
          <option value="">All Papers</option>
          {filteredPapers.map((p) => <option key={p._id} value={p._id}>{p.name}{p.code ? ` [${p.code}]` : ''}</option>)}
        </select>
      </div>

      <div className="glass-card">
        {loadingLecturers ? (
          <StatePanel variant="loading" title="Loading lecturers" description="Retrieving lecturer records and assignments." compact />
        ) : null}

        {lecturersError ? (
          <StatePanel variant="error" title="Unable to load lecturers" description={lecturersError} actionLabel="Retry" onAction={() => fetchLecturers(page)} compact />
        ) : null}

        {!loadingLecturers && !lecturersError && lecturers.length === 0 ? (
          <StatePanel variant="empty" title="No lecturers found" description="Try another filter or add a new lecturer." compact />
        ) : null}

        {!loadingLecturers && !lecturersError && lecturers.length > 0 ? (
        <div 
          className="table-scroll lecturers-table-scroll"
          style={{ paddingBottom: openDepartmentPopover.lecturerId ? '220px' : '0', transition: 'padding 0.2s' }}
        >
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {lecturers.map((l) => {
              const departmentGroups = getLecturerDepartmentGroups(l);
              return (
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
                <td style={{ position: 'relative' }}>
                  {departmentGroups.length === 0 ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No department</span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {departmentGroups.map((group, groupIndex) => {
                        const isOpen = openDepartmentPopover.lecturerId === l._id && openDepartmentPopover.department === group.department;
                        const popoverKey = `${l._id}::${group.department}`;
                        const activeCourseName = activePopoverCourses[popoverKey] || getDefaultCourseName(group.courses);
                        const activeCourse = (group.courses || []).find((course) => course.courseCode === activeCourseName) || group.courses?.[0] || { subjects: [] };
                        return (
                          <div key={`${l._id}-dept-${group.department}-${groupIndex}`} style={{ position: 'relative' }} className="lecturer-dept-popover-surface">
                            <button
                              type="button"
                              className="badge badge-info"
                              style={{
                                border: '1px solid var(--accent-cyan)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer',
                              }}
                              onClick={() => openDepartmentWithDefaultCourse(l._id, group)}
                              title={isOpen ? 'Hide assigned subjects' : 'Show assigned subjects'}
                            >
                              {group.department}
                              {isOpen ? <HiOutlineChevronUp size={12} /> : <HiOutlineChevronDown size={12} />}
                            </button>

                            {isOpen ? (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 'calc(100% + 8px)',
                                  left: 0,
                                  minWidth: 260,
                                  maxWidth: 340,
                                  maxHeight: 220,
                                  overflowY: 'auto',
                                  zIndex: 8,
                                  padding: 10,
                                  borderRadius: 10,
                                  border: '1px solid var(--border-glass)',
                                  background: 'var(--bg-card)',
                                  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.22)',
                                }}
                              >
                                <p style={{ fontSize: '0.72rem', fontWeight: 700, marginBottom: 8 }}>{group.department} - Assigned Subjects</p>
                                {(group.courses || []).length > 0 ? (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, rowGap: 8, marginBottom: 10 }}>
                                    {group.courses.map((course, courseIndex) => {
                                      const selected = course.courseCode === activeCourseName;
                                      return (
                                        <button
                                          key={`${popoverKey}-course-${courseIndex}`}
                                          type="button"
                                          onClick={() => {
                                            setActivePopoverCourses((prev) => ({
                                              ...prev,
                                              [popoverKey]: course.courseCode,
                                            }));
                                          }}
                                          style={{
                                            padding: '5px 12px',
                                            borderRadius: 999,
                                            border: selected ? '1px solid var(--accent-cyan)' : '1px solid var(--border-glass)',
                                            background: selected ? 'rgba(34, 211, 238, 0.12)' : 'var(--bg-glass)',
                                            fontSize: '0.74rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            color: 'var(--text-primary)',
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          {course.courseCode}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : null}

                                {(activeCourse.subjects || []).length === 0 ? (
                                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>No assigned subjects</p>
                                ) : (
                                  <div style={{ display: 'grid', gap: 6 }}>
                                    {activeCourse.subjects.map((subject, subjectIndex) => (
                                      <div
                                        key={`${l._id}-dept-subject-${group.department}-${subjectIndex}`}
                                        style={{
                                          fontSize: '0.76rem',
                                          padding: '6px 8px',
                                          borderRadius: 8,
                                          border: '1px solid var(--border-glass)',
                                          background: 'var(--bg-glass)',
                                        }}
                                      >
                                        {subject}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td>
                  <div className="lecturers-row-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
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
            );
            })}
          </tbody>
        </table>
        </div>
        ) : null}
      </div>

      <Pagination page={page} total={totalLecturers} perPage={PAGE_SIZE} onPageChange={fetchLecturers} />

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Lecturer" width={480}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Full Name</label>
          <input className="input-field" placeholder="Dr. John Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Email</label>
          <input className="input-field" placeholder="lecturer@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Primary Department</label>
          <select
            className="input-field"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            disabled={isDepartmentAdmin}
          >
            <option value="" disabled={isSuperAdmin}>
              {isDepartmentAdmin ? (departmentName || 'Department') : 'Select Primary Department...'}
            </option>
            {departments.map((d) => (
              <option key={d._id} value={d.name}>{d.name}</option>
            ))}
          </select>
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
          Select all papers this lecturer teaches. Use the filters below to narrow the list.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <select
            className="input-field"
            value={assignmentFilters.department_id}
            onChange={(e) => setAssignmentFilters({ department_id: e.target.value, course_id: '', semester: '' })}
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept._id} value={dept._id}>{dept.name}</option>
            ))}
          </select>
          <select
            className="input-field"
            value={assignmentFilters.course_id}
            onChange={(e) => setAssignmentFilters((prev) => ({ ...prev, course_id: e.target.value, semester: '' }))}
            disabled={assignmentFilterCourses.length === 0}
          >
            <option value="">All Courses</option>
            {assignmentFilterCourses.map((course) => (
              <option key={course._id} value={course._id}>{formatCourseName(course.name, { status: course.status })}</option>
            ))}
          </select>
          <select
            className="input-field"
            value={assignmentFilters.semester}
            onChange={(e) => setAssignmentFilters((prev) => ({ ...prev, semester: e.target.value }))}
            disabled={assignmentFilterSemesters.length === 0}
          >
            <option value="">All Semesters</option>
            {assignmentFilterSemesters.map((semester) => (
              <option key={semester} value={String(semester)}>Semester {semester}</option>
            ))}
          </select>
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: 8, marginBottom: 16 }}>
          {assignmentFilteredPapers.map((p) => {
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
                {p.name}{p.code ? ` [${p.code}]` : ''} {p.course_name ? `- ${formatCourseName(p.course_name, { isInactive: p.is_course_inactive, status: p.course_status })}` : ''}
              </label>
            );
          })}
          {assignmentFilteredPapers.length === 0 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 6px' }}>
              No subjects match the selected filters.
            </p>
          )}
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

      {/* ─── Mobile Operations Modal ─────────────────────────────────────── */}
      <Modal isOpen={showMobileOperations} onClose={() => setShowMobileOperations(false)} title="Quick Actions" width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => {
            setShowMobileOperations(false);
            handleExportLecturers();
          }} disabled={exportingLecturers}>
            <HiOutlineDownload size={16} /> {exportingLecturers ? 'Exporting...' : 'Export Lecturers'}
          </button>
        </div>
      </Modal>

      {/* ─── Lecturer Excel Import Modal ─────────────────────────────────── */}
      <Modal
        isOpen={showExcelImport}
        onClose={() => { if (!excelImporting) { setShowExcelImport(false); setExcelResults(null); } }}
        title="Import Lecturers from Excel"
        width={560}
      >
        {!excelResults ? (
          <>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              Upload an <strong>.xlsx</strong> file with columns: <code>Department</code>, <code>Name</code>, <code>Email</code>, <code>Courses</code>, and <code>Papers</code>.
              <code>Courses</code> and <code>Papers</code> must be comma-separated codes, like <code>MCA, BCA</code> or <code>CS101, CS102</code>.
              Only existing course and paper codes are assigned.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Excel File (.xlsx) *</label>
              <input
                ref={excelFileInputRef}
                type="file"
                accept=".xlsx,.xlsm,.xltx"
                className="input-field"
                style={{ padding: '8px 12px', cursor: 'pointer' }}
                onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
              />
              {excelFile && (
                <p style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--accent-emerald)' }}>
                  ✓ {excelFile.name} ({(excelFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div
              style={{
                background: 'var(--bg-glass)',
                border: '1px solid var(--border-glass)',
                borderRadius: 'var(--radius)',
                padding: '10px 14px',
                marginBottom: 18,
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
              }}
            >
              <strong style={{ color: 'var(--text-secondary)' }}>Expected column headers (row 1):</strong>
              <br />
              <code>Department</code> · <code>Name</code> · <code>Email</code> · <code>Courses</code> · <code>Papers</code>
              <br />
              Example row: <code>Computer Science</code> · <code>Dr. Anita</code> · <code>anita@college.edu</code> · <code>MCA, BCA</code> · <code>CS101, CS102</code>
              <br />
              Duplicate emails are skipped automatically.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn-secondary" onClick={() => setShowExcelImport(false)} disabled={excelImporting}>Cancel</button>
              <button className="btn-primary" onClick={handleLecturerExcelImport} disabled={excelImporting || !excelFile}>
                {excelImporting ? 'Importing...' : 'Import'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <HiOutlineCheckCircle size={22} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
              <div>
                <p style={{ fontWeight: 700, margin: 0 }}>{excelResults.message}</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                  Created: {excelResults.created} &nbsp;·&nbsp; Skipped: {excelResults.skipped} &nbsp;·&nbsp; Errors: {excelResults.errors}
                </p>
              </div>
            </div>

            {excelResults.results?.length > 0 && (
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
                <table className="data-table" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Department</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Courses</th>
                      <th>Papers</th>
                      <th>Temp Password / Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excelResults.results.map((r) => (
                      <tr key={r.row} style={{ opacity: r.status === 'skipped' || r.status === 'error' ? 0.65 : 1 }}>
                        <td>{r.row}</td>
                        <td>{r.department || '—'}</td>
                        <td>{r.name || '—'}</td>
                        <td>{r.email || '—'}</td>
                        <td>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: r.status === 'created' ? 'rgba(52,211,153,0.15)' : r.status === 'error' ? 'rgba(248,113,113,0.15)' : 'rgba(251,191,36,0.15)',
                            color: r.status === 'created' ? 'var(--accent-emerald)' : r.status === 'error' ? '#f87171' : '#fbbf24',
                          }}>
                            {r.status}
                          </span>
                        </td>
                        <td>{Array.isArray(r.matched_courses) ? (r.matched_courses.length ? r.matched_courses.join(', ') : '—') : (r.assigned_course_count ? String(r.assigned_course_count) : '—')}</td>
                        <td>{Array.isArray(r.matched_papers) ? (r.matched_papers.length ? r.matched_papers.join(', ') : '—') : (r.assigned_paper_count ? String(r.assigned_paper_count) : '—')}</td>
                        <td style={{ fontFamily: r.temp_password ? 'monospace' : 'inherit', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {r.temp_password || r.reason || r.department_warning || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {excelResults.results?.some((r) => r.department_warning) && (
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Rows with a department warning were imported using the raw department text because no exact department match was found.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn-secondary" onClick={() => {
                setExcelResults(null);
                setExcelFile(null);
                if (excelFileInputRef.current) excelFileInputRef.current.value = '';
              }}>Import Another File</button>
              <button className="btn-primary" onClick={() => { setShowExcelImport(false); setExcelResults(null); }}>Done</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
