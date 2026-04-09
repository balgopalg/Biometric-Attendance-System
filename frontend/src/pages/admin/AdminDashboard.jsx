import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import StatsCard from '../../components/ui/StatsCard';
import { motion } from 'framer-motion';
import {
  HiOutlineUsers,
  HiOutlineAcademicCap,
  HiOutlineBookOpen,
  HiOutlineClipboardList,
  HiOutlineChartBar,
  HiOutlineClock,
  HiOutlineShieldCheck,
} from 'react-icons/hi';

function EligibilityDonutChart({ eligible, ineligible }) {
  const total = eligible + ineligible;
  const safeTotal = total || 1;
  const eligibleRatio = eligible / safeTotal;
  const ineligibleRatio = ineligible / safeTotal;
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const eligibleStroke = circumference * eligibleRatio;
  const ineligibleStroke = circumference * ineligibleRatio;

  return (
    <div className="glass-card" style={{ padding: 14 }}>
      <p style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: 10 }}>Eligibility Ratio</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ width: 130, height: 130, position: 'relative', flexShrink: 0 }}>
          <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label="Eligibility ratio donut chart">
            <circle cx="65" cy="65" r={radius} fill="none" stroke="var(--border-glass)" strokeWidth="14" />
            <circle
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              stroke="var(--accent-emerald)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${eligibleStroke} ${circumference - eligibleStroke}`}
              transform="rotate(-90 65 65)"
            />
            <circle
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              stroke="var(--accent-rose)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${ineligibleStroke} ${circumference - ineligibleStroke}`}
              strokeDashoffset={-eligibleStroke}
              transform="rotate(-90 65 65)"
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <div>
              <p style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1 }}>{total}</p>
              <p style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Students</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--accent-emerald)' }}>Eligible</span>
            <b>{eligible}</b>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-glass)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(eligibleRatio * 100)}%`, height: '100%', background: 'var(--accent-emerald)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--accent-rose)' }}>Ineligible</span>
            <b>{ineligible}</b>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--bg-glass)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(ineligibleRatio * 100)}%`, height: '100%', background: 'var(--accent-rose)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DistributionBars({ title, rows, labelKey, valueKey }) {
  const maxValue = rows.reduce((max, row) => Math.max(max, Number(row[valueKey]) || 0), 0) || 1;

  return (
    <div className="glass-card" style={{ padding: 14 }}>
      <p style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: 12 }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No chart data for current filters.</p>
        ) : rows.map((row) => {
          const value = Number(row[valueKey]) || 0;
          const width = value === 0 ? 0 : Math.max(8, Math.round((value / maxValue) * 100));
          return (
            <div key={String(row[labelKey])}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: 4 }}>
                <span style={{ color: 'var(--text-muted)' }}>{row[labelKey]}</span>
                <b>{value}</b>
              </div>
              <div style={{ height: 9, borderRadius: 999, background: 'var(--bg-glass)', overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ duration: 0.45 }}
                  style={{ height: '100%', background: 'var(--gradient-primary)' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [eligibility, setEligibility] = useState({ total: 0, eligible_count: 0, ineligible_count: 0, items: [] });
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [courseOptions, setCourseOptions] = useState([]);
  const [filters, setFilters] = useState({ academic_session: '', course_id: '', semester: '' });

  const fetchStats = () => {
    api.get('/admin/stats').then((r) => setStats(r.data)).catch(() => {});
  };

  const fetchEligibility = () => {
    const params = { ...filters };
    Object.keys(params).forEach((k) => {
      if (params[k] === '') delete params[k];
    });

    setLoadingEligibility(true);
    api.get('/admin/exam-eligibility-summary', { params })
      .then((r) => setEligibility(r.data))
      .catch(() => setEligibility({ total: 0, eligible_count: 0, ineligible_count: 0, items: [] }))
      .finally(() => setLoadingEligibility(false));
  };

  const fetchCourseOptions = (academicSession) => {
    if (!academicSession) {
      setCourseOptions([]);
      return;
    }

    api.get('/admin/exam-eligibility-summary', { params: { academic_session: academicSession } })
      .then((r) => {
        const rows = r.data?.items || [];
        const byCourse = new Map();
        rows.forEach((row) => {
          const cid = row.course_id || '';
          const cname = row.course_name || 'N/A';
          const key = cid || cname;
          if (!byCourse.has(key)) {
            byCourse.set(key, { course_id: cid, course_name: cname });
          }
        });
        const list = Array.from(byCourse.values()).sort((a, b) => a.course_name.localeCompare(b.course_name));
        setCourseOptions(list);
      })
      .catch(() => setCourseOptions([]));
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchEligibility();
  }, [filters.academic_session, filters.course_id, filters.semester]);

  useEffect(() => {
    fetchCourseOptions(filters.academic_session);
  }, [filters.academic_session]);

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
        students: new Map(),
      };

      const prev = existing.students.get(row.student_id);
      if (!prev) {
        existing.students.set(row.student_id, {
          student_id: row.student_id,
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
        total_students: students.length,
        eligible_count: students.filter((s) => s.final_eligible).length,
        ineligible_count: students.filter((s) => !s.final_eligible).length,
      };
    }).sort((a, b) => a.course_name.localeCompare(b.course_name));
  }, [eligibilityRows]);

  const semesterSummary = useMemo(() => {
    const map = new Map();
    eligibilityRows.forEach((row) => {
      const semester = Number(row.student_semester || row.semester || 0);
      const key = semester > 0 ? semester : 0;
      const existing = map.get(key) || {
        semester: key,
        students: new Map(),
      };

      const prev = existing.students.get(row.student_id);
      if (!prev) {
        existing.students.set(row.student_id, {
          student_id: row.student_id,
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
      const prev = byStudent.get(row.student_id);
      if (!prev) {
        byStudent.set(row.student_id, {
          student_id: row.student_id,
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
  }), [studentBuckets]);

  const chartRows = useMemo(() => {
    if (!filters.academic_session) return [];

    if (!filters.course_id) {
      return courseSummary.map((course) => ({
        label: course.course_name,
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

  const handleAcademicSessionChange = (value) => {
    setFilters({ academic_session: value, course_id: '', semester: '' });
  };

  const handleCourseChange = (value) => {
    setFilters((prev) => ({ ...prev, course_id: value, semester: '' }));
  };

  const handleSemesterChange = (value) => {
    setFilters((prev) => ({ ...prev, semester: value }));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Dashboard</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>Overview of your attendance management system.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatsCard icon={HiOutlineUsers} label="Total Students" value={stats.total_students || 0} color="#06b6d4" />
        <StatsCard icon={HiOutlineAcademicCap} label="Lecturers" value={stats.total_lecturers || 0} color="#f59e0b" />
        <StatsCard icon={HiOutlineBookOpen} label="Courses" value={stats.total_courses || 0} color="#8b5cf6" />
        <StatsCard icon={HiOutlineClipboardList} label="Papers" value={stats.total_papers || 0} color="#10b981" />
        <StatsCard icon={HiOutlineShieldCheck} label="Audit Logs" value={stats.total_audit_logs || 0} color="#ef4444" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <HiOutlineChartBar size={18} style={{ color: 'var(--accent-purple)' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Monthly Attendance Trend</h3>
          </div>
          <div style={{ height: 200, display: 'flex', alignItems: 'flex-end', gap: 8, padding: '0 10px' }}>
            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month, i) => {
              const heights = [60, 80, 45, 90, 70, 55];
              return (
                <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: heights[i] }}
                    transition={{ delay: i * 0.1, duration: 0.6 }}
                    style={{
                      width: '100%',
                      maxWidth: 40,
                      background: i === 2 ? 'var(--gradient-primary)' : 'var(--bg-glass)',
                      borderRadius: 6,
                      border: i === 2 ? 'none' : '1px solid var(--border-glass)',
                    }}
                  />
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{month}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <HiOutlineClock size={18} style={{ color: 'var(--accent-amber)' }} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Eligibility Snapshot</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total Students</span><b>{eligibilitySnapshot.total_students}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Eligible</span><b style={{ color: 'var(--accent-emerald)' }}>{eligibilitySnapshot.eligible_count}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Ineligible</span><b style={{ color: 'var(--accent-rose)' }}>{eligibilitySnapshot.ineligible_count}</b></div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16, marginBottom: 16 }}>
        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>Students by Course</h3>
          {(Object.entries(stats.students_by_course || {}).length === 0) ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data</p>
          ) : (
            Object.entries(stats.students_by_course || {}).map(([course, count]) => (
              <div key={course} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-glass)' }}>
                <span style={{ fontSize: '0.82rem' }}>{course}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{count}</span>
              </div>
            ))
          )}
        </div>

        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 12 }}>Students by Academic Year</h3>
          {(Object.entries(stats.students_by_year || {}).length === 0) ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data</p>
          ) : (
            Object.entries(stats.students_by_year || {}).map(([year, count]) => (
              <div key={year} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-glass)' }}>
                <span style={{ fontSize: '0.82rem' }}>Year {year}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="glass-card" style={{ padding: 18, marginTop: 10 }}>
        <h3 style={{ fontSize: '0.98rem', fontWeight: 800, marginBottom: 12 }}>Attendance Summary</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          <select className="input-field" value={filters.academic_session} onChange={(e) => handleAcademicSessionChange(e.target.value)}>
            <option value="">Select Academic Session</option>
            {academicSessionOptions.map((session) => <option key={session} value={session}>{session}</option>)}
          </select>

          <select className="input-field" value={filters.course_id} onChange={(e) => handleCourseChange(e.target.value)} disabled={!filters.academic_session}>
            <option value="">Select Course</option>
            {courseOptions.map((course) => (
              <option key={course.course_id || course.course_name} value={course.course_id || ''}>{course.course_name}</option>
            ))}
          </select>

          <select className="input-field" value={filters.semester} onChange={(e) => handleSemesterChange(e.target.value)} disabled={!filters.course_id}>
            <option value="">Select Semester</option>
            {semesterOptions.map((s) => <option key={s} value={String(s)}>Semester {s}</option>)}
          </select>
        </div>

        {filters.academic_session && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 14 }}>
            <EligibilityDonutChart
              eligible={eligibilitySnapshot.eligible_count}
              ineligible={eligibilitySnapshot.ineligible_count}
            />
            <DistributionBars
              title={!filters.course_id ? 'Students Distribution by Course' : 'Students Distribution by Semester'}
              rows={chartRows}
              labelKey="label"
              valueKey="value"
            />
          </div>
        )}

        {!filters.academic_session ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Select an academic session to view course-wise attendance summary.</p>
        ) : !filters.course_id ? (
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10 }}>Course-wise Attendance Summary</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {courseSummary.map((course) => (
                <div key={course.course_id || course.course_name} className="glass-card" style={{ padding: 14 }}>
                  <p style={{ fontSize: '0.84rem', fontWeight: 700 }}>{course.course_name}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Total Students: <b>{course.total_students}</b>
                  </p>
                  <p style={{ fontSize: '0.76rem', color: 'var(--accent-emerald)', marginTop: 3 }}>Eligible: {course.eligible_count}</p>
                  <p style={{ fontSize: '0.76rem', color: 'var(--accent-rose)' }}>Ineligible: {course.ineligible_count}</p>
                </div>
              ))}
              {courseSummary.length === 0 && !loadingEligibility && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No course summary found for selected session.</p>
              )}
            </div>
          </div>
        ) : !filters.semester ? (
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10 }}>Semester-wise Attendance Summary</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {semesterSummary.filter((x) => x.semester > 0).map((sem) => (
                <div key={sem.semester} className="glass-card" style={{ padding: 14 }}>
                  <p style={{ fontSize: '0.84rem', fontWeight: 700 }}>Semester {sem.semester}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Total Students: <b>{sem.total_students}</b>
                  </p>
                  <p style={{ fontSize: '0.76rem', color: 'var(--accent-emerald)', marginTop: 3 }}>Eligible: {sem.eligible_count}</p>
                  <p style={{ fontSize: '0.76rem', color: 'var(--accent-rose)' }}>Ineligible: {sem.ineligible_count}</p>
                </div>
              ))}
              {semesterSummary.filter((x) => x.semester > 0).length === 0 && !loadingEligibility && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No semester summary found for selected course.</p>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="glass-card" style={{ padding: 14 }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10, color: 'var(--accent-emerald)' }}>
                Eligible Students ({studentBuckets.eligible.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {studentBuckets.eligible.map((s) => (
                  <div key={s.student_id} style={{ paddingBottom: 8, borderBottom: '1px solid var(--border-glass)' }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600 }}>{s.student_name}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.reg_number || 'N/A'} · {s.student_email || ''}</p>
                  </div>
                ))}
                {studentBuckets.eligible.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No eligible students.</p>}
              </div>
            </div>

            <div className="glass-card" style={{ padding: 14 }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10, color: 'var(--accent-rose)' }}>
                Ineligible Students ({studentBuckets.ineligible.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {studentBuckets.ineligible.map((s) => (
                  <div key={s.student_id} style={{ paddingBottom: 8, borderBottom: '1px solid var(--border-glass)' }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600 }}>{s.student_name}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.reg_number || 'N/A'} · {s.student_email || ''}</p>
                  </div>
                ))}
                {studentBuckets.ineligible.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No ineligible students.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
