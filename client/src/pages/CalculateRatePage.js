import React, { useState } from 'react';
import QuoteCard from '../components/QuoteCard';
import { buildApiUrl } from '../config';

export default function CalculateRatePage() {
  const [pickupCity, setPickupCity] = useState('Chicago');
  const [pickupState, setPickupState] = useState('IL');
  const [pickupZip, setPickupZip] = useState('60605');
  const [pickupCountry, setPickupCountry] = useState('US');
  const [pickupDate, setPickupDate] = useState('2024-12-31T16:00:00.000Z');

  const [deliveryCity, setDeliveryCity] = useState('Atlanta');
  const [deliveryState, setDeliveryState] = useState('GA');
  const [deliveryZip, setDeliveryZip] = useState('30303');
  const [deliveryCountry, setDeliveryCountry] = useState('US');

  const [piecesUnit, setPiecesUnit] = useState('in');
  const [piecesQuantity, setPiecesQuantity] = useState('2');
  const [part1Length, setPart1Length] = useState('74');
  const [part1Width, setPart1Width] = useState('51');
  const [part1Height, setPart1Height] = useState('67');
  const [part2Length, setPart2Length] = useState('75');
  const [part2Width, setPart2Width] = useState('51');
  const [part2Height, setPart2Height] = useState('67');

  const [weightUnit, setWeightUnit] = useState('lbs');
  const [weightValue, setWeightValue] = useState('999');

  const [hazardousUnNumbersText, setHazardousUnNumbersText] = useState('UN3508, UN3530, UN3536, UN3548');
  const [accessorialCodesText, setAccessorialCodesText] = useState('CALLDEL, DEBRISREM, UPK');

  const [shipmentId, setShipmentId] = useState('1');
  const [referenceNumber, setReferenceNumber] = useState('Reference12345');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [forwardResult, setForwardResult] = useState(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactConfirmation, setContactConfirmation] = useState('');

  function buildPayload() {
    return {
      pickup: {
        location: {
          city: pickupCity,
          state: pickupState,
          zip: pickupZip,
          country: pickupCountry
        },
        date: pickupDate
      },
      delivery: {
        location: {
          city: deliveryCity,
          state: deliveryState,
          zip: deliveryZip,
          country: deliveryCountry
        }
      },
      pieces: {
        unit: piecesUnit,
        quantity: Number(piecesQuantity),
        parts: [
          {
            length: Number(part1Length),
            width: Number(part1Width),
            height: Number(part1Height)
          },
          {
            length: Number(part2Length),
            width: Number(part2Width),
            height: Number(part2Height)
          }
        ]
      },
      weight: {
        unit: weightUnit,
        value: Number(weightValue)
      },
      hazardousMaterial: {
        unNumbers: hazardousUnNumbersText
          .split(',')
          .map(function(s) { return s.trim(); })
          .filter(function(s) { return s.length > 0; })
      },
      accessorialCodes: accessorialCodesText
        .split(',')
        .map(function(s) { return s.trim(); })
        .filter(function(s) { return s.length > 0; }),
      shipmentId: shipmentId,
      referenceNumber: referenceNumber
    };
  }

  function formatCurrency(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    } catch (_err) {
      return `$${value.toFixed(2)}`;
    }
  }

  function resetContactForm() {
    setContactName('');
    setContactEmail('');
    setContactPhone('');
  }

  function handleSelectQuote(quote) {
    if (!quote || typeof quote !== 'object') return;
    resetContactForm();
    setContactConfirmation('');
    setSelectedQuote(quote);
    setIsContactModalOpen(true);
  }

  function handleCloseContactModal() {
    setSelectedQuote(null);
    setIsContactModalOpen(false);
  }

  function handleContactSubmit(e) {
    e.preventDefault();
    if (!selectedQuote) return;
    var nameSnapshot = contactName;
    console.log('Contact info submitted for quote:', {
      quote: selectedQuote,
      contact: {
        name: contactName,
        email: contactEmail,
        phone: contactPhone
      }
    });
    setContactConfirmation(
      nameSnapshot && nameSnapshot.length > 0
        ? `Thanks, ${nameSnapshot}. We'll reach out shortly.`
        : "Thanks! We'll reach out shortly."
    );
    resetContactForm();
    handleCloseContactModal();
  }

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setForwardResult(null);

    var payload = buildPayload();

    try {
      var [calcResp, fwdResp] = await Promise.all([
        fetch(buildApiUrl('/calculate-rate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }),
        fetch(buildApiUrl('/forwardair-quote'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      ]);

      var calcCT = calcResp.headers.get('content-type') || '';
      var calcData = calcCT.indexOf('application/json') > -1
        ? await calcResp.json()
        : await calcResp.text();
      if (!calcResp.ok) {
        throw new Error(typeof calcData === 'string' ? calcData : JSON.stringify(calcData));
      }
      setResult(calcData);

      var fwdCT = fwdResp.headers.get('content-type') || '';
      var fwdData = fwdCT.indexOf('application/json') > -1
        ? await fwdResp.json()
        : await fwdResp.text();
      if (!fwdResp.ok) {
        throw new Error(typeof fwdData === 'string' ? fwdData : JSON.stringify(fwdData));
      }

      function coerceNumber(value) {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          var n = Number(value.replace(/[^0-9.\-]/g, ''));
          return Number.isNaN(n) ? undefined : n;
        }
        return undefined;
      }
      function findNumberByKeys(obj, keyCandidates) {
        if (!obj || typeof obj !== 'object') return undefined;
        for (var i = 0; i < keyCandidates.length; i++) {
          var key = keyCandidates[i];
          for (var k in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
            if (k.toLowerCase().indexOf(key.toLowerCase()) > -1) {
              var num = coerceNumber(obj[k]);
              if (typeof num === 'number') return num;
            }
          }
        }
        for (var k2 in obj) {
          if (!Object.prototype.hasOwnProperty.call(obj, k2)) continue;
          var v = obj[k2];
          if (v && typeof v === 'object') {
            var found = findNumberByKeys(v, keyCandidates);
            if (typeof found === 'number') return found;
          }
        }
        return undefined;
      }
      function findArrayByKeys(obj, keyCandidates) {
        if (!obj || typeof obj !== 'object') return undefined;
        for (var i = 0; i < keyCandidates.length; i++) {
          var key = keyCandidates[i];
          for (var k in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
            if (k.toLowerCase().indexOf(key.toLowerCase()) > -1 && Array.isArray(obj[k])) {
              return obj[k];
            }
          }
        }
        for (var k2 in obj) {
          if (!Object.prototype.hasOwnProperty.call(obj, k2)) continue;
          var v = obj[k2];
          if (v && typeof v === 'object') {
            var found = findArrayByKeys(v, keyCandidates);
            if (Array.isArray(found)) return found;
          }
        }
        return undefined;
      }
      var mapped = {
        rate: {
          priceLineHaul: findNumberByKeys(fwdData, ['linehaul', 'line_haul', 'base', 'basecharge'])
        },
        priceTotal: findNumberByKeys(fwdData, ['total', 'grandtotal', 'quoteamount', 'amountdue']),
        priceAccessorials: []
      };
      var accessorialArrays = findArrayByKeys(fwdData, ['accessorial', 'accessorials', 'charges', 'surcharges', 'fees']);
      if (Array.isArray(accessorialArrays)) {
        mapped.priceAccessorials = accessorialArrays.map(function(item) {
          var price = findNumberByKeys(item, ['price', 'amount', 'charge']);
          var desc = (function(it){
            if (!it || typeof it !== 'object') return undefined;
            if (typeof it.description === 'string') return it.description;
            for (var kk in it) {
              if (!Object.prototype.hasOwnProperty.call(it, kk)) continue;
              if (kk.toLowerCase().indexOf('description') > -1 || kk.toLowerCase().indexOf('code') > -1) {
                if (typeof it[kk] === 'string') return it[kk];
              }
            }
            return undefined;
          })(item);
          return { description: desc || 'Accessorial', price: price || 0 };
        });
      }
      setForwardResult(mapped);
    } catch (err) {
      setError(err && err.message ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell calculate-rate-page">
      <div className="topbar">
        <div className="brand">
          <div className="brand-badge"></div>
          Calculate Rate
        </div>
      </div>
      <div className="container">
        <div className="card">
          <div className="card-header">
            <h2 className="title">Shipment details</h2>
            <div className="subtitle">Enter pickup, delivery and freight info</div>
          </div>
          <div className="card-body">
            <form onSubmit={onSubmit} className="form-grid">
              <fieldset>
                <legend>Pickup</legend>
                <div className="row-4">
                  <label>
                    City
                    <input value={pickupCity} onChange={function(e){ setPickupCity(e.target.value); }} />
                  </label>
                  <label>
                    State
                    <input value={pickupState} onChange={function(e){ setPickupState(e.target.value); }} />
                  </label>
                  <label>
                    Zip
                    <input value={pickupZip} onChange={function(e){ setPickupZip(e.target.value); }} />
                  </label>
                  <label>
                    Country
                    <input value={pickupCountry} onChange={function(e){ setPickupCountry(e.target.value); }} />
                  </label>
                </div>
                <label>
                  Date (ISO)
                  <input value={pickupDate} onChange={function(e){ setPickupDate(e.target.value); }} />
                </label>
              </fieldset>

              <fieldset>
                <legend>Delivery</legend>
                <div className="row-4">
                  <label>
                    City
                    <input value={deliveryCity} onChange={function(e){ setDeliveryCity(e.target.value); }} />
                  </label>
                  <label>
                    State
                    <input value={deliveryState} onChange={function(e){ setDeliveryState(e.target.value); }} />
                  </label>
                  <label>
                    Zip
                    <input value={deliveryZip} onChange={function(e){ setDeliveryZip(e.target.value); }} />
                  </label>
                  <label>
                    Country
                    <input value={deliveryCountry} onChange={function(e){ setDeliveryCountry(e.target.value); }} />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Pieces</legend>
                <div className="row-2">
                  <label>
                    Unit
                    <input value={piecesUnit} onChange={function(e){ setPiecesUnit(e.target.value); }} />
                  </label>
                  <label>
                    Quantity
                    <input type="number" value={piecesQuantity} onChange={function(e){ setPiecesQuantity(e.target.value); }} />
                  </label>
                </div>
                <div>
                  <div className="section-title">Part 1</div>
                  <div className="row-3">
                    <label>
                      Length
                      <input type="number" value={part1Length} onChange={function(e){ setPart1Length(e.target.value); }} />
                    </label>
                    <label>
                      Width
                      <input type="number" value={part1Width} onChange={function(e){ setPart1Width(e.target.value); }} />
                    </label>
                    <label>
                      Height
                      <input type="number" value={part1Height} onChange={function(e){ setPart1Height(e.target.value); }} />
                    </label>
                  </div>
                </div>
                <div>
                  <div className="section-title">Part 2</div>
                  <div className="row-3">
                    <label>
                      Length
                      <input type="number" value={part2Length} onChange={function(e){ setPart2Length(e.target.value); }} />
                    </label>
                    <label>
                      Width
                      <input type="number" value={part2Width} onChange={function(e){ setPart2Width(e.target.value); }} />
                    </label>
                    <label>
                      Height
                      <input type="number" value={part2Height} onChange={function(e){ setPart2Height(e.target.value); }} />
                    </label>
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend>Weight</legend>
                <div className="row-2">
                  <label>
                    Unit
                    <input value={weightUnit} onChange={function(e){ setWeightUnit(e.target.value); }} />
                  </label>
                  <label>
                    Value
                    <input type="number" value={weightValue} onChange={function(e){ setWeightValue(e.target.value); }} />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Hazardous Material</legend>
                <label>
                  UN Numbers (comma separated)
                  <input value={hazardousUnNumbersText} onChange={function(e){ setHazardousUnNumbersText(e.target.value); }} />
                </label>
              </fieldset>

              <fieldset>
                <legend>Accessorial Codes</legend>
                <label>
                  Codes (comma separated)
                  <input value={accessorialCodesText} onChange={function(e){ setAccessorialCodesText(e.target.value); }} />
                </label>
              </fieldset>

              <fieldset>
                <legend>Identifiers</legend>
                <div className="row-2">
                  <label>
                    Shipment ID
                    <input value={shipmentId} onChange={function(e){ setShipmentId(e.target.value); }} />
                  </label>
                  <label>
                    Reference Number
                    <input value={referenceNumber} onChange={function(e){ setReferenceNumber(e.target.value); }} />
                  </label>
                </div>
              </fieldset>

              <div className="actions">
                <button className="btn" type="submit" disabled={loading}>
                  {loading ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>

            <div className="status">
              {error && (
                <div className="error">Error: {error}</div>
              )}
              {contactConfirmation && (
                <div className="success">{contactConfirmation}</div>
              )}
              {result && typeof result === 'object' && !Array.isArray(result) && (
                <QuoteCard quote={result} onSelectQuote={handleSelectQuote} />
              )}
              {forwardResult && typeof forwardResult === 'object' && !Array.isArray(forwardResult) && (
                <QuoteCard quote={forwardResult} onSelectQuote={handleSelectQuote} />
              )}
              {result && (typeof result === 'string' || Array.isArray(result)) && (
                <div className="response">{typeof result === 'string' ? result : JSON.stringify(result)}</div>
              )}
            </div>
          </div>
        </div>
      </div>
      {isContactModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title">
          <div className="modal">
            <div className="modal-header">
              <div>
                <div id="contact-modal-title" className="modal-title">Share your contact details</div>
                <div className="modal-subtitle">We’ll follow up about the selected quote.</div>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close dialog"
                onClick={handleCloseContactModal}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-summary">
                <div className="label">Quote total</div>
                <div className="value">{formatCurrency(selectedQuote && selectedQuote.priceTotal)}</div>
              </div>
              <form className="modal-form" onSubmit={handleContactSubmit}>
                <label>
                  Name
                  <input
                    value={contactName}
                    onChange={function(e){ setContactName(e.target.value); }}
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={function(e){ setContactEmail(e.target.value); }}
                    required
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={function(e){ setContactPhone(e.target.value); }}
                    required
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={handleCloseContactModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn">
                    Submit info
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

