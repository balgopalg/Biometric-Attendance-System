import api from '../../api/axios';
import { formatCourseName } from '../../utils/courseDisplay';
import { exportToExcel, exportToCSV, EXPORT_COLUMN_PRESETS } from '../../utils/excelExport';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import StatePanel from '../../components/ui/StatePanel';
import toast from 'react-hot-toast';
import { useState } from 'react';
import {
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineFilter,
  HiOutlineDocumentAdd,
  HiOutlineDownload,
  HiOutlineDotsHorizontal,
  HiOutlineTrash,
  HiOutlineCamera,
} from 'react-icons/hi';

import useLecturerData from './lecturers/useLecturerData';
import LecturerTable from './lecturers/LecturerTable';
import AddLecturerModal from './lecturers/AddLecturerModal';
import EditLecturerModal from './lecturers/EditLecturerModal';
import AssignPapersModal from './lecturers/AssignPapersModal';
import CredentialsModal from './lecturers/CredentialsModal';
import ExcelImportModal from './lecturers/ExcelImportModal';
import ViewAssignedPapersModal from './lecturers/ViewAssignedPapersModal';
import LecturerFaceEnrollmentModal from '../../components/admin/LecturerFaceEnrollmentModal';
import LecturerFaceSearchModal from '../../components/admin/LecturerFaceSearchModal';
import { useTraining } from '../../context/TrainingContext';
import { HiOutlineSparkles } from 'react-icons/hi';

export default function ManageLecturers() {
  const ctx = useLecturerData();
  const [showFaceEnroll, setShowFaceEnroll] = useState(false);
  const [enrollingLecturer, setEnrollingLecturer] = useState(null);
  const [deleteLecturer, setDeleteLecturer] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [showFaceSearch, setShowFaceSearch] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showViewPapers, setShowViewPapers] = useState(false);
  const [viewingLecturer, setViewingLecturer] = useState(null);
  const [viewingDepartmentGroups, setViewingDepartmentGroups] = useState([]);

  const [rebuildingAllFaces, setRebuildingAllFaces] = useState(false);
  const { startTraining } = useTraining();

  // ── Action handlers (thin wrappers that call API + update hook state) ──

  const handleAdd = async () => {
    if (!ctx.form.name?.trim() || !ctx.form.email?.trim()) {
      toast.error('Name and Email are required');
      return;
    }
    if (!ctx.form.department?.trim()) {
      toast.error('Primary Department is required');
      return;
    }
    try {
      const initialPassword = ctx.buildTempPassword();
      const res = await api.post('/admin/lecturers', { ...ctx.form, role: 'lecturer', initial_password: initialPassword });
      const data = res.data;
      ctx.setShowAdd(false);
      ctx.setForm({ ...ctx.EMPTY_FORM, department: ctx.isDepartmentAdmin && ctx.departmentName ? ctx.departmentName : '' });
      if (data?.temp_password) {
        ctx.setCreatedCreds({ name: data.name, email: data.email, temp_password: data.temp_password });
        ctx.setShowCreds(true);
      }
      toast.success(data?.message || 'Lecturer created');
      ctx.fetchLecturers(ctx.page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleEditClick = (lecturer) => {
    ctx.setEditForm({
      _id: lecturer._id,
      name: lecturer.name || '',
      email: lecturer.email || '',
      department: lecturer.department || '',
    });
    ctx.setShowEdit(true);
  };

  const handleEditSubmit = async () => {
    if (!ctx.editForm.name?.trim() || !ctx.editForm.email?.trim()) {
      toast.error('Name and Email are required');
      return;
    }
    if (!ctx.editForm.department?.trim()) {
      toast.error('Primary Department is required');
      return;
    }
    try {
      const payload = {
        name: ctx.editForm.name,
        email: ctx.editForm.email,
        department: ctx.editForm.department,
      };
      await api.put(`/admin/lecturers/${ctx.editForm._id}`, payload);
      toast.success('Lecturer updated');
      ctx.setShowEdit(false);
      ctx.fetchLecturers(ctx.page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update lecturer');
    }
  };

  const handleDeleteClick = (lecturer) => {
    setDeleteLecturer(lecturer);
  };

  const handleDeleteProfile = async () => {
    if (!deleteLecturer) return;
    try {
      await api.delete(`/admin/lecturers/${deleteLecturer._id}`);
      toast.success('Deleted profile');
      setDeleteLecturer(null);
      ctx.fetchLecturers(ctx.page);
    } catch {
      toast.error('Failed to delete profile');
    }
  };

  const handleDeleteFaceProfile = async () => {
    if (!deleteLecturer) return;
    try {
      await api.delete(`/admin/lecturers/${deleteLecturer._id}/face`);
      toast.success('Face profile deleted');
      setDeleteLecturer(null);
      ctx.fetchLecturers(ctx.page);
    } catch {
      toast.error('Failed to delete face profile');
    }
  };

  const handleResetPassword = (id, name) => {
    setConfirmAction({
      title: 'Reset Password',
      message: `Are you sure you want to reset the password for ${name}? A new temporary password will be generated.`,
      confirmLabel: 'Reset',
      onConfirm: async () => {
        try {
          const res = await api.post(`/admin/lecturers/${id}/reset-password`);
          ctx.setCreatedCreds({
            name,
            email: res.data.email || '',
            temp_password: res.data.new_password,
            isReset: true
          });
          ctx.setShowCreds(true);
          toast.success(res.data?.message || 'Password reset');
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to reset password');
        }
      },
    });
  };

  const handleResetPin = (id, name) => {
    setConfirmAction({
      title: 'Reset PIN',
      message: `Reset the security PIN for ${name}?`,
      confirmLabel: 'Reset PIN',
      onConfirm: async () => {
        try {
          const res = await api.post(`/admin/lecturers/${id}/reset-pin`);
          toast.success(`New PIN for ${name}: ${res.data.pin}`);
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to reset PIN');
        }
      },
    });
  };

  const handleEnrollFace = (lecturer) => {
    setEnrollingLecturer(lecturer);
    setShowFaceEnroll(true);
  };

  const handleFaceEnrollSuccess = () => {
    setShowFaceEnroll(false);
    setEnrollingLecturer(null);
    ctx.fetchLecturers(ctx.page);
  };

  const handleTrainFace = (lecturer) => {
    const lid = lecturer._id;
    if (!lid) return;
    setConfirmAction({
      title: 'Train Face',
      message: `Train face embeddings from dataset for ${lecturer.name}?`,
      confirmLabel: 'Train',
      onConfirm: async () => {
        try {
          const res = await api.post(`/admin/lecturers/${lid}/train-face`, { async: true });
          if (res.status === 202 || res.data?.job_id) {
            startTraining(res, 1);
            toast.success('Face training started');
            return;
          }
          const trained = Number(res.data?.trained_embeddings || 0);
          const skipped = Number(res.data?.skipped_images || 0);
          toast.success(`Training done. Embeddings: ${trained}, skipped images: ${skipped}`);
          ctx.fetchLecturers(ctx.page);
        } catch (err) {
          if (err.response?.status === 404) toast.error('Train Face endpoint not active. Restart backend server once and retry.');
          else if (err.response?.status === 400) toast.error(err.response?.data?.error || 'Dataset images missing. Please run Enroll Face first.');
          else toast.error(err.response?.data?.error || 'Failed to train face from dataset');
        }
      },
    });
  };

  const handleRebuildAllFaces = () => {
    setConfirmAction({
      title: 'Rebuild All Lecturer Faces',
      message: 'Rebuild face embeddings for every lecturer from their dataset folders? This may take a while.',
      confirmLabel: 'Rebuild All',
      onConfirm: async () => {
        try {
          setRebuildingAllFaces(true);
          const res = await api.post('/admin/lecturers/train-face/rebuild-all', { async: true });
          if (res.status === 202 || res.data?.job_id) {
            startTraining(res, Number(res.data?.requested_count || 0));
            toast.success(`Rebuild queued. Job: ${res.data?.job_id}`);
            return;
          }
          const success = Number(res.data?.success_count || 0);
          const failed = Number(res.data?.failure_count || 0);
          const totalEmbeddings = Number(res.data?.total_trained_embeddings || 0);
          toast.success(`Rebuild complete. Success: ${success}, Failed: ${failed}, Embeddings: ${totalEmbeddings}`);
          ctx.fetchLecturers(ctx.page);
        } catch (err) {
          toast.error(err.response?.data?.error || 'Failed to rebuild all face embeddings');
        } finally {
          setRebuildingAllFaces(false);
        }
      },
    });
  };

  const openViewPapersModal = (lecturer, departmentGroups) => {
    setViewingLecturer(lecturer);
    setViewingDepartmentGroups(departmentGroups);
    setShowViewPapers(true);
  };

  const openAssignModal = async (lecturer) => {
    try {
      const res = await api.get(`/admin/lecturers/${lecturer._id}/papers`);
      ctx.setSelectedLecturer(lecturer);
      ctx.setAssignedPaperIds((res.data.assigned || []).map((p) => p._id));
      ctx.setAssignmentFilters({
        department_id: lecturer?.department_id || ctx.filters.department_id || '',
        course_id: ctx.filters.course_id || '',
        semester: ctx.filters.semester || '',
      });
      ctx.setShowAssign(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load assignments');
    }
  };

  const handleSaveAssignments = async () => {
    if (!ctx.selectedLecturer) return;
    try {
      await api.put(`/admin/lecturers/${ctx.selectedLecturer._id}/papers`, { paper_ids: ctx.assignedPaperIds });
      toast.success('Paper assignments updated');
      ctx.setShowAssign(false);
      ctx.setSelectedLecturer(null);
      ctx.setAssignedPaperIds([]);
      ctx.fetchLecturers(ctx.page);
      ctx.fetchMetadata();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update assignments');
    }
  };

  const copyCredentials = () => {
    if (!ctx.createdCreds) return;
    const text = `Name: ${ctx.createdCreds.name}\n${ctx.createdCreds.email ? `Email: ${ctx.createdCreds.email}\n` : ''}Temp Password: ${ctx.createdCreds.temp_password}`;
    navigator.clipboard.writeText(text);
    toast.success('Credentials copied');
  };

  const handleLecturerExcelImport = async () => {
    if (!ctx.excelFile) { toast.error('Please select an Excel file'); return; }
    const fd = new FormData();
    fd.append('file', ctx.excelFile);
    try {
      ctx.setExcelImporting(true);
      const res = await api.post('/admin/lecturers/import-excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      ctx.setExcelResults(res.data);
      toast.success(res.data.message || 'Import complete');
      ctx.fetchLecturers(ctx.page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      ctx.setExcelImporting(false);
    }
  };

  const handleExportLecturers = async () => {
    ctx.setExportingLecturers(true);
    try {
      const all = await ctx.fetchAllLecturersForExport();
      if (all.length === 0) { toast.error('No lecturers to export'); return; }
      try {
        await exportToExcel({ data: all, columns: EXPORT_COLUMN_PRESETS.LECTURERS, fileName: 'Lecturers', sheetName: 'Lecturers' });
        toast.success(`Exported ${all.length} lecturers to Excel`);
      } catch (xlsxError) {
        if (xlsxError.message.includes('xlsx')) {
          exportToCSV({ data: all, columns: EXPORT_COLUMN_PRESETS.LECTURERS, fileName: 'Lecturers' });
          toast.success(`Exported ${all.length} lecturers to CSV`);
        } else { throw xlsxError; }
      }
    } catch (err) {
      toast.error(err.message || 'Failed to export lecturers');
    } finally {
      ctx.setExportingLecturers(false);
    }
  };

  const openLecturerImportModal = () => {
    ctx.setExcelFile(null);
    ctx.setExcelResults(null);
    if (ctx.excelFileInputRef.current) ctx.excelFileInputRef.current.value = '';
    ctx.setShowExcelImport(true);
  };

  const openAddLecturerModal = () => {
    ctx.setForm({ ...ctx.EMPTY_FORM, department: ctx.isDepartmentAdmin && ctx.departmentName ? ctx.departmentName : '' });
    ctx.setShowAdd(true);
  };

  // ── Render ─────────────────────────────────────────────────────────

  if (!ctx.loadingLecturers && ctx.lecturersError) {
    return (
      <div className="admin-page">
        <StatePanel variant="error" title="Unable to load lecturers" description={ctx.lecturersError} actionLabel="Retry" onAction={() => ctx.fetchLecturers(ctx.page)} compact />
      </div>
    );
  }

  return (
    <div className="admin-page">

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="lecturers-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Lecturers</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{ctx.totalLecturers} lecturers in current filter</p>
          <div className="lecturers-toolbar-actions-mobile">
            <button className="btn-secondary" title="Find lecturer by face" onClick={() => setShowFaceSearch(true)}><HiOutlineCamera size={16} /> Find Face</button>
            <button className="btn-secondary" title="Import lecturers from Excel" onClick={openLecturerImportModal}><HiOutlineDocumentAdd size={16} /> Import Excel</button>
            <button className="btn-primary" onClick={openAddLecturerModal}><HiOutlinePlus size={16} /> Add Lecturer</button>
          </div>
        </div>
        <div className="lecturers-toolbar-actions-primary" style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={handleRebuildAllFaces} disabled={rebuildingAllFaces}>
            <HiOutlineSparkles size={16} /> {rebuildingAllFaces ? 'Rebuilding...' : 'Rebuild All Faces'}
          </button>
          <button className="btn-secondary" title="Find lecturer by face" onClick={() => setShowFaceSearch(true)}><HiOutlineCamera size={16} /> Find Face</button>
          <button className="btn-secondary" title="Export all filtered lecturers to Excel" onClick={handleExportLecturers} disabled={ctx.totalLecturers === 0 || ctx.exportingLecturers}>
            <HiOutlineDownload size={16} /> {ctx.exportingLecturers ? 'Exporting...' : `Export (${ctx.totalLecturers})`}
          </button>
          <button className="btn-secondary" title="Import lecturers from Excel" onClick={openLecturerImportModal}><HiOutlineDocumentAdd size={16} /> Import Excel</button>
          <button className="btn-primary" onClick={openAddLecturerModal}><HiOutlinePlus size={16} /> Add Lecturer</button>
        </div>
      </div>

      {/* ── Mobile filter/action toggles ─────────────────────────── */}
      <div className="mobile-filters-toggle-wrap lecturers-mobile-filters-toggle-wrap">
        <button
          className="icon-btn mobile-filters-icon-btn"
          type="button"
          title={ctx.showMobileFilters ? 'Hide filters' : 'Show filters'}
          aria-label={ctx.showMobileFilters ? 'Hide filters' : 'Show filters'}
          aria-expanded={ctx.showMobileFilters}
          onClick={() => ctx.setShowMobileFilters((prev) => !prev)}
        >
          <HiOutlineFilter size={18} />
        </button>
        <button className="icon-btn mobile-filters-icon-btn" type="button" title="Quick actions" aria-label="Quick actions" onClick={() => ctx.setShowMobileOperations(true)}>
          <HiOutlineDotsHorizontal size={18} />
        </button>
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className={`lecturers-filter-grid ${ctx.showMobileFilters ? 'is-mobile-open' : ''}`} style={{ 
        display: 'grid', 
        gridTemplateColumns: isSearchFocused ? '2.2fr 0.8fr 0.8fr 0.8fr 0.8fr' : '1.2fr 1fr 1fr 1fr 1fr', 
        transition: 'grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        gap: 10, 
        marginBottom: 20 
      }}>
        <div style={{ position: 'relative' }}>
          <HiOutlineSearch size={18} style={{ 
            position: 'absolute', 
            left: 14, 
            top: '50%', 
            transform: 'translateY(-50%)', 
            color: isSearchFocused ? 'var(--accent-primary)' : 'var(--text-muted)',
            transition: 'color 0.2s ease'
          }} />
          <input 
            className="search-input" 
            placeholder="Search by name, email or subject..." 
            value={ctx.search} 
            onChange={(e) => ctx.setSearch(e.target.value)} 
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            style={{
              paddingLeft: 40,
              width: '100%',
              borderColor: isSearchFocused ? 'var(--accent-primary)' : 'var(--border-glass)',
              background: isSearchFocused ? 'var(--bg-glass-heavy)' : 'var(--bg-glass)',
              transition: 'all 0.3s ease'
            }}
          />
        </div>
        <select className="input-field" value={ctx.filters.department_id} onChange={(e) => ctx.setFilters({ department_id: e.target.value, course_id: '', semester: '', paper_id: '' })} disabled={ctx.isDepartmentAdmin}>
          <option value="">{ctx.isDepartmentAdmin ? (ctx.departmentName || 'Department') : 'All Departments'}</option>
          {ctx.departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
        <select className="input-field" value={ctx.filters.course_id} onChange={(e) => ctx.setFilters({ ...ctx.filters, course_id: e.target.value, semester: '', paper_id: '' })}>
          <option value="">All Courses</option>
          {ctx.courses.map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })}</option>)}
        </select>
        <select className="input-field" value={ctx.filters.semester} onChange={(e) => ctx.setFilters({ ...ctx.filters, semester: e.target.value, paper_id: '' })}>
          <option value="">All Semesters</option>
          {ctx.semesterOptions.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
        </select>
        <select className="input-field" value={ctx.filters.paper_id} onChange={(e) => ctx.setFilters({ ...ctx.filters, paper_id: e.target.value })}>
          <option value="">All Papers</option>
          {ctx.filteredPapers.map((p) => <option key={p._id} value={p._id}>{p.name}{p.code ? ` [${p.code}]` : ''}</option>)}
        </select>
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
      <div className="glass-card lecturers-table-card">
        {ctx.loadingLecturers && <StatePanel variant="loading" title="Loading lecturers" description="Retrieving lecturer records and assignments." compact />}
        {ctx.lecturersError && <StatePanel variant="error" title="Unable to load lecturers" description={ctx.lecturersError} actionLabel="Retry" onAction={() => ctx.fetchLecturers(ctx.page)} compact />}
        {!ctx.loadingLecturers && !ctx.lecturersError && ctx.lecturers.length === 0 && <StatePanel variant="empty" title="No lecturers found" description="Try another filter or add a new lecturer." compact />}
        {!ctx.loadingLecturers && !ctx.lecturersError && ctx.lecturers.length > 0 && (
          <LecturerTable
            lecturers={ctx.lecturers}
            getLecturerDepartmentGroups={ctx.getLecturerDepartmentGroups}
            openDepartmentPopover={ctx.openDepartmentPopover}
            openDepartmentWithDefaultCourse={ctx.openDepartmentWithDefaultCourse}
            activePopoverCourses={ctx.activePopoverCourses}
            setActivePopoverCourses={ctx.setActivePopoverCourses}
            getDefaultCourseName={ctx.getDefaultCourseName}
            onViewPapers={openViewPapersModal}
            onAssign={openAssignModal}
            onResetPin={handleResetPin}
            onResetPassword={handleResetPassword}
            onEdit={handleEditClick}
            onDelete={handleDeleteClick}
            onEnrollFace={handleEnrollFace}
            onTrainFace={handleTrainFace}
          />
        )}
      </div>

      <Pagination page={ctx.page} total={ctx.totalLecturers} perPage={ctx.PAGE_SIZE} onPageChange={ctx.fetchLecturers} />

      {/* ── Modals ───────────────────────────────────────────────── */}
      <AddLecturerModal isOpen={ctx.showAdd} onClose={() => ctx.setShowAdd(false)} form={ctx.form} setForm={ctx.setForm} onSubmit={handleAdd} departments={ctx.departments} isSuperAdmin={ctx.isSuperAdmin} isDepartmentAdmin={ctx.isDepartmentAdmin} departmentName={ctx.departmentName} />

      <EditLecturerModal isOpen={ctx.showEdit} onClose={() => ctx.setShowEdit(false)} form={ctx.editForm} setForm={ctx.setEditForm} onSubmit={handleEditSubmit} departments={ctx.departments} isSuperAdmin={ctx.isSuperAdmin} isDepartmentAdmin={ctx.isDepartmentAdmin} departmentName={ctx.departmentName} />

      <AssignPapersModal isOpen={ctx.showAssign} onClose={() => ctx.setShowAssign(false)} selectedLecturer={ctx.selectedLecturer} departments={ctx.departments} assignmentFilters={ctx.assignmentFilters} setAssignmentFilters={ctx.setAssignmentFilters} assignmentFilterCourses={ctx.assignmentFilterCourses} assignmentFilterSemesters={ctx.assignmentFilterSemesters} assignmentFilteredPapers={ctx.assignmentFilteredPapers} assignedPaperIds={ctx.assignedPaperIds} setAssignedPaperIds={ctx.setAssignedPaperIds} onSave={handleSaveAssignments} />

      <CredentialsModal isOpen={ctx.showCreds} onClose={() => ctx.setShowCreds(false)} createdCreds={ctx.createdCreds} onCopy={copyCredentials} />

      {/* Mobile Operations */}
      <Modal isOpen={ctx.showMobileOperations} onClose={() => ctx.setShowMobileOperations(false)} title="Quick Actions" width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => { ctx.setShowMobileOperations(false); handleExportLecturers(); }} disabled={ctx.exportingLecturers}>
            <HiOutlineDownload size={16} /> {ctx.exportingLecturers ? 'Exporting...' : 'Export Lecturers'}
          </button>
        </div>
      </Modal>

      <ExcelImportModal isOpen={ctx.showExcelImport} onClose={() => ctx.setShowExcelImport(false)} excelFile={ctx.excelFile} setExcelFile={ctx.setExcelFile} excelFileInputRef={ctx.excelFileInputRef} excelImporting={ctx.excelImporting} excelResults={ctx.excelResults} setExcelResults={ctx.setExcelResults} onImport={handleLecturerExcelImport} />

      {showFaceEnroll && enrollingLecturer && <LecturerFaceEnrollmentModal lecturer={enrollingLecturer} onClose={() => setShowFaceEnroll(false)} onSuccess={handleFaceEnrollSuccess} />}
      
      <ViewAssignedPapersModal
        isOpen={showViewPapers}
        onClose={() => setShowViewPapers(false)}
        lecturer={viewingLecturer}
        departmentGroups={viewingDepartmentGroups}
        getDefaultCourseName={ctx.getDefaultCourseName}
      />
      
      <Modal isOpen={!!deleteLecturer} onClose={() => setDeleteLecturer(null)} title="Delete Options" width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Choose what you want to delete for <strong>{deleteLecturer?.name}</strong>:</p>
          <button className="btn-secondary danger" style={{ justifyContent: 'center', padding: '12px' }} onClick={() => setConfirmAction({
            title: 'Delete Entire Profile',
            message: `Delete entire profile for ${deleteLecturer?.name}? This cannot be undone.`,
            confirmLabel: 'Delete',
            onConfirm: async () => { await handleDeleteProfile(); }
          })}>
            <HiOutlineTrash size={18} /> Delete Entire Profile
          </button>
          <button className="btn-secondary danger" style={{ justifyContent: 'center', padding: '12px' }} onClick={() => setConfirmAction({
            title: 'Delete Face Profile',
            message: `Delete face profile for ${deleteLecturer?.name}?`,
            confirmLabel: 'Delete',
            onConfirm: async () => { await handleDeleteFaceProfile(); }
          })} disabled={!deleteLecturer?.has_face}>
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

      <LecturerFaceSearchModal isOpen={showFaceSearch} onClose={() => setShowFaceSearch(false)} />
    </div>
  );
}
