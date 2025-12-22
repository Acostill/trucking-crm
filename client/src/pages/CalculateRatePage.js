import React, { useState } from 'react';
import QuoteCard from '../components/QuoteCard';
import { buildApiUrl } from '../config';
import GlobalTopbar from '../components/GlobalTopbar';

const DEFAULT_INITIAL_VALUES = {
  pickupCity: 'Chicago',
  pickupState: 'IL',
  pickupZip: '60605',
  pickupCountry: 'US',
  pickupDate: '2024-12-31T16:00:00.000Z',
  deliveryCity: 'Atlanta',
  deliveryState: 'GA',
  deliveryZip: '30303',
  deliveryCountry: 'US',
  piecesUnit: 'in',
  piecesQuantity: '2',
  part1Length: '74',
  part1Width: '51',
  part1Height: '67',
  part2Length: '75',
  part2Width: '51',
  part2Height: '67',
  weightUnit: 'lbs',
  weightValue: '999',
  hazardousUnNumbersText: 'UN3508, UN3530, UN3536, UN3548',
  accessorialCodesText: 'CALLDEL, DEBRISREM, UPK',
  shipmentId: '1',
  referenceNumber: 'Reference12345'
};

const EMPTY_INITIAL_VALUES = Object.keys(DEFAULT_INITIAL_VALUES).reduce(function(acc, key) {
  acc[key] = '';
  return acc;
}, {});

const EMBEDDED_DEFAULT_VALUES = {
  pickupCity: '',
  pickupState: '',
  pickupZip: '',
  pickupCountry: '',
  pickupDate: '',
  deliveryCity: '',
  deliveryState: '',
  deliveryZip: '',
  deliveryCountry: '',
  piecesUnit: '',
  piecesQuantity: '',
  part1Length: '',
  part1Width: '',
  part1Height: '',
  part2Length: '',
  part2Width: '',
  part2Height: '',
  weightUnit: '',
  weightValue: '',
  hazardousUnNumbersText: 'UN3508, UN3530, UN3536, UN3548',
  accessorialCodesText: 'CALLDEL, DEBRISREM, UPK',
  shipmentId: '1',
  referenceNumber: 'Reference12345'
};

export default function CalculateRatePage({ embedded, initialValues, prefill, onSelectQuote }) {
  var baseInit = embedded ? EMBEDDED_DEFAULT_VALUES : DEFAULT_INITIAL_VALUES;
  var init = initialValues ? { ...baseInit, ...initialValues } : baseInit;

  const [pickupCity, setPickupCity] = useState(init.pickupCity);
  const [pickupState, setPickupState] = useState(init.pickupState);
  const [pickupZip, setPickupZip] = useState(init.pickupZip);
  const [pickupCountry, setPickupCountry] = useState(init.pickupCountry);
  const [pickupDate, setPickupDate] = useState(init.pickupDate);

  const [deliveryCity, setDeliveryCity] = useState(init.deliveryCity);
  const [deliveryState, setDeliveryState] = useState(init.deliveryState);
  const [deliveryZip, setDeliveryZip] = useState(init.deliveryZip);
  const [deliveryCountry, setDeliveryCountry] = useState(init.deliveryCountry);

  const [piecesUnit, setPiecesUnit] = useState(init.piecesUnit);
  const [piecesQuantity, setPiecesQuantity] = useState(init.piecesQuantity);
  const [part1Length, setPart1Length] = useState(init.part1Length);
  const [part1Width, setPart1Width] = useState(init.part1Width);
  const [part1Height, setPart1Height] = useState(init.part1Height);
  const [part2Length, setPart2Length] = useState(init.part2Length);
  const [part2Width, setPart2Width] = useState(init.part2Width);
  const [part2Height, setPart2Height] = useState(init.part2Height);

  const [weightUnit, setWeightUnit] = useState(init.weightUnit);
  const [weightValue, setWeightValue] = useState(init.weightValue);

  const [hazardousUnNumbersText, setHazardousUnNumbersText] = useState(init.hazardousUnNumbersText);
  const [accessorialCodesText, setAccessorialCodesText] = useState(init.accessorialCodesText);

  const [shipmentId, setShipmentId] = useState(init.shipmentId);
  const [referenceNumber, setReferenceNumber] = useState(init.referenceNumber);

  // When a prefill object is provided (e.g., from email-paste), update fields
  React.useEffect(function() {
    console.log('[CalculateRatePage] prefill changed:', prefill);
    if (!prefill) return;
    
    console.log('[CalculateRatePage] Applying prefill values');
    function apply(setter, value) {
      if (value !== undefined && value !== null && value !== '') {
        setter(value);
      }
    }

    apply(setPickupCity, prefill.pickupCity);
    apply(setPickupState, prefill.pickupState);
    apply(setPickupZip, prefill.pickupZip);
    apply(setPickupCountry, prefill.pickupCountry);
    apply(setPickupDate, prefill.pickupDate);

    apply(setDeliveryCity, prefill.deliveryCity);
    apply(setDeliveryState, prefill.deliveryState);
    apply(setDeliveryZip, prefill.deliveryZip);
    apply(setDeliveryCountry, prefill.deliveryCountry);

    apply(setPiecesUnit, prefill.piecesUnit);
    apply(setPiecesQuantity, prefill.piecesQuantity);
    apply(setPart1Length, prefill.part1Length);
    apply(setPart1Width, prefill.part1Width);
    apply(setPart1Height, prefill.part1Height);
    apply(setPart2Length, prefill.part2Length);
    apply(setPart2Width, prefill.part2Width);
    apply(setPart2Height, prefill.part2Height);

    apply(setWeightUnit, prefill.weightUnit);
    apply(setWeightValue, prefill.weightValue);

    apply(setHazardousUnNumbersText, prefill.hazardousUnNumbersText);
    apply(setAccessorialCodesText, prefill.accessorialCodesText);

    apply(setShipmentId, prefill.shipmentId);
    apply(setReferenceNumber, prefill.referenceNumber);
  }, [prefill]);

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
    
    // Always show the contact modal when a quote is selected
    resetContactForm();
    setContactConfirmation('');
    setSelectedQuote(quote);
    setIsContactModalOpen(true);
  }

  function handleCloseContactModal() {
    setSelectedQuote(null);
    setIsContactModalOpen(false);
  }

  function generateQuoteHTML(quote, shipment, contact) {
    var rate = quote.rate || {};
    var linehaul = rate.priceLineHaul;
    var rpm = rate.rpm;
    var total = quote.priceTotal;
    var truckType = quote.truckType;
    var transitTime = quote.transitTime;
    var rateCalculationID = quote.rateCalculationID;
    var accessorials = quote.priceAccessorials || [];
    var accessorialsTotal = accessorials.reduce(function(sum, a) {
      return sum + (Number(a.price) || 0);
    }, 0);

    var pickup = shipment.pickup || {};
    var delivery = shipment.delivery || {};
    var pickupLoc = pickup.location || {};
    var deliveryLoc = delivery.location || {};

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 40px;
      color: #1f2937;
      line-height: 1.6;
    }
    .header {
      border-bottom: 3px solid #4f46e5;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0;
      color: #4f46e5;
      font-size: 28px;
    }
    .header p {
      margin: 5px 0 0 0;
      color: #6b7280;
      font-size: 14px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 15px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 8px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .info-item {
      margin-bottom: 12px;
    }
    .info-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .info-value {
      font-size: 16px;
      color: #111827;
      font-weight: 500;
    }
    .quote-summary {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .quote-total {
      text-align: center;
      padding: 20px;
      background: #4f46e5;
      color: white;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .quote-total-label {
      font-size: 14px;
      opacity: 0.9;
      margin-bottom: 8px;
    }
    .quote-total-value {
      font-size: 36px;
      font-weight: 700;
    }
    .quote-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }
    .quote-detail-item {
      padding: 12px;
      background: white;
      border-radius: 6px;
    }
    .quote-detail-label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .quote-detail-value {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    }
    .accessorials-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    .accessorials-table th,
    .accessorials-table td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .accessorials-table th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
      font-size: 12px;
      text-transform: uppercase;
    }
    .accessorials-table td {
      color: #111827;
    }
    .badges {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 10px;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      background: #e0e7ff;
      color: #4f46e5;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Freight Quote</h1>
    <p>Generated on ${new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}</p>
  </div>

  <div class="section">
    <div class="section-title">Contact Information</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Name</div>
        <div class="info-value">${contact.name || 'N/A'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Email</div>
        <div class="info-value">${contact.email || 'N/A'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Phone</div>
        <div class="info-value">${contact.phone || 'N/A'}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Shipment Details</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Pickup Location</div>
        <div class="info-value">${[pickupLoc.city, pickupLoc.state, pickupLoc.zip].filter(Boolean).join(', ') || 'N/A'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Delivery Location</div>
        <div class="info-value">${[deliveryLoc.city, deliveryLoc.state, deliveryLoc.zip].filter(Boolean).join(', ') || 'N/A'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Pickup Date</div>
        <div class="info-value">${pickup.date ? new Date(pickup.date).toLocaleDateString() : 'N/A'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Weight</div>
        <div class="info-value">${shipment.weight ? shipment.weight.value + ' ' + (shipment.weight.unit || 'lbs') : 'N/A'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Pieces</div>
        <div class="info-value">${shipment.pieces ? shipment.pieces.quantity + ' ' + (shipment.pieces.unit || 'pieces') : 'N/A'}</div>
      </div>
    </div>
  </div>

  <div class="quote-total">
    <div class="quote-total-label">Total Quote Amount</div>
    <div class="quote-total-value">${formatCurrency(total)}</div>
  </div>

  <div class="quote-summary">
    <div class="section-title">Quote Breakdown</div>
    <div class="quote-details">
      <div class="quote-detail-item">
        <div class="quote-detail-label">Linehaul</div>
        <div class="quote-detail-value">${formatCurrency(linehaul)}</div>
      </div>
      <div class="quote-detail-item">
        <div class="quote-detail-label">Rate per Mile</div>
        <div class="quote-detail-value">${typeof rpm === 'number' ? '$' + formatNumber(rpm) + ' / mi' : 'N/A'}</div>
      </div>
      <div class="quote-detail-item">
        <div class="quote-detail-label">Accessorials Total</div>
        <div class="quote-detail-value">${formatCurrency(accessorialsTotal)}</div>
      </div>
      <div class="quote-detail-item">
        <div class="quote-detail-label">Transit Time</div>
        <div class="quote-detail-value">${typeof transitTime === 'number' ? transitTime + ' day' + (transitTime === 1 ? '' : 's') : 'N/A'}</div>
      </div>
    </div>
    ${truckType ? '<div class="badges"><span class="badge">' + truckType + '</span></div>' : ''}
    ${rateCalculationID ? '<div style="margin-top: 10px; font-size: 12px; color: #6b7280;">Rate Calculation ID: ' + rateCalculationID + '</div>' : ''}
  </div>

  ${accessorials.length > 0 ? `
  <div class="section">
    <div class="section-title">Accessorials</div>
    <table class="accessorials-table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Price</th>
        </tr>
      </thead>
      <tbody>
        ${accessorials.map(function(a) {
          return '<tr><td>' + (a.description || a.code || 'N/A') + '</td><td>' + formatCurrency(Number(a.price) || 0) + '</td></tr>';
        }).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="footer">
    <p>This quote is valid for the shipment details provided above.</p>
    <p>First Class Trucking - Freight Logistics Simplified</p>
  </div>
</body>
</html>
    `;
  }

  async function handleContactSubmit(e) {
    e.preventDefault();
    if (!selectedQuote) return;
    var nameSnapshot = contactName;
    
    // Build shipment details from form fields
    var shipmentDetails = buildPayload();
    
    // Prepare contact info
    var contactInfo = {
      name: contactName,
      email: contactEmail,
      phone: contactPhone
    };
    
    // Generate PDF from quote HTML
    var pdfBlob = null;
    try {
      var quoteHTML = generateQuoteHTML(selectedQuote, shipmentDetails, contactInfo);
      var pdfResp = await fetch(buildApiUrl('/api/generate-pdf'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: quoteHTML,
          options: {
            format: 'Letter',
            margin: {
              top: '20mm',
              right: '20mm',
              bottom: '20mm',
              left: '20mm'
            },
            printBackground: true
          }
        })
      });
      
      if (pdfResp.ok) {
        pdfBlob = await pdfResp.blob();
        console.log('PDF generated successfully');
      } else {
        console.warn('Failed to generate PDF:', pdfResp.status);
      }
    } catch (pdfErr) {
      console.error('Error generating PDF:', pdfErr);
      // Continue even if PDF generation fails
    }
    
    // Prepare quote data for n8n webhook
    var quoteData = {
      contact: contactInfo,
      quote: {
        total: selectedQuote.priceTotal,
        linehaul: selectedQuote.rate && selectedQuote.rate.priceLineHaul,
        ratePerMile: selectedQuote.rate && selectedQuote.rate.rpm,
        truckType: selectedQuote.truckType,
        transitTime: selectedQuote.transitTime,
        rateCalculationID: selectedQuote.rateCalculationID,
        accessorials: selectedQuote.priceAccessorials || [],
        accessorialsTotal: (selectedQuote.priceAccessorials || []).reduce(function(sum, a) {
          return sum + (Number(a.price) || 0);
        }, 0)
      },
      shipment: shipmentDetails,
      submittedAt: new Date().toISOString()
    };
    
    // Send to n8n webhook with PDF as binary file
    try {
      const webhookUrl = 'https://n8n.srv850160.hstgr.cloud/webhook/c07b5090-d667-4563-91ea-071d65f6e67a';
      
      // Generate quote ID and save quote to our API
      var quoteId = 'quote-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      quoteData.id = quoteId;
      quoteData.quoteUrl = window.location.origin + '/quotes/' + quoteId;
      
      try {
        // Save quote to our API for later viewing
        var saveResp = await fetch(buildApiUrl('/api/quotes'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(quoteData)
        });
        
        if (saveResp.ok) {
          console.log('Quote saved to database with ID:', quoteId);
        } else {
          console.warn('Failed to save quote to database:', saveResp.status);
        }
      } catch (saveErr) {
        console.warn('Failed to save quote to API:', saveErr);
        // Continue even if save fails
      }
      
      if (pdfBlob) {
        // Use FormData to send PDF as binary file along with JSON data
        var formData = new FormData();
        
        // Add the PDF file
        var pdfFilename = 'quote-' + new Date().toISOString().split('T')[0] + '.pdf';
        formData.append('pdf', pdfBlob, pdfFilename);
        
        // Add the JSON data as a string (n8n can parse this)
        formData.append('data', JSON.stringify(quoteData));
        
        // Also add individual fields for easier access in n8n
        formData.append('contact_name', contactInfo.name || '');
        formData.append('contact_email', contactInfo.email || '');
        formData.append('contact_phone', contactInfo.phone || '');
        formData.append('quote_total', String(selectedQuote.priceTotal || ''));
        formData.append('quote_linehaul', String((selectedQuote.rate && selectedQuote.rate.priceLineHaul) || ''));
        formData.append('quote_truck_type', selectedQuote.truckType || '');
        formData.append('quote_transit_time', String(selectedQuote.transitTime || ''));
        formData.append('quote_id', quoteId);
        formData.append('quote_url', window.location.origin + '/quotes/' + quoteId);
        formData.append('submitted_at', new Date().toISOString());
        
        const webhookResp = await fetch(webhookUrl, {
          method: 'POST',
          body: formData
          // Don't set Content-Type header - browser will set it with boundary for FormData
        });
        
        if (!webhookResp.ok) {
          console.warn('n8n webhook returned non-OK status:', webhookResp.status);
        } else {
          console.log('Quote details with PDF binary sent to n8n webhook successfully');
        }
      } else {
        // Fallback: send JSON only if PDF generation failed
        const webhookResp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(quoteData)
        });
        
        if (!webhookResp.ok) {
          console.warn('n8n webhook returned non-OK status:', webhookResp.status);
        } else {
          console.log('Quote details sent to n8n webhook (without PDF)');
        }
      }
    } catch (webhookErr) {
      console.error('Error sending quote to n8n webhook:', webhookErr);
      // Don't block the flow if webhook fails
    }
    
    // If parent provided onSelectQuote callback, call it with the quote and contact info
    if (typeof onSelectQuote === 'function') {
      try {
        await onSelectQuote(selectedQuote, {
          name: contactName,
          email: contactEmail,
          phone: contactPhone
        });
      } catch (err) {
        console.error('Error in onSelectQuote callback:', err);
        // Still show confirmation even if callback fails
      }
    }
    
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
      // Make single unified call to /calculate-rate which returns both quotes
      var resp = await fetch(buildApiUrl('/calculate-rate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        var errorText = await resp.text();
        throw new Error(errorText || 'Failed to fetch quotes');
      }

      var combinedData = await resp.json();
      
      // Extract results from unified response
      var calcData = combinedData.calculateRate || null;
      var fwdData = combinedData.forwardAir || null;

      // Set calculate-rate result
      if (calcData && !calcData.error) {
        setResult(calcData);
      } else if (calcData && calcData.error) {
        console.error('Calculate-rate API error:', calcData.error);
      }

      // Process Forward Air result if available
      if (fwdData && !fwdData.error) {
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
      } else if (fwdData && fwdData.error) {
        console.error('Forward Air API error:', fwdData.error);
      }
    } catch (err) {
      setError(err && err.message ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  var card = (
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
  );

  if (embedded) {
    return (
      <div className="calculate-rate-embedded">
        <div className="container">
          {card}
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

  return (
    <div className="shell calculate-rate-page">
      <GlobalTopbar />
      <div className="container">
        {card}
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

