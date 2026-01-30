import React, { useState } from 'react';
import QuoteCard from '../components/QuoteCard';
import { buildApiUrl } from '../config';
import GlobalTopbar from '../components/GlobalTopbar';
import { useLocation } from 'react-router-dom';

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
  part1Length: '74',
  part1Width: '51',
  part1Height: '67',
  part2Length: '',
  part2Width: '',
  part2Height: '',
  weightUnit: 'lbs',
  hazardousUnNumbersText: 'UN3508, UN3530, UN3536, UN3548',
  accessorialCodesText: 'CALLDEL, DEBRISREM, UPK',
  shipmentId: '1',
  referenceNumber: 'Reference12345',
  equipmentType: ''
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
  part1Length: '',
  part1Width: '',
  part1Height: '',
  part2Length: '',
  part2Width: '',
  part2Height: '',
  weightUnit: '',
  hazardousUnNumbersText: 'UN3508, UN3530, UN3536, UN3548',
  accessorialCodesText: 'CALLDEL, DEBRISREM, UPK',
  shipmentId: '1',
  referenceNumber: 'Reference12345',
  equipmentType: ''
};

function buildPiecesRowsFrom(source) {
  const rows = [];
  if (source.part1Length || source.part1Width || source.part1Height) {
    rows.push({
      length: source.part1Length || '',
      width: source.part1Width || '',
      height: source.part1Height || '',
      weight: source.part1Weight || ''
    });
  }
  if (source.part2Length || source.part2Width || source.part2Height) {
    rows.push({
      length: source.part2Length || '',
      width: source.part2Width || '',
      height: source.part2Height || '',
      weight: source.part2Weight || ''
    });
  }
  if (!rows.length) {
    rows.push({ length: '', width: '', height: '', weight: '' });
  }
  return rows;
}

export default function CalculateRatePage({ embedded, initialValues, prefill, onSelectQuote }) {
  const location = useLocation();
  const mergedPrefill = prefill || (location && location.state ? location.state.prefill : null);
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
  const [piecesRows, setPiecesRows] = useState(buildPiecesRowsFrom(init));

  const [weightUnit, setWeightUnit] = useState(init.weightUnit);

  const [hazardousUnNumbersText, setHazardousUnNumbersText] = useState(init.hazardousUnNumbersText);
  const [accessorialCodesText, setAccessorialCodesText] = useState(init.accessorialCodesText);

  const [shipmentId, setShipmentId] = useState(init.shipmentId);
  const [referenceNumber, setReferenceNumber] = useState(init.referenceNumber);
  const [equipmentType, setEquipmentType] = useState(init.equipmentType);

  // When a prefill object is provided (e.g., from email-paste), update fields
  React.useEffect(function() {
    console.log('[CalculateRatePage] prefill changed:', mergedPrefill);
    if (!mergedPrefill) return;
    
    console.log('[CalculateRatePage] Applying prefill values');
    function apply(setter, value) {
      if (value !== undefined && value !== null && value !== '') {
        setter(value);
      }
    }

    apply(setPickupCity, mergedPrefill.pickupCity);
    apply(setPickupState, mergedPrefill.pickupState);
    apply(setPickupZip, mergedPrefill.pickupZip);
    apply(setPickupCountry, mergedPrefill.pickupCountry);
    apply(setPickupDate, mergedPrefill.pickupDate);

    apply(setDeliveryCity, mergedPrefill.deliveryCity);
    apply(setDeliveryState, mergedPrefill.deliveryState);
    apply(setDeliveryZip, mergedPrefill.deliveryZip);
    apply(setDeliveryCountry, mergedPrefill.deliveryCountry);

    apply(setPiecesUnit, mergedPrefill.piecesUnit);
    apply(setWeightUnit, mergedPrefill.weightUnit);

    if (Array.isArray(mergedPrefill.piecesRows)) {
      setPiecesRows(mergedPrefill.piecesRows.map(function(row) {
        return {
          length: row.length || '',
          width: row.width || '',
          height: row.height || '',
          weight: row.weight || ''
        };
      }));
    } else if (
      mergedPrefill.part1Length || mergedPrefill.part1Width || mergedPrefill.part1Height ||
      mergedPrefill.part2Length || mergedPrefill.part2Width || mergedPrefill.part2Height
    ) {
      setPiecesRows(buildPiecesRowsFrom(mergedPrefill));
    } else if (mergedPrefill.piecesQuantity) {
      var count = Math.max(1, Number(mergedPrefill.piecesQuantity) || 1);
      setPiecesRows(function(prev) {
        var next = prev.slice(0, count);
        while (next.length < count) {
          next.push({ length: '', width: '', height: '', weight: '' });
        }
        return next;
      });
    }

    if (mergedPrefill.weightValue) {
      setPiecesRows(function(prev) {
        var hasWeight = prev.some(function(row) { return row.weight; });
        if (hasWeight) return prev;
        var next = prev.slice();
        next[0] = { ...next[0], weight: mergedPrefill.weightValue };
        return next;
      });
    }

    apply(setHazardousUnNumbersText, mergedPrefill.hazardousUnNumbersText);
    apply(setAccessorialCodesText, mergedPrefill.accessorialCodesText);

    apply(setShipmentId, mergedPrefill.shipmentId);
    apply(setReferenceNumber, mergedPrefill.referenceNumber);
    apply(setEquipmentType, mergedPrefill.equipmentType || mergedPrefill.truckType);
  }, [mergedPrefill]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [forwardResult, setForwardResult] = useState(null);
  const [datResult, setDatResult] = useState(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactConfirmation, setContactConfirmation] = useState('');
  const [dimensionsFile, setDimensionsFile] = useState(null);
  const [dimensionsLoading, setDimensionsLoading] = useState(false);
  const [dimensionsError, setDimensionsError] = useState(null);

  function updatePieceRow(index, key, value) {
    setPiecesRows(function(prev) {
      var next = prev.slice();
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  function addPieceRow() {
    setPiecesRows(function(prev) {
      return prev.concat([{ length: '', width: '', height: '', weight: '' }]);
    });
  }

  function removePieceRow(index) {
    setPiecesRows(function(prev) {
      if (prev.length <= 1) return prev;
      return prev.filter(function(_row, idx) { return idx !== index; });
    });
  }

  function computeTotalWeight(rows) {
    return rows.reduce(function(sum, row) {
      var val = Number(row.weight);
      if (Number.isNaN(val)) return sum;
      return sum + val;
    }, 0);
  }

  async function handleExtractDimensions() {
    if (!dimensionsFile) {
      setDimensionsError('Please select an image first.');
      return;
    }
    setDimensionsLoading(true);
    setDimensionsError(null);
    try {
      var formData = new FormData();
      formData.append('image', dimensionsFile);
      var resp = await fetch(buildApiUrl('/api/extract-dimensions-openrouter'), {
        method: 'POST',
        body: formData
      });
      if (!resp.ok) {
        var errorText = await resp.text();
        throw new Error(errorText || 'Failed to extract dimensions.');
      }
      var data = await resp.json();
      var pieces = Array.isArray(data.pieces) ? data.pieces : [];
      if (!pieces.length) {
        setDimensionsError('No dimensions were detected in the image.');
        return;
      }
      var mapped = pieces.map(function(piece) {
        return {
          length: piece.length_in != null ? String(piece.length_in) : '',
          width: piece.width_in != null ? String(piece.width_in) : '',
          height: piece.height_in != null ? String(piece.height_in) : '',
          weight: piece.weight != null ? String(piece.weight) : ''
        };
      });
      setPiecesRows(mapped);
    } catch (err) {
      setDimensionsError(err && err.message ? err.message : 'Failed to extract dimensions.');
    } finally {
      setDimensionsLoading(false);
    }
  }

  function buildPayload() {
    var totalWeight = computeTotalWeight(piecesRows);
    function toNumberOrUndefined(value) {
      var num = Number(value);
      return Number.isNaN(num) ? undefined : num;
    }
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
        quantity: piecesRows.length,
        parts: piecesRows.map(function(row) {
          return {
            length: toNumberOrUndefined(row.length),
            width: toNumberOrUndefined(row.width),
            height: toNumberOrUndefined(row.height),
            weight: toNumberOrUndefined(row.weight)
          };
        })
      },
      weight: {
        unit: weightUnit,
        value: totalWeight
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
      referenceNumber: referenceNumber,
      truckType: equipmentType || undefined
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

  function formatNumber(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
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
    @page {
      margin: 15mm;
      size: Letter;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #0f172a;
      line-height: 1.5;
      font-size: 12px;
    }
    .logo-container {
      text-align: center;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e2e8f0;
    }
    .logo-container img {
      max-width: 200px;
      max-height: 50px;
      height: auto;
      width: auto;
      display: block;
      margin: 0 auto;
      object-fit: contain;
    }
    .header {
      margin-bottom: 12px;
    }
    .header h1 {
      margin: 0 0 3px 0;
      color: #0f172a;
      font-size: 18px;
      font-weight: 600;
    }
    .header p {
      margin: 0;
      color: #64748b;
      font-size: 10px;
    }
    .section {
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 5px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 10px;
    }
    .info-item {
      margin-bottom: 8px;
    }
    .info-label {
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
      font-weight: 500;
    }
    .info-value {
      font-size: 13px;
      color: #0f172a;
      font-weight: 500;
    }
    .quote-total {
      text-align: center;
      padding: 12px;
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: white;
      border-radius: 10px;
      margin-bottom: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .quote-total-label {
      font-size: 11px;
      opacity: 0.95;
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .quote-total-value {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .quote-summary {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .quote-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .quote-detail-item {
      padding: 10px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .quote-detail-label {
      font-size: 10px;
      color: #64748b;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .quote-detail-value {
      font-size: 15px;
      font-weight: 600;
      color: #0f172a;
    }
    .accessorials-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 11px;
    }
    .accessorials-table th,
    .accessorials-table td {
      padding: 8px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    .accessorials-table th {
      background: #f1f5f9;
      font-weight: 600;
      color: #475569;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .accessorials-table td {
      color: #0f172a;
    }
    .badges {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background: #e0e7ff;
      color: #4f46e5;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 500;
    }
    .footer {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #64748b;
      font-size: 9px;
    }
    .compact-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    @media print {
      body {
        font-size: 11px;
      }
      .section {
        margin-bottom: 12px;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="logo-container">
    <img src="https://drive.google.com/file/d/1DpWfi_FMisj4OzBCDtbE6zCq-U2N9q9n" alt="First Class Trucking QuotePilot" />
  </div>
  
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

  <div class="compact-grid">
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
    setDatResult(null);

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
      
      // Extract standardized results from unified response
      var expediteAllQuote = combinedData.expediteAll || null;
      var forwardAirQuote = combinedData.forwardAir || null;
      var datQuote = combinedData.datForecast || null;

      // Convert standardized format to QuoteCard format
      function toQuoteCardFormat(standardizedQuote) {
        if (!standardizedQuote || standardizedQuote.error) {
          return null;
        }
        
        return {
          source: standardizedQuote.source,
          rate: {
            priceLineHaul: standardizedQuote.lineHaul,
            rpm: standardizedQuote.ratePerMile
          },
          priceTotal: standardizedQuote.total,
          priceAccessorials: standardizedQuote.additionalInfo?.accessorials || [],
          truckType: standardizedQuote.additionalInfo?.truckType,
          transitTime: standardizedQuote.additionalInfo?.transitTime,
          rateCalculationID: standardizedQuote.additionalInfo?.rateCalculationID,
          mileage: standardizedQuote.additionalInfo?.mileage
        };
      }

      // Set ExpediteAll result
      if (expediteAllQuote && !expediteAllQuote.error) {
        var expediteAllFormatted = toQuoteCardFormat(expediteAllQuote);
        if (expediteAllFormatted) {
          setResult(expediteAllFormatted);
            }
      } else if (expediteAllQuote && expediteAllQuote.error) {
        console.error('ExpediteAll API error:', expediteAllQuote.error);
          }

      // Set Forward Air result
      if (forwardAirQuote && !forwardAirQuote.error) {
        var forwardAirFormatted = toQuoteCardFormat(forwardAirQuote);
        if (forwardAirFormatted) {
          setForwardResult(forwardAirFormatted);
        }
      } else if (forwardAirQuote && forwardAirQuote.error) {
        console.error('Forward Air API error:', forwardAirQuote.error);
      }

      // Set DAT Forecast result
      if (datQuote && !datQuote.error) {
        var datFormatted = toQuoteCardFormat(datQuote);
        if (datFormatted) {
          setDatResult(datFormatted);
        }
      } else if (datQuote && datQuote.error) {
        console.error('DAT Forecast API error:', datQuote.error);
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
                <legend>Units</legend>
                <div className="row-2">
                  <label>
                    Length Unit
                    <select value={piecesUnit} onChange={function(e){ setPiecesUnit(e.target.value); }}>
                      <option value="in">in</option>
                      <option value="ft">ft</option>
                      <option value="cm">cm</option>
                      <option value="mm">mm</option>
                    </select>
                  </label>
                  <label>
                    Weight Unit
                    <select value={weightUnit} onChange={function(e){ setWeightUnit(e.target.value); }}>
                      <option value="lbs">lbs</option>
                      <option value="kg">kg</option>
                    </select>
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Dimensions From Image</legend>
                <div className="row-2">
                  <label>
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={function(e){ setDimensionsFile(e.target.files && e.target.files[0] ? e.target.files[0] : null); }}
                    />
                  </label>
                </div>
                <div className="actions" style={{ justifyContent: 'flex-start' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleExtractDimensions}
                    disabled={dimensionsLoading}
                  >
                    {dimensionsLoading ? 'Extracting…' : 'Get Dimensions From Image'}
                  </button>
                </div>
                {dimensionsError && (
                  <div className="error" style={{ marginTop: 10 }}>
                    {dimensionsError}
                  </div>
                )}
              </fieldset>

              <fieldset>
                <legend>Pieces</legend>
                {piecesRows.map(function(row, idx) {
                  return (
                    <div key={idx}>
                      <div className="row-4">
                        <label>
                          Length
                          <input
                            type="number"
                            value={row.length}
                            onChange={function(e){ updatePieceRow(idx, 'length', e.target.value); }}
                          />
                        </label>
                        <label>
                          Width
                          <input
                            type="number"
                            value={row.width}
                            onChange={function(e){ updatePieceRow(idx, 'width', e.target.value); }}
                          />
                        </label>
                        <label>
                          Height
                          <input
                            type="number"
                            value={row.height}
                            onChange={function(e){ updatePieceRow(idx, 'height', e.target.value); }}
                          />
                        </label>
                        <label>
                          Weight ({weightUnit || 'lbs'})
                          <input
                            type="number"
                            value={row.weight}
                            onChange={function(e){ updatePieceRow(idx, 'weight', e.target.value); }}
                          />
                        </label>
                      </div>
                      <div className="actions" style={{ justifyContent: 'flex-start' }}>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={function(){ removePieceRow(idx); }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="actions" style={{ justifyContent: 'flex-start' }}>
                  <button type="button" className="btn-secondary" onClick={addPieceRow}>
                    Add piece
                  </button>
                </div>
              </fieldset>

              <fieldset>
                <legend>Weight</legend>
                <div className="row-2">
                  <label>
                    Total Weight ({weightUnit || 'lbs'})
                    <input type="number" value={computeTotalWeight(piecesRows)} readOnly />
                  </label>
                  <label>
                    Pieces Count
                    <input type="number" value={piecesRows.length} readOnly />
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

              <fieldset>
                <legend>Equipment Type</legend>
                <label>
                  Equipment
                  <select value={equipmentType} onChange={function(e){ setEquipmentType(e.target.value); }}>
                    <option value="">Select equipment</option>
                    <option value="Box Truck">Box Truck</option>
                    <option value="Flatbed Hotshot">Flatbed Hotshot</option>
                    <option value="Sprinter Van">Sprinter Van</option>
                    <option value="Reefer">Reefer</option>
                    <option value="Dry Van">Dry Van</option>
                    <option value="Flatbed">Flatbed</option>
                  </select>
                </label>
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
          {datResult && typeof datResult === 'object' && !Array.isArray(datResult) && (
            <QuoteCard quote={datResult} onSelectQuote={handleSelectQuote} />
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

