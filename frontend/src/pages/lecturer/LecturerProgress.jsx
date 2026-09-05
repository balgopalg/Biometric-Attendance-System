import { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { motion } from 'framer-motion';
import StatsCard from '../../components/ui/StatsCard';
import { HiOutlineCalendar, HiOutlineChartBar, HiOutlineUsers } from 'react-icons/hi';
import Modal from '../../components/ui/Modal';
import StatePanel from '../../components/ui/StatePanel';
import PinCommitModal from './PinCommitModal';
import { formatCourseName } from '../../utils/courseDisplay';
import { formatDateTimeIndia, getIndiaTimezoneOffsetMinutes } from '../../utils/dateTime';

const TIMESTAMP_WITHOUT_TZ_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

function normalizeUtcTimestamp(value) {
  if (typeof value !== 'string') return value;
  return TIMESTAMP_WITHOUT_TZ_PATTERN.test(value) ? `${value}Z` : value;
}

function RollbackTimerText({ rollbackUntil, type = 'badge' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const ms = new Date(normalizeUtcTimestamp(rollbackUntil)).getTime() - Date.now();
    if (ms <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [rollbackUntil]);

  const ms = new Date(normalizeUtcTimestamp(rollbackUntil)).getTime() - now;
  const isOpen = ms > 0;

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  if (type === 'badge') {
    if (!isOpen) return <span className="badge" style={{ fontSize: '0.65rem' }}>Finalized</span>;
    return <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Rollback Open ({formatTime(ms)})</span>;
  }
  
  if (!isOpen) return 'Closed';
  return `Open (${formatTime(ms)} left)`;
}

function formatDateTime(value) {
  return formatDateTimeIndia(normalizeUtcTimestamp(value), { dateStyle: 'short', timeStyle: 'medium' });
}

function isRollbackOpenByTime(value) {
  if (!value) return false;
  const ms = new Date(normalizeUtcTimestamp(value)).getTime();
  if (Number.isNaN(ms)) return false;
  return ms > Date.now();
}

export default function LecturerProgress() {
  const [data, setData] = useState({ summary: {}, papers: [], per_paper: [], sessions: [] });
  const [filters, setFilters] = useState({ paper_id: '', from_date: '', to_date: '' });
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionReview, setSessionReview] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showRecommitPin, setShowRecommitPin] = useState(false);
  const [adjustIds, setAdjustIds] = useState([]);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [progressError, setProgressError] = useState('');

  const fetchProgress = () => {
    if (filters.from_date && filters.to_date && filters.from_date > filters.to_date) {
      setData({ summary: {}, papers: [], per_paper: [], sessions: [] });
      setProgressError('From date must be before or equal to To date.');
      setLoadingProgress(false);
      return;
    }
    setLoadingProgress(true);
    setProgressError('');
    const params = {};
    if (filters.paper_id) params.paper_id = filters.paper_id;
    if (filters.from_date) params.from_date = filters.from_date;
    if (filters.to_date) params.to_date = filters.to_date;
    params.tz_offset_minutes = getIndiaTimezoneOffsetMinutes();

    api.get('/lecturer/progress', { params })
      .then((r) => setData(r.data || { summary: {}, papers: [], per_paper: [], sessions: [] }))
      .catch((err) => {
        setData({ summary: {}, papers: [], per_paper: [], sessions: [] });
        setProgressError(err.response?.data?.error || 'Failed to load lecturer progress.');
      })
      .finally(() => setLoadingProgress(false));
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
      user_ids: adjustIds,
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

  if (loadingProgress) {
    return (
      <div className="lecturer-page">
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Attendance History</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 3 }}>
            Track classes taken and attendance per class within a selected date range.
          </p>
        </div>
        <StatePanel variant="loading" title="Loading attendance history" description="Collecting subject summaries and class sessions." compact />
      </div>
    );
  }

  if (progressError) {
    return (
      <div className="lecturer-page">
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Attendance History</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 3 }}>
            Track classes taken and attendance per class within a selected date range.
          </p>
        </div>
        <StatePanel variant="error" title="Unable to load attendance history" description={progressError} actionLabel="Retry" onAction={fetchProgress} compact />
      </div>
    );
  }

  return (
    <div className="lecturer-page">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Attendance History</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 3 }}>
          Track classes taken and attendance per class within a selected date range.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="glass-card" style={{ padding: 14, marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <div>
          <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Paper</label>
          <select className="input-field" value={filters.paper_id} onChange={(e) => setFilters({ ...filters, paper_id: e.target.value })}>
            <option value="">All Papers</option>
            {(data.papers || []).map((p) => (
              <option key={p._id} value={p._id}>{p.name} ({p.code})</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>From Date</label>
          <input className="input-field" type="date" value={filters.from_date} max={filters.to_date || undefined} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>To Date</label>
          <input className="input-field" type="date" value={filters.to_date} min={filters.from_date || undefined} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 22 }}>
        <StatsCard icon={HiOutlineCalendar} label="Total Classes Taken" value={data.summary?.total_classes_taken || 0} color="var(--accent-cyan)" />
        <StatsCard icon={HiOutlineUsers} label="Attendance Marks" value={data.summary?.total_attendance_marks || 0} color="var(--accent-emerald)" />
        <StatsCard icon={HiOutlineChartBar} label="Avg Attendance/Class" value={data.summary?.average_attendance_per_class || 0} color="var(--accent-amber)" />
      </div>

      <div className="glass-card" style={{ padding: 18, marginBottom: 16 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 14 }}>Per Subject Summary</h3>
        {perPaperSorted.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {perPaperSorted.map((p) => {
              const total = p.attendance_marks || 0;
              const classes = p.classes_taken || 0;
              const avg = p.avg_attendance_per_class || 0;
              const maxAvg = Math.max(...perPaperSorted.map(x => x.avg_attendance_per_class || 0), 1);
              const barPct = maxAvg > 0 ? (avg / maxAvg) * 100 : 0;
              return (
                <div key={p.paper_id} style={{ padding: '12px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border-glass)', background: 'var(--bg-glass)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="badge badge-info">{p.paper_code}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{p.paper_name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <span><b style={{ color: 'var(--text-primary)' }}>{classes}</b> classes</span>
                      <span><b style={{ color: 'var(--accent-emerald)' }}>{total}</b> marks</span>
                      <span>avg <b style={{ color: 'var(--text-primary)' }}>{avg}</b>/class</span>
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-card)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, borderRadius: 999, background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: 20 }}>No subject data in selected filters.</p>
        )}
      </div>

      <div className="glass-card" style={{ padding: 18 }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 14 }}>Class-wise Attendance</h3>
        {(data.sessions || []).length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data.sessions || []).map((s) => {
              const rollbackOpen = isRollbackOpenByTime(s.rollback_until);
              const attended = s.students_count || 0;
              const total = s.total_students || 0;
              const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
              return (
                <div key={`${s.session_id}-${s.paper_id}`} className="session-card" style={{ padding: '12px 14px', borderRadius: 'var(--radius)', border: `1px solid ${rollbackOpen ? 'rgba(251,191,36,0.25)' : 'var(--border-glass)'}`, background: rollbackOpen ? 'rgba(251,191,36,0.04)' : 'var(--bg-glass)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span className="badge badge-purple">{s.paper_code}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{s.paper_name}</span>
                      <RollbackTimerText rollbackUntil={s.rollback_until} type="badge" />
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span>{formatDateTime(s.timestamp)}</span>
                      <span>·</span>
                      <span>{formatCourseName(s.course_name || 'N/A', { isInactive: s.is_course_inactive, status: s.course_status })}</span>
                    </div>
                  </div>
                  <div className="session-card-stats">
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: pct >= 75 ? 'var(--accent-emerald)' : pct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>{attended} / {total}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{pct}% attended</div>
                    </div>
                    <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap' }} onClick={() => openHistory(s)}>
                      {rollbackOpen ? 'Modify / View' : 'View'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: 24 }}>No sessions found in selected date range.</p>
        )}
      </div>

      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title="Session Attendance" width={700}>
        {!sessionReview ? (
          <StatePanel variant="loading" title="Loading session" description="Fetching attendance records..." compact />
        ) : (() => {
          const rollbackOpen = isRollbackOpenByTime(sessionReview.rollback_until);
          const presentCount = adjustIds.length;
          const totalCount = (sessionReview.candidates || []).length;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
              {/* Fixed Header */}
              <div style={{ flexShrink: 0, display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
                {[{ label: 'Subject', value: `${sessionReview.paper?.name || selectedSession?.paper_name} (${sessionReview.paper?.code || selectedSession?.paper_code})` },
                  { label: 'Present', value: `${presentCount} / ${totalCount}`, accent: 'var(--accent-emerald)' },
                  { label: 'Rollback', value: <RollbackTimerText rollbackUntil={sessionReview.rollback_until} type="text" />, accent: rollbackOpen ? 'var(--accent-amber)' : 'var(--accent-rose)' }].map(({ label, value, accent }) => (
                  <div key={label}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: accent || 'var(--text-primary)' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Scrollable Middle Content */}
              <div className="session-review-grid" style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 4, paddingBottom: 4, gap: 24 }}>
                <div className="glass-card" style={{ padding: 12, height: 'max-content' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)', display: 'inline-block' }} /> Present ({presentCount})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(sessionReview.candidates || []).map((s) => {
                      const checked = adjustIds.includes(s.user_id);
                      if (!rollbackOpen && !checked) return null;
                      return (
                        <div 
                          key={s.user_id} 
                          style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: 'var(--radius)', background: 'transparent', fontSize: '0.8rem', cursor: rollbackOpen ? 'pointer' : 'default' }}
                          onClick={() => {
                            if (!rollbackOpen) return;
                            setAdjustIds(!checked ? [...adjustIds, s.user_id] : adjustIds.filter((id) => id !== s.user_id));
                          }}
                        >
                          <span style={{ flex: 1 }}>{s.name}</span>
                          {checked && <span className="badge badge-success" style={{ fontSize: '0.62rem' }}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                <div className="glass-card" style={{ padding: 12, height: 'max-content' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-rose)', display: 'inline-block' }} /> Absent ({absentStudents.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {absentStudents.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: 10 }}>No absentees 🎉</p>
                    ) : absentStudents.map((s) => (
                      <div key={s.user_id} style={{ padding: '6px 8px', fontSize: '0.8rem', color: 'var(--text-secondary)', borderRadius: 'var(--radius)' }}>{s.name}</div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fixed Footer Actions */}
              <div className="session-review-actions" style={{ flexShrink: 0, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-glass)' }}>
                <button className="btn-secondary" onClick={() => setShowHistory(false)}>Close</button>
                <button className="btn-primary" disabled={!rollbackOpen} onClick={() => setShowRecommitPin(true)}>Modify &amp; Re-Commit</button>
              </div>
            </div>
          );
        })()}
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
    </div>
  );
}
