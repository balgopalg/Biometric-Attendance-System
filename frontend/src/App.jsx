import { createContext, useContext, useState, useEffect, Suspense, lazy } from 'react';
import { AnimatePresence } from 'framer-motion';
import SplashScreen from './components/ui/SplashScreen';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { ThemeProvider } from './context/ThemeContext';
import { Toaster } from 'react-hot-toast';
import StatePanel from './components/ui/StatePanel';

const LoadContext = createContext(null);

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

function PageMountNotifier({ children, onMount }) {
  useEffect(() => {
    if (onMount) onMount();
  }, [onMount]);
  return children;
}

function LazyPage({ children, onMount }) {
  const loadCtx = useContext(LoadContext);
  const mountCallback = onMount || (loadCtx ? loadCtx.handleFirstLoad : null);

  return (
    <Suspense fallback={<PageFallback />}>
      <PageMountNotifier onMount={mountCallback}>
        {children}
      </PageMountNotifier>
    </Suspense>
  );
}

function GlobalAppLoader({ children }) {
  const { loading } = useAuth();
  const loadCtx = useContext(LoadContext);
  const [minTimeDone, setMinTimeDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeDone(true);
    }, 2400); // Enforce 2.4s minimum splash time for rich animation
    return () => clearTimeout(timer);
  }, []);
  
  const isReady = !loading && loadCtx?.firstLoadDone && minTimeDone;

  return (
    <>
      <AnimatePresence>
        {!isReady && <SplashScreen key="splash" />}
      </AnimatePresence>
      <div style={{ 
        opacity: isReady ? 1 : 0, 
        transition: 'opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1)', 
        pointerEvents: isReady ? 'auto' : 'none', 
        minHeight: '100vh',
        visibility: isReady ? 'visible' : 'hidden'
      }}>
        {children}
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
 */
function expandRoles(allowedRoles) {
  const roles = new Set(allowedRoles || []);

  // Strict 4-tier hierarchy: super_admin > department_admin > lecturer > student
  // If a route allows 'student', everyone can access it (already covered by generic auth in most cases)
  
  if (roles.has('student')) {
    roles.add('lecturer');
    roles.add('department_admin');
    roles.add('super_admin');
  }

  if (roles.has('lecturer')) {
    roles.add('department_admin');
    roles.add('super_admin');
  }

  if (roles.has('department_admin')) {
    roles.add('super_admin');
  }

  return roles;
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  const isAuthenticated = !!user;
  const mustChangePassword = user?.must_change_password;

  if (loading) return null;

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;

  if (allowedRoles) {
    const effective = expandRoles(allowedRoles);
    const userRole = user?.role === 'admin' ? 'super_admin' : user?.role;
    if (!effective.has(userRole)) {
      return <Navigate to={roleHomePath(user?.role)} replace />;
    }
  }
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  const isAuthenticated = !!user;
  const mustChangePassword = user?.must_change_password;
  
  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }
  
  return <Navigate to={roleHomePath(user?.role)} replace />;
}

export default function App() {
  const [firstLoadDone, setFirstLoadDone] = useState(false);

  const handleFirstLoad = () => {
    if (!firstLoadDone) setFirstLoadDone(true);
  };

  return (
    <BrowserRouter>
      <ThemeProvider>
        <Toaster
          position="top-right"
          reverseOrder={false}
          gutter={10}
          containerStyle={{ zIndex: 2147483000, top: 16, right: 16 }}
          toastOptions={{
            duration: 3200,
            removeDelay: 220,
            style: {
              background: 'rgba(15, 23, 42, 0.96)',
              color: '#f8fafc',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              boxShadow: '0 12px 28px rgba(0,0,0,0.28)',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: '#ecfdf5' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#fef2f2' },
            },
          }}
        />
        <AuthProvider>
          <LoadContext.Provider value={{ firstLoadDone, handleFirstLoad }}>
            <GlobalAppLoader>
              <Routes>
                <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
                <Route path="/change-password" element={<LazyPage><ChangePassword /></LazyPage>} />
                <Route path="/forgot-password" element={<LazyPage><ForgotPassword /></LazyPage>} />
                <Route path="/" element={<RootRedirect />} />

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
                  <Route path="/admin/departments" element={<LazyPage><ManageDepartments /></LazyPage>} />
                  <Route path="/admin/department-admins" element={<LazyPage><ManageDepartmentAdmins /></LazyPage>} />
                </Route>

                <Route element={<ProtectedRoute allowedRoles={['lecturer']}><LazyPage><DashboardLayout /></LazyPage></ProtectedRoute>}>
                  <Route path="/lecturer" element={<LazyPage><LecturerDashboard /></LazyPage>} />
                  <Route path="/lecturer/session" element={<LazyPage><AttendanceSession /></LazyPage>} />
                  <Route path="/lecturer/progress" element={<LazyPage><LecturerProgress /></LazyPage>} />
                  <Route path="/lecturer/timetable" element={<LazyPage><LecturerTimetable /></LazyPage>} />
                </Route>

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
          </LoadContext.Provider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
