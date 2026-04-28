import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { HiOutlineMail, HiOutlineShieldCheck, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';

function PasswordInput({ id, label, value, onChange, visible, onToggle, placeholder }) {
  return (
    <div>
      <label htmlFor={id} style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <HiOutlineLockClosed size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="input-field"
          style={{ paddingLeft: 36, paddingRight: 44 }}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 28,
            height: 28,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {visible ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
        </button>
      </div>
    </div>
  );
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const requestOtp = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }

    setRequestingOtp(true);
    try {
      const { data } = await api.post('/auth/forgot-password/request-otp', { email });
      setOtpRequested(true);
      toast.success(data?.message || 'Recovery OTP sent successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send OTP');
    } finally {
      setRequestingOtp(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    if (!email.trim() || !otp.trim() || !newPassword || !confirmPassword) {
      toast.error('Please complete all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setResettingPassword(true);
    try {
      const { data } = await api.post('/auth/forgot-password/reset', {
        email,
        otp,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      toast.success(data?.message || 'Password reset successful');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      padding: '20px 16px',
    }}>
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          padding: '34px 30px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-glass)',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 16,
              margin: '0 auto 12px',
              background: 'var(--gradient-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <HiOutlineShieldCheck size={26} />
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Forgot Password</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 6 }}>
            Request a recovery OTP and set your new password.
          </p>
        </div>

        <form onSubmit={requestOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          <div>
            <label htmlFor="recovery-email" style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              Linked Email
            </label>
            <div style={{ position: 'relative' }}>
              <HiOutlineMail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                id="recovery-email"
                type="email"
                className="input-field"
                style={{ paddingLeft: 36 }}
                placeholder="admin@system.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={requestingOtp || !email.trim()} style={{ width: '100%', justifyContent: 'center' }}>
            {requestingOtp ? 'Sending OTP...' : 'Send Recovery OTP'}
          </button>
        </form>

        {otpRequested && (
          <form onSubmit={resetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="recovery-otp" style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                Recovery OTP
              </label>
              <input
                id="recovery-otp"
                className="input-field"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              />
            </div>

            <PasswordInput
              id="recovery-new-password"
              label="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              visible={showNewPassword}
              onToggle={() => setShowNewPassword((prev) => !prev)}
              placeholder="Enter new password"
            />

            <PasswordInput
              id="recovery-confirm-password"
              label="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              visible={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((prev) => !prev)}
              placeholder="Confirm new password"
            />

            <button type="submit" className="btn-primary" disabled={resettingPassword} style={{ width: '100%', justifyContent: 'center' }}>
              {resettingPassword ? 'Resetting Password...' : 'Reset Password'}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => navigate('/login')}
          style={{
            marginTop: 18,
            border: 'none',
            background: 'transparent',
            color: 'var(--accent-cyan)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.84rem',
          }}
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}
