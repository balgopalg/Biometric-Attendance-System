import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import StatsCard from '../../components/ui/StatsCard';
import toast, { Toaster } from 'react-hot-toast';
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

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [courses, setCourses] = useState([]);
  const [papers, setPapers] = useState([]);
  const [eligibility, setEligibility] = useState({ total: 0, eligible_count: 0, ineligible_count: 0, items: [] });
  const [filters, setFilters] = useState({ course_id: '', paper_id: '', academic_year: '', final_eligible: '' });
  const [search, setSearch] = useState('');

  const fetchStats = () => {
    api.get('/admin/stats').then((r) => setStats(r.data)).catch(() => {});
  };

  const fetchMeta = () => {
    api.get('/admin/courses').then((r) => setCourses(r.data)).catch(() => {});
    api.get('/admin/papers').then((r) => setPapers(r.data)).catch(() => {});
  };

  const fetchEligibility = () => {
    const params = { ...filters };
    if (search) params.q = search;
    Object.keys(params).forEach((k) => {
      if (params[k] === '') delete params[k];
    });
    api.get('/admin/exam-eligibility-summary', { params })
      .then((r) => setEligibility(r.data))
      .catch(() => setEligibility({ total: 0, eligible_count: 0, ineligible_count: 0, items: [] }));
  };

  useEffect(() => {
    fetchStats();
    fetchMeta();
  }, []);

  useEffect(() => {
    fetchEligibility();
  }, [filters.course_id, filters.paper_id, filters.academic_year, filters.final_eligible, search]);

  const handleOverride = async (row, overrideStatus) => {
    const reason = window.prompt(`Reason for ${overrideStatus ? 'allowing' : 'blocking'} exam access for ${row.student_name}:`, row.override_reason || '');
    if (reason === null) return;
    try {
      await api.put('/admin/exam-eligibility-override', {
        student_id: row.student_id,
        paper_id: row.paper_id,
        override_status: overrideStatus,
        reason,
      });
      toast.success('Override updated');
      fetchEligibility();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to override');
    }
  };

  const eligibilityRows = useMemo(() => eligibility.items || [], [eligibility.items]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' } }} />

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
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total Records</span><b>{eligibility.total || 0}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Eligible</span><b style={{ color: 'var(--accent-emerald)' }}>{eligibility.eligible_count || 0}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Ineligible</span><b style={{ color: 'var(--accent-rose)' }}>{eligibility.ineligible_count || 0}</b></div>
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
        <h3 style={{ fontSize: '0.98rem', fontWeight: 800, marginBottom: 12 }}>Attendance Summary - Exam Eligibility</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <input className="input-field" placeholder="Search student, reg no, subject..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input-field" value={filters.course_id} onChange={(e) => setFilters({ ...filters, course_id: e.target.value })}>
            <option value="">All Courses</option>
            {courses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <select className="input-field" value={filters.paper_id} onChange={(e) => setFilters({ ...filters, paper_id: e.target.value })}>
            <option value="">All Papers</option>
            {papers.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <select className="input-field" value={filters.academic_year} onChange={(e) => setFilters({ ...filters, academic_year: e.target.value })}>
            <option value="">All Years</option>
            {[1, 2, 3, 4, 5].map((y) => <option key={y} value={String(y)}>Year {y}</option>)}
          </select>
          <select className="input-field" value={filters.final_eligible} onChange={(e) => setFilters({ ...filters, final_eligible: e.target.value })}>
            <option value="">All Status</option>
            <option value="true">Eligible</option>
            <option value="false">Ineligible</option>
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Reg No</th>
                <th>Subject</th>
                <th>Course/Year</th>
                <th>Attended / Classes Happened (Since Enrollment)</th>
                <th>Eligible</th>
                <th>Override</th>
              </tr>
            </thead>
            <tbody>
              {eligibilityRows.map((row) => (
                <tr key={`${row.student_id}-${row.paper_id}`}>
                  <td>{row.student_name}<div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{row.student_email}</div></td>
                  <td>{row.reg_number || 'N/A'}</td>
                  <td><span className="badge badge-info">{row.paper_code}</span> {row.paper_name}</td>
                  <td>{row.course_name || 'N/A'} / {row.academic_year || 'N/A'}</td>
                  <td>{row.attendance_percentage}% ({row.attended_classes ?? row.attended}/{row.classes_happened ?? row.total_classes})</td>
                  <td>
                    <span className={`badge ${row.final_eligible ? 'badge-success' : 'badge-danger'}`}>
                      {row.final_eligible ? 'Eligible' : 'Ineligible'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.72rem' }} onClick={() => handleOverride(row, true)}>Allow</button>
                      <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.72rem' }} onClick={() => handleOverride(row, false)}>Block</button>
                    </div>
                    {row.override_status !== null && (
                      <div style={{ marginTop: 4, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Override: {row.override_status ? 'Allowed' : 'Blocked'}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {eligibilityRows.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No eligibility records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
