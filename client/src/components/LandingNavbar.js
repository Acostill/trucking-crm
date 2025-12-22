import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export default function LandingNavbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="landing-navbar">
      <div className="landing-navbar-container">
        <div className="landing-navbar-content">
          {/* Logo */}
          <div className="landing-navbar-logo">
            <span>First Class Trucking</span>
          </div>

          {/* Desktop Links */}
          <div className="landing-navbar-links">
            <a href="#features" className="landing-navbar-link">Features</a>
            <a href="#coverage" className="landing-navbar-link">Network</a>
            <a href="#tracking" className="landing-navbar-link">Track Shipment</a>
          </div>

          {/* CTA Buttons */}
          <div className="landing-navbar-actions">
            <Link to="/loads" className="landing-navbar-link">
              Log in
            </Link>
            <Link to="/calculate-rate" className="landing-navbar-cta">
              Get a Quote
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="landing-navbar-mobile-toggle">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="landing-navbar-mobile-button"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="landing-navbar-mobile-menu">
          <a href="#features" className="landing-navbar-mobile-link">Features</a>
          <a href="#coverage" className="landing-navbar-mobile-link">Network</a>
          <a href="#tracking" className="landing-navbar-mobile-link">Track Shipment</a>
          <hr className="landing-navbar-mobile-divider" />
          <div className="landing-navbar-mobile-actions">
            <Link to="/loads" className="landing-navbar-mobile-link">Log in</Link>
            <Link to="/calculate-rate" className="landing-navbar-mobile-cta">Get a Quote</Link>
          </div>
        </div>
      )}
    </nav>
  );
}

