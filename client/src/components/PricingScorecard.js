import React, { useEffect, useState } from 'react';
import { buildApiUrl } from '../config';

function pct(value) {
  return value == null ? '—' : Number(value).toFixed(1) + '%';
}

function money(value) {
  return value == null ? '—' : '$' + Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

const SOURCE_LABELS = { forwardAir: 'Forward Air', expediteAll: 'ExpediteAll', manualQuote: 'Recorded by staff' };

/**
 * Broker scorecard: win rate, margin actually earned after the truck was
 * paid, and how many carrier rate requests each booking cost.
 */
export default function PricingScorecard() {
  const [days, setDays] = useState(90);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(function() {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const resp = await fetch(buildApiUrl('/api/email-quotes/reports/pricing?days=' + days), { credentials: 'include' });
        const data = await resp.json().catch(function() { return null; });
        if (!resp.ok) throw new Error((data && data.error) || 'Failed to load the scorecard');
        if (!cancelled) setReport(data);
      } catch (err) {
        if (!cancelled) setError(err && err.message ? err.message : 'Failed to load the scorecard');
      }
    }
    load();
    return function() { cancelled = true; };
  }, [days]);

  const summary = report && report.summary;
  return (
    <div className="profit-margin-card">
      <div className="pricing-card-heading">
        <div>
          <h2 className="pricing-card-title">Pricing scorecard</h2>
          <p className="pricing-card-help">Enter the carrier pay on every covered load (on the load or the quote) so actual margin and lane history fill in.</p>
        </div>
        <select value={days} onChange={function(e) { setDays(Number(e.target.value)); }}>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
        </select>
      </div>
      {error && <div className="admin-message error">{error}</div>}
      {summary && (
        <>
          <div className="pricing-stats">
            <div><span>Quotes</span><strong>{summary.quotes}</strong></div>
            <div><span>Win rate</span><strong>{pct(summary.winRatePct)}</strong></div>
            <div><span>Quoted margin</span><strong>{pct(summary.quotedMarginPct)}</strong></div>
            <div><span>Actual margin</span><strong>{pct(summary.actualMarginPct)}</strong></div>
            <div><span>Gross profit</span><strong>{money(summary.grossProfit)}</strong></div>
          </div>

          <h3 className="pricing-subtitle">Trial run: staff price vs system suggestion</h3>
          {report.trial && report.trial.length ? (
            <div className="pricing-table-wrap">
              <table className="pricing-table">
                <thead><tr><th>Load type</th><th>Quotes compared</th><th>Staff vs system</th><th>Within 5%</th><th>Covered loads</th><th>System buy-rate error</th></tr></thead>
                <tbody>
                  {report.trial.map(function(row) {
                    return (
                      <tr key={row.mode}>
                        <td>{row.mode}</td>
                        <td>{row.compared}</td>
                        <td>{row.staffVsSystemPct == null ? '—' : (row.staffVsSystemPct > 0 ? '+' : '') + row.staffVsSystemPct + '%'}</td>
                        <td>{pct(row.withinFivePct)}</td>
                        <td>{row.covered}</td>
                        <td>{row.truckCostErrorPct == null ? '—' : '±' + row.truckCostErrorPct + '%'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="pricing-card-help">Fills in as staff price quotes. "Staff vs system" above 0% means staff priced higher than the system would have.</p>}

          <h3 className="pricing-subtitle">Carrier rate requests</h3>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead><tr><th>Source</th><th>Live requests</th><th>Reused from history</th><th>Loads awarded on it</th><th>Requests per booking</th></tr></thead>
              <tbody>
                {report.carrierRequests.map(function(row) {
                  return (
                    <tr key={row.source}>
                      <td>{SOURCE_LABELS[row.source] || row.source}</td>
                      <td>{row.liveRequests}</td>
                      <td>{row.reusedFromHistory}</td>
                      <td>{row.awardedOnRate}</td>
                      <td>{row.requestsPerBooking == null ? '—' : row.requestsPerBooking}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td>DAT RateView</td>
                  <td>{report.datRateView.searches}</td>
                  <td>{report.datRateView.reusedAcrossQuotes}</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="pricing-subtitle">Top lanes</h3>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead><tr><th>Lane</th><th>Equipment</th><th>Quotes</th><th>Won</th><th>Win rate</th><th>Avg quoted</th><th>Avg carrier pay</th></tr></thead>
              <tbody>
                {report.lanes.map(function(row) {
                  return (
                    <tr key={row.lane + row.truckType}>
                      <td>{row.lane}</td>
                      <td>{row.truckType}</td>
                      <td>{row.quotes}</td>
                      <td>{row.awarded}</td>
                      <td>{pct(row.winRatePct)}</td>
                      <td>{money(row.avgQuoted)}</td>
                      <td>{money(row.avgTruckCost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
