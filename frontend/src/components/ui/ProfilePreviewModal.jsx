import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiX, HiOutlineUser, HiOutlineMail, HiOutlinePhone, HiOutlineAcademicCap, HiOutlineBadgeCheck, HiOutlineExclamation } from 'react-icons/hi';

/**
 * ProfilePreviewModal — rich profile card displayed when an avatar is clicked.
 *
 * Props
 * ──────
 * isOpen       boolean
 * onClose      () => void
 * imageSrc     string | null   — profile picture URL
 * name         string
 * role         'student' | 'lecturer'
 * hasFace      boolean
 * email        string
 * phone        string | null
 * regNumber    string | null   — student reg no
 * department   string | null   — lecturer dept
 * course       string | null   — student course
 * semester     string | null   — student semester
 * session      string | null   — student academic session
 * paperCount   number | null   — lecturer paper count
 */
export default function ProfilePreviewModal({
  isOpen,
  onClose,
  imageSrc,
  name = '',
  role = 'student',
  hasFace = false,
  email = '',
  phone = null,
  regNumber = null,
  department = null,
  course = null,
  semester = null,
  session = null,
  paperCount = null,
}) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const initials = name.trim()
    ? name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?';

  const gradients = {
    student: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
    lecturer: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  };
  const accentColor = role === 'student' ? 'var(--accent-cyan, #06b6d4)' : 'var(--accent-amber, #f59e0b)';

  const rows = [
    email && { icon: <HiOutlineMail size={14} />, label: 'Email', value: email },
    phone && { icon: <HiOutlinePhone size={14} />, label: 'Phone', value: phone },
    regNumber && { icon: <HiOutlineAcademicCap size={14} />, label: 'Reg No', value: regNumber },
    course && { icon: <HiOutlineAcademicCap size={14} />, label: 'Course', value: course },
    semester && { icon: null, label: 'Semester', value: semester },
    session && { icon: null, label: 'Session', value: session },
    department && { icon: <HiOutlineUser size={14} />, label: 'Department', value: department },
    paperCount != null && { icon: null, label: 'Papers', value: `${paperCount} assigned` },
  ].filter(Boolean);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(2, 6, 23, 0.72)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 20 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 420,
              borderRadius: 24,
              overflow: 'hidden',
              background: 'var(--bg-secondary, #0f172a)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
            }}
          >
            {/* Header gradient strip */}
            <div style={{
              height: 120,
              background: gradients[role],
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Decorative circles */}
              <div style={{
                position: 'absolute', top: -30, right: -30,
                width: 140, height: 140, borderRadius: '50%',
                background: 'rgba(255,255,255,0.08)',
              }} />
              <div style={{
                position: 'absolute', bottom: -50, left: -20,
                width: 160, height: 160, borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
              }} />
            </div>

            {/* Avatar — overlapping the gradient */}
            <div style={{
              position: 'absolute',
              top: 68, left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 2,
            }}>
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={name}
                  style={{
                    width: 100, height: 100, borderRadius: '50%',
                    objectFit: 'cover',
                    border: '4px solid var(--bg-secondary, #0f172a)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                />
              ) : (
                <div style={{
                  width: 100, height: 100, borderRadius: '50%',
                  background: gradients[role],
                  border: '4px solid var(--bg-secondary, #0f172a)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2rem', fontWeight: 800, color: '#fff',
                }}>
                  {initials}
                </div>
              )}
              {/* Face status badge on avatar */}
              <div style={{
                position: 'absolute', bottom: 4, right: 4,
                width: 22, height: 22, borderRadius: '50%',
                background: hasFace ? '#10b981' : '#f59e0b',
                border: '2px solid var(--bg-secondary, #0f172a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                title: hasFace ? 'Face enrolled' : 'No face enrolled',
              }}>
                {hasFace
                  ? <HiOutlineBadgeCheck size={12} color="#fff" />
                  : <HiOutlineExclamation size={12} color="#fff" />
                }
              </div>
            </div>

            {/* Body */}
            <div style={{ paddingTop: 70, paddingBottom: 28, paddingLeft: 28, paddingRight: 28 }}>
              {/* Name + role + face badge */}
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <h2 style={{
                  fontSize: '1.25rem', fontWeight: 800,
                  color: 'var(--text-primary, #f8fafc)',
                  marginBottom: 6, lineHeight: 1.2,
                }}>
                  {name || 'Unknown'}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span style={{
                    padding: '3px 12px', borderRadius: 99, fontSize: '0.68rem',
                    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                    background: `${accentColor}22`,
                    color: accentColor,
                    border: `1px solid ${accentColor}44`,
                  }}>
                    {role === 'student' ? 'Student' : 'Lecturer'}
                  </span>
                  <span style={{
                    padding: '3px 10px', borderRadius: 99, fontSize: '0.68rem',
                    fontWeight: 700,
                    background: hasFace ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                    color: hasFace ? '#10b981' : '#f59e0b',
                    border: `1px solid ${hasFace ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  }}>
                    {hasFace ? '● Face Ready' : '○ No Face'}
                  </span>
                </div>
              </div>

              {/* Info rows */}
              {rows.length > 0 && (
                <div style={{
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  overflow: 'hidden',
                }}>
                  {rows.map((row, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        padding: '10px 16px',
                        borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      }}
                    >
                      {row.icon && (
                        <span style={{ color: accentColor, marginTop: 1, flexShrink: 0 }}>
                          {row.icon}
                        </span>
                      )}
                      {!row.icon && <span style={{ width: 14, flexShrink: 0 }} />}
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 600,
                        color: 'var(--text-muted, #64748b)',
                        minWidth: 72, flexShrink: 0,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                        paddingTop: 1,
                      }}>
                        {row.label}
                      </span>
                      <span style={{
                        fontSize: '0.82rem', fontWeight: 500,
                        color: 'var(--text-primary, #f8fafc)',
                        wordBreak: 'break-all',
                      }}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                position: 'absolute', top: 14, right: 14,
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(0,0,0,0.35)',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 10,
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.6)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.35)'}
            >
              <HiX size={17} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
