import { useState } from 'react';
import Modal from '../../components/ui/Modal';
import { HiOutlineLockClosed } from 'react-icons/hi';

export default function PinCommitModal({
  isOpen,
  onClose,
  onCommit,
  studentsCount,
  title = 'Commit Attendance',
  subtitle,
  confirmLabel = 'Confirm & Save',
  loadingLabel = 'Committing...',
}) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCommit = async () => {
    setLoading(true);
    await onCommit(pin);
    setLoading(false);
    setPin('');
  };

  const defaultSubtitle = `Enter your 4-digit PIN to commit attendance. You can adjust records within 30 minutes.`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} width={400}>
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(139, 92, 246, 0.12)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <HiOutlineLockClosed size={24} style={{ color: 'var(--accent-purple)' }} />
        </div>
        <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 4 }}>
          {studentsCount} student(s) will be marked present
        </p>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 20 }}>
          {subtitle || defaultSubtitle}
        </p>
        <input
          type="password"
          className="input-field"
          placeholder="4-digit PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.3em', marginBottom: 16 }}
          autoFocus
        />
        <button
          className="btn-primary"
          disabled={pin.length !== 4 || loading}
          onClick={handleCommit}
          style={{ width: '100%', justifyContent: 'center', padding: '12px 24px' }}
        >
          {loading ? loadingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
