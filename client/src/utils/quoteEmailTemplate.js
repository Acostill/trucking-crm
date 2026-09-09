const FONT = 'Arial,Helvetica,sans-serif';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value, fallback) {
  // Shipment and validity dates are calendar dates; preserve them across time zones.
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  const date = match ? new Date(match[1] + 'T12:00:00Z') : null;
  return date && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === match[1]
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : fallback;
}

function positiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
}

function textWithBreaks(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br />');
}

function detailRows(rows) {
  return rows.map(function(row) {
    return '<tr><td width="40%" valign="top" style="padding:6px 0;font-size:12px;line-height:1.6;color:#666666;">'
      + escapeHtml(row[0]) + '</td><td valign="top" style="padding:6px 0 6px 18px;font-size:12px;line-height:1.6;color:#252525;overflow-wrap:break-word;word-break:break-word;">'
      + textWithBreaks(row[1]) + '</td></tr>';
  }).join('');
}

function dimensionsText(pieces) {
  const parts = Array.isArray(pieces.parts) ? pieces.parts : [];
  if (!parts.length) return 'To be confirmed';
  return parts.map(function(part) {
    const item = part || {};
    const count = positiveNumber(item.count);
    const size = [item.length, item.width, item.height].map(function(value) {
      return positiveNumber(value) ? Number(value).toLocaleString('en-US') : '?';
    }).join(' × ');
    return (count ? count + (count === 1 ? ' unit: ' : ' units: ') : '')
      + size + ' ' + (pieces.unit || '(unit to be confirmed)');
  }).join('\n');
}

function requestedServiceLabel(value) {
  const code = String(value || '').trim().toUpperCase();
  const labels = {
    LIFTGATE: 'Liftgate', LIFT_GATE: 'Liftgate',
    LIFTGATE_PICKUP: 'Liftgate at pickup', LIFTGATE_DELIVERY: 'Liftgate at delivery',
    RESIDENTIAL: 'Residential service', RESIDENTIAL_PICKUP: 'Residential pickup', RESIDENTIAL_DELIVERY: 'Residential delivery',
    LIMITED_ACCESS: 'Limited access', APPOINTMENT: 'Delivery appointment',
    PICKUP_APPOINTMENT: 'Pickup appointment', DELIVERY_APPOINTMENT: 'Delivery appointment',
    INSIDE: 'Inside delivery', INSIDE_PICKUP: 'Inside pickup', INSIDE_DELIVERY: 'Inside delivery',
    HAZMAT: 'Hazardous material handling'
  };
  return labels[code] || (code ? 'Service code ' + code + ' (confirm details)' : '');
}

function locationHtml(location) {
  const cityState = [location.city, location.state].filter(Boolean).join(', ');
  return '<p style="margin:5px 0 2px;font-size:16px;line-height:1.4;font-weight:700;color:#252525;overflow-wrap:break-word;">'
    + escapeHtml(cityState || location.zip || 'Location pending') + '</p>'
    + (cityState && location.zip ? '<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#666666;">' + escapeHtml(location.zip) + '</p>' : '');
}

// Inline styles and presentation tables keep the essential layout independent
// of the CRM stylesheet. The same complete document is previewed and sent.
export function buildQuoteEmailHtml({ quote, note, validUntil, recipientName, recipientEmail, logoUrl, fuelSurcharge = 'unconfirmed', includedServices = '' }) {
  const shipment = (quote && quote.shipment) || {};
  const pickup = shipment.pickup || {};
  const delivery = shipment.delivery || {};
  const selection = (quote && quote.selection) || {};
  const carrier = quote && Array.isArray(quote.carrierQuotes)
    ? quote.carrierQuotes.find(function(option) { return option.key === selection.carrierKey; })
    : null;
  const firstName = String(recipientName || '').trim().split(/\s+/)[0];
  const amount = selection.clientPrice;
  const price = amount != null && amount !== '' && Number.isFinite(Number(amount))
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Number(amount))
    : 'To be confirmed';
  const validity = formatDate(validUntil, 'To be confirmed');
  const quoteReference = (quote && quote.quoteId) || 'Reference pending';
  const issued = formatDate(quote && quote.pricedAt, 'Date pending');
  const transit = carrier && positiveNumber(carrier.transitTime)
    ? carrier.transitTime + ' business day' + (Number(carrier.transitTime) === 1 ? '' : 's')
    : 'Confirm with dispatch';
  const pieces = shipment.pieces || {};
  const weight = shipment.weight || {};
  const service = carrier && carrier.truckType;
  const isLtl = /\bLTL\b|less[\s-]+than[\s-]+truckload/i.test(service || shipment.truckType || '');
  const unNumbers = Array.from(new Set([
    ...(Array.isArray(shipment.hazardousUnNumbers) ? shipment.hazardousUnNumbers : []),
    ...(shipment.hazardousMaterial && Array.isArray(shipment.hazardousMaterial.unNumbers) ? shipment.hazardousMaterial.unNumbers : [])
  ].filter(Boolean)));
  const services = Array.isArray(shipment.accessorialCodes)
    ? Array.from(new Set(shipment.accessorialCodes.map(requestedServiceLabel).filter(Boolean))).join(', ')
    : '';
  const temperature = shipment.temperatureControl || {};
  const temperatureRange = [temperature.minC, temperature.maxC].every(function(value) {
    return value != null && value !== '' && Number.isFinite(Number(value));
  }) ? Number(temperature.minC) + ' to ' + Number(temperature.maxC) + ' °C' : 'Range to be confirmed';
  const details = detailRows([
    ...(service && service !== shipment.truckType ? [['Quoted service', service]] : []),
    ['Requested equipment', shipment.truckType || 'To be confirmed'],
    ['Estimated transit', transit],
    ['Commodity', shipment.commodity || 'To be confirmed'],
    ['Handling units', positiveNumber(pieces.quantity) ? Number(pieces.quantity).toLocaleString('en-US') : 'To be confirmed'],
    ['Total weight', positiveNumber(weight.value) ? Number(weight.value).toLocaleString('en-US') + ' ' + (weight.unit || '(unit to be confirmed)') : 'To be confirmed'],
    ['Dimensions (L × W × H)', dimensionsText(pieces)],
    ...(typeof shipment.stackable === 'boolean' ? [['Stackable', shipment.stackable ? 'Yes' : 'No']] : []),
    ...(isLtl ? [['Freight class / NMFC', [shipment.freightClass ? 'Class ' + shipment.freightClass : '', shipment.nmfc ? 'NMFC ' + shipment.nmfc : ''].filter(Boolean).join(' · ') || 'Confirm classification before booking']] : []),
    ...(shipment.temperatureControlled === true ? [['Temperature control', temperatureRange]] : []),
    ...(unNumbers.length ? [['Hazardous material', unNumbers.join(', ') + ' · Confirm handling']] : []),
    ...(services ? [['Requested extra services', services]] : [])
  ]);
  // Carrier charge amounts are procurement costs, not a customer-facing
  // breakdown. Inclusions must come from the operator's explicit email draft.
  const fuelLabels = {
    included: 'Included in quoted total',
    excluded: 'Not included; quoted separately',
    unconfirmed: 'Confirm before booking'
  };
  const rateDetails = detailRows([
    ['Fuel surcharge', fuelLabels[fuelSurcharge] || fuelLabels.unconfirmed],
    ['Included extra services', includedServices.trim() || 'No extra services confirmed as included']
  ]);
  const noteHtml = note && note.trim()
    ? '<p style="margin:8px 0 0;font-size:13px;line-height:1.7;color:#3c3c3c;overflow-wrap:break-word;">'
      + escapeHtml(note.trim()).replace(/\r?\n/g, '<br />') + '</p>'
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>First Class Trucking — Freight quotation</title>
  <style>
    body { margin:0; padding:0; }
    table { border-spacing:0; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    @media only screen and (max-width:480px) {
      .email-outer { padding:22px 18px !important; }
      .email-brand { font-size:18px !important; }
      .email-logo { width:60px !important; height:auto !important; }
      .email-logo-cell { width:76px !important; }
      .email-price { font-size:25px !important; }
      .email-stop { display:block !important; width:100% !important; box-sizing:border-box !important; padding:0 !important; }
      .email-destination { padding-top:16px !important; }
      .email-meta { display:block !important; width:100% !important; text-align:left !important; padding:0 0 4px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:${FONT};color:#252525;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;color:#ffffff;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">First Class Trucking quote ${escapeHtml(quoteReference)} · ${escapeHtml(price)} USD · Valid through ${escapeHtml(validity)}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff">
    <tr><td class="email-outer" align="center" style="padding:32px 28px;">
      <!--[if mso]><table role="presentation" width="620" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;table-layout:fixed;font-family:${FONT};background-color:#ffffff;">
        <tr><td style="padding:0 0 22px;border-bottom:2px solid #252525;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td class="email-logo-cell" width="90" valign="middle" style="width:90px;">
              <img class="email-logo" src="${escapeHtml(logoUrl)}" width="72" height="44" alt="First Class Trucking logo" style="display:block;width:72px;height:44px;border:0;background-color:#202020;color:#ffffff;font-size:11px;" />
            </td>
            <td valign="middle">
              <p class="email-brand" style="margin:0;font-size:21px;line-height:1.3;font-weight:700;color:#252525;">First Class Trucking</p>
              <p style="margin:4px 0 0;font-size:12px;line-height:1.5;color:#666666;">Freight quotation</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:15px 0 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>
            <td class="email-meta" width="64%" valign="top" style="padding-right:16px;">
              <p style="margin:0;font-size:11px;line-height:1.6;color:#666666;">Quote reference</p>
              <p style="margin:2px 0 0;font-size:12px;line-height:1.5;color:#252525;overflow-wrap:anywhere;word-break:break-all;">${escapeHtml(quoteReference)}</p>
            </td>
            <td class="email-meta" width="36%" valign="top" align="right">
              <p style="margin:0;font-size:11px;line-height:1.6;color:#666666;">Issued</p>
              <p style="margin:2px 0 0;font-size:12px;line-height:1.5;color:#252525;">${escapeHtml(issued)}</p>
            </td>
          </tr></table>
          ${recipientEmail ? '<p style="margin:8px 0 0;font-size:11px;line-height:1.6;color:#666666;overflow-wrap:anywhere;">Prepared for ' + escapeHtml(recipientEmail) + '</p>' : ''}
        </td></tr>
        <tr><td style="padding:0 0 22px;">
          <p style="margin:0;font-size:13px;line-height:1.7;color:#252525;">${firstName ? 'Hi ' + escapeHtml(firstName) + ',' : 'Hello,'}</p>
          ${noteHtml}
        </td></tr>
        <tr><td style="padding:16px 0;border-top:1px solid #bcbcbc;border-bottom:1px solid #bcbcbc;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>
            <td width="42%" valign="middle">
              <p style="margin:0;font-size:13px;line-height:1.5;font-weight:700;color:#252525;">Quoted total</p>
              <p style="margin:5px 0 0;font-size:11px;line-height:1.5;color:#666666;">Valid through ${escapeHtml(validity)}</p>
            </td>
            <td width="58%" align="right" valign="middle">
              <p class="email-price" style="margin:0;font-size:30px;line-height:1.25;font-weight:700;color:#252525;overflow-wrap:break-word;">${escapeHtml(price)}</p>
              <p style="margin:4px 0 0;font-size:11px;line-height:1.5;color:#666666;">USD</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:22px 0;border-bottom:1px solid #e4e4e4;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>
            <td class="email-stop" width="50%" valign="top" style="padding-right:18px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#666666;">Pickup</p>
              ${locationHtml(pickup.location || {})}
              <p style="margin:0;font-size:11px;line-height:1.6;color:#666666;">${pickup.date ? 'Requested: ' : ''}${escapeHtml(formatDate(pickup.date, 'Date to be confirmed'))}</p>
            </td>
            <td class="email-stop email-destination" width="50%" valign="top" style="padding-left:18px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#666666;">Delivery</p>
              ${locationHtml(delivery.location || {})}
              <p style="margin:0;font-size:11px;line-height:1.6;color:#666666;">${delivery.date ? 'Requested: ' : ''}${escapeHtml(formatDate(delivery.date, 'Schedule to be confirmed'))}</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:20px 0 14px;border-bottom:1px solid #e4e4e4;">
          <h2 style="margin:0 0 8px;font-size:13px;line-height:1.5;font-weight:700;color:#252525;">Shipment details</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">${details}</table>
        </td></tr>
        <tr><td style="padding:18px 0;border-bottom:1px solid #e4e4e4;">
          <h2 style="margin:0 0 8px;font-size:13px;line-height:1.5;font-weight:700;color:#252525;">Rate details</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">${rateDetails}</table>
          <p style="margin:10px 0 0;font-size:11px;line-height:1.6;color:#666666;">The total is based on the shipment details above. Changes to weight, dimensions${isLtl ? ', freight class' : ''}, locations, or services may require a revised quote. Extra services are included only when expressly listed above.</p>
        </td></tr>
        <tr><td style="padding:20px 0 0;">
          <h2 style="margin:0 0 8px;font-size:13px;line-height:1.5;font-weight:700;color:#252525;">Booking</h2>
          <p style="margin:0;font-size:12px;line-height:1.7;color:#3c3c3c;">Reply with your quote reference, pickup and delivery addresses, site contacts, and available hours. Let us know about liftgate, residential or limited-access locations, appointments, inside service, or special handling needs.</p>
          <p style="margin:8px 0 0;font-size:12px;line-height:1.7;color:#3c3c3c;">We'll confirm capacity, the final service details, and your booking before dispatch.</p>
        </td></tr>
        <tr><td style="padding:20px 0;">
          <p style="margin:0;font-size:13px;line-height:1.7;color:#252525;">Thank you,<br /><strong>First Class Trucking</strong></p>
        </td></tr>
        <tr><td style="padding:14px 0 0;border-top:1px solid #e4e4e4;">
          <p style="margin:0;font-size:10px;line-height:1.7;color:#777777;">This quote does not reserve equipment. Transit times and requested dates are estimates, not guaranteed appointments. Additional services, waiting time (detention), or shipment changes may affect the final charges; please confirm requirements before booking.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}
