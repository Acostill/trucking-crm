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
      <div className="card auth-card">
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            margin: '0 auto 16px', 
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #818cf8 100%)',
            boxShadow: '0 4px 12px -2px rgba(99, 102, 241, 0.4)'
          }}></div>
          <h2 className="title" style={{ fontSize: '24px', marginBottom: '8px' }}>
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h2>
          <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
            {mode === 'signup' ? 'Enter your details to get started' : 'Sign in to continue to First Class Trucking'}
          </p>
        </div>
        
        <form style={{ display: 'grid', gap: '16px' }} onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label>
                First name
                <input value={firstName} onChange={function(e){ setFirstName(e.target.value); }} />
              </label>
              <label>
                Last name
                <input value={lastName} onChange={function(e){ setLastName(e.target.value); }} />
              </label>
            </div>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={function(e){ setEmail(e.target.value); }} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={function(e){ setPassword(e.target.value); }} />
          </label>
          
          {error && (
            <div style={{ 
              padding: '12px 16px', 
              background: '#fef2f2', 
              border: '1px solid #fecaca', 
              borderRadius: '10px',
              color: '#dc2626',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}
          
          <button className="btn" type="submit" disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
            {loading ? 'Please wait…' : (mode === 'signup' ? 'Create account' : 'Sign in')}
          </button>
        </form>
        
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button
            type="button"
            onClick={function(){ setMode(mode === 'signup' ? 'signin' : 'signup'); }}
            disabled={loading}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#4f46e5', 
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
