import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let isRedirectingOnUnauthorized = false;

function getUserStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.split('=');
    if (key === name) return decodeURIComponent(parts.join('='));
  }
  return null;
}

// Attach CSRF token header for unsafe methods when cookie-CSRF protection is enabled.
api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const csrf = getCookie('csrf_access_token');
    if (csrf) {
      config.headers['X-CSRF-TOKEN'] = csrf;
    }
  }

  // Only set JSON content-type if it's not FormData
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
  } else {
    // For FormData, let axios handle the content-type with boundary
    delete config.headers['Content-Type'];
  }
  
  return config;
});

// Handle 401 responses globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const requestUrl = String(error.config?.url || '');
      const isAuthBootstrapCall =
        requestUrl.includes('/auth/me') ||
        requestUrl.includes('/auth/login') ||
        requestUrl.includes('/auth/logout');
      const alreadyOnLogin = window.location.pathname === '/login';

      const storage = getUserStorage();
      if (storage) {
        storage.removeItem('user');
      }

      // Avoid reload loops: /auth/me can naturally return 401 before login.
      if (!isAuthBootstrapCall && !alreadyOnLogin && !isRedirectingOnUnauthorized) {
        isRedirectingOnUnauthorized = true;
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
