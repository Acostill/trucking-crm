import React from 'react';
import { Menu } from 'lucide-react';
import { useSidebar } from '../context/SidebarContext';

export default function MobileMenuButton({ floating = false }) {
  const { toggleSidebar } = useSidebar();

  if (floating) {
    return (
      <button 
        className="floating-mobile-menu"
        onClick={toggleSidebar}
        aria-label="Toggle menu"
      >
        <Menu size={24} />
      </button>
    );
  }

  return (
    <button 
      className="mobile-menu-button"
      onClick={toggleSidebar}
      aria-label="Toggle menu"
      style={{
        background: 'transparent',
        border: 'none',
        padding: '8px',
        borderRadius: '8px',
        cursor: 'pointer',
        color: 'var(--text)',
        marginRight: '12px'
      }}
    >
      <Menu size={24} />
    </button>
  );
}
