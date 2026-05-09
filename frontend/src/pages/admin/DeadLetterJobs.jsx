import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api/axios';
import Modal from '../../components/ui/Modal';
import StatePanel from '../../components/ui/StatePanel';
import { formatDateTimeIndia, getIndiaTimezoneOffsetMinutes } from '../../utils/dateTime';
import { HiOutlineRefresh, HiOutlineFilter, HiOutlinePlay, HiOutlineTrash, HiOutlineExclamationCircle, HiOutlineChevronLeft, HiOutlineChevronRight, HiOutlineSearch, HiOutlineCalendar, HiOutlineSortAscending, HiOutlineDotsHorizontal } from 'react-icons/hi';

const PER_PAGE = 20;

function normalizeDeadLetterResponse(data, fallbackPage = 1) {
  const detailedItems = Array.isArray(data?.items) ? data.items : [];
  const metricItems = Array.isArray(data?.jobs?.recent_dead_letter_jobs) ? data.jobs.recent_dead_letter_jobs : [];
  const items = detailedItems.length > 0 ? detailedItems : metricItems;
  const totalValue = Number(data?.total);
  const total = detailedItems.length > 0 && Number.isFinite(totalValue) && totalValue >= 0
    ? totalValue
    : items.length;

  return {
    items,
    total,
    page: Number(data?.page || fallbackPage || 1),
  };
}

export default function DeadLetterJobs() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [replayJobId, setReplayJobId] = useState('');
  const [bulkReplaying, setBulkReplaying] = useState(false);
  const [filteredReplaying, setFilteredReplaying] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [filteredDeleting, setFilteredDeleting] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState('');
  const [showDeleteFilteredConfirm, setShowDeleteFilteredConfirm] = useState(false);
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false);
  const [confirmReplayFilteredOpen, setConfirmReplayFilteredOpen] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [estimatedReplayCount, setEstimatedReplayCount] = useState(0);
  const [estimatedReplayPreviewItems, setEstimatedReplayPreviewItems] = useState([]);
  const [loadingEstimatedReplayCount, setLoadingEstimatedReplayCount] = useState(false);
  const [selected, setSelected] = useState([]);
  const [jobsError, setJobsError] = useState('');
  const [filters, setFilters] = useState({ q: '', job_type: '', from: '', to: '', sort_by: 'updated_at', sort_dir: 'desc' });
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const fetchJobs = async (nextPage = page) => {
    setLoading(true);
    setJobsError('');
    const params = { page: nextPage, per_page: PER_PAGE, tz_offset_minutes: getIndiaTimezoneOffsetMinutes() };
    if (filters.q) params.q = filters.q;
    if (filters.job_type) params.job_type = filters.job_type;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.sort_by) params.sort_by = filters.sort_by;
    if (filters.sort_dir) params.sort_dir = filters.sort_dir;

    try {
      const response = await api.get('/admin/jobs/dead-letter', { params });
      const normalized = normalizeDeadLetterResponse(response.data, nextPage);
      const maxPage = Math.max(1, Math.ceil(normalized.total / PER_PAGE));
      if (normalized.total > 0 && nextPage > maxPage) {
        await fetchJobs(maxPage);
        return;
      }
      setItems(normalized.items);
      setTotal(normalized.total);
      setPage(normalized.page);
      setSelected([]);
    } catch {
      try {
        const metricsResponse = await api.get('/admin/jobs/metrics');
        const normalized = normalizeDeadLetterResponse(metricsResponse.data, 1);
        setItems(normalized.items);
        setTotal(normalized.total);
        setPage(1);
        setSelected([]);
      } catch {
        setItems([]);
        setTotal(0);
        setJobsError('Failed to load dead-letter jobs.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchJobs(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  const allOnPageSelected = useMemo(() => {
    if (!items.length) return false;
    return items.every((item) => selected.includes(item.job_id));
  }, [items, selected]);

  const jobTypeOptions = useMemo(() => {
    const set = new Set(items.map((x) => String(x.job_type || '').trim()).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  const toggleSelect = (jobId) => {
    setSelected((prev) => (prev.includes(jobId) ? prev.filter((x) => x !== jobId) : [...prev, jobId]));
  };

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelected((prev) => prev.filter((id) => !items.some((x) => x.job_id === id)));
      return;
    }
    const ids = items.map((x) => x.job_id);
    setSelected((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const replayOne = async (jobId) => {
    setReplayJobId(jobId);
    try {
      await api.post(`/admin/jobs/${jobId}/replay`);
      toast.success(`Replay queued: ${jobId}`);
      fetchJobs(page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Replay failed');
    } finally {
      setReplayJobId('');
    }
  };

  const replaySelected = async () => {
    if (!selected.length) {
      toast.error('Select at least one job');
      return;
    }
    setBulkReplaying(true);
    try {
      const res = await api.post('/admin/jobs/dead-letter/replay-bulk', { job_ids: selected });
      toast.success(`Replayed: ${res.data?.replayed || 0}, Skipped: ${res.data?.skipped || 0}`);
      fetchJobs(page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Bulk replay failed');
    } finally {
      setBulkReplaying(false);
    }
  };

  const runReplayFiltered = async () => {
    setFilteredReplaying(true);
    setConfirmReplayFilteredOpen(false);
    try {
      const payload = {
        q: filters.q,
        job_type: filters.job_type,
        from: filters.from,
        to: filters.to,
        sort_by: filters.sort_by,
        sort_dir: filters.sort_dir,
        tz_offset_minutes: getIndiaTimezoneOffsetMinutes(),
        limit: 500,
      };
      const res = await api.post('/admin/jobs/dead-letter/replay-filtered', payload);
      toast.success(`Matched: ${res.data?.matched || 0}, Replayed: ${res.data?.replayed || 0}, Skipped: ${res.data?.skipped || 0}`);
      fetchJobs(1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Replay filtered failed');
    } finally {
      setFilteredReplaying(false);
    }
  };

  const deleteOne = async (jobId) => {
    if (!window.confirm(`Are you sure you want to delete job ${jobId}?`)) return;
    setDeletingJobId(jobId);
    try {
      await api.delete(`/admin/jobs/${jobId}`);
      toast.success(`Job deleted: ${jobId}`);
      fetchJobs(page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    } finally {
      setDeletingJobId('');
    }
  };

  const runDeleteSelected = async () => {
    setBulkDeleting(true);
    setShowDeleteSelectedConfirm(false);
    try {
      const res = await api.post('/admin/jobs/dead-letter/delete-bulk', { job_ids: selected });
      toast.success(`Deleted: ${res.data?.deleted || 0} jobs`);
      setSelected([]);
      fetchJobs(page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const runDeleteFiltered = async () => {
    setFilteredDeleting(true);
    setShowDeleteFilteredConfirm(false);
    try {
      const res = await api.post('/admin/jobs/dead-letter/delete-filtered', { 
        ...filters, 
        tz_offset_minutes: getIndiaTimezoneOffsetMinutes() 
      });
      toast.success(`Deleted: ${res.data?.deleted || 0} jobs`);
      fetchJobs(page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Filtered delete failed');
    } finally {
      setFilteredDeleting(false);
    }
  };

  const openReplayFilteredConfirmation = async () => {
    setConfirmReplayFilteredOpen(true);
    setConfirmPhrase('');
    setEstimatedReplayCount(0);
    setEstimatedReplayPreviewItems([]);
    setLoadingEstimatedReplayCount(true);

    try {
      const params = { page: 1, per_page: 5, tz_offset_minutes: getIndiaTimezoneOffsetMinutes() };
      if (filters.q) params.q = filters.q;
      if (filters.job_type) params.job_type = filters.job_type;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.sort_by) params.sort_by = filters.sort_by;
      if (filters.sort_dir) params.sort_dir = filters.sort_dir;

      let res;
      try {
        res = await api.get('/admin/jobs/dead-letter', { params });
      } catch {
        res = await api.get('/admin/jobs/metrics');
      }

      const normalized = normalizeDeadLetterResponse(res.data, 1);
      setEstimatedReplayCount(normalized.total);
      const previewItems = normalized.items;
      setEstimatedReplayPreviewItems(
        previewItems
          .map((item) => ({
            job_id: String(item.job_id || ''),
            job_type: String(item.job_type || ''),
            updated_at: item.updated_at,
          }))
          .filter((item) => item.job_id)
      );
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to estimate filtered jobs');
      setEstimatedReplayCount(0);
      setEstimatedReplayPreviewItems([]);
    } finally {
      setLoadingEstimatedReplayCount(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="students-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <h1 className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 800 }}>Dead-Letter Jobs</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>{total} failed jobs in current filter</p>
        </div>
      </div>
      <div className="mobile-admin-action-strip">
        <button
          className="icon-btn mobile-filters-icon-btn"
          type="button"
          title={showMobileFilters ? 'Hide filters' : 'Show filters'}
          onClick={() => setShowMobileFilters((prev) => !prev)}
        >
          <HiOutlineFilter size={18} />
        </button>
        <button 
          className="icon-btn mobile-filters-icon-btn" 
          onClick={() => fetchJobs(page)} 
          disabled={loading}
          title="Refresh Jobs"
        >
          <HiOutlineRefresh size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className={`jobs-filter-grid ${showMobileFilters ? 'is-mobile-open' : ''}`}>
        <div style={{ position: 'relative' }}>
          <HiOutlineSearch size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            className="search-input" 
            placeholder="Search by ID, type, or error..." 
            value={filters.q} 
            onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))} 
          />
        </div>

        <select 
          className="input-field" 
          value={filters.job_type} 
          onChange={(e) => setFilters((p) => ({ ...p, job_type: e.target.value }))}
        >
          <option value="">All Job Types</option>
          {jobTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <input 
          type="date" 
          className="input-field" 
          value={filters.from} 
          max={filters.to || undefined} 
          onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))} 
          placeholder="From Date"
        />

        <input 
          type="date" 
          className="input-field" 
          value={filters.to} 
          min={filters.from || undefined} 
          onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))} 
          placeholder="To Date"
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <select 
            className="input-field" 
            value={filters.sort_by} 
            onChange={(e) => setFilters((p) => ({ ...p, sort_by: e.target.value }))}
            style={{ flex: 1.5 }}
          >
            <option value="updated_at">Updated At</option>
            <option value="created_at">Created At</option>
            <option value="attempts">Attempts</option>
            <option value="job_type">Job Type</option>
          </select>
          <select 
            className="input-field" 
            value={filters.sort_dir} 
            onChange={(e) => setFilters((p) => ({ ...p, sort_dir: e.target.value }))}
            style={{ flex: 1 }}
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>


      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-secondary)', padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <input type="checkbox" className="custom-checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} id="selectAll" />
          <label htmlFor="selectAll" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {selected.length} Selected
          </label>
        </div>
        <button className="btn-secondary" style={{ flex: 1, minWidth: '140px' }} disabled={filteredReplaying || loading || !total} onClick={openReplayFilteredConfirmation}>
          <HiOutlinePlay size={16} /> Replay Filtered
        </button>
        <button className="btn-secondary" style={{ flex: 1, minWidth: '140px' }} disabled={bulkReplaying || !selected.length} onClick={replaySelected}>
          <HiOutlinePlay size={16} /> Replay Selected
        </button>
        <button className="btn-danger" style={{ flex: 1, minWidth: '140px' }} disabled={bulkDeleting || !selected.length} onClick={() => setShowDeleteSelectedConfirm(true)}>
          <HiOutlineTrash size={16} /> Delete Selected
        </button>
        <button className="btn-danger" style={{ flex: 1, minWidth: '140px' }} disabled={filteredDeleting || !total} onClick={() => setShowDeleteFilteredConfirm(true)}>
          <HiOutlineTrash size={16} /> Delete Filtered
        </button>
      </div>

      {/* Desktop View */}
      <div className="glass-card table-desktop" style={{ overflowX: 'auto', display: items.length ? 'block' : 'none' }}>
        <table className="data-table" style={{ minWidth: 1000 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Updated At</th>
              <th>Job ID</th>
              <th>Type</th>
              <th>Student</th>
              <th>Attempts</th>
              <th>Retry</th>
              <th>Error Detail</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((job) => (
              <tr key={job.job_id} className={selected.includes(job.job_id) ? 'row-selected' : ''}>
                <td>
                  <input type="checkbox" checked={selected.includes(job.job_id)} onChange={() => toggleSelect(job.job_id)} />
                </td>
                <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                  {formatDateTimeIndia(job.updated_at, { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{job.job_id}</td>
                <td style={{ fontWeight: 600 }}>{job.job_type}</td>
                <td style={{ fontSize: '0.8rem' }}>
                  {job.student_name ? (
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{job.student_name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{job.reg_number || '—'}</div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
                <td>{job.attempts}/{job.max_attempts}</td>
                <td>{job.retry_count}</td>
                <td style={{ maxWidth: 300, fontSize: '0.74rem', color: 'var(--accent-rose)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {job.error || '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button 
                      className="btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }} 
                      disabled={replayJobId === job.job_id} 
                      onClick={() => replayOne(job.job_id)}
                    >
                      {replayJobId === job.job_id ? 'Wait...' : 'Replay'}
                    </button>
                    <button 
                      className="icon-btn danger" 
                      title="Delete Job"
                      disabled={deletingJobId === job.job_id}
                      onClick={() => deleteOne(job.job_id)}
                    >
                      <HiOutlineTrash size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile View */}
      <div className="mobile-card-list">
        {items.map((job) => (
          <div key={job.job_id} className={`glass-card mobile-card ${selected.includes(job.job_id) ? 'row-selected' : ''}`} style={{ marginBottom: 12 }}>
            <div className="mobile-card-row" style={{ borderBottom: '1px solid var(--border-glass)', marginBottom: 8, paddingBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={selected.includes(job.job_id)} onChange={() => toggleSelect(job.job_id)} />
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{job.job_type}</p>
                  <p style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{job.job_id}</p>
                </div>
              </div>
              <button 
                className="btn-secondary" 
                style={{ padding: '6px 10px', fontSize: '0.75rem' }} 
                disabled={replayJobId === job.job_id} 
                onClick={() => replayOne(job.job_id)}
              >
                <HiOutlinePlay size={14} />
              </button>
            </div>
            <div className="mobile-card-row">
              <span className="mobile-card-label">Updated</span>
              <span style={{ fontSize: '0.78rem' }}>{formatDateTimeIndia(job.updated_at, { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
            {job.student_name && (
              <div className="mobile-card-row">
                <span className="mobile-card-label">Student</span>
                <span style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{job.student_name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{job.reg_number}</div>
                </span>
              </div>
            )}
            <div className="mobile-card-row">
              <span className="mobile-card-label">Attempts</span>
              <span style={{ fontSize: '0.78rem' }}>{job.attempts}/{job.max_attempts} (Retry: {job.retry_count})</span>
            </div>
            <div className="mobile-card-row" style={{ flexDirection: 'column', alignItems: 'flex-start', marginTop: 4 }}>
              <span className="mobile-card-label">Error</span>
              <p style={{ fontSize: '0.74rem', color: 'var(--accent-rose)', marginTop: 4, lineHeight: 1.4 }}>{job.error || 'No error detail'}</p>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {!loading && !items.length && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {jobsError ? (
              <StatePanel variant="error" title="Load Failed" description={jobsError} actionLabel="Retry" onAction={() => fetchJobs(page)} compact />
            ) : (
              <StatePanel variant="empty" title="All Clear" description="No dead-letter jobs found matching current filters." compact />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <StatePanel variant="loading" title="Syncing Queue" description="Fetching latest dead-letter backlog..." compact />
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
          <button className="btn-secondary" disabled={!canGoPrev} onClick={() => fetchJobs(page - 1)}>
            <HiOutlineChevronLeft size={18} />
          </button>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', fontWeight: 600 }}>
            {page} / {totalPages}
          </span>
          <button className="btn-secondary" disabled={!canGoNext} onClick={() => fetchJobs(page + 1)}>
            <HiOutlineChevronRight size={18} />
          </button>
        </div>
      )}

      <Modal isOpen={confirmReplayFilteredOpen} onClose={() => setConfirmReplayFilteredOpen(false)} title="Bulk Replay Confirmation" width={500}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, padding: 16, background: 'rgba(245, 158, 11, 0.1)', borderRadius: 'var(--radius)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <HiOutlineExclamationCircle size={24} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>Mass Replay Operation</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                This will queue <strong>{loadingEstimatedReplayCount ? '...' : estimatedReplayCount}</strong> jobs for immediate retry.
              </p>
            </div>
          </div>

          {estimatedReplayPreviewItems.length > 0 && (
            <div>
              <label className="mobile-card-label" style={{ marginBottom: 6, display: 'block' }}>Jobs to be affected:</label>
              <div className="glass-card" style={{ padding: 12, maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {estimatedReplayPreviewItems.map((item) => (
                  <div key={item.job_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                    <span style={{ fontFamily: 'monospace' }}>{item.job_id}</span>
                    <span style={{ fontWeight: 600 }}>{item.job_type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mobile-card-label" style={{ marginBottom: 8, display: 'block' }}>Type <span style={{ color: 'var(--accent-purple)' }}>REPLAY</span> to confirm</label>
            <input 
              className="input-field" 
              value={confirmPhrase} 
              onChange={(e) => setConfirmPhrase(e.target.value)} 
              placeholder="CONFIRMATION" 
              style={{ textAlign: 'center', letterSpacing: '2px', fontWeight: 800 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setConfirmReplayFilteredOpen(false)}>Cancel</button>
            <button 
              className="btn-primary" 
              style={{ flex: 1 }} 
              disabled={loadingEstimatedReplayCount || filteredReplaying || estimatedReplayCount <= 0 || confirmPhrase.trim().toUpperCase() !== 'REPLAY'}
              onClick={async () => {
                await runReplayFiltered();
                setConfirmReplayFilteredOpen(false);
              }}
            >
              {filteredReplaying ? 'Processing...' : 'Confirm Replay'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDeleteSelectedConfirm} onClose={() => setShowDeleteSelectedConfirm(false)} title="Confirm Bulk Deletion">
        <div style={{ padding: '24px 32px', textAlign: 'center' }}>
          <HiOutlineExclamationCircle size={48} style={{ color: 'var(--accent-rose)', marginBottom: 20, display: 'block', margin: '0 auto 20px' }} />
          <p style={{ marginBottom: 24, fontSize: '0.92rem', lineHeight: '1.5', color: 'var(--text-main)' }}>
            Are you sure you want to permanently delete <strong>{selected.length}</strong> selected failed jobs?
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowDeleteSelectedConfirm(false)}>Cancel</button>
            <button className="btn-danger" style={{ flex: 1 }} onClick={runDeleteSelected} disabled={bulkDeleting}>
              {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDeleteFilteredConfirm} onClose={() => setShowDeleteFilteredConfirm(false)} title="Confirm Filtered Deletion">
        <div style={{ padding: '24px 32px', textAlign: 'center' }}>
          <HiOutlineExclamationCircle size={48} style={{ color: 'var(--accent-rose)', marginBottom: 20, display: 'block', margin: '0 auto 20px' }} />
          <p style={{ marginBottom: 24, fontSize: '0.92rem', lineHeight: '1.5', color: 'var(--text-main)' }}>
            Are you sure you want to delete <strong>ALL</strong> jobs matching your current filters?
            <br />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginTop: 8 }}>
              This will affect approximately <strong>{total}</strong> jobs.
            </span>
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowDeleteFilteredConfirm(false)}>Cancel</button>
            <button className="btn-danger" style={{ flex: 1 }} onClick={runDeleteFiltered} disabled={filteredDeleting}>
              {filteredDeleting ? 'Deleting...' : 'Delete All Filtered'}
            </button>
          </div>
        </div>
      </Modal>

      <style dangerouslySetInnerHTML={{ __html: `
        .jobs-filter-grid {
          display: grid;
          grid-template-columns: 1.5fr 1.2fr 1fr 1fr 1.5fr;
          gap: 10px;
          margin-bottom: 14px;
        }

        .filter-actions-row-standard {
          display: none;
        }
        
        .row-selected {
          background: rgba(139, 92, 246, 0.05) !important;
        }
        .custom-checkbox {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        @media (max-width: 1024px) {
          .jobs-filter-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .jobs-filter-grid > :first-child {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 768px) {
          .table-desktop { display: none !important; }
          .mobile-card-list { display: block !important; }
          .desktop-only { display: none; }
          .admin-page { padding: 12px; }
          
          .jobs-filter-grid {
            display: none !important;
          }
          .jobs-filter-grid.is-mobile-open {
            display: flex !important;
            flex-direction: column;
            gap: 12px;
            padding: 16px;
            background: var(--bg-secondary);
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-glass);
            margin-bottom: 20px;
          }

          .filter-actions-row-standard {
            display: none;
          }
          .jobs-filter-grid.is-mobile-open + .filter-actions-row-standard {
            display: flex !important;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 20px;
          }
          .filter-actions-row-standard button {
            width: 100%;
            justify-content: center;
          }

          .mobile-card {
            padding: 16px;
            border: 1px solid var(--border-glass);
          }
          .mobile-card-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
          }
          .mobile-card-label {
            color: var(--text-muted);
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
        }

        @media (min-width: 769px) {
          .mobile-card-list { display: none !important; }
          .mobile-filters-icon-btn { display: none !important; }
        }
      `}} />
    </div>
  );
}
