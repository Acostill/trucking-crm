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
    <div className="container">
      <div className="card" style={{ maxWidth: 480, margin: '80px auto' }}>
        <div className="card-header">
          <h2 className="title">{mode === 'signup' ? 'Create your account' : 'Sign in'}</h2>
          <div className="subtitle">
            {mode === 'signup' ? 'Enter your details to get started' : 'Enter your credentials to continue'}
          </div>
        </div>
        <div className="card-body">
          <form className="form-grid" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="row-2">
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
            {error && <div className="error">Error: {error}</div>}
            <div className="actions">
              <button className="btn" type="submit" disabled={loading}>
                {loading ? 'Please wait…' : (mode === 'signup' ? 'Create account' : 'Sign in')}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={function(){ setMode(mode === 'signup' ? 'signin' : 'signup'); }}
                disabled={loading}
              >
                {mode === 'signup' ? 'Have an account? Sign in' : 'New here? Sign up'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


