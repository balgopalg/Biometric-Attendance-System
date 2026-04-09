import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { motion } from 'framer-motion';
import { HiOutlineDocumentText, HiOutlineCheckCircle, HiOutlineXCircle } from 'react-icons/hi';

export default function ExamPortal() {
  const [eligibility, setEligibility] = useState([]);

  useEffect(() => {
    api.get('/student/exam-eligibility').then((r) => setEligibility(r.data)).catch(() => {});
  }, []);

  const eligible = eligibility.filter((e) => e.eligible).length;
  const total = eligibility.length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Exam Portal</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Your exam eligibility status — {eligible}/{total} papers eligible
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
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
            whileHover={{ y: -4 }}
            className="glass-card"
            style={{
              padding: 24, position: 'relative', overflow: 'hidden',
              borderLeft: `3px solid ${borderColor}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="badge badge-info" style={{ marginBottom: 8 }}>{e.paper_code}</span>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: 8 }}>{e.paper_name}</h4>
              </div>
              {isEligible
                ? <HiOutlineCheckCircle size={28} style={{ color: iconColor }} />
                : <HiOutlineXCircle size={28} style={{ color: iconColor }} />
              }
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Attendance</p>
                <p style={{
                  fontSize: '1.2rem', fontWeight: 800,
                  color: borderColor,
                }}>{e.attendance_percentage}%</p>
              </div>
              <span className={`badge ${statusClass}`} style={{ fontSize: '0.8rem', padding: '5px 14px' }}>
                {e.status}
              </span>
            </div>
            {!isEligible && !isNoLecturesYet && (
              <p style={{ fontSize: '0.72rem', color: 'var(--accent-rose)', marginTop: 10, padding: '6px 10px', background: 'rgba(244,63,94,0.06)', borderRadius: 6 }}>
                ⚠ You need at least 75% attendance for exam eligibility.
              </p>
            )}
          </motion.div>
            );
          })()
        ))}
        {eligibility.length === 0 && (
          <div className="glass-card" style={{ padding: 30, textAlign: 'center' }}>
            <HiOutlineDocumentText size={32} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
            <p style={{ color: 'var(--text-muted)' }}>No exam eligibility data available.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
