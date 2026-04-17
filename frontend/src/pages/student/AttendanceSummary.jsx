import { Fragment, useState, useEffect } from 'react';
import api from '../../api/axios';
import StatePanel from '../../components/ui/StatePanel';
import { motion } from 'framer-motion';
import { HiOutlineChevronDown, HiOutlineChevronUp } from 'react-icons/hi';
import { formatDateTimeIndia } from '../../utils/dateTime';

function formatSessionDateTime(session) {
  const value = session?.timestamp || session?.date_time || session?.date;
  return formatDateTimeIndia(value, { dateStyle: 'short', timeStyle: 'medium' });
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

  return (
    <div className="student-page">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Attendance Summary</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Detailed view of your attendance across all papers.</p>
      </div>

      <div className="glass-card">
        {loadingSummary ? (
          <StatePanel variant="loading" title="Loading attendance summary" description="Fetching paper-wise attendance and session history." compact />
        ) : null}

        {!loadingSummary && summaryError ? (
          <StatePanel variant="error" title="Unable to load attendance summary" description={summaryError} actionLabel="Retry" onAction={() => window.location.reload()} compact />
        ) : null}

        {!loadingSummary && !summaryError && data.length === 0 ? (
          <StatePanel variant="empty" title="No attendance data available" description="Attendance appears once class sessions are recorded." compact />
        ) : null}

        {!loadingSummary && !summaryError && data.length > 0 ? (
          <div className="table-scroll student-table-scroll">
          <table className="data-table">
          <thead><tr><th>Paper Code</th><th>Paper Name</th><th>Attended</th><th>Total</th><th>Percentage</th><th>Status</th></tr></thead>
          <tbody>
            {data.map((a) => {
              const pct = a.percentage;
              const hasLectures = Number(a.total_classes || 0) > 0;
              const color = !hasLectures
                ? 'var(--text-muted)'
                : (pct >= 75 ? 'var(--accent-emerald)' : pct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)');
              const isExpanded = expandedPaperId === a.paper_id;
              return (
                <Fragment key={a.paper_id}>
                <tr key={a.paper_id}>
                  <td><span className="badge badge-info">{a.paper_code}</span></td>
                  <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{a.paper_name}</td>
                  <td>{a.attended}</td>
                  <td>{a.total_classes}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{ width: `${hasLectures ? Math.min(pct, 100) : 0}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.5s ease' }} />
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color, minWidth: 42 }}>{hasLectures ? `${Math.round(pct)}%` : '—'}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <span className={`badge ${!hasLectures ? 'badge-info' : (pct >= 75 ? 'badge-success' : pct >= 50 ? 'badge-warning' : 'badge-danger')}`}>
                        {!hasLectures ? 'No Lectures yet' : (pct >= 75 ? 'Good' : pct >= 50 ? 'Warning' : 'Critical')}
                      </span>
                      <button
                        type="button"
                        aria-label={isExpanded ? 'Collapse class details' : 'Expand class details'}
                        onClick={() => setExpandedPaperId(isExpanded ? '' : a.paper_id)}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: '1px solid var(--border-glass)',
                          background: 'var(--bg-glass)',
                          display: 'grid',
                          placeItems: 'center',
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {isExpanded ? <HiOutlineChevronUp size={16} /> : <HiOutlineChevronDown size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${a.paper_id}-details`}>
                    <td colSpan="6" style={{ paddingTop: 0, paddingBottom: 16 }}>
                      <div style={{ marginLeft: 16, borderLeft: '2px solid var(--border-glass)', paddingLeft: 14 }}>
                        <div className="session-detail-header" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.8fr', gap: 10, padding: '8px 0', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                          <span>Date & Time</span>
                          <span>Status</span>
                          <span>Session</span>
                        </div>
                        {(a.sessions || []).length === 0 ? (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '8px 0' }}>No class sessions found for this paper.</p>
                        ) : (
                          (a.sessions || []).map((session) => (
                            <div key={session.session_id} className="session-detail-row" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.8fr', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border-glass)', fontSize: '0.8rem' }}>
                              <span>{formatSessionDateTime(session)}</span>
                              <span>
                                <span className={`badge ${session.present ? 'badge-success' : 'badge-danger'}`}>
                                  {session.status}
                                </span>
                              </span>
                              <span style={{ color: 'var(--text-muted)' }}>{session.session_id ? session.session_id.slice(0, 8) : 'N/A'}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
          </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
