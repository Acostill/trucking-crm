import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import NewLoadModal from './components/NewLoadModal';
import LoadsTable from './components/LoadsTable';
import AuthForm from './components/AuthForm';
import EmailPastePage from './pages/EmailPastePage';
import CalculateRatePage from './pages/CalculateRatePage';
import { buildApiUrl } from './config';

function DashboardApp() {
  const [showModal, setShowModal] = useState(false);
  const [rows, setRows] = useState([]);
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(function() {
    async function checkAuth() {
      try {
        const meResp = await fetch(buildApiUrl('/api/auth/me'), { credentials: 'include' });
        if (meResp.ok) {
          const me = await meResp.json();
          setUser(me && me.user ? me.user : null);
        } else {
          setUser(null);
        }
      } catch (_e) {
        setUser(null);
      } finally {
        setCheckingAuth(false);
      }
    }
    checkAuth();
  }, []);

  useEffect(function() {
    async function fetchLoads() {
      if (!user) return;
      try {
        const resp = await fetch(buildApiUrl('/api/loads'), { credentials: 'include' });
        const data = await resp.json();
        if (Array.isArray(data)) {
          setRows(data);
        }
      } catch (e) {
        // ignore errors for now or log
        // console.error(e);
      }
    }
    fetchLoads();
  }, [user]);

  async function handleSave(row) {
    const resp = await fetch(buildApiUrl('/api/loads'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(row)
    });
    if (!resp.ok) {
      const msg = await resp.text();
      throw new Error(msg || 'Failed to save');
    }
    const saved = await resp.json();
    setRows(prev => [saved, ...prev]);
  }

  async function handleSignOut() {
    await fetch(buildApiUrl('/api/auth/signout'), { method: 'POST', credentials: 'include' });
    setUser(null);
  }

  if (checkingAuth) {
    return (
      <div className="shell">
        <div className="container" style={{ padding: 40 }}>Checking session…</div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onAuthed={function(u){ setUser(u); }} />;
  }

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <div className="brand-badge"></div>
          Active Loads
        </div>
        <div>
          <span style={{ marginRight: 12 }}>{user.email}</span>
          <button className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>
      <div className="container">
        <div className="card">
          <div className="card-header">
            <h2 className="title">Manage loads</h2>
            <div className="subtitle">Create and track active loads</div>
          </div>
          <div className="card-body">
            <div className="actions">
              <button className="btn" onClick={() => setShowModal(true)}>New Active Load</button>
            </div>
            <LoadsTable rows={rows} />
          </div>
        </div>
      </div>
      {showModal && (
        <NewLoadModal
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/email-paste" element={<EmailPastePage />} />
      <Route path="/calculate-rate" element={<CalculateRatePage />} />
      <Route path="/*" element={<DashboardApp />} />
    </Routes>
  );
}

export default App;
