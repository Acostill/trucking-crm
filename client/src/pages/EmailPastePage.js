import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import CalculateRatePage from './CalculateRatePage';
import { buildApiUrl } from '../config';
import { useAuth } from '../context/AuthContext';
import AuthForm from '../components/AuthForm';

export default function EmailPastePage() {
  const { user, checking, setUser } = useAuth();
  const [emailBody, setEmailBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [ratePrefill, setRatePrefill] = useState(null);

  const lineCount = emailBody.length ? emailBody.split(/\r?\n/).length : 0;
  const charCount = emailBody.length;
  const isSubmitDisabled = submitting || !emailBody.trim();

  function handleChange(e) {
    setEmailBody(e.target.value);
    setSubmitError(null);
    setSubmitSuccess(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!emailBody.trim()) {
      setSubmitError('Please paste an email before submitting.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const resp = await fetch(buildApiUrl('/api/email-paste'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: emailBody })
      });
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(text || 'Failed to submit email');
      }
      setSubmitSuccess('Email sent to automations.');

      // Attempt to prefill the embedded rate calculator from the automation response
      try {
        const data = text ? JSON.parse(text) : {};
        const payload = data && data.output ? data.output : data;
        const body = payload && payload.body ? payload.body : {};
        const shipmentDetails = body.shipment_details || payload.shipment || {};
        const pickup = shipmentDetails.pickup || {};
        const delivery = shipmentDetails.delivery || {};
        const shipmentInfo = shipmentDetails.shipment_info || {};
        const dims = shipmentInfo.dimensions || {};

        setRatePrefill({
          pickupCity: pickup.city || '',
          pickupState: pickup.state || '',
          pickupZip: pickup.zip || '',
          pickupCountry: 'US',
          pickupDate: pickup.requested_date_time || '',
          deliveryCity: delivery.city || '',
          deliveryState: delivery.state || '',
          deliveryZip: delivery.zip || '',
          deliveryCountry: 'US',
          piecesUnit: 'in',
          piecesQuantity: dims.pallets != null ? String(dims.pallets) : '',
          part1Length: dims.length_in != null ? String(dims.length_in) : '',
          part1Width: dims.width_in != null ? String(dims.width_in) : '',
          part1Height: dims.height_in != null ? String(dims.height_in) : '',
          part2Length: '',
          part2Width: '',
          part2Height: '',
          weightUnit: shipmentInfo.weight_lbs ? 'lbs' : '',
          weightValue: shipmentInfo.weight_lbs ? String(shipmentInfo.weight_lbs) : '',
          hazardousUnNumbersText: '',
          accessorialCodesText: '',
          shipmentId: '',
          referenceNumber: ''
        });
      } catch (_err) {
        // ignore parse errors; prefill is best-effort
      }
    } catch (err) {
      setSubmitError(err && err.message ? err.message : 'Failed to submit email');
    } finally {
      setSubmitting(false);
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
          <div className="email-paste-page">
            {/* Page Header */}
            <div className="page-header">
              <h1 className="page-title">Email AI</h1>
              <p className="page-subtitle">Paste email content to automatically extract shipment details.</p>
            </div>

            {/* Email Paste Card */}
            <div className="card email-paste-card">
              <div className="card-header">
                <h2 className="title">Paste an email</h2>
                <div className="subtitle">
                  Drop the raw email text below. We'll parse it and extract shipment info.
                </div>
              </div>
              <div className="card-body">
                <form className="email-form" onSubmit={handleSubmit}>
                  <label className="email-label">
                    Email contents
                    <textarea
                      className="email-textarea"
                      placeholder="Paste the entire email body here…"
                      value={emailBody}
                      onChange={handleChange}
                    />
                  </label>
                  <div className="email-meta">
                    <span>{lineCount} line{lineCount === 1 ? '' : 's'}</span>
                    <span>{charCount} character{charCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="email-actions">
                    <button type="submit" className="btn" disabled={isSubmitDisabled}>
                      {submitting ? 'Sending…' : 'Submit email'}
                    </button>
                  </div>
                  {submitError && <div className="email-message error">{submitError}</div>}
                  {submitSuccess && <div className="email-message success">{submitSuccess}</div>}
                  <div className="email-helper">
                    Tip: you can keep this tab open while working through inbox responses.
                  </div>
                </form>
              </div>
            </div>

            {/* Calculate Rate Card */}
            <div className="card" style={{ marginTop: 24 }}>
              <div className="card-header">
                <h2 className="title">Calculate rate</h2>
                <div className="subtitle">Get a quote without leaving this page.</div>
              </div>
              <div className="card-body">
                <CalculateRatePage embedded initialValues={{}} prefill={ratePrefill} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
