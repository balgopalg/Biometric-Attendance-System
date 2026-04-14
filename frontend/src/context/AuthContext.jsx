import { createContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);
const USER_STORAGE_KEY = 'user';

function getUserStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readUserFromStorage() {
  const storage = getUserStorage();
  if (!storage) return null;

  const saved = storage.getItem(USER_STORAGE_KEY);
  if (!saved) return null;

  try {
    return JSON.parse(saved);
  } catch {
    storage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

function writeUserToStorage(userData) {
  const storage = getUserStorage();
  if (!storage) return;
  storage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
}

function clearUserStorage() {
  const storage = getUserStorage();
  if (!storage) return;
  storage.removeItem(USER_STORAGE_KEY);
}

let meRequestPromise = null;

function fetchCurrentUserOnce() {
  if (meRequestPromise) return meRequestPromise;

  meRequestPromise = api.get('/auth/me')
    .then((res) => res.data)
    .catch(() => null)
    .finally(() => {
      meRequestPromise = null;
    });

  return meRequestPromise;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    toast.remove();
    api.post('/auth/logout').catch(() => {});
    clearUserStorage();
    setUser(null);
  }, []);

  useEffect(() => {
    let active = true;

    fetchCurrentUserOnce()
      .then((currentUser) => {
        if (!active) return;
        if (currentUser) {
          setUser(currentUser);
          writeUserToStorage(currentUser);
          return;
        }

        clearUserStorage();
        setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { user: userData } = res.data;
    writeUserToStorage(userData);
    setUser(userData);
    return userData;
  };

  const clearMustChangePassword = () => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, must_change_password: false };
      writeUserToStorage(updated);
      return updated;
    });
  };

  const isAuthenticated = !!user;
  const mustChangePassword = user?.must_change_password || false;

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, isAuthenticated,
      mustChangePassword, clearMustChangePassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
