import express, { Request, Response, NextFunction } from 'express';
import db from '../db';

const router = express.Router();

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

// Helper to get quote by ID from database
async function getQuoteById(id: string): Promise<any | null> {
  try {
    const result = await db.query(
      'SELECT * FROM public.quotes WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return rowToQuote(result.rows[0]);
  } catch (err) {
    console.error('Error fetching quote from database:', err);
    throw err;
  }
}

// Helper to save quote to database
async function saveQuote(quoteData: any): Promise<any> {
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
      shipment_data, submitted_at, quote_url, n8n_webhook_sent
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      contact_name = EXCLUDED.contact_name,
      contact_email = EXCLUDED.contact_email,
      contact_phone = EXCLUDED.contact_phone,
      quote_total = EXCLUDED.quote_total,
      quote_linehaul = EXCLUDED.quote_linehaul,
      quote_rate_per_mile = EXCLUDED.quote_rate_per_mile,
      quote_truck_type = EXCLUDED.quote_truck_type,
      quote_transit_time = EXCLUDED.quote_transit_time,
      quote_rate_calculation_id = EXCLUDED.quote_rate_calculation_id,
      quote_accessorials = EXCLUDED.quote_accessorials,
      quote_accessorials_total = EXCLUDED.quote_accessorials_total,
      shipment_data = EXCLUDED.shipment_data,
      quote_url = EXCLUDED.quote_url,
      n8n_webhook_sent = EXCLUDED.n8n_webhook_sent,
      updated_at = NOW()
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
    n8nWebhookSent
  ];

  try {
    const result = await db.query(insertSql, params);
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

    const quote = await getQuoteById(id);
    
    if (!quote) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    res.json(quote);
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

    const quote = await getQuoteById(id);
    
    if (!quote) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    // Update quote status in database
    const updateSql = `
      UPDATE public.quotes
      SET 
        status = 'approved',
        approved_at = NOW(),
        approved_by = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const userId = (req as any).user?.id || null;
    const result = await db.query(updateSql, [id, userId]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    const updated = rowToQuote(result.rows[0]);
    res.json(updated);
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

    const quote = await getQuoteById(id);
    
    if (!quote) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    // Update quote status in database
    const updateSql = `
      UPDATE public.quotes
      SET 
        status = 'rejected',
        rejected_at = NOW(),
        rejected_by = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const userId = (req as any).user?.id || null;
    const result = await db.query(updateSql, [id, userId]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    const updated = rowToQuote(result.rows[0]);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/quotes - Create a new quote (for storing quotes from webhook)
router.post('/', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const quoteData = req.body || {};
    
    // Generate a unique ID if not provided
    const id = quoteData.id || `quote-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const quote = {
      id: id,
      ...quoteData,
      status: quoteData.status || 'pending',
      submittedAt: quoteData.submittedAt || new Date().toISOString(),
      quoteUrl: quoteData.quoteUrl || (quoteData.quote_url || null),
      n8nWebhookSent: quoteData.n8nWebhookSent || false
    };

    const saved = await saveQuote(quote);

    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

// GET /api/quotes - List all quotes (optional: for admin/management)
router.get('/', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
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

