import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlineShieldCheck } from 'react-icons/hi';

export default function ExamEligibility() {
  const [courses, setCourses] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    course_id: '',
    academic_session: '',
    semester: '',
    final_eligible: '',
  });

  const fetchMeta = () => {
    api.get('/admin/courses').then((r) => setCourses(r.data || [])).catch(() => setCourses([]));
  };

  const fetchEligibility = () => {
    setLoading(true);
    const params = { ...filters };
    if (search) params.q = search;
    delete params.final_eligible;

    Object.keys(params).forEach((k) => {
      if (params[k] === '') delete params[k];
    });

    api.get('/admin/exam-eligibility-summary', { params })
      .then((r) => {
        const payload = r.data || {};
        setRows(payload.items || []);
      })
      .catch(() => {
        setRows([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMeta();
  }, []);

  useEffect(() => {
    fetchEligibility();
  }, [filters.course_id, filters.academic_session, filters.semester, search]);

  const uniqueRows = useMemo(() => {
    const byStudent = new Map();

    rows.forEach((row) => {
      const key = String(row.student_id || '');
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
        student_id: row.student_id,
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' } }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Exam Eligibility</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 3 }}>
            Filter and manage exam eligibility overrides.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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

      <div className="glass-card" style={{ padding: 18, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <input
            className="input-field"
            placeholder="Search student, reg no, subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="input-field"
            value={filters.course_id}
            onChange={(e) => setFilters({
              ...filters,
              course_id: e.target.value,
              academic_session: '',
              semester: '',
            })}
          >
            <option value="">All Courses</option>
            {courses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
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
      </div>

      <div className="glass-card table-desktop" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
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
              <tr key={row.student_id}>
                <td>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.82rem' }}>{row.student_name}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{row.student_email}</p>
                  </div>
                </td>
                <td>{row.reg_number || 'N/A'}</td>
                <td>
                  {(row.course_name || 'N/A')} / {(row.academic_session || row.academic_year || 'N/A')} / {(row.student_semester || row.semester) ? `Semester ${row.student_semester || row.semester}` : 'N/A'}
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
            {displayedRows.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                  {loading ? 'Loading eligibility records...' : 'No eligibility records found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list" style={{ marginTop: 10 }}>
        {displayedRows.map((row) => {
          const attendancePct = row.overall_attendance_percentage ?? row.attendance_percentage ?? 0;
          const attended = row.overall_attended_classes ?? row.attended_classes ?? 0;
          const totalClasses = row.overall_total_classes ?? row.classes_happened ?? 0;
          return (
            <div key={row.student_id} className="glass-card mobile-card">
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
                  {(row.course_name || 'N/A')} / {(row.academic_session || row.academic_year || 'N/A')} / {(row.student_semester || row.semester) ? `Semester ${row.student_semester || row.semester}` : 'N/A'}
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
    </motion.div>
  );
}
