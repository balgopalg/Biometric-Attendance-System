import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import api from '../../api/axios';
import Modal from '../../components/ui/Modal';
import StatePanel from '../../components/ui/StatePanel';
import { formatDateTimeIndia, getIndiaTimezoneOffsetMinutes } from '../../utils/dateTime';

const PER_PAGE = 20;

export default function DeadLetterJobs() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [replayJobId, setReplayJobId] = useState('');
  const [bulkReplaying, setBulkReplaying] = useState(false);
  const [filteredReplaying, setFilteredReplaying] = useState(false);
  const [confirmReplayFilteredOpen, setConfirmReplayFilteredOpen] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [estimatedReplayCount, setEstimatedReplayCount] = useState(0);
  const [estimatedReplayPreviewItems, setEstimatedReplayPreviewItems] = useState([]);
  const [loadingEstimatedReplayCount, setLoadingEstimatedReplayCount] = useState(false);
  const [selected, setSelected] = useState([]);
  const [jobsError, setJobsError] = useState('');
  const [filters, setFilters] = useState({ q: '', job_type: '', from: '', to: '', sort_by: 'updated_at', sort_dir: 'desc' });

  const fetchJobs = (nextPage = page) => {
    setLoading(true);
    setJobsError('');
    const params = { page: nextPage, per_page: PER_PAGE, tz_offset_minutes: getIndiaTimezoneOffsetMinutes() };
    if (filters.q) params.q = filters.q;
    if (filters.job_type) params.job_type = filters.job_type;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.sort_by) params.sort_by = filters.sort_by;
    if (filters.sort_dir) params.sort_dir = filters.sort_dir;

    api.get('/admin/jobs/dead-letter', { params })
      .then((r) => {
        const nextItems = Array.isArray(r.data?.items) ? r.data.items : [];
        const nextTotal = Number(r.data?.total || nextItems.length || 0);
        const maxPage = Math.max(1, Math.ceil(nextTotal / PER_PAGE));
        if (nextTotal > 0 && nextPage > maxPage) {
          fetchJobs(maxPage);
          return;
        }
        setItems(nextItems);
        setTotal(nextTotal);
        setPage(Number(r.data?.page || nextPage));
        setSelected([]);
      })
      .catch(() => {
        setItems([]);
        setTotal(0);
        setJobsError('Failed to load dead-letter jobs.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchJobs(1);
  }, []);

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

      const res = await api.get('/admin/jobs/dead-letter', { params });
      setEstimatedReplayCount(Number(res.data?.total || 0));
      const previewItems = Array.isArray(res.data?.items) ? res.data.items : [];
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

  const applyFilters = () => {
    if (filters.from && filters.to && filters.from > filters.to) {
      toast.error('From date must be before or equal to To date');
      return;
    }
    fetchJobs(1);
  };

  const resetFilters = () => {
    setFilters({ q: '', job_type: '', from: '', to: '', sort_by: 'updated_at', sort_dir: 'desc' });
    setTimeout(() => fetchJobs(1), 0);
  };

  return (
    <div className="admin-page">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Dead-Letter Jobs</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>Filter failed jobs and replay one or many.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{total} jobs</p>
          <button className="btn-secondary" style={{ marginTop: 8, padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => fetchJobs(page)}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Search</label>
          <input className="input-field" style={{ width: 220, padding: '8px 12px', fontSize: '0.8rem' }} value={filters.q} onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))} placeholder="job id, type, error..." />
        </div>
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Job Type</label>
          <select className="input-field" style={{ width: 220, padding: '8px 12px', fontSize: '0.8rem' }} value={filters.job_type} onChange={(e) => setFilters((p) => ({ ...p, job_type: e.target.value }))}>
            <option value="">All</option>
            {jobTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>From</label>
          <input type="date" className="input-field" style={{ width: 160, padding: '8px 12px', fontSize: '0.8rem' }} value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>To</label>
          <input type="date" className="input-field" style={{ width: 160, padding: '8px 12px', fontSize: '0.8rem' }} value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Sort By</label>
          <select className="input-field" style={{ width: 180, padding: '8px 12px', fontSize: '0.8rem' }} value={filters.sort_by} onChange={(e) => setFilters((p) => ({ ...p, sort_by: e.target.value }))}>
            <option value="updated_at">Updated At</option>
            <option value="created_at">Created At</option>
            <option value="attempts">Attempts</option>
            <option value="job_type">Job Type</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Direction</label>
          <select className="input-field" style={{ width: 120, padding: '8px 12px', fontSize: '0.8rem' }} value={filters.sort_dir} onChange={(e) => setFilters((p) => ({ ...p, sort_dir: e.target.value }))}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
          <button className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.78rem' }} onClick={applyFilters}>Apply</button>
          <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.78rem' }} onClick={resetFilters}>Reset</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{selected.length} selected</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ padding: '7px 12px', fontSize: '0.78rem' }} disabled={filteredReplaying || loading || !total} onClick={openReplayFilteredConfirmation}>
            {filteredReplaying ? 'Replaying...' : 'Replay All Filtered'}
          </button>
          <button className="btn-secondary" style={{ padding: '7px 12px', fontSize: '0.78rem' }} disabled={bulkReplaying || !selected.length} onClick={replaySelected}>
            {bulkReplaying ? 'Replaying...' : 'Replay Selected'}
          </button>
        </div>
      </div>

      <div className="glass-card table-desktop" style={{ overflowX: 'auto' }}>
        {loading ? (
          <StatePanel variant="loading" title="Loading dead-letter jobs" description="Fetching failed jobs and replay metadata." compact />
        ) : null}

        {!loading && jobsError ? (
          <StatePanel variant="error" title="Unable to load dead-letter jobs" description={jobsError} actionLabel="Retry" onAction={() => fetchJobs(page)} compact />
        ) : null}

        {!loading && !jobsError && !items.length ? (
          <StatePanel variant="empty" title="No dead-letter jobs found" description="Queue replay backlog is currently clear for this filter." compact />
        ) : null}

        {!loading && !jobsError && items.length > 0 ? (
        <table className="data-table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} />
              </th>
              <th>Updated At</th>
              <th>Dead-Lettered At</th>
              <th>Job ID</th>
              <th>Job Type</th>
              <th>Attempts</th>
              <th>Retry Count</th>
              <th>Error</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((job) => (
              <tr key={job.job_id}>
                <td><input type="checkbox" checked={selected.includes(job.job_id)} onChange={() => toggleSelect(job.job_id)} /></td>
                <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{formatDateTimeIndia(job.updated_at, { dateStyle: 'short', timeStyle: 'medium' })}</td>
                <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{formatDateTimeIndia(job.dead_lettered_at, { dateStyle: 'short', timeStyle: 'medium' })}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{job.job_id}</td>
                <td style={{ fontSize: '0.8rem' }}>{job.job_type || '—'}</td>
                <td style={{ fontSize: '0.8rem' }}>{Number(job.attempts || 0)}/{Number(job.max_attempts || 0)}</td>
                <td style={{ fontSize: '0.8rem' }}>{Number(job.retry_count || Math.max(0, Number(job.attempts || 0) - 1))}</td>
                <td style={{ maxWidth: 340, fontSize: '0.76rem', color: 'var(--accent-rose)' }}>{job.error || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} disabled={replayJobId === job.job_id} onClick={() => replayOne(job.job_id)}>
                    {replayJobId === job.job_id ? 'Replaying...' : 'Replay'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        ) : null}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14 }}>
        <button className="btn-secondary" disabled={!canGoPrev} onClick={() => canGoPrev && fetchJobs(page - 1)} style={{ padding: '6px 16px', fontSize: '0.8rem' }}>Previous</button>
        <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
        <button className="btn-secondary" disabled={!canGoNext} onClick={() => canGoNext && fetchJobs(page + 1)} style={{ padding: '6px 16px', fontSize: '0.8rem' }}>Next</button>
      </div>

      <Modal isOpen={confirmReplayFilteredOpen} onClose={() => setConfirmReplayFilteredOpen(false)} title="Confirm Replay All Filtered" width={560}>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: 10 }}>
          This will queue replay for all dead-letter jobs matching the current filters.
        </p>
        <p style={{ fontSize: '0.84rem', marginBottom: 10 }}>
          Estimated matched jobs:{' '}
          <b>{loadingEstimatedReplayCount ? 'Calculating...' : estimatedReplayCount}</b>
        </p>
        {estimatedReplayPreviewItems.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>
              Preview (first {estimatedReplayPreviewItems.length} matched jobs):
            </p>
            <div className="glass-card" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {estimatedReplayPreviewItems.map((item) => (
                <div key={item.job_id} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1.2fr', gap: 8 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.74rem' }}>{item.job_id}</span>
                  <span style={{ fontSize: '0.74rem' }}>{item.job_type || 'unknown'}</span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    {formatDateTimeIndia(item.updated_at, { dateStyle: 'short', timeStyle: 'medium' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          Type <b>REPLAY</b> to confirm.
        </p>
        <input
          className="input-field"
          style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem', marginBottom: 14 }}
          value={confirmPhrase}
          onChange={(e) => setConfirmPhrase(e.target.value)}
          placeholder="Type REPLAY"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-secondary" onClick={() => setConfirmReplayFilteredOpen(false)}>Cancel</button>
          <button
            className="btn-primary"
            disabled={
              loadingEstimatedReplayCount
              || filteredReplaying
              || estimatedReplayCount <= 0
              || confirmPhrase.trim().toUpperCase() !== 'REPLAY'
            }
            onClick={async () => {
              await runReplayFiltered();
              setConfirmReplayFilteredOpen(false);
            }}
          >
            {filteredReplaying ? 'Replaying...' : 'Confirm Replay'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
