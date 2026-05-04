import Modal from '../../../components/ui/Modal';
import { HiOutlineCheckCircle, HiOutlineClipboardCopy } from 'react-icons/hi';

export default function CredentialsModal({ isOpen, onClose, createdCreds, onCopy }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" width={460}>
      <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <HiOutlineCheckCircle size={22} style={{ color: 'var(--accent-emerald)' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
            {createdCreds?.isReset ? 'Password Reset' : 'Lecturer Created'}
          </h3>
        </div>
        <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 16, textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Name:</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{createdCreds?.name}</span>
          </div>
          {createdCreds?.email && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Email:</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{createdCreds.email}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Temp Password:</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-purple)', fontFamily: 'monospace' }}>{createdCreds?.temp_password}</span>
          </div>
        </div>
        <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={onCopy}>
          <HiOutlineClipboardCopy size={16} /> Copy credentials
        </button>
      </div>
    </Modal>
  );
}
