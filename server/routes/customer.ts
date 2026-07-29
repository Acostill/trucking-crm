import express, { NextFunction, Request, Response } from 'express';
import db from '../db';
import { getUserIdFromRequest } from '../utils/auth';

const router = express.Router();

function parseJsonValue(value: any, fallback: any) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function mapQuote(row: any) {
  return {
    id: row.id,
    status: row.status,
    quote: {
      total: row.quote_total == null ? null : Number(row.quote_total),
      linehaul: row.quote_linehaul == null ? null : Number(row.quote_linehaul),
      ratePerMile: row.quote_rate_per_mile == null ? null : Number(row.quote_rate_per_mile),
      truckType: row.quote_truck_type,
      transitTime: row.quote_transit_time,
      rateCalculationID: row.quote_rate_calculation_id,
      accessorials: parseJsonValue(row.quote_accessorials, [])
    },
    shipment: parseJsonValue(row.shipment_data, {}),
    submittedAt: row.submitted_at,
    createdAt: row.created_at
  };
}

function mapShipment(row: any) {
  return {
    id: row.id,
    loadNumber: row.load_number,
    status: row.status,
    equipmentType: row.equipment_type,
    shipper: row.shipper,
    shipperLocation: row.shipper_location,
    shipDate: row.ship_date,
    consignee: row.consignee,
    consigneeLocation: row.consignee_location,
    deliveryDate: row.delivery_date,
    rate: row.rate == null ? null : Number(row.rate),
    currency: row.currency
  };
}

async function getRequestUser(req: Request) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return null;
  const result = await db.query(
    'SELECT id, email, first_name, last_name FROM public.users WHERE id = $1 AND is_active = TRUE',
    [userId]
  );
  return result.rows[0] || null;
}

router.get('/portal', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in to access the customer portal.' });
      return;
    }

    const [quoteResult, shipmentResult] = await Promise.all([
      db.query(
        `SELECT * FROM public.quotes
         WHERE LOWER(contact_email) = LOWER($1)
         ORDER BY created_at DESC
         LIMIT 50`,
        [user.email]
      ),
      db.query(
        `SELECT * FROM public.loads
         WHERE LOWER(COALESCE(bill_to, '')) = LOWER($1)
            OR LOWER(COALESCE(customer, '')) = LOWER($1)
         ORDER BY created_at DESC
         LIMIT 50`,
        [user.email]
      )
    ]);

    const quotes = quoteResult.rows.map(mapQuote);
    const shipments = shipmentResult.rows.map(mapShipment);
    const activeStatuses = new Set(['pending', 'open', 'booked', 'in transit', 'dispatched', 'at pickup']);
    const deliveredStatuses = new Set(['delivered', 'closed', 'complete', 'completed']);

    res.json({
      account: {
        email: user.email,
        name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email
      },
      metrics: {
        activeShipments: shipments.filter(function(item: any) { return activeStatuses.has(String(item.status || '').toLowerCase()); }).length,
        openQuotes: quotes.filter(function(item: any) { return String(item.status || '').toLowerCase() === 'pending'; }).length,
        deliveredShipments: shipments.filter(function(item: any) { return deliveredStatuses.has(String(item.status || '').toLowerCase()); }).length,
        totalQuotes: quotes.length
      },
      quotes,
      shipments
    });
  } catch (error) {
    next(error);
  }
});

router.post('/quotes', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in to request a rate.' });
      return;
    }

    const body = req.body || {};
    const quote = body.quote || {};
    const shipment = body.shipment || {};
    const total = Number(quote.total);
    const pickupLocation = shipment.pickup && shipment.pickup.location;
    const deliveryLocation = shipment.delivery && shipment.delivery.location;
    if (!Number.isFinite(total) || total <= 0 || !pickupLocation || !deliveryLocation) {
      res.status(400).json({ error: 'A valid rate and shipment lane are required.' });
      return;
    }

    const quoteId = 'FCTL-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const contactName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
    const shipmentData = {
      ...shipment,
      rateMetadata: {
        source: quote.source || 'FCTL Customer Portal',
        isEstimate: Boolean(quote.isEstimate),
        requestedBy: user.email
      }
    };

    const result = await db.queryWithUser(
      `INSERT INTO public.quotes (
        id, status, contact_name, contact_email,
        quote_total, quote_linehaul, quote_rate_per_mile, quote_truck_type,
        quote_transit_time, quote_rate_calculation_id, quote_accessorials,
        quote_accessorials_total, shipment_data, submitted_at, n8n_webhook_sent
      ) VALUES (
        $1, 'pending', $2, $3,
        $4, $5, $6, $7,
        $8, $9, $10, $11, $12, NOW(), FALSE
      ) RETURNING *`,
      [
        quoteId,
        contactName,
        user.email,
        total,
        quote.linehaul == null ? null : Number(quote.linehaul),
        quote.ratePerMile == null ? null : Number(quote.ratePerMile),
        quote.truckType || null,
        quote.transitTime == null ? null : Number(quote.transitTime),
        'PORTAL-' + quoteId,
        JSON.stringify([]),
        0,
        JSON.stringify(shipmentData)
      ],
      user.id
    );

    res.status(201).json(mapQuote(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

export default router;
