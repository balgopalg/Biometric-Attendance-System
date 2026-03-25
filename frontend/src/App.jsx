import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import DashboardLayout from './components/layout/DashboardLayout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import AdminDashboard from './pages/admin/AdminDashboard';
import ManageCourses from './pages/admin/ManageCourses';
import ManagePapers from './pages/admin/ManagePapers';
import ManageLecturers from './pages/admin/ManageLecturers';
import ManageStudents from './pages/admin/ManageStudents';
import StudentEnrollment from './pages/admin/StudentEnrollment';
import AuditTrail from './pages/admin/AuditTrail';
import LecturerDashboard from './pages/lecturer/LecturerDashboard';
import AttendanceSession from './pages/lecturer/AttendanceSession';
import LecturerProgress from './pages/lecturer/LecturerProgress';
import StudentDashboard from './pages/student/StudentDashboard';
import AttendanceSummary from './pages/student/AttendanceSummary';
import ExamPortal from './pages/student/ExamPortal';
import Spinner from './components/ui/Spinner';

function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user, loading, mustChangePassword } = useAuth();
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spinner size={36} /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    const dest = user?.role === 'admin' ? '/admin' : user?.role === 'lecturer' ? '/lecturer' : '/student';
    return <Navigate to={dest} replace />;
  }
  return children;
}

function RootRedirect() {
  const { isAuthenticated, user, loading, mustChangePassword } = useAuth();
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spinner size={36} /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  const dest = user?.role === 'admin' ? '/admin' : user?.role === 'lecturer' ? '/lecturer' : '/student';
  return <Navigate to={dest} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/" element={<RootRedirect />} />

            {/* Admin */}
            <Route element={<ProtectedRoute allowedRoles={['admin']}><DashboardLayout /></ProtectedRoute>}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/courses" element={<ManageCourses />} />
              <Route path="/admin/papers" element={<ManagePapers />} />
              <Route path="/admin/lecturers" element={<ManageLecturers />} />
              <Route path="/admin/students" element={<ManageStudents />} />
              <Route path="/admin/enrollment" element={<StudentEnrollment />} />
              <Route path="/admin/audit" element={<AuditTrail />} />
            </Route>

            {/* Lecturer */}
            <Route element={<ProtectedRoute allowedRoles={['lecturer']}><DashboardLayout /></ProtectedRoute>}>
              <Route path="/lecturer" element={<LecturerDashboard />} />
              <Route path="/lecturer/session" element={<AttendanceSession />} />
              <Route path="/lecturer/progress" element={<LecturerProgress />} />
            </Route>

            {/* Student */}
            <Route element={<ProtectedRoute allowedRoles={['student']}><DashboardLayout /></ProtectedRoute>}>
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/student/attendance" element={<AttendanceSummary />} />
              <Route path="/student/exams" element={<ExamPortal />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
