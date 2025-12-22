import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Package, 
  Sparkles, 
  ShieldCheck,
  LogOut,
  Kanban
} from 'lucide-react';
import paperPlaneIcon from '../assets/paper_plane_icon.svg';

function Sidebar() {
  const location = useLocation();
  const auth = useAuth();
  const user = auth && auth.user;
  const isAdmin = user && Array.isArray(user.roles) && user.roles.indexOf('admin') > -1;

  function handleSignOut() {
    if (auth && auth.signOut) {
      auth.signOut();
    }
  }

  const navItems = [
    { id: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { id: '/loads', label: 'Shipments', icon: Package, path: '/loads' },
    { id: '/pipeline', label: 'Pipeline', icon: Kanban, path: '/pipeline' },
    { id: '/email-paste', label: 'Email AI', icon: Sparkles, path: '/email-paste' },
  ];

  const adminItems = isAdmin ? [
    { id: '/admin-portal', label: 'Admin', icon: ShieldCheck, path: '/admin-portal' },
  ] : [];

  const isActive = (path) => location.pathname === path;

  return (
    <div className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <img 
            src={paperPlaneIcon} 
            alt="QuotePilot" 
            className="sidebar-logo-img"
          />
        </div>
        <span className="sidebar-logo-text">First Class Trucking</span>
      </div>

      {/* Main Navigation */}
      <div className="sidebar-nav">
        <div className="sidebar-section-label">Operations</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.id}
              to={item.path}
              className={`sidebar-nav-item ${active ? 'active' : ''}`}
            >
              <Icon size={18} className="sidebar-nav-icon" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {adminItems.length > 0 && (
          <>
            <div className="sidebar-section-label" style={{ marginTop: '16px' }}>Admin</div>
            {adminItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`sidebar-nav-item ${active ? 'active' : ''}`}
                >
                  <Icon size={18} className="sidebar-nav-icon" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </>
        )}
      </div>

      {/* Bottom Section */}
      <div className="sidebar-bottom">
        <button 
          className="sidebar-nav-item sidebar-signout"
          onClick={handleSignOut}
        >
          <LogOut size={18} className="sidebar-nav-icon" />
          <span>Sign Out</span>
        </button>

        {/* User Profile */}
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">
                {user.firstName || user.email?.split('@')[0] || 'User'}
              </span>
              <span className="sidebar-user-role">Freight Broker</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Sidebar;

