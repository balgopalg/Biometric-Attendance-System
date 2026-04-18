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
const ManageDepartments = lazy(() => import('./pages/admin/ManageDepartments'));
const ManageDepartmentAdmins = lazy(() => import('./pages/admin/ManageDepartmentAdmins'));
const LecturerDashboard = lazy(() => import('./pages/lecturer/LecturerDashboard'));
const AttendanceSession = lazy(() => import('./pages/lecturer/AttendanceSession'));
const LecturerProgress = lazy(() => import('./pages/lecturer/LecturerProgress'));
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const AttendanceSummary = lazy(() => import('./pages/student/AttendanceSummary'));
const ExamPortal = lazy(() => import('./pages/student/ExamPortal'));
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
  const { user, loading } = useAuth();
  const isAuthenticated = !!user;
  const mustChangePassword = user?.must_change_password;

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><StatePanel variant="loading" title="Loading session" description="Checking access rights." compact /></div>;
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
  const { user, loading } = useAuth();
  const isAuthenticated = !!user;
  const mustChangePassword = user?.must_change_password;

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><StatePanel variant="loading" title="Loading session" description="Checking access rights." compact /></div>;
  }
  
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
          <Routes>
            <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
            <Route path="/change-password" element={<LazyPage><ChangePassword /></LazyPage>} />
            <Route path="/" element={<RootRedirect />} />

            {/* Admin — both super_admin and department_admin */}
            <Route element={<ProtectedRoute allowedRoles={['department_admin']}><LazyPage><DashboardLayout /></LazyPage></ProtectedRoute>}>
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
              {/* Super Admin only routes */}
              <Route path="/admin/departments" element={<LazyPage><ManageDepartments /></LazyPage>} />
              <Route path="/admin/department-admins" element={<LazyPage><ManageDepartmentAdmins /></LazyPage>} />
              {/* <Route path="/admin/leaves" element={<LazyPage><ManageLeaves /></LazyPage>} /> */}
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
              {/* <Route path="/student/leaves" element={<LazyPage><StudentLeaveRequests /></LazyPage>} /> */}
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
