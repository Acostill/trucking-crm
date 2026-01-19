import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import AuthForm from '../components/AuthForm';
import { useAuth } from '../context/AuthContext';
import { buildApiUrl } from '../config';

const DEFAULT_RULE_ID = 1;

export default function AdminProfitMarginPage() {
  const { user, checking, setUser } = useAuth();
  const isAdmin = user && Array.isArray(user.roles) && user.roles.indexOf('admin') > -1;
  const [loading, setLoading] = useState(true);
  const [marginPct, setMarginPct] = useState('');
  const [initialMarginPct, setInitialMarginPct] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(function() {
    if (!user || !isAdmin) {
      setLoading(false);
      return;
    }
    async function loadRule() {
      setLoading(true);
      setError(null);
      setStatus(null);
      try {
        const resp = await fetch(buildApiUrl(`/api/admin/profit-margin/${DEFAULT_RULE_ID}`), {
          credentials: 'include'
        });
        const data = await resp.json().catch(function(){ return null; });
        if (!resp.ok) {
          throw new Error((data && data.error) || 'Failed to load profit margin');
        }
        const value = data && data.marginPct !== null && data.marginPct !== undefined
          ? String(data.marginPct)
          : '';
        setMarginPct(value);
        setInitialMarginPct(value);
      } catch (err) {
        setError(err && err.message ? err.message : 'Failed to load profit margin');
      } finally {
        setLoading(false);
      }
    }
    loadRule();
  }, [user, isAdmin]);

  const hasChanges = marginPct !== initialMarginPct;

  async function handleSave() {
    if (!hasChanges || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    setStatus(null);
    const parsed = parseFloat(marginPct);
    if (Number.isNaN(parsed)) {
      setError('Profit Margin % must be a number');
      setSaving(false);
      return;
    }
    if (parsed < 0 || parsed > 100) {
      setError('Profit Margin % must be between 0 and 100');
      setSaving(false);
      return;
    }
    try {
      const resp = await fetch(buildApiUrl(`/api/admin/profit-margin/${DEFAULT_RULE_ID}`), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marginPct: parsed })
      });
      const data = await resp.json().catch(function(){ return null; });
      if (!resp.ok) {
        throw new Error((data && data.error) || 'Failed to save profit margin');
      }
      const value = data && data.marginPct !== null && data.marginPct !== undefined
        ? String(data.marginPct)
        : '';
      setMarginPct(value);
      setInitialMarginPct(value);
      setStatus('Saved');
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to save profit margin');
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="app-main">
          <div className="app-loading">Checking session…</div>
        </main>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onAuthed={function(u){ setUser(u); }} />;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <div className="app-content admin-profit-page">
          <div className="page-header">
            <h1 className="page-title">Profit Margin</h1>
            <p className="page-subtitle">Set the default profit margin for future loads.</p>
          </div>

          {!isAdmin ? (
            <div className="admin-message error">Admin access required.</div>
          ) : (
            <div className="profit-margin-card">
              <div className="profit-margin-row">
                <label htmlFor="profitMarginPct">Profit Margin %</label>
                <input
                  id="profitMarginPct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={marginPct}
                  onChange={function(e) { setMarginPct(e.target.value); setStatus(null); }}
                  disabled={loading || saving}
                />
              </div>

              {error && <div className="admin-message error">{error}</div>}
              {status && <div className="admin-message success">{status}</div>}

              <div className="profit-margin-actions">
                <button
                  className="primary-btn"
                  onClick={handleSave}
                  disabled={!hasChanges || saving || loading}
                >
                  {saving ? 'Saving…' : (status ? 'Saved' : 'Save changes')}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
