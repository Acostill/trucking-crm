import React, { useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import AuthForm from '../components/AuthForm';

const FEE_RATE = 0.05;
const COMMISSION_RATE = 0.1;

function formatCurrency(value) {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (Number.isNaN(num)) return '-';
  return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value) {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (Number.isNaN(num)) return '-';
  return (num * 100).toFixed(2) + '%';
}

export default function AdminFinancePage() {
  const { user, checking, setUser } = useAuth();

  const isAdmin = user && Array.isArray(user.roles) && user.roles.indexOf('admin') > -1;

  const metrics = useMemo(() => {
    const totalRevenue = 482500;
    const totalFees = totalRevenue * FEE_RATE;
    const profit = totalRevenue - totalFees;
    const marginPct = totalRevenue > 0 ? profit / totalRevenue : 0;
    const totalCommission = profit * COMMISSION_RATE;
    const avgRate = 3850;
    const shipmentCount = 125;

    return {
      totalRevenue,
      totalFees,
      profit,
      marginPct,
      totalCommission,
      avgRate,
      shipmentCount,
      deliveredPct: 87,
      deliveredCount: 109,
      staffCommission: [
        { name: 'Alex Johnson', amount: 18250 },
        { name: 'Samantha Lee', amount: 14600 },
        { name: 'Marcus Hill', amount: 12800 },
        { name: 'Priya Patel', amount: 9800 },
        { name: 'Jordan Cruz', amount: 7600 }
      ],
      equipmentServiceMix: [
        {
          equipment: 'Dry Van',
          services: { Expedite: 18, FTL: 24, LTL: 10 }
        },
        {
          equipment: 'Reefer',
          services: { Expedite: 12, FTL: 16, LTL: 6 }
        },
        {
          equipment: 'Flatbed',
          services: { Expedite: 8, FTL: 14, LTL: 4 }
        }
      ],
      loadingTimeWeight: [
        { label: 'Jan', minutes: 12, weight: 22 },
        { label: 'Feb', minutes: 14, weight: 18 },
        { label: 'Mar', minutes: 10, weight: 24 },
        { label: 'Apr', minutes: 16, weight: 20 },
        { label: 'May', minutes: 18, weight: 28 },
        { label: 'Jun', minutes: 11, weight: 26 },
        { label: 'Jul', minutes: 15, weight: 19 },
        { label: 'Aug', minutes: 13, weight: 30 },
        { label: 'Sep', minutes: 17, weight: 21 },
        { label: 'Oct', minutes: 12, weight: 27 },
        { label: 'Nov', minutes: 14, weight: 23 },
        { label: 'Dec', minutes: 11, weight: 25 }
      ]
    };
  }, []);

  const totalCommissionPool = metrics.staffCommission.reduce((sum, item) => sum + item.amount, 0);
  const staffRows = metrics.staffCommission.map((item) => ({
    ...item,
    percent: totalCommissionPool ? Math.round((item.amount / totalCommissionPool) * 100) : 0
  }));
  const serviceKeys = ['Expedite', 'FTL', 'LTL'];
  const serviceColors = {
    Expedite: '#10b981',
    FTL: '#6366f1',
    LTL: '#f59e0b'
  };
  const equipmentSeries = metrics.equipmentServiceMix.map((row) => {
    const total = serviceKeys.reduce((sum, key) => sum + (row.services[key] || 0), 0);
    return {
      equipment: row.equipment,
      total,
      segments: serviceKeys.map((key) => ({
        key,
        value: row.services[key] || 0,
        widthPct: total ? Math.round(((row.services[key] || 0) / total) * 100) : 0
      }))
    };
  });

  const loadingMax = Math.max(1, ...metrics.loadingTimeWeight.map((item) => item.minutes));
  const weightMax = Math.max(1, ...metrics.loadingTimeWeight.map((item) => item.weight));

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

  if (!isAdmin) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="app-main">
          <div className="app-content">
            <div className="card">
              <div className="card-header">
                <h2 className="title">Finance</h2>
                <div className="subtitle">Admin access required.</div>
              </div>
              <div className="card-body">
                <div className="admin-message error">You do not have access to the finance section.</div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <div className="app-blob app-blob-1" />
        <div className="app-blob app-blob-2" />

        <div className="app-content finance-page">
          <div className="finance-header">
            <div>
              <h1 className="finance-title">Finance</h1>
              <p className="finance-subtitle">Track fees, margins, and commissions across shipments.</p>
            </div>
          </div>

          <>
            <div className="finance-kpi-grid">
              <div className="finance-metric-card">
                <div className="finance-label">Total Revenue</div>
                <div className="finance-value">{formatCurrency(metrics.totalRevenue)}</div>
                <div className="finance-sub">Shipments: {metrics.shipmentCount}</div>
              </div>
              <div className="finance-metric-card">
                <div className="finance-label">Total Fees</div>
                <div className="finance-value">{formatCurrency(metrics.totalFees)}</div>
                <div className="finance-sub">Fee rate: {formatPercent(FEE_RATE)}</div>
              </div>
              <div className="finance-metric-card">
                <div className="finance-label">Profit</div>
                <div className="finance-value">{formatCurrency(metrics.profit)}</div>
                <div className="finance-sub">Margin: {formatPercent(metrics.marginPct)}</div>
              </div>
              <div className="finance-metric-card">
                <div className="finance-label">Commission</div>
                <div className="finance-value">{formatCurrency(metrics.totalCommission)}</div>
                <div className="finance-sub">Commission rate: {formatPercent(COMMISSION_RATE)}</div>
              </div>
              <div className="finance-metric-card">
                <div className="finance-label">Average Rate</div>
                <div className="finance-value">{formatCurrency(metrics.avgRate)}</div>
                <div className="finance-sub">Per shipment</div>
              </div>
            </div>

            <div className="finance-graphs-grid">
              <div className="finance-graph-card finance-graph-span-2">
                <div className="finance-chart-header">
                  <div className="finance-chart-title">Loading Time & Weight</div>
                  <div className="finance-chart-sub">Monthly averages</div>
                </div>
                <div className="finance-barline-chart">
                  <div className="finance-barline-bars">
                    {metrics.loadingTimeWeight.map((item) => (
                      <div key={item.label} className="finance-barline-bar">
                        <div
                          className="finance-barline-bar-fill"
                          style={{ height: `${Math.round((item.minutes / loadingMax) * 100)}%` }}
                        />
                        <div className="finance-barline-label">{item.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="finance-barline-axis">
                    <span>0</span>
                    <span>{loadingMax} min</span>
                    <span>{weightMax} tons</span>
                  </div>
                </div>
              </div>

              <div className="finance-graph-card">
                <div className="finance-chart-header">
                  <div className="finance-chart-title">Delivery Status</div>
                  <div className="finance-chart-sub">Percent delivered on time</div>
                </div>
                <div className="finance-donut-wrap">
                  <div
                    className="finance-donut"
                    style={{
                      background: `conic-gradient(#6366f1 0 ${metrics.deliveredPct}%, #e2e8f0 ${metrics.deliveredPct}% 100%)`
                    }}
                  >
                    <div className="finance-donut-center">
                      <div className="finance-donut-value">{metrics.deliveredPct}%</div>
                      <div className="finance-donut-label">Delivered</div>
                    </div>
                  </div>
                  <div className="finance-donut-legend">
                    <div className="finance-legend-row">
                      <span className="finance-legend-dot finance-dot-primary" />
                      Delivered
                    </div>
                    <div className="finance-legend-row">
                      <span className="finance-legend-dot finance-dot-muted" />
                      Other
                    </div>
                  </div>
                </div>
              </div>

              <div className="finance-graph-card">
                <div className="finance-chart-header">
                  <div className="finance-chart-title">Service Mix by Equipment</div>
                  <div className="finance-chart-sub">Shipments by truck type</div>
                </div>
                <div className="finance-stack-legend">
                  {serviceKeys.map((key) => (
                    <div key={key} className="finance-legend-row">
                      <span className="finance-legend-dot" style={{ background: serviceColors[key] }} />
                      {key}
                    </div>
                  ))}
                </div>
                <div className="finance-stack-list">
                  {equipmentSeries.map((row) => (
                    <div key={row.equipment} className="finance-stack-row">
                      <div className="finance-bar-label">{row.equipment}</div>
                      <div className="finance-stack-track">
                        {row.segments.map((segment) => (
                          <span
                            key={segment.key}
                            className="finance-stack-segment"
                            style={{
                              width: `${segment.widthPct}%`,
                              background: serviceColors[segment.key]
                            }}
                          />
                        ))}
                      </div>
                      <div className="finance-bar-value">{row.total}</div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div className="finance-section">
              <div className="finance-graph-card">
                <div className="finance-chart-header">
                  <div className="finance-chart-title">Commission Breakdown (Staff)</div>
                  <div className="finance-chart-sub">Monthly payout distribution</div>
                </div>
                <div className="finance-table-wrap">
                  <table className="finance-table">
                    <thead>
                      <tr>
                        <th>Staff</th>
                        <th>Commission</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffRows.map((row) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td>{formatCurrency(row.amount)}</td>
                          <td>{row.percent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="finance-note">
              * Demo figures shown. This view currently uses dummy data.
            </div>
          </>
        </div>
      </main>
    </div>
  );
}

