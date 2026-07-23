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
import AdminFinancePage from './pages/AdminFinancePage';
import AdminProfitMarginPage from './pages/AdminProfitMarginPage';
import DashboardPage from './pages/DashboardPage';
import PipelinePage from './pages/PipelinePage';
import QuoteViewPage from './pages/QuoteViewPage';
import MapPage from './pages/MapPage';
import FirstClassLandingPage from './pages/FirstClassLandingPage';
import CustomerPortalPage from './pages/CustomerPortalPage';
import { buildApiUrl } from './config';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SidebarProvider } from './context/SidebarContext';

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

  async function handleUpdate(updatePayload) {
    if (!updatePayload || !updatePayload.id) {
      throw new Error('Missing load id');
    }
    const resp = await fetch(buildApiUrl(`/api/loads/${updatePayload.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updatePayload)
    });
    if (!resp.ok) {
      const msg = await resp.text();
      throw new Error(msg || 'Failed to update');
    }
    const updated = await resp.json();
    setRows(prev => prev.map(row => (row.id === updated.id ? updated : row)));
    return updated;
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
            onUpdate={handleUpdate}
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

function isCustomerAccount(user) {
  if (!user) return false;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  const operationsRoles = ['admin', 'manager', 'agent', 'viewer'];
  const hasOperationsRole = roles.some(function(role) { return operationsRoles.indexOf(role) > -1; });
  return !hasOperationsRole && (roles.length === 0 || roles.indexOf('customer') > -1);
}

function OperationsRoute({ children }) {
  const { user, checking, setUser } = useAuth();
  if (checking) {
    return <div className="customer-portal-loading"><img src="/brand/logo.png" alt="First Class Trucking" /><span>Opening workspace...</span></div>;
  }
  if (!user) {
    return <AuthForm onAuthed={function(authedUser) { setUser(authedUser); }} />;
  }
  if (isCustomerAccount(user)) {
    return <Navigate to="/portal" replace />;
  }
  return children;
}

function DefaultRoute() {
  const { user, checking } = useAuth();
  if (checking) return null;
  return <Navigate to={isCustomerAccount(user) ? '/portal' : '/loads'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<FirstClassLandingPage />} />
      <Route path="/portal" element={<CustomerPortalPage />} />
      <Route path="/portal/quote" element={<CustomerPortalPage />} />
      <Route path="/dashboard" element={<OperationsRoute><DashboardPage /></OperationsRoute>} />
      <Route path="/calculate-rate" element={<CalculateRatePage />} />
      <Route path="/email-paste" element={<OperationsRoute><EmailPastePage /></OperationsRoute>} />
      <Route path="/admin-portal" element={<OperationsRoute><AdminPortalPage /></OperationsRoute>} />
      <Route path="/admin-finance" element={<OperationsRoute><AdminFinancePage /></OperationsRoute>} />
      <Route path="/admin-profit-margin" element={<OperationsRoute><AdminProfitMarginPage /></OperationsRoute>} />
      <Route path="/pipeline" element={<OperationsRoute><PipelinePage /></OperationsRoute>} />
      <Route path="/loads" element={<OperationsRoute><DashboardApp /></OperationsRoute>} />
      <Route path="/map" element={<OperationsRoute><MapPage /></OperationsRoute>} />
      <Route path="/quotes/:quoteId" element={<QuoteViewPage />} />
      <Route path="*" element={<DefaultRoute />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <SidebarProvider>
        <AppRoutes />
      </SidebarProvider>
    </AuthProvider>
  );
}

export default App;
