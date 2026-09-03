import Modal from '../../../components/ui/Modal';
import { HiOutlineCheckCircle, HiOutlineClipboardCopy } from 'react-icons/hi';

export default function CredentialsModal({ isOpen, onClose, createdCreds, onCopy }) {
  const entityLabel = createdCreds?.entityLabel || 'Student';
  const title = createdCreds?.isReset
    ? (createdCreds?.entityLabel ? `${entityLabel} Password Reset` : 'Password Reset')
    : `${entityLabel} Created`;
  const identityLabel = createdCreds?.identityLabel || (createdCreds?.isReset ? 'Name:' : 'Reg No:');
  const identityValue = createdCreds?.identityValue || (createdCreds?.isReset
    ? (createdCreds?.name || createdCreds?.reg_number)
    : (createdCreds?.reg_number || createdCreds?.name));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" width={460}>
      <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
          <HiOutlineCheckCircle size={22} style={{ color: 'var(--accent-emerald)' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
            {title}
          </h3>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20 }}>
          Share these credentials securely.
        </p>

        <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 16, textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{identityLabel}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{identityValue}</span>
          </div>
          {createdCreds?.email && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Email:</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{createdCreds.email}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Temp Password:</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-purple)', fontFamily: 'monospace' }}>
              {createdCreds?.temp_password}
            </span>
          </div>
        </div>

        <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={onCopy}>
          <HiOutlineClipboardCopy size={16} /> Copy credentials
        </button>
      </div>
    </Modal>
  );
}
