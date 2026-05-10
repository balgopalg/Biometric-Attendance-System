import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
const RECOGNITION_DEBUG = false;
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import { useWebcam } from '../../hooks/useWebcam';
import { useDrowsinessDetection } from '../../hooks/useDrowsinessDetection';
import WebcamFeed from '../../components/recognition/WebcamFeed';
import RecognizedList from '../../components/recognition/RecognizedList';
import UploadClassroomImage from '../../components/recognition/UploadClassroomImage';
import PinCommitModal from './PinCommitModal';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlinePlay, HiOutlinePause, HiOutlineStop, HiOutlineCheckCircle, HiOutlinePhotograph } from 'react-icons/hi';
import { formatCourseName } from '../../utils/courseDisplay';
import StatePanel from '../../components/ui/StatePanel';
import { formatDateTimeIndia } from '../../utils/dateTime';

const TIMESTAMP_WITHOUT_TZ_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

function normalizeUtcTimestamp(value) {
  if (typeof value !== 'string') return value;
  return TIMESTAMP_WITHOUT_TZ_PATTERN.test(value) ? `${value}Z` : value;
}

function fmt(dt) {
  return formatDateTimeIndia(normalizeUtcTimestamp(dt), { dateStyle: 'short', timeStyle: 'medium' });
}

function safeMatches(value) {
  return Array.isArray(value) ? value : [];
}

export default function AttendanceSession() {
  const [params] = useSearchParams();
  const paperIdFromQuery = params.get('paper_id');

  const isMobile = useRef(
    typeof window !== 'undefined'
      ? /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768
      : false
  ).current;
  const { videoRef, canvasRef, isActive, error, startCamera, stopCamera, flipCamera, captureFrame } = useWebcam({
    facingMode: isMobile ? 'environment' : 'user'
  });
  const [papers, setPapers] = useState([]);
  const [loadingPapers, setLoadingPapers] = useState(true);
  const [papersError, setPapersError] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedPaperId, setSelectedPaperId] = useState(paperIdFromQuery || '');

  const [sessionId, setSessionId] = useState(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);

  const [recognized, setRecognized] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);

  useDrowsinessDetection(videoRef, scanning);

  useEffect(() => {
    const shouldBeActive = scanning && sessionId && !showUploadModal;

    if (shouldBeActive) {
      // Small buffer to allow hardware release from modal
      const timer = setTimeout(() => {
        if (!isActive) startCamera();
      }, 400);
      return () => clearTimeout(timer);
    } else {
      stopCamera();
    }
  }, [scanning, sessionId, showUploadModal, isActive, startCamera, stopCamera]);

  const [diag, setDiag] = useState({ faces_detected: 0, candidates_count: 0, best_similarity_seen: null, threshold: null });
  const [scanError, setScanError] = useState('');
  const [stopEndpointAvailable, setStopEndpointAvailable] = useState(null);

  const [review, setReview] = useState(null);
  const [showAdjustPin, setShowAdjustPin] = useState(false);
  const [adjustIds, setAdjustIds] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const intervalRef = useRef(null);
  const scanInFlightRef = useRef(false);
  const lastRecognitionToastAtRef = useRef(0);
  const cameraWarningShownRef = useRef(false);

  const selectedPaper = useMemo(
    () => papers.find((p) => p._id === selectedPaperId) || null,
    [papers, selectedPaperId]
  );

  const courseOptions = useMemo(() => {
    const map = new Map();
    papers.forEach((p) => {
      if (!p.course_id) return;
      if (!map.has(p.course_id)) {
        map.set(p.course_id, {
          _id: p.course_id,
          name: p.course_name || 'N/A',
          code: p.course_code || '',
          status: p.course_status,
          isInactive: p.is_course_inactive,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [papers]);

  const filteredPapers = useMemo(() => {
    if (!selectedCourseId) return [];
    return papers.filter((p) => p.course_id === selectedCourseId);
  }, [papers, selectedCourseId]);

  const currentAcademicSession = useMemo(() => String(new Date().getFullYear()), []);

  const fetchPapers = () => {
    setLoadingPapers(true);
    setPapersError('');
    api.get('/lecturer/papers').then((r) => {
      const list = r.data || [];
      setPapers(list);

      if (paperIdFromQuery) {
        const queriedPaper = list.find((p) => p._id === paperIdFromQuery);
        if (queriedPaper) {
          setSelectedCourseId(queriedPaper.course_id || '');
          setSelectedPaperId(queriedPaper._id);
          return;
        }
      }

      if (list.length) {
        const firstCourseId = list[0].course_id || '';
        setSelectedCourseId(firstCourseId);
        const firstPaperInCourse = list.find((p) => p.course_id === firstCourseId);
        setSelectedPaperId(firstPaperInCourse?._id || '');
      }
    }).catch((err) => {
      setPapers([]);
      setPapersError(err.response?.data?.error || 'Unable to load assigned papers.');
    }).finally(() => {
      setLoadingPapers(false);
    });
  };

  useEffect(() => {
    fetchPapers();
  }, []);

  useEffect(() => {
    if (!selectedCourseId) {
      if (selectedPaperId) setSelectedPaperId('');
      return;
    }

    const belongsToCourse = filteredPapers.some((p) => p._id === selectedPaperId);
    if (!belongsToCourse) {
      setSelectedPaperId(filteredPapers[0]?._id || '');
    }
  }, [selectedCourseId, selectedPaperId, filteredPapers]);

  useEffect(() => {
    let cancelled = false;

    const fetchCapabilities = async () => {
      try {
        const res = await api.get('/lecturer/capabilities');
        if (!cancelled) setStopEndpointAvailable(!!res.data.can_stop_session);
      } catch (err) {
        if (cancelled) return;
        setStopEndpointAvailable(false);
      }
    };

    fetchCapabilities();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const startSession = async () => {
    if (!selectedPaperId) {
      toast.error('Please select a paper first');
      return;
    }
    if (selectedPaper?.is_course_inactive) {
      toast.error('This subject is locked because its course is inactive');
      return;
    }
    let createdSessionId = null;
    try {
      const res = await api.post('/lecturer/session/start', { paper_id: selectedPaperId });
      createdSessionId = res.data.session_id;
      setSessionId(createdSessionId);
      setSessionStartedAt(res.data.started_at || new Date().toISOString());
      setRecognized([]);
      setReview(null);
      setScanError('');
      cameraWarningShownRef.current = false;

      setScanning(true);
      toast.success('Session started');
    } catch (err) {
      if (createdSessionId) {
        await api.post('/lecturer/session/stop', { session_id: createdSessionId }).catch(() => { });
        setSessionId(null);
      }
      toast.error(err.response?.data?.error || 'Failed to start session');
    }
  };

  const pauseSession = () => {
    setScanning(false);
    stopCamera();
  };

  const resumeSession = () => {
    if (!sessionId) return;
    setScanError('');
    setScanning(true);
  };

  const clearSessionLocally = () => {
    setScanning(false);
    stopCamera();
    setSessionId(null);
    setSessionStartedAt(null);
    setRecognized([]);
    setScanError('');
    setDiag({ faces_detected: 0, candidates_count: 0, best_similarity_seen: null, threshold: null });
    cameraWarningShownRef.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const stopSession = async () => {
    if (!sessionId) {
      clearSessionLocally();
      return;
    }

    if (stopEndpointAvailable === false) {
      toast.success('Session stopped locally');
      clearSessionLocally();
      return;
    }

    try {
      await api.post('/lecturer/session/stop', { session_id: sessionId });
      toast.success('Session stopped');
    } catch (err) {
      if (err.response?.status === 404) {
        // If backend hot-reload is stale, downgrade gracefully and stop probing calls.
        setStopEndpointAvailable(false);
        toast.success('Session stopped locally');
      } else {
        toast.error(err.response?.data?.error || 'Failed to stop session');
      }
    }
    clearSessionLocally();
  };

  const notifyRecognitionBatch = useCallback((matches, source = 'live') => {
    const safe = Array.isArray(matches) ? matches : [];
    if (safe.length === 0) return;

    const now = Date.now();
    if (now - lastRecognitionToastAtRef.current < 1200) return;
    lastRecognitionToastAtRef.current = now;

    if (safe.length === 1) {
      const conf = Math.round((safe[0]?.confidence || safe[0]?.similarity || 0) * 100);
      toast.success(`Recognized: ${String(safe[0]?.name || 'Unknown')} (${conf}%)`);
      return;
    }

    const previewNames = safe
      .slice(0, 3)
      .map((m) => String(m?.name || 'Unknown'))
      .join(', ');
    const extra = safe.length > 3 ? ` +${safe.length - 3} more` : '';
    const prefix = source === 'upload' ? 'Image recognition' : 'Live recognition';
    toast.success(`${prefix}: ${safe.length} student(s) (${previewNames}${extra})`);
  }, []);

  const scanFrame = useCallback(async () => {
    if (!sessionId) return;
    if (scanInFlightRef.current) return;

    const frame = captureFrame();
    if (!frame) return;

    scanInFlightRef.current = true;

    if (RECOGNITION_DEBUG) {
      console.debug('[Recognition] Sending frame', {
        timestamp: new Date().toISOString(),
        sessionId,
        paperId: selectedPaperId,
        framePrefix: frame.slice(0, 40),
        approxBytes: Math.round((frame.length * 3) / 4),
      });
    }

    try {
      const res = await api.post('/lecturer/session/recognize', {
        session_id: sessionId,
        frame,
      });

      if (RECOGNITION_DEBUG) {
        console.debug('[Recognition] Response', {
          timestamp: new Date().toISOString(),
          faces_detected: res.data.faces_detected,
          candidates_count: res.data.candidates_count,
          best_similarity_seen: res.data.best_similarity_seen,
          threshold: res.data.threshold,
          new_matches: res.data.new_matches,
          total_recognized: res.data.total_recognized,
        });
      }

      const newMatchesRaw = safeMatches(res.data?.new_matches);
      const newMatches = newMatchesRaw.map((m) => ({ ...m, isDrowsy: !!m?.isDrowsy }));

      if (newMatches.length > 0) {
        setRecognized((prev) => [...prev, ...newMatches]);
        notifyRecognitionBatch(newMatches, 'live');
      }
      setDiag({
        faces_detected: res.data.faces_detected || 0,
        candidates_count: res.data.candidates_count || 0,
        best_similarity_seen: res.data.best_similarity_seen,
        threshold: res.data.threshold,
      });
      setScanError('');
    } catch (err) {
      if (RECOGNITION_DEBUG) {
        console.error('[Recognition] Request failed', {
          timestamp: new Date().toISOString(),
          sessionId,
          paperId: selectedPaperId,
          error: err.response?.data || err.message,
        });
      }
      setScanError(err.response?.data?.error || 'Frame recognition failed');
    } finally {
      scanInFlightRef.current = false;
    }
  }, [sessionId, selectedPaperId, captureFrame, notifyRecognitionBatch]);

  const handleUploadImage = async (imageBlobs) => {
    if (!selectedPaperId) {
      toast.error('Please select a paper first');
      return;
    }

    if (!sessionId) {
      toast.error('Please start a session first');
      return;
    }

    const resumeScan = scanning;
    if (resumeScan) {
      setScanning(false);
    }
    setUploadLoading(true);
    let totalDetected = 0;
    let newMatchesList = [];
    let candidatesCount = 0;
    let threshold = 0;
    let bestSimilaritySeen = 0;

    try {
      for (const imageBlob of imageBlobs) {
        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('image', imageBlob);
        const res = await api.post('/lecturer/session/recognize-image', formData);

        totalDetected += (res.data.faces_detected || 0);
        const newMatches = safeMatches(res.data?.new_matches);
        if (newMatches.length > 0) {
          newMatchesList.push(...newMatches);
          notifyRecognitionBatch(newMatches, 'upload');
        }

        candidatesCount = res.data.candidates_count || candidatesCount;
        threshold = res.data.threshold || threshold;
        bestSimilaritySeen = Math.max(bestSimilaritySeen || 0, res.data.best_similarity_seen || 0);
      }

      const uniqueNewMatchesMap = new Map();
      newMatchesList.forEach(m => {
        const id = m.id || m.user_id;
        if (!uniqueNewMatchesMap.has(id)) {
          uniqueNewMatchesMap.set(id, m);
        }
      });
      const uniqueNewMatches = Array.from(uniqueNewMatchesMap.values());

      if (uniqueNewMatches.length > 0) {
        setRecognized((prev) => {
          const combined = [...prev, ...uniqueNewMatches];
          const map = new Map();
          combined.forEach(m => map.set(m.id || m.user_id, m));
          return Array.from(map.values());
        });
        toast.success(`Successfully recognized ${uniqueNewMatches.length} student(s) from ${imageBlobs.length} image(s)`);
      } else {
        toast.success(`No new students recognized in the ${imageBlobs.length} image(s)`);
      }

      setDiag(prev => ({
        ...prev,
        faces_detected: prev.faces_detected + totalDetected,
        candidates_count: candidatesCount || prev.candidates_count,
        best_similarity_seen: bestSimilaritySeen || prev.best_similarity_seen,
        threshold: threshold || prev.threshold,
      }));

      setShowUploadModal(false);
    } catch (err) {
      if (RECOGNITION_DEBUG) {
        console.error('[Image Recognition] Failed', err);
      }
      toast.error(err.response?.data?.error || err.message || 'Image recognition failed');
    } finally {
      setUploadLoading(false);
      if (resumeScan) {
        setScanning(true);
      }
    }
  };

  useEffect(() => {
    if (scanning && sessionId) {
      intervalRef.current = setInterval(scanFrame, 2000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [scanning, sessionId, scanFrame]);

  const loadReview = async (sid) => {
    try {
      const res = await api.get(`/lecturer/session/${sid}/review`);
      setReview(res.data);
      setAdjustIds((res.data.present_students || []).map((s) => s.user_id));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load committed review');
    }
  };

  const handleCommit = async (pin) => {
    try {
      const res = await api.post('/lecturer/session/commit', {
        session_id: sessionId,
        pin,
      });
      toast.success(res.data.message);
      setShowPin(false);
      clearSessionLocally();
      await loadReview(res.data.session_id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Commit failed');
    }
  };

  const handleAdjustSave = async (pin) => {
    if (!review?.session_id) return;
    try {
      const res = await api.put(`/lecturer/session/${review.session_id}/adjust`, {
        pin,
        user_ids: adjustIds,
      });
      setReview(res.data.review);
      setShowAdjustPin(false);
      toast.success(res.data.message || 'Attendance updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update attendance');
    }
  };

  const rollbackRemainingMs = useMemo(() => {
    if (!review?.rollback_until) return null;
    const normalizedRollbackUntil = normalizeUtcTimestamp(review.rollback_until);
    const rollbackUntilMs = new Date(normalizedRollbackUntil).getTime();
    if (Number.isNaN(rollbackUntilMs)) return null;
    return Math.max(0, rollbackUntilMs - nowMs);
  }, [review, nowMs]);


  const rollbackCountdown = useMemo(() => {
    if (rollbackRemainingMs === null) return null;
    if (rollbackRemainingMs <= 0) return '00:00';
    const totalSecs = Math.floor(rollbackRemainingMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [rollbackRemainingMs]);

  return (
    <div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'flex-start' : 'center',
        flexDirection: isMobile ? 'column' : 'row',
        marginBottom: 20,
        gap: 16,
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Attendance Session</h2>
              {sessionId && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em',
                  textTransform: 'uppercase', padding: '3px 10px', borderRadius: 999,
                  background: error ? 'rgba(244,63,94,0.12)' : (scanning && isActive ? 'rgba(16,185,129,0.12)' : 'rgba(251,191,36,0.12)'),
                  color: error ? 'var(--accent-rose)' : (scanning && isActive ? 'var(--accent-emerald)' : 'var(--accent-amber)'),
                  border: `1px solid ${error ? 'rgba(244,63,94,0.25)' : (scanning && isActive ? 'rgba(16,185,129,0.25)' : 'rgba(251,191,36,0.25)')}`,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'currentColor',
                    animation: scanning && isActive ? 'pulse-glow 1.4s ease-in-out infinite' : 'none'
                  }} />
                  {error ? 'Camera Error' : (scanning && isActive ? 'Live' : (scanning && !isActive ? 'Awaiting Feed' : 'Paused'))}
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>Select paper, verify recognition, then commit with your PIN.</p>
          </div>
        </div>
        <div style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          width: isMobile ? '100%' : 'auto',
          justifyContent: isMobile ? 'space-between' : 'flex-end'
        }}>
          {!sessionId ? (
            <button className="btn-primary" onClick={startSession} disabled={selectedPaper?.is_course_inactive} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HiOutlinePlay size={16} /> {selectedPaper?.is_course_inactive ? 'Course Locked' : 'Start Session'}
            </button>
          ) : (
            <>
              {scanning ? (
                <button className="btn-secondary" onClick={pauseSession} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HiOutlinePause size={16} /> Pause
                </button>
              ) : (
                <button className="btn-primary" onClick={resumeSession} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HiOutlinePlay size={16} /> Resume
                </button>
              )}
              <button className="btn-secondary" onClick={() => setShowUploadModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <HiOutlinePhotograph size={16} /> Upload Photo
              </button>
              <button className="btn-secondary" onClick={stopSession} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-rose)', borderColor: 'rgba(244,63,94,0.3)' }}>
                <HiOutlineStop size={16} /> Stop Session
              </button>
              <button className="btn-primary" onClick={() => setShowPin(true)} disabled={recognized.length === 0} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flex: isMobile ? 1 : 'none',
                justifyContent: 'center',
                padding: isMobile ? '10px 12px' : '10px 20px'
              }}>
                <HiOutlineCheckCircle size={16} /> {isMobile ? 'Commit' : `Commit (${recognized.length})`}
              </button>
            </>
          )}
        </div>
      </div>

      {loadingPapers ? (
        <StatePanel variant="loading" title="Loading your assigned papers" description="Please wait while we prepare your attendance workspace." />
      ) : null}

      {!loadingPapers && papersError ? (
        <StatePanel
          variant="error"
          title="Could not load papers"
          description={papersError}
          actionLabel="Try again"
          onAction={fetchPapers}
        />
      ) : null}

      {!loadingPapers && !papersError && papers.length === 0 ? (
        <StatePanel
          variant="empty"
          title="No assigned papers yet"
          description="You cannot start a session until an administrator assigns papers to your account."
        />
      ) : null}

      {!loadingPapers && !papersError && papers.length > 0 ? (
        <>
          {/* ── Session config card ── */}
          <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {/* Course selector */}
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Course</label>
                <select aria-label="Select course" className="input-field" value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)} disabled={!!sessionId}>
                  <option value="">— Select Course —</option>
                  {courseOptions.map((c) => (
                    <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status, isInactive: c.isInactive })} {c.code ? `(${c.code})` : ''}</option>
                  ))}
                </select>
              </div>
              {/* Paper selector */}
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Paper / Subject</label>
                <select aria-label="Select paper" className="input-field" value={selectedPaperId} onChange={(e) => setSelectedPaperId(e.target.value)} disabled={!!sessionId || !selectedCourseId}>
                  <option value="">{selectedCourseId ? '— Select Paper —' : '— Select Course First —'}</option>
                  {filteredPapers.map((p) => (
                    <option key={p._id} value={p._id} disabled={p.is_course_inactive}>{p.name} ({p.code}){p.is_course_inactive ? ' · Locked' : ''}</option>
                  ))}
                </select>
              </div>
              {/* Info pills */}
              {[{
                label: 'Academic Year', value: currentAcademicSession,
              }, {
                label: 'Session Started', value: sessionStartedAt ? fmt(sessionStartedAt) : '—',
              }, {
                label: 'Enrolled Students', value: selectedPaper?.total_enrolled_students ?? '—',
              }].map(({ label, value }) => (
                <div key={label} style={{ padding: '10px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border-glass)', background: 'var(--bg-glass)' }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</p>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700 }}>{value}</p>
                </div>
              ))}
            </div>
            {selectedPaper?.is_course_inactive && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 'var(--radius)', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', fontSize: '0.8rem', color: 'var(--accent-amber)' }}>
                ⚠️ This course is inactive — attendance sessions are locked.
              </div>
            )}
          </div>

          <div className="session-feed-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <WebcamFeed ref={videoRef} isActive={isActive} error={error} isAwaiting={scanning && !isActive} onFlipCamera={flipCamera} />
            <RecognizedList students={recognized} isLive={scanning && isActive} />
          </div>

          {sessionId && (
            <div className="glass-card" style={{ marginTop: 14, padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
              {[{
                label: 'Faces Detected', value: diag.faces_detected,
              }, {
                label: 'Recognized', value: recognized.length, accent: 'var(--accent-emerald)',
              }, {
                label: 'Best Match', value: diag.best_similarity_seen !== null ? `${(diag.best_similarity_seen * 100).toFixed(1)}%` : '—',
              }, {
                label: 'Threshold', value: diag.threshold !== null ? `${(diag.threshold * 100).toFixed(0)}%` : '—',
              }].map(({ label, value, accent }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                  <span style={{ fontSize: '0.92rem', fontWeight: 700, color: accent || 'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
              {scanError && (
                <p role="alert" style={{ width: '100%', marginTop: 2, fontSize: '0.78rem', color: 'var(--accent-rose)', background: 'rgba(244,63,94,0.06)', padding: '6px 10px', borderRadius: 'var(--radius)', border: '1px solid rgba(244,63,94,0.15)' }}>{scanError}</p>
              )}
            </div>
          )}

          {review && (
            <div className="glass-card" style={{ marginTop: 16, padding: 18 }}>
              {/* Review header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 4 }}>Committed Attendance</h3>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Committed: <b style={{ color: 'var(--text-secondary)' }}>{fmt(review.committed_at)}</b></span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Rollback window:{' '}
                      {rollbackCountdown !== null ? (
                        <b style={{
                          color: rollbackRemainingMs === 0 ? 'var(--accent-rose)' : rollbackRemainingMs < 300000 ? 'var(--accent-rose)' : 'var(--accent-amber)',
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '0.04em',
                        }}>
                          {rollbackCountdown} remaining
                        </b>
                      ) : fmt(review.rollback_until)}
                    </span>
                  </div>
                </div>
                <button className="btn-primary" disabled={!review.editable} onClick={() => setShowAdjustPin(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  <HiOutlineCheckCircle size={15} /> Re-commit Adjustments
                </button>
              </div>
              {!review.editable && (
                <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 'var(--radius)', background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.15)', fontSize: '0.8rem', color: 'var(--accent-rose)' }}>
                  Rollback window expired — this record is finalized.
                </div>
              )}
              {/* Candidate checklist */}
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(review.candidates || []).map((s) => {
                  const checked = adjustIds.includes(s.user_id);
                  return (
                    <label key={s.user_id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 'var(--radius)',
                      background: checked ? 'rgba(16,185,129,0.06)' : 'var(--bg-glass)',
                      border: `1px solid ${checked ? 'rgba(16,185,129,0.18)' : 'var(--border-glass)'}`,
                      cursor: review.editable ? 'pointer' : 'default',
                      transition: 'background 0.15s, border-color 0.15s',
                      fontSize: '0.82rem',
                    }}>
                      <input type="checkbox" checked={checked} disabled={!review.editable}
                        onChange={(e) => setAdjustIds(e.target.checked ? [...adjustIds, s.user_id] : adjustIds.filter(id => id !== s.user_id))}
                      />
                      <span style={{ flex: 1, fontWeight: 500 }}>{s.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>{s.email}</span>
                      {checked && <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>Present</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <PinCommitModal
            isOpen={showPin}
            onClose={() => setShowPin(false)}
            onCommit={handleCommit}
            studentsCount={recognized.length}
          />

          <PinCommitModal
            isOpen={showAdjustPin}
            onClose={() => setShowAdjustPin(false)}
            onCommit={handleAdjustSave}
            studentsCount={adjustIds.length}
            title="Re-Commit Attendance Adjustments"
            subtitle="Enter your 4-digit PIN to re-commit corrected records within the rollback window."
            confirmLabel="Confirm Re-Commit"
            loadingLabel="Re-committing..."
          />

          {showUploadModal && (
            <UploadClassroomImage
              onUpload={handleUploadImage}
              onClose={() => setShowUploadModal(false)}
              isLoading={uploadLoading}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
