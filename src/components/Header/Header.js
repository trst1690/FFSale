// frontend/src/components/Header/Header.js
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const Header = ({ user, onLogout }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout();
    navigate('/');
  };

  return (
    <header style={{
      background: '#333',
      color: 'white',
      padding: '1rem',
      marginBottom: '1rem'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Link to="/" style={{ color: 'white', textDecoration: 'none' }}>
          <h2 style={{ margin: 0 }}>Fantasy Fire Sale</h2>
        </Link>
        
        <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {user ? (
            <>
              <Link to="/dashboard" style={{ color: 'white', textDecoration: 'none' }}>
                Dashboard
              </Link>
              <Link to="/lobby" style={{ color: 'white', textDecoration: 'none' }}>
                Lobby
              </Link>
              <Link to="/profile" style={{ color: 'white', textDecoration: 'none' }}>
                Profile
              </Link>
              <span>Balance: ${user.balance || 0}</span>
              <button onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" style={{ color: 'white', textDecoration: 'none' }}>
                Login
              </Link>
              <Link to="/register" style={{ color: 'white', textDecoration: 'none' }}>
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;