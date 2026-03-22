export const saveAuth = (token, user) => {
  localStorage.setItem('intervuu_token', token);
  localStorage.setItem('intervuu_user', JSON.stringify(user));
};

export const getToken = () => localStorage.getItem('intervuu_token');

export const getUser = () => {
  const user = localStorage.getItem('intervuu_user');
  return user ? JSON.parse(user) : null;
};

export const clearAuth = () => {
  localStorage.removeItem('intervuu_token');
  localStorage.removeItem('intervuu_user');
};

export const isAuthenticated = () => !!getToken();

export const validateEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
