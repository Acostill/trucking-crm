import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Inbox,
  Mail,
  PackageCheck,
  Send,
  Truck,
  Wifi,
  WifiOff
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import AuthForm from '../components/AuthForm';
import { buildApiUrl } from '../config';
import MobileMenuButton from '../components/MobileMenuButton';
import './DashboardPage.css';

const QUOTE_STATUS_LABELS = {
  received: 'Received',
  parsing: 'Parsing email',
  rating: 'Checking carriers',
  ready: 'Ready to price',
  needs_review: 'Needs review',
  failed: 'Action required',
  priced: 'Ready to send',
  sent: 'Quote sent'
};

function normalizedStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function formatDate(value, includeTime) {
  if (!value) return 'Date pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date pending';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {})
  });
}

function quoteLane(quote) {
  const shipment = (quote && quote.shipment) || {};
  const pickup = shipment.pickup && shipment.pickup.location;
  const delivery = shipment.delivery && shipment.delivery.location;
  const origin = [pickup && pickup.city, pickup && pickup.state].filter(Boolean).join(', ');
  const destination = [delivery && delivery.city, delivery && delivery.state].filter(Boolean).join(', ');
  return origin && destination ? origin + ' to ' + destination : 'Shipment details pending';
}

function loadLane(load) {
  const origin = (load.shipperLocation || load.shipper || 'Origin pending').split(',').slice(0, 2).join(',');
  const destination = (load.consigneeLocation || load.consignee || 'Destination pending').split(',').slice(0, 2).join(',');
  return { origin, destination };
}

function quoteTone(status) {
  if (status === 'failed' || status === 'needs_review') return 'attention';
  if (status === 'ready') return 'ready';
  if (status === 'priced' || status === 'sent') return 'complete';
  return 'working';
}

function DashboardMetric({ icon: Icon, label, value, detail, to, tone }) {
  const content = (
    <>
      <div className={'ops-dashboard-metric-icon ' + (tone || '')}>
        <Icon size={20} aria-hidden="true" />
      </div>
      <div className="ops-dashboard-metric-copy">
        <span className="ops-dashboard-metric-label">{label}</span>
        <strong className="ops-dashboard-metric-value">{value}</strong>
        <span className="ops-dashboard-metric-detail">{detail}</span>
      </div>
      {to && <ChevronRight className="ops-dashboard-metric-arrow" size={18} aria-hidden="true" />}
    </>
  );

  return to ? (
    <Link className="ops-dashboard-metric" to={to}>{content}</Link>
  ) : (
    <div className="ops-dashboard-metric">{content}</div>
  );
}

export default function DashboardPage() {
  const { user, checking, setUser } = useAuth();
  const [loads, setLoads] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [operationsHealth, setOperationsHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshWarning, setRefreshWarning] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const canManageQuotes = Boolean(
    user && Array.isArray(user.roles) && user.roles.indexOf('quote_approver') > -1
  );

  useEffect(function() {
    if (!user) return undefined;
    let cancelled = false;

    async function requestJson(path) {
      const response = await fetch(buildApiUrl(path), { credentials: 'include' });
      if (!response.ok) throw new Error('Request failed with status ' + response.status);
      return response.json();
    }

    async function loadDashboard(showLoading) {
      if (showLoading) setLoading(true);
      setRefreshWarning('');
      const requests = [
        requestJson('/api/loads'),
        requestJson('/api/operations/health')
      ];
      if (canManageQuotes) {
        requests.push(requestJson('/api/email-quotes?limit=75'));
      }

      const results = await Promise.allSettled(requests);
      if (cancelled) return;

      if (results[0].status === 'fulfilled' && Array.isArray(results[0].value)) {
        setLoads(results[0].value);
      }
      if (results[1].status === 'fulfilled') {
        setOperationsHealth(results[1].value);
      }
      if (canManageQuotes && results[2] && results[2].status === 'fulfilled' && Array.isArray(results[2].value)) {
        setQuotes(results[2].value);
      }
      if (results.some(function(result) { return result.status === 'rejected'; })) {
        setRefreshWarning('Some live counts could not be refreshed. Open the related workspace for the latest status.');
      }
      setLastUpdated(new Date());
      setLoading(false);
    }

    loadDashboard(true);
    const refreshTimer = window.setInterval(function() { loadDashboard(false); }, 30000);
    return function() {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [user, canManageQuotes]);

  const summary = useMemo(function() {
    const quoteCount = function(statuses) {
      return quotes.filter(function(quote) {
        return statuses.indexOf(normalizedStatus(quote.status)) > -1;
      }).length;
    };
    const loadCount = function(statuses) {
      return loads.filter(function(load) {
        return statuses.indexOf(normalizedStatus(load.status)) > -1;
      }).length;
    };

    return {
      quoteAttention: quoteCount(['needs_review', 'failed']),
      quoteWorking: quoteCount(['received', 'parsing', 'rating']),
      readyToPrice: quoteCount(['ready']),
      readyToSend: quoteCount(['priced']),
      quoteSent: quoteCount(['sent']),
      newLoads: loadCount(['new quote', 'quoted']),
      booked: loadCount(['booked', 'pending']),
      inTransit: loadCount(['in transit']),
      delivered: loadCount(['delivered', 'invoiced', 'paid'])
    };
  }, [loads, quotes]);

  const actionableQuotes = summary.quoteAttention + summary.quoteWorking + summary.readyToPrice;
  const recentQuotes = quotes.slice(0, 4);
  const recentLoads = loads.slice(0, 4);
  const mailbox = operationsHealth && operationsHealth.gmail;
  const datHealth = operationsHealth && operationsHealth.dat;
  const mailboxState = !mailbox
    ? 'unknown'
    : ['online', 'checking'].indexOf(mailbox.state) > -1
      ? 'online'
      : 'offline';
  const datState = !datHealth
    ? 'unknown'
    : ['online', 'working'].indexOf(datHealth.state) > -1
      ? 'online'
      : 'offline';
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  const queueItems = [
    ...(canManageQuotes ? [
      ...((mailbox && ['online', 'checking', 'starting'].indexOf(mailbox.state) === -1) ? [{
        key: 'gmail-health',
        count: 1,
        title: 'Inbound quote mailbox needs attention',
        detail: mailbox.lastError || 'Automatic Gmail intake is not currently healthy.',
        to: '/email-quotes',
        tone: 'attention',
        icon: WifiOff
      }] : []),
      ...((datHealth && ['online', 'working'].indexOf(datHealth.state) === -1) ? [{
        key: 'dat-health',
        count: datHealth.pending || datHealth.needsAuth || 1,
        title: datHealth.state === 'needs_auth' ? 'DAT sign-in required' : 'DAT worker needs attention',
        detail: datHealth.state === 'offline'
          ? 'The worker has stopped checking the approved-job queue.'
          : datHealth.state === 'disabled'
            ? 'DAT automation is disabled on the server.'
            : 'Review the DAT worker before approving another lookup.',
        to: '/email-quotes',
        tone: 'attention',
        icon: Activity
      }] : []),
      {
        key: 'review',
        count: summary.quoteAttention,
        title: 'Quote details need review',
        detail: 'Correct missing shipment information before pricing.',
        to: '/email-quotes',
        tone: 'attention',
        icon: AlertTriangle
      },
      {
        key: 'price',
        count: summary.readyToPrice,
        title: 'Requests ready for pricing',
        detail: 'Compare carrier costs, approve DAT if needed, and set the margin.',
        to: '/email-quotes',
        tone: 'ready',
        icon: CircleDollarSign
      },
      {
        key: 'send',
        count: summary.readyToSend,
        title: 'Client quotes ready to send',
        detail: 'Review the final price and email it to the customer.',
        to: '/email-quotes',
        tone: 'complete',
        icon: Send
      }
    ] : []),
    {
      key: 'transit',
      count: summary.inTransit,
      title: 'Shipments currently in transit',
      detail: 'Confirm progress, delivery timing, and any active exceptions.',
      to: '/loads',
      tone: 'transit',
      icon: Truck
    }
  ].filter(function(item) { return item.count > 0; });

  if (checking) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="app-main"><div className="app-loading">Checking session…</div></main>
      </div>
    );
  }

  if (!user) return <AuthForm onAuthed={function(authedUser) { setUser(authedUser); }} />;

  return (
    <div className="app-layout">
      <Sidebar />
      <MobileMenuButton floating={true} />
      <main className="app-main">
        <div className="app-content">
          <div className="ops-dashboard">
            <section className="ops-dashboard-hero">
              <div className="ops-dashboard-hero-copy">
                <span className="ops-dashboard-eyebrow">Operations overview</span>
                <h1>{getGreeting()}, {getUserName(user)}</h1>
                <p>
                  Review inbound requests, price the shipment, send the customer quote,
                  then manage booked freight through delivery.
                </p>
                <div className="ops-dashboard-hero-actions">
                  {canManageQuotes && (
                    <Link to="/email-quotes" className="ops-dashboard-primary-action">
                      <Inbox size={17} aria-hidden="true" />
                      Open Quote Inbox
                    </Link>
                  )}
                  <Link to="/pipeline" className="ops-dashboard-secondary-action">
                    View Pipeline <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div className="ops-dashboard-hero-status">
                <span className="ops-dashboard-date">{todayLabel}</span>
                {canManageQuotes ? (
                  <div className="ops-dashboard-integrations">
                    <div className={'ops-dashboard-connection ' + mailboxState}>
                      {mailboxState === 'online' ? <Wifi size={18} aria-hidden="true" /> : mailboxState === 'offline' ? <WifiOff size={18} aria-hidden="true" /> : <Clock3 size={18} aria-hidden="true" />}
                      <div>
                        <strong>{mailboxState === 'online' ? 'Quote mailbox connected' : mailboxState === 'offline' ? 'Quote mailbox needs attention' : 'Checking quote mailbox'}</strong>
                        <span>{mailboxState === 'online'
                          ? (mailbox.connectedAddress || mailbox.mailboxAddress || 'Inbound requests are active')
                          : mailbox && mailbox.lastError
                            ? mailbox.lastError
                            : 'Open Quote Inbox to review the connection.'}</span>
                      </div>
                    </div>
                    <div className={'ops-dashboard-connection ' + datState}>
                      {datState === 'online' ? <Activity size={18} aria-hidden="true" /> : datState === 'offline' ? <WifiOff size={18} aria-hidden="true" /> : <Clock3 size={18} aria-hidden="true" />}
                      <div>
                        <strong>{datState === 'online'
                          ? (datHealth && datHealth.state === 'working' ? 'DAT worker running a lookup' : 'DAT worker connected')
                          : datHealth && datHealth.state === 'needs_auth'
                            ? 'DAT sign-in required'
                            : datState === 'offline'
                              ? 'DAT worker needs attention'
                              : 'Checking DAT worker'}</strong>
                        <span>{datHealth && datHealth.worker && datHealth.worker.lastSeenAt
                          ? 'Last seen ' + formatDate(datHealth.worker.lastSeenAt, true)
                          : 'Waiting for a live worker heartbeat.'}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="ops-dashboard-connection neutral">
                    <PackageCheck size={18} aria-hidden="true" />
                    <div><strong>Shipment workspace</strong><span>Your account is ready for operations.</span></div>
                  </div>
                )}
                <span className="ops-dashboard-updated">
                  {loading ? 'Refreshing live work…' : 'Updated ' + formatDate(lastUpdated, true)}
                </span>
              </div>
            </section>

            {refreshWarning && <div className="ops-dashboard-warning"><AlertTriangle size={16} />{refreshWarning}</div>}

            <section className="ops-dashboard-metrics" aria-label="Current workload">
              {canManageQuotes ? (
                <>
                  <DashboardMetric
                    icon={Inbox}
                    label="Quote inbox"
                    value={loading ? '—' : actionableQuotes}
                    detail="Awaiting staff action"
                    to="/email-quotes"
                    tone="blue"
                  />
                  <DashboardMetric
                    icon={CircleDollarSign}
                    label="Ready to price"
                    value={loading ? '—' : summary.readyToPrice}
                    detail="Carrier comparison next"
                    to="/email-quotes"
                    tone="amber"
                  />
                </>
              ) : (
                <>
                  <DashboardMetric
                    icon={PackageCheck}
                    label="Open shipment work"
                    value={loading ? '—' : summary.newLoads + summary.booked + summary.inTransit}
                    detail="Across active stages"
                    to="/loads"
                    tone="blue"
                  />
                  <DashboardMetric
                    icon={Clock3}
                    label="Booked / pending"
                    value={loading ? '—' : summary.booked}
                    detail="Preparing to move"
                    to="/pipeline"
                    tone="amber"
                  />
                </>
              )}
              <DashboardMetric
                icon={Truck}
                label="In transit"
                value={loading ? '—' : summary.inTransit}
                detail="Active shipments"
                to="/loads"
                tone="green"
              />
              <DashboardMetric
                icon={CheckCircle2}
                label="Completed"
                value={loading ? '—' : summary.delivered}
                detail="Delivered or closed"
                to="/pipeline"
                tone="slate"
              />
            </section>

            <section className="ops-dashboard-section">
              <div className="ops-dashboard-section-heading">
                <div>
                  <span className="ops-dashboard-section-kicker">How work moves</span>
                  <h2>One clear workflow from email to delivery</h2>
                  <p>Each step opens the workspace where that action is completed.</p>
                </div>
              </div>

              <div className="ops-dashboard-workflow">
                <WorkflowStep
                  number="01"
                  title="Review intake"
                  detail="Confirm the shipment details parsed from the customer email."
                  metric={canManageQuotes ? actionableQuotes + ' open' : 'Quote desk'}
                  to={canManageQuotes ? '/email-quotes' : null}
                  icon={Mail}
                />
                <WorkflowStep
                  number="02"
                  title="Price the shipment"
                  detail="Choose the truck, compare carriers and DAT, then apply margin."
                  metric={canManageQuotes ? summary.readyToPrice + ' ready' : 'Quote desk'}
                  to={canManageQuotes ? '/email-quotes' : null}
                  icon={CircleDollarSign}
                />
                <WorkflowStep
                  number="03"
                  title="Send the quote"
                  detail="Approve the client price and send it from the quote record."
                  metric={canManageQuotes ? summary.readyToSend + ' to send' : 'Quote desk'}
                  to={canManageQuotes ? '/email-quotes' : null}
                  icon={Send}
                />
                <WorkflowStep
                  number="04"
                  title="Manage the move"
                  detail="Track booked freight in Pipeline and Shipments through delivery."
                  metric={summary.inTransit + ' in transit'}
                  to="/pipeline"
                  icon={Truck}
                  last
                />
              </div>
            </section>

            <div className="ops-dashboard-main-grid">
              <section className="ops-dashboard-panel ops-dashboard-queue-panel">
                <div className="ops-dashboard-panel-header">
                  <div>
                    <span className="ops-dashboard-section-kicker">Priority queue</span>
                    <h2>What needs attention</h2>
                  </div>
                  <span className="ops-dashboard-panel-count">{queueItems.length} active</span>
                </div>

                <div className="ops-dashboard-queue">
                  {loading ? (
                    <div className="ops-dashboard-empty"><Clock3 size={20} /><span>Loading current work…</span></div>
                  ) : queueItems.length === 0 ? (
                    <div className="ops-dashboard-empty success">
                      <CheckCircle2 size={22} />
                      <div><strong>You are caught up</strong><span>No active items need attention right now.</span></div>
                    </div>
                  ) : queueItems.map(function(item) {
                    const Icon = item.icon;
                    return (
                      <Link key={item.key} to={item.to} className="ops-dashboard-queue-item">
                        <div className={'ops-dashboard-queue-icon ' + item.tone}><Icon size={18} /></div>
                        <div className="ops-dashboard-queue-copy">
                          <strong>{item.title}</strong>
                          <span>{item.detail}</span>
                        </div>
                        <span className={'ops-dashboard-queue-count ' + item.tone}>{item.count}</span>
                        <ChevronRight size={18} className="ops-dashboard-queue-arrow" />
                      </Link>
                    );
                  })}
                </div>
              </section>

              <section className="ops-dashboard-panel ops-dashboard-stage-panel">
                <div className="ops-dashboard-panel-header">
                  <div>
                    <span className="ops-dashboard-section-kicker">Shipment stages</span>
                    <h2>Current pipeline</h2>
                  </div>
                  <Link to="/pipeline" className="ops-dashboard-text-link">Open board <ArrowRight size={14} /></Link>
                </div>
                <div className="ops-dashboard-stage-list">
                  <StageRow label="New / quoted" value={summary.newLoads} total={loads.length} tone="new" />
                  <StageRow label="Booked / pending" value={summary.booked} total={loads.length} tone="booked" />
                  <StageRow label="In transit" value={summary.inTransit} total={loads.length} tone="transit" />
                  <StageRow label="Completed" value={summary.delivered} total={loads.length} tone="complete" />
                </div>
              </section>
            </div>

            <section className="ops-dashboard-section">
              <div className="ops-dashboard-section-heading row">
                <div>
                  <span className="ops-dashboard-section-kicker">Recent work</span>
                  <h2>Pick up where the team left off</h2>
                </div>
                <Link to={canManageQuotes ? '/email-quotes' : '/loads'} className="ops-dashboard-text-link">
                  View all <ArrowRight size={14} />
                </Link>
              </div>

              <div className={'ops-dashboard-recent-grid ' + (!canManageQuotes ? 'single' : '')}>
                {canManageQuotes && (
                  <RecentQuotes quotes={recentQuotes} loading={loading} />
                )}
                <RecentShipments loads={recentLoads} loading={loading} />
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function WorkflowStep({ number, title, detail, metric, to, icon: Icon, last }) {
  const content = (
    <>
      <div className="ops-dashboard-workflow-topline">
        <span className="ops-dashboard-workflow-number">{number}</span>
        <span className="ops-dashboard-workflow-metric">{metric}</span>
      </div>
      <div className="ops-dashboard-workflow-icon"><Icon size={21} aria-hidden="true" /></div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {to && <span className="ops-dashboard-workflow-link">Open workspace <ArrowRight size={14} /></span>}
      {!last && <span className="ops-dashboard-workflow-connector" aria-hidden="true"><ChevronRight size={18} /></span>}
    </>
  );
  return to ? (
    <Link to={to} className="ops-dashboard-workflow-step">{content}</Link>
  ) : (
    <div className="ops-dashboard-workflow-step muted">{content}</div>
  );
}

function StageRow({ label, value, total, tone }) {
  const width = total > 0 && value > 0 ? Math.max(4, Math.round((value / total) * 100)) : 0;
  return (
    <div className="ops-dashboard-stage-row">
      <div className="ops-dashboard-stage-label"><span>{label}</span><strong>{value}</strong></div>
      <div className="ops-dashboard-stage-track">
        <span className={'ops-dashboard-stage-fill ' + tone} style={{ width: width + '%' }} />
      </div>
    </div>
  );
}

function RecentQuotes({ quotes, loading }) {
  return (
    <article className="ops-dashboard-panel ops-dashboard-recent-panel">
      <div className="ops-dashboard-panel-header compact">
        <div className="ops-dashboard-panel-title"><Inbox size={18} /><h3>Latest quote requests</h3></div>
        <Link to="/email-quotes" className="ops-dashboard-text-link">Quote Inbox</Link>
      </div>
      <div className="ops-dashboard-recent-list">
        {loading ? (
          <div className="ops-dashboard-empty"><Clock3 size={20} /><span>Loading quote requests…</span></div>
        ) : quotes.length === 0 ? (
          <div className="ops-dashboard-empty"><Mail size={20} /><span>No quote requests yet.</span></div>
        ) : quotes.map(function(quote) {
          const status = normalizedStatus(quote.status);
          return (
            <Link to="/email-quotes" className="ops-dashboard-recent-item" key={quote.id}>
              <div className="ops-dashboard-recent-copy">
                <strong>{quote.subject || 'Untitled quote request'}</strong>
                <span>{quoteLane(quote)}</span>
                <small>{(quote.sender && (quote.sender.name || quote.sender.email)) || 'Sender pending'} · {formatDate(quote.receivedAt, true)}</small>
              </div>
              <span className={'ops-dashboard-quote-status ' + quoteTone(status)}>
                {QUOTE_STATUS_LABELS[status] || 'Received'}
              </span>
            </Link>
          );
        })}
      </div>
    </article>
  );
}

function RecentShipments({ loads, loading }) {
  return (
    <article className="ops-dashboard-panel ops-dashboard-recent-panel">
      <div className="ops-dashboard-panel-header compact">
        <div className="ops-dashboard-panel-title"><Truck size={18} /><h3>Latest shipments</h3></div>
        <Link to="/loads" className="ops-dashboard-text-link">Shipments</Link>
      </div>
      <div className="ops-dashboard-recent-list">
        {loading ? (
          <div className="ops-dashboard-empty"><Clock3 size={20} /><span>Loading shipments…</span></div>
        ) : loads.length === 0 ? (
          <div className="ops-dashboard-empty"><Truck size={20} /><span>No shipments created yet.</span></div>
        ) : loads.map(function(load) {
          const lane = loadLane(load);
          return (
            <Link to="/loads" className="ops-dashboard-recent-item" key={load.id}>
              <div className="ops-dashboard-load-mark">{String(load.customer || '?').charAt(0).toUpperCase()}</div>
              <div className="ops-dashboard-recent-copy">
                <strong>{load.loadNumber || 'Load pending'} · {load.customer || 'Customer pending'}</strong>
                <span className="ops-dashboard-inline-lane">{lane.origin}<ArrowRight size={12} />{lane.destination}</span>
                <small>{load.shipDate ? 'Pickup ' + formatDate(load.shipDate, false) : 'Pickup date pending'}</small>
              </div>
              <StatusBadge status={load.status || 'Pending'} />
            </Link>
          );
        })}
      </div>
    </article>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getUserName(user) {
  if (user && user.firstName) return user.firstName;
  if (user && user.email) return user.email.split('@')[0];
  return 'team';
}
