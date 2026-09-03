import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import db from '../db';
import {
  getAuthenticatedUserFromRequest,
  requirePermission,
  userHasPermission
} from '../utils/auth';

const router = express.Router();

// Helper function to generate a unique load number
function generateLoadNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `FCL-${date}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

const PUBLIC_QUOTE_WINDOW_MS = 60 * 60 * 1000;
const PUBLIC_QUOTE_LIMIT = 20;
const PUBLIC_QUOTE_TRACKED_IP_LIMIT = 10000;
const publicQuoteRequests = new Map<string, number[]>();

function cleanText(value: any, maxLength: number): string | null {
  const cleaned = String(value || '').trim().replace(/\s+/g, ' ');
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function finiteNumber(value: any): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quoteAccessTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function quoteAccessTokenFromRequest(req: Request): string {
  return String(req.get('X-Quote-Access-Token') || '').trim();
}

function tokenMatches(token: string, expectedHash: string | null | undefined): boolean {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(quoteAccessTokenHash(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function publicQuoteBaseUrl(req: Request): string {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const origin = String(req.get('origin') || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(origin)) return origin;
  return `${req.protocol}://${req.get('host')}`;
}

function allowPublicQuoteRequest(req: Request): boolean {
  const key = String(req.ip || req.socket.remoteAddress || 'unknown');
  const now = Date.now();
  if (publicQuoteRequests.size >= PUBLIC_QUOTE_TRACKED_IP_LIMIT && !publicQuoteRequests.has(key)) {
    for (const [trackedKey, timestamps] of publicQuoteRequests.entries()) {
      if (!timestamps.some(function(timestamp) { return timestamp > now - PUBLIC_QUOTE_WINDOW_MS; })) {
        publicQuoteRequests.delete(trackedKey);
      }
    }
    if (publicQuoteRequests.size >= PUBLIC_QUOTE_TRACKED_IP_LIMIT) return false;
  }
  const recent = (publicQuoteRequests.get(key) || []).filter(function(timestamp) {
    return timestamp > now - PUBLIC_QUOTE_WINDOW_MS;
  });
  if (recent.length >= PUBLIC_QUOTE_LIMIT) {
    publicQuoteRequests.set(key, recent);
    return false;
  }
  recent.push(now);
  publicQuoteRequests.set(key, recent);
  return true;
}

async function authorizeQuote(
  req: Request,
  quoteRow: any,
  permission: 'quotes.read' | 'quotes.manage'
): Promise<{ userId: string | null; authorized: boolean; authenticated: boolean }> {
  const user = await getAuthenticatedUserFromRequest(req);
  if (userHasPermission(user, permission)) {
    return { userId: user ? user.id : null, authorized: true, authenticated: true };
  }
  const token = quoteAccessTokenFromRequest(req);
  return {
    userId: user ? user.id : null,
    authorized: tokenMatches(token, quoteRow.public_access_token_hash),
    authenticated: Boolean(user)
  };
}

// Helper function to format location from shipment data
function formatLocationFromShipment(location: any): string | null {
  if (!location || typeof location !== 'object') return null;
  const segments: string[] = [];
  if (location.city) segments.push(location.city);
  if (location.state) segments.push(location.state);
  const cityState = segments.length ? segments.join(', ') : null;
  const zip = location.zip || location.zip_code || null;
  if (cityState && zip) return cityState + ' ' + zip;
  return cityState || zip || null;
}

// Helper function to convert quote to load record
function quoteToLoadRecord(quote: any): any {
  const shipment = quote.shipment || {};
  const pickup = shipment.pickup || {};
  const delivery = shipment.delivery || {};
  const pickupLoc = pickup.location || {};
  const deliveryLoc = delivery.location || {};
  const contact = quote.contact || {};
  const quoteData = quote.quote || {};

  // Build shipper address
  const shipperAddress = [
    pickupLoc.city,
    pickupLoc.state,
    pickupLoc.zip || pickupLoc.zip_code
  ].filter(Boolean).join(', ') || 'Pickup location pending';

  // Build consignee address
  const consigneeAddress = [
    deliveryLoc.city,
    deliveryLoc.state,
    deliveryLoc.zip || deliveryLoc.zip_code
  ].filter(Boolean).join(', ') || 'Delivery location pending';

  return {
    customer: contact.name || 'Unknown Customer',
    load_number: generateLoadNumber(),
    bill_to: contact.email || null,
    dispatcher: null,
    status: 'Pending',
    type: 'Approved Quote',
    rate: quoteData.total != null ? Number(quoteData.total) : null,
    currency: 'USD',
    carrier_or_driver: null,
    equipment_type: quoteData.truckType || null,
    shipper: shipperAddress,
    shipper_location: formatLocationFromShipment(pickupLoc),
    ship_date: pickup.date || null,
    show_ship_time: true,
    description: 'Approved from quote',
    qty: shipment.pieces?.quantity || null,
    weight: shipment.weight?.value || null,
    value: null,
    consignee: consigneeAddress,
    consignee_location: formatLocationFromShipment(deliveryLoc),
    delivery_date: delivery.date || null,
    show_delivery_time: true,
    delivery_notes: contact.email || contact.phone || null
  };
}

// Helper to convert database row to quote object
function rowToQuote(row: any): any {
  return {
    id: row.id,
    status: row.status,
    contact: {
      name: row.contact_name,
      email: row.contact_email,
      phone: row.contact_phone
    },
    quote: {
      total: row.quote_total ? Number(row.quote_total) : null,
      linehaul: row.quote_linehaul ? Number(row.quote_linehaul) : null,
      ratePerMile: row.quote_rate_per_mile ? Number(row.quote_rate_per_mile) : null,
      truckType: row.quote_truck_type,
      transitTime: row.quote_transit_time,
      rateCalculationID: row.quote_rate_calculation_id,
      accessorials: typeof row.quote_accessorials === 'string' 
        ? JSON.parse(row.quote_accessorials) 
        : (row.quote_accessorials || []),
      accessorialsTotal: row.quote_accessorials_total ? Number(row.quote_accessorials_total) : null
    },
    sourceEmailQuoteId: row.source_email_quote_id || null,
    pricing: {
      carrierSource: row.carrier_source || null,
      carrierCost: row.carrier_cost != null ? Number(row.carrier_cost) : null,
      marginPct: row.margin_pct != null ? Number(row.margin_pct) : null,
      marginAmount: row.margin_amount != null ? Number(row.margin_amount) : null
    },
    shipment: typeof row.shipment_data === 'string'
      ? JSON.parse(row.shipment_data)
      : (row.shipment_data || {}),
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    rejectedAt: row.rejected_at,
    rejectedBy: row.rejected_by,
    quoteUrl: row.quote_url,
    n8nWebhookSent: row.n8n_webhook_sent
  };
}

// Helper to save quote to database
async function saveQuote(
  quoteData: any,
  publicAccessTokenHash: string,
  userId?: string | null
): Promise<any> {
  const {
    id,
    status = 'pending',
    contact = {},
    quote = {},
    shipment = {},
    submittedAt,
    quoteUrl,
    n8nWebhookSent = false
  } = quoteData;

  const accessorials = Array.isArray(quote.accessorials) ? quote.accessorials : [];

  const insertSql = `
    INSERT INTO public.quotes (
      id, status,
      contact_name, contact_email, contact_phone,
      quote_total, quote_linehaul, quote_rate_per_mile, quote_truck_type,
      quote_transit_time, quote_rate_calculation_id, quote_accessorials, quote_accessorials_total,
      shipment_data, submitted_at, quote_url, n8n_webhook_sent,
      public_access_token_hash, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19
    )
    RETURNING *
  `;

  const params = [
    id,
    status,
    contact.name || null,
    contact.email || null,
    contact.phone || null,
    quote.total != null ? quote.total : null,
    quote.linehaul != null ? quote.linehaul : null,
    quote.ratePerMile != null ? quote.ratePerMile : null,
    quote.truckType || null,
    quote.transitTime != null ? quote.transitTime : null,
    quote.rateCalculationID || null,
    JSON.stringify(accessorials),
    quote.accessorialsTotal != null ? quote.accessorialsTotal : null,
    JSON.stringify(shipment),
    submittedAt || new Date().toISOString(),
    quoteUrl || null,
    n8nWebhookSent,
    publicAccessTokenHash,
    userId || null
  ];

  try {
    const result = await db.queryWithUser(insertSql, params, userId || undefined);
    return rowToQuote(result.rows[0]);
  } catch (err) {
    console.error('Error saving quote to database:', err);
    throw err;
  }
}

// GET /api/quotes/:id - Get a quote by ID
router.get('/:id', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    
    if (!id) {
      res.status(400).json({ error: 'Quote ID is required' });
      return;
    }

    const result = await db.query('SELECT * FROM public.quotes WHERE id = $1', [id]);
    if (!result.rows.length) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    const access = await authorizeQuote(req, result.rows[0], 'quotes.read');
    if (!access.authorized) {
      res.status(access.authenticated ? 403 : 401).json({ error: 'Quote access required' });
      return;
    }

    res.json(rowToQuote(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

// POST /api/quotes/:id/approve - Approve a quote
router.post('/:id/approve', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    
    if (!id) {
      res.status(400).json({ error: 'Quote ID is required' });
      return;
    }

    const accessResult = await db.query('SELECT * FROM public.quotes WHERE id = $1', [id]);
    if (!accessResult.rows.length) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    const access = await authorizeQuote(req, accessResult.rows[0], 'quotes.manage');
    if (!access.authorized) {
      res.status(access.authenticated ? 403 : 401).json({ error: 'Quote approval access required' });
      return;
    }

    const outcome = await db.transactionWithUser(async function(client) {
      const locked = await client.query(
        'SELECT * FROM public.quotes WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (!locked.rows.length) {
        const err: any = new Error('Quote not found');
        err.status = 404;
        throw err;
      }
      if (locked.rows[0].status === 'rejected') {
        const err: any = new Error('A rejected quote cannot be approved');
        err.status = 409;
        throw err;
      }

      let loadResult = await client.query(
        'SELECT * FROM public.loads WHERE source_quote_id = $1',
        [id]
      );
      if (!loadResult.rows.length) {
        const loadRecord = quoteToLoadRecord(rowToQuote(locked.rows[0]));
        loadResult = await client.query(
          `INSERT INTO public.loads (
             source_quote_id, customer, load_number, bill_to, dispatcher, status, type, rate, currency,
             carrier_or_driver, equipment_type, shipper, shipper_location, ship_date,
             show_ship_time, description, qty, weight, value, consignee, consignee_location,
             delivery_date, show_delivery_time, delivery_notes
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
           ) RETURNING *`,
          [
            id,
            loadRecord.customer,
            loadRecord.load_number,
            loadRecord.bill_to,
            loadRecord.dispatcher,
            loadRecord.status,
            loadRecord.type,
            loadRecord.rate,
            loadRecord.currency,
            loadRecord.carrier_or_driver,
            loadRecord.equipment_type,
            loadRecord.shipper,
            loadRecord.shipper_location,
            loadRecord.ship_date,
            loadRecord.show_ship_time,
            loadRecord.description,
            loadRecord.qty,
            loadRecord.weight,
            loadRecord.value,
            loadRecord.consignee,
            loadRecord.consignee_location,
            loadRecord.delivery_date,
            loadRecord.show_delivery_time,
            loadRecord.delivery_notes
          ]
        );
      }

      const updated = locked.rows[0].status === 'approved'
        ? locked
        : await client.query(
          `UPDATE public.quotes
           SET status = 'approved', approved_at = NOW(), approved_by = $2, updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [id, access.userId]
        );
      return { quote: updated.rows[0], load: loadResult.rows[0] };
    }, access.userId);

    res.json({
      ...rowToQuote(outcome.quote),
      load: {
        id: outcome.load.id,
        loadNumber: outcome.load.load_number,
        status: outcome.load.status
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/quotes/:id/reject - Reject a quote
router.post('/:id/reject', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    
    if (!id) {
      res.status(400).json({ error: 'Quote ID is required' });
      return;
    }

    const accessResult = await db.query('SELECT * FROM public.quotes WHERE id = $1', [id]);
    if (!accessResult.rows.length) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    const access = await authorizeQuote(req, accessResult.rows[0], 'quotes.manage');
    if (!access.authorized) {
      res.status(access.authenticated ? 403 : 401).json({ error: 'Quote rejection access required' });
      return;
    }

    const updated = await db.transactionWithUser(async function(client) {
      const locked = await client.query(
        'SELECT * FROM public.quotes WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (!locked.rows.length) {
        const err: any = new Error('Quote not found');
        err.status = 404;
        throw err;
      }
      if (locked.rows[0].status === 'approved') {
        const err: any = new Error('An approved quote cannot be rejected');
        err.status = 409;
        throw err;
      }
      if (locked.rows[0].status === 'rejected') return locked.rows[0];
      const result = await client.query(
        `UPDATE public.quotes
         SET status = 'rejected', rejected_at = NOW(), rejected_by = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id, access.userId]
      );
      return result.rows[0];
    }, access.userId);

    res.json(rowToQuote(updated));
  } catch (err) {
    next(err);
  }
});

// POST /api/quotes - Create a new quote (for storing quotes from webhook)
router.post('/', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getAuthenticatedUserFromRequest(req);
    const userId = user ? user.id : null;
    const internalCreate = userHasPermission(user, 'quotes.create');
    if (!internalCreate && String(process.env.PUBLIC_QUOTE_SUBMISSIONS_ENABLED || 'true').toLowerCase() === 'false') {
      res.status(403).json({ error: 'Public quote submissions are disabled' });
      return;
    }
    if (!internalCreate && !allowPublicQuoteRequest(req)) {
      res.setHeader('Retry-After', '3600');
      res.status(429).json({ error: 'Too many quote requests. Please try again later.' });
      return;
    }
    const quoteData = req.body || {};
    const inputQuote = quoteData.quote || {};
    const shipment = quoteData.shipment || {};
    const total = finiteNumber(inputQuote.total);
    if (
      total == null || total <= 0 ||
      !shipment.pickup || !shipment.pickup.location ||
      !shipment.delivery || !shipment.delivery.location
    ) {
      res.status(400).json({ error: 'A positive quote total and complete shipment lane are required' });
      return;
    }

    const id = `quote-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const publicAccessToken = crypto.randomBytes(32).toString('base64url');
    const cleanQuoteUrl = `${publicQuoteBaseUrl(req)}/quotes/${encodeURIComponent(id)}`;
    const quote = {
      id: id,
      status: 'pending',
      contact: {
        name: cleanText(quoteData.contact && quoteData.contact.name, 200),
        email: cleanText(quoteData.contact && quoteData.contact.email, 320),
        phone: cleanText(quoteData.contact && quoteData.contact.phone, 80)
      },
      quote: {
        total,
        linehaul: finiteNumber(inputQuote.linehaul),
        ratePerMile: finiteNumber(inputQuote.ratePerMile),
        truckType: cleanText(inputQuote.truckType, 120),
        transitTime: finiteNumber(inputQuote.transitTime),
        rateCalculationID: cleanText(inputQuote.rateCalculationID, 200),
        accessorials: Array.isArray(inputQuote.accessorials) ? inputQuote.accessorials.slice(0, 50) : [],
        accessorialsTotal: finiteNumber(inputQuote.accessorialsTotal)
      },
      shipment,
      submittedAt: quoteData.submittedAt || new Date().toISOString(),
      quoteUrl: cleanQuoteUrl,
      n8nWebhookSent: false
    };

    const saved = await saveQuote(quote, quoteAccessTokenHash(publicAccessToken), userId);

    res.status(201).json({
      ...saved,
      publicAccessToken,
      publicQuoteUrl: `${cleanQuoteUrl}#token=${encodeURIComponent(publicAccessToken)}`
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/quotes - List all quotes (optional: for admin/management)
router.get('/', requirePermission('quotes.read'), async function(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.query;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    
    let query = 'SELECT * FROM public.quotes';
    const params: any[] = [];
    
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
      query += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
      params.push(Number(limit), Number(offset));
    } else {
      query += ' ORDER BY created_at DESC LIMIT $1 OFFSET $2';
      params.push(Number(limit), Number(offset));
    }
    
    const result = await db.query(query, params);
    const quotes = result.rows.map(rowToQuote);
    
    res.json(quotes);
  } catch (err) {
    next(err);
  }
});

export default router;
