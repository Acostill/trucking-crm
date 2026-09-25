import React, { useEffect, useState } from 'react';
import { buildApiUrl } from '../config';

/**
 * Brokerage-wide pricing rules: minimum profit per load, urgency premiums,
 * trial mode, and the extras price list added to estimated truck costs.
 */
export default function PricingRules() {
  const [settings, setSettings] = useState(null);
  const [charges, setCharges] = useState([]);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(null);

  async function request(path, options) {
    const resp = await fetch(buildApiUrl(path), { credentials: 'include', ...options });
    const data = await resp.json().catch(function() { return null; });
    if (!resp.ok) throw new Error((data && data.error) || 'Request failed');
    return data;
  }

  useEffect(function() {
    Promise.all([request('/api/admin/pricing-settings'), request('/api/admin/accessorial-charges')])
      .then(function(results) {
        setSettings({
          ...results[0],
          minMarginAmount: String(results[0].minMarginAmount),
          sameDayPremiumPct: String(results[0].sameDayPremiumPct),
          nextDayPremiumPct: String(results[0].nextDayPremiumPct)
        });
        setCharges(results[1].charges.map(function(charge) { return { ...charge, amount: String(charge.amount) }; }));
      })
      .catch(function(err) { setError(err.message); });
  }, []);

  async function saveSettings(changes) {
    setSaving('settings');
    setError(null);
    setStatus(null);
    try {
      const saved = await request('/api/admin/pricing-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes)
      });
      setSettings({
        ...saved,
        minMarginAmount: String(saved.minMarginAmount),
        sameDayPremiumPct: String(saved.sameDayPremiumPct),
        nextDayPremiumPct: String(saved.nextDayPremiumPct)
      });
      setStatus('Pricing rules saved. New quotes use them immediately.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function saveCharge(charge) {
    setSaving(charge.code);
    setError(null);
    setStatus(null);
    try {
      const saved = await request('/api/admin/accessorial-charges/' + encodeURIComponent(charge.code), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(charge.amount), isActive: charge.isActive })
      });
      setCharges(saved.charges.map(function(item) { return { ...item, amount: String(item.amount) }; }));
      setStatus(charge.label + ' saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  function updateCharge(code, field, value) {
    setCharges(function(current) {
      return current.map(function(charge) { return charge.code === code ? { ...charge, [field]: value } : charge; });
    });
  }

  return (
    <div className="profit-margin-card">
      <div>
        <h2 className="pricing-card-title">Pricing rules</h2>
        <p className="pricing-card-help">Applied to every quote. Extras and urgency are added to rate-table and DAT buy rates; live carrier prices already include their own.</p>
      </div>
      {settings && (
        <>
          <label className="pricing-toggle">
            <input
              type="checkbox"
              checked={settings.trialMode}
              disabled={saving === 'settings'}
              onChange={function(e) { saveSettings({ trialMode: e.target.checked }); }}
            />
            <span>
              <strong>Trial run</strong>
              <small>Staff price the way they always have, and the system records its own suggestion next to theirs. Compare the two in the scorecard below before turning this off.</small>
            </span>
          </label>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead><tr><th>Rule</th><th>Value</th><th /></tr></thead>
              <tbody>
                <tr>
                  <td>Minimum profit per load</td>
                  <td>$ <input type="number" min="0" step="10" value={settings.minMarginAmount} onChange={function(e) { setSettings({ ...settings, minMarginAmount: e.target.value }); }} /></td>
                  <td className="pricing-card-help">Used when it is more than the margin %.</td>
                </tr>
                <tr>
                  <td>Same-day pickup premium</td>
                  <td><input type="number" min="0" step="5" value={settings.sameDayPremiumPct} onChange={function(e) { setSettings({ ...settings, sameDayPremiumPct: e.target.value }); }} /> %</td>
                  <td className="pricing-card-help">Pickup today.</td>
                </tr>
                <tr>
                  <td>Next-day pickup premium</td>
                  <td><input type="number" min="0" step="5" value={settings.nextDayPremiumPct} onChange={function(e) { setSettings({ ...settings, nextDayPremiumPct: e.target.value }); }} /> %</td>
                  <td className="pricing-card-help">Pickup tomorrow.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="profit-margin-actions">
            <button
              className="primary-btn"
              disabled={saving === 'settings'}
              onClick={function() {
                saveSettings({
                  minMarginAmount: Number(settings.minMarginAmount),
                  sameDayPremiumPct: Number(settings.sameDayPremiumPct),
                  nextDayPremiumPct: Number(settings.nextDayPremiumPct)
                });
              }}
            >
              {saving === 'settings' ? 'Saving…' : 'Save rules'}
            </button>
          </div>

          <h3 className="pricing-subtitle">Extras price list (what carriers charge you)</h3>
          <div className="pricing-table-wrap">
            <table className="pricing-table">
              <thead><tr><th>Extra</th><th>Cost</th><th>How it's billed</th><th>Active</th><th /></tr></thead>
              <tbody>
                {charges.map(function(charge) {
                  return (
                    <tr key={charge.code}>
                      <td>{charge.label}</td>
                      <td>$ <input type="number" min="0" step="5" value={charge.amount} onChange={function(e) { updateCharge(charge.code, 'amount', e.target.value); }} />{charge.perHour ? ' / hr' : ''}</td>
                      <td className="pricing-card-help">
                        {charge.billing === 'if_applicable' ? 'Listed on quotes; billed only if it happens' : 'Added to the buy rate'}
                        {charge.includedFor && charge.includedFor.length ? ' · included for ' + charge.includedFor.join(' and ').toLowerCase() + 's' : ''}
                      </td>
                      <td><input type="checkbox" checked={charge.isActive} onChange={function(e) { updateCharge(charge.code, 'isActive', e.target.checked); }} /></td>
                      <td><button className="primary-btn" onClick={function() { saveCharge(charge); }} disabled={saving === charge.code}>{saving === charge.code ? 'Saving…' : 'Save'}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="pricing-card-help">Quotes are all-in by default: fuel and ticked extras are included in the sell rate. Detention, layover and truck-ordered-not-used are listed on the customer quote and billed only if they happen.</p>
        </>
      )}
      {error && <div className="admin-message error">{error}</div>}
      {status && <div className="admin-message success">{status}</div>}
    </div>
  );
}
