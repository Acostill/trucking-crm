import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function GlobalTopbar() {
  var auth = useAuth();
  var user = auth && auth.user;
  var isAdmin = user && Array.isArray(user.roles) && user.roles.indexOf('admin') > -1;

  function handleSignOut() {
    if (auth && auth.signOut) {
      auth.signOut();
    }
  }

  return (
    <div className="topbar global-topbar">
      <div className="brand">
        <div className="brand-badge"></div>
        Active Loads
      </div>
      <div className="topbar-nav-group">
        <div className="nav-links">
          <Link to="/loads" className="btn btn-secondary">Loads</Link>
          <Link to="/email-paste" className="btn btn-secondary">Email AI</Link>
          {isAdmin && (
            <Link to="/admin-portal" className="btn btn-secondary">Admin</Link>
          )}
        </div>
        <div className="topbar-actions">
          {user ? (
            <>
              <span className="user-email">{user.email}</span>
              <button className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
            </>
          ) : (
            <Link className="btn btn-secondary" to="/loads">Sign in</Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default GlobalTopbar;

