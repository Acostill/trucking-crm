import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { buildApiUrl } from '../config';
import { CheckCircle2, XCircle, Loader } from 'lucide-react';

function formatCurrency(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  } catch (_e) {
    return `$${Number(value).toFixed(2)}`;
  }
}

function formatNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export default function QuoteViewPage() {
  const { quoteId } = useParams();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  useEffect(function() {
    async function fetchQuote() {
      if (!quoteId) {
        setError('Quote ID is required');
        setLoading(false);
        return;
      }

      try {
        const resp = await fetch(buildApiUrl(`/api/quotes/${quoteId}`));

        if (!resp.ok) {
          if (resp.status === 404) {
            setError('Quote not found');
          } else {
            const msg = await resp.text();
            setError(msg || 'Failed to load quote');
          }
          setLoading(false);
          return;
        }

        const data = await resp.json();
        setQuote(data);
      } catch (err) {
        setError(err && err.message ? err.message : 'Failed to load quote');
      } finally {
        setLoading(false);
      }
    }

    fetchQuote();
  }, [quoteId]);

  async function handleApprove() {
    if (!quote || !quoteId) return;
    
    setProcessing(true);
    setStatusMessage(null);
    setError(null);

    try {
      const resp = await fetch(buildApiUrl(`/api/quotes/${quoteId}/approve`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to approve quote');
      }

      const updated = await resp.json();
      setQuote(updated);
      setStatusMessage({ type: 'success', text: 'Quote approved successfully! A load has been created from this quote.' });
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to approve quote');
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject() {
    if (!quote || !quoteId) return;
    
    setProcessing(true);
    setStatusMessage(null);
    setError(null);

    try {
      const resp = await fetch(buildApiUrl(`/api/quotes/${quoteId}/reject`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to reject quote');
      }

      const updated = await resp.json();
      setQuote(updated);
      setStatusMessage({ type: 'error', text: 'Quote rejected.' });
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to reject quote');
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div className="card" style={{ textAlign: 'center', padding: '60px 40px', maxWidth: '500px', position: 'relative', zIndex: 1 }}>
          <Loader className="spinner" size={48} style={{ margin: '0 auto 20px', color: 'var(--primary)' }} />
          <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Loading quote...</p>
        </div>
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div className="card" style={{ textAlign: 'center', padding: '60px 40px', maxWidth: '500px', position: 'relative', zIndex: 1 }}>
          <XCircle size={48} style={{ margin: '0 auto 20px', color: 'var(--danger)' }} />
          <h2 style={{ marginBottom: '10px', color: 'var(--text)', fontSize: '20px', fontWeight: '600' }}>Error</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '20px', fontSize: '14px' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!quote) {
    return null;
  }

  const quoteData = quote.quote || {};
  const priceAccessorials = Array.isArray(quoteData.accessorials) ? quoteData.accessorials : [];
  const linehaul = quoteData.linehaul;
  const rpm = quoteData.ratePerMile;
  const total = quoteData.total;
  const truckType = quoteData.truckType;
  const transitTime = quoteData.transitTime;
  const rateCalculationID = quoteData.rateCalculationID;
  const accessorialsTotal = quoteData.accessorialsTotal != null 
    ? Number(quoteData.accessorialsTotal) 
    : priceAccessorials.reduce(function(sum, a) {
        return sum + (Number(a.price) || 0);
      }, 0);

  const isApproved = quote.status === 'approved';
  const isRejected = quote.status === 'rejected';
  const canModify = !isApproved && !isRejected;

  return (
    <div className="shell" style={{ padding: '40px 20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div className="quote-view-page">
            {/* Header */}
            <div className="page-header">
              <div>
                <h1 className="page-title">Quote Details</h1>
                <p className="page-subtitle">Review and manage this freight quote</p>
              </div>
              {quote.status && (
                <div className="badge" style={{ 
                  background: isApproved ? 'rgba(16, 185, 129, 0.1)' : isRejected ? 'rgba(239, 68, 68, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                  color: isApproved ? '#065f46' : isRejected ? '#991b1b' : '#92400e',
                  border: `1px solid ${isApproved ? 'rgba(16, 185, 129, 0.2)' : isRejected ? 'rgba(239, 68, 68, 0.2)' : 'rgba(251, 191, 36, 0.2)'}`
                }}>
                  {isApproved ? '✓ Approved' : isRejected ? '✗ Rejected' : 'Pending'}
                </div>
              )}
            </div>

            {/* Status Messages */}
            {statusMessage && (
              <div className="card" style={{ 
                marginBottom: '24px',
                background: statusMessage.type === 'success' 
                  ? 'rgba(16, 185, 129, 0.1)' 
                  : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                padding: '16px 20px'
              }}>
                <p style={{ 
                  margin: 0, 
                  color: statusMessage.type === 'success' ? '#065f46' : '#991b1b',
                  fontWeight: '500',
                  fontSize: '14px'
                }}>
                  {statusMessage.text}
                </p>
              </div>
            )}

            {error && (
              <div className="card" style={{ 
                marginBottom: '24px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '16px 20px'
              }}>
                <p style={{ margin: 0, color: '#991b1b', fontSize: '14px' }}>{error}</p>
              </div>
            )}

            {/* Quote Card */}
            <div className="card quote-card">
              <div className="quote-header">
                <div>
                  <div className="title">Quote #{quoteId}</div>
                  <div className="subtitle">
                    {quote.submittedAt ? `Submitted on ${new Date(quote.submittedAt).toLocaleDateString()}` : 'Quote details'}
                  </div>
                </div>
                <div className="quote-total">
                  <div className="label">Total</div>
                  <div className="value">{formatCurrency(total)}</div>
                </div>
              </div>

              <div className="quote-badges">
                {truckType && <span className="badge">{truckType}</span>}
                {typeof transitTime === 'number' && (
                  <span className="badge">{transitTime} day{transitTime === 1 ? '' : 's'}</span>
                )}
                {rateCalculationID && <span className="badge muted">ID: {rateCalculationID}</span>}
              </div>

              <div className="grid-2">
                <div className="panel">
                  <div className="panel-title">Rate breakdown</div>
                  <div className="kv">
                    <div className="k">Linehaul</div>
                    <div className="v">{formatCurrency(linehaul)}</div>
                  </div>
                  <div className="kv">
                    <div className="k">Rate per mile</div>
                    <div className="v">{typeof rpm === 'number' ? `$${formatNumber(rpm)} / mi` : '-'}</div>
                  </div>
                  <div className="divider" />
                  <div className="kv total">
                    <div className="k">Total</div>
                    <div className="v">{formatCurrency(total)}</div>
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-title">Accessorials</div>
                  {priceAccessorials.length === 0 ? (
                    <div className="muted">No accessorials</div>
                  ) : (
                    <div className="table">
                      <div className="thead">
                        <div>Description</div>
                        <div>Price</div>
                      </div>
                      <div className="tbody">
                        {priceAccessorials.map(function(a, idx) {
                          return (
                            <div className="tr" key={a.code || a.description || idx}>
                              <div>
                                <div className="desc">{a.description || a.code}</div>
                                {a.code && <div className="sub">{a.code}</div>}
                              </div>
                              <div className="amount">{formatCurrency(Number(a.price) || 0)}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="tfoot">
                        <div>Accessorials total</div>
                        <div>{formatCurrency(accessorialsTotal)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Shipment Details */}
              {quote.shipment && (
                <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                  <div className="panel-title" style={{ marginBottom: '16px' }}>Shipment Details</div>
                  <div className="grid-2">
                    <div>
                      <div className="info-item">
                        <div className="info-label">Pickup Location</div>
                        <div className="info-value">
                          {quote.shipment.pickup && quote.shipment.pickup.location
                            ? [
                                quote.shipment.pickup.location.city,
                                quote.shipment.pickup.location.state,
                                quote.shipment.pickup.location.zip
                              ].filter(Boolean).join(', ')
                            : 'N/A'}
                        </div>
                      </div>
                      {quote.shipment.pickup && quote.shipment.pickup.date && (
                        <div className="info-item">
                          <div className="info-label">Pickup Date</div>
                          <div className="info-value">
                            {new Date(quote.shipment.pickup.date).toLocaleDateString()}
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="info-item">
                        <div className="info-label">Delivery Location</div>
                        <div className="info-value">
                          {quote.shipment.delivery && quote.shipment.delivery.location
                            ? [
                                quote.shipment.delivery.location.city,
                                quote.shipment.delivery.location.state,
                                quote.shipment.delivery.location.zip
                              ].filter(Boolean).join(', ')
                            : 'N/A'}
                        </div>
                      </div>
                      {quote.shipment.weight && (
                        <div className="info-item">
                          <div className="info-label">Weight</div>
                          <div className="info-value">
                            {quote.shipment.weight.value} {quote.shipment.weight.unit || 'lbs'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Contact Information */}
              {quote.contact && (
                <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                  <div className="panel-title" style={{ marginBottom: '16px' }}>Contact Information</div>
                  <div className="grid-2">
                    <div className="info-item">
                      <div className="info-label">Name</div>
                      <div className="info-value">{quote.contact.name || 'N/A'}</div>
                    </div>
                    <div className="info-item">
                      <div className="info-label">Email</div>
                      <div className="info-value">{quote.contact.email || 'N/A'}</div>
                    </div>
                    <div className="info-item">
                      <div className="info-label">Phone</div>
                      <div className="info-value">{quote.contact.phone || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {canModify && (
                <div className="actions" style={{ 
                  marginTop: '32px', 
                  paddingTop: '24px', 
                  borderTop: '1px solid var(--border)'
                }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleReject}
                    disabled={processing}
                    style={{ 
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: '#991b1b',
                      borderColor: 'rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    {processing ? (
                      <>
                        <Loader size={16} style={{ marginRight: '8px', display: 'inline-block' }} />
                        Processing...
                      </>
                    ) : (
                      <>
                        <XCircle size={16} style={{ marginRight: '8px', display: 'inline-block' }} />
                        Reject Quote
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleApprove}
                    disabled={processing}
                    style={{ 
                      background: 'var(--success)',
                      color: 'white',
                      borderColor: 'var(--success)'
                    }}
                  >
                    {processing ? (
                      <>
                        <Loader size={16} style={{ marginRight: '8px', display: 'inline-block' }} />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} style={{ marginRight: '8px', display: 'inline-block' }} />
                        Approve Quote
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}

