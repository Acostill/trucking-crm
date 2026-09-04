import express, { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import db from '../db';
import { getAuthenticatedUserFromRequest, userHasAnyRole } from '../utils/auth';
import {
  ingestGmailQuoteMessage,
  processEmailQuoteRequest,
  rateEmailQuoteRequest
} from '../services/emailQuoteWorkflow';
import {
  getEmailQuotePollState,
  pollGmailQuoteInbox
} from '../services/emailQuotePoller';
import {
  requestDatLookups,
  requestDatRateViewLookup,
  requestDatSearchLoadsLookup
} from '../services/datRateViewJobs';
import { sendGmailMessage } from '../services/gmailQuoteInbox';
import { buildQuoteAdvisor } from '../services/quoteAdvisor';

const router = express.Router();
const QUOTE_APPROVER_ROLES = ['quote_approver'];

function awardedLoadNumber(): string {
  return `FCL-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function shipmentLocationLine(location: any): string {
  return [location && location.city, location && location.state, location && (location.zip || location.zip_code)]
    .filter(Boolean)
    .join(', ');
}

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
  const shipment = jsonValue(row.shipment_request, {});
  const carrierQuotes = jsonValue(row.carrier_quotes, []);
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
    shipment,
    carrierQuotes,
    advisor: buildQuoteAdvisor(shipment, carrierQuotes),
    advisorAcknowledgedAt: row.advisor_acknowledged_at,
    quoteValidUntil: row.quote_valid_until,
    outcome: row.quote_outcome || 'open',
    outcomeAt: row.outcome_at,
    outcomeNotes: row.outcome_notes,
    followUpAt: row.follow_up_at,
    followUpStatus: row.follow_up_status || 'not_needed',
    followUpNote: row.follow_up_note,
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
  const user = await getAuthenticatedUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Sign in to manage email quotes' });
    return null;
  }
  if (!userHasAnyRole(user, QUOTE_APPROVER_ROLES)) {
    res.status(403).json({ error: 'Quote approver access is required to manage email quotes' });
    return null;
  }
  return user.id;
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
    let query = 'SELECT * FROM public.email_quote_requests WHERE archived_at IS NULL';
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
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

router.post('/:id/dat-lookups', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = await requireOperationsUser(req, res);
    if (!userId) return;
    const record = await requestDatLookups(req.params.id, userId);
    res.json(rowToEmailQuote(record, true));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/dat-rateview', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = await requireOperationsUser(req, res);
    if (!userId) return;
    const record = await requestDatRateViewLookup(req.params.id, userId);
    res.json(rowToEmailQuote(record, true));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/dat-search-loads', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = await requireOperationsUser(req, res);
    if (!userId) return;
    const record = await requestDatSearchLoadsLookup(req.params.id, userId);
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
      return option.key === carrierKey &&
        option.available &&
        option.selectable !== false &&
        option.benchmark !== true;
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
    if (!(req.body && req.body.advisorAcknowledged === true)) {
      res.status(400).json({ error: 'Review and acknowledge the quote advisor before creating the client price' });
      return;
    }
    const quoteValidUntil = String(req.body && req.body.quoteValidUntil || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quoteValidUntil)) {
      res.status(400).json({ error: 'Choose a valid quote expiration date' });
      return;
    }
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
             priced_by = $10,
             advisor_acknowledged_at = NOW(),
             advisor_acknowledged_by = $10,
             quote_valid_until = $11
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
          userId,
          quoteValidUntil
        ]
      );
      return result.rows[0];
    }, userId);

    res.json(rowToEmailQuote(updated, true));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/workflow', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = await requireOperationsUser(req, res);
    if (!userId) return;
    const outcome = String(req.body && req.body.outcome || 'open').toLowerCase();
    const followUpStatus = String(req.body && req.body.followUpStatus || 'not_needed').toLowerCase();
    if (!['open', 'awarded', 'lost'].includes(outcome)) {
      res.status(400).json({ error: 'Outcome must be open, awarded, or lost' });
      return;
    }
    if (!['not_needed', 'due', 'completed'].includes(followUpStatus)) {
      res.status(400).json({ error: 'Follow-up status is invalid' });
      return;
    }
    const outcomeNotes = req.body && req.body.outcomeNotes ? String(req.body.outcomeNotes).slice(0, 2000) : null;
    const followUpNote = req.body && req.body.followUpNote ? String(req.body.followUpNote).slice(0, 2000) : null;
    const followUpAt = req.body && req.body.followUpAt ? new Date(String(req.body.followUpAt)) : null;
    if (followUpAt && Number.isNaN(followUpAt.getTime())) {
      res.status(400).json({ error: 'Follow-up date is invalid' });
      return;
    }
    const updated = await db.transactionWithUser(async function(client) {
      const result = await client.query(
        `UPDATE public.email_quote_requests
         SET quote_outcome = $2,
             outcome_at = CASE WHEN $2 = 'open' THEN NULL ELSE NOW() END,
             outcome_by = CASE WHEN $2 = 'open' THEN NULL ELSE $3 END,
             outcome_notes = $4,
             follow_up_at = $5,
             follow_up_status = $6,
             follow_up_note = $7,
             updated_at = NOW()
         WHERE id = $1 AND archived_at IS NULL
         RETURNING *`,
        [req.params.id, outcome, userId, outcomeNotes, followUpAt ? followUpAt.toISOString() : null, followUpStatus, followUpNote]
      );
      if (!result.rows.length) return null;
      const quoteId = result.rows[0].quote_id;
      if (quoteId && outcome !== 'open') {
        const quoteResult = await client.query('SELECT * FROM public.quotes WHERE id = $1 FOR UPDATE', [quoteId]);
        const quote = quoteResult.rows[0];
        if (quote && outcome === 'lost' && quote.status === 'approved') {
          const error: any = new Error('An awarded quote with an operations load cannot be marked lost');
          error.status = 409;
          throw error;
        }
        if (quote) {
          await client.query(
            `UPDATE public.quotes
             SET status = $2,
                 approved_at = CASE WHEN $2 = 'approved' THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
                 approved_by = CASE WHEN $2 = 'approved' THEN COALESCE(approved_by, $3) ELSE approved_by END,
                 rejected_at = CASE WHEN $2 = 'rejected' THEN COALESCE(rejected_at, NOW()) ELSE rejected_at END,
                 rejected_by = CASE WHEN $2 = 'rejected' THEN COALESCE(rejected_by, $3) ELSE rejected_by END,
                 updated_at = NOW()
             WHERE id = $1`,
            [quoteId, outcome === 'awarded' ? 'approved' : 'rejected', userId]
          );
        }
        if (quote && outcome === 'awarded') {
          const existingLoad = await client.query('SELECT id FROM public.loads WHERE source_quote_id = $1', [quoteId]);
          if (!existingLoad.rows.length) {
            const shipment = jsonValue(result.rows[0].shipment_request, {});
            const pickup = shipment.pickup || {};
            const delivery = shipment.delivery || {};
            const pickupLocation = pickup.location || {};
            const deliveryLocation = delivery.location || {};
            await client.query(
              `INSERT INTO public.loads (
                 source_quote_id, customer, load_number, bill_to, dispatcher, status, type, rate, currency,
                 carrier_or_driver, equipment_type, shipper, shipper_location, ship_date,
                 show_ship_time, description, qty, weight, value, consignee, consignee_location,
                 delivery_date, show_delivery_time, delivery_notes
               ) VALUES (
                 $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
               )`,
              [
                quoteId,
                result.rows[0].quote_sent_to || result.rows[0].sender_name || result.rows[0].sender_email || 'Email quote customer',
                awardedLoadNumber(),
                result.rows[0].quote_sent_to || result.rows[0].sender_email || null,
                null,
                'Pending',
                'Awarded Quote',
                numericValue(result.rows[0].client_price),
                'USD',
                result.rows[0].selected_carrier_source || null,
                shipment.truckType || null,
                shipmentLocationLine(pickupLocation) || 'Pickup location pending',
                shipmentLocationLine(pickupLocation) || null,
                pickup.date || null,
                true,
                shipment.commodity || 'Awarded from email quote',
                shipment.pieces && shipment.pieces.quantity || null,
                shipment.weight && shipment.weight.value || null,
                null,
                shipmentLocationLine(deliveryLocation) || 'Delivery location pending',
                shipmentLocationLine(deliveryLocation) || null,
                delivery.date || null,
                true,
                result.rows[0].quote_sent_to || result.rows[0].sender_email || null
              ]
            );
          }
        }
      }
      return result.rows[0];
    }, userId);
    if (!updated) {
      res.status(404).json({ error: 'Email quote request not found' });
      return;
    }
    res.json(rowToEmailQuote(updated, true));
  } catch (err) {
    next(err);
  }
});

router.post('/archive-beta', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getAuthenticatedUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in to manage beta records' });
      return;
    }
    if (!userHasAnyRole(user, ['admin'])) {
      res.status(403).json({ error: 'Administrator access is required' });
      return;
    }
    const ids = Array.isArray(req.body && req.body.ids)
      ? req.body.ids.map(String).filter(Boolean).slice(0, 100)
      : [];
    if (!ids.length) {
      res.status(400).json({ error: 'Provide the exact quote request IDs to archive' });
      return;
    }
    const preview = await db.query(
      `SELECT id, subject, sender_email, created_at
       FROM public.email_quote_requests
       WHERE id = ANY($1::text[]) AND archived_at IS NULL
       ORDER BY created_at DESC`,
      [ids]
    );
    if (req.body && req.body.confirm !== true) {
      res.json({ archived: false, records: preview.rows });
      return;
    }
    const result = await db.queryWithUser(
      `UPDATE public.email_quote_requests
       SET archived_at = NOW(), archived_by = $2, updated_at = NOW()
       WHERE id = ANY($1::text[]) AND archived_at IS NULL
       RETURNING id`,
      [ids, user.id],
      user.id
    );
    res.json({ archived: true, ids: result.rows.map(function(row) { return row.id; }) });
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
      threadId: row.external_thread_id || undefined,
      inReplyToMessageId: row.internet_message_id || undefined
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
