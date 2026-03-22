import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Attach JWT to every request if present
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('intervuu_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle global response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('intervuu_token');
      localStorage.removeItem('intervuu_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
