import api from '../../api/axios';
import { exportToExcel, exportToCSV, EXPORT_COLUMN_PRESETS } from '../../utils/excelExport';
import toast from 'react-hot-toast';
import { useState } from 'react';
import useStudentData from './students/useStudentData';
import StudentContext from './students/StudentContext';
import TrainingProgressPanel from '../../components/admin/TrainingProgressPanel';
import StudentTable from './students/StudentTable';
import StudentFormModal from './students/StudentFormModal';
import CredentialsModal from './students/CredentialsModal';
import PromoteStudentsModal from './students/PromoteStudentsModal';
import BulkAssignModal from './students/BulkAssignModal';
import AssignStudentPapersModal from './students/AssignStudentPapersModal';
import StudentExcelImportModal from './students/StudentExcelImportModal';
import FaceEnrollmentModal from '../../components/admin/FaceEnrollmentModal';
import FaceSearchModal from '../../components/admin/FaceSearchModal';
import Modal from '../../components/ui/Modal';
import { formatCourseName } from '../../utils/courseDisplay';
import {
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineFilter,
  HiOutlineDotsHorizontal,
  HiOutlineSparkles,
  HiOutlineArrowUp,
  HiOutlineClipboardList,
  HiOutlineDownload,
  HiOutlineDocumentAdd,
  HiOutlineTrash,
  HiOutlineCamera,
} from 'react-icons/hi';

const extractItems = (data) => (Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []));

export default function ManageStudents() {
  const ctx = useStudentData();
  
  const {
    isSuperAdmin, isDepartmentAdmin, departmentName, departments,
    students, totalStudents, page, courses, formCourses,
    activeCourses, visibleCourses, departmentOptions, subjectOptions, filterSemesters,
    eligibleBulkStudents, areAllBulkStudentsSelected,
    showAdd, setShowAdd, showEdit, setShowEdit, showBulk, setShowBulk,
    showCreds, setShowCreds, showFaceEnroll, setShowFaceEnroll,
    showStudentPapers, setShowStudentPapers, showExcelImport, setShowExcelImport,
    showMobileOps, setShowMobileOps, showMobileFilters, setShowMobileFilters,
    showPromoteModal, setShowPromoteModal,
    createdCreds, setCreatedCreds, editingStudent, setEditingStudent,
    enrollingStudent, setEnrollingStudent, paperStudent, setPaperStudent,
    search, setSearch, filters, setFilters, showInactiveRows, setShowInactiveRows,
    form, setForm, bulkForm, setBulkForm,
    bulkAssignAllPapers, setBulkAssignAllPapers, bulkSemesters, bulkPapers,
    excelForm, setExcelForm, excelSemesters, excelFile, setExcelFile,
    excelImporting, setExcelImporting, excelResults, setExcelResults, excelFileInputRef,
    promoteSemester, setPromoteSemester, promoteSemesterOptions, setPromoteSemesterOptions,
    loadingPromoteSemesters, setLoadingPromoteSemesters, promotingSelected, setPromotingSelected,
    selectedStudentIds, setSelectedStudentIds,
    setTrainingStudentId, bulkTraining, setBulkTraining,
    rebuildingAllFaces, setRebuildingAllFaces,
    trainingJob, setTrainingJob, trainingCancelPending, setTrainingCancelPending,
    setTrainingJobUrl, setTrainingSyncErrorShown,
    paperOptions, setPaperOptions, selectedPaperIds, setSelectedPaperIds,
    baseAssignedPaperIds, setBaseAssignedPaperIds,
    loadingStudentPapers, setLoadingStudentPapers, savingStudentPapers, setSavingStudentPapers,
    exportingStudents, setExportingStudents,
    fetchStudents, fetchAllStudentsForExport, buildTempPassword,
    EMPTY_FORM, PAGE_SIZE
  } = ctx;
  const [deleteStudent, setDeleteStudent] = useState(null);
  const [showFaceSearch, setShowFaceSearch] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  // ─── HANDLERS ────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!form.name?.trim()) { toast.error('Full name is required'); return; }
    if (!form.email?.trim()) { toast.error('Email is required'); return; }
    if (!form.department?.trim()) { toast.error('Department is required'); return; }
    if (!form.course_id?.trim()) { toast.error('Please select a course'); return; }

    try {
      const initialPassword = buildTempPassword();
      const res = await api.post('/admin/students', { ...form, initial_password: initialPassword });
      const data = res.data;

      setShowAdd(false);
      setForm({ ...EMPTY_FORM, department: isDepartmentAdmin && departmentName ? departmentName : '' });
      if (data?.temp_password) {
        setCreatedCreds({ reg_number: data.profile?.reg_number || 'N/A', temp_password: data.temp_password, name: data.name });
        setShowCreds(true);
      }
      toast.success(data?.message || 'Student created');
      fetchStudents(1);
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to create student');
    }
  };

  const openEdit = (student) => {
    const course = courses.find((c) => c._id === student.course_id) || null;
    const resolvedDepartmentName = String(student.department || course?.department || departmentName || '').trim();

    setEditingStudent(student);
    setForm({
      name: student.name || '', email: student.email || '', department: resolvedDepartmentName,
      course_id: student.course_id || '', mobile_no: student.mobile_no || '', reg_number: student.reg_number || '',
    });
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    if (!editingStudent) return;
    if (!form.name?.trim()) { toast.error('Full name is required'); return; }
    if (!form.email?.trim()) { toast.error('Email is required'); return; }
    if (!form.course_id?.trim()) { toast.error('Please select a course'); return; }

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

  const handleDeleteClick = (student) => {
    setDeleteStudent(student);
  };

  const handleDeleteProfile = async () => {
    if (!deleteStudent) return;
    const sid = deleteStudent.user_id || deleteStudent._id;
    try {
      await api.delete(`/admin/students/${sid}`);
      toast.success('Deleted profile');
      setDeleteStudent(null);
      fetchStudents(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete profile');
    }
  };

  const handleDeleteFaceProfile = async () => {
    if (!deleteStudent) return;
    const sid = deleteStudent.user_id || deleteStudent._id;
    try {
      await api.delete(`/admin/students/${sid}/face`);
      toast.success('Face profile deleted');
      setDeleteStudent(null);
      fetchStudents(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete face profile');
    }
  };

  const handleResetPassword = (student) => {
    const sid = student.user_id || student._id;
    setConfirmAction({
      title: 'Reset Password',
      message: `Are you sure you want to reset the password for ${student.name}?`,
      confirmLabel: 'Reset',
      onConfirm: async () => {
        try {
          const res = await api.post(`/admin/students/${sid}/reset-password`);
          const tempPassword = res.data?.temp_password;
          if (tempPassword) {
            setCreatedCreds({ reg_number: student.reg_number || student.name, temp_password: tempPassword, name: student.name, isReset: true });
            setShowCreds(true);
          }
          toast.success(res.data?.message || 'Password reset');
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to reset password');
        }
      },
    });
  };

  const handleFaceEnroll = (student) => {
    setEnrollingStudent(student);
    setShowFaceEnroll(true);
  };

  const handleFaceEnrollSuccess = () => {
    setShowFaceEnroll(false);
    setEnrollingStudent(null);
    fetchStudents(1);
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
      const res = await api.get('/admin/papers', { params: { course_id: courseId, semester } });
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

  const normalizeJobStatusUrl = (rawStatusUrl) => {
    const raw = String(rawStatusUrl || '').trim();
    if (!raw) return '';
    if (raw.startsWith('/api/')) return raw.slice(4);
    if (raw.startsWith('/admin/')) return raw;
    try {
      const parsed = new URL(raw, window.location.origin);
      const path = parsed.pathname || '';
      return path.startsWith('/api/') ? path.slice(4) : path;
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
      if (res.data?.job) setTrainingJob(res.data.job);
      toast.success('Cancellation requested');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to cancel training job');
    } finally {
      setTrainingCancelPending(false);
    }
  };

  const handleTrainFace = (student) => {
    const sid = student.user_id || student._id;
    if (!sid) { toast.error('Invalid student id'); return; }
    setConfirmAction({
      title: 'Train Face',
      message: `Train face embeddings from dataset for ${student.name}?`,
      confirmLabel: 'Train',
      onConfirm: async () => {
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
          if (err.response?.status === 404) toast.error('Train Face endpoint not active. Restart backend server once and retry.');
          else if (err.response?.status === 400) toast.error(err.response?.data?.error || 'Dataset images missing. Please run Enroll Face first.');
          else toast.error(err.response?.data?.error || 'Failed to train face from dataset');
        } finally {
          setTrainingStudentId('');
        }
      },
    });
  };

  const handleBulkTrainFace = () => {
    if (selectedStudentIds.length === 0) { toast.error('Select at least one student to bulk train'); return; }
    setConfirmAction({
      title: 'Bulk Train Face',
      message: `Train face embeddings for ${selectedStudentIds.length} selected students?`,
      confirmLabel: 'Train All',
      onConfirm: async () => {
        try {
          setBulkTraining(true);
          const res = await api.post('/admin/students/train-face/bulk', { user_ids: selectedStudentIds, async: true });
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
          if (err.response?.status === 404) toast.error('Bulk train endpoint not active. Restart backend server once and retry.');
          else toast.error(err.response?.data?.error || 'Failed to bulk train face from dataset');
        } finally {
          setBulkTraining(false);
        }
      },
    });
  };

  const handleRebuildAllFaces = () => {
    setConfirmAction({
      title: 'Rebuild All Faces',
      message: 'Rebuild face embeddings for every student from their dataset folders? This may take a while.',
      confirmLabel: 'Rebuild All',
      onConfirm: async () => {
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
      },
    });
  };

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
      const res = await api.post('/admin/students/import-excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
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
    setShowBulk(true);
  };

  const handleBulkAssign = async () => {
    if (bulkForm.user_ids.length === 0) { toast.error('Select at least one student'); return; }
    if (!bulkAssignAllPapers && !bulkForm.paper_id) { toast.error('Select a paper'); return; }
    if (bulkAssignAllPapers && bulkPapers.length === 0) { toast.error('No papers found for selected semester'); return; }

    const payload = bulkAssignAllPapers
      ? { course_id: bulkForm.course_id, semester: bulkForm.semester, user_ids: bulkForm.user_ids, paper_ids: bulkPapers.map((p) => p._id).filter(Boolean) }
      : { paper_id: bulkForm.paper_id, user_ids: bulkForm.user_ids };

    try {
      const res = await api.post('/admin/papers/bulk-assign', payload);
      const assignedPapers = Number(res.data?.assigned_paper_count || (bulkAssignAllPapers ? bulkPapers.length : 1));
      const updatedStudents = Number(res.data?.updated_count || 0);
      if (updatedStudents <= 0) { toast.error(res.data?.error || 'No students were updated'); return; }
      toast.success(`Assigned ${assignedPapers} paper${assignedPapers === 1 ? '' : 's'} to ${updatedStudents} student${updatedStudents === 1 ? '' : 's'}`);
      setShowBulk(false);
      setBulkForm({ course_id: '', semester: '', paper_id: '', user_ids: [] });
      setBulkAssignAllPapers(false);
      fetchStudents(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Enrollment failed');
    }
  };

  const openPromoteSelectedModal = async () => {
    if (selectedStudentIds.length === 0) { toast.error('Select at least one student to promote'); return; }

    const selectedIdSet = new Set(selectedStudentIds.map((id) => String(id)));
    const selectedCourseIds = Array.from(new Set(
      students.filter((student) => selectedIdSet.has(String(student.user_id || student._id)))
              .map((student) => String(student.course_id || '').trim()).filter(Boolean)
    ));

    setPromoteSemester('');
    setPromoteSemesterOptions([]);
    setShowPromoteModal(true);

    if (selectedCourseIds.length === 0) return;

    setLoadingPromoteSemesters(true);
    try {
      const semesterLists = await Promise.all(
        selectedCourseIds.map((courseId) => api.get(`/admin/courses/${courseId}/semesters`).then((r) => r.data || []))
      );

      const semesterToCourseNames = new Map();
      selectedCourseIds.forEach((courseId, index) => {
        const course = courses.find((item) => item._id === courseId);
        const courseLabel = course ? `${course.name || 'Course'}${course.code ? ` (${course.code})` : ''}` : 'Course';
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
          const label = selectedCourseIds.length > 1 ? `Semester ${semester} (${labels.join(', ')})` : `Semester ${semester}`;
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
      toast.error('Semester must be a positive whole number'); return;
    }

    setPromotingSelected(true);
    try {
      const fromSemester = Number(filters.semester || 0) || undefined;
      const payload = { user_ids: selectedStudentIds, from_semester: fromSemester };
      if (parsedTargetSemester > 0) payload.target_semester = parsedTargetSemester;

      const res = await api.post('/admin/student-bulk-promote', payload);
      toast.success(res.data?.message || 'Students promoted');
      setSelectedStudentIds([]);
      setShowPromoteModal(false);
      setPromoteSemester('');
      setPromoteSemesterOptions([]);
      fetchStudents(1);
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 405) toast.error('Bulk promote endpoint not active. Please restart backend server once.');
      else toast.error(err.response?.data?.error || 'Failed to promote students');
    } finally {
      setPromotingSelected(false);
    }
  };

  const handleExportStudents = async () => {
    setExportingStudents(true);
    try {
      const allStudents = await fetchAllStudentsForExport();
      if (allStudents.length === 0) { toast.error('No students to export'); return; }

      const transformedData = allStudents.map((student) => {
        const course = courses.find((c) => c._id === student.course_id);
        return {
          ...student,
          course_name: course ? `${course.name}${course.code ? ` (${course.code})` : ''}` : 'N/A',
        };
      });

      try {
        await exportToExcel({ data: transformedData, columns: EXPORT_COLUMN_PRESETS.STUDENTS, fileName: 'Students', sheetName: 'Students' });
        toast.success(`Exported ${allStudents.length} students to Excel`);
      } catch (xlsxError) {
        if (xlsxError.message.includes('xlsx')) {
          exportToCSV({ data: transformedData, columns: EXPORT_COLUMN_PRESETS.STUDENTS, fileName: 'Students' });
          toast.success(`Exported ${allStudents.length} students to CSV`);
        } else throw xlsxError;
      }
    } catch (err) {
      toast.error(err.message || 'Failed to export students');
    } finally {
      setExportingStudents(false);
    }
  };

  const copyCredentials = () => {
    if (!createdCreds) return;
    const identityLabel = createdCreds.isReset ? 'Name' : 'Reg No';
    const identityValue = createdCreds.isReset ? (createdCreds.name || createdCreds.reg_number || 'N/A') : (createdCreds.reg_number || createdCreds.name || 'N/A');
    const text = `${identityLabel}: ${identityValue}\nTemp Password: ${createdCreds.temp_password}`;
    navigator.clipboard.writeText(text);
    toast.success('Credentials copied');
  };

  // ─── RENDER ────────────────────────────────────────────────────────────

  const contextValue = {
    ...ctx,
    handleTrainFace,
    handleManageStudentPapers,
    openEdit,
    handleResetPassword,
    handleFaceEnroll,
    handleDelete: handleDeleteClick
  };

  return (
    <StudentContext.Provider value={contextValue}>
      <div className="admin-page">
      <TrainingProgressPanel job={trainingJob} onCancel={handleCancelTrainingJob} cancelling={trainingCancelPending} />

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
          <button className="btn-secondary" onClick={handleExportStudents} disabled={totalStudents === 0 || exportingStudents} title="Export all filtered students to Excel">
            <HiOutlineDownload size={16} /> {exportingStudents ? 'Exporting...' : `Export (${totalStudents})`}
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
          <button className="btn-secondary" title="Identify student via face scan" onClick={() => setShowFaceSearch(true)}>
            <HiOutlineCamera size={16} /> Find Face
          </button>
          <button className="btn-primary" onClick={() => { setForm({ ...EMPTY_FORM, department: isDepartmentAdmin && departmentName ? departmentName : '' }); setShowAdd(true); }}>
            <HiOutlinePlus size={16} /> Add Student
          </button>
        </div>

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
          <input className="search-input" placeholder="Search by name, reg no, email..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <select className="input-field" value={filters.department_id} onChange={(e) => setFilters({ department_id: e.target.value, course_id: '', semester: '', paper_id: '' })} disabled={isDepartmentAdmin}>
          <option value="">{isDepartmentAdmin ? (departmentName || 'Department') : 'All Departments'}</option>
          {departmentOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>

        <select className="input-field" value={filters.course_id} onChange={(e) => setFilters({ ...filters, course_id: e.target.value, semester: '', paper_id: '' })} disabled={!filters.department_id && isSuperAdmin}>
          <option value="">All Courses</option>
          {visibleCourses.map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })}</option>)}
        </select>

        <select className="input-field" value={filters.semester} onChange={(e) => setFilters({ ...filters, semester: e.target.value, paper_id: '' })} disabled={!filters.course_id}>
          <option value="">All Semesters</option>
          {filterSemesters.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
        </select>

        <select className="input-field" value={filters.paper_id} onChange={(e) => setFilters({ ...filters, paper_id: e.target.value })} disabled={!filters.course_id || !filters.semester}>
          <option value="">All Subjects</option>
          {subjectOptions.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
      </div>

      <div className="desktop-fade-rows-control" role="group" aria-label="Faded rows visibility">
        <span>Fade Rows</span>
        <label className="rows-toggle-switch">
          <input type="checkbox" checked={showInactiveRows} onChange={(e) => setShowInactiveRows(e.target.checked)} aria-label="Toggle faded rows" />
          <span className="rows-toggle-track"><span className="rows-toggle-thumb" /></span>
        </label>
      </div>

      <StudentTable />

      <StudentFormModal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Student" form={form} setForm={setForm} onSubmit={handleAdd} submitLabel="Create Student" departments={departments} formCourses={formCourses} isSuperAdmin={isSuperAdmin} isDepartmentAdmin={isDepartmentAdmin} departmentName={departmentName} isEdit={false} />
      <StudentFormModal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit Student" form={form} setForm={setForm} onSubmit={handleUpdate} submitLabel="Save Changes" departments={departments} formCourses={formCourses} isSuperAdmin={isSuperAdmin} isDepartmentAdmin={isDepartmentAdmin} departmentName={departmentName} isEdit={true} />
      
      <CredentialsModal isOpen={showCreds} onClose={() => setShowCreds(false)} createdCreds={createdCreds} onCopy={copyCredentials} />
      
      {showFaceEnroll && enrollingStudent && (
        <FaceEnrollmentModal student={enrollingStudent} onClose={() => setShowFaceEnroll(false)} onSuccess={handleFaceEnrollSuccess} />
      )}

      <FaceSearchModal isOpen={showFaceSearch} onClose={() => setShowFaceSearch(false)} />

      <PromoteStudentsModal isOpen={showPromoteModal} onClose={() => { if(!promotingSelected){ setShowPromoteModal(false); setPromoteSemesterOptions([]); } }} promoteSemester={promoteSemester} setPromoteSemester={setPromoteSemester} promoteSemesterOptions={promoteSemesterOptions} loadingPromoteSemesters={loadingPromoteSemesters} promotingSelected={promotingSelected} selectedCount={selectedStudentIds.length} onPromote={handlePromoteSelected} />
      
      <BulkAssignModal isOpen={showBulk} onClose={() => setShowBulk(false)} bulkForm={bulkForm} setBulkForm={setBulkForm} visibleCourses={visibleCourses} bulkSemesters={bulkSemesters} bulkAssignAllPapers={bulkAssignAllPapers} setBulkAssignAllPapers={setBulkAssignAllPapers} bulkPapers={bulkPapers} eligibleBulkStudents={eligibleBulkStudents} areAllBulkStudentsSelected={areAllBulkStudentsSelected} onAssign={handleBulkAssign} />
      
      <AssignStudentPapersModal isOpen={showStudentPapers} onClose={() => { if(!savingStudentPapers){ setShowStudentPapers(false); setPaperStudent(null); setPaperOptions([]); setSelectedPaperIds([]); setBaseAssignedPaperIds([]); } }} paperStudent={paperStudent} loadingStudentPapers={loadingStudentPapers} paperOptions={paperOptions} selectedPaperIds={selectedPaperIds} setSelectedPaperIds={setSelectedPaperIds} savingStudentPapers={savingStudentPapers} onSave={handleSaveStudentPapers} />
      
      <StudentExcelImportModal isOpen={showExcelImport} onClose={() => { if(!excelImporting){ setShowExcelImport(false); setExcelResults(null); } }} excelForm={excelForm} setExcelForm={setExcelForm} activeCourses={activeCourses} excelSemesters={excelSemesters} excelFileInputRef={excelFileInputRef} excelFile={excelFile} setExcelFile={setExcelFile} excelImporting={excelImporting} excelResults={excelResults} setExcelResults={setExcelResults} onImport={handleExcelImport} onImportAnother={() => { setExcelResults(null); setExcelFile(null); if (excelFileInputRef.current) excelFileInputRef.current.value = ''; }} />

      <Modal isOpen={showMobileOps} onClose={() => setShowMobileOps(false)} title="Student Operations" width={420}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="btn-secondary" style={{ justifyContent: 'space-between', cursor: 'default' }}>
            <span>Fade Rows</span>
            <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={showInactiveRows} onChange={(e) => setShowInactiveRows(e.target.checked)} aria-label="Toggle faded rows" style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
              <span style={{ width: 38, height: 22, borderRadius: 999, background: showInactiveRows ? 'var(--accent-emerald)' : 'var(--text-muted)', transition: 'background 160ms ease', position: 'relative', display: 'inline-block' }}>
                <span style={{ position: 'absolute', top: 2, left: showInactiveRows ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 160ms ease', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
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
          <button className="btn-secondary" onClick={() => { setShowMobileOps(false); handleExportStudents(); }} disabled={totalStudents === 0 || exportingStudents}>
            <HiOutlineDownload size={16} /> {exportingStudents ? 'Exporting...' : `Export (${totalStudents})`}
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!deleteStudent} onClose={() => setDeleteStudent(null)} title="Delete Options" width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Choose what you want to delete for <strong>{deleteStudent?.name}</strong>:</p>
          <button className="btn-secondary danger" style={{ justifyContent: 'center', padding: '12px' }} onClick={() => setConfirmAction({
            title: 'Delete Entire Profile',
            message: `Delete entire profile for ${deleteStudent?.name}? This cannot be undone.`,
            confirmLabel: 'Delete',
            onConfirm: async () => { await handleDeleteProfile(); }
          })}>
            <HiOutlineTrash size={18} /> Delete Entire Profile
          </button>
          <button className="btn-secondary danger" style={{ justifyContent: 'center', padding: '12px' }} onClick={handleDeleteFaceProfile} disabled={!deleteStudent?.has_face}>
            <HiOutlineCamera size={18} /> Delete Face Profile
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!confirmAction} onClose={() => setConfirmAction(null)} title={confirmAction?.title || 'Confirm Action'} width={420}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{confirmAction?.message}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
            <button className="btn-primary" onClick={() => { confirmAction?.onConfirm?.(); setConfirmAction(null); }}>
              {confirmAction?.confirmLabel || 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
    </StudentContext.Provider>
  );
}
