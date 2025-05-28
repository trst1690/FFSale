// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import './utils/axiosConfig'; // Add this at the top of App.js
import './App.css';

// Import components
import Header from './components/Header/Header';
import LandingPage from './components/Landing/LandingPage';
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';
import Dashboard from './components/Dashboard/Dashboard';
import LobbyScreen from './components/Lobby/LobbyScreen';
import DraftScreen from './components/Draft/DraftScreen';
import ProfileScreen from './components/Profile/ProfileScreen';
import AdminPanel from './components/Admin/AdminPanel';

// Toast Component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast ${type}`}>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={onClose}>
        ×
      </button>
    </div>
  );
};

// Configure axios defaults
axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Add auth token to requests
axios.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);

  // Show toast notification
  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  // Remove toast
  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await axios.get('/api/users/profile');
          setUser(response.data.data);
        } catch (error) {
          console.error('Auth check failed:', error);
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };
    
    checkAuth();
  }, []);

  // Handle login
  const handleLogin = async (email, password) => {
    try {
      const response = await axios.post('/api/auth/login', { email, password });
      if (response.data.success) {
        localStorage.setItem('token', response.data.token);
        setUser(response.data.user);
        showToast('Login successful!', 'success');
        return { success: true };
      }
      return { success: false, error: 'Login failed' };
    } catch (error) {
      const message = error.response?.data?.error || 'Login failed';
      showToast(message, 'error');
      return { success: false, error: message };
    }
  };

  // Handle register
  const handleRegister = async (userData) => {
    try {
      const response = await axios.post('/api/auth/register', userData);
      if (response.data.success) {
        localStorage.setItem('token', response.data.token);
        setUser(response.data.user);
        showToast('Registration successful!', 'success');
        return { success: true };
      }
      return { success: false, error: 'Registration failed' };
    } catch (error) {
      const message = error.response?.data?.error || 'Registration failed';
      showToast(message, 'error');
      return { success: false, error: message };
    }
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    showToast('Logged out successfully', 'info');
  };

  // Handle entering a contest
  const handleEnterContest = (contestId, draftId) => {
    // Navigate to draft screen
    window.location.href = `/draft/${draftId}`;
  };

  // Update user balance
  const updateUserBalance = (newBalance) => {
    setUser(prev => ({
      ...prev,
      balance: newBalance
    }));
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Loading Fantasy Fire Sale...</p>
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        <Header user={user} onLogout={handleLogout} />
        
        <main className="main-content">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<LandingPage />} />
            <Route 
              path="/login" 
              element={
                user ? <Navigate to="/dashboard" /> : 
                <Login onLogin={handleLogin} />
              } 
            />
            <Route 
              path="/register" 
              element={
                user ? <Navigate to="/dashboard" /> : 
                <Register onRegister={handleRegister} />
              } 
            />
            
            {/* Protected routes */}
            <Route 
              path="/dashboard" 
              element={
                user ? <Dashboard user={user} showToast={showToast} /> : 
                <Navigate to="/login" />
              } 
            />
            <Route 
              path="/lobby" 
              element={
                user ? 
                <LobbyScreen 
                  user={user} 
                  showToast={showToast}
                  onEnterContest={handleEnterContest}
                /> : 
                <Navigate to="/login" />
              } 
            />
            <Route 
              path="/draft/:draftId" 
              element={
                user ? 
                <DraftScreen 
                  user={user} 
                  showToast={showToast}
                  updateUserBalance={updateUserBalance}
                /> : 
                <Navigate to="/login" />
              } 
            />
            <Route 
              path="/profile" 
              element={
                user ? 
                <ProfileScreen 
                  user={user} 
                  showToast={showToast}
                  updateUser={setUser}
                /> : 
                <Navigate to="/login" />
              } 
            />
            
            {/* Admin routes */}
            <Route 
              path="/admin" 
              element={
                user && user.role === 'admin' ? 
                <AdminPanel user={user} showToast={showToast} /> : 
                <Navigate to="/" />
              } 
            />
            
            {/* 404 route */}
            <Route path="*" element={
              <div className="not-found">
                <h1>404 - Page Not Found</h1>
                <p>The page you're looking for doesn't exist.</p>
                <a href="/">Go Home</a>
              </div>
            } />
          </Routes>
        </main>
        
        {/* Toast notifications */}
        <div className="toast-container">
          {toasts.map(toast => (
            <Toast
              key={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </div>
      </div>
    </Router>
  );
}

export default App;