import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import api from '../../../api/axios';
import { useAuth } from '../../../hooks/useAuth';

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

/**
 * Custom hook encapsulating all state, data fetching, memos, and action handlers
 * for the ManageLecturers page.
 */
export default function useLecturerData() {
  const { isSuperAdmin, isDepartmentAdmin, departmentId, departmentName } = useAuth();
  const [departments, setDepartments] = useState([]);

  const [lecturers, setLecturers] = useState([]);
  const [totalLecturers, setTotalLecturers] = useState(0);
  const [page, setPage] = useState(1);
  const [courses, setCourses] = useState([]);
  const [papers, setPapers] = useState([]);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
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
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM, _id: '' });
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
  const fetchLecturersRef = useRef(null);
  const previousQueryRef = useRef({
    search: '',
    filters: { department_id: '', course_id: '', semester: '', paper_id: '' },
  });

  // ── Data fetching ──────────────────────────────────────────────────

  const fetchDepartments = useCallback(() => {
    api.get('/admin/departments').then((r) => setDepartments(Array.isArray(r.data) ? r.data : [])).catch(() => setDepartments([]));
  }, []);

  const fetchMetadata = useCallback(() => {
    const params = {};
    if (isSuperAdmin && filters.department_id) params.department_id = filters.department_id;
    if (isDepartmentAdmin) params.department_id = departmentId;
    api.get('/admin/courses', { params }).then((r) => setCourses(extractItems(r.data))).catch(() => {});
    api.get('/admin/papers', { params }).then((r) => setPapers(extractItems(r.data))).catch(() => {});
  }, [isSuperAdmin, isDepartmentAdmin, departmentId, filters.department_id]);

  const fetchLecturers = useCallback((nextPage = 1, options = {}) => {
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
        fetchLecturersRef.current?.(maxPage);
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
  }, [search, filters]);

  // Keep ref in sync so recursive calls always use the latest version
  useEffect(() => { fetchLecturersRef.current = fetchLecturers; }, [fetchLecturers]);

  const fetchAllLecturersForExport = useCallback(async () => {
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
  }, [search, filters]);

  // ── Effects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (isSuperAdmin) fetchDepartments();
  }, [isSuperAdmin, fetchDepartments]);

  useEffect(() => {
    if (isDepartmentAdmin && departmentId) {
      setFilters((prev) => ({ ...prev, department_id: departmentId }));
    }
  }, [isDepartmentAdmin, departmentId]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

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
  }, [filters.department_id, filters.course_id, filters.semester, filters.paper_id, search, fetchLecturers]);

  // ── Derived / Memoised data ────────────────────────────────────────

  const courseMap = useMemo(() => {
    const map = new Map();
    courses.forEach((course) => map.set(String(course._id || ''), course));
    return map;
  }, [courses]);

  const paperMap = useMemo(() => {
    const map = new Map();
    papers.forEach((paper) => map.set(String(paper._id || ''), paper));
    return map;
  }, [papers]);

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

  // ── Popover helpers ────────────────────────────────────────────────

  const getLecturerDepartmentGroups = useCallback((lecturer) => {
    const groups = new Map();
    const ids = Array.isArray(lecturer?.assigned_paper_ids) ? lecturer.assigned_paper_ids : [];

    ids.forEach((paperId) => {
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
      return { department, courses: coursesList };
    });
  }, [paperMap, courseMap]);

  const getDefaultCourseName = useCallback((coursesList) => {
    if (!Array.isArray(coursesList) || coursesList.length === 0) return '';
    const preferredMca = coursesList.find((course) => String(course.courseCode || '').toLowerCase().includes('mca'));
    if (preferredMca) return preferredMca.courseCode;
    return coursesList[0].courseCode;
  }, []);

  const openDepartmentWithDefaultCourse = useCallback((lecturerId, group) => {
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
  }, [openDepartmentPopover, getDefaultCourseName]);

  return {
    // Auth context
    isSuperAdmin, isDepartmentAdmin, departmentId, departmentName,
    // Core data
    departments, lecturers, totalLecturers, page, courses, papers,
    // Loading / error
    loadingLecturers, lecturersError,
    // Filters
    search, setSearch, filters, setFilters,
    showMobileFilters, setShowMobileFilters,
    showMobileOperations, setShowMobileOperations,
    semesterOptions, filteredPapers,
    // Add / Edit modal
    showAdd, setShowAdd, form, setForm,
    showEdit, setShowEdit, editForm, setEditForm,
    // Credentials modal
    showCreds, setShowCreds, createdCreds, setCreatedCreds,
    // Assign modal
    showAssign, setShowAssign, selectedLecturer, setSelectedLecturer,
    assignedPaperIds, setAssignedPaperIds,
    assignmentFilters, setAssignmentFilters,
    assignmentFilterCourses, assignmentFilterSemesters, assignmentFilteredPapers,
    // Excel import
    showExcelImport, setShowExcelImport,
    excelFile, setExcelFile,
    excelImporting, setExcelImporting,
    excelResults, setExcelResults,
    excelFileInputRef,
    exportingLecturers, setExportingLecturers,
    // Popover state
    openDepartmentPopover, setOpenDepartmentPopover,
    activePopoverCourses, setActivePopoverCourses,
    // Derived helpers
    courseMap, paperMap,
    getLecturerDepartmentGroups, getDefaultCourseName, openDepartmentWithDefaultCourse,
    // Actions
    fetchLecturers, fetchMetadata, fetchAllLecturersForExport,
    // Constants
    PAGE_SIZE, EMPTY_FORM, buildTempPassword,
  };
}
