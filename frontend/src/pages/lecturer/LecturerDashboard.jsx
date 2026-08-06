import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../api/axios';
import StatsCard from '../../components/ui/StatsCard';
import Modal from '../../components/ui/Modal';
import StatePanel from '../../components/ui/StatePanel';
import SoftLockWrapper from '../../components/ui/SoftLockWrapper';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlineBookOpen, HiOutlineCamera, HiOutlineKey } from 'react-icons/hi';
import { formatCourseName } from '../../utils/courseDisplay';
import { useAuth } from '../../hooks/useAuth';
import AcademicCalendarPanel from '../../components/calendar/AcademicCalendarPanel';
import LecturerFaceEnrollmentModal from '../../components/admin/LecturerFaceEnrollmentModal';

export default function LecturerDashboard() {
  const { user, refreshUser } = useAuth();
  const location = useLocation();
  const [papers, setPapers] = useState([]);
  const [pinStatus, setPinStatus] = useState({ has_pin: false });
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState(['', '', '', '']);
  const [generatedPin, setGeneratedPin] = useState('');
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [showFaceEnrollModal, setShowFaceEnrollModal] = useState(false);
  const navigate = useNavigate();

  const fetchAll = () => {
    setLoadingDashboard(true);
    setDashboardError('');
    Promise.all([
      api.get('/lecturer/papers'),
      api.get('/lecturer/pin'),
    ]).then(([papersRes, pinRes]) => {
      setPapers(Array.isArray(papersRes.data) ? papersRes.data : []);
      setPinStatus(pinRes.data || { has_pin: false });
    }).catch((err) => {
      setPapers([]);
      setPinStatus({ has_pin: false });
      setDashboardError(err.response?.data?.error || 'Failed to load lecturer dashboard.');
    }).finally(() => setLoadingDashboard(false));
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (!location.state?.showWelcome || !user?.name) return;

    const token = String(location.state?.welcomeToken || '');
    const userIdentity = user?._id || user?.email || user?.name || 'lecturer';
    const key = `welcome-toast:${userIdentity}`;
    const alreadyShownToken = window.sessionStorage.getItem(key);
    if (token && alreadyShownToken === token) return;

    toast.success(`Welcome, ${user.name}!`);
    if (token) {
      window.sessionStorage.setItem(key, token);
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, user?._id, user?.email, user?.name]);

  const handleGeneratePin = async () => {
    try {
      const res = await api.post('/lecturer/pin/generate');
      setGeneratedPin(res.data.pin);
      setPinStatus({ has_pin: true, pin_last_set: new Date().toISOString() });
      toast.success('New PIN generated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate PIN');
    }
  };

  const handleSetPin = async () => {
    const pinStr = pin.join('');
    if (pinStr.length !== 4) {
      toast.error('PIN must be 4 digits');
      return;
    }
    try {
      await api.put('/lecturer/pin', { pin: pinStr });
      toast.success('PIN updated');
      setPin(['', '', '', '']);
      setGeneratedPin('');
      fetchAll();
      setShowPinModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update PIN');
    }
  };

  const handlePinChange = (val, index) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const newPin = [...pin];
    newPin[index] = digit;
    setPin(newPin);

    if (digit && index < 3) {
      document.getElementById(`manage-pin-${index + 1}`)?.focus();
    }
  };

  const handlePinKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      document.getElementById(`manage-pin-${index - 1}`)?.focus();
    }
    if (e.key === 'Enter' && pin.join('').length === 4) {
      handleSetPin();
    }
  };

  const handlePinPaste = (e) => {
    e.preventDefault();
    const data = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    const newPin = [...pin];
    data.split('').forEach((char, i) => {
      if (i < 4) newPin[i] = char;
    });
    setPin(newPin);
    const focusIndex = Math.min(data.length, 3);
    document.getElementById(`manage-pin-${focusIndex}`)?.focus();
  };

  if (loadingDashboard) {
    return (
      <div className="lecturer-page">
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Welcome, <span className="gradient-text">Lecturer</span></h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Set your 4-digit PIN, then select a paper to start attendance.</p>
        </div>
        <StatePanel variant="loading" title="Loading dashboard" description="Preparing your assigned papers and PIN status." compact />
      </div>
    );
  }

  if (dashboardError) {
    return (
      <div className="lecturer-page">
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Welcome, <span className="gradient-text">Lecturer</span></h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Set your 4-digit PIN, then select a paper to start attendance.</p>
        </div>
        <StatePanel variant="error" title="Unable to load dashboard" description={dashboardError} actionLabel="Retry" onAction={fetchAll} compact />
      </div>
    );
  }

  return (
    <div className="lecturer-page">
      <motion.div 
        initial={{ opacity: 0, y: -10 }} 
        animate={{ opacity: 1, y: 0 }} 
        style={{ marginBottom: 32 }}
      >
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Welcome back, <span className="gradient-text">{user?.name?.split(' ')[0] || 'Lecturer'}</span> 👋</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 6 }}>Set your 4-digit PIN, then select a paper to start attendance.</p>
      </motion.div>

      <div className="lecturer-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatsCard icon={HiOutlineBookOpen} label="Assigned Papers" value={papers.length} color="var(--accent-cyan)" />

        {/* PIN Card */}
        <motion.div 
          whileHover={{ y: -4, boxShadow: 'var(--shadow-glow)' }}
          transition={{ duration: 0.2 }}
          className="glass-card" 
          style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12, background: 'linear-gradient(145deg, var(--bg-card), rgba(139, 92, 246, 0.05))' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Commit PIN</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: pinStatus.has_pin ? 'var(--accent-emerald)' : 'var(--accent-rose)', display: 'inline-block' }} />
                <p style={{ fontSize: '0.95rem', fontWeight: 700 }}>{pinStatus.has_pin ? 'Configured' : 'Not Set'}</p>
              </div>
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--bg-glass)', display: 'grid', placeItems: 'center', color: 'var(--accent-purple)' }}>
              <HiOutlineKey size={18} />
            </div>
          </div>
          <button className="btn-primary" style={{ justifyContent: 'center', width: '100%' }} onClick={() => setShowPinModal(true)}>
            <HiOutlineKey size={15} /> {pinStatus.has_pin ? 'Change PIN' : 'Set PIN'}
          </button>
        </motion.div>

        {/* Face Enrollment Card */}
        <motion.div 
          whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(6, 182, 212, 0.15)' }}
          transition={{ duration: 0.2 }}
          className="glass-card" 
          style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12, background: 'linear-gradient(145deg, var(--bg-card), rgba(6, 182, 212, 0.05))' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Face Enrollment</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: user?.has_face_enrolled ? 'var(--accent-emerald)' : 'var(--accent-amber)', display: 'inline-block' }} />
                <p style={{ fontSize: '0.95rem', fontWeight: 700 }}>{user?.has_face_enrolled ? 'Enrolled' : 'Not Enrolled'}</p>
              </div>
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--bg-glass)', display: 'grid', placeItems: 'center', color: 'var(--accent-cyan)' }}>
              <HiOutlineCamera size={18} />
            </div>
          </div>
          {!user?.has_face_enrolled && (
            <button className="btn-primary" style={{ justifyContent: 'center', width: '100%' }} onClick={() => setShowFaceEnrollModal(true)}>
              <HiOutlineCamera size={15} /> Enroll Face
            </button>
          )}
        </motion.div>
      </div>

      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Your Papers</h3>
      <div className="lecturer-papers-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {papers.map((p) => (
          <motion.div
            key={p._id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ y: -6, scale: 1.01, boxShadow: '0 12px 30px rgba(0,0,0,0.1)' }}
            className="glass-card"
            style={{ padding: 22, cursor: p.is_course_inactive ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', gap: 14, background: 'linear-gradient(to bottom right, var(--bg-card), var(--bg-glass))' }}
            onClick={() => { if (p.is_course_inactive) return; navigate(`/lecturer/session?paper_id=${p._id}`); }}
          >
            <SoftLockWrapper locked={p.is_course_inactive} title="Locked: course inactive">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span className="badge badge-info">{p.code}</span>
                    {p.is_course_inactive && <span className="badge badge-warning" style={{ fontSize: '0.62rem' }}>Locked</span>}
                  </div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4 }}>{p.name}</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                    {formatCourseName(p.course_name || 'No Course', { isInactive: p.is_course_inactive, status: p.course_status })}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sem {p.semester || 'N/A'} · {p.enrolled_academic_session_label || p.academic_year || 'N/A'}</p>
                </div>
                <button className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.75rem', flexShrink: 0, marginLeft: 8 }} disabled={p.is_course_inactive} onClick={(e) => { e.stopPropagation(); if (!p.is_course_inactive) navigate(`/lecturer/session?paper_id=${p._id}`); }}>
                  <HiOutlineCamera size={14} /> {p.is_course_inactive ? 'Locked' : 'Start'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: 8, borderTop: '1px solid var(--border-glass)' }}>
                <span><b style={{ color: 'var(--text-primary)' }}>{p.total_classes || 0}</b> classes held</span>
                <span><b style={{ color: 'var(--accent-cyan)' }}>{p.total_enrolled_students || 0}</b> enrolled</span>
              </div>
            </SoftLockWrapper>
          </motion.div>
        ))}
        {papers.length === 0 && (
          <StatePanel variant="empty" title="No papers assigned" description="Contact your administrator to assign at least one subject." compact />
        )}
      </div>

      <Modal isOpen={showPinModal} onClose={() => setShowPinModal(false)} title="Manage 4-Digit PIN" width={460}>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          This PIN is required every time attendance is committed or adjusted.
        </p>

        {generatedPin && (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 'var(--radius)', border: '1px solid var(--border-glass)', background: 'var(--bg-glass)' }}>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Generated PIN</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '0.2em' }}>{generatedPin}</p>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: '0.74rem', fontWeight: 650, marginBottom: 10, display: 'block', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Set PIN Manually</label>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }} onPaste={handlePinPaste}>
            {pin.map((digit, i) => (
              <input
                key={i}
                id={`manage-pin-${i}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={digit}
                onChange={(e) => handlePinChange(e.target.value, i)}
                onKeyDown={(e) => handlePinKeyDown(e, i)}
                style={{
                  width: 50,
                  height: 60,
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  textAlign: 'center',
                  borderRadius: 'var(--radius-lg)',
                  borderWidth: '2px',
                  borderStyle: 'solid',
                  borderTopColor: digit ? 'var(--accent-purple)' : 'var(--border-glass, #e2e8f0)',
                  borderRightColor: digit ? 'var(--accent-purple)' : 'var(--border-glass, #e2e8f0)',
                  borderBottomColor: digit ? 'var(--accent-purple)' : 'var(--border-glass, #e2e8f0)',
                  borderLeftColor: digit ? 'var(--accent-purple)' : 'var(--border-glass, #e2e8f0)',
                  background: 'var(--bg-primary, #f8fafc)',
                  color: 'var(--text-main, #0f172a)',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  boxShadow: digit ? '0 0 0 4px rgba(139, 92, 246, 0.15)' : '0 2px 4px rgba(0,0,0,0.02)'
                }}
                autoFocus={i === 0 && showPinModal}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={handleGeneratePin}>Generate PIN</button>
          <button className="btn-primary" onClick={handleSetPin}>Save PIN</button>
        </div>
      </Modal>

      <div style={{ marginTop: 28 }}>
        <AcademicCalendarPanel compact />
      </div>

      {showFaceEnrollModal && <LecturerFaceEnrollmentModal lecturer={{ _id: user._id, name: user.name }} onClose={() => setShowFaceEnrollModal(false)} onSuccess={() => { setShowFaceEnrollModal(false); fetchAll(); refreshUser(); }} />}
    </div>
  );
}
