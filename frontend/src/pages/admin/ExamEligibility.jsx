import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlineShieldCheck, HiOutlineDownload, HiOutlineFilter, HiOutlineDotsHorizontal } from 'react-icons/hi';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import StatePanel from '../../components/ui/StatePanel';
import Modal from '../../components/ui/Modal';
import { formatCourseName } from '../../utils/courseDisplay';
import { exportToExcel, exportToCSV } from '../../utils/excelExport';
import { useAuth } from '../../hooks/useAuth';

export default function ExamEligibility() {
  const { isSuperAdmin, isDepartmentAdmin, departmentId, departmentName } = useAuth();

  const [courses, setCourses] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [exportingEligibility, setExportingEligibility] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [search, setSearch] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showMobileOptions, setShowMobileOptions] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState({
    department_id: '',
    course_id: '',
    academic_session: '',
    semester: '',
    final_eligible: '',
  });
  const debouncedSearch = useDebouncedValue(search, 300);
  const debouncedFilters = useDebouncedValue(filters, 250);

  const activeCourses = useMemo(
    () => courses.filter((c) => String(c.status || 'active').toLowerCase() === 'active'),
    [courses]
  );

  const fetchMeta = () => {
    if (isSuperAdmin) {
      api.get('/admin/departments').then((r) => setDepartments(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    } else if (isDepartmentAdmin && departmentId && departmentName) {
      setDepartments([{ _id: departmentId, name: departmentName }]);
      setFilters((prev) => ({ ...prev, department_id: departmentId }));
    }
  };

  useEffect(() => {
    const params = {};
    if (filters.department_id) params.department_id = filters.department_id;
    api.get('/admin/courses', { params }).then((r) => setCourses(r.data || [])).catch(() => setCourses([]));
  }, [filters.department_id]);

  const fetchEligibility = (signal, activeFilters = filters, activeSearch = search) => {
    // Dept admins always have department_id set; super admins fetch all by default
    if (isDepartmentAdmin && !activeFilters.department_id) {
      setRows([]);
      setEligibilityError('');
      return;
    }
    setLoading(true);
    setEligibilityError('');
    const params = { ...activeFilters };
    if (activeSearch) params.q = activeSearch;
    delete params.final_eligible;

    Object.keys(params).forEach((k) => {
      if (params[k] === '') delete params[k];
    });

    api.get('/admin/exam-eligibility-summary', { params, signal })
      .then((r) => {
        const payload = r.data || {};
        setRows(payload.items || []);
      })
      .catch((err) => {
        if (err?.code === 'ERR_CANCELED') return;
        setRows([]);
        setEligibilityError(err.response?.data?.error || 'Failed to load exam eligibility data.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMeta();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchEligibility(controller.signal, debouncedFilters, debouncedSearch);
    return () => controller.abort();
  }, [debouncedFilters, debouncedSearch]);

  const uniqueRows = useMemo(() => {
    const byStudent = new Map();

    rows.forEach((row) => {
      const key = String(row.user_id || '');
      if (!key) return;

      const existing = byStudent.get(key);
      if (!existing) {
        byStudent.set(key, {
          ...row,
          student_semester: row.student_semester || row.semester || null,
          paper_ids: row.paper_id ? [row.paper_id] : [],
        });
        return;
      }

      const mergedFinalEligible = Boolean(existing.final_eligible) && Boolean(row.final_eligible);
      const hasExistingOverride = existing.override_status !== null && existing.override_status !== undefined;
      const hasCurrentOverride = row.override_status !== null && row.override_status !== undefined;

      const mergedPaperIds = Array.from(new Set([
        ...(existing.paper_ids || []),
        ...(row.paper_id ? [row.paper_id] : []),
      ]));

      byStudent.set(key, {
        ...existing,
        // Prefer row with explicit override, so actions/edit context stays meaningful.
        ...(hasCurrentOverride && !hasExistingOverride ? row : {}),
        final_eligible: mergedFinalEligible,
        student_semester: existing.student_semester || row.student_semester || row.semester || null,
        paper_ids: mergedPaperIds,
      });
    });

    return Array.from(byStudent.values()).sort((a, b) => {
      const an = String(a.student_name || '').toLowerCase();
      const bn = String(b.student_name || '').toLowerCase();
      return an.localeCompare(bn);
    });
  }, [rows]);

  const displayedRows = useMemo(() => {
    if (filters.final_eligible === '') return uniqueRows;
    const required = filters.final_eligible === 'true';
    return uniqueRows.filter((row) => row.final_eligible === required);
  }, [uniqueRows, filters.final_eligible]);

  const displayedStudentIds = useMemo(() => (
    displayedRows
      .map((row) => String(row.user_id || '').trim())
      .filter(Boolean)
  ), [displayedRows]);

  const allDisplayedSelected = displayedStudentIds.length > 0
    && displayedStudentIds.every((id) => selectedStudentIds.includes(id));

  useEffect(() => {
    if (selectedStudentIds.length === 0) return;
    const visibleSet = new Set(displayedStudentIds);
    setSelectedStudentIds((prev) => prev.filter((id) => visibleSet.has(id)));
  }, [displayedStudentIds, selectedStudentIds.length]);

  const summary = useMemo(() => ({
    total: displayedRows.length,
    eligible_count: displayedRows.filter((x) => x.final_eligible === true).length,
    ineligible_count: displayedRows.filter((x) => x.final_eligible === false).length,
  }), [displayedRows]);

  const sessionOptions = useMemo(() => {
    const values = new Set();
    rows.forEach((row) => {
      const value = String(row.academic_session || row.academic_year || '').trim();
      if (value) values.add(value);
    });
    return Array.from(values).sort();
  }, [rows]);

  const semesterOptions = useMemo(() => {
    const selectedCourse = courses.find((c) => c._id === filters.course_id);
    const years = Number(selectedCourse?.course_duration || 0);

    if (Number.isFinite(years) && years > 0) {
      return Array.from({ length: years * 2 }, (_, idx) => idx + 1);
    }

    // Fallback when no course is selected: show range based on maximum duration in courses.
    const maxYears = courses.reduce((max, course) => {
      const d = Number(course?.course_duration || 0);
      return Number.isFinite(d) && d > max ? d : max;
    }, 0);
    const maxSemesters = maxYears > 0 ? maxYears * 2 : 10;
    return Array.from({ length: maxSemesters }, (_, idx) => idx + 1);
  }, [courses, filters.course_id]);

  useEffect(() => {
    if (!filters.semester) return;
    const selected = Number(filters.semester);
    if (!semesterOptions.includes(selected)) {
      setFilters((prev) => ({ ...prev, semester: '' }));
    }
  }, [semesterOptions, filters.semester]);

  useEffect(() => {
    if (!filters.course_id) return;
    const stillActive = activeCourses.some((course) => course._id === filters.course_id);
    if (!stillActive) {
      setFilters((prev) => ({ ...prev, course_id: '', academic_session: '', semester: '' }));
    }
  }, [activeCourses, filters.course_id]);

  const handleOverride = async (row, overrideStatus) => {
    const targetPaperIds = Array.from(new Set((row.paper_ids || []).filter(Boolean)));
    if (targetPaperIds.length === 0) {
      toast.error('No linked papers found for this student');
      return;
    }

    const reason = window.prompt(
      `Reason for ${overrideStatus ? 'allowing' : 'blocking'} exam access for ${row.student_name} (${targetPaperIds.length} paper${targetPaperIds.length > 1 ? 's' : ''}):`,
      row.override_reason || ''
    );
    if (reason === null) return;

    try {
      await Promise.all(targetPaperIds.map((paperId) => api.put('/admin/exam-eligibility-override', {
        user_id: row.user_id,
        paper_id: paperId,
        override_status: overrideStatus,
        reason,
      })));
      toast.success(`Override updated for ${targetPaperIds.length} paper${targetPaperIds.length > 1 ? 's' : ''}`);
      fetchEligibility();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update override');
    }
  };

  const toggleStudentSelection = (userId) => {
    const key = String(userId || '').trim();
    if (!key) return;
    setSelectedStudentIds((prev) => (
      prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key]
    ));
  };

  const handleToggleSelectAllDisplayed = () => {
    if (allDisplayedSelected) {
      setSelectedStudentIds([]);
      return;
    }
    setSelectedStudentIds(displayedStudentIds);
  };

  const handleBulkOverride = async (overrideStatus) => {
    const targetRows = displayedRows.filter((row) => selectedStudentIds.includes(String(row.user_id || '').trim()));
    if (targetRows.length === 0) {
      toast.error(`Select at least one student to bulk ${overrideStatus ? 'allow' : 'block'}`);
      return;
    }

    const reason = window.prompt(
      `Reason for ${overrideStatus ? 'allowing' : 'blocking'} examination access for ${targetRows.length} student${targetRows.length > 1 ? 's' : ''}:`,
      overrideStatus ? 'Admin bulk allow' : 'Admin bulk block'
    );
    if (reason === null) return;

    const requests = [];
    targetRows.forEach((row) => {
      const userId = String(row.user_id || '').trim();
      const paperIds = Array.from(new Set((row.paper_ids || []).filter(Boolean)));
      paperIds.forEach((paperId) => {
        const normalizedPaperId = String(paperId || '').trim();
        if (!userId || !normalizedPaperId) return;
        requests.push({
          user_id: userId,
          paper_id: normalizedPaperId,
          override_status: overrideStatus,
          reason,
        });
      });
    });

    if (requests.length === 0) {
      toast.error('No eligible paper mappings found for selected students');
      return;
    }

    const confirmed = window.confirm(
      `Bulk ${overrideStatus ? 'allow' : 'block'} examination for ${targetRows.length} student${targetRows.length > 1 ? 's' : ''} across ${requests.length} paper override${requests.length > 1 ? 's' : ''}?`
    );
    if (!confirmed) return;

    setBulkUpdating(true);
    try {
      let updatedCount = requests.length;
      try {
        const response = await api.put('/admin/exam-eligibility-override/bulk', {
          overrides: requests,
        });
        updatedCount = Number(response?.data?.updated || requests.length);
      } catch (err) {
        // Backward-compatible fallback for servers that do not yet expose the bulk endpoint.
        if (err?.response?.status !== 404) {
          throw err;
        }
        const fallbackResults = await Promise.allSettled(
          requests.map((payload) => api.put('/admin/exam-eligibility-override', payload))
        );
        updatedCount = fallbackResults.filter((r) => r.status === 'fulfilled').length;
        if (updatedCount === 0) {
          const firstRejected = fallbackResults.find((r) => r.status === 'rejected');
          throw firstRejected?.reason || err;
        }
      }
      toast.success(`Bulk ${overrideStatus ? 'allow' : 'block'} applied (${targetRows.length} students, ${requests.length} overrides)`);
      if (updatedCount < requests.length) {
        toast(`Applied ${updatedCount}/${requests.length} override mappings.`);
      }
      setSelectedStudentIds([]);
      fetchEligibility();
    } catch (err) {
      toast.error(err.response?.data?.error || `Bulk ${overrideStatus ? 'allow' : 'block'} failed`);
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleBulkAllow = () => handleBulkOverride(true);
  const handleBulkBlock = () => handleBulkOverride(false);

  const handleExportEligibility = async () => {
    if (displayedRows.length === 0) {
      toast.error('No eligibility records to export');
      return;
    }

    const exportData = displayedRows.map((row) => ({
      student_name: row.student_name || '',
      reg_number: row.reg_number || row.student_reg_no || row.username || '',
      course: row.course_name || '',
      session: row.academic_session || row.academic_year || '',
      semester: row.student_semester || row.semester || '',
      attendance: row.attendance_pct ?? row.attendance_percentage ?? '',
      status: row.final_eligible ? 'Eligible' : 'Ineligible',
      override: row.override_status === true ? 'Allowed' : row.override_status === false ? 'Blocked' : 'None',
      override_reason: row.override_reason || '',
    }));

    const columns = [
      { key: 'student_name', header: 'Student' },
      { key: 'reg_number', header: 'Reg No' },
      { key: 'course', header: 'Course' },
      { key: 'session', header: 'Academic Session' },
      { key: 'semester', header: 'Semester' },
      { key: 'attendance', header: 'Overall Attendance (%)' },
      { key: 'status', header: 'Status' },
      { key: 'override', header: 'Override' },
      { key: 'override_reason', header: 'Override Reason' },
    ];

    setExportingEligibility(true);
    try {
      try {
        await exportToExcel({
          data: exportData,
          columns,
          fileName: 'Exam_Eligibility',
          sheetName: 'Eligibility',
        });
        toast.success(`Exported ${displayedRows.length} eligibility records to Excel`);
      } catch (xlsxError) {
        if (xlsxError.message.includes('xlsx')) {
          exportToCSV({
            data: exportData,
            columns,
            fileName: 'Exam_Eligibility',
          });
          toast.success(`Exported ${displayedRows.length} eligibility records to CSV`);
        } else {
          throw xlsxError;
        }
      }
    } catch (err) {
      toast.error(err.message || 'Failed to export eligibility records');
    } finally {
      setExportingEligibility(false);
    }
  };

  if (!loading && eligibilityError) {
    return (
      <div className="admin-page">
        <StatePanel variant="error" title="Unable to load eligibility records" description={eligibilityError} actionLabel="Retry" onAction={() => fetchEligibility()} compact />
      </div>
    );
  }

  if (!loading && !eligibilityError && rows.length === 0 && isDepartmentAdmin && !filters.department_id) {
    return (
      <div className="admin-page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Exam Eligibility</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 3 }}>
              Filter and manage exam eligibility overrides.
            </p>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 18, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <select
              className="input-field"
              value={filters.department_id}
              onChange={(e) => setFilters({ department_id: e.target.value, course_id: '', academic_session: '', semester: '', final_eligible: '' })}
              disabled={isDepartmentAdmin}
            >
              <option value="">
                {isDepartmentAdmin ? (departmentName || 'Department') : 'All Departments'}
              </option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
            <select
              className="input-field"
              value={filters.course_id}
              onChange={(e) => setFilters({ ...filters, course_id: e.target.value, academic_session: '', semester: '', final_eligible: '' })}
              disabled={!filters.department_id}
            >
              <option value="">Select Course...</option>
              {activeCourses.map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })}</option>)}
            </select>
          </div>
        </div>
        <StatePanel variant="empty" title="No Records" description="No exam eligibility records found. Adjust filters or add students." compact />
      </div>
    );
  }

  return (
    <div className="admin-page">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Exam Eligibility</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 3 }}>
            Filter and manage exam eligibility overrides.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <button className="btn-secondary" onClick={handleExportEligibility} disabled={exportingEligibility || displayedRows.length === 0}>
            <HiOutlineDownload size={16} /> {exportingEligibility ? 'Exporting...' : 'Export'}
          </button>
          <div className="glass-card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Total</p>
            <p style={{ fontSize: '1rem', fontWeight: 700 }}>{summary.total}</p>
          </div>
          <div className="glass-card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Eligible</p>
            <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>{summary.eligible_count}</p>
          </div>
          <div className="glass-card" style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Ineligible</p>
            <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-rose)' }}>{summary.ineligible_count}</p>
          </div>
        </div>
      </div>

      <div className="mobile-filters-toggle-wrap exam-eligibility-mobile-filters-toggle-wrap">
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

      <div className="exam-eligibility-select-strip">
        <label className="exam-eligibility-select-all-toggle">
          <input
            type="checkbox"
            checked={allDisplayedSelected}
            onChange={handleToggleSelectAllDisplayed}
            disabled={displayedStudentIds.length === 0}
            aria-label="Select all shown students"
          />
          <span>Select all shown</span>
        </label>
        <button
          className="btn-secondary"
          style={{ padding: '6px 10px', fontSize: '0.72rem' }}
          onClick={() => setSelectedStudentIds([])}
          disabled={selectedStudentIds.length === 0}
        >
          Clear
        </button>
      </div>

      <div className="glass-card" style={{ padding: 18, marginBottom: 12 }}>
        <div className={`exam-eligibility-filter-grid ${showMobileFilters ? 'is-mobile-open' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <input
            className="input-field"
            placeholder="Search student, reg no, subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="input-field"
            value={filters.department_id}
            onChange={(e) => setFilters({ department_id: e.target.value, course_id: '', academic_session: '', semester: '', final_eligible: '' })}
            disabled={isDepartmentAdmin}
          >
            <option value="">
              {isDepartmentAdmin ? (departmentName || 'Department') : 'All Departments'}
            </option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>

          <select
            className="input-field"
            value={filters.course_id}
            onChange={(e) => {
              setFilters({ ...filters, course_id: e.target.value, academic_session: '', semester: '' });
              setSelectedStudentIds([]);
            }}
            disabled={!filters.department_id}
          >
            <option value="">All Courses</option>
            {activeCourses.map((c) => <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status })}</option>)}
          </select>

          <select className="input-field" value={filters.academic_session} onChange={(e) => setFilters({ ...filters, academic_session: e.target.value })}>
            <option value="">All Academic Sessions</option>
            {sessionOptions.map((session) => <option key={session} value={session}>{session}</option>)}
          </select>

          <select className="input-field" value={filters.semester} onChange={(e) => setFilters({ ...filters, semester: e.target.value })}>
            <option value="">All Semesters</option>
            {semesterOptions.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
          </select>

          <select className="input-field" value={filters.final_eligible} onChange={(e) => setFilters({ ...filters, final_eligible: e.target.value })}>
            <option value="">All Status</option>
            <option value="true">Eligible</option>
            <option value="false">Ineligible</option>
          </select>
        </div>

        <div className="exam-eligibility-inline-actions" style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Selected: {selectedStudentIds.length} / {displayedStudentIds.length}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              style={{ padding: '6px 10px', fontSize: '0.72rem' }}
              onClick={handleBulkAllow}
              disabled={bulkUpdating || selectedStudentIds.length === 0}
            >
              {bulkUpdating ? 'Applying...' : 'Bulk Allow for Examination'}
            </button>
            <button
              className="btn-secondary"
              style={{ padding: '6px 10px', fontSize: '0.72rem' }}
              onClick={handleBulkBlock}
              disabled={bulkUpdating || selectedStudentIds.length === 0}
            >
              {bulkUpdating ? 'Applying...' : 'Bulk Block for Examination'}
            </button>
          </div>
        </div>
      </div>

      <div className="glass-card table-desktop" style={{ overflowX: 'auto' }}>
        {loading ? (
          <StatePanel variant="loading" title="Loading eligibility records" description="Analyzing attendance and override status." compact />
        ) : null}

        {!loading && eligibilityError ? (
          <StatePanel variant="error" title="Unable to load eligibility records" description={eligibilityError} actionLabel="Retry" onAction={() => fetchEligibility()} compact />
        ) : null}

        {!loading && !eligibilityError && displayedRows.length === 0 ? (
          <StatePanel variant="empty" title="No eligibility records found" description="Try changing course, session, or semester filters." compact />
        ) : null}

        {!loading && !eligibilityError && displayedRows.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 36, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allDisplayedSelected}
                  onChange={handleToggleSelectAllDisplayed}
                  aria-label="Select all students"
                />
              </th>
              <th>Student</th>
              <th>Reg No</th>
              <th>Course / Session / Semester</th>
              <th>Overall Attendance</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}><HiOutlineShieldCheck size={16} style={{ verticalAlign: 'middle' }} /> Override</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row) => (
              <tr key={row.user_id}>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedStudentIds.includes(String(row.user_id || '').trim())}
                    onChange={() => toggleStudentSelection(row.user_id)}
                    aria-label={`Select ${row.student_name || 'student'}`}
                  />
                </td>
                <td>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.82rem' }}>{row.student_name}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{row.student_email}</p>
                  </div>
                </td>
                <td>{row.reg_number || 'N/A'}</td>
                <td>
                  {formatCourseName(row.course_name || 'N/A', { isInactive: row.is_course_inactive, status: row.course_status })} / {(row.academic_session || row.academic_year || 'N/A')} / {(row.student_semester || row.semester) ? `Semester ${row.student_semester || row.semester}` : 'N/A'}
                </td>
                <td>
                  {(row.overall_attendance_percentage ?? row.attendance_percentage ?? 0)}% ({row.overall_attended_classes ?? row.attended_classes ?? 0}/{row.overall_total_classes ?? row.classes_happened ?? 0})
                </td>
                <td>
                  {row.eligibility_status === 'no_lectures_yet' ? (
                    <span className="badge badge-info">No Lectures Yet</span>
                  ) : (
                    <span className={`badge ${row.final_eligible ? 'badge-success' : 'badge-danger'}`}>
                      {row.final_eligible ? 'Eligible' : 'Ineligible'}
                    </span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.72rem' }} onClick={() => handleOverride(row, true)}>Allow</button>
                    <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.72rem' }} onClick={() => handleOverride(row, false)}>Block</button>
                  </div>
                  {row.override_status !== null && row.override_status !== undefined && (
                    <div style={{ marginTop: 4, fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                      Override: {row.override_status ? 'Allowed' : 'Blocked'}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        ) : null}
      </div>

      <div className="mobile-card-list" style={{ marginTop: 10 }}>
        {displayedRows.map((row) => {
          const attendancePct = row.overall_attendance_percentage ?? row.attendance_percentage ?? 0;
          const attended = row.overall_attended_classes ?? row.attended_classes ?? 0;
          const totalClasses = row.overall_total_classes ?? row.classes_happened ?? 0;
          return (
            <div key={row.user_id} className="glass-card mobile-card">
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={selectedStudentIds.includes(String(row.user_id || '').trim())}
                    onChange={() => toggleStudentSelection(row.user_id)}
                    aria-label={`Select ${row.student_name || 'student'}`}
                  />
                  Select
                </label>
              </div>
              <div className="mobile-card-row">
                <span className="mobile-card-label">Student</span>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.82rem' }}>{row.student_name}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{row.student_email}</p>
                </div>
              </div>
              <div className="mobile-card-row">
                <span className="mobile-card-label">Reg No</span>
                <span style={{ fontSize: '0.8rem' }}>{row.reg_number || 'N/A'}</span>
              </div>
              <div className="mobile-card-row">
                <span className="mobile-card-label">Course/Session/Sem</span>
                <span style={{ fontSize: '0.8rem', textAlign: 'right' }}>
                  {formatCourseName(row.course_name || 'N/A', { isInactive: row.is_course_inactive, status: row.course_status })} / {(row.academic_session || row.academic_year || 'N/A')} / {(row.student_semester || row.semester) ? `Semester ${row.student_semester || row.semester}` : 'N/A'}
                </span>
              </div>
              <div className="mobile-card-row">
                <span className="mobile-card-label">Attendance</span>
                <span style={{ fontSize: '0.8rem' }}>{attendancePct}% ({attended}/{totalClasses})</span>
              </div>
              <div className="mobile-card-row">
                <span className="mobile-card-label">Status</span>
                {row.eligibility_status === 'no_lectures_yet' ? (
                  <span className="badge badge-info">No Lectures Yet</span>
                ) : (
                  <span className={`badge ${row.final_eligible ? 'badge-success' : 'badge-danger'}`}>
                    {row.final_eligible ? 'Eligible' : 'Ineligible'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.72rem' }} onClick={() => handleOverride(row, true)}>Allow</button>
                <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.72rem' }} onClick={() => handleOverride(row, false)}>Block</button>
              </div>
              {row.override_status !== null && row.override_status !== undefined && (
                <div style={{ marginTop: 6, fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                  Override: {row.override_status ? 'Allowed' : 'Blocked'}
                </div>
              )}
            </div>
          );
        })}
        {displayedRows.length === 0 && (
          <div className="glass-card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
            {loading ? 'Loading eligibility records...' : 'No eligibility records found.'}
          </div>
        )}
      </div>

      <Modal isOpen={showMobileOptions} onClose={() => setShowMobileOptions(false)} title="Options" width={420}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="btn-primary"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => {
              setShowMobileOptions(false);
              handleBulkAllow();
            }}
            disabled={bulkUpdating || selectedStudentIds.length === 0}
          >
            {bulkUpdating ? 'Applying...' : 'Bulk Allow'}
          </button>
          <button
            className="btn-secondary"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => {
              setShowMobileOptions(false);
              handleBulkBlock();
            }}
            disabled={bulkUpdating || selectedStudentIds.length === 0}
          >
            {bulkUpdating ? 'Applying...' : 'Bulk Block'}
          </button>
          <button
            className="btn-secondary"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => {
              setShowMobileOptions(false);
              handleExportEligibility();
            }}
            disabled={exportingEligibility || displayedRows.length === 0}
          >
            <HiOutlineDownload size={16} /> {exportingEligibility ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
