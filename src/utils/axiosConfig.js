// frontend/src/utils/axiosConfig.js
import axios from 'axios';

// Set base URL
axios.defaults.baseURL = 'http://localhost:5000';

// Add token to all requests if it exists
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect to login if we're not already there
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        console.error('Authentication error - token may be invalid');
        // Don't automatically logout - let the user retry
        // Just log the error
      }
    }
    return Promise.reject(error);
  }
);

export default axios;