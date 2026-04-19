import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  HiOutlineAcademicCap, HiOutlineUsers, HiOutlineBookOpen,
  HiOutlineClipboardList, HiOutlineShieldCheck, HiOutlineLogout,
  HiOutlineHome, HiOutlineCamera, HiOutlineChartBar, HiOutlineDocumentText, HiOutlineCheckCircle, HiOutlineExclamationCircle,
  HiOutlineOfficeBuilding, HiOutlineUserGroup,
} from 'react-icons/hi';

const navMap = {
  super_admin: [
    { to: '/admin', icon: HiOutlineHome, label: 'Dashboard' },
    { to: '/admin/departments', icon: HiOutlineOfficeBuilding, label: 'Departments' },
    { to: '/admin/department-admins', icon: HiOutlineUserGroup, label: 'Dept. Admins' },
    { to: '/admin/students', icon: HiOutlineUsers, label: 'Students' },
    { to: '/admin/lecturers', icon: HiOutlineAcademicCap, label: 'Lecturers' },
    { to: '/admin/courses', icon: HiOutlineBookOpen, label: 'Courses' },
    { to: '/admin/papers', icon: HiOutlineDocumentText, label: 'Papers' },
    { to: '/admin/timetable', icon: HiOutlineClipboardList, label: 'Timetable' },
    { to: '/admin/enrollment', icon: HiOutlineCamera, label: 'Enrollment' },
    { to: '/admin/exam-eligibility', icon: HiOutlineCheckCircle, label: 'Exam Eligibility' },
    { to: '/admin/attendance-matrix', icon: HiOutlineChartBar, label: 'Attendance Matrix' },
    { to: '/admin/audit', icon: HiOutlineClipboardList, label: 'Global Audit Log' },
    { to: '/admin/dead-letter', icon: HiOutlineExclamationCircle, label: 'Dead-Letter Jobs' },
  ],
  department_admin: [
    { to: '/admin', icon: HiOutlineHome, label: 'Dashboard' },
    { to: '/admin/students', icon: HiOutlineUsers, label: 'Students' },
    { to: '/admin/lecturers', icon: HiOutlineAcademicCap, label: 'Lecturers' },
    { to: '/admin/courses', icon: HiOutlineBookOpen, label: 'Courses' },
    { to: '/admin/papers', icon: HiOutlineDocumentText, label: 'Papers' },
    { to: '/admin/timetable', icon: HiOutlineClipboardList, label: 'Timetable' },
    { to: '/admin/enrollment', icon: HiOutlineCamera, label: 'Enrollment' },
    { to: '/admin/exam-eligibility', icon: HiOutlineCheckCircle, label: 'Exam Eligibility' },
    { to: '/admin/attendance-matrix', icon: HiOutlineChartBar, label: 'Attendance Matrix' },
    { to: '/admin/audit', icon: HiOutlineClipboardList, label: 'Audit Log' },
    { to: '/admin/dead-letter', icon: HiOutlineExclamationCircle, label: 'Dead-Letter Jobs' },
  ],
  // Legacy "admin" role fallback — uses same nav as department_admin
  admin: [
    { to: '/admin', icon: HiOutlineHome, label: 'Dashboard' },
    { to: '/admin/students', icon: HiOutlineUsers, label: 'Students' },
    { to: '/admin/lecturers', icon: HiOutlineAcademicCap, label: 'Lecturers' },
    { to: '/admin/courses', icon: HiOutlineBookOpen, label: 'Courses' },
    { to: '/admin/papers', icon: HiOutlineDocumentText, label: 'Papers' },
    { to: '/admin/timetable', icon: HiOutlineClipboardList, label: 'Timetable' },
    { to: '/admin/enrollment', icon: HiOutlineCamera, label: 'Enrollment' },
    { to: '/admin/exam-eligibility', icon: HiOutlineCheckCircle, label: 'Exam Eligibility' },
    { to: '/admin/attendance-matrix', icon: HiOutlineChartBar, label: 'Attendance Matrix' },
    { to: '/admin/audit', icon: HiOutlineClipboardList, label: 'Audit Log' },
    { to: '/admin/dead-letter', icon: HiOutlineExclamationCircle, label: 'Dead-Letter Jobs' },
  ],
  lecturer: [
    { to: '/lecturer', icon: HiOutlineHome, label: 'Dashboard' },
    { to: '/lecturer/timetable', icon: HiOutlineClipboardList, label: 'My Timetable' },
    { to: '/lecturer/session', icon: HiOutlineCamera, label: 'Take Attendance' },
    { to: '/lecturer/progress', icon: HiOutlineChartBar, label: 'Attendance History' },
  ],
  student: [
    { to: '/student', icon: HiOutlineHome, label: 'Dashboard' },
    { to: '/student/timetable', icon: HiOutlineClipboardList, label: 'My Timetable' },
    { to: '/student/attendance', icon: HiOutlineChartBar, label: 'Attendance' },
    { to: '/student/exams', icon: HiOutlineDocumentText, label: 'Exam Portal' },
  ],
};

// Determine the admin-level base path for sidebar "end" matching
function getAdminBasePath(role) {
  if (role === 'super_admin' || role === 'department_admin' || role === 'admin') return '/admin';
  return `/${role}`;
}

export default function Sidebar({ isCollapsed = false, isMobile = false, isOpen = true, onNavigate = () => {} }) {
  const { user, logout, isSuperAdmin, isDepartmentAdmin, departmentName } = useAuth();
  const navigate = useNavigate();
  const role = user?.role || 'student';
  const links = navMap[role] || navMap['student'];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const safeName = typeof user?.name === 'string' ? user.name.trim() : '';
  const initials = safeName
    ? safeName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U';
  const textVisible = isMobile ? true : !isCollapsed;

  // Build role display label
  const roleLabel = (() => {
    if (isSuperAdmin) return 'Super Admin';
    if (isDepartmentAdmin) return 'Dept. Admin';
    return role;
  })();

  return (
    <aside
      aria-label="Primary"
      style={{
        width: isMobile ? 260 : (isCollapsed ? 76 : 220),
        // Use dynamic viewport height on mobile to keep footer actions visible.
        height: isMobile ? '100dvh' : '100vh',
        background: 'var(--sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 50,
        overflow: 'hidden',
        transform: isMobile ? (isOpen ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)',
        transition: 'width 320ms cubic-bezier(0.22, 1, 0.36, 1), transform 300ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 240ms ease',
        boxShadow: isMobile && isOpen ? '0 16px 40px rgba(0,0,0,0.35)' : 'none',
      }}
    >
      {/* Logo */}
      <div style={{ padding: isCollapsed ? '20px 12px 0' : '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'linear-gradient(160deg, rgba(34,211,238,0.34), rgba(14,165,233,0.3))',
          border: '1px solid rgba(255,255,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 18px rgba(14,165,233,0.2)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="10" r="2.8" />
            <path d="M7.5 17c1.2-2 2.8-3 4.5-3s3.3 1 4.5 3" strokeLinecap="round" />
          </svg>
        </div>
        <span
          style={{
            fontWeight: 800,
            fontSize: '1.05rem',
            color: '#fff',
            letterSpacing: '-0.01em',
            opacity: textVisible ? 1 : 0,
            transform: textVisible ? 'translateX(0)' : 'translateX(-6px)',
            maxWidth: textVisible ? 120 : 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            transition: 'opacity 180ms ease, transform 220ms ease, max-width 220ms ease',
          }}
        >
          FaceAttend
        </span>
      </div>

      {/* User Profile */}
      <div style={{ padding: isCollapsed ? '20px 12px 16px' : '20px 20px 16px', borderBottom: '1px solid var(--sidebar-divider)', textAlign: 'center', flexShrink: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '0.9rem', color: '#fff',
          marginBottom: isCollapsed ? 0 : 10,
          marginLeft: 'auto',
          marginRight: 'auto',
          border: '2px solid rgba(255,255,255,0.3)',
        }}>
          {initials}
        </div>
        <div
          style={{
            opacity: textVisible ? 1 : 0,
            transform: textVisible ? 'translateY(0)' : 'translateY(-4px)',
            maxHeight: textVisible ? 120 : 0,
            overflow: 'hidden',
            transition: 'opacity 180ms ease, transform 220ms ease, max-height 240ms ease',
          }}
        >
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{user?.name || 'User'}</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--sidebar-text-muted)', marginTop: 2 }}>
              {user?.email || ''}
            </p>
            <span style={{
              display: 'inline-block', marginTop: 6,
              fontSize: '0.65rem', fontWeight: 600,
              padding: '2px 10px', borderRadius: 999,
              background: isSuperAdmin ? 'rgba(250,204,21,0.25)' : 'rgba(255,255,255,0.15)',
              color: isSuperAdmin ? 'rgba(250,204,21,0.95)' : 'rgba(255,255,255,0.9)',
              textTransform: 'capitalize',
            }}>
              {roleLabel}
            </span>
            {isDepartmentAdmin && departmentName && (
              <p style={{ fontSize: '0.62rem', color: 'var(--sidebar-text-muted)', marginTop: 4 }}>
                {departmentName}
              </p>
            )}
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Sidebar navigation" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 10px', overflowY: 'auto' }}>
        {links.map((link, index) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === getAdminBasePath(role)}
            onClick={onNavigate}
            title={isCollapsed ? link.label : undefined}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              gap: isCollapsed ? 0 : 12,
              padding: isCollapsed ? '9px 10px' : '9px 14px',
              borderRadius: 10,
              fontSize: '0.84rem',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#fff' : 'var(--sidebar-text)',
              background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
              textDecoration: 'none',
              transition: 'all 220ms ease',
            })}
          >
            <link.icon size={18} style={{ opacity: 0.9, flexShrink: 0 }} />
            <span
              style={{
                opacity: textVisible ? 1 : 0,
                transform: textVisible ? 'translateX(0)' : 'translateX(-6px)',
                maxWidth: textVisible ? 140 : 0,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                transition: 'opacity 180ms ease, transform 220ms ease, max-width 220ms ease',
                transitionDelay: textVisible ? `${Math.min(index * 16, 96)}ms` : '0ms',
              }}
            >
              {link.label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div style={{ 
        padding: '12px 10px',
        paddingBottom: isMobile ? 'calc(16px + env(safe-area-inset-bottom))' : '16px',
        borderTop: '1px solid var(--sidebar-divider)',
        flexShrink: 0 
      }}>
        <button
          onClick={handleLogout}
          aria-label="Log out"
          title={isCollapsed ? 'Log out' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: isCollapsed ? 0 : 12,
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            width: '100%', padding: isCollapsed ? '9px 10px' : '9px 14px',
            borderRadius: 10, fontSize: '0.84rem',
            fontWeight: 400, color: 'var(--sidebar-text)',
            background: 'transparent', border: 'none',
            cursor: 'pointer', transition: 'all 0.2s',
            textAlign: 'left',
          }}
        >
          <HiOutlineLogout size={18} style={{ opacity: 0.9 }} />
          <span
            style={{
              opacity: textVisible ? 1 : 0,
              transform: textVisible ? 'translateX(0)' : 'translateX(-6px)',
              maxWidth: textVisible ? 80 : 0,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              transition: 'opacity 180ms ease, transform 220ms ease, max-width 220ms ease',
            }}
          >
            Log out
          </span>
        </button>
      </div>
    </aside>
  );
}
