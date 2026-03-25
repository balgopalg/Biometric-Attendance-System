import { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlineShieldCheck, HiOutlineRefresh } from 'react-icons/hi';

export default function AuditTrail() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchLogs = (p = page) => {
    const params = { page: p, per_page: 20 };
    if (keyword) params.action = keyword;
    if (dateFrom) params.from = dateFrom;
    if (dateTo) params.to = dateTo;
    api.get('/admin/audit-logs', { params })
      .then((r) => {
        const nextLogs = Array.isArray(r.data?.logs)
          ? r.data.logs
          : (Array.isArray(r.data) ? r.data : []);
        setLogs(nextLogs);
        setTotal(Number(r.data?.total || nextLogs.length || 0));
      })
      .catch(() => {
        setLogs([]);
        setTotal(0);
      });
  };

  useEffect(() => { fetchLogs(1); }, []);

  const handleFilter = () => {
    setPage(1);
    fetchLogs(1);
  };

  const handleReset = () => {
    setKeyword('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
    setTimeout(() => fetchLogs(1), 0);
  };

  const getActionColor = (action) => {
    const a = action?.toUpperCase() || '';
    if (a.includes('DELETE')) return 'badge-danger';
    if (a.includes('CREATE')) return 'badge-info';
    if (a.includes('UPDATE') || a.includes('ASSIGN')) return 'badge-warning';
    return 'badge-purple';
  };

  const isFallbackRollbackCandidate = (log) => {
    const action = String(log?.action || '').toUpperCase();
    const reversible = action.includes('CREATE') || action.includes('UPDATE') || action.includes('DELETE');
    if (!reversible) return false;
    if (log?.rolled_back) return false;
    if (!log?.timestamp) return false;

    const ts = new Date(log.timestamp).getTime();
    if (!Number.isFinite(ts)) return false;
    const withinOneDay = Date.now() - ts <= 24 * 60 * 60 * 1000;
    return withinOneDay;
  };

  const handleRollback = async (log) => {
    const allowed = Boolean(log?.rollback_available) || isFallbackRollbackCandidate(log);
    if (!log?._id || !allowed) return;
    if (!window.confirm('Rollback this action? This will attempt to undo the original change.')) return;

    try {
      const res = await api.post(`/admin/audit-logs/${log._id}/rollback`);
      toast.success(res.data?.message || 'Rollback completed');
      fetchLogs(page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Rollback failed');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' } }} />
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HiOutlineShieldCheck size={22} style={{ color: 'var(--accent-purple)' }} />
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Audit Log</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Rollback available for eligible create/update/delete actions within 1 day.</p>
          </div>
        </div>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{total} total entries</span>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Action keyword</label>
          <input
            className="input-field"
            style={{ width: 180, padding: '8px 12px', fontSize: '0.8rem' }}
            placeholder="e.g. OVERRIDE"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>From</label>
          <input
            type="date"
            className="input-field"
            style={{ width: 160, padding: '8px 12px', fontSize: '0.8rem' }}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>To</label>
          <input
            type="date"
            className="input-field"
            style={{ width: 160, padding: '8px 12px', fontSize: '0.8rem' }}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
          <button className="btn-primary" style={{ padding: '8px 18px', fontSize: '0.78rem' }} onClick={handleFilter}>
            Apply Filters
          </button>
          <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.78rem' }} onClick={handleReset}>
            Reset
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
        <table className="data-table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Role</th>
              <th>Action</th>
              <th>Target</th>
              <th>IP</th>
              <th style={{ textAlign: 'right' }}>Rollback</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr key={log._id || i}>
                <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                  {log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                  }) : '—'}
                </td>
                <td>
                  <div>
                    <p style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.82rem' }}>{log.actor_name || '—'}</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{log.actor_email || ''}</p>
                  </div>
                </td>
                <td>
                  <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>{log.role || '—'}</span>
                </td>
                <td>
                  <span className={`badge ${getActionColor(log.action)}`} style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {log.action || '—'}
                  </span>
                </td>
                <td style={{ fontSize: '0.82rem' }}>{log.target_type || '—'}</td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{log.ip || '—'}</td>
                <td style={{ textAlign: 'right', minWidth: 140 }}>
                  {log.rolled_back ? (
                    <span className="badge badge-success">Rolled Back</span>
                  ) : (
                    (() => {
                      const allowed = Boolean(log.rollback_available) || isFallbackRollbackCandidate(log);
                      return (
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '0.75rem', opacity: allowed ? 1 : 0.6, whiteSpace: 'nowrap' }}
                      onClick={() => handleRollback(log)}
                      disabled={!allowed}
                      title={allowed ? 'Rollback this action' : 'Rollback unavailable for this entry'}
                    >
                      <HiOutlineRefresh size={14} /> Rollback
                    </button>
                      );
                    })()
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>No audit logs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
          <button className="btn-secondary" disabled={page <= 1} onClick={() => { setPage(p => p - 1); fetchLogs(page - 1); }} style={{ padding: '6px 16px', fontSize: '0.8rem' }}>Previous</button>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Page {page}</span>
          <button className="btn-secondary" onClick={() => { setPage(p => p + 1); fetchLogs(page + 1); }} style={{ padding: '6px 16px', fontSize: '0.8rem' }}>Next</button>
        </div>
      )}
    </motion.div>
  );
}
