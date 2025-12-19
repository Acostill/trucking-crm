import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles, 
  ClipboardPaste, 
  ChevronRight,
  TrendingUp,
  TrendingDown,
  X
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import StatusBadge from '../components/StatusBadge';
import CalculateRatePage from './CalculateRatePage';
import { useAuth } from '../context/AuthContext';
import AuthForm from '../components/AuthForm';
import { buildApiUrl } from '../config';

export default function DashboardPage() {
  const { user, checking, setUser } = useAuth();
  const [loads, setLoads] = useState([]);
  const [emailText, setEmailText] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [ratePrefill, setRatePrefill] = useState(null);
  const [lastPayload, setLastPayload] = useState(null);
  const [modalError, setModalError] = useState(null);
  const [modalSuccess, setModalSuccess] = useState(null);

  useEffect(() => {
    async function fetchLoads() {
      if (!user) return;
      try {
        const resp = await fetch(buildApiUrl('/api/loads'), { credentials: 'include' });
        const data = await resp.json();
        if (Array.isArray(data)) {
          setLoads(data);
        }
      } catch (e) {
        // ignore
      }
    }
    fetchLoads();
  }, [user]);

  // Filter loads by status
  const activeShipments = loads.filter(s => s.status === 'In Transit');
  const openQuotes = loads.filter(s => ['Pending', 'New Quote', 'Quoted'].includes(s.status));
  const deliveredCount = loads.filter(s => s.status === 'Delivered').length;
  const onTimeRate = loads.length > 0 ? Math.round((deliveredCount / Math.max(loads.length, 1)) * 100) : 98;

  // KPI data
  const kpis = [
    { 
      label: 'Active Shipments', 
      value: activeShipments.length.toString(), 
      trend: '+12.5%', 
      positive: true 
    },
    { 
      label: 'Open Quotes', 
      value: openQuotes.length.toString(), 
      trend: '+3.2%', 
      positive: true 
    },
    { 
      label: 'On-Time Rate', 
      value: `${onTimeRate}%`, 
      trend: '-0.4%', 
      positive: false 
    },
    { 
      label: 'Tasks Remaining', 
      value: '5', 
      trend: '-2', 
      positive: true 
    },
  ];

  // Sample tasks
  const tasks = [
    { id: 1, type: 'urgent', title: 'Carrier Falloff - LNY-8392', subtitle: 'Needs recovery option ASAP.' },
    { id: 2, type: 'warning', title: 'Send Quote: TechFlow Logistics', subtitle: 'Chicago to Austin' },
    { id: 3, type: 'warning', title: 'Send Quote: GreenEarth Produce', subtitle: 'Seattle to Portland' },
    { id: 4, type: 'success', title: 'Update Delivery Status', subtitle: 'Confirm delivery for LNY-9921' },
  ];

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }

  function getUserName() {
    if (user?.firstName) return user.firstName;
    if (user?.email) return user.email.split('@')[0];
    return 'there';
  }

  async function handleProcessQuote() {
    if (!emailText.trim()) {
      setModalError('Please paste email content first.');
      setIsModalOpen(true);
      return;
    }
    
    setProcessing(true);
    setModalError(null);
    setModalSuccess(null);
    setRatePrefill(null);
    setLastPayload(null);
    setIsModalOpen(true);
    
    try {
      const resp = await fetch(buildApiUrl('/api/email-paste'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: emailText })
      });
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(text || 'Failed to process email');
      }
      
      setModalSuccess('Email processed successfully!');
      
      // Parse response and prefill the rate calculator
      try {
        const data = text ? JSON.parse(text) : {};
        // The response might have `output` wrapper or be direct
        const payload = data && data.output ? data.output : data;
        setLastPayload(payload);
        
        // Handle both old and new response structures
        const body = payload && payload.body ? payload.body : {};
        const shipmentDetails = body.shipment_details || payload.shipment || {};
        const pickup = shipmentDetails.pickup || {};
        
        // New structure: delivery_options is an array, take the first one
        const deliveryOptions = shipmentDetails.delivery_options || [];
        const delivery = shipmentDetails.delivery || (deliveryOptions.length > 0 ? deliveryOptions[0] : {});
        
        const shipmentInfo = shipmentDetails.shipment_info || {};
        
        // New structure: dimensions is an array, take the first one
        const dimsArray = shipmentInfo.dimensions || [];
        const dims = Array.isArray(dimsArray) ? (dimsArray[0] || {}) : dimsArray;
        
        // Weight: check total_weight_lbs first (new), then weight_lbs (old)
        const weightLbs = shipmentInfo.total_weight_lbs || shipmentInfo.weight_lbs;
        
        // Pallets: check shipment_info.pallets first (new), then dims.pallets (old)
        const pallets = shipmentInfo.pallets || dims.pallets;

        setRatePrefill({
          pickupCity: pickup.city || '',
          pickupState: pickup.state || '',
          pickupZip: pickup.zip || '',
          pickupCountry: 'US',
          pickupDate: pickup.pickup_date || pickup.requested_date_time || pickup.date || '',
          deliveryCity: delivery.city || '',
          deliveryState: delivery.state || '',
          deliveryZip: delivery.zip_code || delivery.zip || '',
          deliveryCountry: 'US',
          piecesUnit: 'in',
          piecesQuantity: pallets != null ? String(pallets) : '',
          part1Length: dims.length_in != null ? String(dims.length_in) : '',
          part1Width: dims.width_in != null ? String(dims.width_in) : '',
          part1Height: dims.height_in != null ? String(dims.height_in) : '',
          part2Length: '',
          part2Width: '',
          part2Height: '',
          weightUnit: weightLbs ? 'lbs' : '',
          weightValue: weightLbs ? String(weightLbs) : '',
          hazardousUnNumbersText: '',
          accessorialCodesText: '',
          shipmentId: '',
          referenceNumber: ''
        });
      } catch (_err) {
        // ignore parse errors; prefill is best-effort
      }
    } catch (err) {
      setModalError(err && err.message ? err.message : 'Failed to process email');
    } finally {
      setProcessing(false);
    }
  }

  function closeModal() {
    setIsModalOpen(false);
    setModalError(null);
    setModalSuccess(null);
  }

  async function handleSelectQuote(quote) {
    if (!lastPayload) {
      setModalError('No email payload to save with quote.');
      return;
    }
    try {
      const resp = await fetch(buildApiUrl('/api/email-paste/save-load'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: lastPayload, quote })
      });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to save load with selected quote');
      }
      setModalSuccess('Load saved with selected quote!');
      setEmailText(''); // Clear the input
      // Refresh loads
      const loadsResp = await fetch(buildApiUrl('/api/loads'), { credentials: 'include' });
      const data = await loadsResp.json();
      if (Array.isArray(data)) {
        setLoads(data);
      }
    } catch (err) {
      setModalError(err && err.message ? err.message : 'Failed to save load');
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
    return <AuthForm onAuthed={(u) => setUser(u)} />;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        {/* Decorative Background Blobs */}
        <div className="app-blob app-blob-1" />
        <div className="app-blob app-blob-2" />
        
        <div className="app-content">
          <div className="dashboard">
            {/* Header */}
            <div className="dashboard-header">
              <div>
                <h1 className="dashboard-title">{getGreeting()}, {getUserName()}</h1>
                <p className="dashboard-subtitle">Ready to move some freight?</p>
              </div>
              <div className="dashboard-timestamp">
                Last updated: Just now
              </div>
            </div>

            {/* KPI Grid */}
            <div className="kpi-grid">
              {kpis.map((kpi, idx) => (
                <div key={idx} className="kpi-card">
                  <div className="kpi-header">
                    <span className="kpi-label">{kpi.label}</span>
                    <span className={`kpi-trend ${kpi.positive ? 'positive' : 'negative'}`}>
                      {kpi.positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {kpi.trend}
                    </span>
                  </div>
                  <div className="kpi-value">{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Quick Import Section */}
            <div className="quick-import-card">
              <div className="quick-import-decoration">
                <Sparkles size={120} />
              </div>
              <div className="quick-import-content">
                <div className="quick-import-header">
                  <div className="quick-import-icon">
                    <ClipboardPaste size={20} />
                  </div>
                  <div>
                    <h3 className="quick-import-title">Quick Import</h3>
                    <p className="quick-import-subtitle">Paste load tender or email content to generate a quote.</p>
                  </div>
                </div>
                
                <div className="quick-import-input-wrapper">
                  <textarea
                    value={emailText}
                    onChange={(e) => setEmailText(e.target.value)}
                    placeholder="Paste email body here (e.g., 'Need a flatbed from Chicago to Austin...')"
                    className="quick-import-textarea"
                  />
                  <div className="quick-import-actions">
                    {emailText && (
                      <button 
                        onClick={() => setEmailText('')}
                        className="btn-clear"
                      >
                        Clear
                      </button>
                    )}
                    <button 
                      onClick={handleProcessQuote}
                      className="btn-process"
                      disabled={processing || !emailText.trim()}
                    >
                      <Sparkles size={14} />
                      {processing ? 'Processing...' : 'Process Quote'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="dashboard-grid">
              {/* Recent Quotes */}
              <div className="dashboard-col-2">
                <div className="section-header">
                  <h3 className="section-title">Recent Quotes</h3>
                  <Link to="/loads" className="section-link">
                    View Pipeline <ChevronRight size={14} />
                  </Link>
                </div>
                
                <div className="glass-table-card">
                  {openQuotes.length === 0 ? (
                    <div className="table-empty">No active quotes found.</div>
                  ) : (
                    <table className="glass-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Customer</th>
                          <th>Route</th>
                          <th>Status</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openQuotes.slice(0, 5).map((s, idx) => (
                          <tr key={s.id || idx}>
                            <td className="font-medium">{s.loadNumber || '-'}</td>
                            <td>{s.customer || '-'}</td>
                            <td className="route-cell">
                              {(s.shipperLocation || s.shipper || '-').split(',')[0]}
                              <ArrowRight size={12} className="route-arrow" />
                              {(s.consigneeLocation || s.consignee || '-').split(',')[0]}
                            </td>
                            <td>
                              <StatusBadge status={s.status || 'Pending'} />
                            </td>
                            <td className="text-right">
                              <button className="btn-review">Review</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Tasks */}
              <div className="dashboard-col-1">
                <div className="tasks-card">
                  <div className="tasks-header">
                    <div className="tasks-title-row">
                      <AlertCircle size={18} className="tasks-icon" />
                      <h3 className="section-title">Tasks</h3>
                    </div>
                    <span className="tasks-count">5 Pending</span>
                  </div>
                  
                  <div className="tasks-list">
                    {tasks.map((task) => (
                      <div 
                        key={task.id} 
                        className={`task-item task-${task.type}`}
                      >
                        {task.type === 'success' ? (
                          <CheckCircle2 size={16} className="task-icon-success" />
                        ) : (
                          <div className={`task-dot task-dot-${task.type}`} />
                        )}
                        <div>
                          <div className="task-title">{task.title}</div>
                          <div className="task-subtitle">{task.subtitle}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button className="btn-add-task">
                    + Add New Task
                  </button>
                </div>
              </div>
            </div>

            {/* Active Shipments */}
            <div className="dashboard-section">
              <div className="section-header">
                <h3 className="section-title">Active Shipments (In Transit)</h3>
                <Link to="/loads" className="section-link">
                  View All Shipments <ChevronRight size={14} />
                </Link>
              </div>
              
              <div className="glass-table-card">
                {activeShipments.length === 0 ? (
                  <div className="table-empty">No shipments in transit.</div>
                ) : (
                  <table className="glass-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Customer</th>
                        <th>Route</th>
                        <th>Status</th>
                        <th className="text-right">ETA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeShipments.slice(0, 5).map((s, idx) => (
                        <tr key={s.id || idx}>
                          <td className="font-medium">{s.loadNumber || '-'}</td>
                          <td>{s.customer || '-'}</td>
                          <td className="route-cell">
                            {(s.shipperLocation || s.shipper || '-').split(',')[0]}
                            <ArrowRight size={12} className="route-arrow" />
                            {(s.consigneeLocation || s.consignee || '-').split(',')[0]}
                          </td>
                          <td>
                            <StatusBadge status={s.status || 'In Transit'} />
                          </td>
                          <td className="text-right font-medium">
                            {formatDate(s.deliveryDate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Quote Processing Modal */}
      {isModalOpen && (
        <div className="quote-modal-overlay" onClick={closeModal}>
          <div className="quote-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quote-modal-header">
              <div>
                <h2 className="quote-modal-title">
                  {processing ? 'Processing Email...' : 'Calculate Rate'}
                </h2>
                <p className="quote-modal-subtitle">
                  {processing 
                    ? 'Extracting shipment details from your email...'
                    : 'Review and get quotes for this shipment'
                  }
                </p>
              </div>
              <button className="quote-modal-close" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>
            
            <div className="quote-modal-body">
              {modalError && (
                <div className="quote-modal-message error">{modalError}</div>
              )}
              {modalSuccess && (
                <div className="quote-modal-message success">{modalSuccess}</div>
              )}
              
              {processing ? (
                <div className="quote-modal-loading">
                  <div className="quote-modal-spinner" />
                  <span>Analyzing email content...</span>
                </div>
              ) : (
                <CalculateRatePage 
                  embedded 
                  initialValues={{}} 
                  prefill={ratePrefill}
                  onSelectQuote={handleSelectQuote}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

