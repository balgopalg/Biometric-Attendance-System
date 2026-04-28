import { Suspense, lazy, useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import SplashScreen from './components/ui/SplashScreen';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { ThemeProvider } from './context/ThemeContext';
import StatePanel from './components/ui/StatePanel';

const DashboardLayout = lazy(() => import('./components/layout/DashboardLayout'));
const Login = lazy(() => import('./pages/Login'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const ManageCourses = lazy(() => import('./pages/admin/ManageCourses'));
const ManagePapers = lazy(() => import('./pages/admin/ManagePapers'));
const ManageLecturers = lazy(() => import('./pages/admin/ManageLecturers'));
const ManageStudents = lazy(() => import('./pages/admin/ManageStudents'));
const ManageTimetable = lazy(() => import('./pages/admin/ManageTimetable'));
const ManageCalendar = lazy(() => import('./pages/admin/ManageCalendar'));
const StudentEnrollment = lazy(() => import('./pages/admin/StudentEnrollment'));
const ExamEligibility = lazy(() => import('./pages/admin/ExamEligibility'));
const AttendanceMatrix = lazy(() => import('./pages/admin/AttendanceMatrix'));
const AuditTrail = lazy(() => import('./pages/admin/AuditTrail'));
const DeadLetterJobs = lazy(() => import('./pages/admin/DeadLetterJobs'));
const ManageDepartments = lazy(() => import('./pages/admin/ManageDepartments'));
const ManageDepartmentAdmins = lazy(() => import('./pages/admin/ManageDepartmentAdmins'));
const LecturerDashboard = lazy(() => import('./pages/lecturer/LecturerDashboard'));
const AttendanceSession = lazy(() => import('./pages/lecturer/AttendanceSession'));
const LecturerProgress = lazy(() => import('./pages/lecturer/LecturerProgress'));
const LecturerTimetable = lazy(() => import('./pages/lecturer/LecturerTimetable'));
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const AttendanceSummary = lazy(() => import('./pages/student/AttendanceSummary'));
const ExamPortal = lazy(() => import('./pages/student/ExamPortal'));
const StudentTimetable = lazy(() => import('./pages/student/StudentTimetable'));
const StudentLeaveRequests = lazy(() => import('./pages/student/StudentLeaveRequests'));
const ManageLeaves = lazy(() => import('./pages/admin/ManageLeaves'));

function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
      <StatePanel variant="loading" title="Loading screen" description="Preparing your workspace." compact />
    </div>
  );
}

function LazyPage({ children }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

function GlobalAppLoader({ children }) {
  const { loading } = useAuth();
  const [minDelayPassed, setMinDelayPassed] = useState(false);

  useEffect(() => {
    // Keep splash on screen for a minimum duration to allow animation to complete
    const timer = setTimeout(() => {
      setMinDelayPassed(true);
    }, 2200);
    return () => clearTimeout(timer);
  }, []);

  const isReady = !loading && minDelayPassed;

  return (
    <>
      <AnimatePresence>
        {!isReady && <SplashScreen key="splash" />}
      </AnimatePresence>
      <div style={{ opacity: isReady ? 1 : 0, transition: 'opacity 0.6s ease', pointerEvents: isReady ? 'auto' : 'none', minHeight: '100vh' }}>
        {isReady && children}
      </div>
    </>
  );
}

/**
 * Determine the home path for a given role.
 */
function roleHomePath(role) {
  if (role === 'super_admin' || role === 'department_admin' || role === 'admin') return '/admin';
  if (role === 'lecturer') return '/lecturer';
  return '/student';
}

/**
 * Expand allowedRoles to include inherited roles.
 * If "department_admin" is allowed → "super_admin" is also allowed.
 * Legacy "admin" alias is transparently handled.
 */
function expandRoles(allowedRoles) {
  const roles = new Set(allowedRoles || []);

  // Legacy compat: treat "admin" as "department_admin"
  if (roles.has('admin')) {
    roles.delete('admin');
    roles.add('department_admin');
  }

  // Role inheritance: super_admin inherits all admin-level access
  if (roles.has('department_admin')) {
    roles.add('super_admin');
  }

  return roles;
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const mustChangePassword = user?.must_change_password;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;

  if (allowedRoles) {
    const effective = expandRoles(allowedRoles);
    // Normalize legacy "admin" → "super_admin" for cached session data
    const userRole = user?.role === 'admin' ? 'super_admin' : user?.role;
    if (!effective.has(userRole)) {
      return <Navigate to={roleHomePath(user?.role)} replace />;
    }
  }
  return children;
}

function RootRedirect() {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const mustChangePassword = user?.must_change_password;
  
  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  // Redirect to password change if required
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }
  
  // Redirect to role-based dashboard
  return <Navigate to={roleHomePath(user?.role)} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <GlobalAppLoader>
            <Routes>
              <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
              <Route path="/change-password" element={<LazyPage><ChangePassword /></LazyPage>} />
              <Route path="/forgot-password" element={<LazyPage><ForgotPassword /></LazyPage>} />
              <Route path="/" element={<RootRedirect />} />

              {/* Admin — both super_admin and department_admin */}
              <Route element={<ProtectedRoute allowedRoles={['department_admin']}><LazyPage><DashboardLayout /></LazyPage></ProtectedRoute>}>
                <Route path="/admin" element={<LazyPage><AdminDashboard /></LazyPage>} />
                <Route path="/admin/courses" element={<LazyPage><ManageCourses /></LazyPage>} />
                <Route path="/admin/papers" element={<LazyPage><ManagePapers /></LazyPage>} />
                <Route path="/admin/timetable" element={<LazyPage><ManageTimetable /></LazyPage>} />
                <Route path="/admin/calendar" element={<LazyPage><ManageCalendar /></LazyPage>} />
                <Route path="/admin/lecturers" element={<LazyPage><ManageLecturers /></LazyPage>} />
                <Route path="/admin/students" element={<LazyPage><ManageStudents /></LazyPage>} />
                <Route path="/admin/enrollment" element={<LazyPage><StudentEnrollment /></LazyPage>} />
                <Route path="/admin/exam-eligibility" element={<LazyPage><ExamEligibility /></LazyPage>} />
                <Route path="/admin/attendance-matrix" element={<LazyPage><AttendanceMatrix /></LazyPage>} />
                <Route path="/admin/audit" element={<LazyPage><AuditTrail /></LazyPage>} />
                <Route path="/admin/dead-letter" element={<LazyPage><DeadLetterJobs /></LazyPage>} />
                <Route path="/admin/leaves" element={<LazyPage><ManageLeaves /></LazyPage>} />
                {/* Super Admin only routes */}
                <Route path="/admin/departments" element={<LazyPage><ManageDepartments /></LazyPage>} />
                <Route path="/admin/department-admins" element={<LazyPage><ManageDepartmentAdmins /></LazyPage>} />
              </Route>

              {/* Lecturer */}
              <Route element={<ProtectedRoute allowedRoles={['lecturer']}><LazyPage><DashboardLayout /></LazyPage></ProtectedRoute>}>
                <Route path="/lecturer" element={<LazyPage><LecturerDashboard /></LazyPage>} />
                <Route path="/lecturer/session" element={<LazyPage><AttendanceSession /></LazyPage>} />
                <Route path="/lecturer/progress" element={<LazyPage><LecturerProgress /></LazyPage>} />
                <Route path="/lecturer/timetable" element={<LazyPage><LecturerTimetable /></LazyPage>} />
              </Route>

              {/* Student */}
              <Route element={<ProtectedRoute allowedRoles={['student']}><LazyPage><DashboardLayout /></LazyPage></ProtectedRoute>}>
                <Route path="/student" element={<LazyPage><StudentDashboard /></LazyPage>} />
                <Route path="/student/attendance" element={<LazyPage><AttendanceSummary /></LazyPage>} />
                <Route path="/student/exams" element={<LazyPage><ExamPortal /></LazyPage>} />
                <Route path="/student/timetable" element={<LazyPage><StudentTimetable /></LazyPage>} />
                <Route path="/student/leaves" element={<LazyPage><StudentLeaveRequests /></LazyPage>} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </GlobalAppLoader>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
