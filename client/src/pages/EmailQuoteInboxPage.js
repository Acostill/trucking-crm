import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Inbox,
  Mail,
  MapPin,
  Package,
  Percent,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Truck,
  User,
  Weight,
  Wifi,
  WifiOff
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import AuthForm from '../components/AuthForm';
import QuoteRouteMap from '../components/QuoteRouteMap';
import { useAuth } from '../context/AuthContext';
import { buildApiUrl } from '../config';
import './EmailQuoteInboxPage.css';

const EMPTY_EDITOR = {
  pickupCity: '',
  pickupState: '',
  pickupZip: '',
  pickupDate: '',
  deliveryCity: '',
  deliveryState: '',
  deliveryZip: '',
  pallets: '',
  length: '',
  width: '',
  height: '',
  totalWeight: '',
  commodity: '',
  temperatureControlled: false,
  truckType: '',
  truckTypeSource: '',
  datEquipmentType: ''
};

const PREVIEW_USER = {
  id: 'preview-operations',
  email: 'quotes@firstclasstrucking.net',
  firstName: 'Quote Desk',
  roles: ['agent']
};

const PREVIEW_MAILBOX = {
  state: 'online',
  configured: true,
  enabled: true,
  running: false,
  mailboxAddress: 'emailbot@optimation.io',
  connectedAddress: 'emailbot@optimation.io',
  lastSuccessAt: '2026-07-30T20:58:00.000Z',
  lastCreated: 1,
  lastSkipped: 3,
  lastFailed: 0
};

const TRUCK_TYPE_OPTIONS = [
  'Cargo Van',
  'Box Truck',
  'Straight Truck',
  'Reefer Cargo Van',
  'Reefer Box Truck',
  'Reefer Straight Truck'
];

function calendarDateInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(function(part) {
    return [part.type, part.value];
  }));
  return values.year + '-' + values.month + '-' + values.day;
}

const PREVIEW_QUOTES = [
  {
    id: 'email-quote-preview-1',
    sender: { name: 'Dispatch Team', email: 'dispatch@truckfirstclass.com' },
    subject: 'Fwd: Rate request: Miami, FL to Atlanta, GA — 1 pallet',
    receivedAt: '2026-07-30T20:42:00.000Z',
    rawText: 'Subject: Fwd: Rate request: Miami, FL to Atlanta, GA — 1 pallet\n'
      + 'From: Dispatch Team <dispatch@truckfirstclass.com>\n'
      + 'To: quotes@firstclasstrucking.net\n\n'
      + '---------- Forwarded message ---------\n'
      + 'From: Maria Ortiz <maria@northstar-medical.com>\n'
      + 'Date: Thu, Jul 30, 2026 at 3:40 PM\n'
      + 'Subject: Rate request: Miami, FL to Atlanta, GA — 1 pallet\n'
      + 'To: <dispatch@truckfirstclass.com>\n\n'
      + 'Hi team,\n\nCan you get me a rate for 1 pallet of medical equipment, '
      + '48x40x48, about 500 lbs, from Miami, FL 33166 to Atlanta, GA 30336? '
      + 'Ready for pickup 8/3.\n\nThanks,\nMaria',
    status: 'ready',
    shipment: {
      pickup: {
        location: { city: 'Miami', state: 'FL', zip: '33166', country: 'US' },
        date: '2026-08-03T12:00:00.000Z'
      },
      delivery: {
        location: { city: 'Atlanta', state: 'GA', zip: '30336', country: 'US' }
      },
      pieces: {
        quantity: 1,
        unit: 'in',
        parts: [{ count: 1, length: 48, width: 40, height: 48 }]
      },
      weight: { value: 500, unit: 'lbs' },
      commodity: 'Medical equipment',
      temperatureControlled: false,
      truckType: 'Cargo Van',
      truckAssignment: {
        status: 'assigned',
        source: 'auto',
        ruleVersion: 'fct-truck-assignment-v1',
        reason: 'Smallest truck within 3 pallets, 3,000 lb, and the v1 dimension guard.'
      },
      datEquipmentType: 'Van'
    },
    carrierQuotes: [
      {
        key: 'forwardAir',
        source: 'Forward Air',
        available: true,
        cost: 1248.62,
        lineHaul: 1248.62,
        truckType: 'LTL',
        transitTime: 2
      },
      {
        key: 'expediteAll',
        source: 'ExpediteAll',
        available: true,
        cost: 1396.4,
        lineHaul: 1396.4,
        truckType: 'Expedited LTL',
        transitTime: 1
      },
      {
        key: 'datSpot',
        source: 'DAT Spot Market',
        available: true,
        selectable: false,
        benchmark: true,
        status: 'completed',
        cost: 1285,
        marketAverage: 1285,
        marketLow: 1095,
        marketHigh: 1460,
        ratePerMile: 1.92,
        lowRatePerMile: 1.64,
        highRatePerMile: 2.18,
        miles: 669,
        timeframe: '7 days',
        truckType: 'Van'
      },
      {
        key: 'datContract',
        source: 'DAT Contract Market',
        available: true,
        selectable: false,
        benchmark: true,
        status: 'completed',
        cost: 1340,
        marketAverage: 1340,
        marketLow: 1170,
        marketHigh: 1515,
        ratePerMile: 2.0,
        lowRatePerMile: 1.75,
        highRatePerMile: 2.26,
        miles: 669,
        timeframe: '90 days',
        truckType: 'Van'
      },
      {
        key: 'datLoadOffers',
        source: 'DAT Search Loads',
        available: true,
        selectable: false,
        benchmark: true,
        status: 'completed',
        lookupTimestamp: '2026-08-13T16:34:43.226Z',
        resultCount: 23,
        eligibleCount: 15,
        excludedCount: 8,
        outcome: 'completed',
        acceptedCriteria: {
          origin: 'Miami, FL',
          destination: 'Atlanta, GA',
          equipmentType: 'Vans (Standard)',
          pickupDate: '2026-08-03',
          originDeadheadMiles: 150,
          destinationDeadheadMiles: 150,
          loadType: 'Full & Partial',
          includeSimilarResults: false,
          sort: 'Rate - Highest'
        },
        offers: [
          { rank: 1, datLoadId: 'table-row-preview-1', displayedTotal: '$2,450', totalUsd: 2450, rpm: '$3.66/mi', tripMiles: '669 mi', origin: 'Miami, FL', destination: 'Atlanta, GA', originDeadhead: 'DH-O 12 mi', destinationDeadhead: 'DH-D 18 mi', pickup: 'Aug 3', equipmentCode: 'V', weight: '500 lbs', lengthLoadType: 'Van · Full', company: 'Demo Carrier One', creditScore: '97', daysToPay: '18 DTP', comments: 'Team pickup requested; appointment required.', commentsStatus: 'displayed' },
          { rank: 2, datLoadId: 'table-row-preview-2', displayedTotal: '$2,300', totalUsd: 2300, rpm: '$3.44/mi', tripMiles: '669 mi', origin: 'Miami, FL', destination: 'Atlanta, GA', originDeadhead: 'DH-O 25 mi', destinationDeadhead: 'DH-D 9 mi', pickup: 'Aug 3', equipmentCode: 'V', weight: '500 lbs', lengthLoadType: 'Van · Full', company: 'Demo Carrier Two', creditScore: '94', daysToPay: '21 DTP', comments: null, commentsStatus: 'not_displayed' },
          { rank: 3, datLoadId: 'table-row-preview-3', displayedTotal: '$2,150', totalUsd: 2150, rpm: '$3.21/mi', tripMiles: '669 mi', origin: 'Miami, FL', destination: 'Atlanta, GA', originDeadhead: 'DH-O 31 mi', destinationDeadhead: 'DH-D 22 mi', pickup: 'Aug 3', equipmentCode: 'V', weight: '500 lbs', lengthLoadType: 'Van · Full', company: 'Demo Carrier Three', creditScore: '91', daysToPay: '25 DTP', comments: 'No touch freight.', commentsStatus: 'displayed' }
        ]
      }
    ],
    recommendation: {
      carrierKey: 'forwardAir',
      carrierSource: 'Forward Air',
      carrierCost: 1248.62,
      defaultMarginPct: 18,
      suggestedClientPrice: 1473.37,
      reason: 'Lowest available carrier cost. Compare it with the DAT market benchmark, then confirm service and transit before sending.'
    },
    selection: {
      carrierKey: null,
      carrierSource: null,
      carrierCost: null,
      marginPct: null,
      marginAmount: null,
      clientPrice: null
    },
    staffNotes: '',
    quoteId: null
  },
  {
    id: 'email-quote-preview-2',
    sender: { name: 'Jack Reyes', email: 'jack@truckfirstclass.com' },
    subject: 'Fwd: Need a quote from DFW to ORD',
    receivedAt: '2026-07-30T19:16:00.000Z',
    rawText: 'Subject: Fwd: Need a quote from DFW to ORD\n'
      + 'From: Jack Reyes <jack@truckfirstclass.com>\n'
      + 'To: quotes@firstclasstrucking.net\n\n'
      + '---------- Forwarded message ---------\n'
      + 'From: Daniel Ross <daniel@apex-aero.com>\n'
      + 'Date: Thu, Jul 30, 2026 at 2:10 PM\n'
      + 'Subject: Need a quote from DFW to ORD\n'
      + 'To: <jack@truckfirstclass.com>\n\n'
      + 'Hey, need a quote for 2 pieces of aircraft parts from DFW to ORD. '
      + 'Pickup around 8/4. Can you send dimensions/weight questions if you need them?\n\nDaniel',
    status: 'needs_review',
    processingError: 'Missing required details: freight dimensions, total weight',
    shipment: {
      pickup: {
        location: { city: 'Dallas', state: 'TX', zip: '75261', country: 'US' },
        date: '2026-08-04T12:00:00.000Z'
      },
      delivery: {
        location: { city: 'Chicago', state: 'IL', zip: '60666', country: 'US' }
      },
      pieces: { quantity: 2, unit: 'in', parts: [{}] },
      weight: { unit: 'lbs' },
      commodity: 'Aircraft parts',
      truckAssignment: {
        status: 'needs_review',
        source: 'auto',
        ruleVersion: 'fct-truck-assignment-v1',
        reason: 'Pallet count, total weight, and complete dimensions are required before assigning a truck.'
      }
    },
    carrierQuotes: [],
    recommendation: null,
    selection: {},
    staffNotes: '',
    quoteId: null
  }
];

function formatMoney(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(Number(value));
}

function formatDateTime(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function locationLine(location) {
  if (!location) return 'Location pending';
  return [location.city, location.state, location.zip].filter(Boolean).join(', ') || 'Location pending';
}

function extractEmailAddress(value) {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : '';
}

function extractDisplayName(headerValue) {
  const match = String(headerValue || '').match(/^\s*"?([^"<]*)"?\s*<[^>]+>\s*$/);
  const name = match ? match[1].trim() : '';
  return name || '';
}

function extractForwardedContacts(rawText) {
  const text = String(rawText || '');
  const forwardedIndex = text.search(/-{2,}\s*forwarded message\s*-{2,}/i);
  if (forwardedIndex === -1) return { to: '', toName: '', cc: '' };
  const headerBlock = text.slice(forwardedIndex, forwardedIndex + 600);
  const fromMatch = headerBlock.match(/^From:\s*(.+)$/im);
  const toMatch = headerBlock.match(/^To:\s*(.+)$/im);
  const to = fromMatch ? extractEmailAddress(fromMatch[1]) : '';
  const toName = fromMatch ? extractDisplayName(fromMatch[1]) : '';
  const cc = toMatch ? extractEmailAddress(toMatch[1]) : '';
  return { to, toName, cc: cc && cc.toLowerCase() !== to.toLowerCase() ? cc : '' };
}

function statusLabel(status) {
  const labels = {
    received: 'Received',
    parsing: 'Parsing email',
    rating: 'Checking carriers',
    ready: 'Ready to price',
    needs_review: 'Needs review',
    failed: 'Action required',
    priced: 'Client quote ready',
    sent: 'Quote sent'
  };
  return labels[status] || status || 'Received';
}

function statusTone(status) {
  if (status === 'ready') return 'ready';
  if (status === 'priced' || status === 'sent') return 'priced';
  if (status === 'failed' || status === 'needs_review') return 'attention';
  return 'working';
}

function buildDefaultQuoteNote(quote) {
  const shipment = (quote && quote.shipment) || {};
  const pickupCity = shipment.pickup && shipment.pickup.location && shipment.pickup.location.city;
  const deliveryCity = shipment.delivery && shipment.delivery.location && shipment.delivery.location.city;
  const lane = pickupCity && deliveryCity ? ` for your shipment from ${pickupCity} to ${deliveryCity}` : '';
  return `Here's your quote${lane}. Reply to this email to confirm and we'll get it scheduled, or let us know if you have any questions.`;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nlToBr(value) {
  return escapeHtml(value).split('\n').map(function(line) { return line || '&nbsp;'; }).join('<br />');
}

const EMAIL_FONT_SANS = "'Inter','SuisseIntl',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Matches the sidebar's "First Class CRM Brand Refresh" tokens in App.css (--fct-*).
const EMAIL_BG_TOP = '#050505';
const EMAIL_BG_BOTTOM = '#0f172a';
const EMAIL_ACCENT = '#1e3a8a';
const EMAIL_ACCENT_LIGHT = '#93c5fd';
const EMAIL_LINE = 'rgba(255,255,255,.12)';
const EMAIL_TEXT = 'rgba(255,255,255,.92)';
const EMAIL_TEXT_MUTED = 'rgba(255,255,255,.62)';
const EMAIL_TEXT_FAINT = 'rgba(255,255,255,.42)';

function buildQuoteEmailHtml(quote, noteText) {
  const shipment = (quote && quote.shipment) || {};
  const pickup = shipment.pickup || {};
  const pickupLocation = pickup.location || {};
  const delivery = shipment.delivery || {};
  const deliveryLocation = delivery.location || {};
  const selection = (quote && quote.selection) || {};
  const forwarded = extractForwardedContacts(quote && quote.rawText);
  const recipientName = forwarded.toName
    || (!forwarded.to && quote && quote.sender && (quote.sender.name || quote.sender.email))
    || '';
  const firstName = recipientName ? String(recipientName).split(' ')[0] : '';

  const detailRows = [
    ['Pickup', locationLine(pickupLocation) + (pickup.date ? ' · ' + formatDateTime(pickup.date) : '')],
    ['Delivery', locationLine(deliveryLocation)]
  ];

  const rowsHtml = detailRows.map(function(row) {
    return '<tr>'
      + '<td style="padding:9px 0;border-top:1px solid ' + EMAIL_LINE + ';font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + EMAIL_TEXT_FAINT + ';white-space:nowrap;">' + escapeHtml(row[0]) + '</td>'
      + '<td style="padding:9px 0 9px 16px;border-top:1px solid ' + EMAIL_LINE + ';font-size:14px;color:' + EMAIL_TEXT + ';text-align:right;">' + escapeHtml(row[1]) + '</td>'
      + '</tr>';
  }).join('');

  const noteHtml = noteText && noteText.trim()
    ? '<p style="margin:0 0 22px;font-size:14px;line-height:1.7;color:' + EMAIL_TEXT_MUTED + ';">' + nlToBr(noteText) + '</p>'
    : '';

  return '<!doctype html>'
    + '<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />'
    + '<title>Your First Class Trucking quote</title></head>'
    + '<body style="margin:0;padding:0;background:' + EMAIL_BG_TOP + ';">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,' + EMAIL_BG_TOP + ' 0%,' + EMAIL_BG_BOTTOM + ' 100%);background-color:' + EMAIL_BG_TOP + ';padding:32px 16px;">'
    + '<tr><td align="center">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;font-family:' + EMAIL_FONT_SANS + ';">'
    + '<tr><td style="padding:0 8px 24px;">'
    + '<span style="display:inline-block;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:' + EMAIL_TEXT + ';">First Class Trucking</span>'
    + '<div style="width:32px;height:3px;margin-top:8px;background:' + EMAIL_ACCENT_LIGHT + ';border-radius:2px;"></div>'
    + '</td></tr>'
    + '<tr><td style="padding:0 8px;">'
    + '<h1 style="margin:0 0 18px;font-size:24px;line-height:1.3;font-weight:700;color:' + EMAIL_TEXT + ';">Thank you for choosing First Class Trucking!</h1>'
    + (firstName ? '<p style="margin:0 0 18px;font-size:14px;color:' + EMAIL_TEXT_MUTED + ';">Hi ' + escapeHtml(firstName) + ',</p>' : '')
    + noteHtml
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.08);border:1px solid ' + EMAIL_LINE + ';border-left:3px solid ' + EMAIL_ACCENT + ';border-radius:8px;padding:20px 22px;margin-bottom:22px;">'
    + rowsHtml
    + '<tr>'
    + '<td style="padding:14px 0 0;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + EMAIL_TEXT_FAINT + ';">Total price</td>'
    + '<td style="padding:14px 0 0 16px;font-size:22px;font-weight:700;color:' + EMAIL_ACCENT_LIGHT + ';text-align:right;">' + escapeHtml(formatMoney(selection.clientPrice)) + '</td>'
    + '</tr>'
    + '</table>'
    + '<p style="margin:0 0 26px;font-size:14px;line-height:1.7;color:' + EMAIL_TEXT_MUTED + ';">Reply to this email to confirm and we\'ll get your shipment scheduled.</p>'
    + '<p style="margin:0 0 34px;font-size:14px;line-height:1.7;color:' + EMAIL_TEXT + ';">Thank you,<br />First Class Trucking</p>'
    + '</td></tr>'
    + '<tr><td style="padding:20px 8px 0;border-top:1px solid ' + EMAIL_LINE + ';font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:' + EMAIL_TEXT_FAINT + ';">'
    + 'First Class Trucking'
    + '</td></tr>'
    + '</table>'
    + '</td></tr>'
    + '</table>'
    + '</body></html>';
}

function shipmentToEditor(shipment) {
  const pickup = (shipment && shipment.pickup) || {};
  const pickupLocation = pickup.location || {};
  const delivery = (shipment && shipment.delivery) || {};
  const deliveryLocation = delivery.location || {};
  const pieces = (shipment && shipment.pieces) || {};
  const firstPart = Array.isArray(pieces.parts) ? pieces.parts[0] || {} : {};
  const weight = (shipment && shipment.weight) || {};
  return {
    pickupCity: pickupLocation.city || '',
    pickupState: pickupLocation.state || '',
    pickupZip: pickupLocation.zip || '',
    pickupDate: toDateInput(pickup.date),
    deliveryCity: deliveryLocation.city || '',
    deliveryState: deliveryLocation.state || '',
    deliveryZip: deliveryLocation.zip || '',
    pallets: pieces.quantity != null ? String(pieces.quantity) : '',
    length: firstPart.length != null ? String(firstPart.length) : '',
    width: firstPart.width != null ? String(firstPart.width) : '',
    height: firstPart.height != null ? String(firstPart.height) : '',
    totalWeight: weight.value != null ? String(weight.value) : '',
    commodity: (shipment && shipment.commodity) || '',
    temperatureControlled: Boolean(shipment && shipment.temperatureControlled),
    truckType: (shipment && shipment.truckType) || '',
    truckTypeSource: (shipment && shipment.truckAssignment && shipment.truckAssignment.source) || '',
    datEquipmentType: (shipment && shipment.datEquipmentType) || ''
  };
}

function buildShipment(editor, existing) {
  const palletCount = Number(editor.pallets) || undefined;
  const shipment = {
    ...(existing || {}),
    pickup: {
      ...((existing && existing.pickup) || {}),
      location: {
        ...((existing && existing.pickup && existing.pickup.location) || {}),
        city: editor.pickupCity.trim(),
        state: editor.pickupState.trim().toUpperCase(),
        zip: editor.pickupZip.trim(),
        country: 'US'
      },
      date: editor.pickupDate
        ? new Date(editor.pickupDate + 'T12:00:00').toISOString()
        : ''
    },
    delivery: {
      ...((existing && existing.delivery) || {}),
      location: {
        ...((existing && existing.delivery && existing.delivery.location) || {}),
        city: editor.deliveryCity.trim(),
        state: editor.deliveryState.trim().toUpperCase(),
        zip: editor.deliveryZip.trim(),
        country: 'US'
      }
    },
    pieces: {
      ...((existing && existing.pieces) || {}),
      quantity: palletCount,
      unit: 'in',
      parts: [{
        count: palletCount || 1,
        length: Number(editor.length) || undefined,
        width: Number(editor.width) || undefined,
        height: Number(editor.height) || undefined
      }]
    },
    weight: {
      value: Number(editor.totalWeight) || undefined,
      unit: 'lbs'
    },
    commodity: editor.commodity.trim(),
    temperatureControlled: Boolean(editor.temperatureControlled),
    truckType: editor.truckType,
    datEquipmentType: editor.datEquipmentType
  };

  if (!editor.truckType) {
    delete shipment.truckType;
    delete shipment.truckAssignment;
    delete shipment.datEquipmentType;
  } else if (editor.truckTypeSource === 'staff') {
    shipment.truckAssignment = {
      status: 'assigned',
      source: 'staff',
      ruleVersion: 'fct-truck-assignment-v1',
      reason: 'Truck type confirmed by staff.'
    };
  }

  return shipment;
}

function QuoteListItem({ quote, active, onClick }) {
  const shipment = quote.shipment || {};
  const pickup = shipment.pickup && shipment.pickup.location;
  const delivery = shipment.delivery && shipment.delivery.location;
  return (
    <button
      type="button"
      className={'eq-list-item ' + (active ? 'active' : '')}
      onClick={onClick}
    >
      <div className="eq-list-item-top">
        <span className={'eq-status ' + statusTone(quote.status)}>{statusLabel(quote.status)}</span>
        <time>{formatDateTime(quote.receivedAt)}</time>
      </div>
      <strong>{quote.subject || 'New quote request'}</strong>
      <span className="eq-list-sender">{(quote.sender && (quote.sender.name || quote.sender.email)) || 'Unknown sender'}</span>
      <span className="eq-list-lane">
        {(pickup && (pickup.city || pickup.zip)) || 'Pickup'}
        <ArrowRight size={12} />
        {(delivery && (delivery.city || delivery.zip)) || 'Delivery'}
      </span>
    </button>
  );
}

export default function EmailQuoteInboxPage() {
  const { user, checking, setUser } = useAuth();
  const previewMode =
    process.env.NODE_ENV === 'development' &&
    new URLSearchParams(window.location.search).get('preview') === '1';
  const [quotes, setQuotes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mailbox, setMailbox] = useState(null);
  const [datHealth, setDatHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [savingShipment, setSavingShipment] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [runningDat, setRunningDat] = useState(false);
  const [runningDatLoads, setRunningDatLoads] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState(EMPTY_EDITOR);
  const [carrierKey, setCarrierKey] = useState('');
  const [marginPct, setMarginPct] = useState('');
  const [clientPrice, setClientPrice] = useState('');
  const [staffNotes, setStaffNotes] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailNote, setEmailNote] = useState('');
  const [sendingQuoteEmail, setSendingQuoteEmail] = useState(false);

  async function requestJson(path, options) {
    const response = await fetch(buildApiUrl(path), {
      credentials: 'include',
      ...(options || {})
    });
    const data = await response.json().catch(function() { return null; });
    if (!response.ok) {
      throw new Error(data && data.error ? data.error : 'Request failed');
    }
    return data;
  }

  function applyDetail(detail) {
    setSelected(detail);
    setEditor(shipmentToEditor(detail && detail.shipment));
    const recommendedKey =
      (detail && detail.selection && detail.selection.carrierKey) ||
      (detail && detail.recommendation && detail.recommendation.carrierKey) ||
      '';
    const recommendedMargin =
      detail && detail.selection && detail.selection.marginPct != null
        ? detail.selection.marginPct
        : detail && detail.recommendation && detail.recommendation.defaultMarginPct != null
          ? detail.recommendation.defaultMarginPct
          : 0;
    setCarrierKey(recommendedKey);
    setMarginPct(String(recommendedMargin));
    setStaffNotes((detail && detail.staffNotes) || '');

    const options = detail && Array.isArray(detail.carrierQuotes) ? detail.carrierQuotes : [];
    const carrier = options.find(function(option) { return option.key === recommendedKey; });
    const storedPrice = detail && detail.selection && detail.selection.clientPrice;
    const suggestedPrice =
      detail && detail.recommendation && detail.recommendation.carrierKey === recommendedKey
        ? detail.recommendation.suggestedClientPrice
        : null;
    const calculatedPrice = carrier && carrier.cost != null
      ? Number(carrier.cost) * (1 + Number(recommendedMargin || 0) / 100)
      : '';
    setClientPrice(
      storedPrice != null
        ? String(storedPrice)
        : suggestedPrice != null
          ? String(suggestedPrice)
          : calculatedPrice !== ''
            ? String(Number(calculatedPrice.toFixed(2)))
            : ''
    );
    const forwarded = extractForwardedContacts(detail && detail.rawText);
    setEmailTo(
      (detail && detail.quoteSentTo) ||
      forwarded.to ||
      (detail && detail.sender && detail.sender.email) ||
      ''
    );
    setEmailCc((detail && detail.quoteSentCc) || forwarded.cc || '');
    setEmailNote(buildDefaultQuoteNote(detail));
  }

  async function loadDetail(id, silent) {
    if (!id) return;
    if (previewMode) {
      const detail = quotes.find(function(quote) { return quote.id === id; });
      if (detail) applyDetail(detail);
      return;
    }
    if (!silent) setDetailLoading(true);
    if (!silent) setError('');
    try {
      const detail = await requestJson('/api/email-quotes/' + id);
      applyDetail(detail);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load the email quote');
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }

  async function loadWorkspace(preferredId) {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all([
        requestJson('/api/operations/health'),
        requestJson('/api/email-quotes?limit=75')
      ]);
      setMailbox(results[0] && results[0].gmail ? results[0].gmail : null);
      setDatHealth(results[0] && results[0].dat ? results[0].dat : null);
      setQuotes(Array.isArray(results[1]) ? results[1] : []);
      const nextId =
        preferredId ||
        (selected && selected.id) ||
        (results[1] && results[1][0] && results[1][0].id);
      if (nextId) await loadDetail(nextId);
      else setSelected(null);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load the quote inbox');
    } finally {
      setLoading(false);
    }
  }

  useEffect(function() {
    if (previewMode) {
      setMailbox(PREVIEW_MAILBOX);
      setQuotes(PREVIEW_QUOTES);
      applyDetail(PREVIEW_QUOTES[0]);
      setLoading(false);
    } else if (user) {
      loadWorkspace();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, previewMode]);

  useEffect(function() {
    if (previewMode || !user) return undefined;
    const timer = window.setInterval(function() {
      requestJson('/api/operations/health')
        .then(function(health) {
          setMailbox(health && health.gmail ? health.gmail : null);
          setDatHealth(health && health.dat ? health.dat : null);
        })
        .catch(function() {
          // The main workspace error handling remains responsible for visible request failures.
        });
    }, 30000);
    return function() { window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, previewMode]);

  useEffect(function() {
    if (previewMode || !selected) return undefined;
    const options = Array.isArray(selected.carrierQuotes) ? selected.carrierQuotes : [];
    const waitingForDat = options.some(function(option) {
      return (option.key === 'datRateView' || option.key === 'datLoadOffers') &&
        ['pending', 'running'].indexOf(option.status) > -1;
    });
    if (!waitingForDat) return undefined;
    const timer = window.setInterval(function() {
      loadDetail(selected.id, true);
    }, 4000);
    return function() { window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected && selected.id, selected && JSON.stringify(selected.carrierQuotes), previewMode]);

  const selectedCarrier = useMemo(function() {
    const options = selected && Array.isArray(selected.carrierQuotes)
      ? selected.carrierQuotes
      : [];
    return options.find(function(option) { return option.key === carrierKey; }) || null;
  }, [selected, carrierKey]);

  const marginAmount = useMemo(function() {
    if (!selectedCarrier || selectedCarrier.cost == null || clientPrice === '') return null;
    return Number(clientPrice) - Number(selectedCarrier.cost);
  }, [selectedCarrier, clientPrice]);

  const emailHtml = useMemo(function() {
    return buildQuoteEmailHtml(selected, emailNote);
  }, [selected, emailNote]);

  function chooseCarrier(option) {
    if (!option.available || option.selectable === false || option.benchmark === true) return;
    setCarrierKey(option.key);
    const defaultMargin =
      selected && selected.selection && selected.selection.marginPct != null
        ? Number(selected.selection.marginPct)
        : selected && selected.recommendation && selected.recommendation.defaultMarginPct != null
          ? Number(selected.recommendation.defaultMarginPct)
          : Number(marginPct || 0);
    setMarginPct(String(defaultMargin));
    setClientPrice(String(Number((Number(option.cost) * (1 + defaultMargin / 100)).toFixed(2))));
    setNotice('');
  }

  function changeMargin(value) {
    setMarginPct(value);
    if (selectedCarrier && selectedCarrier.cost != null && value !== '') {
      const price = Number(selectedCarrier.cost) * (1 + Number(value || 0) / 100);
      setClientPrice(String(Number(price.toFixed(2))));
    }
    setNotice('');
  }

  function changeClientPrice(value) {
    setClientPrice(value);
    if (selectedCarrier && selectedCarrier.cost && value !== '') {
      const calculated = ((Number(value) - Number(selectedCarrier.cost)) / Number(selectedCarrier.cost)) * 100;
      setMarginPct(Number.isFinite(calculated) ? String(Number(calculated.toFixed(2))) : '');
    }
    setNotice('');
  }

  async function checkInbox() {
    if (previewMode) {
      setNotice('Demo inbox checked. No new quote emails were found.');
      return;
    }
    setPolling(true);
    setError('');
    setNotice('');
    try {
      const status = await requestJson('/api/email-quotes/poll', { method: 'POST' });
      setMailbox(status);
      setNotice(
        status.lastCreated
          ? `${status.lastCreated} new quote email${status.lastCreated === 1 ? '' : 's'} processed.`
          : 'Inbox checked. No new quote emails were found.'
      );
      await loadWorkspace();
    } catch (requestError) {
      setError(requestError.message || 'Unable to check the Gmail inbox');
    } finally {
      setPolling(false);
    }
  }

  async function saveShipmentAndRate() {
    if (!selected) return;
    if (previewMode) {
      const updated = {
        ...selected,
        shipment: buildShipment(editor, selected.shipment),
        processingError: null
      };
      setQuotes(function(current) {
        return current.map(function(quote) { return quote.id === updated.id ? updated : quote; });
      });
      applyDetail(updated);
      setNotice('Demo shipment details saved and carrier rates refreshed.');
      return;
    }
    setSavingShipment(true);
    setError('');
    setNotice('');
    try {
      const detail = await requestJson('/api/email-quotes/' + selected.id + '/shipment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment: buildShipment(editor, selected.shipment) })
      });
      applyDetail(detail);
      setNotice(detail.status === 'ready'
        ? 'Shipment saved. Carrier pricing refreshed and eligible DAT searches were queued automatically.'
        : 'Shipment saved. Review the remaining missing details.');
      await loadWorkspace(detail.id);
    } catch (requestError) {
      setError(requestError.message || 'Unable to refresh carrier rates');
    } finally {
      setSavingShipment(false);
    }
  }

  async function reprocessEmail() {
    if (!selected) return;
    if (previewMode) {
      setNotice('Demo email parsed again and shipment fields refreshed.');
      return;
    }
    setReprocessing(true);
    setError('');
    setNotice('');
    try {
      const detail = await requestJson('/api/email-quotes/' + selected.id + '/reprocess', {
        method: 'POST'
      });
      applyDetail(detail);
      setNotice('Email parsed again. Carrier pricing refreshed and eligible DAT searches were queued automatically.');
      await loadWorkspace(detail.id);
    } catch (requestError) {
      setError(requestError.message || 'Unable to reprocess the email');
    } finally {
      setReprocessing(false);
    }
  }

  async function retryDatLookup() {
    if (!selected) return;
    if (previewMode) {
      setNotice('Demo DAT lookup is complete. Spot and Contract market benchmarks are shown below.');
      return;
    }
    setRunningDat(true);
    setError('');
    setNotice('');
    try {
      setRunningDatLoads(true);
      const detail = await requestJson('/api/email-quotes/' + selected.id + '/dat-lookups', {
        method: 'POST'
      });
      applyDetail(detail);
      setNotice('Eligible DAT RateView and Search Loads lookups were queued. Protected uncertain results were left unchanged.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to retry DAT pricing');
    } finally {
      setRunningDat(false);
      setRunningDatLoads(false);
    }
  }

  async function retryDatSearchLoads() {
    if (!selected) return;
    if (previewMode) {
      setNotice('Demo DAT Search Loads results are shown below, ranked by highest total Rate.');
      return;
    }
    setRunningDatLoads(true);
    setError('');
    setNotice('');
    try {
      setRunningDat(true);
      const detail = await requestJson('/api/email-quotes/' + selected.id + '/dat-lookups', {
        method: 'POST'
      });
      applyDetail(detail);
      setNotice('Eligible DAT RateView and Search Loads lookups were queued. Protected uncertain results were left unchanged.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to retry DAT Search Loads');
    } finally {
      setRunningDatLoads(false);
      setRunningDat(false);
    }
  }

  async function saveClientPrice() {
    if (!selected || !selectedCarrier) return;
    if (previewMode) {
      const price = Number(clientPrice);
      const cost = Number(selectedCarrier.cost);
      const updated = {
        ...selected,
        status: 'priced',
        quoteId: 'quote-preview-1048',
        staffNotes,
        selection: {
          carrierKey,
          carrierSource: selectedCarrier.source,
          carrierCost: cost,
          marginPct: Number(marginPct),
          marginAmount: Number((price - cost).toFixed(2)),
          clientPrice: price
        }
      };
      setQuotes(function(current) {
        return current.map(function(quote) { return quote.id === updated.id ? updated : quote; });
      });
      applyDetail(updated);
      setNotice('Demo client quote created and added to the quote pipeline.');
      return;
    }
    setSavingPrice(true);
    setError('');
    setNotice('');
    try {
      const detail = await requestJson('/api/email-quotes/' + selected.id + '/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carrierKey,
          marginPct: Number(marginPct),
          clientPrice: Number(clientPrice),
          staffNotes
        })
      });
      applyDetail(detail);
      setNotice('Client quote created and added to the quote pipeline.');
      await loadWorkspace(detail.id);
    } catch (requestError) {
      setError(requestError.message || 'Unable to save the client price');
    } finally {
      setSavingPrice(false);
    }
  }

  async function sendQuoteEmail() {
    if (!selected || !emailTo.trim() || !emailHtml.trim()) return;
    if (previewMode) {
      const updated = {
        ...selected,
        status: 'sent',
        quoteSentAt: new Date().toISOString(),
        quoteSentTo: emailTo.trim(),
        quoteSentCc: emailCc.trim()
      };
      setQuotes(function(current) {
        return current.map(function(quote) { return quote.id === updated.id ? updated : quote; });
      });
      applyDetail(updated);
      setNotice(
        'Demo quote email sent to ' + emailTo.trim() +
        (emailCc.trim() ? ' (cc ' + emailCc.trim() + ')' : '') + '.'
      );
      return;
    }
    setSendingQuoteEmail(true);
    setError('');
    setNotice('');
    try {
      const detail = await requestJson('/api/email-quotes/' + selected.id + '/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailTo.trim(), cc: emailCc.trim(), html: emailHtml })
      });
      applyDetail(detail);
      setNotice(
        'Quote email sent to ' + emailTo.trim() +
        (emailCc.trim() ? ' (cc ' + emailCc.trim() + ')' : '') + '.'
      );
      await loadWorkspace(detail.id);
    } catch (requestError) {
      setError(requestError.message || 'Unable to send the quote email');
    } finally {
      setSendingQuoteEmail(false);
    }
  }

  if (checking && !previewMode) {
    return <div className="customer-portal-loading"><span>Opening quote inbox...</span></div>;
  }
  if (!user && !previewMode) {
    return <AuthForm onAuthed={function(authedUser) { setUser(authedUser); }} />;
  }

  const shipment = (selected && selected.shipment) || {};
  const pickupLocation = shipment.pickup && shipment.pickup.location;
  const deliveryLocation = shipment.delivery && shipment.delivery.location;
  const carrierQuotes = selected && Array.isArray(selected.carrierQuotes)
    ? selected.carrierQuotes
    : [];
  const datStatusOption = carrierQuotes.find(function(option) { return option.key === 'datRateView'; });
  const datCompleted = carrierQuotes.some(function(option) {
    return option.key === 'datSpot' || option.key === 'datContract';
  });
  const datBusy = datStatusOption && ['pending', 'running'].indexOf(datStatusOption.status) > -1;
  const datUncertain = datStatusOption && datStatusOption.status === 'uncertain';
  const datLoadsOption = carrierQuotes.find(function(option) { return option.key === 'datLoadOffers'; });
  const datLoadsBusy = datLoadsOption && ['pending', 'running'].indexOf(datLoadsOption.status) > -1;
  const datLoadsCompleted = datLoadsOption && datLoadsOption.status === 'completed';
  const datLoadsUncertain = datLoadsOption && datLoadsOption.status === 'uncertain';
  const datRetryable = datStatusOption &&
    ['awaiting_approval', 'needs_auth', 'failed'].indexOf(datStatusOption.status) > -1;
  const datLoadsRetryable = (datLoadsOption &&
    ['awaiting_approval', 'needs_auth', 'failed'].indexOf(datLoadsOption.status) > -1) ||
    (!datLoadsOption && selected && ['ready', 'priced', 'sent'].indexOf(selected.status) > -1);
  const datEquipmentSaved = Boolean(editor.datEquipmentType) &&
    editor.datEquipmentType === shipment.datEquipmentType;
  const datSearchToday = calendarDateInTimezone(new Date(), 'America/New_York');
  const datSearchPickupDateCurrent = Boolean(editor.pickupDate) &&
    editor.pickupDate >= datSearchToday;
  const savedEditor = shipmentToEditor(shipment);
  const searchLoadsSnapshotSaved = [
    'pickupCity',
    'pickupState',
    'pickupZip',
    'pickupDate',
    'deliveryCity',
    'deliveryState',
    'deliveryZip',
    'datEquipmentType'
  ].every(function(field) {
    return String(editor[field] || '').trim().toUpperCase() ===
      String(savedEditor[field] || '').trim().toUpperCase();
  });
  const datRetryDisabled = runningDat || datBusy || datCompleted ||
    !datEquipmentSaved || (datStatusOption && datStatusOption.status === 'disabled');
  const datLoadsRetryDisabled = runningDatLoads || datLoadsBusy || datLoadsCompleted ||
    !datEquipmentSaved || !datSearchPickupDateCurrent || !searchLoadsSnapshotSaved ||
    (datLoadsOption && datLoadsOption.status === 'disabled');
  const carrierCostOptions = carrierQuotes.filter(function(option) {
    return option.key !== 'datLoadOffers';
  });
  const mailboxReady = mailbox && ['online', 'checking'].indexOf(mailbox.state) > -1;
  const datReady = previewMode || (datHealth && ['online', 'working'].indexOf(datHealth.state) > -1);

  return (
    <div className="app-layout">
      <Sidebar userOverride={previewMode ? PREVIEW_USER : undefined} />
      <main className="app-main eq-main">
        <div className="app-content eq-page">
          <header className="eq-page-header">
            <div>
              <p className="eq-eyebrow"><Inbox size={14} /> Email quote operations</p>
              <h1>Quote Inbox</h1>
              <p>Parse customer emails, compare connected carrier costs, and set the client price.</p>
            </div>
            <button type="button" className="eq-check-button" onClick={checkInbox} disabled={polling}>
              <RefreshCw size={16} className={polling ? 'spinning' : ''} />
              {polling ? 'Checking Gmail...' : 'Check inbox now'}
            </button>
          </header>

          <section className={'eq-mailbox-card ' + (mailboxReady ? 'connected' : 'setup')}>
            <span className="eq-mailbox-icon">{mailboxReady ? <Wifi size={21} /> : <WifiOff size={21} />}</span>
            <div>
              <small>Inbound quote mailbox</small>
              <strong>{(mailbox && mailbox.mailboxAddress) || 'emailbot@optimation.io'}</strong>
              <p>
                {mailboxReady
                  ? `Connected${mailbox.connectedAddress ? ' as ' + mailbox.connectedAddress : ''}. New messages are checked automatically.`
                  : mailbox && mailbox.configured
                    ? 'OAuth is configured. Check the inbox to verify the connected account.'
                    : 'Gmail OAuth setup is required before automatic email processing can begin.'}
              </p>
            </div>
            <div className="eq-mailbox-meta">
              <span>{mailbox && mailbox.lastSuccessAt ? 'Last checked ' + formatDateTime(mailbox.lastSuccessAt) : 'Not checked yet'}</span>
              <span>Forward Air + ExpediteAll</span>
              <span className={datReady ? 'eq-dat-enabled' : 'eq-dat-attention'}>
                {datReady
                  ? 'DAT worker connected'
                  : datHealth && datHealth.state === 'needs_auth'
                    ? 'DAT sign-in required'
                    : 'DAT worker needs attention'}
              </span>
            </div>
          </section>

          {!previewMode && datHealth && !datReady && (
            <div className="eq-message error">
              <AlertCircle size={16} />
              {datHealth.state === 'needs_auth'
                ? 'DAT needs a verified browser sign-in before another lookup can run.'
                : datHealth.state === 'disabled'
                  ? 'DAT automation is disabled on the server.'
                  : 'The DAT worker is not reporting a healthy connection. Check Railway before approving another lookup.'}
            </div>
          )}

          {error && <div className="eq-message error"><AlertCircle size={16} /> {error}</div>}
          {notice && <div className="eq-message success"><CheckCircle2 size={16} /> {notice}</div>}

          <div className="eq-workspace">
            <aside className="eq-inbox-list">
              <div className="eq-list-header">
                <div><strong>Incoming requests</strong><span>{quotes.length} emails</span></div>
                {loading && <RefreshCw size={15} className="spinning" />}
              </div>
              <div className="eq-list-scroll">
                {!loading && quotes.length === 0 ? (
                  <div className="eq-list-empty">
                    <Mail size={24} />
                    <strong>No quote emails yet</strong>
                    <p>New messages sent to the quote mailbox will appear here.</p>
                  </div>
                ) : quotes.map(function(quote) {
                  return (
                    <QuoteListItem
                      key={quote.id}
                      quote={quote}
                      active={selected && selected.id === quote.id}
                      onClick={function() { loadDetail(quote.id); }}
                    />
                  );
                })}
              </div>
            </aside>

            <section className="eq-detail">
              {!selected ? (
                <div className="eq-detail-empty">
                  <Inbox size={34} />
                  <h2>Select a quote request</h2>
                  <p>The parsed shipment, carrier rates, and pricing tools will appear here.</p>
                </div>
              ) : detailLoading ? (
                <div className="eq-detail-empty"><RefreshCw size={28} className="spinning" /><p>Loading quote request...</p></div>
              ) : (
                <>
                  <div className="eq-detail-header">
                    <div>
                      <span className={'eq-status ' + statusTone(selected.status)}>{statusLabel(selected.status)}</span>
                      <h2>{selected.subject || 'New quote request'}</h2>
                      <p><User size={14} /> {(selected.sender && (selected.sender.name || selected.sender.email)) || 'Unknown sender'} <span>·</span> <Clock3 size={14} /> {formatDateTime(selected.receivedAt)}</p>
                    </div>
                    <button type="button" className="eq-secondary-button" onClick={reprocessEmail} disabled={reprocessing}>
                      <Sparkles size={15} /> {reprocessing ? 'Parsing...' : 'Parse email again'}
                    </button>
                  </div>

                  {selected.processingError && (
                    <div className="eq-review-alert">
                      <AlertCircle size={18} />
                      <div><strong>Staff review needed</strong><p>{selected.processingError}</p></div>
                    </div>
                  )}

                  <section className="eq-section">
                    <div className="eq-section-heading">
                      <div><Mail size={18} /><span><strong>Original email</strong><small>The message as received, before parsing.</small></span></div>
                    </div>
                    <pre className="eq-raw-email">{selected.rawText || 'Original email text is not available for this request.'}</pre>
                  </section>

                  <section className="eq-section">
                    <div className="eq-section-heading">
                      <div><MapPin size={18} /><span><strong>Parsed shipment</strong><small>Correct anything the email parser missed before rating.</small></span></div>
                      <span className="eq-route-summary">{locationLine(pickupLocation)} <ArrowRight size={13} /> {locationLine(deliveryLocation)}</span>
                    </div>

                    <div className="eq-form-group">
                      <span className="eq-form-kicker">Pickup</span>
                      <div className="eq-field-grid location">
                        <label>City<input value={editor.pickupCity} onChange={function(e) { setEditor({ ...editor, pickupCity: e.target.value }); }} /></label>
                        <label>State<input maxLength="2" value={editor.pickupState} onChange={function(e) { setEditor({ ...editor, pickupState: e.target.value.toUpperCase() }); }} /></label>
                        <label>ZIP<input value={editor.pickupZip} onChange={function(e) { setEditor({ ...editor, pickupZip: e.target.value }); }} /></label>
                        <label><span><CalendarDays size={13} /> Pickup date</span><input type="date" min={datSearchToday} value={editor.pickupDate} onChange={function(e) { setEditor({ ...editor, pickupDate: e.target.value }); }} /></label>
                      </div>
                    </div>

                    <div className="eq-form-group">
                      <span className="eq-form-kicker">Delivery</span>
                      <div className="eq-field-grid delivery">
                        <label>City<input value={editor.deliveryCity} onChange={function(e) { setEditor({ ...editor, deliveryCity: e.target.value }); }} /></label>
                        <label>State<input maxLength="2" value={editor.deliveryState} onChange={function(e) { setEditor({ ...editor, deliveryState: e.target.value.toUpperCase() }); }} /></label>
                        <label>ZIP<input value={editor.deliveryZip} onChange={function(e) { setEditor({ ...editor, deliveryZip: e.target.value }); }} /></label>
                      </div>
                    </div>

                    <div className="eq-form-group">
                      <span className="eq-form-kicker">Freight</span>
                      <div className="eq-field-grid freight">
                        <label><span><Package size={13} /> Pallets</span><input type="number" value={editor.pallets} onChange={function(e) { setEditor({ ...editor, pallets: e.target.value }); }} /></label>
                        <label>Length (in)<input type="number" value={editor.length} onChange={function(e) { setEditor({ ...editor, length: e.target.value }); }} /></label>
                        <label>Width (in)<input type="number" value={editor.width} onChange={function(e) { setEditor({ ...editor, width: e.target.value }); }} /></label>
                        <label>Height (in)<input type="number" value={editor.height} onChange={function(e) { setEditor({ ...editor, height: e.target.value }); }} /></label>
                        <label><span><Weight size={13} /> Total weight (lb)</span><input type="number" value={editor.totalWeight} onChange={function(e) { setEditor({ ...editor, totalWeight: e.target.value }); }} /></label>
                        <label className="commodity">Commodity<input value={editor.commodity} onChange={function(e) { setEditor({ ...editor, commodity: e.target.value }); }} /></label>
                        <label className="temperature-control">
                          Temperature service
                          <span className="eq-checkbox-field">
                            <input
                              type="checkbox"
                              checked={editor.temperatureControlled}
                              onChange={function(e) {
                                const checked = e.target.checked;
                                const dryTruckType = String(editor.truckType || '').replace(/^Reefer\s+/i, '');
                                setEditor({
                                  ...editor,
                                  temperatureControlled: checked,
                                  truckType: dryTruckType ? (checked ? 'Reefer ' + dryTruckType : dryTruckType) : '',
                                  datEquipmentType: checked ? 'Reefer' : (dryTruckType ? 'Van' : editor.datEquipmentType)
                                });
                              }}
                            />
                            Refrigerated / controlled
                          </span>
                        </label>
                        <label className="truck-assignment">
                          Assigned truck
                          <select
                            value={editor.truckType}
                            onChange={function(e) {
                              const truckType = e.target.value;
                              const reefer = /^Reefer\b/i.test(truckType);
                              setEditor({
                                ...editor,
                                truckType,
                                truckTypeSource: truckType ? 'staff' : '',
                                temperatureControlled: truckType ? reefer : editor.temperatureControlled,
                                datEquipmentType: truckType ? (reefer ? 'Reefer' : 'Van') : ''
                              });
                            }}
                          >
                            <option value="">Assign automatically</option>
                            {TRUCK_TYPE_OPTIONS.map(function(truckType) {
                              return <option key={truckType} value={truckType}>{truckType}</option>;
                            })}
                          </select>
                        </label>
                        <label className="dat-equipment">DAT equipment<select value={editor.datEquipmentType} onChange={function(e) { setEditor({ ...editor, datEquipmentType: e.target.value }); }}><option value="">Choose equipment</option><option value="Van">Van</option><option value="Flatbed">Flatbed</option><option value="Reefer">Reefer</option></select></label>
                      </div>
                      <div className={'eq-assignment-note ' + (((selected.shipment || {}).truckAssignment || {}).status === 'needs_review' ? 'review' : '')}>
                        <Truck size={15} />
                        <div>
                          <strong>{((selected.shipment || {}).truckType) || 'Automatic truck assignment pending'}</strong>
                          <span>{(((selected.shipment || {}).truckAssignment || {}).reason) || 'The smallest safe truck will be assigned from pallets, weight, dimensions, and temperature service when you save.'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="eq-section-actions">
                      <button type="button" className="eq-secondary-button strong" onClick={saveShipmentAndRate} disabled={savingShipment}>
                        <RefreshCw size={15} className={savingShipment ? 'spinning' : ''} />
                        {savingShipment ? 'Refreshing pricing...' : 'Save details & refresh pricing'}
                      </button>
                    </div>
                  </section>

                  <section className="eq-section eq-route-section">
                    <div className="eq-section-heading">
                      <div><MapPin size={18} /><span><strong>Route map + nearby major cities</strong><small>See the shipment lane and useful metro context before pricing.</small></span></div>
                      <span className="eq-map-context-badge">Operational context</span>
                    </div>
                    <QuoteRouteMap
                      pickup={{ city: editor.pickupCity, state: editor.pickupState, zip: editor.pickupZip }}
                      delivery={{ city: editor.deliveryCity, state: editor.deliveryState, zip: editor.deliveryZip }}
                    />
                  </section>

                  <section className="eq-section">
                    <div className="eq-section-heading">
                      <div><Truck size={18} /><span><strong>Carrier costs + DAT market benchmarks</strong><small>Carrier pricing and DAT benchmarks run automatically. Select the best confirmed carrier cost when the results are ready.</small></span></div>
                      {datRetryable ? (
                        <button type="button" className="eq-secondary-button eq-dat-button" onClick={retryDatLookup} disabled={datRetryDisabled} title={!editor.datEquipmentType ? 'Choose DAT equipment above first' : !datEquipmentSaved ? 'Save shipment details before retrying DAT' : ''}>
                          <RefreshCw size={14} className={runningDat ? 'spinning' : ''} />
                          {runningDat ? 'Queueing...' : 'Retry DAT pricing'}
                        </button>
                      ) : (
                        <span className={'eq-auto-status ' + (datCompleted ? 'complete' : datBusy ? 'working' : datUncertain ? 'review' : datStatusOption && datStatusOption.status === 'disabled' ? 'offline' : '')}>
                          {datCompleted ? <CheckCircle2 size={14} /> : datUncertain ? <AlertCircle size={14} /> : <RefreshCw size={14} className={datBusy ? 'spinning' : ''} />}
                          {datCompleted ? 'DAT pricing ready' : datBusy ? 'Running automatically' : datUncertain ? 'Reconcile required' : datStatusOption && datStatusOption.status === 'disabled' ? 'DAT worker offline' : 'Queues automatically'}
                        </span>
                      )}
                    </div>
                    {carrierCostOptions.length ? (
                      <div className="eq-carrier-grid">
                        {carrierCostOptions.map(function(option) {
                          const recommended = selected.recommendation && selected.recommendation.carrierKey === option.key;
                          const active = carrierKey === option.key && option.selectable !== false;
                          const benchmark = option.benchmark === true;
                          return (
                            <button
                              type="button"
                              key={option.key}
                              className={'eq-carrier-card ' + (active ? 'active ' : '') + (!option.available ? 'unavailable ' : '') + (benchmark ? 'benchmark' : '')}
                              onClick={function() { chooseCarrier(option); }}
                              disabled={!option.available || option.selectable === false}
                            >
                              <div className="eq-carrier-top">
                                <span>{option.source}</span>
                                {recommended && <em><Sparkles size={12} /> Suggested</em>}
                                {benchmark && <em className="market">Market benchmark</em>}
                                {active && <Check size={16} />}
                              </div>
                              {option.available ? (
                                <>
                                  <strong>{formatMoney(option.cost)}</strong>
                                  <p>{benchmark ? 'Market average — not a bookable carrier quote' : 'Carrier cost'}</p>
                                  {benchmark ? (
                                    <>
                                      {option.marketLow != null && option.marketHigh != null ? (
                                        <div className="eq-market-range"><span>Low {formatMoney(option.marketLow)}</span><span>High {formatMoney(option.marketHigh)}</span></div>
                                      ) : (
                                        <div className="eq-market-range"><span>{option.marketRangeUnavailableReason || 'DAT market range unavailable'}</span></div>
                                      )}
                                      <div className="eq-carrier-details">
                                        <span>{option.ratePerMile ? formatMoney(option.ratePerMile) + '/mi avg' : 'Per-mile unavailable'}</span>
                                        <span>{option.miles ? option.miles.toLocaleString() + ' mi' : 'Miles unavailable'}</span>
                                        <span>{option.timeframe || 'Market timeframe unavailable'}</span>
                                        <span>{option.truckType || 'Equipment confirmed by DAT'}</span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="eq-carrier-details">
                                      <span>{option.truckType || 'Service confirmed by carrier'}</span>
                                      <span>{option.transitTime ? option.transitTime + ' day transit' : 'Transit pending'}</span>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="eq-carrier-error"><AlertCircle size={16} /><span>{option.error || 'No rate returned'}</span></div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="eq-rate-empty"><Truck size={22} /><p>Complete the shipment details to request carrier rates.</p></div>
                    )}
                    {selected.recommendation && (
                      <div className="eq-suggestion-line"><Sparkles size={14} /><strong>Suggestion:</strong> {selected.recommendation.reason}</div>
                    )}
                  </section>

                  <section className="eq-section eq-dat-loads-section">
                    <div className="eq-section-heading">
                      <div><Truck size={18} /><span><strong>DAT Market Offers — pricing context only</strong><small>Search Loads runs automatically and returns up to 10 direct results ranked by total Rate. They are not confirmed carrier bids or capacity.</small></span></div>
                      {datLoadsRetryable ? (
                        <button
                          type="button"
                          className="eq-secondary-button eq-dat-button"
                          onClick={retryDatSearchLoads}
                          disabled={datLoadsRetryDisabled}
                          title={!editor.datEquipmentType ? 'Choose DAT equipment above first' : !editor.pickupDate ? 'Add and save a pickup date first' : !datSearchPickupDateCurrent ? 'Pickup date must be today or later' : !searchLoadsSnapshotSaved ? 'Save the current lane, pickup date, and DAT equipment before retrying Search Loads' : ''}
                        >
                          <RefreshCw size={14} className={runningDatLoads ? 'spinning' : ''} />
                          {runningDatLoads ? 'Queueing...' : datLoadsOption ? 'Retry DAT lookups' : 'Queue missing DAT searches'}
                        </button>
                      ) : (
                        <span className={'eq-auto-status ' + (datLoadsCompleted ? 'complete' : datLoadsBusy ? 'working' : datLoadsUncertain ? 'review' : datLoadsOption && datLoadsOption.status === 'disabled' ? 'offline' : '')}>
                          {datLoadsCompleted ? <CheckCircle2 size={14} /> : datLoadsUncertain ? <AlertCircle size={14} /> : <RefreshCw size={14} className={datLoadsBusy ? 'spinning' : ''} />}
                          {datLoadsCompleted ? 'Market offers ready' : datLoadsBusy ? 'Running automatically' : datLoadsUncertain ? 'Reconcile required' : datLoadsOption && datLoadsOption.status === 'disabled' ? 'DAT worker offline' : 'Queues automatically'}
                        </span>
                      )}
                    </div>

                    <div className="eq-dat-market-warning">
                      <AlertCircle size={15} />
                      <span><strong>Do not book from this table.</strong> Select only a confirmed carrier cost above after availability and service are verified.</span>
                    </div>

                    {!datLoadsOption ? (
                      <div className="eq-rate-empty"><Truck size={22} /><p>Search Loads will start automatically as soon as the saved shipment has a valid lane, pickup date, and DAT equipment.</p></div>
                    ) : !datLoadsOption.available ? (
                      <div className="eq-dat-loads-state">
                        <AlertCircle size={17} />
                        <div><strong>{datLoadsOption.status === 'pending' || datLoadsOption.status === 'running' ? 'DAT worker in progress' : 'DAT Search Loads is waiting'}</strong><span>{datLoadsOption.error || 'The worker has not returned a verified result yet.'}</span></div>
                      </div>
                    ) : (
                      <>
                        <div className="eq-dat-loads-summary">
                          <span><strong>{datLoadsOption.offers ? datLoadsOption.offers.length : 0}</strong> shown</span>
                          <span><strong>{datLoadsOption.resultCount || 0}</strong> direct results</span>
                          <span><strong>{datLoadsOption.eligibleCount || 0}</strong> eligible rates</span>
                          <span><strong>{datLoadsOption.excludedCount || 0}</strong> excluded</span>
                          <span>Sorted <strong>Rate — highest</strong></span>
                        </div>
                        {datLoadsOption.acceptedCriteria && (
                          <div className="eq-dat-loads-criteria">
                            <span>{datLoadsOption.acceptedCriteria.origin}</span>
                            <ArrowRight size={13} />
                            <span>{datLoadsOption.acceptedCriteria.destination}</span>
                            <em>{datLoadsOption.acceptedCriteria.equipmentType}</em>
                            <em>{datLoadsOption.acceptedCriteria.pickupDate}</em>
                            <em>150 mi DH-O / DH-D</em>
                          </div>
                        )}
                        {datLoadsOption.offers && datLoadsOption.offers.length ? (
                          <div className="eq-dat-loads-table-wrap">
                            <table className="eq-dat-loads-table">
                              <thead>
                                <tr><th>Rank / rate</th><th>Lane</th><th>Pickup</th><th>Equipment</th><th>Company</th><th>Credit</th><th>Comments</th></tr>
                              </thead>
                              <tbody>
                                {datLoadsOption.offers.map(function(offer) {
                                  return (
                                    <tr key={offer.datLoadId}>
                                      <td><strong>#{offer.rank} {offer.displayedTotal || formatMoney(offer.totalUsd)}</strong><span>{offer.rpm || 'RPM unavailable'} · {offer.tripMiles || 'miles unavailable'}</span></td>
                                      <td><strong>{offer.origin || 'Origin unavailable'} <ArrowRight size={11} /> {offer.destination || 'Destination unavailable'}</strong><span>{offer.originDeadhead || 'DH-O unavailable'} · {offer.destinationDeadhead || 'DH-D unavailable'}</span></td>
                                      <td><strong>{offer.pickup || 'Pickup unavailable'}</strong></td>
                                      <td><strong>{offer.equipmentCode || 'Equipment unavailable'}</strong><span>{offer.weight || 'Weight unavailable'} · {offer.lengthLoadType || 'Length/load type unavailable'}</span></td>
                                      <td><strong>{offer.company || 'Company unavailable'}</strong></td>
                                      <td><strong>{offer.creditScore || '—'}</strong><span>{offer.daysToPay || 'DTP unavailable'}</span></td>
                                      <td><strong>{offer.comments || (offer.commentsStatus === 'redacted' ? 'Contact details removed' : 'Not displayed')}</strong></td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="eq-rate-empty"><Truck size={22} /><p>No eligible numeric direct rates were returned for this search.</p></div>
                        )}
                        <p className="eq-dat-loads-note">These are read-only DAT load-board rates for pricing context. They are not bookable carrier selections in this CRM.</p>
                      </>
                    )}
                  </section>

                  <section className="eq-section pricing">
                    <div className="eq-section-heading">
                      <div><CircleDollarSign size={18} /><span><strong>Set the client price</strong><small>Staff controls the final margin and amount charged.</small></span></div>
                      {selected.quoteId && <span className="eq-quote-reference">Quote {selected.quoteId}</span>}
                    </div>
                    <div className="eq-pricing-grid">
                      <div className="eq-cost-summary">
                        <small>Selected carrier cost</small>
                        <strong>{selectedCarrier ? formatMoney(selectedCarrier.cost) : 'Choose a carrier'}</strong>
                        <span>{selectedCarrier && selectedCarrier.source}</span>
                      </div>
                      <label className="eq-money-field">
                        <span><Percent size={14} /> Margin</span>
                        <div><input type="number" min="0" step="0.01" value={marginPct} onChange={function(e) { changeMargin(e.target.value); }} disabled={!selectedCarrier} /><em>%</em></div>
                      </label>
                      <label className="eq-money-field primary">
                        <span>Client price</span>
                        <div><em>$</em><input type="number" min="0" step="0.01" value={clientPrice} onChange={function(e) { changeClientPrice(e.target.value); }} disabled={!selectedCarrier} /></div>
                      </label>
                      <div className="eq-profit-summary">
                        <small>Gross profit</small>
                        <strong>{marginAmount != null ? formatMoney(marginAmount) : '—'}</strong>
                        <span>{marginPct ? Number(marginPct).toFixed(2) + '% margin' : 'No margin entered'}</span>
                      </div>
                    </div>
                    <label className="eq-notes-field">
                      Staff notes
                      <textarea value={staffNotes} onChange={function(e) { setStaffNotes(e.target.value); }} placeholder="Internal pricing rationale or service notes..." />
                    </label>
                    <div className="eq-pricing-footer">
                      <p><CheckCircle2 size={15} /> Saving creates a pending client quote in the CRM pipeline.</p>
                      <button type="button" className="eq-save-price" onClick={saveClientPrice} disabled={!selectedCarrier || !clientPrice || savingPrice}>
                        <Save size={16} /> {savingPrice ? 'Creating quote...' : selected.quoteId ? 'Update client quote' : 'Create client quote'}
                      </button>
                    </div>
                  </section>

                  {(selected.status === 'priced' || selected.status === 'sent') && (
                    <section className="eq-section">
                      <div className="eq-section-heading">
                        <div><Mail size={18} /><span><strong>Email response</strong><small>Review the draft, then send it to the customer.</small></span></div>
                        {selected.status === 'sent' && selected.quoteSentAt && (
                          <span className="eq-route-summary">Sent {formatDateTime(selected.quoteSentAt)}</span>
                        )}
                      </div>
                      <label className="eq-notes-field">
                        Personal note <small>(shown to the customer, optional)</small>
                        <textarea
                          value={emailNote}
                          onChange={function(e) { setEmailNote(e.target.value); }}
                          placeholder="Add a personal note for the customer..."
                        />
                      </label>
                      <span className="eq-form-kicker eq-preview-kicker">Email preview</span>
                      <iframe
                        title="Email preview"
                        className="eq-email-preview"
                        srcDoc={emailHtml}
                        sandbox=""
                      />
                      <div className="eq-send-row">
                        <label className="eq-send-field">
                          <span>To <em>(receiver)</em></span>
                          <input
                            type="email"
                            placeholder="customer@example.com"
                            value={emailTo}
                            onChange={function(e) { setEmailTo(e.target.value); }}
                          />
                        </label>
                        <label className="eq-send-field">
                          <span>Cc <em>(copied)</em></span>
                          <input
                            type="email"
                            placeholder="Cc (optional)"
                            value={emailCc}
                            onChange={function(e) { setEmailCc(e.target.value); }}
                          />
                        </label>
                        <button
                          type="button"
                          className="eq-secondary-button strong"
                          onClick={sendQuoteEmail}
                          disabled={!emailTo.trim() || !emailHtml.trim() || sendingQuoteEmail}
                        >
                          <Send size={15} /> {sendingQuoteEmail ? 'Sending...' : selected.status === 'sent' ? 'Resend Quote' : 'Send Quote'}
                        </button>
                      </div>
                    </section>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
