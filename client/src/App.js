import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import NewLoadModal from './components/NewLoadModal';
import LoadsTable from './components/LoadsTable';
import AuthForm from './components/AuthForm';
import EmailPastePage from './pages/EmailPastePage';
import CalculateRatePage from './pages/CalculateRatePage';
import AdminPortalPage from './pages/AdminPortalPage';
import LanelyLandingPage from './pages/LanelyLandingPage';
import { buildApiUrl } from './config';
import GlobalTopbar from './components/GlobalTopbar';
import { AuthProvider, useAuth } from './context/AuthContext';

function DashboardApp() {
  const { user, checking, setUser, signOut } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [rows, setRows] = useState([]);

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
    await signOut();
  }

  if (checking) {
    return (
      <div className="shell">
        <GlobalTopbar />
        <div className="container" style={{ padding: 40 }}>Checking session…</div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onAuthed={function(u){ setUser(u); }} />;
  }

  return (
    <div className="shell">
      <GlobalTopbar />
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LanelyLandingPage />} />
      <Route path="/calculate-rate" element={<CalculateRatePage />} />
      <Route path="/email-paste" element={<EmailPastePage />} />
      <Route path="/admin-portal" element={<AdminPortalPage />} />
      <Route path="/loads" element={<DashboardApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
