import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Headphones,
  MapPin,
  PackageCheck,
  Plus,
  Route,
  ShieldCheck,
  Truck,
  X
} from 'lucide-react';
import AuthForm from '../components/AuthForm';
import CustomerQuoteBuilder from '../components/CustomerQuoteBuilder';
import MobileMenuButton from '../components/MobileMenuButton';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../config';
import { useAuth } from '../context/AuthContext';

const EMPTY_PORTAL = {
  metrics: { activeShipments: 0, openQuotes: 0, deliveredShipments: 0, totalQuotes: 0 },
  quotes: [],
  shipments: []
};

const PREVIEW_PORTAL = {
  metrics: { activeShipments: 1, openQuotes: 2, deliveredShipments: 8, totalQuotes: 12 },
  quotes: [
    {
      id: 'FCTL-DEMO-1042',
      status: 'pending',
      quote: { total: 1485, truckType: 'LTL Freight' },
      shipment: {
        pickup: { location: { city: 'Miami', state: 'FL', zip: '33166' } },
        delivery: { location: { city: 'Atlanta', state: 'GA', zip: '30303' } }
      },
      submittedAt: '2026-07-14T14:00:00Z'
    },
    {
      id: 'FCTL-DEMO-1038',
      status: 'approved',
      quote: { total: 2190, truckType: 'Box Truck' },
      shipment: {
        pickup: { location: { city: 'Orlando', state: 'FL', zip: '32824' } },
        delivery: { location: { city: 'Charlotte', state: 'NC', zip: '28208' } }
      },
      submittedAt: '2026-07-11T10:30:00Z'
    }
  ],
  shipments: [
    {
      id: 'demo-shipment-1',
      loadNumber: 'FCTL-28417',
      status: 'In Transit',
      shipperLocation: 'Orlando, FL',
      consigneeLocation: 'Charlotte, NC',
      deliveryDate: '2026-07-15T16:00:00Z'
    }
  ]
};

function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(value));
}

function formatDate(value) {
  if (!value) return 'Date pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date pending';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function locationLine(location) {
  if (!location || typeof location !== 'object') return 'Location pending';
  return [location.city, location.state, location.zip].filter(Boolean).join(', ') || 'Location pending';
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.indexOf('deliver') > -1 || normalized.indexOf('approve') > -1) return 'success';
  if (normalized.indexOf('transit') > -1 || normalized.indexOf('book') > -1) return 'active';
  if (normalized.indexOf('reject') > -1 || normalized.indexOf('cancel') > -1) return 'danger';
  return 'pending';
}

function CustomerPortalOverview({ user, data, loading, error, onNewQuote, onRefresh, previewMode }) {
  const firstName = user && user.firstName ? user.firstName : (user && user.email ? user.email.split('@')[0] : 'there');
  const metrics = data.metrics || EMPTY_PORTAL.metrics;
  const quotes = Array.isArray(data.quotes) ? data.quotes : [];
  const shipments = Array.isArray(data.shipments) ? data.shipments : [];
  const [selectedPreviewQuote, setSelectedPreviewQuote] = useState(null);

  return (
    <div className="customer-portal" data-testid="customer-portal-overview">
      <header className="cp-header">
        <div>
          <p className="cp-eyebrow">Customer portal</p>
          <h1>Welcome back, {firstName}</h1>
          <p>Quote, book, and track freight from one private workspace.</p>
        </div>
        <button type="button" className="cp-primary-action" onClick={onNewQuote}><Plus size={17} /> New quote</button>
      </header>

      <section className="cp-overview-band">
        <div className="cp-overview-copy">
          <span className="cp-live-label"><span /> FCTL network online</span>
          <h2>Your freight, clearly in view.</h2>
          <p>See every quote and shipment tied to your account, with direct access to the FCTL operations team.</p>
          <button type="button" onClick={onNewQuote}>Build a quote <ArrowRight size={17} /></button>
        </div>
        <div className="cp-lane-visual" aria-label="Shipment network status">
          <div className="cp-lane-node origin"><MapPin size={17} /><span>Pickup</span></div>
          <div className="cp-lane-track"><span className="cp-truck-marker"><Truck size={18} /></span></div>
          <div className="cp-lane-node destination"><PackageCheck size={17} /><span>Delivery</span></div>
          <div className="cp-lane-meta"><Route size={15} /> Account-wide shipment visibility</div>
        </div>
      </section>

      <section className="cp-metrics" aria-label="Account summary">
        <article><span className="cp-metric-icon blue"><Truck size={19} /></span><div><small>Active shipments</small><strong>{metrics.activeShipments || 0}</strong><p>Currently moving</p></div></article>
        <article><span className="cp-metric-icon amber"><CircleDollarSign size={19} /></span><div><small>Open quotes</small><strong>{metrics.openQuotes || 0}</strong><p>Awaiting confirmation</p></div></article>
        <article><span className="cp-metric-icon green"><CheckCircle2 size={19} /></span><div><small>Delivered</small><strong>{metrics.deliveredShipments || 0}</strong><p>Completed shipments</p></div></article>
        <article><span className="cp-metric-icon violet"><Boxes size={19} /></span><div><small>Total quotes</small><strong>{metrics.totalQuotes || 0}</strong><p>Account history</p></div></article>
      </section>

      {error && <div className="cp-data-message error">{error} <button type="button" onClick={onRefresh}>Try again</button></div>}

      <div className="cp-content-grid">
        <section className="cp-content-section cp-quotes-section">
          <div className="cp-section-header"><div><h2>Recent quotes</h2><p>Rates requested from this account</p></div><button type="button" onClick={onNewQuote}>New quote <Plus size={15} /></button></div>
          <div className="cp-table-wrap">
            {loading ? (
              <div className="cp-empty-state"><span className="cp-loading-line" /><span className="cp-loading-line short" /></div>
            ) : quotes.length ? (
              <table className="cp-table">
                <thead><tr><th>Reference</th><th>Lane</th><th>Equipment</th><th>Total</th><th>Status</th><th><span className="sr-only">View</span></th></tr></thead>
                <tbody>
                  {quotes.slice(0, 6).map(function(quote) {
                    const pickup = quote.shipment && quote.shipment.pickup && quote.shipment.pickup.location;
                    const delivery = quote.shipment && quote.shipment.delivery && quote.shipment.delivery.location;
                    return (
                      <tr key={quote.id}>
                        <td><strong>{quote.id}</strong><small>{formatDate(quote.submittedAt)}</small></td>
                        <td><span className="cp-route-cell">{locationLine(pickup)} <ArrowRight size={13} /> {locationLine(delivery)}</span></td>
                        <td>{quote.quote && quote.quote.truckType ? quote.quote.truckType : '-'}</td>
                        <td><strong>{formatCurrency(quote.quote && quote.quote.total)}</strong></td>
                        <td><span className={'cp-status ' + statusClass(quote.status)}>{quote.status || 'Pending'}</span></td>
                        <td>
                          {previewMode ? (
                            <button type="button" className="cp-row-link" onClick={function() { setSelectedPreviewQuote(quote); }} aria-label={'View quote ' + quote.id}><ChevronRight size={17} /></button>
                          ) : (
                            <Link className="cp-row-link" to={'/quotes/' + quote.id} aria-label={'View quote ' + quote.id}><ChevronRight size={17} /></Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="cp-empty-state"><CircleDollarSign size={25} /><strong>No quotes yet</strong><p>Build your first quote to compare LTL and dedicated equipment.</p><button type="button" onClick={onNewQuote}>Create first quote</button></div>
            )}
          </div>
        </section>

        <aside className="cp-support-panel">
          <div className="cp-support-icon"><Headphones size={21} /></div>
          <span>FCTL support</span>
          <h2>A person when you need one.</h2>
          <p>Your operations team can help with special handling, urgent recovery, and final capacity.</p>
          <a href="mailto:operations@firstclasstrucking.com">Contact operations <ArrowRight size={16} /></a>
          <div className="cp-support-hours"><Clock3 size={15} /><span><strong>Mon-Fri</strong> 8:00 AM-6:00 PM ET</span></div>
        </aside>
      </div>

      <section className="cp-content-section cp-shipments-section">
        <div className="cp-section-header"><div><h2>My shipments</h2><p>Current and recently completed moves</p></div><span className="cp-private-label"><ShieldCheck size={14} /> Private to your account</span></div>
        {loading ? (
          <div className="cp-empty-state"><span className="cp-loading-line" /><span className="cp-loading-line short" /></div>
        ) : shipments.length ? (
          <div className="cp-shipment-list">
            {shipments.slice(0, 5).map(function(shipment) {
              return (
                <article key={shipment.id}>
                  <span className="cp-shipment-icon"><Truck size={19} /></span>
                  <div className="cp-shipment-main"><strong>{shipment.loadNumber || 'Shipment'}</strong><p>{shipment.shipperLocation || shipment.shipper || 'Pickup pending'} <ArrowRight size={13} /> {shipment.consigneeLocation || shipment.consignee || 'Delivery pending'}</p></div>
                  <div className="cp-shipment-date"><CalendarClock size={15} /><span><small>Delivery</small>{formatDate(shipment.deliveryDate)}</span></div>
                  <span className={'cp-status ' + statusClass(shipment.status)}>{shipment.status || 'Pending'}</span>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="cp-empty-state compact"><Truck size={24} /><strong>No active shipments</strong><p>Approved quote requests will appear here once booked.</p></div>
        )}
      </section>

      {selectedPreviewQuote && (
        <div className="cp-quote-modal-backdrop" role="presentation" onMouseDown={function(event) { if (event.target === event.currentTarget) setSelectedPreviewQuote(null); }}>
          <section className="cp-quote-modal" role="dialog" aria-modal="true" aria-labelledby="preview-quote-title">
            <div className="cp-quote-modal-header">
              <div><span>Quote details</span><h2 id="preview-quote-title">{selectedPreviewQuote.id}</h2></div>
              <button type="button" onClick={function() { setSelectedPreviewQuote(null); }} aria-label="Close quote details" title="Close"><X size={18} /></button>
            </div>
            <div className="cp-quote-modal-lane">
              <span>{locationLine(selectedPreviewQuote.shipment && selectedPreviewQuote.shipment.pickup && selectedPreviewQuote.shipment.pickup.location)}</span>
              <ArrowRight size={16} />
              <span>{locationLine(selectedPreviewQuote.shipment && selectedPreviewQuote.shipment.delivery && selectedPreviewQuote.shipment.delivery.location)}</span>
            </div>
            <div className="cp-quote-modal-summary">
              <div><small>Equipment</small><strong>{selectedPreviewQuote.quote && selectedPreviewQuote.quote.truckType}</strong></div>
              <div><small>Requested</small><strong>{formatDate(selectedPreviewQuote.submittedAt)}</strong></div>
              <div><small>Total</small><strong>{formatCurrency(selectedPreviewQuote.quote && selectedPreviewQuote.quote.total)}</strong></div>
            </div>
            <div className="cp-quote-modal-footer">
              <span className={'cp-status ' + statusClass(selectedPreviewQuote.status)}>{selectedPreviewQuote.status}</span>
              <button type="button" onClick={onNewQuote}>Quote another lane <ArrowRight size={16} /></button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function CustomerPortalPage() {
  const { user, checking, setUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const previewMode = process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('preview') === '1';
  const previewUser = useMemo(function() {
    return previewMode ? {
      id: 'preview-customer',
      email: 'demo@fctlcustomer.com',
      firstName: 'Alex',
      lastName: 'Morgan',
      roles: ['customer']
    } : null;
  }, [previewMode]);
  const portalUser = useMemo(function() {
    return user || previewUser;
  }, [user, previewUser]);
  const [portalData, setPortalData] = useState(EMPTY_PORTAL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const quoteView = location.pathname === '/portal/quote';
  const previewSuffix = previewMode ? '?preview=1' : '';

  const fetchPortal = useCallback(async function() {
    if (previewMode) {
      setPortalData(PREVIEW_PORTAL);
      setLoading(false);
      setError('');
      return;
    }
    if (!portalUser) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(buildApiUrl('/api/customer/portal'), { credentials: 'include' });
      const data = await response.json().catch(function() { return null; });
      if (!response.ok) throw new Error((data && data.error) || 'Unable to load your account activity.');
      setPortalData({ ...EMPTY_PORTAL, ...(data || {}) });
    } catch (requestError) {
      setError(requestError && requestError.message ? requestError.message : 'Unable to load your account activity.');
    } finally {
      setLoading(false);
    }
  }, [portalUser, previewMode]);

  useEffect(function() {
    fetchPortal();
  }, [fetchPortal]);

  useEffect(function() {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const customerName = useMemo(function() {
    if (!portalUser) return '';
    return [portalUser.firstName, portalUser.lastName].filter(Boolean).join(' ') || portalUser.email;
  }, [portalUser]);

  if (checking && !previewMode) {
    return <div className="customer-portal-loading"><img src="/brand/logo.png" alt="First Class Trucking" /><span>Opening your portal...</span></div>;
  }

  if (!portalUser) {
    return <AuthForm onAuthed={function(authedUser) { setUser(authedUser); }} />;
  }

  return (
    <div className="app-layout customer-portal-layout">
      <Sidebar userOverride={portalUser} linkSuffix={previewSuffix} />
      <MobileMenuButton floating={true} />
      <main className="app-main">
        <div className="cp-account-bar">
          <div><span className="cp-account-avatar">{customerName.charAt(0).toUpperCase()}</span><span><small>Shipping account</small><strong>{customerName}</strong></span></div>
          <span className="cp-account-secure"><ShieldCheck size={15} /> Secure portal</span>
        </div>
        <div className="app-content">
          {quoteView ? (
            <CustomerQuoteBuilder
              user={portalUser}
              onBack={function() { navigate('/portal' + previewSuffix); }}
              onQuoteRequested={fetchPortal}
              previewMode={previewMode}
            />
          ) : (
            <CustomerPortalOverview
              user={portalUser}
              data={portalData}
              loading={loading}
              error={error}
              onNewQuote={function() { navigate('/portal/quote' + previewSuffix); }}
              onRefresh={fetchPortal}
              previewMode={previewMode}
            />
          )}
        </div>
      </main>
    </div>
  );
}
