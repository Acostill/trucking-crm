import React, { useState } from 'react';
import { buildApiUrl } from '../config';

export default function AuthForm(props) {
  var onAuthed = props.onAuthed;
  var [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  var [email, setEmail] = useState('');
  var [password, setPassword] = useState('');
  var [firstName, setFirstName] = useState('');
  var [lastName, setLastName] = useState('');
  var [error, setError] = useState(null);
  var [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      var endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/signin';
      var body = { email: email, password: password };
      if (mode === 'signup') {
        body.firstName = firstName;
        body.lastName = lastName;
      }
      var resp = await fetch(buildApiUrl(endpoint), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await resp.json().catch(function(){ return null; });
      if (!resp.ok) {
        throw new Error((data && data.error) || 'Authentication failed');
      }
      if (onAuthed) onAuthed(data.user || null);
    } catch (err) {
      setError(err && err.message ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-shell">
        <section className="auth-brand-panel" aria-label="First Class Trucking">
          <img
            className="auth-brand-logo"
            src="/brand/logo.png"
            alt="First Class Trucking"
          />
          <div>
            <p className="auth-eyebrow">Operations CRM</p>
            <h1 className="auth-brand-title">First Class Trucking</h1>
          </div>
          <p className="auth-brand-footnote">Secure workspace access</p>
        </section>

        <div className="auth-card">
          <div className="auth-header">
            <img
              className="auth-logo"
              src="/brand/logo.png"
              alt="First Class Trucking"
            />
            <h2 className="auth-title">
              {mode === 'signup' ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="auth-subtitle">
              {mode === 'signup' ? 'Create your customer portal access.' : 'Sign in to your customer portal or operations workspace.'}
            </p>
        </div>
        
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="auth-name-grid">
                <label>
                  First name
                  <input
                    autoComplete="given-name"
                    value={firstName}
                    onChange={function(e){ setFirstName(e.target.value); }}
                  />
                </label>
                <label>
                  Last name
                  <input
                    autoComplete="family-name"
                    value={lastName}
                    onChange={function(e){ setLastName(e.target.value); }}
                  />
                </label>
              </div>
            )}
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={function(e){ setEmail(e.target.value); }}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={function(e){ setPassword(e.target.value); }}
              />
            </label>
          
            {error && (
              <div className="auth-error">
                {error}
              </div>
            )}
          
            <button className="btn auth-submit" type="submit" disabled={loading}>
              {loading ? 'Please wait…' : (mode === 'signup' ? 'Create account' : 'Sign in')}
            </button>
          </form>
        
          <div className="auth-switch">
            <button
              type="button"
              className="auth-switch-button"
              onClick={function(){ setMode(mode === 'signup' ? 'signin' : 'signup'); }}
              disabled={loading}
            >
              {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
