import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Info,
  PackageCheck,
  Ruler,
  Route,
  ShieldCheck,
  Sparkles,
  Truck,
  Weight,
  Zap
} from 'lucide-react';
import { buildApiUrl } from '../config';
import {
  EQUIPMENT_OPTIONS,
  buildPlanningOptions,
  recommendEquipment
} from '../utils/quoteOptimizer';

const ACCESSORIAL_OPTIONS = [
  { id: 'liftgate', label: 'Liftgate' },
  { id: 'appointment', label: 'Delivery appointment' },
  { id: 'inside', label: 'Inside delivery' },
  { id: 'limited_access', label: 'Limited access' }
];

function defaultPickupDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

const INITIAL_FORM = {
  originCity: '',
  originState: '',
  originZip: '',
  destinationCity: '',
  destinationState: '',
  destinationZip: '',
  pickupDate: defaultPickupDate(),
  serviceSpeed: 'standard',
  pallets: '2',
  length: '48',
  width: '40',
  height: '48',
  totalWeight: '1800',
  commodity: 'General merchandise',
  stackable: true,
  hazmat: false,
  accessorials: []
};

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function getEquipmentIcon(id) {
  if (id === 'ltl') return Boxes;
  if (id === 'sprinter') return Zap;
  if (id === 'box_truck') return PackageCheck;
  return Truck;
}

function normalizeLiveQuotes(payload, selectedEquipment) {
  const entries = [
    ['expediteAll', 'ExpediteAll'],
    ['forwardAir', 'ForwardAir'],
    ['datForecast', 'DAT']
  ];

  return entries.map(function(entry, index) {
    const key = entry[0];
    const source = entry[1];
    const quote = payload && payload[key];
    const total = quote && Number(quote.total || quote.lineHaul);
    if (!quote || quote.error || !Number.isFinite(total) || total <= 0) return null;
    const info = quote.additionalInfo || {};
    const isLtl = source === 'ForwardAir';
    const equipmentId = isLtl ? 'ltl' : selectedEquipment.id;
    const equipment = EQUIPMENT_OPTIONS.find(function(option) { return option.id === equipmentId; }) || selectedEquipment;

    return {
      id: 'live-' + key,
      source: source === 'ForwardAir' ? 'Forward Air live rate' : source === 'DAT' ? 'DAT market rate' : 'FCTL carrier network',
      equipmentId: equipmentId,
      equipmentLabel: equipment.label,
      truckType: info.truckType || equipment.truckType,
      total: total,
      lineHaul: Number(quote.lineHaul || total),
      ratePerMile: Number(quote.ratePerMile) || null,
      mileage: Number(info.mileage) || null,
      transitDays: Number(info.transitTime) || null,
      accessorialTotal: Array.isArray(info.accessorials)
        ? info.accessorials.reduce(function(sum, item) { return sum + (Number(item.price) || 0); }, 0)
        : 0,
      isEstimate: false,
      rank: index
    };
  }).filter(Boolean);
}

function QuoteStep({ number, label, active, complete }) {
  return (
    <div className={'cq-step ' + (active ? 'active ' : '') + (complete ? 'complete' : '')}>
      <span className="cq-step-number">{complete ? <Check size={14} /> : number}</span>
      <span>{label}</span>
    </div>
  );
}

export default function CustomerQuoteBuilder({ user, onQuoteRequested, onBack, previewMode = false }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [step, setStep] = useState(1);
  const [validationError, setValidationError] = useState('');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('ltl');
  const [equipmentTouched, setEquipmentTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rateNotice, setRateNotice] = useState('');
  const [rates, setRates] = useState([]);
  const [requestingRateId, setRequestingRateId] = useState('');
  const [requestedQuote, setRequestedQuote] = useState(null);
  const [requestError, setRequestError] = useState('');

  const recommendation = useMemo(function() {
    return recommendEquipment(form);
  }, [form]);

  useEffect(function() {
    if (!equipmentTouched) {
      setSelectedEquipmentId(recommendation.recommended.id);
    }
  }, [recommendation, equipmentTouched]);

  const selectedEquipment = EQUIPMENT_OPTIONS.find(function(option) {
    return option.id === selectedEquipmentId;
  }) || recommendation.recommended;

  function setField(name, value) {
    setForm(function(previous) {
      return { ...previous, [name]: value };
    });
  }

  function toggleAccessorial(id) {
    setForm(function(previous) {
      const selected = previous.accessorials.indexOf(id) > -1;
      return {
        ...previous,
        accessorials: selected
          ? previous.accessorials.filter(function(item) { return item !== id; })
          : previous.accessorials.concat(id)
      };
    });
  }

  function validateCurrentStep() {
    if (step === 1) {
      if ((!form.originZip && (!form.originCity || !form.originState)) ||
          (!form.destinationZip && (!form.destinationCity || !form.destinationState))) {
        return 'Add a ZIP code or city and state for both ends of the lane.';
      }
      if (!form.pickupDate) return 'Choose a pickup date.';
    }
    if (step === 2) {
      if (Number(form.pallets) < 1) return 'Enter at least one pallet or handling unit.';
      if (Number(form.totalWeight) <= 0) return 'Enter the shipment weight.';
      if (Number(form.length) <= 0 || Number(form.width) <= 0 || Number(form.height) <= 0) {
        return 'Enter the dimensions for the largest handling unit.';
      }
    }
    return '';
  }

  function goForward() {
    const message = validateCurrentStep();
    if (message) {
      setValidationError(message);
      return;
    }
    setValidationError('');
    setStep(function(current) { return Math.min(3, current + 1); });
  }

  function goBack() {
    setValidationError('');
    setStep(function(current) { return Math.max(1, current - 1); });
  }

  function buildApiPayload() {
    const palletCount = Math.max(1, Number(form.pallets) || 1);
    const totalWeight = Number(form.totalWeight) || 0;
    return {
      pickup: {
        location: {
          city: form.originCity,
          state: form.originState,
          zip: form.originZip,
          country: 'US'
        },
        date: new Date(form.pickupDate + 'T12:00:00').toISOString()
      },
      delivery: {
        location: {
          city: form.destinationCity,
          state: form.destinationState,
          zip: form.destinationZip,
          country: 'US'
        }
      },
      pieces: {
        quantity: palletCount,
        unit: 'in',
        parts: [{
          count: palletCount,
          length: Number(form.length),
          width: Number(form.width),
          height: Number(form.height),
          weight: Number((totalWeight / palletCount).toFixed(2))
        }]
      },
      weight: { value: totalWeight, unit: 'lbs' },
      truckType: selectedEquipment.truckType,
      serviceType: selectedEquipment.id === 'ltl' ? 'LTL' : 'Dedicated',
      serviceSpeed: form.serviceSpeed,
      commodity: form.commodity,
      stackable: form.stackable,
      hazardousMaterial: { unNumbers: form.hazmat ? ['HAZMAT'] : [] },
      accessorialCodes: form.accessorials
    };
  }

  async function getRates() {
    setLoading(true);
    setValidationError('');
    setRateNotice('');
    setRequestError('');
    setRequestedQuote(null);
    const planningRates = buildPlanningOptions(form, recommendation, selectedEquipment.id);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(function() { controller.abort(); }, 12000);
    try {
      const response = await fetch(buildApiUrl('/calculate-rate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify(buildApiPayload())
      });
      if (!response.ok) throw new Error('Live carrier rates are temporarily unavailable.');
      const payload = await response.json();
      const liveRates = normalizeLiveQuotes(payload, selectedEquipment);
      const liveEquipmentIds = new Set(liveRates.map(function(rate) { return rate.equipmentId; }));
      const alternatives = planningRates.filter(function(rate) {
        return !liveEquipmentIds.has(rate.equipmentId);
      });
      const combined = liveRates.concat(alternatives).slice(0, 3);
      setRates(combined.length ? combined : planningRates);
      setRateNotice(liveRates.length
        ? 'Live carrier pricing is available. Planning estimates are shown only for comparable equipment.'
        : 'Carrier connections did not return a rate, so FCTL planning estimates are shown for the demo.');
    } catch (_error) {
      setRates(planningRates);
      setRateNotice('Live carrier connections are unavailable, so FCTL planning estimates are shown for the demo.');
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
      setStep(4);
    }
  }

  function buildShipmentRecord() {
    return {
      pickup: {
        location: {
          city: form.originCity,
          state: form.originState,
          zip: form.originZip,
          country: 'US'
        },
        date: form.pickupDate
      },
      delivery: {
        location: {
          city: form.destinationCity,
          state: form.destinationState,
          zip: form.destinationZip,
          country: 'US'
        }
      },
      pieces: {
        quantity: Number(form.pallets),
        unit: 'in',
        parts: [{
          count: Number(form.pallets),
          length: Number(form.length),
          width: Number(form.width),
          height: Number(form.height)
        }]
      },
      weight: { value: Number(form.totalWeight), unit: 'lbs' },
      commodity: form.commodity,
      stackable: form.stackable,
      hazmat: form.hazmat,
      serviceSpeed: form.serviceSpeed,
      accessorials: form.accessorials,
      optimization: {
        recommendedEquipment: recommendation.recommended.label,
        selectedEquipment: selectedEquipment.label,
        reason: recommendation.reason
      }
    };
  }

  async function requestRate(rate) {
    setRequestingRateId(rate.id);
    setRequestError('');
    if (previewMode) {
      window.setTimeout(function() {
        const demoQuote = { id: 'FCTL-DEMO-' + String(Date.now()).slice(-4), status: 'pending' };
        setRequestedQuote(demoQuote);
        if (typeof onQuoteRequested === 'function') onQuoteRequested(demoQuote);
        setRequestingRateId('');
      }, 500);
      return;
    }
    try {
      const response = await fetch(buildApiUrl('/api/customer/quotes'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote: {
            total: rate.total,
            linehaul: rate.lineHaul,
            ratePerMile: rate.ratePerMile,
            truckType: rate.truckType,
            transitTime: rate.transitDays,
            source: rate.source,
            isEstimate: rate.isEstimate
          },
          shipment: buildShipmentRecord()
        })
      });
      const data = await response.json().catch(function() { return null; });
      if (!response.ok) throw new Error((data && data.error) || 'Unable to request this rate.');
      setRequestedQuote(data);
      if (typeof onQuoteRequested === 'function') onQuoteRequested(data);
    } catch (error) {
      setRequestError(error && error.message ? error.message : 'Unable to request this rate.');
    } finally {
      setRequestingRateId('');
    }
  }

  function resetQuote() {
    setForm(INITIAL_FORM);
    setStep(1);
    setRates([]);
    setRateNotice('');
    setRequestedQuote(null);
    setEquipmentTouched(false);
    setValidationError('');
  }

  return (
    <div className="customer-quote-builder" data-testid="customer-quote-builder">
      <div className="cq-page-header">
        <div>
          <button type="button" className="cq-back-link" onClick={onBack}>
            <ArrowLeft size={16} /> Portal overview
          </button>
          <h1>Build a freight quote</h1>
          <p>Enter the lane and freight details. FCTL Smart Match will recommend the right service.</p>
        </div>
        <div className="cq-secure-badge"><ShieldCheck size={16} /> Account pricing</div>
      </div>

      <div className="cq-progress" aria-label="Quote progress">
        <QuoteStep number="1" label="Lane" active={step === 1} complete={step > 1} />
        <QuoteStep number="2" label="Freight" active={step === 2} complete={step > 2} />
        <QuoteStep number="3" label="Equipment" active={step === 3} complete={step > 3} />
        <QuoteStep number="4" label="Rates" active={step === 4} complete={false} />
      </div>

      {step === 1 && (
        <section className="cq-panel" aria-labelledby="lane-heading">
          <div className="cq-panel-heading">
            <div className="cq-panel-icon"><Route size={20} /></div>
            <div><h2 id="lane-heading">Where is it going?</h2><p>Enter a ZIP code or city and state for each stop.</p></div>
          </div>
          <div className="cq-lane-grid">
            <div className="cq-location-group">
              <div className="cq-location-label"><span className="cq-dot origin" /> Pickup</div>
              <div className="cq-field-grid two">
                <label>City<input value={form.originCity} onChange={function(event) { setField('originCity', event.target.value); }} placeholder="Miami" /></label>
                <label>State<input value={form.originState} onChange={function(event) { setField('originState', event.target.value.toUpperCase().slice(0, 2)); }} placeholder="FL" maxLength="2" /></label>
              </div>
              <label>ZIP code<input value={form.originZip} onChange={function(event) { setField('originZip', event.target.value); }} placeholder="33166" inputMode="numeric" /></label>
            </div>
            <div className="cq-lane-connector"><ArrowRight size={20} /></div>
            <div className="cq-location-group">
              <div className="cq-location-label"><span className="cq-dot destination" /> Delivery</div>
              <div className="cq-field-grid two">
                <label>City<input value={form.destinationCity} onChange={function(event) { setField('destinationCity', event.target.value); }} placeholder="Atlanta" /></label>
                <label>State<input value={form.destinationState} onChange={function(event) { setField('destinationState', event.target.value.toUpperCase().slice(0, 2)); }} placeholder="GA" maxLength="2" /></label>
              </div>
              <label>ZIP code<input value={form.destinationZip} onChange={function(event) { setField('destinationZip', event.target.value); }} placeholder="30303" inputMode="numeric" /></label>
            </div>
          </div>
          <div className="cq-field-grid two cq-lane-settings">
            <label><span><CalendarDays size={14} /> Pickup date</span><input type="date" value={form.pickupDate} onChange={function(event) { setField('pickupDate', event.target.value); }} /></label>
            <div className="cq-segment-field">
              <span className="cq-input-label"><Clock3 size={14} /> Service speed</span>
              <div className="cq-segmented">
                <button type="button" className={form.serviceSpeed === 'standard' ? 'active' : ''} onClick={function() { setField('serviceSpeed', 'standard'); }}>Standard</button>
                <button type="button" className={form.serviceSpeed === 'expedited' ? 'active' : ''} onClick={function() { setField('serviceSpeed', 'expedited'); }}><Zap size={14} /> Expedited</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="cq-panel" aria-labelledby="freight-heading">
          <div className="cq-panel-heading">
            <div className="cq-panel-icon"><Boxes size={20} /></div>
            <div><h2 id="freight-heading">What are we moving?</h2><p>Use the dimensions of the largest pallet or handling unit.</p></div>
          </div>
          <div className="cq-field-grid four">
            <label><span><Boxes size={14} /> Pallets</span><input type="number" min="1" max="26" value={form.pallets} onChange={function(event) { setField('pallets', event.target.value); }} /></label>
            <label><span><Ruler size={14} /> Length (in)</span><input type="number" min="1" value={form.length} onChange={function(event) { setField('length', event.target.value); }} /></label>
            <label><span><Ruler size={14} /> Width (in)</span><input type="number" min="1" value={form.width} onChange={function(event) { setField('width', event.target.value); }} /></label>
            <label><span><Ruler size={14} /> Height (in)</span><input type="number" min="1" value={form.height} onChange={function(event) { setField('height', event.target.value); }} /></label>
          </div>
          <div className="cq-field-grid two">
            <label><span><Weight size={14} /> Total weight (lb)</span><input type="number" min="1" value={form.totalWeight} onChange={function(event) { setField('totalWeight', event.target.value); }} /></label>
            <label>Commodity<input value={form.commodity} onChange={function(event) { setField('commodity', event.target.value); }} placeholder="General merchandise" /></label>
          </div>
          <div className="cq-toggle-row">
            <label className="cq-check-control"><input type="checkbox" checked={form.stackable} onChange={function(event) { setField('stackable', event.target.checked); }} /><span><strong>Stackable</strong><small>Freight can be safely stacked</small></span></label>
            <label className="cq-check-control"><input type="checkbox" checked={form.hazmat} onChange={function(event) { setField('hazmat', event.target.checked); }} /><span><strong>Hazardous material</strong><small>Special handling and documentation</small></span></label>
          </div>
          <div className="cq-accessorials">
            <span className="cq-input-label">Additional services</span>
            <div className="cq-chip-list">
              {ACCESSORIAL_OPTIONS.map(function(option) {
                const selected = form.accessorials.indexOf(option.id) > -1;
                return <button type="button" key={option.id} className={selected ? 'selected' : ''} onClick={function() { toggleAccessorial(option.id); }}>{selected && <Check size={13} />}{option.label}</button>;
              })}
            </div>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="cq-panel" aria-labelledby="equipment-heading">
          <div className="cq-panel-heading">
            <div className="cq-panel-icon"><Truck size={20} /></div>
            <div><h2 id="equipment-heading">Choose the service</h2><p>Smart Match checks capacity, dimensions, weight, and service speed.</p></div>
          </div>
          <div className="cq-recommendation">
            <div className="cq-recommendation-icon"><Sparkles size={20} /></div>
            <div><span>FCTL Smart Match</span><strong>{recommendation.recommended.label} recommended</strong><p>{recommendation.reason}</p></div>
          </div>
          <div className="cq-equipment-grid">
            {EQUIPMENT_OPTIONS.map(function(option) {
              const Icon = getEquipmentIcon(option.id);
              const fits = recommendation.fits[option.id];
              const selected = selectedEquipmentId === option.id;
              return (
                <button
                  type="button"
                  key={option.id}
                  className={'cq-equipment-option ' + (selected ? 'selected ' : '') + (!fits ? 'limited' : '')}
                  onClick={function() { setSelectedEquipmentId(option.id); setEquipmentTouched(true); }}
                  aria-pressed={selected}
                >
                  <span className="cq-equipment-icon"><Icon size={20} /></span>
                  <span className="cq-equipment-copy"><strong>{option.label}</strong><small>{option.description}</small><em>{option.capacity}</em></span>
                  <span className="cq-equipment-status">{selected ? <CheckCircle2 size={18} /> : fits ? 'Fits' : 'Review'}</span>
                </button>
              );
            })}
          </div>
          <div className="cq-disclosure"><Info size={15} /> Recommendations are planning guidance. Final capacity is confirmed when the rate is requested.</div>
        </section>
      )}

      {step === 4 && (
        <section className="cq-results" aria-labelledby="rates-heading">
          <div className="cq-results-heading">
            <div><span className="cq-results-kicker"><CircleDollarSign size={16} /> Rate options</span><h2 id="rates-heading">Choose the best way to move it</h2><p>{form.originCity || form.originZip}, {form.originState} to {form.destinationCity || form.destinationZip}, {form.destinationState}</p></div>
            <button type="button" className="cq-secondary-button" onClick={resetQuote}>Start over</button>
          </div>
          {rateNotice && <div className="cq-rate-notice"><Info size={15} /> {rateNotice}</div>}
          {requestedQuote ? (
            <div className="cq-request-success">
              <CheckCircle2 size={28} />
              <div><strong>Rate request received</strong><p>Reference {requestedQuote.id}. Your FCTL representative will confirm capacity and final details.</p></div>
            </div>
          ) : (
            <div className="cq-rate-grid">
              {rates.map(function(rate, index) {
                const recommendedRate = rate.equipmentId === recommendation.recommended.id;
                return (
                  <article className={'cq-rate-card ' + (index === 0 ? 'primary' : '')} key={rate.id}>
                    <div className="cq-rate-card-top">
                      <div><span className="cq-rate-source">{rate.source}</span><h3>{rate.equipmentLabel}</h3></div>
                      {recommendedRate && <span className="cq-best-fit"><Sparkles size={13} /> Best fit</span>}
                    </div>
                    <div className="cq-rate-price">{formatCurrency(rate.total)}<small>{rate.isEstimate ? 'planning estimate' : 'account rate'}</small></div>
                    <div className="cq-rate-details">
                      <span><Route size={15} /> {rate.mileage ? rate.mileage + ' estimated mi' : 'Lane rated'}</span>
                      <span><Clock3 size={15} /> {rate.transitDays ? rate.transitDays + ' day transit' : 'Transit on confirmation'}</span>
                      <span><Truck size={15} /> {rate.truckType || rate.equipmentLabel}</span>
                    </div>
                    <button type="button" className="cq-request-button" disabled={requestingRateId === rate.id} onClick={function() { requestRate(rate); }}>
                      {requestingRateId === rate.id ? 'Requesting...' : 'Request this rate'} <ArrowRight size={16} />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
          {requestError && <div className="cq-form-error">{requestError}</div>}
        </section>
      )}

      {validationError && <div className="cq-form-error" role="alert">{validationError}</div>}

      {step < 4 && (
        <div className="cq-form-actions">
          <button type="button" className="cq-secondary-button" onClick={step === 1 ? onBack : goBack}><ArrowLeft size={16} /> {step === 1 ? 'Cancel' : 'Back'}</button>
          {step < 3 ? (
            <button type="button" className="cq-primary-button" onClick={goForward}>Continue <ArrowRight size={16} /></button>
          ) : (
            <button type="button" className="cq-primary-button" onClick={getRates} disabled={loading}>{loading ? 'Checking carrier network...' : 'Get rate options'} <CircleDollarSign size={17} /></button>
          )}
        </div>
      )}

      <div className="cq-trust-line"><ShieldCheck size={15} /> Quotes are private to {user && user.email ? user.email : 'your account'} and subject to capacity confirmation.</div>
    </div>
  );
}
