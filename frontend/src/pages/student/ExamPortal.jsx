import { useState, useEffect } from 'react';
import api from '../../api/axios';
import StatePanel from '../../components/ui/StatePanel';
import { motion } from 'framer-motion';
import { HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineClock, HiOutlineAcademicCap } from 'react-icons/hi';

export default function ExamPortal() {
  const [eligibility, setEligibility] = useState([]);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [portalError, setPortalError] = useState('');

  useEffect(() => {
    setLoadingPortal(true);
    setPortalError('');
    api.get('/student/exam-eligibility').then((r) => setEligibility(r.data)).catch((err) => {
      setEligibility([]);
      setPortalError(err.response?.data?.error || 'Failed to load exam portal data.');
    }).finally(() => setLoadingPortal(false));
  }, []);

  const safeEligibility = Array.isArray(eligibility) ? eligibility : [];
  const eligible = safeEligibility.filter((e) => e.eligible).length;
  const total = safeEligibility.length;
  const overall = safeEligibility[0] || null;
  const overallPct = Number(overall?.overall_attendance_percentage ?? overall?.attendance_percentage ?? 0);
  const overallAttended = Number(overall?.overall_attended_classes ?? 0);
  const overallTotal = Number(overall?.overall_total_classes ?? 0);
  const overallStatus = overallTotal <= 0 ? 'No Lectures Yet' : (overallPct >= 75 ? 'Eligible' : 'Below Threshold');
  const overallStatusClass = overallTotal <= 0 ? 'badge-info' : (overallPct >= 75 ? 'badge-success' : 'badge-danger');
  const overallColor = overallTotal <= 0 ? 'var(--accent-purple)' : (overallPct >= 75 ? 'var(--accent-emerald)' : 'var(--accent-rose)');
  const deg = overallTotal > 0 ? (Math.min(overallPct, 100) / 100) * 360 : 0;

  return (
    <div className="student-page">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 3 }}>Exam Portal</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          Your examination eligibility based on attendance — {total > 0 ? `${eligible} of ${total} papers eligible` : 'loading...'}
        </p>
      </div>

      {loadingPortal && <StatePanel variant="loading" title="Loading exam eligibility" description="Calculating your paper-wise eligibility status." compact />}
      {!loadingPortal && portalError && <StatePanel variant="error" title="Unable to load exam eligibility" description={portalError} actionLabel="Retry" onAction={() => window.location.reload()} compact />}

      {!loadingPortal && !portalError && (
        <>
          {/* Overall Summary Card */}
          <div className="glass-card" style={{ padding: 20, marginBottom: 20, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Donut */}
            <div style={{ width: 100, height: 100, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(${overallColor} ${deg}deg, rgba(255,255,255,0.06) ${deg}deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 78, height: 78, borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: overallColor }}>{overallTotal > 0 ? `${overallPct}%` : '—'}</span>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Overall Attendance</h3>
                <span className={`badge ${overallStatusClass}`}>{overallStatus}</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 12 }}>Combined attendance across all enrolled papers</p>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {[{ label: 'Attended', value: overallAttended, color: 'var(--accent-emerald)' },
                  { label: 'Total', value: overallTotal, color: 'var(--text-primary)' },
                  { label: 'Papers Eligible', value: `${eligible} / ${total}`, color: eligible === total && total > 0 ? 'var(--accent-emerald)' : 'var(--accent-amber)' }
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <p style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</p>
                    <p style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Per-paper eligibility cards */}
          {safeEligibility.length === 0 ? (
            <StatePanel variant="empty" title="No eligibility data" description="Eligibility cards appear after attendance is processed." compact />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 }}>
              {safeEligibility.map((e) => {
                const isNoLectures = e.eligible === null || String(e.status || '').toLowerCase().includes('no lectures');
                const isEligible = e.eligible === true;
                const borderColor = isNoLectures ? 'var(--accent-purple)' : isEligible ? 'var(--accent-emerald)' : 'var(--accent-rose)';
                const iconColor = borderColor;
                const pct = Number(e.attendance_percentage ?? 0);

                return (
                  <motion.div
                    key={e.paper_id}
                    whileHover={{ y: -4 }}
                    className="glass-card"
                    style={{ padding: 18, position: 'relative', overflow: 'hidden', borderLeft: `3px solid ${borderColor}` }}
                  >
                    {/* Subtle glow bg */}
                    <div style={{ position: 'absolute', top: -24, right: -24, width: 80, height: 80, borderRadius: '50%', background: `${borderColor}18`, pointerEvents: 'none' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <span className="badge badge-info" style={{ fontSize: '0.65rem', marginBottom: 6 }}>{e.paper_code}</span>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: 4, marginBottom: 0 }}>{e.paper_name}</h4>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        {isNoLectures
                          ? <HiOutlineClock size={22} style={{ color: iconColor }} />
                          : isEligible
                            ? <HiOutlineCheckCircle size={22} style={{ color: iconColor }} />
                            : <HiOutlineXCircle size={22} style={{ color: iconColor }} />
                        }
                      </div>
                    </div>

                    {/* Progress bar */}
                    {!isNoLectures && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 4 }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: borderColor, borderRadius: 999, transition: 'width 0.5s ease' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          <span>{pct}% attended</span>
                          <span style={{ color: pct >= 75 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>75% required</span>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{e.approval_source || 'Auto approved'}</span>
                      <span className={`badge ${isNoLectures ? 'badge-info' : isEligible ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.65rem' }}>{e.status}</span>
                    </div>

                    {!isEligible && !isNoLectures && (
                      <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(244,63,94,0.06)', borderRadius: 8, border: '1px solid rgba(244,63,94,0.15)', fontSize: '0.7rem', color: 'var(--accent-rose)' }}>
                        ⚠ Need 75% attendance for exam eligibility
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
