import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { HiOutlineLockClosed, HiOutlineMail, HiOutlineEye, HiOutlineEyeOff, HiOutlineSun, HiOutlineMoon } from 'react-icons/hi';
import { formatDateTimeIndia } from '../utils/dateTime';

const LOCKOUT_WITHOUT_TZ_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

function normalizeUtcLockoutTimestamp(value) {
  if (typeof value !== 'string') return value;
  return LOCKOUT_WITHOUT_TZ_PATTERN.test(value) ? `${value}Z` : value;
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!email || !password) return toast.error('Please fill in all fields');
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user.must_change_password) {
        navigate('/change-password', { replace: true });
        return;
      }
      const dest = user.role === 'admin' ? '/admin' : user.role === 'lecturer' ? '/lecturer' : '/student';
      navigate(dest, {
        replace: true,
        state: { showWelcome: true, welcomeToken: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
      });
    } catch (err) {
      const lockoutUntil = err.response?.data?.lockout_until;
      const normalizedLockoutUntil = normalizeUtcLockoutTimestamp(lockoutUntil);
      const message = lockoutUntil
        ? `Account locked until ${formatDateTimeIndia(normalizedLockoutUntil, { dateStyle: 'short', timeStyle: 'medium' })}`
        : err.response?.data?.error || 'Login failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)',
      position: 'relative', overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          position: 'absolute',
          top: 18,
          right: 18,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'var(--bg-glass)',
          border: '1px solid var(--border-glass)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          zIndex: 2,
        }}
      >
        {theme === 'dark' ? <HiOutlineSun size={18} /> : <HiOutlineMoon size={18} />}
      </button>

      {/* Background gradient orbs */}
      <div style={{
        position: 'absolute', width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
        top: -100, right: -100, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)',
        bottom: -80, left: -80, pointerEvents: 'none',
      }} />

      <div
        style={{
          width: 420, padding: 40,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-glass)',
          borderRadius: 'var(--radius-xl)',
          position: 'relative',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05, ease: 'easeOut' }}
            style={{
              position: 'relative',
              width: 70,
              height: 70,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <motion.div
              animate={{ scale: [1, 1.08, 1], opacity: [0.45, 0.22, 0.45] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 20,
                background: 'radial-gradient(circle at 30% 30%, rgba(139,92,246,0.45), rgba(6,182,212,0.18) 60%, transparent 85%)',
                filter: 'blur(2px)',
              }}
            />

            <div style={{
              width: 58,
              height: 58,
              borderRadius: 18,
              background: 'linear-gradient(145deg, rgba(139,92,246,0.95), rgba(6,182,212,0.95))',
              border: '1px solid rgba(255,255,255,0.35)',
              boxShadow: '0 12px 28px rgba(6,182,212,0.25), inset 0 1px 0 rgba(255,255,255,0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              zIndex: 1,
            }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="5" />
                <circle cx="12" cy="10" r="2.7" />
                <path d="M7.6 16.4c1-1.8 2.6-2.8 4.4-2.8s3.4 1 4.4 2.8" />
                <path d="M8.2 7.4h.01M15.8 7.4h.01" />
              </svg>
            </div>
          </motion.div>

          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }} className="gradient-text">FaceAttend</h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 6 }}>
            Biometric Attendance Management System
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="login-email" style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Email</label>
            <div style={{ position: 'relative' }}>
              <HiOutlineMail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@system.com"
                className="input-field"
                style={{ paddingLeft: 36 }}
                id="login-email"
              />
            </div>
          </div>
          <div>
            <label htmlFor="login-password" style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <HiOutlineLockClosed size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
                style={{ paddingLeft: 36, paddingRight: 44 }}
                id="login-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showPassword ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            style={{
              width: '100%',
              padding: '11px 16px',
              marginTop: 8,
              borderRadius: 10,
              border: '1px solid rgba(59,130,246,0.5)',
              background: '#2563eb',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
            id="login-submit"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
