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
  const [lastPayload, setLastPayload] = useState(null);

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
        // The response might have `output` wrapper or be direct
        const payload = data && data.output ? data.output : data;
        setLastPayload(payload); // Store for later use when selecting a quote
        
        // Debug log to help track response structure
        console.log('[EmailPastePage] Parsed n8n response:', { data, payload });
        
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

        console.log('[EmailPastePage] Extracted shipment details:', { 
          body, shipmentDetails, pickup, delivery, deliveryOptions, shipmentInfo, dims, weightLbs, pallets 
        });

        const prefillData = {
          pickupCity: pickup.city || '',
          pickupState: pickup.state || '',
          pickupZip: pickup.zip || '',
          pickupCountry: 'US',
          pickupDate: pickup.pickup_date || pickup.requested_date_time || pickup.date || '',
          deliveryCity: delivery.city || '',
          deliveryState: delivery.state || '',
          deliveryZip: delivery.zip || '',
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
        };
        
        console.log('[EmailPastePage] Setting ratePrefill:', prefillData);
        setRatePrefill(prefillData);
      } catch (parseErr) {
        console.error('[EmailPastePage] Error parsing n8n response:', parseErr);
        // ignore parse errors; prefill is best-effort
      }
    } catch (err) {
      setSubmitError(err && err.message ? err.message : 'Failed to submit email');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSelectQuote(quote) {
    if (!lastPayload) {
      setSubmitError('No email payload to save with quote.');
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
      setSubmitSuccess('Load saved with selected quote!');
    } catch (err) {
      setSubmitError(err && err.message ? err.message : 'Failed to save load with selected quote');
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
                <CalculateRatePage 
                  embedded 
                  initialValues={{}} 
                  prefill={ratePrefill}
                  onSelectQuote={handleSelectQuote}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
