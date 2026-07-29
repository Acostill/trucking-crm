import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';
import { 
  LayoutDashboard, 
  Package, 
  ShieldCheck,
  LogOut,
  Kanban,
  DollarSign,
  Percent,
  MapPin,
  CircleDollarSign,
  House
} from 'lucide-react';

function Sidebar(props) {
  const location = useLocation();
  const auth = useAuth();
  const user = props && props.userOverride ? props.userOverride : (auth && auth.user);
  const linkSuffix = props && props.linkSuffix ? props.linkSuffix : '';
  const isAdmin = user && Array.isArray(user.roles) && user.roles.indexOf('admin') > -1;
  const userRoles = user && Array.isArray(user.roles) ? user.roles : [];
  const operationsRoles = ['admin', 'manager', 'agent', 'viewer'];
  const hasOperationsRole = userRoles.some(function(role) { return operationsRoles.indexOf(role) > -1; });
  const isCustomer = Boolean(user) && !hasOperationsRole && (userRoles.length === 0 || userRoles.indexOf('customer') > -1);
  const { isOpen, closeSidebar } = useSidebar();
  const sidebarRef = useRef(null);

  function handleSignOut() {
    if (auth && auth.signOut) {
      auth.signOut();
    }
  }

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    function handleClickOutside(event) {
      if (window.innerWidth <= 768 && isOpen && sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        // Check if click is not on the menu button
        const menuButton = document.querySelector('.mobile-menu-button');
        if (menuButton && !menuButton.contains(event.target)) {
          closeSidebar();
        }
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Prevent body scroll when sidebar is open on mobile
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isOpen, closeSidebar]);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  }, [location.pathname, closeSidebar]);

  const operationsNavItems = [
    { id: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { id: '/loads', label: 'Shipments', icon: Package, path: '/loads' },
    { id: '/pipeline', label: 'Pipeline', icon: Kanban, path: '/pipeline' },
    { id: '/map', label: 'Map', icon: MapPin, path: '/map' },
  ];

  const customerNavItems = [
    { id: '/portal', label: 'My Portal', icon: House, path: '/portal' },
    { id: '/portal/quote', label: 'New Quote', icon: CircleDollarSign, path: '/portal/quote' }
  ];

  const navItems = isCustomer ? customerNavItems : operationsNavItems;

  const adminItems = isAdmin ? [
    { id: '/admin-portal', label: 'Admin', icon: ShieldCheck, path: '/admin-portal' },
    { id: '/admin-finance', label: 'Finance', icon: DollarSign, path: '/admin-finance' },
    { id: '/admin-profit-margin', label: 'Profit Margin', icon: Percent, path: '/admin-profit-margin' },
  ] : [];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}
      
      <div className={`sidebar ${isOpen ? 'open' : ''}`} ref={sidebarRef}>
        {/* Logo */}
        <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <img 
            src="/brand/logo.png" 
            alt="First Class Trucking" 
            className="sidebar-logo-img"
          />
        </div>
        <span className="sidebar-logo-text">First Class Trucking</span>
      </div>

      {/* Main Navigation */}
      <div className="sidebar-nav">
        <div className="sidebar-section-label">{isCustomer ? 'Customer Account' : 'Operations'}</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.id}
              to={isCustomer ? item.path + linkSuffix : item.path}
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
              <span className="sidebar-user-role">
                {isCustomer ? 'Customer' : isAdmin ? 'Administrator' : 'Freight Operations'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

export default Sidebar;
