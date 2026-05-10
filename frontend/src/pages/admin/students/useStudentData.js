import { useMemo, useState, useEffect, useRef } from 'react';
import api from '../../../api/axios';
import useAdminPreference from '../../../hooks/useAdminPreference';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import { EXPORT_COLUMN_PRESETS } from '../../../utils/excelExport';
import toast from 'react-hot-toast';
import { useAuth } from '../../../hooks/useAuth';

const EMPTY_FORM = {
  name: '',
  email: '',
  course_id: '',
  mobile_no: '',
  reg_number: '',
};
// pageSize is now dynamic and managed via state/preference

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

export default function useStudentData() {
  const { isSuperAdmin, isDepartmentAdmin, departmentId, departmentName } = useAuth();
  const [departments, setDepartments] = useState([]);

  const [students, setStudents] = useState([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [page, setPage] = useState(1);
  const [courses, setCourses] = useState([]);
  const [formCourses, setFormCourses] = useState([]);
  const [papers, setPapers] = useState([]);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [showStudentPapers, setShowStudentPapers] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showMobileOps, setShowMobileOps] = useState(false);

  const [createdCreds, setCreatedCreds] = useState(null);
  const [editingStudent, setEditingStudent] = useState(null);
  const [enrollingStudent, setEnrollingStudent] = useState(null);
  const [paperStudent, setPaperStudent] = useState(null);

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ department_id: '', course_id: '', paper_id: '', semester: '' });
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showInactiveRows, setShowInactiveRows] = useAdminPreference('show_inactive_faded_rows', true);
  const [filterSemesters, setFilterSemesters] = useState([]);
  const debouncedSearch = useDebouncedValue(search, 300);
  const debouncedFilters = useDebouncedValue(filters, 250);

  const [form, setForm] = useState(EMPTY_FORM);
  const [bulkForm, setBulkForm] = useState({ department_id: '', course_id: '', academic_session: '', semester: '', paper_id: '', user_ids: [] });
  const [bulkAssignAllPapers, setBulkAssignAllPapers] = useState(false);
  const [bulkSemesters, setBulkSemesters] = useState([]);
  const [bulkSessions, setBulkSessions] = useState([]);
  const [bulkPapers, setBulkPapers] = useState([]);
  const [bulkStudents, setBulkStudents] = useState([]);
  const [excelForm, setExcelForm] = useState({ course_id: '', semester: '' });
  const [excelSemesters, setExcelSemesters] = useState([]);
  const [excelFile, setExcelFile] = useState(null);
  const [excelImporting, setExcelImporting] = useState(false);
  const [excelResults, setExcelResults] = useState(null);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteSemester, setPromoteSemester] = useState('');
  const [promoteSemesterOptions, setPromoteSemesterOptions] = useState([]);
  const [loadingPromoteSemesters, setLoadingPromoteSemesters] = useState(false);
  const [promotingSelected, setPromotingSelected] = useState(false);
  const excelFileInputRef = useRef(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [trainingStudentId, setTrainingStudentId] = useState('');
  const [bulkTraining, setBulkTraining] = useState(false);
  const [rebuildingAllFaces, setRebuildingAllFaces] = useState(false);
  const [trainingJob, setTrainingJob] = useState(null);
  const [trainingJobUrl, setTrainingJobUrl] = useState('');
  const [trainingSyncErrorShown, setTrainingSyncErrorShown] = useState(false);
  const [trainingCancelPending, setTrainingCancelPending] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [paperOptions, setPaperOptions] = useState([]);
  const [selectedPaperIds, setSelectedPaperIds] = useState([]);
  const [baseAssignedPaperIds, setBaseAssignedPaperIds] = useState([]);
  const [loadingStudentPapers, setLoadingStudentPapers] = useState(false);
  const [savingStudentPapers, setSavingStudentPapers] = useState(false);
  const [exportingStudents, setExportingStudents] = useState(false);
  const [pageSize, setPageSize] = useAdminPreference('students_page_size', 10);
  const fetchStudentsRef = useRef(null);
  const hasFetchedStudentsRef = useRef(false);
  const previousStudentsQueryRef = useRef({
    search: '',
    filters: { department_id: '', course_id: '', paper_id: '', semester: '' },
    showInactiveRows: false,
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

  const fetchStudents = (nextPage = 1, options = {}) => {
    const signal = options.signal;
    const silent = Boolean(options.silent);
    if (!silent) setLoadingStudents(true);
    setStudentsError('');
    const params = {};
    params.page = nextPage;
    params.per_page = pageSize;
    if (debouncedSearch) params.q = debouncedSearch;
    // Use department_id only; backend handles scoping by ID.
    if (debouncedFilters.department_id) {
      params.department_id = debouncedFilters.department_id;
    }
    if (debouncedFilters.course_id) params.course_id = debouncedFilters.course_id;
    if (debouncedFilters.paper_id) params.paper_id = debouncedFilters.paper_id;
    if (debouncedFilters.semester) params.semester = debouncedFilters.semester;
    if (showInactiveRows) params.include_inactive = true;
    api.get('/admin/students', { params, signal }).then((r) => {
      const items = Array.isArray(r.data?.items) ? r.data.items : (Array.isArray(r.data) ? r.data : []);
      const resolvedTotal = Number(r.data?.total || items.length || 0);
      const maxPage = Math.max(1, Math.ceil(resolvedTotal / pageSize));
      if (resolvedTotal > 0 && nextPage > maxPage) {
        fetchStudents(maxPage, options);
        return;
      }
      setStudents(items);
      setTotalStudents(resolvedTotal);
      setPage(Number(r.data?.page || nextPage));
    }).catch((err) => {
      if (err?.code === 'ERR_CANCELED') return;
      setStudents([]);
      setTotalStudents(0);
      setStudentsError(err.response?.data?.error || 'Failed to load students.');
    }).finally(() => {
      if (signal?.aborted) return;
      if (!silent) setLoadingStudents(false);
    });
  };

  // Fetch all students with current filters for export (no pagination)
  const fetchAllStudentsForExport = async () => {
    try {
      const allStudents = [];
      let currentPage = 1;
      let hasMore = true;

      while (hasMore) {
        const params = {};
        params.page = currentPage;
        params.per_page = 100; // Higher per_page for efficiency
        if (debouncedSearch) params.q = debouncedSearch;
        if (debouncedFilters.department_id) {
          params.department_id = debouncedFilters.department_id;
        }
        if (debouncedFilters.course_id) params.course_id = debouncedFilters.course_id;
        if (debouncedFilters.paper_id) params.paper_id = debouncedFilters.paper_id;
        if (debouncedFilters.semester) params.semester = debouncedFilters.semester;
        if (showInactiveRows) params.include_inactive = true;

        const response = await api.get('/admin/students', { params });
        const items = Array.isArray(response.data?.items)
          ? response.data.items
          : Array.isArray(response.data)
          ? response.data
          : [];

        allStudents.push(...items);

        const total = Number(response.data?.total || items.length || 0);
        const totalPages = Math.ceil(total / 100);

        if (currentPage >= totalPages) {
          hasMore = false;
        } else {
          currentPage += 1;
        }
      }

      return allStudents;
    } catch (err) {
      console.error('Error fetching all students for export:', err);
      throw new Error('Failed to fetch all students for export');
    }
  };



  useEffect(() => {
    if (isSuperAdmin) {
      fetchDepartments();
    } else if (isDepartmentAdmin && departmentId && departmentName) {
      // Ensure department admin's department is present for filter lookup
      setDepartments([{ _id: departmentId, name: departmentName }]);
    }
  }, [isSuperAdmin, isDepartmentAdmin, departmentId, departmentName]);

  useEffect(() => {
    // Set department filter for department admin
    if (isDepartmentAdmin && departmentId) {
      setFilters((prev) => ({ ...prev, department_id: departmentId }));
    }
  }, [isDepartmentAdmin, departmentId]);

  useEffect(() => {
    fetchMetadata();
  }, [filters.department_id]);

  const activeCourses = useMemo(
    () => courses.filter((c) => String(c.status || 'active').toLowerCase() === 'active'),
    [courses]
  );

  const visibleCourses = showInactiveRows ? courses : activeCourses;

  // Department options for filter
  const departmentOptions = useMemo(() => {
    return departments.map((d) => ({ value: d._id, label: d.name }));
  }, [departments]);

  useEffect(() => {
    if (!showAdd && !showEdit) return undefined;

    if (isDepartmentAdmin) {
      setFormCourses(activeCourses);
      return undefined;
    }

    const deptName = String(form.department || '').trim();
    if (!deptName) {
      setFormCourses([]);
      return undefined;
    }

    const matchedDept = departments.find(
      (d) => String(d.name || '').toLowerCase() === deptName.toLowerCase()
    );
    if (!matchedDept?._id) {
      setFormCourses([]);
      return undefined;
    }

    let cancelled = false;
    api.get('/admin/courses', { params: { department_id: matchedDept._id } })
      .then((r) => {
        if (cancelled) return;
        const items = extractItems(r.data);
        const active = items.filter((c) => String(c.status || 'active').toLowerCase() === 'active');
        setFormCourses(active);
      })
      .catch(() => {
        if (!cancelled) setFormCourses([]);
      });

    return () => {
      cancelled = true;
    };
  }, [showAdd, showEdit, isDepartmentAdmin, form.department, departments, activeCourses]);


  useEffect(() => {
    // Dept admins always have department_id set; super admins fetch all by default
    if (isDepartmentAdmin && !debouncedFilters.department_id) {
      setStudents([]);
      setTotalStudents(0);
      return;
    }

    const previous = previousStudentsQueryRef.current;
    const searchChanged = previous.search !== debouncedSearch;
    const filtersChanged =
      previous.filters.department_id !== debouncedFilters.department_id
      || previous.filters.course_id !== debouncedFilters.course_id
      || previous.filters.paper_id !== debouncedFilters.paper_id
      || previous.filters.semester !== debouncedFilters.semester;
    const inactiveChanged = previous.showInactiveRows !== showInactiveRows;
    const silent = hasFetchedStudentsRef.current && searchChanged && !filtersChanged && !inactiveChanged;

    const controller = new AbortController();
    fetchStudents(1, { signal: controller.signal, silent });

    previousStudentsQueryRef.current = {
      search: debouncedSearch,
      filters: {
        department_id: debouncedFilters.department_id,
        course_id: debouncedFilters.course_id,
        paper_id: debouncedFilters.paper_id,
        semester: debouncedFilters.semester,
      },
      showInactiveRows,
    };
    hasFetchedStudentsRef.current = true;

    return () => controller.abort();
  }, [debouncedFilters, debouncedSearch, showInactiveRows, isDepartmentAdmin, pageSize]);

  useEffect(() => {
    let cancelled = false;
    if (!filters.course_id) {
      setFilterSemesters([]);
      return () => {
        cancelled = true;
      };
    }
    const params = {};
    if (filters.department_id) params.department_id = filters.department_id;
    api.get(`/admin/courses/${filters.course_id}/semesters`, { params })
      .then((r) => {
        if (!cancelled) setFilterSemesters(r.data || []);
      })
      .catch(() => {
        if (!cancelled) setFilterSemesters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.course_id, filters.department_id]);

  useEffect(() => {
    let cancelled = false;
    if (!showBulk || !bulkForm.course_id) {
      setBulkSemesters([]);
      setBulkSessions([]);
      return () => {
        cancelled = true;
      };
    }

    api.get(`/admin/courses/${bulkForm.course_id}/semesters`)
      .then((r) => {
        if (!cancelled) setBulkSemesters(r.data || []);
      })
      .catch(() => {
        if (!cancelled) setBulkSemesters([]);
      });

    api.get(`/admin/courses/${bulkForm.course_id}/sessions`)
      .then((r) => {
        if (!cancelled) setBulkSessions(r.data || []);
      })
      .catch(() => {
        if (!cancelled) setBulkSessions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [showBulk, bulkForm.course_id]);

  useEffect(() => {
    let cancelled = false;
    if (!showBulk) return () => {
      cancelled = true;
    };

    if (!bulkForm.course_id || !bulkForm.semester) {
      setBulkPapers([]);
      setBulkStudents([]);
      return () => {
        cancelled = true;
      };
    }

    api.get('/admin/papers', { params: { course_id: bulkForm.course_id, semester: bulkForm.semester } })
      .then((r) => {
        if (!cancelled) setBulkPapers(extractItems(r.data));
      })
      .catch(() => {
        if (!cancelled) setBulkPapers([]);
      });

    api.get('/admin/students', {
      params: {
        per_page: 2000,
        course_id: bulkForm.course_id,
        semester: bulkForm.semester,
        ...(bulkForm.department_id ? { department_id: bulkForm.department_id } : {}),
        ...(bulkForm.academic_session ? { academic_session: bulkForm.academic_session } : {}),
        ...(showInactiveRows ? { include_inactive: true } : {}),
      },
    })
      .then((r) => {
        if (!cancelled) setBulkStudents(extractItems(r.data));
      })
      .catch(() => {
        if (!cancelled) setBulkStudents([]);
      });

    return () => {
      cancelled = true;
    };
  }, [showBulk, bulkForm.course_id, bulkForm.department_id, bulkForm.academic_session, bulkForm.semester, showInactiveRows]);

  const filtered = useMemo(
    () => (showInactiveRows ? students : students.filter((s) => !s.is_course_inactive)),
    [students, showInactiveRows]
  );

  const subjectOptions = useMemo(() => {
    return papers.filter((p) => {
      const sameCourse = !filters.course_id || p.course_id === filters.course_id;
      const sameSemester = !filters.semester || String(p.semester || '') === String(filters.semester);
      return sameCourse && sameSemester;
    });
  }, [papers, filters.course_id, filters.semester]);


  useEffect(() => {
    if (showInactiveRows) return;

    if (filters.course_id && !activeCourses.some((course) => course._id === filters.course_id)) {
      setFilters((prev) => ({ ...prev, course_id: '', semester: '', paper_id: '' }));
    }

    if (bulkForm.course_id && !activeCourses.some((course) => course._id === bulkForm.course_id)) {
      setBulkForm({ course_id: '', semester: '', paper_id: '', user_ids: [], department_id: '', academic_session: '' });
    }
  }, [activeCourses, bulkForm.course_id, filters.course_id, showInactiveRows]);

  const eligibleBulkStudents = useMemo(() => {
    return bulkStudents.filter((s) => {
      if (s.is_course_inactive) return false;
      
      const enrolledPapers = s.enrolled_papers || [];
      const papersToAssign = bulkAssignAllPapers 
        ? bulkPapers.map(p => p._id)
        : (bulkForm.paper_id ? [bulkForm.paper_id] : []);
        
      // If no papers selected yet, show all active students in the filtered view
      if (papersToAssign.length === 0) return true;

      // A student is eligible if they are missing at least one of the papers we are trying to assign
      const missingPapers = papersToAssign.filter(pid => !enrolledPapers.includes(pid));
      
      return missingPapers.length > 0;
    });
  }, [bulkStudents, bulkAssignAllPapers, bulkPapers, bulkForm.paper_id]);

  useEffect(() => {
    if (!showExcelImport) return;
    if (!excelForm.course_id) {
      setExcelSemesters([]);
      return;
    }
    api.get(`/admin/courses/${excelForm.course_id}/semesters`)
      .then((r) => setExcelSemesters(Array.isArray(r.data) ? r.data.map(Number).sort((a, b) => a - b) : []))
      .catch(() => setExcelSemesters([]));
  }, [showExcelImport, excelForm.course_id]);

  useEffect(() => {
    fetchStudentsRef.current = fetchStudents;
  });

  useEffect(() => {
    if (!trainingJobUrl) return undefined;

    let cancelled = false;
    let timeoutId = null;
    let hideTimer = null;
    let currentDelay = 1000;
    const MAX_DELAY = 10000;

    const syncTrainingJob = async () => {
      if (cancelled) return;
      try {
        const res = await api.get(trainingJobUrl);
        if (cancelled) return;

        const job = res.data || {};
        setTrainingJob(job);
        
        // Reset delay on successful non-terminal response
        currentDelay = 1000;

        const status = String(job.status || '').toLowerCase();
        if (status === 'completed' || status === 'dead_letter' || status === 'cancelled') {
          setTrainingJobUrl('');

          if (status === 'completed') {
            if (fetchStudentsRef.current) {
              fetchStudentsRef.current(1);
            }
          } else if (status === 'cancelled') {
            toast('Face training cancelled');
          } else if (!trainingSyncErrorShown) {
            toast.error(job?.error || 'Face training job failed');
            setTrainingSyncErrorShown(true);
          }

          hideTimer = window.setTimeout(() => {
            if (!cancelled) {
              setTrainingJob(null);
            }
          }, 2200);
          return; // stop polling
        }
      } catch (err) {
        if (!trainingSyncErrorShown) {
          toast.error('Unable to sync training progress right now');
          setTrainingSyncErrorShown(true);
        }
        // Exponential backoff on network errors
        currentDelay = Math.min(currentDelay * 2, MAX_DELAY);
      }
      
      if (!cancelled) {
        timeoutId = window.setTimeout(syncTrainingJob, currentDelay);
      }
    };

    // Initial trigger
    syncTrainingJob();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [trainingJobUrl, trainingSyncErrorShown]);
  useEffect(() => {
    const visibleIds = new Set(filtered.map((s) => s.user_id || s._id));
    setSelectedStudentIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [filtered]);

  const areAllBulkStudentsSelected = eligibleBulkStudents.length > 0 && eligibleBulkStudents.every((s) => {
    const sid = s.user_id || s._id;
    return bulkForm.user_ids.includes(sid);
  });

  const areAllFilteredStudentsSelected = filtered.length > 0 && filtered.every((s) => {
    const sid = s.user_id || s._id;
    return selectedStudentIds.includes(sid);
  });


  return {
    // Auth
    isSuperAdmin, isDepartmentAdmin, departmentId, departmentName,
    // Data
    students, totalStudents, page, courses, formCourses, papers, departments,
    filtered, activeCourses, visibleCourses, departmentOptions, subjectOptions, filterSemesters,
    eligibleBulkStudents, areAllBulkStudentsSelected, areAllFilteredStudentsSelected,
    // State Setters needed by ManageStudents
    showAdd, setShowAdd, showEdit, setShowEdit, showBulk, setShowBulk,
    showCreds, setShowCreds, showFaceEnroll, setShowFaceEnroll,
    showStudentPapers, setShowStudentPapers, showExcelImport, setShowExcelImport,
    showMobileOps, setShowMobileOps, showMobileFilters, setShowMobileFilters,
    showPromoteModal, setShowPromoteModal,
    createdCreds, setCreatedCreds, editingStudent, setEditingStudent,
    enrollingStudent, setEnrollingStudent, paperStudent, setPaperStudent,
    search, setSearch, filters, setFilters, showInactiveRows, setShowInactiveRows,
    form, setForm, bulkForm, setBulkForm,
    bulkAssignAllPapers, setBulkAssignAllPapers, bulkSemesters, bulkSessions, bulkPapers, bulkStudents,
    excelForm, setExcelForm, excelSemesters, excelFile, setExcelFile,
    excelImporting, setExcelImporting, excelResults, setExcelResults, excelFileInputRef,
    promoteSemester, setPromoteSemester, promoteSemesterOptions, setPromoteSemesterOptions,
    loadingPromoteSemesters, setLoadingPromoteSemesters, promotingSelected, setPromotingSelected,
    selectedStudentIds, setSelectedStudentIds,
    trainingStudentId, setTrainingStudentId, bulkTraining, setBulkTraining,
    rebuildingAllFaces, setRebuildingAllFaces,
    trainingJob, setTrainingJob, trainingCancelPending, setTrainingCancelPending,
    setTrainingJobUrl, setTrainingSyncErrorShown,
    loadingStudents, studentsError,
    paperOptions, setPaperOptions, selectedPaperIds, setSelectedPaperIds,
    baseAssignedPaperIds, setBaseAssignedPaperIds,
    loadingStudentPapers, setLoadingStudentPapers, savingStudentPapers, setSavingStudentPapers,
    exportingStudents, setExportingStudents,
    fetchStudents, fetchAllStudentsForExport, buildTempPassword,
    EMPTY_FORM, pageSize, setPageSize
  };
}
