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
  const [pin, setPin] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);

  const handleCommit = async () => {
    const pinStr = pin.join('');
    if (pinStr.length !== 4) return;
    setLoading(true);
    await onCommit(pinStr);
    setLoading(false);
    setPin(['', '', '', '']);
  };

  const handleChange = (val, index) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const newPin = [...pin];
    newPin[index] = digit;
    setPin(newPin);

    // Auto-focus next input
    if (digit && index < 3) {
      const nextInput = document.getElementById(`pin-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      const prevInput = document.getElementById(`pin-${index - 1}`);
      prevInput?.focus();
    }
    if (e.key === 'Enter' && pin.join('').length === 4) {
      handleCommit();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const data = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    const newPin = [...pin];
    data.split('').forEach((char, i) => {
      if (i < 4) newPin[i] = char;
    });
    setPin(newPin);
    // Focus last filled or next empty
    const focusIndex = Math.min(data.length, 3);
    document.getElementById(`pin-${focusIndex}`)?.focus();
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
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 24 }}>
          {subtitle || defaultSubtitle}
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 28 }} onPaste={handlePaste}>
          {pin.map((digit, i) => (
            <input
              key={i}
              id={`pin-${i}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={digit}
              onChange={(e) => handleChange(e.target.value, i)}
              onKeyDown={(e) => handleKeyDown(e, i)}
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
                background: 'var(--bg-glass, #ffffff)',
                color: 'var(--text-primary, #0f172a)',
                transition: 'all 0.2s ease',
                outline: 'none',
                boxShadow: digit ? '0 0 0 4px rgba(139, 92, 246, 0.15)' : '0 2px 4px rgba(0,0,0,0.02)'
              }}
              autoFocus={i === 0}
              autoComplete="one-time-code"
            />
          ))}
        </div>

        <button
          className="btn-primary"
          disabled={pin.join('').length !== 4 || loading}
          onClick={handleCommit}
          style={{ width: '100%', justifyContent: 'center', padding: '14px 24px', fontSize: '1rem', fontWeight: 600 }}
        >
          {loading ? loadingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
