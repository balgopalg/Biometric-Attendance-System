/**
 * TrainingContext – global face-training job state.
 *
 * Keeps the TrainingProgressPanel visible across page navigations.
 * Polling continues until the job finishes, is cancelled, or the
 * user manually closes the panel (or hard-refreshes).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const TrainingContext = createContext(null);

export function TrainingProvider({ children }) {
  const [job, setJob]                       = useState(null);
  const [cancelling, setCancelling]         = useState(false);
  const [statusUrl, setStatusUrl]           = useState('');
  const [dismissed, setDismissed]           = useState(false); // manual close
  const syncErrorShownRef                   = useRef(false);
  const intervalRef                         = useRef(null);

  // ── helpers ────────────────────────────────────────────────────────────
  const normalizeUrl = (raw) => {
    raw = String(raw || '').trim();
    if (!raw) return '';
    if (raw.startsWith('/api/')) return raw.slice(4);
    if (raw.startsWith('/admin/')) return raw;
    try {
      const parsed = new URL(raw, window.location.origin);
      const p = parsed.pathname || '';
      return p.startsWith('/api/') ? p.slice(4) : p;
    } catch {
      return raw;
    }
  };

  /**
   * Call this from any page after getting a 202 job response.
   */
  const startTraining = useCallback((response, totalFaces = 0) => {
    const url = normalizeUrl(response.data?.status_url);
    if (!url) return;

    setJob({
      job_id: response.data?.job_id,
      status: 'queued',
      training_total_faces: Number(response.data?.requested_count || totalFaces),
      training_processed_faces: 0,
      training_trained_faces: 0,
      training_failed_faces: 0,
      training_stage: 'queued',
      training_message: response.data?.message || 'Queued',
      training_progress_percent: 0,
    });
    setDismissed(false);
    setCancelling(false);
    syncErrorShownRef.current = false;
    setStatusUrl(url);
  }, []);

  /** Cancel a running job. */
  const cancelTraining = useCallback(async () => {
    const jobId = job?.job_id;
    if (!jobId || cancelling) return;
    try {
      setCancelling(true);
      const res = await api.post(`/admin/jobs/${jobId}/cancel`);
      if (res.data?.job) setJob(res.data.job);
      toast.success('Cancellation requested');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to cancel training');
    } finally {
      setCancelling(false);
    }
  }, [job, cancelling]);

  /** Manually close the panel (only visual – does not cancel the job). */
  const dismissTraining = useCallback(() => {
    setDismissed(true);
  }, []);

  // ── polling ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!statusUrl) return;

    const TERMINAL = new Set(['completed', 'failed', 'dead_letter', 'cancelled']);

    const poll = async () => {
      try {
        const res = await api.get(statusUrl);
        const data = res.data;
        setJob(data);

        if (TERMINAL.has(String(data.status).toLowerCase())) {
          setStatusUrl('');   // stops polling
          if (data.status === 'completed') toast.success('Face training completed successfully.');
          else if (data.status === 'failed' || data.status === 'dead_letter') toast.error('Face training job failed.');
          else toast('Face training job cancelled.');
        }
      } catch {
        if (!syncErrorShownRef.current) {
          toast.error('Lost connection to training job status.');
          syncErrorShownRef.current = true;
        }
        setStatusUrl('');
      }
    };

    intervalRef.current = setInterval(poll, 2000);
    return () => clearInterval(intervalRef.current);
  }, [statusUrl]);

  const value = { job, cancelling, dismissed, startTraining, cancelTraining, dismissTraining };

  return (
    <TrainingContext.Provider value={value}>
      {children}
    </TrainingContext.Provider>
  );
}

export function useTraining() {
  const ctx = useContext(TrainingContext);
  if (!ctx) throw new Error('useTraining must be used inside <TrainingProvider>');
  return ctx;
}
