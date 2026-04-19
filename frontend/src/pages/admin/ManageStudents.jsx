import { useMemo, useState, useEffect, useRef } from 'react';
import api from '../../api/axios';
import useAdminPreference from '../../hooks/useAdminPreference';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { formatCourseName } from '../../utils/courseDisplay';
import { exportToExcel, exportToCSV, EXPORT_COLUMN_PRESETS } from '../../utils/excelExport';
import Modal from '../../components/ui/Modal';
import FaceEnrollmentModal from '../../components/admin/FaceEnrollmentModal';
import TrainingProgressPanel from '../../components/admin/TrainingProgressPanel';
import SoftLockWrapper from '../../components/ui/SoftLockWrapper';
import Pagination from '../../components/ui/Pagination';
import StatePanel from '../../components/ui/StatePanel';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import {
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineFilter,
  HiOutlineDotsHorizontal,
  HiOutlineCamera,
  HiOutlineClipboardList,
  HiOutlineTrash,
  HiOutlineKey,
  HiOutlineCheckCircle,
  HiOutlineClipboardCopy,
  HiOutlinePencil,
  HiOutlineArrowUp,
  HiOutlineSparkles,
  HiOutlineDocumentAdd,
  HiOutlineDownload,
} from 'react-icons/hi';

const EMPTY_FORM = {
  name: '',
  email: '',
  course_id: '',
  mobile_no: '',
  reg_number: '',
};
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

export default function ManageStudents() {
  const { isSuperAdmin, isDepartmentAdmin, departmentId, departmentName } = useAuth();
  const [departments, setDepartments] = useState([]);

  const [students, setStudents] = useState([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [page, setPage] = useState(1);
  const [courses, setCourses] = useState([]);
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
  const [bulkForm, setBulkForm] = useState({ course_id: '', semester: '', paper_id: '', user_ids: [] });
  const [bulkAssignAllPapers, setBulkAssignAllPapers] = useState(false);
  const [bulkSemesters, setBulkSemesters] = useState([]);
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
    params.per_page = PAGE_SIZE;
    if (debouncedSearch) params.q = debouncedSearch;
    // Send both department_id and department name for backend filtering
    if (debouncedFilters.department_id) {
      params.department_id = debouncedFilters.department_id;
      const dept = departments.find((d) => d._id === debouncedFilters.department_id);
      if (dept) params.department = dept.name;
    }
    if (debouncedFilters.course_id) params.course_id = debouncedFilters.course_id;
    if (debouncedFilters.paper_id) params.paper_id = debouncedFilters.paper_id;
    if (debouncedFilters.semester) params.semester = debouncedFilters.semester;
    if (showInactiveRows) params.include_inactive = true;
    api.get('/admin/students', { params, signal }).then((r) => {
      const items = Array.isArray(r.data?.items) ? r.data.items : (Array.isArray(r.data) ? r.data : []);
      const resolvedTotal = Number(r.data?.total || items.length || 0);
      const maxPage = Math.max(1, Math.ceil(resolvedTotal / PAGE_SIZE));
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
  }, [debouncedFilters, debouncedSearch, showInactiveRows, isDepartmentAdmin]);

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
    if (!showBulk) return () => {
      cancelled = true;
    };
    if (!bulkForm.course_id) {
      setBulkSemesters([]);
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
        course_id: bulkForm.course_id,
        semester: bulkForm.semester,
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
  }, [showBulk, bulkForm.course_id, bulkForm.semester, showInactiveRows]);

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
    if (showInactiveRows) return;

    if (filters.course_id && !activeCourses.some((course) => course._id === filters.course_id)) {
      setFilters((prev) => ({ ...prev, course_id: '', semester: '', paper_id: '' }));
    }

    if (bulkForm.course_id && !activeCourses.some((course) => course._id === bulkForm.course_id)) {
      setBulkForm({ course_id: '', semester: '', paper_id: '', user_ids: [] });
    }
  }, [activeCourses, bulkForm.course_id, filters.course_id, showInactiveRows]);

  const eligibleBulkStudents = useMemo(
    () => bulkStudents.filter((s) => !s.is_course_inactive),
    [bulkStudents]
  );


  useEffect(() => {
    fetchStudentsRef.current = fetchStudents;
  });

  useEffect(() => {
    if (!trainingJobUrl) return undefined;

    let cancelled = false;
    let intervalId = null;
    let hideTimer = null;

    const syncTrainingJob = async () => {
      try {
        const res = await api.get(trainingJobUrl);
        if (cancelled) return;

        const job = res.data || {};
        setTrainingJob(job);

        const status = String(job.status || '').toLowerCase();
        if (status === 'completed' || status === 'dead_letter' || status === 'cancelled') {
          if (intervalId) window.clearInterval(intervalId);
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
        }
      } catch (err) {
        if (!trainingSyncErrorShown) {
          toast.error('Unable to sync training progress right now');
          setTrainingSyncErrorShown(true);
        }
      }
    };

    syncTrainingJob();
    intervalId = window.setInterval(syncTrainingJob, 1000);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
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

  const handleAdd = async () => {
    // Validate required fields
    if (!form.name?.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!form.email?.trim()) {
      toast.error('Email is required');
      return;
    }
    if (!form.department?.trim()) {
      toast.error('Department is required');
      return;
    }
    if (!form.course_id?.trim()) {
      toast.error('Please select a course');
      return;
    }

    try {
      const initialPassword = buildTempPassword();
      const res = await api.post('/admin/students', { ...form, initial_password: initialPassword });
      const data = res.data;

      setShowAdd(false);
      setForm({ ...EMPTY_FORM, department: isDepartmentAdmin && departmentName ? departmentName : '' });
      if (data?.temp_password) {
        setCreatedCreds({
          reg_number: data.profile?.reg_number || 'N/A',
          temp_password: data.temp_password,
          name: data.name,
        });
        setShowCreds(true);
      }
      toast.success(data?.message || 'Student created');
      fetchStudents(1);
    } catch (err) {
      console.error('Student creation error:', err.response?.data, err.message);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to create student';
      toast.error(errorMsg);
    }
  };

  const openEdit = (student) => {
    setEditingStudent(student);
    setForm({
      name: student.name || '',
      email: student.email || '',
      course_id: student.course_id || '',
      mobile_no: student.mobile_no || '',
      // roll_number removed, use reg_number only
      reg_number: student.reg_number || '',
    });
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    if (!editingStudent) return;
    
    // Validate required fields
    if (!form.name?.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!form.email?.trim()) {
      toast.error('Email is required');
      return;
    }
    if (!form.course_id?.trim()) {
      toast.error('Please select a course');
      return;
    }

    try {
      const sid = editingStudent.user_id || editingStudent._id;
      await api.put(`/admin/students/${sid}`, form);
      toast.success('Student updated');
      setShowEdit(false);
      setEditingStudent(null);
      setForm({ ...EMPTY_FORM, department: isDepartmentAdmin && departmentName ? departmentName : '' });
      fetchStudents(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update student');
    }
  };

  const handleDelete = async (student) => {
    const sid = student.user_id || student._id;
    if (!window.confirm('Delete this student?')) return;
    try {
      await api.delete(`/admin/students/${sid}`);
      toast.success('Deleted');
      fetchStudents(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleResetPassword = async (student) => {
    const sid = student.user_id || student._id;
    if (!window.confirm(`Reset password for ${student.name}?`)) return;
    try {
      const res = await api.post(`/admin/students/${sid}/reset-password`);
      const tempPassword = res.data?.temp_password;
      if (tempPassword) {
        setCreatedCreds({
          reg_number: student.reg_number || student.name,
          temp_password: tempPassword,
          name: student.name,
          isReset: true,
        });
        setShowCreds(true);
      }
      toast.success(res.data?.message || 'Password reset');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleFaceEnroll = (student) => {
    setEnrollingStudent(student);
    setShowFaceEnroll(true);
  };

  const handleManageStudentPapers = async (student) => {
    const courseId = student.course_id;
    const semester = Number(student.current_semester || 0);

    if (!courseId || !semester) {
      toast.error('Student must have course and current semester to manage subjects');
      return;
    }

    const assignedIds = (student.enrolled_papers || []).map((p) => p.paper_id).filter(Boolean);
    setPaperStudent(student);
    setShowStudentPapers(true);
    setLoadingStudentPapers(true);
    setPaperOptions([]);
    setSelectedPaperIds([]);
    setBaseAssignedPaperIds(assignedIds);

    try {
      const res = await api.get('/admin/papers', {
        params: {
          course_id: courseId,
          semester,
        },
      });
      const options = extractItems(res.data);
      const optionIds = new Set(options.map((p) => p._id));
      const currentSemAssigned = assignedIds.filter((id) => optionIds.has(id));
      setPaperOptions(options);
      setSelectedPaperIds(currentSemAssigned);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load subjects for this semester');
      setShowStudentPapers(false);
      setPaperStudent(null);
    } finally {
      setLoadingStudentPapers(false);
    }
  };

  const handleSaveStudentPapers = async () => {
    if (!paperStudent) return;

    const optionIds = new Set(paperOptions.map((p) => p._id));
    const preservedNonCurrentSemester = baseAssignedPaperIds.filter((id) => !optionIds.has(id));
    const mergedPaperIds = [...new Set([...preservedNonCurrentSemester, ...selectedPaperIds])];
    const sid = paperStudent.user_id || paperStudent._id;

    try {
      setSavingStudentPapers(true);
      await api.put(`/admin/students/${sid}`, { enrolled_papers: mergedPaperIds });
      toast.success('Student subjects updated');
      setShowStudentPapers(false);
      setPaperStudent(null);
      setPaperOptions([]);
      setSelectedPaperIds([]);
      setBaseAssignedPaperIds([]);
      fetchStudents(page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update student subjects');
    } finally {
      setSavingStudentPapers(false);
    }
  };

  const handleFaceEnrollSuccess = () => {
    setShowFaceEnroll(false);
    setEnrollingStudent(null);
    fetchStudents(1);
  };

  const normalizeJobStatusUrl = (rawStatusUrl) => {
    const raw = String(rawStatusUrl || '').trim();
    if (!raw) return '';

    // Axios client already has baseURL '/api'. If backend returns '/api/...',
    // convert it to '/...' to avoid '/api/api/...' requests.
    if (raw.startsWith('/api/')) {
      return raw.slice(4);
    }
    if (raw.startsWith('/admin/')) {
      return raw;
    }

    try {
      const parsed = new URL(raw, window.location.origin);
      const path = parsed.pathname || '';
      if (path.startsWith('/api/')) return path.slice(4);
      return path;
    } catch {
      return raw;
    }
  };

  const startTrainingProgress = (response, totalFaces) => {
    const statusUrl = normalizeJobStatusUrl(response.data?.status_url);
    if (!statusUrl) return;

    setTrainingSyncErrorShown(false);
    setTrainingJob({
      job_id: response.data?.job_id,
      status: 'queued',
      training_total_faces: Number(response.data?.requested_count || totalFaces || 0),
      training_processed_faces: 0,
      training_trained_faces: 0,
      training_failed_faces: 0,
      training_stage: 'queued',
      training_message: response.data?.message || 'Queued',
      training_progress_percent: 0,
    });
    setTrainingCancelPending(false);
    setTrainingJobUrl(statusUrl);
  };

  const handleCancelTrainingJob = async () => {
    const jobId = trainingJob?.job_id;
    if (!jobId || trainingCancelPending) return;

    try {
      setTrainingCancelPending(true);
      const res = await api.post(`/admin/jobs/${jobId}/cancel`);
      const updated = res.data?.job;
      if (updated) {
        setTrainingJob(updated);
      }
      toast.success('Cancellation requested');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to cancel training job');
    } finally {
      setTrainingCancelPending(false);
    }
  };

  const handleTrainFace = async (student) => {
    const sid = student.user_id || student._id;
    if (!sid) {
      toast.error('Invalid student id');
      return;
    }

    const ok = window.confirm(`Train face embeddings from dataset for ${student.name}?`);
    if (!ok) return;

    try {
      setTrainingStudentId(sid);
      const res = await api.post(`/admin/students/${sid}/train-face`, { async: true });
      if (res.status === 202 || res.data?.job_id) {
        startTrainingProgress(res, 1);
        toast.success('Face training started');
        return;
      }

      const trained = Number(res.data?.trained_embeddings || 0);
      const skipped = Number(res.data?.skipped_images || 0);
      toast.success(`Training done. Embeddings: ${trained}, skipped images: ${skipped}`);
      fetchStudents(1);
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error('Train Face endpoint not active. Restart backend server once and retry.');
      } else if (err.response?.status === 400) {
        toast.error(err.response?.data?.error || 'Dataset images missing. Please run Enroll Face first.');
      } else {
        toast.error(err.response?.data?.error || 'Failed to train face from dataset');
      }
    } finally {
      setTrainingStudentId('');
    }
  };

  const handleBulkTrainFace = async () => {
    if (selectedStudentIds.length === 0) {
      toast.error('Select at least one student to bulk train');
      return;
    }

    const ok = window.confirm(`Train face embeddings for ${selectedStudentIds.length} selected students?`);
    if (!ok) return;

    try {
      setBulkTraining(true);
      const res = await api.post('/admin/students/train-face/bulk', {
        user_ids: selectedStudentIds,
        async: true,
      });

      if (res.status === 202 || res.data?.job_id) {
        startTrainingProgress(res, selectedStudentIds.length);
        toast.success(`Bulk training queued. Job: ${res.data?.job_id}`);
        return;
      }

      const success = Number(res.data?.success_count || 0);
      const failed = Number(res.data?.failure_count || 0);
      const totalEmbeddings = Number(res.data?.total_trained_embeddings || 0);

      if (failed > 0) {
        const firstError = (res.data?.items || []).find((x) => x?.success === false)?.error;
        toast(`Bulk train done. Success: ${success}, Failed: ${failed}, Embeddings: ${totalEmbeddings}${firstError ? ` | ${firstError}` : ''}`);
      } else {
        toast.success(`Bulk train complete. Success: ${success}, Embeddings: ${totalEmbeddings}`);
      }

      fetchStudents(1);
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error('Bulk train endpoint not active. Restart backend server once and retry.');
      } else {
        toast.error(err.response?.data?.error || 'Failed to bulk train face from dataset');
      }
    } finally {
      setBulkTraining(false);
    }
  };

  const handleRebuildAllFaces = async () => {
    const ok = window.confirm('Rebuild face embeddings for every student from their dataset folders?');
    if (!ok) return;

    try {
      setRebuildingAllFaces(true);
      const res = await api.post('/admin/students/train-face/rebuild-all', { async: true });

      if (res.status === 202 || res.data?.job_id) {
        startTrainingProgress(res, Number(res.data?.requested_count || 0));
        toast.success(`Rebuild queued. Job: ${res.data?.job_id}`);
        return;
      }

      const success = Number(res.data?.success_count || 0);
      const failed = Number(res.data?.failure_count || 0);
      const totalEmbeddings = Number(res.data?.total_trained_embeddings || 0);
      toast.success(`Rebuild complete. Success: ${success}, Failed: ${failed}, Embeddings: ${totalEmbeddings}`);
      fetchStudents(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to rebuild all face embeddings');
    } finally {
      setRebuildingAllFaces(false);
    }
  };

  // ─── Excel import for students ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!showExcelImport || !excelForm.course_id) {
      setExcelSemesters([]);
      return () => { cancelled = true; };
    }
    api.get(`/admin/courses/${excelForm.course_id}/semesters`)
      .then((r) => { if (!cancelled) setExcelSemesters(r.data || []); })
      .catch(() => { if (!cancelled) setExcelSemesters([]); });
    return () => { cancelled = true; };
  }, [showExcelImport, excelForm.course_id]);

  const handleExcelImport = async () => {
    if (!excelForm.course_id) { toast.error('Please select a course'); return; }
    if (!excelForm.semester) { toast.error('Please select a semester'); return; }
    if (!excelFile) { toast.error('Please select an Excel file'); return; }

    const fd = new FormData();
    fd.append('file', excelFile);
    fd.append('course_id', excelForm.course_id);
    fd.append('semester', excelForm.semester);

    try {
      setExcelImporting(true);
      const res = await api.post('/admin/students/import-excel', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setExcelResults(res.data);
      toast.success(res.data.message || 'Import complete');
      fetchStudents(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setExcelImporting(false);
    }
  };

  const openBulkAssignModal = () => {
    setBulkForm({ course_id: '', semester: '', paper_id: '', user_ids: [] });
    setBulkAssignAllPapers(false);
    setBulkSemesters([]);
    setBulkPapers([]);
    setBulkStudents([]);
    setShowBulk(true);
  };

  const handleBulkAssign = async () => {
    if (bulkForm.user_ids.length === 0) {
      toast.error('Select at least one student');
      return;
    }
    if (!bulkAssignAllPapers && !bulkForm.paper_id) {
      toast.error('Select a paper');
      return;
    }
    if (bulkAssignAllPapers && bulkPapers.length === 0) {
      toast.error('No papers found for selected semester');
      return;
    }

    const payload = bulkAssignAllPapers
      ? {
          course_id: bulkForm.course_id,
          semester: bulkForm.semester,
          user_ids: bulkForm.user_ids,
          paper_ids: bulkPapers.map((p) => p._id).filter(Boolean),
        }
      : {
          paper_id: bulkForm.paper_id,
          user_ids: bulkForm.user_ids,
        };

    try {
      const res = await api.post('/admin/papers/bulk-assign', payload);
      const assignedPapers = Number(res.data?.assigned_paper_count || (bulkAssignAllPapers ? bulkPapers.length : 1));
      const updatedStudents = Number(res.data?.updated_count || 0);
      if (updatedStudents <= 0) {
        toast.error(res.data?.error || 'No students were updated');
        return;
      }
      toast.success(`Assigned ${assignedPapers} paper${assignedPapers === 1 ? '' : 's'} to ${updatedStudents} student${updatedStudents === 1 ? '' : 's'}`);
      setShowBulk(false);
      setBulkForm({ course_id: '', semester: '', paper_id: '', user_ids: [] });
      setBulkAssignAllPapers(false);
      setBulkSemesters([]);
      setBulkPapers([]);
      setBulkStudents([]);
      fetchStudents(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Enrollment failed');
    }
  };

  const openPromoteSelectedModal = async () => {
    if (selectedStudentIds.length === 0) {
      toast.error('Select at least one student to promote');
      return;
    }

    const selectedIdSet = new Set(selectedStudentIds.map((id) => String(id)));
    const selectedCourseIds = Array.from(new Set(
      students
        .filter((student) => selectedIdSet.has(String(student.user_id || student._id)))
        .map((student) => String(student.course_id || '').trim())
        .filter(Boolean)
    ));

    setPromoteSemester('');
    setPromoteSemesterOptions([]);
    setShowPromoteModal(true);

    if (selectedCourseIds.length === 0) {
      return;
    }

    setLoadingPromoteSemesters(true);
    try {
      const semesterLists = await Promise.all(
        selectedCourseIds.map((courseId) =>
          api.get(`/admin/courses/${courseId}/semesters`).then((r) => r.data || [])
        )
      );

      const semesterToCourseNames = new Map();
      selectedCourseIds.forEach((courseId, index) => {
        const course = courses.find((item) => item._id === courseId);
        const courseLabel = course
          ? `${course.name || 'Course'}${course.code ? ` (${course.code})` : ''}`
          : 'Course';
        (semesterLists[index] || []).forEach((value) => {
          const semester = Number(value);
          if (!Number.isInteger(semester) || semester <= 0) return;
          const labels = semesterToCourseNames.get(semester) || new Set();
          labels.add(courseLabel);
          semesterToCourseNames.set(semester, labels);
        });
      });

      const options = Array.from(semesterToCourseNames.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([semester, labelSet]) => {
          const labels = Array.from(labelSet);
          const label = selectedCourseIds.length > 1
            ? `Semester ${semester} (${labels.join(', ')})`
            : `Semester ${semester}`;
          return { value: String(semester), label };
        });

      setPromoteSemesterOptions(options);
    } catch {
      setPromoteSemesterOptions([]);
      toast.error('Unable to load semester list right now');
    } finally {
      setLoadingPromoteSemesters(false);
    }
  };

  const handlePromoteSelected = async () => {
    const trimmedSemester = String(promoteSemester || '').trim();
    const parsedTargetSemester = trimmedSemester ? Number(trimmedSemester) : 0;

    if (trimmedSemester && (!Number.isInteger(parsedTargetSemester) || parsedTargetSemester <= 0)) {
      toast.error('Semester must be a positive whole number');
      return;
    }

    setPromotingSelected(true);
    try {
      const fromSemester = Number(filters.semester || 0) || undefined;
      const payload = {
        user_ids: selectedStudentIds,
        from_semester: fromSemester,
      };
      if (parsedTargetSemester > 0) payload.target_semester = parsedTargetSemester;

      const res = await api.post('/admin/student-bulk-promote', payload);
      toast.success(res.data?.message || 'Students promoted');
      setSelectedStudentIds([]);
      setShowPromoteModal(false);
      setPromoteSemester('');
      setPromoteSemesterOptions([]);
      fetchStudents(1);
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 405) {
        toast.error('Bulk promote endpoint not active. Please restart backend server once.');
      } else {
        toast.error(err.response?.data?.error || 'Failed to promote students');
      }
    } finally {
      setPromotingSelected(false);
    }
  };

  const handleExportStudents = async () => {
    if (filtered.length === 0) {
      toast.error('No students to export');
      return;
    }

    setExportingStudents(true);
    try {
      // Transform data to include course names
      const transformedData = filtered.map((student) => {
        const course = courses.find((c) => c._id === student.course_id);
        return {
          ...student,
          course_name: course ? `${course.name}${course.code ? ` (${course.code})` : ''}` : 'N/A',
        };
      });

      // Try Excel export first, fallback to CSV if xlsx not installed
      try {
        await exportToExcel({
          data: transformedData,
          columns: EXPORT_COLUMN_PRESETS.STUDENTS,
          fileName: 'Students',
          sheetName: 'Students',
        });
        toast.success(`Exported ${filtered.length} students to Excel`);
      } catch (xlsxError) {
        if (xlsxError.message.includes('xlsx')) {
          // Fallback to CSV
          exportToCSV({
            data: transformedData,
            columns: EXPORT_COLUMN_PRESETS.STUDENTS,
            fileName: 'Students',
          });
          toast.success(`Exported ${filtered.length} students to CSV (install xlsx for Excel format)`);
        } else {
          throw xlsxError;
        }
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error(err.message || 'Failed to export students');
    } finally {
      setExportingStudents(false);
    }
  };

  const copyCredentials = () => {
    if (!createdCreds) return;
    const identityLabel = createdCreds.isReset ? 'Name' : 'Reg No';
    const identityValue = createdCreds.isReset
      ? (createdCreds.name || createdCreds.reg_number || 'N/A')
      : (createdCreds.reg_number || createdCreds.name || 'N/A');
    const text = `${identityLabel}: ${identityValue}\nTemp Password: ${createdCreds.temp_password}`;
    navigator.clipboard.writeText(text);
    toast.success('Credentials copied');
  };

  const StudentModalBody = ({ onSubmit, submitLabel }) => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Full Name</label>
          <input className="input-field" placeholder="John Doe" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Email</label>
          <input className="input-field" placeholder="student@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Department</label>
          <select
            className="input-field"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            disabled={isDepartmentAdmin}
          >
            <option value="" disabled={isSuperAdmin}>
              {isDepartmentAdmin ? (departmentName || 'Department') : 'All Departments'}
            </option>
            {departments.map((d) => (
              <option key={d._id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Course</label>
          <select className="input-field" value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
            <option value="">Select course</option>
            {activeCourses.filter(c => !form.department || c.department.toLowerCase() === form.department.toLowerCase()).map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })} ({c.code})</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Mobile No (Optional)</label>
          <input className="input-field" placeholder="10-digit mobile number (optional)" value={form.mobile_no} onChange={(e) => setForm({ ...form, mobile_no: e.target.value })} />
        </div>
      </div>

      {showEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Roll No.</label>
            <input
              className="input-field"
              placeholder="Update roll number"
              // roll_number field removed from form
            />
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Registration No.</label>
            <input
              className="input-field"
              placeholder="Update registration number"
              value={form.reg_number || ''}
              onChange={(e) => setForm({ ...form, reg_number: e.target.value })}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn-secondary" onClick={() => { setShowAdd(false); setShowEdit(false); }}>Cancel</button>
        <button className="btn-primary" onClick={onSubmit}>{submitLabel}</button>
      </div>
    </>
  );

  return (
    <div className="admin-page">
      <TrainingProgressPanel
        job={trainingJob}
        onCancel={handleCancelTrainingJob}
        cancelling={trainingCancelPending}
      />

      <div className="students-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Students</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{totalStudents} students in current filter</p>
        </div>
        <div className="students-toolbar-actions students-toolbar-actions-extra" style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={handleRebuildAllFaces} disabled={rebuildingAllFaces}>
            <HiOutlineSparkles size={16} /> {rebuildingAllFaces ? 'Rebuilding...' : 'Rebuild All Faces'}
          </button>
          <button className="btn-secondary" onClick={handleBulkTrainFace} disabled={selectedStudentIds.length === 0 || bulkTraining}>
            <HiOutlineSparkles size={16} /> {bulkTraining ? 'Training...' : `Bulk Train Face (${selectedStudentIds.length})`}
          </button>
          <button className="btn-secondary" onClick={openPromoteSelectedModal} disabled={selectedStudentIds.length === 0}>
            <HiOutlineArrowUp size={16} /> Promote Selected ({selectedStudentIds.length})
          </button>
          <button className="btn-secondary" onClick={openBulkAssignModal}>
            <HiOutlineClipboardList size={16} /> Bulk Assign Subject
          </button>
          <button className="btn-secondary" onClick={handleExportStudents} disabled={filtered.length === 0 || exportingStudents} title="Export filtered students to Excel">
            <HiOutlineDownload size={16} /> {exportingStudents ? 'Exporting...' : `Export (${filtered.length})`}
          </button>
        </div>
      </div>

      <div className="students-toolbar-actions students-toolbar-actions-primary" style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <button className="btn-secondary" title="Import students from Excel" onClick={() => {
            setExcelForm({ course_id: '', semester: '' });
            setExcelFile(null);
            setExcelResults(null);
            if (excelFileInputRef.current) excelFileInputRef.current.value = '';
            setShowExcelImport(true);
          }}>
            <HiOutlineDocumentAdd size={16} /> Import Excel
          </button>
          <button className="btn-primary" onClick={() => { setForm({ ...EMPTY_FORM, department: isDepartmentAdmin && departmentName ? departmentName : '' }); setShowAdd(true); }}>
            <HiOutlinePlus size={16} /> Add Student
          </button>
        </div>

      <Pagination page={page} total={totalStudents} perPage={PAGE_SIZE} onPageChange={fetchStudents} />

      <div className="mobile-admin-action-strip">
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
          title="More actions"
          aria-label="More actions"
          onClick={() => setShowMobileOps(true)}
        >
          <HiOutlineDotsHorizontal size={18} />
        </button>
      </div>

      <div className={`students-filter-grid ${showMobileFilters ? 'is-mobile-open' : ''}`} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div style={{ position: 'relative' }}>
          <HiOutlineSearch size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="search-input"
            placeholder="Search by name, reg no, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
          <option value="">
            {isDepartmentAdmin ? (departmentName || 'Department') : 'All Departments'}
          </option>
          {departmentOptions.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>

        <select
          className="input-field"
          value={filters.course_id}
          onChange={(e) => setFilters({ ...filters, course_id: e.target.value, semester: '', paper_id: '' })}
          disabled={!filters.department_id && isSuperAdmin}
        >
          <option value="">All Courses</option>
          {visibleCourses.map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })}</option>)}
        </select>

        <select
          className="input-field"
          value={filters.semester}
          onChange={(e) => setFilters({ ...filters, semester: e.target.value, paper_id: '' })}
          disabled={!filters.course_id}
        >
          <option value="">All Semesters</option>
          {filterSemesters.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
        </select>

        <select
          className="input-field"
          value={filters.paper_id}
          onChange={(e) => setFilters({ ...filters, paper_id: e.target.value })}
          disabled={!filters.course_id || !filters.semester}
        >
          <option value="">All Subjects</option>
          {subjectOptions.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
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

      <div className="glass-card">
        {loadingStudents ? (
          <StatePanel variant="loading" title="Loading students" description="Fetching student records and enrollment status." compact />
        ) : null}

        {studentsError ? (
          <StatePanel variant="error" title="Unable to load students" description={studentsError} actionLabel="Retry" onAction={() => setFilters({ ...filters })} compact />
        ) : null}

        {!loadingStudents && !studentsError && filtered.length === 0 ? (
          <StatePanel variant="empty" title="No students found" description="Try adjusting filters or add a new student." compact />
        ) : null}

        {!loadingStudents && !studentsError && filtered.length > 0 ? (
        <div className="table-scroll students-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={areAllFilteredStudentsSelected}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedStudentIds(filtered.map((s) => s.user_id || s._id));
                    } else {
                      setSelectedStudentIds([]);
                    }
                  }}
                />
              </th>
              <th>Reg No.</th>
              <th>Name</th>
              <th>Email</th>
              <th>Mobile</th>
              <th>Current Sem</th>
              <th>Course / Session</th>
              <th>Papers</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s._id} className={s.is_course_inactive ? 'faded-entity' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedStudentIds.includes(s.user_id || s._id)}
                    onChange={(e) => {
                      const sid = s.user_id || s._id;
                      if (e.target.checked) {
                        setSelectedStudentIds((prev) => [...new Set([...prev, sid])]);
                      } else {
                        setSelectedStudentIds((prev) => prev.filter((id) => id !== sid));
                      }
                    }}
                  />
                </td>
                <td><span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>{s.reg_number || 'N/A'}</span></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: 'var(--gradient-cool)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      color: '#fff',
                      flexShrink: 0,
                    }}>
                      {s.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{s.name}</span>
                  </div>
                </td>
                <td>{s.email}</td>
                <td>{s.mobile_no || 'N/A'}</td>
                <td>{s.current_semester ? `Semester ${s.current_semester}` : 'N/A'}</td>
                <td>{s.course_name ? `${formatCourseName(s.course_name, { isInactive: s.is_course_inactive })} · ${s.academic_session || 'N/A'}` : 'N/A'}</td>
                <td>{(s.enrolled_papers || []).length}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`badge ${s.has_face ? 'badge-success' : 'badge-warning'}`}>
                    {s.has_face ? 'Face Ready' : 'No Face'}
                  </span>
                </td>
                <td>
                  <SoftLockWrapper locked={s.is_course_inactive} title="Locked: course inactive">
                    <div className="students-row-actions" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        className="icon-btn"
                        title={s.is_course_inactive ? 'Locked: course inactive' : 'Train Face From Dataset'}
                        onClick={() => handleTrainFace(s)}
                        disabled={s.is_course_inactive || trainingStudentId === (s.user_id || s._id)}
                      >
                        <HiOutlineSparkles size={15} />
                      </button>
                      <button className="icon-btn" title={s.is_course_inactive ? 'Locked: course inactive' : 'Manage Subjects'} onClick={() => handleManageStudentPapers(s)} disabled={s.is_course_inactive}>
                        <HiOutlineClipboardList size={15} />
                      </button>
                      <button className="icon-btn" title={s.is_course_inactive ? 'Locked: course inactive' : 'Edit'} onClick={() => openEdit(s)} disabled={s.is_course_inactive}>
                        <HiOutlinePencil size={15} />
                      </button>
                      <button className="icon-btn" title={s.is_course_inactive ? 'Locked: course inactive' : 'Reset Password'} onClick={() => handleResetPassword(s)} disabled={s.is_course_inactive}>
                        <HiOutlineKey size={15} />
                      </button>
                      <button className="icon-btn" title={s.is_course_inactive ? 'Locked: course inactive' : 'Enroll Face'} onClick={() => handleFaceEnroll(s)} disabled={s.is_course_inactive}>
                        <HiOutlineCamera size={15} />
                      </button>
                      <button className="icon-btn danger" title={s.is_course_inactive ? 'Locked: course inactive' : 'Delete'} onClick={() => handleDelete(s)} disabled={s.is_course_inactive}>
                        <HiOutlineTrash size={15} />
                      </button>
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

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Student" width={560}>
        {StudentModalBody({ onSubmit: handleAdd, submitLabel: 'Create Student' })}
      </Modal>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Student" width={560}>
        {StudentModalBody({ onSubmit: handleUpdate, submitLabel: 'Save Changes' })}
      </Modal>

      <Modal isOpen={showCreds} onClose={() => setShowCreds(false)} title="" width={460}>
        <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <HiOutlineCheckCircle size={22} style={{ color: 'var(--accent-emerald)' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
              {createdCreds?.isReset ? 'Password Reset' : 'Student Created'}
            </h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20 }}>
            Share these credentials securely.
          </p>

          <div style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-glass)',
            borderRadius: 'var(--radius)',
            padding: '16px 20px',
            marginBottom: 16,
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {createdCreds?.isReset ? 'Name:' : 'Reg No:'}
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{createdCreds?.isReset ? createdCreds?.name : createdCreds?.reg_number}</span>
            </div>
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

      <Modal isOpen={showMobileOps} onClose={() => setShowMobileOps(false)} title="Student Operations" width={420}>
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
          <button className="btn-secondary" onClick={() => { setShowMobileOps(false); handleRebuildAllFaces(); }} disabled={rebuildingAllFaces}>
            <HiOutlineSparkles size={16} /> {rebuildingAllFaces ? 'Rebuilding...' : 'Rebuild All Faces'}
          </button>
          <button className="btn-secondary" onClick={() => { setShowMobileOps(false); handleBulkTrainFace(); }} disabled={selectedStudentIds.length === 0 || bulkTraining}>
            <HiOutlineSparkles size={16} /> {bulkTraining ? 'Training...' : `Bulk Train Face (${selectedStudentIds.length})`}
          </button>
          <button className="btn-secondary" onClick={() => { setShowMobileOps(false); openPromoteSelectedModal(); }} disabled={selectedStudentIds.length === 0}>
            <HiOutlineArrowUp size={16} /> Promote Selected ({selectedStudentIds.length})
          </button>
          <button className="btn-secondary" onClick={() => { setShowMobileOps(false); openBulkAssignModal(); }}>
            <HiOutlineClipboardList size={16} /> Bulk Assign Subject
          </button>
          <button className="btn-secondary" onClick={() => { setShowMobileOps(false); handleExportStudents(); }} disabled={filtered.length === 0 || exportingStudents}>
            <HiOutlineDownload size={16} /> {exportingStudents ? 'Exporting...' : `Export (${filtered.length})`}
          </button>
        </div>
      </Modal>

      <Modal isOpen={showPromoteModal} onClose={() => { if (!promotingSelected) { setShowPromoteModal(false); setPromoteSemesterOptions([]); } }} title="Promote Selected Students" width={440}>
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            Leave semester blank to auto-promote each student to next semester.
          </p>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>
              Target Semester (optional)
            </label>
            <select
              className="input-field"
              value={promoteSemester}
              onChange={(e) => setPromoteSemester(e.target.value)}
              disabled={loadingPromoteSemesters}
            >
              <option value="">Auto next semester</option>
              {promoteSemesterOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn-secondary" onClick={() => { setShowPromoteModal(false); setPromoteSemesterOptions([]); }} disabled={promotingSelected}>Cancel</button>
            <button className="btn-primary" onClick={handlePromoteSelected} disabled={promotingSelected}>
              {promotingSelected ? 'Promoting...' : `Promote ${selectedStudentIds.length}`}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showBulk} onClose={() => setShowBulk(false)} title="Bulk Assign Paper" width={520}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 1: Course</label>
          <select
            className="input-field"
            value={bulkForm.course_id}
            onChange={(e) => {
              setBulkAssignAllPapers(false);
              setBulkForm({ course_id: e.target.value, semester: '', paper_id: '', user_ids: [] });
            }}
          >
            <option value="">Select course</option>
            {visibleCourses.map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })} ({c.code})</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 2: Semester</label>
          <select
            className="input-field"
            value={bulkForm.semester}
            onChange={(e) => {
              setBulkAssignAllPapers(false);
              setBulkForm({ ...bulkForm, semester: e.target.value, paper_id: '', user_ids: [] });
            }}
            disabled={!bulkForm.course_id}
          >
            <option value="">Select semester</option>
            {bulkSemesters.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 3: Paper</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={bulkAssignAllPapers}
              disabled={!bulkForm.semester || bulkPapers.length === 0}
              onChange={(e) => {
                const checked = e.target.checked;
                setBulkAssignAllPapers(checked);
                if (checked) {
                  setBulkForm({ ...bulkForm, paper_id: '' });
                }
              }}
            />
            Assign all papers in selected semester ({bulkPapers.length})
          </label>
          <select
            className="input-field"
            value={bulkForm.paper_id}
            onChange={(e) => setBulkForm({ ...bulkForm, paper_id: e.target.value })}
            disabled={!bulkForm.semester || bulkAssignAllPapers}
          >
            <option value="">Select paper</option>
            {bulkPapers.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.code})</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Step 4: Eligible Students</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              disabled={eligibleBulkStudents.length === 0}
              checked={areAllBulkStudentsSelected}
              onChange={(e) => {
                if (e.target.checked) {
                  setBulkForm({ ...bulkForm, user_ids: eligibleBulkStudents.map((s) => s.user_id || s._id) });
                } else {
                  setBulkForm({ ...bulkForm, user_ids: [] });
                }
              }}
            />
            Select All
          </label>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: 8 }}>
            {eligibleBulkStudents.map((s) => {
              const sid = s.user_id || s._id;
              return (
                <label key={s._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', fontSize: '0.82rem' }}>
                  <input
                    type="checkbox"
                    checked={bulkForm.user_ids.includes(sid)}
                    onChange={(e) => {
                      const ids = e.target.checked
                        ? [...bulkForm.user_ids, sid]
                        : bulkForm.user_ids.filter((id) => id !== sid);
                      setBulkForm({ ...bulkForm, user_ids: ids });
                    }}
                  />
                  {s.name} ({s.reg_number || 'N/A'})
                </label>
              );
            })}
            {eligibleBulkStudents.length === 0 && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 6px' }}>
                Select course and semester to load eligible students.
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-secondary" onClick={() => setShowBulk(false)}>Cancel</button>
          <button className="btn-primary" onClick={handleBulkAssign}>Assign</button>
        </div>
      </Modal>

      <Modal
        isOpen={showStudentPapers}
        onClose={() => {
          if (savingStudentPapers) return;
          setShowStudentPapers(false);
          setPaperStudent(null);
          setPaperOptions([]);
          setSelectedPaperIds([]);
          setBaseAssignedPaperIds([]);
        }}
        title="Manage Student Subjects"
        width={560}
      >
        <div style={{ marginBottom: 10, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
          <strong>{paperStudent?.name || 'Student'}</strong>
          {paperStudent?.current_semester ? ` · Semester ${paperStudent.current_semester}` : ''}
        </div>

        {loadingStudentPapers ? (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading subjects...</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Selected: {selectedPaperIds.length} / {paperOptions.length}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setSelectedPaperIds(paperOptions.map((paper) => paper._id))}
                  disabled={paperOptions.length === 0 || selectedPaperIds.length === paperOptions.length}
                >
                  Select All
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setSelectedPaperIds([])}
                  disabled={selectedPaperIds.length === 0}
                >
                  Clear All
                </button>
              </div>
            </div>

            <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: 8, marginBottom: 14 }}>
              {paperOptions.map((paper) => (
                <label key={paper._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', cursor: 'pointer', fontSize: '0.84rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedPaperIds.includes(paper._id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPaperIds((prev) => [...new Set([...prev, paper._id])]);
                      } else {
                        setSelectedPaperIds((prev) => prev.filter((id) => id !== paper._id));
                      }
                    }}
                  />
                  {paper.name} ({paper.code || 'NA'})
                </label>
              ))}
              {paperOptions.length === 0 && (
                <p style={{ margin: 0, padding: '6px 8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  No subjects found for this student's current semester.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowStudentPapers(false);
                  setPaperStudent(null);
                  setPaperOptions([]);
                  setSelectedPaperIds([]);
                  setBaseAssignedPaperIds([]);
                }}
                disabled={savingStudentPapers}
              >
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveStudentPapers} disabled={savingStudentPapers || loadingStudentPapers}>
                {savingStudentPapers ? 'Saving...' : 'Save Subjects'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {showFaceEnroll && enrollingStudent && (
        <FaceEnrollmentModal
          student={enrollingStudent}
          onClose={() => setShowFaceEnroll(false)}
          onSuccess={handleFaceEnrollSuccess}
        />
      )}

      {/* ─── Excel Import Modal ───────────────────────────────────────────── */}
      <Modal
        isOpen={showExcelImport}
        onClose={() => { if (!excelImporting) { setShowExcelImport(false); setExcelResults(null); } }}
        title="Import Students from Excel"
        width={580}
      >
        {!excelResults ? (
          <>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              Upload an <strong>.xlsx</strong> file with columns:
              {' '}<code>Name</code>, <code>RollNo</code>, <code>RegdNo</code>, <code>Email</code>,
              {' '}<code>PhoneNo</code> (optional). Name, RegdNo, and Email are mandatory.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Course *</label>
                <select
                  className="input-field"
                  value={excelForm.course_id}
                  onChange={(e) => setExcelForm({ course_id: e.target.value, semester: '' })}
                >
                  <option value="">Select course</option>
                  {activeCourses.map((c) => (
                    <option key={c._id} value={c._id}>
                      {formatCourseName(c.name, { status: c.status })} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Semester *</label>
                <select
                  className="input-field"
                  value={excelForm.semester}
                  onChange={(e) => setExcelForm({ ...excelForm, semester: e.target.value })}
                  disabled={!excelForm.course_id}
                >
                  <option value="">Select semester</option>
                  {excelSemesters.map((s) => (
                    <option key={s} value={String(s)}>Semester {s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
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
              <code>Name</code> · <code>RollNo</code> · <code>RegdNo</code> · <code>Email</code> · <code>PhoneNo</code>
              <br />
              Duplicate emails are skipped automatically. Each student gets an auto-generated temporary password.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn-secondary" onClick={() => setShowExcelImport(false)} disabled={excelImporting}>Cancel</button>
              <button className="btn-primary" onClick={handleExcelImport} disabled={excelImporting || !excelForm.course_id || !excelForm.semester || !excelFile}>
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
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
                <table className="data-table" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Temp Password / Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excelResults.results.map((r) => (
                      <tr key={r.row} style={{ opacity: r.status === 'skipped' || r.status === 'error' ? 0.65 : 1 }}>
                        <td>{r.row}</td>
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
                        <td style={{ fontFamily: r.temp_password ? 'monospace' : 'inherit', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {r.temp_password || r.reason || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
