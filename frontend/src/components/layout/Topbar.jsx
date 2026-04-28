import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../context/ThemeContext';
import api from '../../api/axios';
import { AnimatePresence, motion } from 'framer-motion';
import {
  HiOutlineBell,
  HiOutlineSun,
  HiOutlineMoon,
  HiOutlineMenuAlt2,
  HiOutlineChevronDoubleLeft,
  HiOutlineChevronDoubleRight,
  HiOutlineUserCircle,
  HiOutlineKey,
  HiOutlineLogout,
  HiOutlineX,
  HiOutlineEye,
  HiOutlineEyeOff,
} from 'react-icons/hi';

function getInitials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function ProfilePicture({ user, size = 34 }) {
  const style = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: size <= 34 ? '0.8rem' : '1rem',
    color: '#fff',
    background: 'var(--gradient-primary)',
    overflow: 'hidden',
  };

  if (user?.profile_picture_url) {
    return (
      <img
        src={user.profile_picture_url}
        alt={`${user?.name || 'User'} avatar`}
        style={{ ...style, objectFit: 'cover' }}
      />
    );
  }

  return <div style={style}>{getInitials(user?.name)}</div>;
}

function ProfileModal({ user, onClose, onUploaded }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const currentPreview = previewUrl || user?.profile_picture_url || '';

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose a valid image file');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextPreview = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(nextPreview);
  };

  const onUpload = async () => {
    if (!selectedFile || uploading) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('profile_picture', selectedFile);
      await api.post('/auth/profile-picture', formData);
      await onUploaded();
      toast.success('Profile picture updated');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload profile picture');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-glass)',
          boxShadow: 'var(--shadow-card)',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>My Profile</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
            aria-label="Close profile modal"
          >
            <HiOutlineX size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          {currentPreview ? (
            <img
              src={currentPreview}
              alt="Profile preview"
              style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-glass)' }}
            />
          ) : (
            <ProfilePicture user={user} size={72} />
          )}
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{user?.name || 'User'}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user?.email || ''}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              {(user?.role || '').replace('_', ' ').toUpperCase()}
            </div>
          </div>
        </div>

        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
          Upload Profile Picture
        </label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFileChange}
          className="input-field"
          style={{ marginBottom: 16, padding: '8px 10px' }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onUpload} disabled={!selectedFile || uploading}>
            {uploading ? 'Uploading...' : 'Save Photo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  placeholder,
}) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="input-field"
          style={{ paddingRight: 44 }}
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
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {visible ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
        </button>
      </div>
    </div>
  );
}

function ChangePasswordModal({ onClose, onForgotPassword }) {
  const [form, setForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [visible, setVisible] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const submitChange = async (event) => {
    event.preventDefault();
    if (!form.current_password || !form.new_password || !form.confirm_password) {
      toast.error('All fields are required');
      return;
    }

    if (form.new_password !== form.confirm_password) {
      toast.error('New passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/auth/change-password', form);
      toast.success('Password changed successfully');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-glass)',
          boxShadow: 'var(--shadow-card)',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Change Password</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
            aria-label="Close change password modal"
          >
            <HiOutlineX size={20} />
          </button>
        </div>

        <form onSubmit={submitChange} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PasswordField
            id="profile-current-password"
            label="Current Password"
            value={form.current_password}
            onChange={(e) => setForm((prev) => ({ ...prev, current_password: e.target.value }))}
            visible={visible.current}
            onToggle={() => setVisible((prev) => ({ ...prev, current: !prev.current }))}
            placeholder="Enter current password"
          />
          <PasswordField
            id="profile-new-password"
            label="New Password"
            value={form.new_password}
            onChange={(e) => setForm((prev) => ({ ...prev, new_password: e.target.value }))}
            visible={visible.next}
            onToggle={() => setVisible((prev) => ({ ...prev, next: !prev.next }))}
            placeholder="Enter new password"
          />
          <PasswordField
            id="profile-confirm-password"
            label="Confirm Password"
            value={form.confirm_password}
            onChange={(e) => setForm((prev) => ({ ...prev, confirm_password: e.target.value }))}
            visible={visible.confirm}
            onToggle={() => setVisible((prev) => ({ ...prev, confirm: !prev.confirm }))}
            placeholder="Confirm new password"
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <button
              type="button"
              onClick={onForgotPassword}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--accent-cyan)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
                padding: 0,
              }}
            >
              Forgot password?
            </button>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Password'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatNotificationTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function NotificationInboxModal({
  isOpen,
  onClose,
  items,
  unreadCount,
  loading,
  error,
  refreshing,
  actionId,
  onRefresh,
  onMarkAllRead,
  onOpenNotification,
  isDark = true,
}) {
  const t = {
    overlay: isDark ? 'rgba(2, 6, 23, 0.55)' : 'rgba(100, 116, 139, 0.35)',
    panelBg: isDark ? 'linear-gradient(180deg, rgba(26,34,54,0.98), rgba(17,24,39,0.98))' : 'linear-gradient(180deg, #ffffff, #f8fafc)',
    panelBorder: isDark ? 'rgba(148, 163, 184, 0.18)' : '#e2e8f0',
    panelShadow: isDark ? '0 28px 80px rgba(0,0,0,0.42)' : '0 28px 80px rgba(0,0,0,0.12)',
    headerBg: isDark ? 'linear-gradient(135deg, rgba(6,182,212,0.18), rgba(139,92,246,0.12))' : 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(139,92,246,0.05))',
    headerBorder: isDark ? 'rgba(148, 163, 184, 0.16)' : '#e2e8f0',
    iconBg: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(6,182,212,0.12)',
    iconColor: isDark ? '#fff' : '#0891b2',
    title: isDark ? '#f8fafc' : '#0f172a',
    subtitle: isDark ? 'rgba(226,232,240,0.82)' : '#64748b',
    closeBorder: isDark ? 'rgba(255,255,255,0.14)' : '#e2e8f0',
    closeBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    closeColor: isDark ? '#fff' : '#475569',
    badgeBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    badgeColor: isDark ? '#e2e8f0' : '#475569',
    totalBg: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.12)',
    totalColor: isDark ? '#bbf7d0' : '#059669',
    errorBg: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)',
    errorBorder: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.2)',
    errorColor: isDark ? '#fecaca' : '#dc2626',
    skelBg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    skelBorder: isDark ? 'rgba(148,163,184,0.1)' : '#f1f5f9',
    skelBar: isDark ? 'rgba(148,163,184,0.18)' : 'rgba(0,0,0,0.08)',
    skelBarLight: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(0,0,0,0.05)',
    skelDot: isDark ? 'rgba(148,163,184,0.25)' : 'rgba(0,0,0,0.1)',
    emptyBg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
    emptyBorder: isDark ? 'rgba(148,163,184,0.18)' : '#e2e8f0',
    emptyIconBg: isDark ? 'rgba(6,182,212,0.12)' : 'rgba(6,182,212,0.1)',
    emptyIcon: isDark ? '#67e8f9' : '#0891b2',
    emptyTitle: isDark ? '#f8fafc' : '#0f172a',
    emptyText: isDark ? 'rgba(226,232,240,0.72)' : '#64748b',
    unreadBorder: isDark ? 'rgba(6,182,212,0.25)' : 'rgba(6,182,212,0.3)',
    unreadBg: isDark ? 'linear-gradient(135deg, rgba(6,182,212,0.09), rgba(139,92,246,0.06))' : 'linear-gradient(135deg, rgba(6,182,212,0.06), rgba(139,92,246,0.04))',
    unreadShadow: isDark ? '0 14px 26px rgba(6,182,212,0.08)' : '0 4px 12px rgba(6,182,212,0.06)',
    readBorder: isDark ? 'rgba(148,163,184,0.12)' : '#e2e8f0',
    readBg: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
    dotRead: isDark ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.3)',
    itemTitle: isDark ? '#f8fafc' : '#0f172a',
    itemTime: isDark ? 'rgba(148,163,184,0.85)' : '#94a3b8',
    itemBody: isDark ? 'rgba(226,232,240,0.78)' : '#475569',
    catSecurity: isDark ? '#fecaca' : '#dc2626',
    catProfile: isDark ? '#ddd6fe' : '#7c3aed',
    catDefault: isDark ? '#bae6fd' : '#0891b2',
    actionLink: isDark ? '#67e8f9' : '#0891b2',
  };
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 72,
            background: t.overlay,
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(100%, 680px)',
              marginTop: 28,
              borderRadius: 24,
              overflow: 'hidden',
              background: t.panelBg,
              border: `1px solid ${t.panelBorder}`,
              boxShadow: t.panelShadow,
            }}
          >
            <div style={{ padding: 18, background: t.headerBg, borderBottom: `1px solid ${t.headerBorder}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: t.iconBg,
                      color: t.iconColor,
                    }}>
                      <HiOutlineBell size={18} />
                    </span>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: t.title }}>Notification Inbox</h3>
                  </div>
                  <p style={{ margin: 0, color: t.subtitle, fontSize: '0.86rem', lineHeight: 1.5 }}>
                    System alerts, reminders, and account updates for your session.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close notification inbox"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    border: `1px solid ${t.closeBorder}`,
                    background: t.closeBg,
                    color: t.closeColor,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <HiOutlineX size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    background: t.badgeBg,
                    color: t.badgeColor,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}>
                    {unreadCount} unread
                  </span>
                  <span style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    background: t.totalBg,
                    color: t.totalColor,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}>
                    {items.length} total
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-secondary" onClick={onRefresh} disabled={loading || refreshing}>
                    {loading || refreshing ? 'Refreshing...' : 'Refresh'}
                  </button>
                  <button type="button" className="btn-primary" onClick={onMarkAllRead} disabled={loading || refreshing || unreadCount === 0}>
                    Mark all read
                  </button>
                </div>
              </div>
            </div>

            <div style={{ maxHeight: '66vh', overflowY: 'auto', padding: 16 }}>
              {error ? (
                <div style={{ padding: 18, borderRadius: 18, background: t.errorBg, border: `1px solid ${t.errorBorder}`, color: t.errorColor }}>
                  {error}
                </div>
              ) : loading && items.length === 0 ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {[0, 1, 2].map((index) => (
                    <div key={index} style={{ padding: 16, borderRadius: 18, background: t.skelBg, border: `1px solid ${t.skelBorder}` }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ width: 14, height: 14, borderRadius: 999, background: t.skelDot }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ height: 14, width: '44%', borderRadius: 999, background: t.skelBar, marginBottom: 10 }} />
                          <div style={{ height: 11, width: '100%', borderRadius: 999, background: t.skelBarLight, marginBottom: 8 }} />
                          <div style={{ height: 11, width: '76%', borderRadius: 999, background: t.skelBarLight }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div style={{
                  padding: 28,
                  borderRadius: 20,
                  background: t.emptyBg,
                  border: `1px dashed ${t.emptyBorder}`,
                  textAlign: 'center',
                }}>
                  <div style={{ width: 54, height: 54, borderRadius: 18, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.emptyIconBg, color: t.emptyIcon }}>
                    <HiOutlineBell size={24} />
                  </div>
                  <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: t.emptyTitle }}>Inbox is clear</h4>
                  <p style={{ margin: '8px 0 0', color: t.emptyText, fontSize: '0.84rem' }}>
                    New notices will appear here when your account receives updates.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {items.map((item) => {
                    const unread = !item.is_read;
                    return (
                      <button
                        key={item._id}
                        type="button"
                        onClick={() => onOpenNotification(item)}
                        disabled={actionId === item._id}
                        style={{
                          textAlign: 'left',
                          width: '100%',
                          padding: 16,
                          borderRadius: 18,
                          border: unread ? `1px solid ${t.unreadBorder}` : `1px solid ${t.readBorder}`,
                          background: unread ? t.unreadBg : t.readBg,
                          boxShadow: unread ? t.unreadShadow : 'none',
                          color: 'inherit',
                          cursor: 'pointer',
                          transition: 'transform 180ms ease, border-color 180ms ease, background 180ms ease',
                          opacity: actionId === item._id ? 0.7 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{
                            width: 12,
                            height: 12,
                            marginTop: 6,
                            borderRadius: 999,
                            background: unread ? 'linear-gradient(135deg, #06b6d4, #10b981)' : t.dotRead,
                            boxShadow: unread ? '0 0 0 4px rgba(6,182,212,0.08)' : 'none',
                            flexShrink: 0,
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                              <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: t.itemTitle }}>{item.title}</h4>
                              <span style={{ color: t.itemTime, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                {formatNotificationTime(item.created_at)}
                              </span>
                            </div>
                            <p style={{ margin: '8px 0 10px', color: t.itemBody, fontSize: '0.84rem', lineHeight: 1.55 }}>
                              {item.body}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: 999,
                                background: item.category === 'security' ? 'rgba(239,68,68,0.12)' : item.category === 'profile' ? 'rgba(139,92,246,0.12)' : 'rgba(6,182,212,0.12)',
                                color: item.category === 'security' ? t.catSecurity : item.category === 'profile' ? t.catProfile : t.catDefault,
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                textTransform: 'capitalize',
                              }}>
                                {item.category || 'system'}
                              </span>
                              {item.action_url ? (
                                <span style={{ color: t.actionLink, fontSize: '0.72rem', fontWeight: 700 }}>
                                  Open related page
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Topbar({ title, onToggleSidebar, isMobile, isSidebarCollapsed }) {
  const { user, logout, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [notificationRefreshing, setNotificationRefreshing] = useState(false);
  const [notificationActionId, setNotificationActionId] = useState('');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const profileRef = useRef(null);

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!user) return;
    if (!silent) setNotificationLoading(true);
    setNotificationError('');

    try {
      const response = await api.get('/notifications', { params: { limit: 20 } });
      setNotificationItems(Array.isArray(response.data?.items) ? response.data.items : []);
      setNotificationUnreadCount(Number(response.data?.unread_count || 0));
    } catch (err) {
      setNotificationError(err.response?.data?.error || 'Failed to load notifications');
      setNotificationItems([]);
      setNotificationUnreadCount(0);
    } finally {
      if (!silent) setNotificationLoading(false);
    }
  }, [user]);

  const markNotificationRead = useCallback(async (notification) => {
    if (!notification?._id || notificationActionId) return;
    setNotificationActionId(notification._id);
    try {
      await api.post(`/notifications/${notification._id}/read`);
      setNotificationItems((prev) => prev.map((item) => (
        item._id === notification._id ? { ...item, is_read: true } : item
      )));
      setNotificationUnreadCount((prev) => Math.max(0, prev - (notification.is_read ? 0 : 1)));

      if (notification.action_url) {
        setNotificationOpen(false);
        navigate(notification.action_url);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to open notification');
    } finally {
      setNotificationActionId('');
    }
  }, [navigate, notificationActionId]);

  const markAllNotificationsRead = useCallback(async () => {
    if (notificationRefreshing) return;
    setNotificationRefreshing(true);
    try {
      const response = await api.post('/notifications/read-all');
      setNotificationItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setNotificationUnreadCount(0);
      if (typeof response.data?.updated_count === 'number' && response.data.updated_count > 0) {
        toast.success('Inbox cleared');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to mark notifications read');
    } finally {
      setNotificationRefreshing(false);
    }
  }, [notificationRefreshing]);

  const menuItems = useMemo(
    () => [
      {
        key: 'profile',
        label: 'My Profile',
        icon: HiOutlineUserCircle,
        onClick: () => {
          setProfileModalOpen(true);
          setDropdownOpen(false);
        },
      },
      {
        key: 'change-password',
        label: 'Change Password',
        icon: HiOutlineKey,
        onClick: () => {
          setChangePasswordModalOpen(true);
          setDropdownOpen(false);
        },
      },
      {
        key: 'logout',
        label: 'Logout',
        icon: HiOutlineLogout,
        onClick: async () => {
          setDropdownOpen(false);
          await logout();
          navigate('/login', { replace: true });
        },
      },
    ],
    [logout, navigate]
  );

  useEffect(() => {
    loadNotifications({ silent: true });
  }, [loadNotifications]);

  useEffect(() => {
    if (notificationOpen) {
      loadNotifications();
    }
  }, [notificationOpen, loadNotifications]);

  useEffect(() => {
    const onDocClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    const onEscape = (event) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
        setProfileModalOpen(false);
        setChangePasswordModalOpen(false);
        setNotificationOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  return (
    <>
      <header style={{
        height: 64,
        background: 'var(--topbar-bg)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-glass)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '0 14px' : '0 32px',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onToggleSidebar}
            aria-label={isMobile ? 'Toggle navigation menu' : (isSidebarCollapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation')}
            title={isMobile ? 'Open menu' : (isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar')}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--bg-glass)',
              border: '1px solid var(--border-glass)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            {isMobile ? <HiOutlineMenuAlt2 size={18} /> : (isSidebarCollapsed ? <HiOutlineChevronDoubleRight size={18} /> : <HiOutlineChevronDoubleLeft size={18} />)}
          </button>
          <h2 style={{ fontSize: isMobile ? '0.95rem' : '1.1rem', fontWeight: 700, maxWidth: isMobile ? 170 : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10 }}>
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-secondary)',
              transition: 'all 0.3s ease',
            }}
            id="theme-toggle"
          >
            {theme === 'dark' ? <HiOutlineSun size={18} /> : <HiOutlineMoon size={18} />}
          </button>

          <button
            type="button"
            aria-label={`View notifications${notificationUnreadCount > 0 ? `, ${notificationUnreadCount} unread` : ''}`}
            onClick={() => setNotificationOpen(true)}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--bg-glass)',
              border: '1px solid var(--border-glass)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              position: 'relative',
              boxShadow: notificationUnreadCount > 0 ? '0 0 0 1px rgba(6,182,212,0.12), 0 0 0 4px rgba(6,182,212,0.08)' : 'none',
            }}>
            <HiOutlineBell size={18} />
            {notificationUnreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: -3,
                right: -3,
                minWidth: 18,
                height: 18,
                padding: '0 5px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, #06b6d4, #10b981)',
                color: '#fff',
                fontSize: '0.65rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--topbar-bg)',
              }}>
                {notificationUnreadCount > 9 ? '9+' : notificationUnreadCount}
              </span>
            )}
          </button>

          <div ref={profileRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                minWidth: 36,
                minHeight: 36,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}
              aria-label="Open profile menu"
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
            >
              <ProfilePicture user={user} size={36} />
              {!isMobile && <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>{user?.name}</span>}
            </button>

            {dropdownOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 44,
                  minWidth: 210,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: 12,
                  boxShadow: '0 16px 32px rgba(0,0,0,0.24)',
                  padding: 8,
                  zIndex: 65,
                }}
              >
                <div style={{ padding: '6px 8px 10px', borderBottom: '1px solid var(--border-glass)', marginBottom: 6 }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>{user?.name || 'User'}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{user?.email || ''}</div>
                </div>
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={item.onClick}
                      role="menuitem"
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        border: 'none',
                        background: 'transparent',
                        color: item.key === 'logout' ? 'var(--accent-rose)' : 'var(--text-primary)',
                        padding: '8px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.83rem',
                        fontWeight: 500,
                      }}
                    >
                      <Icon size={17} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </header>

      <NotificationInboxModal
        isOpen={notificationOpen}
        onClose={() => setNotificationOpen(false)}
        items={notificationItems}
        unreadCount={notificationUnreadCount}
        loading={notificationLoading}
        error={notificationError}
        refreshing={notificationRefreshing}
        actionId={notificationActionId}
        onRefresh={() => loadNotifications()}
        onMarkAllRead={markAllNotificationsRead}
        onOpenNotification={markNotificationRead}
        isDark={theme === 'dark'}
      />

      {profileModalOpen && (
        <ProfileModal
          user={user}
          onClose={() => setProfileModalOpen(false)}
          onUploaded={refreshUser}
        />
      )}

      {changePasswordModalOpen && (
        <ChangePasswordModal
          onClose={() => setChangePasswordModalOpen(false)}
          onForgotPassword={() => {
            setChangePasswordModalOpen(false);
            navigate('/forgot-password');
          }}
        />
      )}
    </>
  );
}
