import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import NewLoadModal from './components/NewLoadModal';
import LoadsTable from './components/LoadsTable';
import AuthForm from './components/AuthForm';
import Sidebar from './components/Sidebar';
import EmailPastePage from './pages/EmailPastePage';
import CalculateRatePage from './pages/CalculateRatePage';
import AdminPortalPage from './pages/AdminPortalPage';
import LanelyLandingPage from './pages/LanelyLandingPage';
import DashboardPage from './pages/DashboardPage';
import PipelinePage from './pages/PipelinePage';
import QuoteViewPage from './pages/QuoteViewPage';
import { buildApiUrl } from './config';
import GlobalTopbar from './components/GlobalTopbar';
import { AuthProvider, useAuth } from './context/AuthContext';

function DashboardApp() {
  const { user, checking, setUser } = useAuth();
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
        // ignore errors for now
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
        {/* Decorative Background Blobs */}
        <div className="app-blob app-blob-1" />
        <div className="app-blob app-blob-2" />
        
        <div className="app-content">
          <LoadsTable 
            rows={rows} 
            onNewLoad={() => setShowModal(true)} 
          />
        </div>
      </main>
      
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
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/calculate-rate" element={<CalculateRatePage />} />
      <Route path="/email-paste" element={<EmailPastePage />} />
      <Route path="/admin-portal" element={<AdminPortalPage />} />
      <Route path="/pipeline" element={<PipelinePage />} />
      <Route path="/loads" element={<DashboardApp />} />
      <Route path="/quotes/:quoteId" element={<QuoteViewPage />} />
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
