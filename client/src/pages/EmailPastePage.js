import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { buildApiUrl } from '../config';

export default function EmailPastePage() {
  const [emailBody, setEmailBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

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
    } catch (err) {
      setSubmitError(err && err.message ? err.message : 'Failed to submit email');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <div className="brand-badge"></div>
          Email Paste
        </div>
        <Link className="btn btn-secondary" to="/">
          Back to loads
        </Link>
      </div>
      <div className="container">
        <div className="card email-paste-card">
          <div className="card-header">
            <h2 className="title">Paste an email</h2>
            <div className="subtitle">
              Drop the raw email text below. We&apos;ll parse it in a future step.
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
      </div>
    </div>
  );
}

