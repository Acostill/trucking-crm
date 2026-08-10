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
  commodity: ''
};

const PREVIEW_USER = {
  id: 'preview-operations',
  email: 'quotes@firstclasstrucking.net',
  firstName: 'Quote Desk',
  roles: ['agent']
};

const PREVIEW_MAILBOX = {
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
      commodity: 'Medical equipment'
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
      }
    ],
    recommendation: {
      carrierKey: 'forwardAir',
      carrierSource: 'Forward Air',
      carrierCost: 1248.62,
      defaultMarginPct: 18,
      suggestedClientPrice: 1473.37,
      reason: 'Lowest available carrier cost. Staff should confirm service and transit before sending.'
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
      commodity: 'Aircraft parts'
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

function extractForwardedContacts(rawText) {
  const text = String(rawText || '');
  const forwardedIndex = text.search(/-{2,}\s*forwarded message\s*-{2,}/i);
  if (forwardedIndex === -1) return { to: '', cc: '' };
  const headerBlock = text.slice(forwardedIndex, forwardedIndex + 600);
  const fromMatch = headerBlock.match(/^From:\s*(.+)$/im);
  const toMatch = headerBlock.match(/^To:\s*(.+)$/im);
  const to = fromMatch ? extractEmailAddress(fromMatch[1]) : '';
  const cc = toMatch ? extractEmailAddress(toMatch[1]) : '';
  return { to, cc: cc && cc.toLowerCase() !== to.toLowerCase() ? cc : '' };
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

function buildQuoteEmailBody(quote) {
  if (!quote) return '';
  const shipment = quote.shipment || {};
  const pickup = shipment.pickup || {};
  const pickupLocation = pickup.location || {};
  const delivery = shipment.delivery || {};
  const deliveryLocation = delivery.location || {};
  const selection = quote.selection || {};
  const carrierOptions = Array.isArray(quote.carrierQuotes) ? quote.carrierQuotes : [];
  const carrierOption = carrierOptions.find(function(option) { return option.key === selection.carrierKey; });
  const transitTime = carrierOption && carrierOption.transitTime;

  const detailLines = [
    `Pickup: ${locationLine(pickupLocation)}${pickup.date ? ' on ' + formatDateTime(pickup.date) : ''}`,
    `Delivery: ${locationLine(deliveryLocation)}`,
    selection.carrierSource ? `Carrier: ${selection.carrierSource}` : null,
    transitTime ? `Estimated transit: ${transitTime} day${transitTime === 1 ? '' : 's'}` : null,
    `Total price: ${formatMoney(selection.clientPrice)}`
  ].filter(Boolean);

  return [
    'Thank you for choosing First Class Trucking!',
    '',
    'Here are your quote details:',
    ...detailLines,
    '',
    'Reply to this email to confirm and we will get your shipment scheduled.',
    '',
    'Thank you,',
    'First Class Trucking'
  ].join('\n');
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
    commodity: (shipment && shipment.commodity) || ''
  };
}

function buildShipment(editor, existing) {
  const palletCount = Number(editor.pallets) || undefined;
  return {
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
    commodity: editor.commodity.trim()
  };
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
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [savingShipment, setSavingShipment] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState(EMPTY_EDITOR);
  const [carrierKey, setCarrierKey] = useState('');
  const [marginPct, setMarginPct] = useState('');
  const [clientPrice, setClientPrice] = useState('');
  const [staffNotes, setStaffNotes] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailBody, setEmailBody] = useState('');
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
    setEmailBody(buildQuoteEmailBody(detail));
  }

  async function loadDetail(id) {
    if (!id) return;
    if (previewMode) {
      const detail = quotes.find(function(quote) { return quote.id === id; });
      if (detail) applyDetail(detail);
      return;
    }
    setDetailLoading(true);
    setError('');
    try {
      const detail = await requestJson('/api/email-quotes/' + id);
      applyDetail(detail);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load the email quote');
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadWorkspace(preferredId) {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all([
        requestJson('/api/email-quotes/mailbox/status'),
        requestJson('/api/email-quotes?limit=75')
      ]);
      setMailbox(results[0]);
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

  function chooseCarrier(option) {
    if (!option.available) return;
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
        ? 'Shipment details saved and carrier rates refreshed.'
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
      setNotice('Email parsed again and carrier rates refreshed.');
      await loadWorkspace(detail.id);
    } catch (requestError) {
      setError(requestError.message || 'Unable to reprocess the email');
    } finally {
      setReprocessing(false);
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
    if (!selected || !emailTo.trim() || !emailBody.trim()) return;
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
        body: JSON.stringify({ to: emailTo.trim(), cc: emailCc.trim(), body: emailBody })
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
  const mailboxReady = mailbox && mailbox.configured && !mailbox.lastError;

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
              <span className="eq-dat-disabled">DAT later</span>
            </div>
          </section>

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
                        <label><span><CalendarDays size={13} /> Pickup date</span><input type="date" value={editor.pickupDate} onChange={function(e) { setEditor({ ...editor, pickupDate: e.target.value }); }} /></label>
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
                      </div>
                    </div>

                    <div className="eq-section-actions">
                      <button type="button" className="eq-secondary-button strong" onClick={saveShipmentAndRate} disabled={savingShipment}>
                        <RefreshCw size={15} className={savingShipment ? 'spinning' : ''} />
                        {savingShipment ? 'Checking carriers...' : 'Save details & refresh rates'}
                      </button>
                    </div>
                  </section>

                  <section className="eq-section">
                    <div className="eq-section-heading">
                      <div><Truck size={18} /><span><strong>Connected carrier costs</strong><small>DAT is intentionally excluded from this phase.</small></span></div>
                    </div>
                    {carrierQuotes.length ? (
                      <div className="eq-carrier-grid">
                        {carrierQuotes.map(function(option) {
                          const recommended = selected.recommendation && selected.recommendation.carrierKey === option.key;
                          const active = carrierKey === option.key;
                          return (
                            <button
                              type="button"
                              key={option.key}
                              className={'eq-carrier-card ' + (active ? 'active ' : '') + (!option.available ? 'unavailable' : '')}
                              onClick={function() { chooseCarrier(option); }}
                              disabled={!option.available}
                            >
                              <div className="eq-carrier-top">
                                <span>{option.source}</span>
                                {recommended && <em><Sparkles size={12} /> Suggested</em>}
                                {active && <Check size={16} />}
                              </div>
                              {option.available ? (
                                <>
                                  <strong>{formatMoney(option.cost)}</strong>
                                  <p>Carrier cost</p>
                                  <div className="eq-carrier-details">
                                    <span>{option.truckType || 'Service confirmed by carrier'}</span>
                                    <span>{option.transitTime ? option.transitTime + ' day transit' : 'Transit pending'}</span>
                                  </div>
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
                        Message
                        <textarea
                          className="eq-email-body"
                          value={emailBody}
                          onChange={function(e) { setEmailBody(e.target.value); }}
                        />
                      </label>
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
                          disabled={!emailTo.trim() || !emailBody.trim() || sendingQuoteEmail}
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
