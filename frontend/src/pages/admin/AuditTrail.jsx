import { useState, useEffect, useMemo } from 'react';
import api from '../../api/axios';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlineShieldCheck, HiOutlineRefresh } from 'react-icons/hi';

const PER_PAGE = 20;

export default function AuditTrail() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const actionSuggestions = useMemo(() => {
    const commonActions = [
      'CREATE_STUDENT',
      'UPDATE_STUDENT',
      'DELETE_STUDENT',
      'CREATE_PAPER',
      'UPDATE_PAPER',
      'DELETE_PAPER',
      'ASSIGN_LECTURER',
      'BULK_ASSIGN_LECTURER',
      'ATTENDANCE_OVERRIDE_ADD',
      'ATTENDANCE_OVERRIDE_REMOVE',
      'EXAM_ELIGIBILITY_OVERRIDE',
      'RESET_PASSWORD',
      'ENROLL_FACE',
    ];

    const fromLogs = logs
      .map((log) => String(log?.action || '').trim())
      .filter(Boolean);

    return Array.from(new Set([...commonActions, ...fromLogs])).sort();
  }, [logs]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchLogs = (p = page) => {
    const params = { page: p, per_page: PER_PAGE };
    if (keyword) params.action = keyword;
    if (dateFrom) params.from = dateFrom;
    if (dateTo) params.to = dateTo;
    api.get('/admin/audit-logs', { params })
      .then((r) => {
        const nextLogs = Array.isArray(r.data?.logs)
          ? r.data.logs
          : (Array.isArray(r.data) ? r.data : []);
        const resolvedTotal = Number(r.data?.total || nextLogs.length || 0);
        const maxPage = Math.max(1, Math.ceil(resolvedTotal / PER_PAGE));

        // If requested page is out of range, snap to last valid page.
        if (resolvedTotal > 0 && p > maxPage) {
          setPage(maxPage);
          fetchLogs(maxPage);
          return;
        }

        setLogs(nextLogs);
        setTotal(resolvedTotal);
        setPage(p);
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

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

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
    const withinOneDay = nowMs - ts <= 24 * 60 * 60 * 1000;
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
            list="audit-action-suggestions"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <datalist id="audit-action-suggestions">
            {actionSuggestions.map((action) => <option key={action} value={action} />)}
          </datalist>
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
      <div className="glass-card table-desktop" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
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

      <div className="mobile-card-list" style={{ marginTop: 10 }}>
        {logs.map((log, i) => {
          const allowed = Boolean(log?.rollback_available) || isFallbackRollbackCandidate(log);
          return (
            <div key={log._id || i} className="glass-card mobile-card">
              <div className="mobile-card-row">
                <span className="mobile-card-label">Timestamp</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                  }) : '—'}
                </span>
              </div>
              <div className="mobile-card-row">
                <span className="mobile-card-label">Actor</span>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{log.actor_name || '—'}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{log.actor_email || ''}</p>
                </div>
              </div>
              <div className="mobile-card-row">
                <span className="mobile-card-label">Role</span>
                <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>{log.role || '—'}</span>
              </div>
              <div className="mobile-card-row">
                <span className="mobile-card-label">Action</span>
                <span className={`badge ${getActionColor(log.action)}`} style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {log.action || '—'}
                </span>
              </div>
              <div className="mobile-card-row">
                <span className="mobile-card-label">Target</span>
                <span style={{ fontSize: '0.8rem' }}>{log.target_type || '—'}</span>
              </div>
              <div className="mobile-card-row">
                <span className="mobile-card-label">IP</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{log.ip || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                {log.rolled_back ? (
                  <span className="badge badge-success">Rolled Back</span>
                ) : (
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '0.75rem', opacity: allowed ? 1 : 0.6, whiteSpace: 'nowrap' }}
                    onClick={() => handleRollback(log)}
                    disabled={!allowed}
                    title={allowed ? 'Rollback this action' : 'Rollback unavailable for this entry'}
                  >
                    <HiOutlineRefresh size={14} /> Rollback
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {logs.length === 0 && (
          <div className="glass-card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
            No audit logs yet.
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > PER_PAGE && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16 }}>
          <button
            className="btn-secondary"
            disabled={!canGoPrev}
            onClick={() => canGoPrev && fetchLogs(page - 1)}
            style={{ padding: '6px 16px', fontSize: '0.8rem' }}
          >
            Previous
          </button>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn-secondary"
            disabled={!canGoNext}
            onClick={() => canGoNext && fetchLogs(page + 1)}
            style={{ padding: '6px 16px', fontSize: '0.8rem' }}
          >
            Next
          </button>
        </div>
      )}
    </motion.div>
  );
}
