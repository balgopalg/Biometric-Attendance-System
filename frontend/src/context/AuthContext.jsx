import { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const cached = window.sessionStorage.getItem('user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const persistUser = useCallback((u) => {
    setUser(u);
    try {
      if (u) {
        window.sessionStorage.setItem('user', JSON.stringify(u));
      } else {
        window.sessionStorage.removeItem('user');
      }
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  useEffect(() => {
    api
      .get('/auth/me')
      .then((res) => {
        persistUser(res.data);
      })
      .catch(() => {
        persistUser(null);
      })
      .finally(() => setLoading(false));
  }, [persistUser]);

  const login = useCallback(
    async (email, password) => {
      const res = await api.post('/auth/login', { email, password });
      persistUser(res.data.user);
      return res.data;
    },
    [persistUser]
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    persistUser(null);
  }, [persistUser]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      persistUser(res.data);
      return res.data;
    } catch {
      persistUser(null);
      return null;
    }
  }, [persistUser]);

  // ── Role helpers ──────────────────────────────────────────────────────
  // Normalize legacy "admin" → "super_admin" for backward compatibility
  const normalizedRole = user?.role === 'admin' ? 'super_admin' : user?.role;
  const isSuperAdmin = normalizedRole === 'super_admin';
  const isDepartmentAdmin = normalizedRole === 'department_admin';
  const isAnyAdmin = isSuperAdmin || isDepartmentAdmin;
  const isLecturer = normalizedRole === 'lecturer';
  const isStudent = normalizedRole === 'student';
  const departmentId = user?.department_id || null;
  const departmentName = user?.department_name || user?.department || '';

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshUser,
      // Role helpers
      isSuperAdmin,
      isDepartmentAdmin,
      isAnyAdmin,
      isLecturer,
      isStudent,
      departmentId,
      departmentName,
    }),
    [user, loading, login, logout, refreshUser, isSuperAdmin, isDepartmentAdmin, isAnyAdmin, isLecturer, isStudent, departmentId, departmentName]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
