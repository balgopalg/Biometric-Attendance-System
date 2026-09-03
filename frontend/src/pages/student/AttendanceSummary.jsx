import { Fragment, useState, useEffect } from 'react';
import api from '../../api/axios';
import StatePanel from '../../components/ui/StatePanel';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineChevronDown, HiOutlineChevronUp, HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineClock } from 'react-icons/hi';
function formatSessionDateTime(session) {
  const candidates = [session?.date_time, session?.date, session?.timestamp];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '—';
}

function AttendanceRing({ pct, hasLectures, size = 72 }) {
  const color = !hasLectures ? 'var(--text-muted)' : pct >= 75 ? 'var(--accent-emerald)' : pct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';
  const deg = hasLectures ? (Math.min(pct, 100) / 100) * 360 : 0;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `conic-gradient(${color} ${deg}deg, rgba(255,255,255,0.06) ${deg}deg)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: size - 14, height: size - 14, borderRadius: '50%',
        background: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: size > 60 ? '1rem' : '0.78rem', color,
      }}>
        {hasLectures ? `${Math.round(pct)}%` : '—'}
      </div>
    </div>
  );
}

export default function AttendanceSummary() {
  const [data, setData] = useState([]);
  const [expandedPaperId, setExpandedPaperId] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  useEffect(() => {
    setLoadingSummary(true);
    setSummaryError('');
    api.get('/student/attendance').then((r) => setData(r.data)).catch((err) => {
      setData([]);
      setSummaryError(err.response?.data?.error || 'Failed to load attendance summary.');
    }).finally(() => setLoadingSummary(false));
  }, []);

  const safeData = Array.isArray(data) ? data : [];
  const overall = safeData.length > 0
    ? Math.round(safeData.filter(a => Number(a.total_classes || 0) > 0).reduce((s, a, _, arr) => s + a.percentage / arr.length, 0))
    : null;

  return (
    <div className="student-page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 3 }}>Attendance Summary</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Paper-wise attendance breakdown with session history.</p>
        </div>
        {overall !== null && (
          <div style={{ padding: '8px 18px', borderRadius: 12, background: overall >= 75 ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', border: `1px solid ${overall >= 75 ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}`, textAlign: 'center' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Overall</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: overall >= 75 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{overall}%</div>
          </div>
        )}
      </div>

      {loadingSummary && <StatePanel variant="loading" title="Loading attendance" description="Fetching paper-wise sessions..." compact />}
      {!loadingSummary && summaryError && <StatePanel variant="error" title="Error" description={summaryError} actionLabel="Retry" onAction={() => window.location.reload()} compact />}
      {!loadingSummary && !summaryError && safeData.length === 0 && <StatePanel variant="empty" title="No attendance data" description="Attendance appears once class sessions are recorded." compact />}

      {!loadingSummary && !summaryError && safeData.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {safeData.map((a) => {
            const pct = a.percentage;
            const hasLectures = Number(a.total_classes || 0) > 0;
            const color = !hasLectures ? 'var(--text-muted)' : pct >= 75 ? 'var(--accent-emerald)' : pct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';
            const isExpanded = expandedPaperId === a.paper_id;
            const statusLabel = !hasLectures ? 'No Lectures' : pct >= 75 ? 'On Track ✓' : pct >= 50 ? 'Warning' : 'Critical';
            const statusClass = !hasLectures ? 'badge-info' : pct >= 75 ? 'badge-success' : pct >= 50 ? 'badge-warning' : 'badge-danger';
            const latestSession = (a.sessions || [])[0];

            return (
              <Fragment key={a.paper_id}>
                <motion.div
                  className="glass-card"
                  whileHover={{ y: -2 }}
                  style={{ padding: 16, borderLeft: `3px solid ${color}`, cursor: 'pointer' }}
                  onClick={() => setExpandedPaperId(isExpanded ? '' : a.paper_id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <AttendanceRing pct={pct} hasLectures={hasLectures} size={64} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span className="badge badge-info">{a.paper_code}</span>
                        <span className={`badge ${statusClass}`} style={{ fontSize: '0.65rem' }}>{statusLabel}</span>
                      </div>
                      <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>{a.paper_name}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{ width: `${hasLectures ? Math.min(pct, 100) : 0}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 0.5s ease' }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color, minWidth: 40 }}>{hasLectures ? `${Math.round(pct)}%` : '—'}</span>
                      </div>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{a.attended} attended · {a.total_classes} total classes</p>
                      {latestSession && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          Latest session: {formatSessionDateTime(latestSession)}
                        </p>
                      )}
                    </div>
                    <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                      {isExpanded ? <HiOutlineChevronUp size={18} /> : <HiOutlineChevronDown size={18} />}
                    </div>
                  </div>
                </motion.div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="glass-card" style={{ padding: '12px 16px', borderTop: 'none', borderRadius: '0 0 12px 12px', marginTop: -8 }}>
                        <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Session History</p>
                        {(a.sessions || []).length === 0 ? (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No sessions found.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {(a.sessions || []).map((session) => (
                              <div key={session.session_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: 8, background: session.present ? 'rgba(16,185,129,0.05)' : 'rgba(244,63,94,0.04)', border: `1px solid ${session.present ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.12)'}`, flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {session.present
                                    ? <HiOutlineCheckCircle size={15} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
                                    : <HiOutlineXCircle size={15} style={{ color: 'var(--accent-rose)', flexShrink: 0 }} />
                                  }
                                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{formatSessionDateTime(session)}</span>
                                </div>
                                <span className={`badge ${session.present ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.65rem' }}>{session.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
