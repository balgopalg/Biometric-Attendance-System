import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import StatsCard from '../../components/ui/StatsCard';
import Modal from '../../components/ui/Modal';
import SoftLockWrapper from '../../components/ui/SoftLockWrapper';
import toast, { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { HiOutlineBookOpen, HiOutlineCamera, HiOutlineKey } from 'react-icons/hi';

export default function LecturerDashboard() {
  const [papers, setPapers] = useState([]);
  const [pinStatus, setPinStatus] = useState({ has_pin: false });
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [generatedPin, setGeneratedPin] = useState('');
  const navigate = useNavigate();

  const fetchAll = () => {
    api.get('/lecturer/papers').then((r) => setPapers(r.data)).catch(() => {});
    api.get('/lecturer/pin').then((r) => setPinStatus(r.data)).catch(() => {});
  };

  useEffect(() => {
    fetchAll();
  }, []);

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Toaster position="top-right" toastOptions={{ style: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' } }} />

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Welcome, <span className="gradient-text">Lecturer</span></h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>Set your 4-digit PIN, then select a paper to start attendance.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
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
      </div>

      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Your Papers</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
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
                  {(p.course_name || 'No Course')} · Session {p.academic_year || 'N/A'}
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
        {papers.length === 0 && (
          <div className="glass-card" style={{ padding: 30, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)' }}>No papers assigned to you yet.</p>
          </div>
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
    </motion.div>
  );
}
