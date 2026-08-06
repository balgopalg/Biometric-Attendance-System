import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const SIDEBAR_EXPANDED = 220;
const SIDEBAR_COLLAPSED = 76;

const getViewportWidth = () => (typeof window !== 'undefined' ? window.innerWidth : 0);

const titleMap = {
  '/admin': 'Admin Dashboard',
  '/admin/departments': 'Manage Departments',
  '/admin/department-admins': 'Manage Dept. Admins',
  '/admin/courses': 'Manage Courses',
  '/admin/papers': 'Manage Papers',
  '/admin/timetable': 'Manage Timetable',
  '/admin/calendar': 'Academic Calendar',
  '/admin/lecturers': 'Manage Lecturers',
  '/admin/students': 'Manage Students',
  '/admin/enrollment': 'Student Enrollment',
  '/admin/exam-eligibility': 'Exam Eligibility',
  '/admin/attendance-matrix': 'Attendance Matrix',
  '/admin/audit': 'Audit Trail',
  '/admin/dead-letter': 'Dead-Letter Jobs',
  // '/admin/leaves': 'Manage Leaves',
  '/lecturer': 'Lecturer Dashboard',
  '/lecturer/timetable': 'My Timetable',
  '/lecturer/session': 'Attendance Session',
  '/lecturer/progress': 'Attendance History',
  '/student': 'Student Dashboard',
  '/student/timetable': 'My Timetable',
  '/student/attendance': 'Attendance Summary',
  '/student/exams': 'Exam Portal',
  // '/student/leaves': 'Leave Requests',
};

export default function DashboardLayout() {
  const { pathname } = useLocation();
  const title = titleMap[pathname] || 'Dashboard';
  const [isMobile, setIsMobile] = useState(() => getViewportWidth() < 1024);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => getViewportWidth() >= 1024);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && isMobile && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobile, isSidebarOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('sidebar-collapsed', isSidebarCollapsed ? '1' : '0');
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }, [isSidebarCollapsed]);

  const toggleSidebar = () => {
    if (isMobile) {
      setIsSidebarOpen((prev) => !prev);
      return;
    }
    setIsSidebarCollapsed((prev) => !prev);
  };

  const closeSidebarOnMobile = () => {
    if (isMobile) setIsSidebarOpen(false);
  };

  const contentMarginLeft = isMobile ? 0 : (isSidebarCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        isMobile={isMobile}
        isOpen={isSidebarOpen}
        onNavigate={closeSidebarOnMobile}
      />
      <div style={{ flex: 1, minWidth: 0, marginLeft: contentMarginLeft, display: 'flex', flexDirection: 'column', transition: 'margin-left 320ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
        <Topbar
          title={title}
          onToggleSidebar={toggleSidebar}
          isMobile={isMobile}
          isSidebarCollapsed={isSidebarCollapsed}
        />
        <main id="main-content" tabIndex={-1} style={{ flex: 1, minWidth: 0, padding: isMobile ? 14 : 28, overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>
      {isMobile && (
        <button
          aria-label="Close navigation menu"
          onClick={closeSidebarOnMobile}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 45,
            opacity: isSidebarOpen ? 1 : 0,
            pointerEvents: isSidebarOpen ? 'auto' : 'none',
            transition: 'opacity 260ms ease',
            border: 'none',
            padding: 0,
          }}
        />
      )}
    </div>
  );
}
