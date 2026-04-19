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

function fmt(dt) {
  return formatDateTimeIndia(dt, { dateStyle: 'short', timeStyle: 'medium' });
}

function safeMatches(value) {
  return Array.isArray(value) ? value : [];
}

export default function AttendanceSession() {
  const [params] = useSearchParams();
  const paperIdFromQuery = params.get('paper_id');

  const { videoRef, canvasRef, isActive, error, startCamera, stopCamera, captureFrame } = useWebcam();
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

  const isDrowsy = useDrowsinessDetection(videoRef, scanning);
  const isDrowsyRef = useRef(isDrowsy);
  useEffect(() => {
    isDrowsyRef.current = isDrowsy;
    // If drowsiness is detected, try annotating the most recently recognized student
    if (isDrowsy) {
      setRecognized(prev => {
        if (prev.length === 0) return prev;
        const lastStudent = prev[prev.length - 1];
        if (!lastStudent.isDrowsy) {
          const updated = [...prev];
          updated[updated.length - 1] = { ...lastStudent, isDrowsy: true };
          return updated;
        }
        return prev;
      });
    }
  }, [isDrowsy]);

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
    const timer = setInterval(() => setNowMs(Date.now()), 60 * 1000);
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

      try {
        await startCamera();
        setScanning(true);
        toast.success('Session started');
      } catch (camErr) {
        setScanning(false);
        toast.success('Session started without camera');
        toast.error('Webcam undetected or blocked. You may upload a picture manually instead.', { duration: 6000 });
      }
    } catch (err) {
      if (createdSessionId) {
        await api.post('/lecturer/session/stop', { session_id: createdSessionId }).catch(() => {});
        setSessionId(null);
      }
      toast.error(err.response?.data?.error || 'Failed to start session');
    }
  };

  const pauseSession = () => {
    setScanning(false);
  };

  const resumeSession = () => {
    if (!sessionId) return;
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
      toast.success(`Recognized: ${String(safe[0]?.name || 'Unknown')}`);
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
      const newMatches = newMatchesRaw.map(m => ({ ...m, isDrowsy: !!isDrowsyRef.current }));

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

  const handleUploadImage = async (imageBlob) => {
    if (!selectedPaperId) {
      toast.error('Please select a paper first');
      return;
    }

    if (!sessionId) {
      toast.error('Please start a session first');
      return;
    }

    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append('session_id', sessionId);
      formData.append('image', imageBlob);

      if (RECOGNITION_DEBUG) {
        console.debug('[Image Upload] FormData ready', {
          sessionId,
          fileName: imageBlob.name,
          fileSize: imageBlob.size,
          fileType: imageBlob.type,
        });
      }

      const res = await api.post('/lecturer/session/recognize-image', formData);
      
      if (RECOGNITION_DEBUG) {
        console.debug('[Image Upload] Response received', {
          facesDetected: res.data.faces_detected,
          newMatches: res.data.new_matches?.length,
          savedFolder: res.data.saved_folder,
          facePaths: res.data.face_paths?.length,
        });
      }

      if (res.data.saved_folder) {
        toast.success(`Saved classroom bundle: ${res.data.saved_folder}`);
      }

      const newMatches = safeMatches(res.data?.new_matches);
      if (newMatches.length > 0) {
        setRecognized((prev) => [...prev, ...newMatches]);
        notifyRecognitionBatch(newMatches, 'upload');
        toast.success(`Successfully recognized ${newMatches.length} student(s)`);
      } else {
        toast.success('No new students recognized in this image');
      }

      setDiag({
        faces_detected: res.data.faces_detected || 0,
        candidates_count: res.data.candidates_count || 0,
        best_similarity_seen: res.data.best_similarity_seen,
        threshold: res.data.threshold,
      });

      setShowUploadModal(false);
    } catch (err) {
      if (RECOGNITION_DEBUG) {
        console.error('[Image Recognition] Failed', {
          status: err.response?.status,
          error: err.response?.data?.error,
          message: err.message,
        });
      }
      toast.error(err.response?.data?.error || err.message || 'Image recognition failed');
    } finally {
      setUploadLoading(false);
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

  const rollbackRemainingMins = useMemo(() => {
    if (!review?.rollback_until) return null;
    const diff = new Date(review.rollback_until).getTime() - nowMs;
    return Math.max(0, Math.ceil(diff / 60000));
  }, [review, nowMs]);

  return (
    <div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="session-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Take Attendance</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Select paper, verify recognition, then commit with your PIN.</p>
        </div>
        <div className="session-action-buttons" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!sessionId ? (
            <button className="btn-primary" onClick={startSession} disabled={selectedPaper?.is_course_inactive}>
              <HiOutlinePlay size={16} /> {selectedPaper?.is_course_inactive ? 'Locked' : 'Start Session'}
            </button>
          ) : (
            <>
              {scanning ? (
                <button className="btn-secondary" onClick={pauseSession}>
                  <HiOutlinePause size={16} /> Pause
                </button>
              ) : (
                <button className="btn-primary" onClick={resumeSession}>
                  <HiOutlinePlay size={16} /> Resume
                </button>
              )}
              <button className="btn-secondary" onClick={() => setShowUploadModal(true)}>
                <HiOutlinePhotograph size={16} /> Upload Image
              </button>
              <button className="btn-danger" onClick={stopSession}>
                <HiOutlineStop size={16} /> Stop Session
              </button>
              <button className="btn-primary" onClick={() => setShowPin(true)} disabled={recognized.length === 0}>
                <HiOutlineCheckCircle size={16} /> Commit ({recognized.length})
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
      <div className="glass-card" style={{ padding: 14, marginBottom: 14 }}>
        <div className="session-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <select aria-label="Select course" className="input-field" value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)} disabled={scanning}>
            <option value="">Select Course</option>
            {courseOptions.map((c) => (
              <option key={c._id} value={c._id}>{formatCourseName(c.name, { status: c.status, isInactive: c.isInactive })} {c.code ? `(${c.code})` : ''}</option>
            ))}
          </select>
          <select aria-label="Select paper" className="input-field" value={selectedPaperId} onChange={(e) => setSelectedPaperId(e.target.value)} disabled={scanning || !selectedCourseId}>
            <option value="">{selectedCourseId ? 'Select Paper' : 'Select Course First'}</option>
            {filteredPapers.map((p) => (
              <option key={p._id} value={p._id} disabled={p.is_course_inactive}>{p.name} ({p.code}){p.is_course_inactive ? ' - Locked' : ''}</option>
            ))}
          </select>
          <div style={{ padding: '10px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border-glass)', background: 'var(--bg-glass)', fontSize: '0.8rem' }}>
            <p style={{ color: 'var(--text-muted)' }}>Subject / Course</p>
            <p style={{ fontWeight: 700 }}>{selectedPaper ? `${selectedPaper.name} · ${formatCourseName(selectedPaper.course_name || 'N/A', { status: selectedPaper.course_status, isInactive: selectedPaper.is_course_inactive })}` : 'N/A'}</p>
            {selectedPaper?.is_course_inactive && (
              <p style={{ marginTop: 4, color: 'var(--accent-amber)' }}>Course inactive: attendance locked</p>
            )}
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border-glass)', background: 'var(--bg-glass)', fontSize: '0.8rem' }}>
            <p style={{ color: 'var(--text-muted)' }}>Academic Session</p>
            <p style={{ fontWeight: 700 }}>{currentAcademicSession}</p>
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border-glass)', background: 'var(--bg-glass)', fontSize: '0.8rem' }}>
            <p style={{ color: 'var(--text-muted)' }}>Session Time</p>
            <p style={{ fontWeight: 700 }}>{sessionStartedAt ? fmt(sessionStartedAt) : 'Not started'}</p>
          </div>
        </div>
      </div>

      <div className="session-feed-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        <WebcamFeed ref={videoRef} isActive={isActive} error={error} />
        <RecognizedList students={recognized} />
      </div>

      {sessionId && (
        <div className="glass-card" style={{ marginTop: 14, padding: 12 }}>
          <p role="status" aria-live="polite" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Status: <b>{scanning ? 'Scanning' : 'Paused'}</b> |{' '}
            Faces detected: <b>{diag.faces_detected}</b> | Candidates in this paper: <b>{diag.candidates_count}</b>
            {diag.best_similarity_seen !== null ? ` | Best similarity: ${diag.best_similarity_seen}` : ''}
            {diag.threshold !== null ? ` | Threshold: ${diag.threshold}` : ''}
          </p>
          {scanError && <p role="alert" style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--accent-rose)' }}>{scanError}</p>}
        </div>
      )}

      {review && (
        <div className="glass-card" style={{ marginTop: 14, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Committed Attendance Review</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Committed: {fmt(review.committed_at)} | Rollback until: {fmt(review.rollback_until)}
                {rollbackRemainingMins !== null ? ` (${rollbackRemainingMins} min left)` : ''}
              </p>
            </div>
            <button className="btn-primary" disabled={!review.editable} onClick={() => setShowAdjustPin(true)}>
              Re-commit Adjustments
            </button>
          </div>

          {!review.editable && (
            <p style={{ fontSize: '0.8rem', color: 'var(--accent-rose)', marginBottom: 10 }}>
              Rollback window expired. This attendance is finalized and cannot be modified.
            </p>
          )}

          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: 8 }}>
            {(review.candidates || []).map((s) => {
              const checked = adjustIds.includes(s.user_id);
              return (
                <label key={s.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', fontSize: '0.82rem', cursor: review.editable ? 'pointer' : 'default' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!review.editable}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...adjustIds, s.user_id]
                        : adjustIds.filter((id) => id !== s.user_id);
                      setAdjustIds(next);
                    }}
                  />
                  {s.name} ({s.email})
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
