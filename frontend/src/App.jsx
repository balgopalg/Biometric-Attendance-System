import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { ThemeProvider } from './context/ThemeContext';
import StatePanel from './components/ui/StatePanel';

const DashboardLayout = lazy(() => import('./components/layout/DashboardLayout'));
const Login = lazy(() => import('./pages/Login'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const ManageCourses = lazy(() => import('./pages/admin/ManageCourses'));
const ManagePapers = lazy(() => import('./pages/admin/ManagePapers'));
const ManageLecturers = lazy(() => import('./pages/admin/ManageLecturers'));
const ManageStudents = lazy(() => import('./pages/admin/ManageStudents'));
const StudentEnrollment = lazy(() => import('./pages/admin/StudentEnrollment'));
const ExamEligibility = lazy(() => import('./pages/admin/ExamEligibility'));
const AttendanceMatrix = lazy(() => import('./pages/admin/AttendanceMatrix'));
const AuditTrail = lazy(() => import('./pages/admin/AuditTrail'));
const DeadLetterJobs = lazy(() => import('./pages/admin/DeadLetterJobs'));
const LecturerDashboard = lazy(() => import('./pages/lecturer/LecturerDashboard'));
const AttendanceSession = lazy(() => import('./pages/lecturer/AttendanceSession'));
const LecturerProgress = lazy(() => import('./pages/lecturer/LecturerProgress'));
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const AttendanceSummary = lazy(() => import('./pages/student/AttendanceSummary'));
const ExamPortal = lazy(() => import('./pages/student/ExamPortal'));

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

function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user, loading, mustChangePassword } = useAuth();
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><StatePanel variant="loading" title="Loading session" description="Checking access rights." compact /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    const dest = user?.role === 'admin' ? '/admin' : user?.role === 'lecturer' ? '/lecturer' : '/student';
    return <Navigate to={dest} replace />;
  }
  return children;
}

function RootRedirect() {
  const { isAuthenticated, user, mustChangePassword } = useAuth();
  
  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  // Redirect to password change if required
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }
  
  // Redirect to role-based dashboard
  const dest = user?.role === 'admin' ? '/admin' : user?.role === 'lecturer' ? '/lecturer' : '/student';
  return <Navigate to={dest} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
            <Route path="/change-password" element={<LazyPage><ChangePassword /></LazyPage>} />
            <Route path="/" element={<RootRedirect />} />

            {/* Admin */}
            <Route element={<ProtectedRoute allowedRoles={['admin']}><LazyPage><DashboardLayout /></LazyPage></ProtectedRoute>}>
              <Route path="/admin" element={<LazyPage><AdminDashboard /></LazyPage>} />
              <Route path="/admin/courses" element={<LazyPage><ManageCourses /></LazyPage>} />
              <Route path="/admin/papers" element={<LazyPage><ManagePapers /></LazyPage>} />
              <Route path="/admin/lecturers" element={<LazyPage><ManageLecturers /></LazyPage>} />
              <Route path="/admin/students" element={<LazyPage><ManageStudents /></LazyPage>} />
              <Route path="/admin/enrollment" element={<LazyPage><StudentEnrollment /></LazyPage>} />
              <Route path="/admin/exam-eligibility" element={<LazyPage><ExamEligibility /></LazyPage>} />
              <Route path="/admin/attendance-matrix" element={<LazyPage><AttendanceMatrix /></LazyPage>} />
              <Route path="/admin/audit" element={<LazyPage><AuditTrail /></LazyPage>} />
              <Route path="/admin/dead-letter" element={<LazyPage><DeadLetterJobs /></LazyPage>} />
            </Route>

            {/* Lecturer */}
            <Route element={<ProtectedRoute allowedRoles={['lecturer']}><LazyPage><DashboardLayout /></LazyPage></ProtectedRoute>}>
              <Route path="/lecturer" element={<LazyPage><LecturerDashboard /></LazyPage>} />
              <Route path="/lecturer/session" element={<LazyPage><AttendanceSession /></LazyPage>} />
              <Route path="/lecturer/progress" element={<LazyPage><LecturerProgress /></LazyPage>} />
            </Route>

            {/* Student */}
            <Route element={<ProtectedRoute allowedRoles={['student']}><LazyPage><DashboardLayout /></LazyPage></ProtectedRoute>}>
              <Route path="/student" element={<LazyPage><StudentDashboard /></LazyPage>} />
              <Route path="/student/attendance" element={<LazyPage><AttendanceSummary /></LazyPage>} />
              <Route path="/student/exams" element={<LazyPage><ExamPortal /></LazyPage>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
