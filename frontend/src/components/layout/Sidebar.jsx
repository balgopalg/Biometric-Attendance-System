import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  HiOutlineAcademicCap, HiOutlineUsers, HiOutlineBookOpen,
  HiOutlineClipboardList, HiOutlineShieldCheck, HiOutlineLogout,
  HiOutlineHome, HiOutlineCamera, HiOutlineChartBar, HiOutlineDocumentText,
} from 'react-icons/hi';

const navMap = {
  admin: [
    { to: '/admin', icon: HiOutlineHome, label: 'Dashboard' },
    { to: '/admin/students', icon: HiOutlineClipboardList, label: 'Students' },
    { to: '/admin/lecturers', icon: HiOutlineUsers, label: 'Lecturers' },
    { to: '/admin/courses', icon: HiOutlineAcademicCap, label: 'Courses' },
    { to: '/admin/papers', icon: HiOutlineBookOpen, label: 'Papers' },
    { to: '/admin/enrollment', icon: HiOutlineCamera, label: 'Enrollment' },
    { to: '/admin/audit', icon: HiOutlineShieldCheck, label: 'Audit Log' },
  ],
  lecturer: [
    { to: '/lecturer', icon: HiOutlineHome, label: 'Dashboard' },
    { to: '/lecturer/session', icon: HiOutlineCamera, label: 'Take Attendance' },
    { to: '/lecturer/progress', icon: HiOutlineChartBar, label: 'My Progress' },
  ],
  student: [
    { to: '/student', icon: HiOutlineHome, label: 'Dashboard' },
    { to: '/student/attendance', icon: HiOutlineChartBar, label: 'Attendance' },
    { to: '/student/exams', icon: HiOutlineDocumentText, label: 'Exam Portal' },
  ],
};

export default function Sidebar({ isCollapsed = false, isMobile = false, isOpen = true, onNavigate = () => {} }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role || 'student';
  const links = navMap[role] || [];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  return (
    <aside
      style={{
        width: isCollapsed ? 76 : 220,
        minHeight: '100vh',
        background: 'var(--sidebar-bg)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 50,
        overflow: 'hidden',
        transform: isMobile ? (isOpen ? 'translateX(0)' : 'translateX(-100%)') : 'translateX(0)',
        transition: 'width 0.2s ease, transform 0.2s ease',
      }}
    >
      {/* Logo */}
      <div style={{ padding: isCollapsed ? '20px 12px 0' : '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        {!isCollapsed && <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff', letterSpacing: '-0.01em' }}>BioAttend</span>}
      </div>

      {/* User Profile */}
      <div style={{ padding: isCollapsed ? '20px 12px 16px' : '20px 20px 16px', borderBottom: '1px solid var(--sidebar-divider)', textAlign: isCollapsed ? 'center' : 'left' }}>
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
        {!isCollapsed && (
          <>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{user?.name || 'User'}</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--sidebar-text-muted)', marginTop: 2 }}>
              {user?.email || ''}
            </p>
            <span style={{
              display: 'inline-block', marginTop: 6,
              fontSize: '0.65rem', fontWeight: 600,
              padding: '2px 10px', borderRadius: 999,
              background: 'rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.9)',
              textTransform: 'capitalize',
            }}>
              {role}
            </span>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 10px', overflowY: 'auto' }}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === `/${role}`}
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
              transition: 'all 0.2s',
            })}
          >
            <link.icon size={18} style={{ opacity: 0.9, flexShrink: 0 }} />
            {!isCollapsed && link.label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div style={{ padding: '12px 10px 16px', borderTop: '1px solid var(--sidebar-divider)' }}>
        <button
          onClick={handleLogout}
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
          {!isCollapsed && 'Log out'}
        </button>
      </div>
    </aside>
  );
}
