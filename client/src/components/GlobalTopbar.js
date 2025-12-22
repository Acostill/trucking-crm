import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Truck, LogOut, User, LayoutDashboard, Sparkles, ShieldCheck } from 'lucide-react';
import paperPlaneIcon from '../assets/paper_plane_icon.svg';

function GlobalTopbar() {
  const auth = useAuth();
  const user = auth && auth.user;
  const isAdmin = user && Array.isArray(user.roles) && user.roles.indexOf('admin') > -1;
  const location = useLocation();

  function handleSignOut() {
    if (auth && auth.signOut) {
      auth.signOut();
    }
  }

  // Helper to determine active state
  const isActive = (path) => location.pathname === path ? 'active' : '';

  // Custom styles for topbar links to match First Class Trucking aesthetic
  const linkStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '8px',
    textDecoration: 'none',
    color: 'var(--muted)',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
  };

  const activeLinkStyle = {
    ...linkStyle,
    backgroundColor: 'var(--lanely-indigo-50)',
    color: 'var(--primary)',
  };

  return (
    <div className="topbar global-topbar" style={{ 
      background: 'rgba(255, 255, 255, 0.8)', 
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
      padding: '12px 24px'
    }}>
      <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="brand-badge" style={{ 
          width: '32px', height: '32px', borderRadius: '8px', marginRight: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden'
        }}>
          <img 
            src={paperPlaneIcon} 
            alt="QuotePilot" 
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
        <span style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.5px' }}>First Class Trucking</span>
      </Link>

      <div className="topbar-nav-group" style={{ gap: '24px' }}>
        <div className="nav-links" style={{ display: 'flex', gap: '8px' }}>
          <Link 
            to="/loads" 
            style={location.pathname === '/loads' ? activeLinkStyle : linkStyle}
            className="nav-link"
          >
            <Truck size={16} />
            Loads
          </Link>
          <Link 
            to="/email-paste" 
            style={location.pathname === '/email-paste' ? activeLinkStyle : linkStyle}
            className="nav-link"
          >
            <Sparkles size={16} />
            Email AI
          </Link>
          {isAdmin && (
            <Link 
              to="/admin-portal" 
              style={location.pathname === '/admin-portal' ? activeLinkStyle : linkStyle}
              className="nav-link"
            >
              <ShieldCheck size={16} />
              Admin
            </Link>
          )}
        </div>
        
        <div className="topbar-actions" style={{ paddingLeft: '24px', borderLeft: '1px solid var(--border)' }}>
          {user ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '16px' }}>
                <div style={{ 
                  width: '28px', height: '28px', borderRadius: '50%', background: 'var(--lanely-slate-100)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)'
                }}>
                  <User size={14} />
                </div>
                <span className="user-email" style={{ fontWeight: 500, color: 'var(--text)' }}>{user.email}</span>
              </div>
              <button 
                className="btn-secondary" 
                onClick={handleSignOut}
                style={{ 
                  border: 'none', background: 'transparent', color: 'var(--muted)', 
                  padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' 
                }}
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <Link className="btn btn-primary" to="/loads" style={{ 
              background: 'var(--text)', color: 'white', padding: '8px 16px', 
              borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: 600 
            }}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default GlobalTopbar;
