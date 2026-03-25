import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../context/ThemeContext';
import { HiOutlineBell, HiOutlineSun, HiOutlineMoon, HiOutlineMenuAlt2, HiOutlineChevronDoubleLeft, HiOutlineChevronDoubleRight } from 'react-icons/hi';

export default function Topbar({ title, onToggleSidebar, isMobile, isSidebarCollapsed }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header style={{
      height: 64,
      background: 'var(--topbar-bg)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-glass)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onToggleSidebar}
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
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{title}</h2>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
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
        {/* Notifications */}
        <button style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'var(--text-secondary)',
        }}>
          <HiOutlineBell size={18} />
        </button>
        {/* User avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'var(--gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: '0.8rem', color: '#fff',
          }}>
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{user?.name}</span>
        </div>
      </div>
    </header>
  );
}
