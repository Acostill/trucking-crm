import React, { useEffect, useState } from 'react';
import { buildApiUrl } from '../config';

/**
 * First Class expedite buy rates: what the brokerage expects to pay a driver
 * per loaded mile for each vehicle. Expedite quotes are priced from this
 * table (plus margin) instead of asking ExpediteAll on every inquiry.
 */
export default function ExpediteRateTable() {
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [askExpediteAll, setAskExpediteAll] = useState(true);
  const [savingSetting, setSavingSetting] = useState(false);

  function applyResponse(data) {
    const byType = {};
    (data.rules || []).forEach(function(rule) { byType[rule.vehicleType] = rule; });
    const next = {};
    (data.vehicleTypes || []).forEach(function(type) {
      const rule = byType[type];
      next[type] = {
        ratePerMile: rule ? String(rule.ratePerMile) : '',
        minimumCharge: rule ? String(rule.minimumCharge) : '',
        isActive: rule ? rule.isActive : true,
        saved: Boolean(rule),
        updatedAt: rule ? rule.updatedAt : null
      };
    });
    setVehicleTypes(data.vehicleTypes || []);
    setDrafts(next);
  }

  useEffect(function() {
    async function load() {
      try {
        const [rulesResp, settingsResp] = await Promise.all([
          fetch(buildApiUrl('/api/admin/expedite-rate-rules'), { credentials: 'include' }),
          fetch(buildApiUrl('/api/admin/pricing-settings'), { credentials: 'include' })
        ]);
        const data = await rulesResp.json().catch(function() { return null; });
        if (!rulesResp.ok) throw new Error((data && data.error) || 'Failed to load the rate table');
        applyResponse(data);
        const settings = await settingsResp.json().catch(function() { return null; });
        if (settingsResp.ok && settings) setAskExpediteAll(settings.expediteAllBeforeAward !== false);
      } catch (err) {
        setError(err && err.message ? err.message : 'Failed to load the rate table');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function update(type, field, value) {
    setDrafts(function(current) {
      return { ...current, [type]: { ...current[type], [field]: value } };
    });
    setStatus(null);
  }

  async function toggleAskExpediteAll(nextValue) {
    setSavingSetting(true);
    setError(null);
    try {
      const resp = await fetch(buildApiUrl('/api/admin/pricing-settings'), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expediteAllBeforeAward: nextValue })
      });
      const data = await resp.json().catch(function() { return null; });
      if (!resp.ok) throw new Error((data && data.error) || 'Failed to save the setting');
      setAskExpediteAll(data.expediteAllBeforeAward !== false);
      setStatus(nextValue
        ? 'ExpediteAll will be asked on every cargo-van quote.'
        : 'Cargo-van quotes now use the rate table; ExpediteAll is asked only after award.');
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to save the setting');
    } finally {
      setSavingSetting(false);
    }
  }

  async function save(type) {
    const draft = drafts[type];
    const ratePerMile = parseFloat(draft.ratePerMile);
    const minimumCharge = draft.minimumCharge === '' ? 0 : parseFloat(draft.minimumCharge);
    if (!(ratePerMile > 0)) {
      setError(type + ': enter a rate per mile above 0');
      return;
    }
    if (Number.isNaN(minimumCharge) || minimumCharge < 0) {
      setError(type + ': minimum charge must be 0 or more');
      return;
    }
    setSavingType(type);
    setError(null);
    try {
      const resp = await fetch(buildApiUrl('/api/admin/expedite-rate-rules/' + encodeURIComponent(type)), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratePerMile, minimumCharge, isActive: draft.isActive })
      });
      const data = await resp.json().catch(function() { return null; });
      if (!resp.ok) throw new Error((data && data.error) || 'Failed to save the rate');
      applyResponse(data);
      setStatus(type + ' rate saved. New quotes use it immediately.');
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to save the rate');
    } finally {
      setSavingType(null);
    }
  }

  return (
    <div className="profit-margin-card">
      <div>
        <h2 className="pricing-card-title">Expedite rate table</h2>
        <p className="pricing-card-help">
          What you expect to pay the driver per loaded mile (fuel included), plus a minimum for short runs.
          Every quote shows the table price next to the live ExpediteAll price, so you can see how close the table is.
        </p>
      </div>
      <label className="pricing-toggle">
        <input
          type="checkbox"
          checked={askExpediteAll}
          disabled={loading || savingSetting}
          onChange={function(e) { toggleAskExpediteAll(e.target.checked); }}
        />
        <span>
          <strong>Ask ExpediteAll on every cargo-van quote</strong>
          <small>Recommended until the table matches ExpediteAll. Turn off to ask ExpediteAll only after the customer awards the load.</small>
        </span>
      </label>
      {loading ? <div className="pricing-card-help">Loading…</div> : (
        <div className="pricing-table-wrap">
          <table className="pricing-table">
            <thead>
              <tr><th>Vehicle</th><th>$ / mile</th><th>Minimum $</th><th>Active</th><th /></tr>
            </thead>
            <tbody>
              {vehicleTypes.map(function(type) {
                const draft = drafts[type] || {};
                return (
                  <tr key={type}>
                    <td>{type}{!draft.saved && <span className="pricing-missing">Not set</span>}</td>
                    <td><input type="number" min="0" step="0.01" value={draft.ratePerMile || ''} onChange={function(e) { update(type, 'ratePerMile', e.target.value); }} placeholder="e.g. 1.75" /></td>
                    <td><input type="number" min="0" step="1" value={draft.minimumCharge || ''} onChange={function(e) { update(type, 'minimumCharge', e.target.value); }} placeholder="e.g. 250" /></td>
                    <td><input type="checkbox" checked={draft.isActive !== false} onChange={function(e) { update(type, 'isActive', e.target.checked); }} /></td>
                    <td><button className="primary-btn" onClick={function() { save(type); }} disabled={savingType === type}>{savingType === type ? 'Saving…' : 'Save'}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {error && <div className="admin-message error">{error}</div>}
      {status && <div className="admin-message success">{status}</div>}
    </div>
  );
}
