import React, { useEffect, useState } from 'react';
import { buildApiUrl } from '../config';

function money(value, digits = 0) {
  return value == null ? '—' : '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function signed(value, suffix) {
  if (value == null) return '—';
  return (value > 0 ? '+' : '') + value + suffix;
}

/**
 * What changed in the market since rates were set: diesel, how the rate
 * table compares with live ExpediteAll prices, and DAT lane moves. Rate
 * changes are suggestions an admin applies with one click.
 */
export default function MarketWatch({ reloadKey, onApplied }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  async function request(path, options) {
    const resp = await fetch(buildApiUrl(path), { credentials: 'include', ...options });
    const data = await resp.json().catch(function() { return null; });
    if (!resp.ok) throw new Error((data && data.error) || 'Request failed');
    return data;
  }

  useEffect(function() {
    let cancelled = false;
    request('/api/admin/market-report')
      .then(function(data) { if (!cancelled) setReport(data); })
      .catch(function(err) { if (!cancelled) setError(err.message); });
    return function() { cancelled = true; };
  }, [reloadKey]);

  async function refreshDiesel() {
    setBusy('refresh');
    setError(null);
    try {
      setReport(await request('/api/admin/market-data/refresh', { method: 'POST' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function apply(vehicleType) {
    setBusy(vehicleType);
    setError(null);
    try {
      const data = await request('/api/admin/expedite-rate-rules/' + encodeURIComponent(vehicleType) + '/apply-suggestion', { method: 'POST' });
      setReport(data.report);
      if (onApplied) onApplied();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const diesel = report && report.diesel;
  return (
    <div className="profit-margin-card">
      <div className="pricing-card-heading">
        <div>
          <h2 className="pricing-card-title">Market watch</h2>
          <p className="pricing-card-help">What moved since your rates were set. Fuel is applied to quotes automatically; rate changes wait for your approval.</p>
        </div>
        <button className="primary-btn" onClick={refreshDiesel} disabled={busy === 'refresh'}>
          {busy === 'refresh' ? 'Refreshing…' : 'Refresh diesel'}
        </button>
      </div>
      {error && <div className="admin-message error">{error}</div>}
      {report && (
        <>
          <div className="pricing-stats">
            <div><span>U.S. diesel{diesel.latest ? ' · week of ' + diesel.latest.period : ''}</span><strong>{diesel.latest ? money(diesel.latest.value, 2) + '/gal' : 'No data'}</strong></div>
            <div><span>vs last week</span><strong>{signed(diesel.weekChangePct, '%')}</strong></div>
            <div><span>vs 4 weeks ago</span><strong>{signed(diesel.monthChangePct, '%')}</strong></div>
          </div>

          <h3 className="pricing-subtitle">Rate table vs ExpediteAll</h3>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead><tr><th>Vehicle</th><th>Rates</th><th>Fuel now</th><th>ExpediteAll prices compared</th><th>Table vs ExpediteAll</th></tr></thead>
              <tbody>
                {report.vehicles.length ? report.vehicles.map(function(row) {
                  return (
                    <tr key={row.vehicleType}>
                      <td>{row.vehicleType}</td>
                      <td>{money(row.baseCharge) + ' + ' + money(row.ratePerMile, 2) + '/mi'}</td>
                      <td>{row.fuelPerMileNow == null ? '—' : (row.fuelPerMileNow >= 0 ? '+' : '−') + '$' + Math.abs(row.fuelPerMileNow).toFixed(3) + '/mi'}</td>
                      <td>{row.expediteAllSamples}</td>
                      <td>{row.tableVsExpediteAllPct == null ? 'Not enough data' : signed(row.tableVsExpediteAllPct, '%')}</td>
                    </tr>
                  );
                }) : <tr><td colSpan="5">Set a rate in the table above to start tracking it.</td></tr>}
              </tbody>
            </table>
          </div>

          {report.suggestions.map(function(suggestion) {
            return (
              <div className="market-suggestion" key={suggestion.vehicleType}>
                <div>
                  <strong>{suggestion.vehicleType}: {money(suggestion.current.baseCharge)} + {money(suggestion.current.ratePerMile, 2)}/mi → {money(suggestion.suggested.baseCharge)} + {money(suggestion.suggested.ratePerMile, 2)}/mi (min {money(suggestion.suggested.minimumCharge)})</strong>
                  <small>{suggestion.reason}</small>
                </div>
                <button className="primary-btn" onClick={function() { apply(suggestion.vehicleType); }} disabled={busy === suggestion.vehicleType}>
                  {busy === suggestion.vehicleType ? 'Applying…' : 'Apply'}
                </button>
              </div>
            );
          })}

          <h3 className="pricing-subtitle">DAT lane moves (last 60 days)</h3>
          {report.datLanes.length ? (
            <div className="pricing-table-wrap">
              <table className="pricing-table">
                <thead><tr><th>Lane</th><th>Equipment</th><th>Earlier</th><th>Latest</th><th>Change</th></tr></thead>
                <tbody>
                  {report.datLanes.map(function(row) {
                    return (
                      <tr key={row.lane + row.truckType}>
                        <td>{row.lane}</td><td>{row.truckType}</td>
                        <td>{money(row.earliest)}</td><td>{money(row.latest)}</td>
                        <td>{signed(row.changePct, '%')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="pricing-card-help">Lanes appear here once DAT has priced the same lane at least a week apart.</p>}

          {report.recentChanges.length > 0 && (
            <>
              <h3 className="pricing-subtitle">Recent rate changes</h3>
              <ul className="market-changes">
                {report.recentChanges.map(function(change, index) {
                  return (
                    <li key={index}>
                      <strong>{change.vehicle_type}</strong> · {new Date(change.changed_at).toLocaleDateString()} · {change.reason}
                      {change.changed_by ? ' · ' + change.changed_by : ''}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
