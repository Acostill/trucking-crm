import React, { useEffect, useMemo, useState } from 'react';

function parseDate(value) {
  if (!value) return null;
  var d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  var d = parseDate(value);
  if (!d) return '-';
  try {
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit' }).format(d);
  } catch (_e) {
    return d.toISOString().slice(0, 10);
  }
}

export default function QueuePage() {
  var [loads, setLoads] = useState([]);
  var [loading, setLoading] = useState(false);
  var [error, setError] = useState(null);

  useEffect(function() {
    var abort = new AbortController();
    setLoading(true);
    setError(null);
    fetch('http://localhost:3001/api/queue', { signal: abort.signal, credentials: 'include' })
      .then(function(r){ return r.json(); })
      .then(function(data){ setLoads(Array.isArray(data) ? data : []); })
      .catch(function(err){ if (err.name !== 'AbortError') setError(err && err.message ? err.message : String(err)); })
      .finally(function(){ setLoading(false); });
    return function(){ abort.abort(); };
  }, []);

  var upcomingLoads = useMemo(function() {
    var now = new Date();
    return loads
      .filter(function(l){
        // consider only active loads with deliveryDate in the future (or today)
        var isActive = !l.status || String(l.status).toLowerCase() === 'active';
        var dd = parseDate(l.deliveryDate);
        var isUpcoming = dd ? dd >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) : false;
        return isActive && isUpcoming;
      })
      .sort(function(a, b){
        var da = parseDate(a.deliveryDate);
        var db = parseDate(b.deliveryDate);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.getTime() - db.getTime();
      });
  }, [loads]);

  return (
    <div className="container">
      <div className="card">
        <div className="card-header">
          <h2 className="title">Queue</h2>
          <div className="subtitle">Upcoming active loads by delivery date</div>
        </div>
        <div className="card-body">
          {loading && <div>Loading…</div>}
          {error && <div className="error">{error}</div>}
          {!loading && !error && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Delivery</th>
                    <th>Load #</th>
                    <th>Customer</th>
                    <th>From → To</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingLoads.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>No upcoming active loads</td>
                    </tr>
                  )}
                  {upcomingLoads.map(function(l){
                    var from = l.shipperLocation || '';
                    var to = l.consigneeLocation || '';
                    var rate = (l.currency || 'USD') + ' ' + (l.rate != null ? Number(l.rate).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-');
                    return (
                      <tr key={(l.loadNumber || '') + (l.deliveryDate || '') + (l.customer || '')}>
                        <td>{formatDate(l.deliveryDate)}</td>
                        <td>{l.loadNumber || '-'}</td>
                        <td>{l.customer || '-'}</td>
                        <td style={{ whiteSpace: 'normal' }}>{from} → {to}</td>
                        <td>{l.status || 'active'}</td>
                        <td style={{ textAlign: 'right' }}>{rate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


