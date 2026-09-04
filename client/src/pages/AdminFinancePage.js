import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Clock3,
  MailCheck,
  RefreshCw,
  Target,
  Trophy,
  UsersRound
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import MobileMenuButton from '../components/MobileMenuButton';
import AuthForm from '../components/AuthForm';
import { useAuth } from '../context/AuthContext';
import { buildApiUrl } from '../config';
import { userCanManageQuotes } from '../utils/accessControl';
import './ClientResultsPage.css';

const RANGE_OPTIONS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
  { value: 'all', label: 'All time' }
];

const PREVIEW_USER = { email: 'operations@truckfirstclass.com', firstName: 'Operations', roles: ['admin', 'quote_approver'] };
const PREVIEW_DATA = {
  summary: { requests: 52, sent: 38, awarded: 14, lost: 9, open: 15, followUpsDue: 4, quotedValue: 82450, awardedValue: 32750, lostValue: 18600, awardedGrossProfit: 6840, winRatePct: 60.9 },
  customers: [
    { customerEmail: 'shipping@acmefoods.com', customerName: 'Acme Foods', sent: 11, awarded: 5, lost: 2, open: 4, winRatePct: 71.4, awardedValue: 12800, lastActivityAt: '2026-09-04T15:00:00Z' },
    { customerEmail: 'logistics@northstar.com', customerName: 'Northstar Imports', sent: 9, awarded: 3, lost: 3, open: 3, winRatePct: 50, awardedValue: 7600, lastActivityAt: '2026-09-03T15:00:00Z' },
    { customerEmail: 'ops@freshmarket.com', customerName: 'Fresh Market', sent: 7, awarded: 3, lost: 1, open: 3, winRatePct: 75, awardedValue: 6850, lastActivityAt: '2026-09-02T15:00:00Z' },
    { customerEmail: 'rfq@pacificair.com', customerName: 'Pacific Air Cargo', sent: 6, awarded: 2, lost: 2, open: 2, winRatePct: 50, awardedValue: 3800, lastActivityAt: '2026-08-31T15:00:00Z' },
    { customerEmail: 'sales@metrotrade.com', customerName: 'Metro Trade', sent: 5, awarded: 1, lost: 1, open: 3, winRatePct: 50, awardedValue: 1700, lastActivityAt: '2026-08-28T15:00:00Z' }
  ]
};

function currency(value) {
  const amount = Number(value) || 0;
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });
}

function dateLabel(value) {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity yet';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function customerLabel(customer) {
  if (!customer) return 'Unknown customer';
  const name = String(customer.customerName || '').trim();
  const email = String(customer.customerEmail || '').trim();
  if (name && name.toLowerCase() !== email.toLowerCase()) return name;
  return email || 'Unknown customer';
}

function MetricCard({ icon: Icon, tone, label, value, detail }) {
  return (
    <article className={'client-results-metric ' + tone}>
      <div className="client-results-metric-icon"><Icon size={20} aria-hidden="true" /></div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

export default function AdminFinancePage() {
  const { user, checking, setUser } = useAuth();
  const previewMode = process.env.NODE_ENV === 'development' && new URLSearchParams(window.location.search).get('preview') === '1';
  const [range, setRange] = useState('90');
  const [data, setData] = useState(previewMode ? PREVIEW_DATA : { summary: {}, customers: [] });
  const [loading, setLoading] = useState(!previewMode);
  const [error, setError] = useState('');
  const canView = previewMode || userCanManageQuotes(user);

  useEffect(function() {
    if (previewMode || !user || !canView) return undefined;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(
          buildApiUrl('/api/operations/customer-performance?range=' + encodeURIComponent(range)),
          { credentials: 'include', cache: 'no-store' }
        );
        const payload = await response.json().catch(function() { return null; });
        if (!response.ok) throw new Error((payload && payload.error) || 'Could not load client results.');
        if (!cancelled) setData(payload || { summary: {}, customers: [] });
      } catch (err) {
        if (!cancelled) setError(err && err.message ? err.message : 'Could not load client results.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return function() { cancelled = true; };
  }, [user, canView, range, previewMode]);

  const summary = data.summary || {};
  const customers = Array.isArray(data.customers) ? data.customers : [];
  const decided = (Number(summary.awarded) || 0) + (Number(summary.lost) || 0);
  const decisionMix = useMemo(function() {
    if (!decided) return { won: 0, lost: 0 };
    return {
      won: ((Number(summary.awarded) || 0) / decided) * 100,
      lost: ((Number(summary.lost) || 0) / decided) * 100
    };
  }, [summary.awarded, summary.lost, decided]);

  if (checking && !previewMode) {
    return <div className="app-layout"><Sidebar /><main className="app-main"><div className="app-loading">Checking session…</div></main></div>;
  }
  if (!user && !previewMode) return <AuthForm onAuthed={function(authedUser) { setUser(authedUser); }} />;

  return (
    <div className="app-layout">
      <Sidebar userOverride={previewMode ? PREVIEW_USER : undefined} linkSuffix={previewMode ? '?preview=1' : ''} />
      <MobileMenuButton floating={true} />
      <main className="app-main">
        <div className="app-content client-results-page">
          <header className="client-results-hero">
            <div>
              <span className="client-results-eyebrow">Commercial performance</span>
              <h1>Client results</h1>
              <p>See which customer offers were won, lost, or still open—and the value behind each outcome.</p>
            </div>
            <label className="client-results-range">
              <span>Reporting period</span>
              <select value={range} onChange={function(event) { setRange(event.target.value); }}>
                {RANGE_OPTIONS.map(function(option) {
                  return <option value={option.value} key={option.value}>{option.label}</option>;
                })}
              </select>
            </label>
          </header>

          {!canView ? (
            <div className="client-results-state error"><AlertCircle size={20} />Quote-approver access is required to view client results.</div>
          ) : error ? (
            <div className="client-results-state error"><AlertCircle size={20} />{error}</div>
          ) : (
            <>
              <section className="client-results-metrics" aria-label="Client outcome summary">
                <MetricCard icon={MailCheck} tone="blue" label="Offers sent" value={loading ? '—' : summary.sent || 0} detail={currency(summary.quotedValue) + ' quoted'} />
                <MetricCard icon={Trophy} tone="green" label="Won" value={loading ? '—' : summary.awarded || 0} detail={currency(summary.awardedValue) + ' awarded'} />
                <MetricCard icon={ArrowDownRight} tone="rose" label="Lost" value={loading ? '—' : summary.lost || 0} detail={currency(summary.lostValue) + ' declined'} />
                <MetricCard icon={Target} tone="navy" label="Win rate" value={loading ? '—' : (summary.winRatePct || 0) + '%'} detail="Won ÷ decided offers" />
                <MetricCard icon={Clock3} tone="amber" label="Still open" value={loading ? '—' : summary.open || 0} detail={(summary.followUpsDue || 0) + ' follow-ups due'} />
                <MetricCard icon={CircleDollarSign} tone="teal" label="Won gross profit" value={loading ? '—' : currency(summary.awardedGrossProfit)} detail="Client price minus carrier cost" />
              </section>

              <section className="client-results-panel client-results-outcome-panel">
                <div className="client-results-panel-heading">
                  <div><span>Decision overview</span><h2>Won vs. lost offers</h2></div>
                  <small>{decided} decided offer{decided === 1 ? '' : 's'}</small>
                </div>
                {decided ? (
                  <>
                    <div className="client-results-outcome-bar" aria-label={(summary.winRatePct || 0) + '% won'}>
                      <span className="won" style={{ width: decisionMix.won + '%' }} />
                      <span className="lost" style={{ width: decisionMix.lost + '%' }} />
                    </div>
                    <div className="client-results-outcome-legend">
                      <span><i className="won" />{summary.awarded || 0} won <strong>{Math.round(decisionMix.won)}%</strong></span>
                      <span><i className="lost" />{summary.lost || 0} lost <strong>{Math.round(decisionMix.lost)}%</strong></span>
                    </div>
                  </>
                ) : (
                  <div className="client-results-empty">Mark sent quotes as won or lost in Quote Inbox to build this view.</div>
                )}
              </section>

              <section className="client-results-panel">
                <div className="client-results-panel-heading">
                  <div><span>Customer detail</span><h2>Performance by client</h2></div>
                  <small><UsersRound size={15} /> {customers.length} client{customers.length === 1 ? '' : 's'}</small>
                </div>
                {loading ? (
                  <div className="client-results-state"><RefreshCw className="spinning" size={20} />Loading live outcomes…</div>
                ) : customers.length ? (
                  <div className="client-results-table-wrap">
                    <table className="client-results-table">
                      <thead><tr><th>Client</th><th>Sent</th><th>Won</th><th>Lost</th><th>Open</th><th>Win rate</th><th>Awarded value</th><th>Last activity</th></tr></thead>
                      <tbody>
                        {customers.map(function(customer) {
                          return (
                            <tr key={customer.customerEmail}>
                              <td><strong>{customerLabel(customer)}</strong><span>{customer.customerEmail !== 'unknown' ? customer.customerEmail : 'Email unavailable'}</span></td>
                              <td>{customer.sent}</td>
                              <td><span className="client-results-count won"><ArrowUpRight size={13} />{customer.awarded}</span></td>
                              <td><span className="client-results-count lost"><ArrowDownRight size={13} />{customer.lost}</span></td>
                              <td>{customer.open}</td>
                              <td><strong>{customer.winRatePct}%</strong></td>
                              <td>{currency(customer.awardedValue)}</td>
                              <td>{dateLabel(customer.lastActivityAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="client-results-empty">No client quote activity was recorded in this reporting period.</div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
