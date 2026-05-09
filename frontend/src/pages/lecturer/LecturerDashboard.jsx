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
  const [pin, setPin] = useState('');
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
    if (pin.length !== 4) {
      toast.error('PIN must be 4 digits');
      return;
    }
    try {
      await api.put('/lecturer/pin', { pin });
      toast.success('PIN updated');
      setPin('');
      setGeneratedPin('');
      fetchAll();
      setShowPinModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update PIN');
    }
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
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Welcome, <span className="gradient-text">Lecturer</span></h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Set your 4-digit PIN, then select a paper to start attendance.</p>
      </div>

      <div className="lecturer-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatsCard icon={HiOutlineBookOpen} label="Assigned Papers" value={papers.length} color="var(--accent-cyan)" />
        <div className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Commit PIN Status</p>
            <p style={{ fontSize: '1rem', fontWeight: 700, marginTop: 6 }}>{pinStatus.has_pin ? 'Configured' : 'Not Set'}</p>
          </div>
          <button className="btn-primary" style={{ marginTop: 12, justifyContent: 'center' }} onClick={() => setShowPinModal(true)}>
            <HiOutlineKey size={16} /> Manage PIN
          </button>
        </div>
        <div className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Face Enrollment Status</p>
            <p style={{ fontSize: '1rem', fontWeight: 700, marginTop: 6 }}>{user?.has_face_enrolled ? 'Enrolled' : 'Not Enrolled'}</p>
          </div>
          {!user?.has_face_enrolled && (
            <button className="btn-primary" style={{ marginTop: 12, justifyContent: 'center' }} onClick={() => setShowFaceEnrollModal(true)}>
              <HiOutlineCamera size={16} /> Enroll Face
            </button>
          )}
        </div>
      </div>

      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Your Papers</h3>
      <div className="lecturer-papers-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {papers.map((p) => (
          <motion.div
            key={p._id}
            whileHover={{ y: -4 }}
            className="glass-card"
            style={{ padding: 20, cursor: p.is_course_inactive ? 'not-allowed' : 'pointer' }}
            onClick={() => {
              if (p.is_course_inactive) return;
              navigate(`/lecturer/session?paper_id=${p._id}`);
            }}
          >
            <SoftLockWrapper locked={p.is_course_inactive} title="Locked: course inactive">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="badge badge-info" style={{ marginBottom: 8 }}>{p.code}</span>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: 8 }}>{p.name}</h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {formatCourseName(p.course_name || 'No Course', { isInactive: p.is_course_inactive, status: p.course_status })} · Session {p.enrolled_academic_session_label || p.enrolled_academic_session || p.academic_year || 'N/A'}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Semester {p.semester || 'N/A'}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {p.total_classes} classes held
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {p.total_enrolled_students || 0} total enrolled students
                </p>
                {p.is_course_inactive && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', marginTop: 6 }}>
                    Course inactive: attendance locked
                  </p>
                )}
              </div>
              <button className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.75rem' }} disabled={p.is_course_inactive}>
                <HiOutlineCamera size={14} /> {p.is_course_inactive ? 'Locked' : 'Start'}
              </button>
              </div>
            </SoftLockWrapper>
          </motion.div>
        ))}
        {papers.length === 0 ? (
          <StatePanel variant="empty" title="No papers assigned" description="Contact your administrator to assign at least one subject." compact />
        ) : null}
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

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-secondary)' }}>Set PIN Manually</label>
          <input
            className="input-field"
            type="password"
            placeholder="Enter 4 digits"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            style={{ textAlign: 'center', letterSpacing: '0.25em', fontSize: '1rem' }}
          />
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
