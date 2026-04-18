import { Suspense, lazy, useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '../../api/axios';
import StatsCard from '../../components/ui/StatsCard';
import { motion } from 'framer-motion';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { formatCourseName } from '../../utils/courseDisplay';
import StatePanel from '../../components/ui/StatePanel';
import {
  HiOutlineUsers,
  HiOutlineAcademicCap,
  HiOutlineBookOpen,
  HiOutlineClipboardList,
  HiOutlineShieldCheck,
  HiOutlineClock,
} from 'react-icons/hi';
import { formatDateTimeIndia } from '../../utils/dateTime';
const MonthlyAttendanceTrend = lazy(() => import('../../components/admin/dashboard/MonthlyAttendanceTrend'));
const DashboardInsightsPanel = lazy(() => import('../../components/admin/dashboard/DashboardInsightsPanel'));

function formatUptime(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function parseUtcTimestamp(value) {
  if (!value || typeof value !== 'string') return null;
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  const normalized = hasTimezone ? value : `${value}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function AdminDashboard() {
  const { isSuperAdmin, isDepartmentAdmin, departmentId, departmentName } = useAuth();
  const [stats, setStats] = useState({});
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [uptimeTick, setUptimeTick] = useState(0);
  const [queueMetrics, setQueueMetrics] = useState(null);
  const [loadingQueueMetrics, setLoadingQueueMetrics] = useState(false);
  const [replayingJobId, setReplayingJobId] = useState('');
  const [queueActionMessage, setQueueActionMessage] = useState('');
  const [eligibility, setEligibility] = useState({ total: 0, eligible_count: 0, ineligible_count: 0, items: [] });
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [trendDepartment, setTrendDepartment] = useState('');
  const [trendPoints, setTrendPoints] = useState([]);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [filters, setFilters] = useState(() => ({
    department: isDepartmentAdmin && departmentName ? departmentName : '',
    academic_session: '',
    course_id: '',
    semester: ''
  }));
  const [departmentsList, setDepartmentsList] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const debouncedFilters = useDebouncedValue(filters, 300);

  const fetchStats = () => {
    setLoadingStats(true);
    setStatsError('');
    const params = {};
    if (isDepartmentAdmin && departmentId) {
      params.department_id = departmentId;
    }

    api.get('/admin/stats', { params })
      .then((r) => setStats(r.data || {}))
      .catch((err) => {
        setStats({});
        setStatsError(err.response?.data?.error || 'Failed to load dashboard overview.');
      })
      .finally(() => setLoadingStats(false));
  };

  const fetchQueueMetrics = () => {
    if (!isSuperAdmin) return;
    setLoadingQueueMetrics(true);
    api.get('/admin/jobs/metrics')
      .then((r) => setQueueMetrics(r.data || null))
      .catch(() => setQueueMetrics(null))
      .finally(() => setLoadingQueueMetrics(false));
  };

  const fetchEligibility = (signal, activeFilters = filters) => {
    const params = { ...activeFilters };
    Object.keys(params).forEach((k) => {
      if (params[k] === '') delete params[k];
    });

    setLoadingEligibility(true);
    api.get('/admin/exam-eligibility-summary', { params, signal })
      .then((r) => setEligibility(r.data))
      .catch((err) => {
        if (err?.code === 'ERR_CANCELED') return;
        setEligibility({ total: 0, eligible_count: 0, ineligible_count: 0, items: [] });
      })
      .finally(() => setLoadingEligibility(false));
  };

  const replayDeadLetterJob = (jobId) => {
    if (!jobId) return;
    setReplayingJobId(jobId);
    setQueueActionMessage('');
    api.post(`/admin/jobs/${jobId}/replay`)
      .then(() => {
        setQueueActionMessage(`Replay queued for ${jobId}`);
        fetchQueueMetrics();
      })
      .catch((err) => {
        const message = err?.response?.data?.error || `Failed to replay ${jobId}`;
        setQueueActionMessage(message);
      })
      .finally(() => setReplayingJobId(''));
  };

  useEffect(() => {
    fetchStats();
    fetchQueueMetrics();
    // Fetch departments for the cascade filter
    api.get('/admin/departments')
      .then((r) => setDepartmentsList(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDepartmentsList([]));
      
    const courseParams = {};
    if (isDepartmentAdmin && departmentId) {
      courseParams.department_id = departmentId;
    }
    api.get('/admin/courses', { params: courseParams })
      .then((r) => setAllCourses(r.data || []))
      .catch(() => setAllCourses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDepartmentAdmin, departmentId]);

  useEffect(() => {
    setLoadingTrend(true);
    const params = trendDepartment ? { department: trendDepartment } : {};
    api.get('/admin/stats/monthly-attendance', { params })
      .then(r => setTrendPoints(r.data || []))
      .catch(() => setTrendPoints([]))
      .finally(() => setLoadingTrend(false));
  }, [trendDepartment]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchQueueMetrics();
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setUptimeTick(Date.now());
    const timer = setInterval(() => {
      setUptimeTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isDepartmentAdmin && departmentName) {
      setFilters(prev => ({ ...prev, department: departmentName }));
    }
  }, [isDepartmentAdmin, departmentName]);

  useEffect(() => {
    const controller = new AbortController();
    fetchEligibility(controller.signal, debouncedFilters);
    return () => controller.abort();
  }, [debouncedFilters]);

  const eligibilityRows = useMemo(() => eligibility.items || [], [eligibility.items]);

  const academicSessionOptions = useMemo(() => {
    const years = Object.keys(stats.students_by_year || {})
      .map((y) => String(y || '').trim())
      .filter((y) => y && y.toLowerCase() !== 'unknown');
    return Array.from(new Set(years)).sort();
  }, [stats.students_by_year]);

  const courseSummary = useMemo(() => {
    const map = new Map();
    eligibilityRows.forEach((row) => {
      const key = row.course_id || row.course_name || 'unknown-course';
      const existing = map.get(key) || {
        course_id: row.course_id,
        course_name: row.course_name || 'N/A',
        course_status: row.course_status,
        is_course_inactive: row.is_course_inactive,
        course_department: row.course_department || '',
        students: new Map(),
      };

      const prev = existing.students.get(row.user_id);
      if (!prev) {
        existing.students.set(row.user_id, {
          user_id: row.user_id,
          final_eligible: Boolean(row.final_eligible),
        });
      } else {
        prev.final_eligible = prev.final_eligible && Boolean(row.final_eligible);
      }

      map.set(key, existing);
    });

    return Array.from(map.values()).map((entry) => {
      const students = Array.from(entry.students.values());
      return {
        course_id: entry.course_id,
        course_name: entry.course_name,
        course_status: entry.course_status,
        is_course_inactive: entry.is_course_inactive,
        course_department: entry.course_department,
        total_students: students.length,
        eligible_count: students.filter((s) => s.final_eligible).length,
        ineligible_count: students.filter((s) => !s.final_eligible).length,
      };
    }).sort((a, b) => a.course_name.localeCompare(b.course_name));
  }, [eligibilityRows]);

  const courseOptions = useMemo(
    () => {
      let options = allCourses.map((course) => ({
        course_id: course._id || '',
        course_name: course.name,
        course_status: course.status,
        is_course_inactive: String(course.status || 'active').toLowerCase() !== 'active',
        course_department: course.department || '',
      }));
      // If a department is selected, filter courses to that department
      if (filters.department) {
        options = options.filter(
          (c) => (c.course_department || '').toLowerCase() === filters.department.toLowerCase()
        );
      }
      return options.sort((a, b) => a.course_name.localeCompare(b.course_name));
    },
    [allCourses, filters.department]
  );

  const semesterSummary = useMemo(() => {
    const map = new Map();
    eligibilityRows.forEach((row) => {
      const semester = Number(row.student_semester || row.semester || 0);
      const key = semester > 0 ? semester : 0;
      const existing = map.get(key) || {
        semester: key,
        students: new Map(),
      };

      const prev = existing.students.get(row.user_id);
      if (!prev) {
        existing.students.set(row.user_id, {
          user_id: row.user_id,
          final_eligible: Boolean(row.final_eligible),
        });
      } else {
        prev.final_eligible = prev.final_eligible && Boolean(row.final_eligible);
      }

      map.set(key, existing);
    });

    return Array.from(map.values())
      .map((entry) => {
        const students = Array.from(entry.students.values());
        return {
          semester: entry.semester,
          total_students: students.length,
          eligible_count: students.filter((s) => s.final_eligible).length,
          ineligible_count: students.filter((s) => !s.final_eligible).length,
        };
      })
      .sort((a, b) => a.semester - b.semester);
  }, [eligibilityRows]);

  const semesterOptions = useMemo(
    () => semesterSummary.filter((x) => x.semester > 0).map((x) => x.semester),
    [semesterSummary]
  );

  const studentBuckets = useMemo(() => {
    const byStudent = new Map();
    eligibilityRows.forEach((row) => {
      const prev = byStudent.get(row.user_id);
      if (!prev) {
        byStudent.set(row.user_id, {
          user_id: row.user_id,
          student_name: row.student_name,
          student_email: row.student_email,
          reg_number: row.reg_number,
          final_eligible: Boolean(row.final_eligible),
        });
      } else {
        prev.final_eligible = prev.final_eligible && Boolean(row.final_eligible);
      }
    });

    const all = Array.from(byStudent.values()).sort((a, b) => a.student_name.localeCompare(b.student_name));
    return {
      eligible: all.filter((s) => s.final_eligible),
      ineligible: all.filter((s) => !s.final_eligible),
    };
  }, [eligibilityRows]);

  const eligibilitySnapshot = useMemo(() => ({
    total_students: studentBuckets.eligible.length + studentBuckets.ineligible.length,
    eligible_count: studentBuckets.eligible.length,
    ineligible_count: studentBuckets.ineligible.length,
    students_by_course: stats.students_by_course || {},
    students_by_year: stats.students_by_year || {},
  }), [studentBuckets, stats.students_by_course, stats.students_by_year]);

  const chartRows = useMemo(() => {
    if (!filters.academic_session) return [];

    if (!filters.course_id) {
      return courseSummary.map((course) => ({
        label: formatCourseName(course.course_name, { status: course.course_status, isInactive: course.is_course_inactive }),
        value: course.total_students,
      }));
    }

    return semesterSummary
      .filter((sem) => sem.semester > 0)
      .map((sem) => ({
        label: `Semester ${sem.semester}`,
        value: sem.total_students,
      }));
  }, [filters.academic_session, filters.course_id, courseSummary, semesterSummary]);

  const monthlyAttendance = useMemo(() => {
    const rows = Array.isArray(trendPoints) ? trendPoints : [];
      
    return rows.map((row, index) => ({
      key: row.key || `m-${index}`,
      label: row.label || `M${index + 1}`,
      total: Number(row.total) || 0,
    }));
  }, [trendPoints]);

  const liveSystemUptime = useMemo(() => {
    const startedAt = parseUtcTimestamp(stats.app_started_at);
    if (startedAt) {
      const elapsedSeconds = Math.floor((uptimeTick - startedAt.getTime()) / 1000);
      return formatUptime(elapsedSeconds);
    }
    if (stats.system_uptime_seconds !== undefined) {
      return formatUptime(stats.system_uptime_seconds);
    }
    return stats.system_uptime || '0m';
  }, [stats.app_started_at, stats.system_uptime_seconds, stats.system_uptime, uptimeTick]);

  // Derive department options from fetched departments list or eligibility data
  const departmentOptions = useMemo(() => {
    if (isDepartmentAdmin && departmentName) {
      return [departmentName];
    }
    if (departmentsList.length > 0) {
      return departmentsList
        .filter((d) => d.status === 'active')
        .map((d) => d.name)
        .filter(Boolean)
        .sort();
    }
    // Fallback: extract unique department names from eligibility items
    const names = new Set(
      eligibilityRows.map((r) => r.course_department).filter(Boolean)
    );
    return Array.from(names).sort();
  }, [departmentsList, eligibilityRows, isDepartmentAdmin, departmentName]);

  const handleDepartmentChange = (value) => {
    if (isDepartmentAdmin) return;
    setFilters({ department: value, course_id: '', academic_session: '', semester: '' });
  };

  const handleCourseChange = (value) => {
    setFilters((prev) => ({ ...prev, course_id: value, academic_session: '', semester: '' }));
  };

  const handleAcademicSessionChange = (value) => {
    setFilters((prev) => ({ ...prev, academic_session: value, semester: '' }));
  };

  const handleSemesterChange = (value) => {
    setFilters((prev) => ({ ...prev, semester: value }));
  };

  if (loadingStats) {
    return (
      <div className="admin-page">
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>Overview of your attendance management system.</p>
        </div>
        <StatePanel variant="loading" title="Loading dashboard overview" description="Fetching live operational metrics and summaries." compact />
      </div>
    );
  }

  if (statsError) {
    return (
      <div className="admin-page">
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>Overview of your attendance management system.</p>
        </div>
        <StatePanel
          variant="error"
          title="Unable to load dashboard"
          description={statsError}
          actionLabel="Retry"
          onAction={fetchStats}
          compact
        />
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Dashboard</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>Overview of your attendance management system.</p>
      </div>

      <div className="admin-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatsCard icon={HiOutlineUsers} label="Total Students" value={stats.total_students || 0} color="#06b6d4" />
        <StatsCard icon={HiOutlineAcademicCap} label="Lecturers" value={stats.total_lecturers || 0} color="#f59e0b" />
        <StatsCard icon={HiOutlineBookOpen} label="Total Courses" value={stats.total_courses || 0} color="#8b5cf6" />
        <StatsCard icon={HiOutlineBookOpen} label="Active Courses" value={stats.active_courses || 0} color="#10b981" />
        <StatsCard icon={HiOutlineBookOpen} label="Inactive Courses" value={stats.inactive_courses || 0} color="#ef4444" />
        <StatsCard icon={HiOutlineClipboardList} label="Papers" value={stats.total_papers || 0} color="#10b981" />
        <StatsCard icon={HiOutlineShieldCheck} label="Audit Logs" value={stats.total_audit_logs || 0} color="#ef4444" />
        <StatsCard icon={HiOutlineClock} label="System Uptime" value={liveSystemUptime} color="#14b8a6" />
      </div>

      {/* ─── Attendance Summary (primary focus) ─── */}
      <Suspense fallback={<div className="glass-card" style={{ padding: 18, marginTop: 10, minHeight: 460 }} />}>
        <DashboardInsightsPanel
          eligibilitySnapshot={eligibilitySnapshot}
          filters={filters}
          departmentOptions={departmentOptions}
          academicSessionOptions={academicSessionOptions}
          courseOptions={courseOptions}
          semesterOptions={semesterOptions}
          courseSummary={courseSummary}
          semesterSummary={semesterSummary}
          chartRows={chartRows}
          studentBuckets={studentBuckets}
          loadingEligibility={loadingEligibility}
          departmentsSummary={stats.departments_summary || {}}
          isSuperAdmin={isSuperAdmin}
          onDepartmentChange={handleDepartmentChange}
          onAcademicSessionChange={handleAcademicSessionChange}
          onCourseChange={handleCourseChange}
          onSemesterChange={handleSemesterChange}
        />
      </Suspense>

      {/* ─── Secondary panels: Trend, Eligibility Snapshot, Queue Health ─── */}
      <div className="admin-charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 20 }}>
        <Suspense fallback={<div className="glass-card" style={{ padding: 20, minHeight: 220 }} />}>
          <MonthlyAttendanceTrend 
            points={monthlyAttendance} 
            isSuperAdmin={isSuperAdmin}
            departmentsList={departmentsList || []}
            trendDepartment={trendDepartment}
            onTrendDepartmentChange={setTrendDepartment}
            loading={loadingTrend}
          />
        </Suspense>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div className="glass-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <HiOutlineShieldCheck size={18} style={{ color: 'var(--accent-amber)' }} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Eligibility Snapshot</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total Students</span><b>{eligibilitySnapshot.total_students}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Eligible</span><b style={{ color: 'var(--accent-emerald)' }}>{eligibilitySnapshot.eligible_count}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Ineligible</span><b style={{ color: 'var(--accent-rose)' }}>{eligibilitySnapshot.ineligible_count}</b></div>
            </div>
          </div>

          {isSuperAdmin && (
            <div className="glass-card" style={{ padding: 20, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Queue Health</h3>
                <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem' }} onClick={fetchQueueMetrics}>
                  {loadingQueueMetrics ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Queue Depth</span><b>{queueMetrics?.queue?.depth ?? 'N/A'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Delayed</span><b>{queueMetrics?.queue?.delayed_depth ?? 'N/A'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Due Delayed</span><b>{queueMetrics?.queue?.due_delayed ?? 'N/A'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Running</span><b>{queueMetrics?.jobs?.running ?? 'N/A'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Queued Retries</span><b style={{ color: 'var(--accent-amber)' }}>{queueMetrics?.jobs?.queued_retries ?? 'N/A'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ flexShrink: 0 }}>Next Retry</span><b style={{ textAlign: 'right', fontSize: '0.72rem', wordBreak: 'break-word', minWidth: 0 }}>{formatDateTimeIndia(queueMetrics?.jobs?.next_retry_job?.next_attempt_at, { dateStyle: 'short', timeStyle: 'medium' })}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Stale Running</span><b style={{ color: 'var(--accent-amber)' }}>{queueMetrics?.jobs?.stale_running ?? 'N/A'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Dead-Letter (24h)</span><b style={{ color: 'var(--accent-rose)' }}>{queueMetrics?.jobs?.dead_letter_last_24h ?? 'N/A'}</b></div>
              </div>

              {queueActionMessage && (
                <p style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{queueActionMessage}</p>
              )}


            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom Panel: Recent Dead-Letter Jobs ─── */}
      {isSuperAdmin && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>Recent Dead-Letter Jobs</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {(queueMetrics?.jobs?.recent_dead_letter_jobs || []).slice(0, 3).map((job) => (
              <div key={job.job_id} className="glass-card" style={{ padding: 16, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 4 }}>{job.job_type || 'unknown'}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all', marginBottom: 4 }}>{job.job_id}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Attempts: {job.attempts || 0}/{job.max_attempts || 0}</p>
                  </div>
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem', height: 'fit-content' }}
                    disabled={replayingJobId === job.job_id}
                    onClick={() => replayDeadLetterJob(job.job_id)}
                  >
                    {replayingJobId === job.job_id ? 'Replaying...' : 'Replay'}
                  </button>
                </div>
                {job.error && (
                  <div style={{ marginTop: 12, padding: 8, background: 'var(--bg-card-alt)', borderRadius: 6, border: '1px solid var(--border-glass)' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--accent-rose)', wordBreak: 'break-word', margin: 0 }}>{job.error}</p>
                  </div>
                )}
              </div>
            ))}
            {(queueMetrics?.jobs?.recent_dead_letter_jobs || []).length === 0 && (
              <StatePanel variant="empty" title="No dead-letter jobs" description="Queue replay is healthy for the current monitoring window." compact />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
