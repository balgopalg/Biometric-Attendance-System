import { useState, useEffect } from 'react';
import api from '../../api/axios';
import StatePanel from '../../components/ui/StatePanel';
import { motion } from 'framer-motion';
import { HiOutlineDocumentText, HiOutlineCheckCircle, HiOutlineXCircle } from 'react-icons/hi';

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

  const eligible = eligibility.filter((e) => e.eligible).length;
  const total = eligibility.length;
  const overall = eligibility[0] || null;
  const overallPct = Number(overall?.overall_attendance_percentage ?? overall?.attendance_percentage ?? 0);
  const overallAttended = Number(overall?.overall_attended_classes ?? 0);
  const overallTotal = Number(overall?.overall_total_classes ?? 0);
  const overallStatus = overallTotal <= 0
    ? 'No Lectures Yet'
    : (overallPct >= 75 ? 'Eligible Zone' : 'Below Threshold');
  const overallStatusClass = overallTotal <= 0
    ? 'badge-info'
    : (overallPct >= 75 ? 'badge-success' : 'badge-danger');

  if (loadingPortal) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Exam Portal</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Your exam eligibility status — {eligible}/{total} papers eligible
          </p>
        </div>
        <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <StatePanel variant="loading" title="Loading exam eligibility" description="Calculating overall and paper-wise eligibility status." compact />
        </div>
      </div>
    );
  }

  if (portalError) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Exam Portal</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Your exam eligibility status — {eligible}/{total} papers eligible
          </p>
        </div>
        <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <StatePanel variant="error" title="Unable to load exam eligibility" description={portalError} actionLabel="Retry" onAction={() => window.location.reload()} compact />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Exam Portal</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Your exam eligibility status — {eligible}/{total} papers eligible
        </p>
      </div>

      <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4 }}>Overall Attendance Summary</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Combined attendance across all enrolled papers</p>
          </div>
          <span className={`badge ${overallStatusClass}`}>{overallStatus}</span>
        </div>

        <div className="exam-overall-stats" style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Overall Percentage</p>
            <p style={{ fontSize: '1.15rem', fontWeight: 800 }}>{overallTotal <= 0 ? 'N/A' : `${overallPct}%`}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Attended Classes</p>
            <p style={{ fontSize: '1.15rem', fontWeight: 800 }}>{overallAttended}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Total Classes</p>
            <p style={{ fontSize: '1.15rem', fontWeight: 800 }}>{overallTotal}</p>
          </div>
        </div>
      </div>

      <div className="exam-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {eligibility.map((e) => (
          (() => {
            const isNoLecturesYet = e.eligible === null || String(e.status || '').toLowerCase().includes('no lectures');
            const isEligible = e.eligible === true;
            const borderColor = isNoLecturesYet ? 'var(--accent-purple)' : (isEligible ? 'var(--accent-emerald)' : 'var(--accent-rose)');
            const statusClass = isNoLecturesYet ? 'badge-info' : (isEligible ? 'badge-success' : 'badge-danger');
            const iconColor = isNoLecturesYet ? 'var(--accent-purple)' : (isEligible ? 'var(--accent-emerald)' : 'var(--accent-rose)');

            return (
          <motion.div
            key={e.paper_id}
            whileHover={{ y: -3 }}
            className="glass-card"
            style={{
              padding: 16, position: 'relative', overflow: 'hidden',
              borderLeft: `2px solid ${borderColor}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="badge badge-info" style={{ marginBottom: 6, fontSize: '0.7rem' }}>{e.paper_code}</span>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: 6 }}>{e.paper_name}</h4>
              </div>
              {isEligible
                ? <HiOutlineCheckCircle size={24} style={{ color: iconColor }} />
                : <HiOutlineXCircle size={24} style={{ color: iconColor }} />
              }
            </div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <span className={`badge ${statusClass}`} style={{ fontSize: '0.75rem', padding: '4px 12px' }}>
                {e.status}
              </span>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6 }}>
              {e.approval_source || 'Auto approved'}
            </p>
            {!isEligible && !isNoLecturesYet && (
              <p style={{ fontSize: '0.7rem', color: 'var(--accent-rose)', marginTop: 8, padding: '5px 8px', background: 'rgba(244,63,94,0.06)', borderRadius: 6 }}>
                ⚠ You need at least 75% attendance for exam eligibility.
              </p>
            )}
          </motion.div>
            );
          })()
        ))}
        {eligibility.length === 0 ? (
          <StatePanel variant="empty" title="No eligibility data available" description="Eligibility cards appear after attendance is processed." compact />
        ) : null}
      </div>
    </div>
  );
}
