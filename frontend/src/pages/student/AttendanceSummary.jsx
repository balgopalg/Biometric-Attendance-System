import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { motion } from 'framer-motion';

export default function AttendanceSummary() {
  const [data, setData] = useState([]);

  useEffect(() => {
    api.get('/student/attendance').then((r) => setData(r.data)).catch(() => {});
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Attendance Summary</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Detailed view of your attendance across all papers.</p>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead><tr><th>Paper Code</th><th>Paper Name</th><th>Attended</th><th>Total</th><th>Percentage</th><th>Status</th></tr></thead>
          <tbody>
            {data.map((a) => {
              const pct = a.percentage;
              const color = pct >= 75 ? 'var(--accent-emerald)' : pct >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)';
              return (
                <tr key={a.paper_id}>
                  <td><span className="badge badge-info">{a.paper_code}</span></td>
                  <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{a.paper_name}</td>
                  <td>{a.attended}</td>
                  <td>{a.total_classes}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.5s ease' }} />
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color, minWidth: 42 }}>{Math.round(pct)}%</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${pct >= 75 ? 'badge-success' : pct >= 50 ? 'badge-warning' : 'badge-danger'}`}>
                      {pct >= 75 ? 'Good' : pct >= 50 ? 'Warning' : 'Critical'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No attendance data available.</td></tr>}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
