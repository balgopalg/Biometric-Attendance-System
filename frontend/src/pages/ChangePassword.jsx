import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/axios';
import { motion } from 'framer-motion';
import { HiOutlineLockClosed, HiOutlineCheckCircle, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';

function CheckItem({ ok, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: ok ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        border: `2px solid ${ok ? 'var(--accent-emerald)' : 'var(--border-glass)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s',
      }}>
        {ok && <HiOutlineCheckCircle size={12} />}
      </div>
      {text}
    </div>
  );
}

function PasswordField({ label, value, field, placeholder, autoFocus = false, onChange, visiblePasswords, onToggleVisibility }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-purple)', display: 'block', marginBottom: 8 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          className="input-field"
          type={visiblePasswords[field] ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoFocus={autoFocus}
          style={{ paddingRight: 44 }}
        />
        <button
          type="button"
          onClick={() => onToggleVisibility(field)}
          aria-label={visiblePasswords[field] ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
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
          {visiblePasswords[field] ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
        </button>
      </div>
    </div>
  );
}

export default function ChangePassword() {
  const { clearMustChangePassword, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [visiblePasswords, setVisiblePasswords] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const hasMinLength = form.new_password.length >= 8;
  const hasUppercase = /[A-Z]/.test(form.new_password);
  const hasLowercase = /[a-z]/.test(form.new_password);
  const hasNumber = /\d/.test(form.new_password);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};:'",.<>?/\\|`~]/.test(form.new_password);
  const passwordsMatch = form.new_password && form.new_password === form.confirm_password;
  const allValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial && passwordsMatch && form.current_password;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allValid) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post('/auth/change-password', form);
      clearMustChangePassword();
      const dest = user?.role === 'admin' ? '/admin' : user?.role === 'lecturer' ? '/lecturer' : '/student';
      navigate(dest, {
        replace: true,
        state: { showWelcome: true, welcomeToken: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: 20,
    }}>
      <div
        style={{
          width: '100%', maxWidth: 440,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-glass)',
          borderRadius: 'var(--radius-xl)',
          padding: '40px 36px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(139,92,246,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent-purple)',
          }}>
            <HiOutlineLockClosed size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Set your password</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>First login — please change your temporary password</p>
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 'var(--radius)',
            background: 'rgba(244,63,94,0.1)', color: 'var(--accent-rose)',
            fontSize: '0.82rem', fontWeight: 500,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
          <PasswordField
            label="Current Password"
            value={form.current_password}
            field="current"
            placeholder="Enter temporary password"
            autoFocus
            onChange={(e) => setForm({ ...form, current_password: e.target.value })}
            visiblePasswords={visiblePasswords}
            onToggleVisibility={togglePasswordVisibility}
          />

          <PasswordField
            label="New Password"
            value={form.new_password}
            field="next"
            placeholder="At least 8 characters"
            onChange={(e) => setForm({ ...form, new_password: e.target.value })}
            visiblePasswords={visiblePasswords}
            onToggleVisibility={togglePasswordVisibility}
          />

          <div style={{ marginBottom: 20 }}>
            <PasswordField
              label="Confirm New Password"
              value={form.confirm_password}
              field="confirm"
              placeholder="Re-enter new password"
              onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
              visiblePasswords={visiblePasswords}
              onToggleVisibility={togglePasswordVisibility}
            />
          </div>

          {/* Validation Checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            <CheckItem ok={hasMinLength} text="At least 8 characters" />
            <CheckItem ok={hasUppercase} text="Contains an uppercase letter" />
            <CheckItem ok={hasLowercase} text="Contains a lowercase letter" />
            <CheckItem ok={hasNumber} text="Contains a number" />
            <CheckItem ok={hasSpecial} text="Contains a special character" />
            <CheckItem ok={passwordsMatch} text="Passwords match" />
          </div>

          <button
            type="submit"
            disabled={!allValid || submitting}
            style={{
              width: '100%', padding: '12px 0',
              background: allValid ? 'var(--gradient-primary)' : 'var(--bg-glass)',
              color: allValid ? '#fff' : 'var(--text-muted)',
              border: allValid ? 'none' : '1px solid var(--border-glass)',
              borderRadius: 'var(--radius)', fontSize: '0.9rem', fontWeight: 700,
              cursor: allValid ? 'pointer' : 'not-allowed',
              transition: 'all 0.3s',
            }}
          >
            {submitting ? 'Saving...' : 'Save New Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
