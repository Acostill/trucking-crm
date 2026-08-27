import express, { NextFunction, Request, Response } from 'express';
import db from '../db';
import { getUserIdFromRequest } from '../utils/auth';
import {
  ingestGmailQuoteMessage,
  processEmailQuoteRequest,
  rateEmailQuoteRequest
} from '../services/emailQuoteWorkflow';
import {
  getEmailQuotePollState,
  pollGmailQuoteInbox
} from '../services/emailQuotePoller';
import { sendGmailMessage } from '../services/gmailQuoteInbox';

const router = express.Router();
const QUOTE_APPROVER_ROLES = ['quote_approver'];

function jsonValue(value: any, fallback: any) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_err) {
      return fallback;
    }
  }
  return value;
}

function numericValue(value: any): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripReplyForwardPrefix(subject: any): string {
  let value = String(subject || '').trim();
  let previous: string;
  do {
    previous = value;
    value = value.replace(/^(fwd|fw|re)\s*:\s*/i, '').trim();
  } while (value !== previous);
  return value;
}

function rowToEmailQuote(row: any, includeRaw = false) {
  return {
    id: row.id,
    mailboxAddress: row.mailbox_address,
    externalMessageId: row.external_message_id,
    externalThreadId: row.external_thread_id,
    internetMessageId: row.internet_message_id,
    sender: {
      name: row.sender_name,
      email: row.sender_email
    },
    recipientEmail: row.recipient_email,
    subject: row.subject,
    receivedAt: row.received_at,
    ...(includeRaw ? { rawText: row.raw_text } : {}),
    parsedPayload: jsonValue(row.parsed_payload, null),
    shipment: jsonValue(row.shipment_request, {}),
    carrierQuotes: jsonValue(row.carrier_quotes, []),
    recommendation: jsonValue(row.recommendation, null),
    status: row.status,
    processingError: row.processing_error,
    selection: {
      carrierKey: row.selected_carrier_key,
      carrierSource: row.selected_carrier_source,
      carrierCost: numericValue(row.selected_carrier_cost),
      marginPct: numericValue(row.margin_pct),
      marginAmount: numericValue(row.margin_amount),
      clientPrice: numericValue(row.client_price)
    },
    staffNotes: row.staff_notes,
    quoteId: row.quote_id,
    lastRatedAt: row.last_rated_at,
    pricedAt: row.priced_at,
    quoteSentAt: row.quote_sent_at,
    quoteSentTo: row.quote_sent_to,
    quoteSentCc: row.quote_sent_cc,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function requireOperationsUser(req: Request, res: Response): Promise<string | null> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: 'Sign in to manage email quotes' });
    return null;
  }
  const roles = await db.query(
    `SELECT r.name
     FROM public.user_roles ur
     JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );
  const allowed = roles.rows.some(function(row) {
    return QUOTE_APPROVER_ROLES.indexOf(row.name) > -1;
  });
  if (!allowed) {
    res.status(403).json({ error: 'Quote approver access is required to manage email quotes' });
    return null;
  }
  return userId;
}

router.get('/mailbox/status', async function(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await requireOperationsUser(req, res)) return;
    res.json(getEmailQuotePollState());
  } catch (err) {
    next(err);
  }
});

router.post('/poll', async function(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await requireOperationsUser(req, res)) return;
    const status = await pollGmailQuoteInbox();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.post('/ingest', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const configuredSecret = process.env.INBOUND_EMAIL_SECRET;
    const suppliedSecret = req.get('X-Inbound-Email-Secret');
    if (!configuredSecret) {
      res.status(503).json({ error: 'INBOUND_EMAIL_SECRET is not configured' });
      return;
    }
    if (suppliedSecret !== configuredSecret) {
      res.status(401).json({ error: 'Invalid inbound email secret' });
      return;
    }
    const body = req.body || {};
    if (!body.externalMessageId || !body.rawText) {
      res.status(400).json({ error: 'externalMessageId and rawText are required' });
      return;
    }
    const result = await ingestGmailQuoteMessage({
      externalMessageId: String(body.externalMessageId),
      externalThreadId: body.externalThreadId ? String(body.externalThreadId) : undefined,
      internetMessageId: body.internetMessageId ? String(body.internetMessageId) : undefined,
      mailboxAddress: String(body.mailboxAddress || 'emailbot@optimation.io'),
      senderName: body.senderName ? String(body.senderName) : undefined,
      senderEmail: body.senderEmail ? String(body.senderEmail) : undefined,
      recipientEmail: body.recipientEmail ? String(body.recipientEmail) : undefined,
      subject: body.subject ? String(body.subject) : undefined,
      receivedAt: body.receivedAt ? String(body.receivedAt) : undefined,
      rawText: String(body.rawText)
    });
    res.status(result.created ? 201 : 200).json({
      created: result.created,
      quote: rowToEmailQuote(result.record, true)
    });
  } catch (err) {
    next(err);
  }
});

router.get('/', async function(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await requireOperationsUser(req, res)) return;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const status = req.query.status ? String(req.query.status) : '';
    const params: any[] = [];
    let query = 'SELECT * FROM public.email_quote_requests';
    if (status) {
      params.push(status);
      query += ` WHERE status = $${params.length}`;
    }
    params.push(limit);
    query += ` ORDER BY COALESCE(received_at, created_at) DESC LIMIT $${params.length}`;
    const result = await db.query(query, params);
    res.json(result.rows.map(function(row) { return rowToEmailQuote(row); }));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async function(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await requireOperationsUser(req, res)) return;
    const result = await db.query(
      'SELECT * FROM public.email_quote_requests WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length) {
      res.status(404).json({ error: 'Email quote request not found' });
      return;
    }
    res.json(rowToEmailQuote(result.rows[0], true));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reprocess', async function(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await requireOperationsUser(req, res)) return;
    const record = await processEmailQuoteRequest(req.params.id);
    res.json(rowToEmailQuote(record, true));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/shipment', async function(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await requireOperationsUser(req, res)) return;
    const shipment = req.body && req.body.shipment;
    if (!shipment || typeof shipment !== 'object') {
      res.status(400).json({ error: 'shipment is required' });
      return;
    }
    const record = await rateEmailQuoteRequest(req.params.id, shipment);
    res.json(rowToEmailQuote(record, true));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/pricing', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = await requireOperationsUser(req, res);
    if (!userId) return;
    const current = await db.query(
      'SELECT * FROM public.email_quote_requests WHERE id = $1',
      [req.params.id]
    );
    if (!current.rows.length) {
      res.status(404).json({ error: 'Email quote request not found' });
      return;
    }
    const row = current.rows[0];
    const carrierQuotes: any[] = jsonValue(row.carrier_quotes, []);
    const carrierKey = String(req.body && req.body.carrierKey || '');
    const selected = carrierQuotes.find(function(option) {
      return option.key === carrierKey && option.available;
    });
    if (!selected || !numericValue(selected.cost)) {
      res.status(400).json({ error: 'Choose an available carrier rate' });
      return;
    }
    const carrierCost = Number(selected.cost);
    const inputMarginPct = numericValue(req.body && req.body.marginPct);
    const inputClientPrice = numericValue(req.body && req.body.clientPrice);
    let clientPrice = inputClientPrice;
    if (clientPrice == null && inputMarginPct != null) {
      clientPrice = Number((carrierCost * (1 + inputMarginPct / 100)).toFixed(2));
    }
    if (clientPrice == null) {
      res.status(400).json({ error: 'Enter a margin or client price' });
      return;
    }
    if (clientPrice < carrierCost) {
      res.status(400).json({ error: 'Client price cannot be lower than carrier cost' });
      return;
    }
    const marginAmount = Number((clientPrice - carrierCost).toFixed(2));
    const marginPct = carrierCost > 0
      ? Number(((marginAmount / carrierCost) * 100).toFixed(4))
      : 0;
    const staffNotes = req.body && req.body.staffNotes
      ? String(req.body.staffNotes).slice(0, 4000)
      : null;
    const shipment = jsonValue(row.shipment_request, {});
    const quoteId = row.quote_id || `quote-${row.id}`;
    const contactName = row.sender_name || row.sender_email || 'Email quote customer';
    const accessorials = Array.isArray(selected.accessorials) ? selected.accessorials : [];

    const updated = await db.transactionWithUser(async function(client) {
      await client.query(
        `INSERT INTO public.quotes (
           id, status, contact_name, contact_email,
           quote_total, quote_linehaul, quote_rate_per_mile, quote_truck_type,
           quote_transit_time, quote_rate_calculation_id, quote_accessorials,
           shipment_data, submitted_at, source_email_quote_id,
           carrier_source, carrier_cost, margin_pct, margin_amount
         ) VALUES (
           $1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
           $11::jsonb, NOW(), $12, $13, $14, $15, $16
         )
         ON CONFLICT (id) DO UPDATE SET
           status = 'pending',
           contact_name = EXCLUDED.contact_name,
           contact_email = EXCLUDED.contact_email,
           quote_total = EXCLUDED.quote_total,
           quote_linehaul = EXCLUDED.quote_linehaul,
           quote_rate_per_mile = EXCLUDED.quote_rate_per_mile,
           quote_truck_type = EXCLUDED.quote_truck_type,
           quote_transit_time = EXCLUDED.quote_transit_time,
           quote_rate_calculation_id = EXCLUDED.quote_rate_calculation_id,
           quote_accessorials = EXCLUDED.quote_accessorials,
           shipment_data = EXCLUDED.shipment_data,
           source_email_quote_id = EXCLUDED.source_email_quote_id,
           carrier_source = EXCLUDED.carrier_source,
           carrier_cost = EXCLUDED.carrier_cost,
           margin_pct = EXCLUDED.margin_pct,
           margin_amount = EXCLUDED.margin_amount,
           updated_at = NOW()`,
        [
          quoteId,
          contactName,
          row.sender_email || null,
          clientPrice,
          carrierCost,
          selected.ratePerMile || null,
          selected.truckType || selected.source,
          selected.transitTime || null,
          selected.rateCalculationId || null,
          JSON.stringify(accessorials),
          JSON.stringify(shipment),
          row.id,
          selected.source,
          carrierCost,
          marginPct,
          marginAmount
        ]
      );
      const result = await client.query(
        `UPDATE public.email_quote_requests
         SET selected_carrier_key = $2,
             selected_carrier_source = $3,
             selected_carrier_cost = $4,
             margin_pct = $5,
             margin_amount = $6,
             client_price = $7,
             staff_notes = $8,
             quote_id = $9,
             status = 'priced',
             priced_at = NOW(),
             priced_by = $10
         WHERE id = $1
         RETURNING *`,
        [
          row.id,
          selected.key,
          selected.source,
          carrierCost,
          marginPct,
          marginAmount,
          clientPrice,
          staffNotes,
          quoteId,
          userId
        ]
      );
      return result.rows[0];
    }, userId);

    res.json(rowToEmailQuote(updated, true));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/send', async function(req: Request, res: Response, next: NextFunction) {
  try {
    if (!await requireOperationsUser(req, res)) return;
    const current = await db.query(
      'SELECT * FROM public.email_quote_requests WHERE id = $1',
      [req.params.id]
    );
    if (!current.rows.length) {
      res.status(404).json({ error: 'Email quote request not found' });
      return;
    }
    const row = current.rows[0];
    const to = String(req.body && req.body.to || '').trim();
    const cc = String(req.body && req.body.cc || '').trim();
    const html = String(req.body && req.body.html || '').trim();
    const cleanOriginalSubject = stripReplyForwardPrefix(row.subject);
    const subject = String(
      req.body && req.body.subject ||
      `Your First Class Trucking quote${cleanOriginalSubject ? ' — ' + cleanOriginalSubject : ''}`
    ).trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(to)) {
      res.status(400).json({ error: 'A valid recipient email is required' });
      return;
    }
    if (cc && !emailPattern.test(cc)) {
      res.status(400).json({ error: 'The CC address is not a valid email' });
      return;
    }
    if (!html) {
      res.status(400).json({ error: 'Email content is required' });
      return;
    }
    if (row.client_price == null) {
      res.status(400).json({ error: 'Create the client quote before sending it' });
      return;
    }
    await sendGmailMessage({
      to,
      cc: cc || undefined,
      subject,
      html,
      threadId: row.external_thread_id || undefined
    });
    const updated = await db.query(
      `UPDATE public.email_quote_requests
       SET status = 'sent',
           quote_sent_at = NOW(),
           quote_sent_to = $2,
           quote_sent_cc = $3
       WHERE id = $1
       RETURNING *`,
      [row.id, to, cc || null]
    );
    res.json(rowToEmailQuote(updated.rows[0], true));
  } catch (err) {
    next(err);
  }
});

export default router;
