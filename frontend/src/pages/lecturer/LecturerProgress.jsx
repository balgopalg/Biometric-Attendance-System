import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { motion } from 'framer-motion';
import StatsCard from '../../components/ui/StatsCard';
import { HiOutlineCalendar, HiOutlineChartBar, HiOutlineUsers } from 'react-icons/hi';
import Modal from '../../components/ui/Modal';
import PinCommitModal from './PinCommitModal';
import { formatCourseName } from '../../utils/courseDisplay';

function formatDateTime(value) {
  if (!value) return 'N/A';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return 'N/A';
  }
}

export default function LecturerProgress() {
  const [data, setData] = useState({ summary: {}, papers: [], per_paper: [], sessions: [] });
  const [filters, setFilters] = useState({ paper_id: '', from_date: '', to_date: '' });
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionReview, setSessionReview] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showRecommitPin, setShowRecommitPin] = useState(false);
  const [adjustIds, setAdjustIds] = useState([]);

  const fetchProgress = () => {
    const params = {};
    if (filters.paper_id) params.paper_id = filters.paper_id;
    if (filters.from_date) params.from_date = filters.from_date;
    if (filters.to_date) params.to_date = filters.to_date;

    api.get('/lecturer/progress', { params })
      .then((r) => setData(r.data || { summary: {}, papers: [], per_paper: [], sessions: [] }))
      .catch(() => setData({ summary: {}, papers: [], per_paper: [], sessions: [] }));
  };

  useEffect(() => {
    fetchProgress();
  }, [filters.paper_id, filters.from_date, filters.to_date]);

  const perPaperSorted = useMemo(() => {
    return [...(data.per_paper || [])].sort((a, b) => (b.classes_taken || 0) - (a.classes_taken || 0));
  }, [data.per_paper]);

  const openHistory = async (session) => {
    setSelectedSession(session);
    setShowHistory(true);
    try {
      const res = await api.get(`/lecturer/session/${session.session_id}/review`);
      setSessionReview(res.data);
      setAdjustIds((res.data.present_students || []).map((x) => x.user_id));
    } catch {
      setSessionReview(null);
    }
  };

  const handleRecommit = async (pin) => {
    if (!sessionReview?.session_id) return;
    const res = await api.put(`/lecturer/session/${sessionReview.session_id}/adjust`, {
      pin,
      student_ids: adjustIds,
    });
    setSessionReview(res.data.review);
    setShowRecommitPin(false);
    fetchProgress();
  };

  const absentStudents = useMemo(() => {
    if (!sessionReview) return [];
    const present = new Set((sessionReview.present_students || []).map((x) => x.user_id));
    return (sessionReview.candidates || []).filter((x) => !present.has(x.user_id));
  }, [sessionReview]);

  return (
    <motion.div className="lecturer-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Attendance History</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 3 }}>
          Track classes taken and attendance per class within a selected date range.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
        <select className="input-field" value={filters.paper_id} onChange={(e) => setFilters({ ...filters, paper_id: e.target.value })}>
          <option value="">All Papers</option>
          {(data.papers || []).map((p) => (
            <option key={p._id} value={p._id}>{p.name} ({p.code})</option>
          ))}
        </select>
        <input className="input-field" type="date" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} />
        <input className="input-field" type="date" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 22 }}>
        <StatsCard icon={HiOutlineCalendar} label="Total Classes Taken" value={data.summary?.total_classes_taken || 0} color="var(--accent-cyan)" />
        <StatsCard icon={HiOutlineUsers} label="Attendance Marks" value={data.summary?.total_attendance_marks || 0} color="var(--accent-emerald)" />
        <StatsCard icon={HiOutlineChartBar} label="Avg Attendance/Class" value={data.summary?.average_attendance_per_class || 0} color="var(--accent-amber)" />
      </div>

      <div className="glass-card" style={{ padding: 18, marginBottom: 16 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 10 }}>Per Subject Summary</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Course</th>
                <th>Year</th>
                <th>Classes</th>
                <th>Attendance Marks</th>
                <th>Avg/Class</th>
              </tr>
            </thead>
            <tbody>
              {perPaperSorted.map((p) => (
                <tr key={p.paper_id}>
                  <td><span className="badge badge-info">{p.paper_code}</span> {p.paper_name}</td>
                  <td>{formatCourseName(p.course_name || 'N/A', { isInactive: p.is_course_inactive, status: p.course_status })}</td>
                  <td>{p.academic_year || 'N/A'}</td>
                  <td>{p.classes_taken}</td>
                  <td>{p.attendance_marks}</td>
                  <td>{p.avg_attendance_per_class}</td>
                </tr>
              ))}
              {perPaperSorted.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No class data in selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 18 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 10 }}>Class-wise Attendance</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Class Time</th>
                <th>Subject</th>
                <th>Course</th>
                <th>Year</th>
                <th>Students (Attended/Total)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(data.sessions || []).map((s) => (
                <tr key={`${s.session_id}-${s.paper_id}`}>
                  <td>{formatDateTime(s.timestamp)}</td>
                  <td><span className="badge badge-purple">{s.paper_code}</span> {s.paper_name}</td>
                  <td>{formatCourseName(s.course_name || 'N/A', { isInactive: s.is_course_inactive, status: s.course_status })}</td>
                  <td>{s.academic_year || 'N/A'}</td>
                  <td>{s.students_count} / {s.total_students ?? 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.72rem' }} onClick={() => openHistory(s)}>
                        {s.editable ? 'Modify / View' : 'View History'}
                      </button>
                      {s.editable ? <span className="badge badge-warning">Rollback Open</span> : <span className="badge">Finalized</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {(data.sessions || []).length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No class sessions found in selected date range.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title="Session Attendance History" width={760}>
        {!sessionReview ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading attendance history...</p>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <p style={{ fontSize: '0.82rem' }}><b>Subject:</b> {sessionReview.paper?.name || selectedSession?.paper_name} ({sessionReview.paper?.code || selectedSession?.paper_code})</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Rollback until: {formatDateTime(sessionReview.rollback_until)}
                {sessionReview.editable ? ' (open)' : ' (closed)'}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="glass-card" style={{ padding: 12 }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>Present</h4>
                <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: 8 }}>
                  {(sessionReview.candidates || []).map((s) => {
                    const checked = adjustIds.includes(s.user_id);
                    return (
                      <label key={s.user_id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 6px', fontSize: '0.82rem' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!sessionReview.editable}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...adjustIds, s.user_id]
                              : adjustIds.filter((id) => id !== s.user_id);
                            setAdjustIds(next);
                          }}
                        />
                        {s.name} ({s.email})
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="glass-card" style={{ padding: 12 }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>Absent</h4>
                <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: 8 }}>
                  {absentStudents.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No absentees.</p>
                  ) : absentStudents.map((s) => (
                    <div key={s.user_id} style={{ padding: '6px 4px', fontSize: '0.82rem' }}>
                      {s.name} ({s.email})
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button className="btn-secondary" onClick={() => setShowHistory(false)}>Close</button>
              <button className="btn-primary" disabled={!sessionReview.editable} onClick={() => setShowRecommitPin(true)}>
                Modify & Re-Commit
              </button>
            </div>
          </>
        )}
      </Modal>

      <PinCommitModal
        isOpen={showRecommitPin}
        onClose={() => setShowRecommitPin(false)}
        onCommit={handleRecommit}
        studentsCount={adjustIds.length}
        title="Re-Commit Attendance Adjustments"
        subtitle="Enter your 4-digit PIN to save modifications for this class session."
        confirmLabel="Confirm Re-Commit"
        loadingLabel="Re-committing..."
      />
    </motion.div>
  );
}
