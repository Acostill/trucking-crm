import express, { Request, Response, NextFunction } from 'express';
import db from '../db';
import {
  ForwardAirCredentials,
  getForwardAirConnectionStatus,
  saveForwardAirCredentials
} from '../services/carrierConnectionCredentials';
import { listExpediteRateRules } from '../services/expediteRateTable';
import { getPricingSettings, updatePricingSettings } from '../services/pricingSettings';

const router = express.Router();
const SESSION_COOKIE = 'session_token';

async function getSessionUser(req: Request) {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token) return null;
  const result = await db.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.is_active,
            COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
     FROM public.sessions s
     JOIN public.users u ON u.id = s.user_id
     LEFT JOIN public.user_roles ur ON ur.user_id = u.id
     LEFT JOIN public.roles r ON r.id = ur.role_id
     WHERE s.session_token = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
     GROUP BY u.id`,
    [token]
  );
  if (!result.rows.length) return null;
  return {
    id: result.rows[0].id,
    email: result.rows[0].email,
    firstName: result.rows[0].first_name,
    lastName: result.rows[0].last_name,
    isActive: result.rows[0].is_active,
    roles: Array.isArray(result.rows[0].roles) ? result.rows[0].roles : []
  };
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const roles = sessionUser.roles || [];
    if (roles.indexOf('admin') === -1) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    (req as any).user = sessionUser;
    next();
  } catch (err) {
    next(err);
  }
}

router.use(requireAdmin);

function cleanCredential(value: unknown, field: string): string {
  const cleaned = String(value || '').trim();
  if (!cleaned || cleaned.length > 300 || /[\r\n]/.test(cleaned)) {
    throw new Error(`${field} is required and must be 300 characters or fewer.`);
  }
  return cleaned;
}

router.get('/carrier-connections/forward-air', async function(_req: Request, res: Response, next: NextFunction) {
  try {
    // Deliberately never return credential values to the browser.
    res.setHeader('Cache-Control', 'no-store');
    res.json(await getForwardAirConnectionStatus());
  } catch (err) {
    next(err);
  }
});

router.put('/carrier-connections/forward-air', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};
    const credentials: ForwardAirCredentials = {
      username: cleanCredential(body.username, 'Username'),
      password: cleanCredential(body.password, 'Password'),
      customerId: cleanCredential(body.customerId, 'Customer ID'),
      billToCustomerNumber: cleanCredential(body.billToCustomerNumber, 'Bill-to customer number'),
      shipperCustomerNumber: cleanCredential(body.shipperCustomerNumber, 'Shipper customer number')
    };
    await saveForwardAirCredentials(credentials, (req as any).user.id);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ saved: true, message: 'Forward Air production credentials saved securely.' });
  } catch (err: any) {
    if (err && typeof err.message === 'string' && /(required|Carrier credential storage)/.test(err.message)) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// Get a profit margin rule by ID (default row used for future margins)
router.get('/profit-margin/:id', async function(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid profit margin rule id' });
    return;
  }
  try {
    const result = await db.query(
      `SELECT id, margin_pct
       FROM public.profit_margin_rules
       WHERE id = $1`,
      [id]
    );
    if (!result.rows.length) {
      res.status(404).json({ error: 'Profit margin rule not found' });
      return;
    }
    res.json({
      id: result.rows[0].id,
      marginPct: result.rows[0].margin_pct
    });
  } catch (err) {
    next(err);
  }
});

// Update a profit margin rule by ID
router.put('/profit-margin/:id', async function(req: Request, res: Response, next: NextFunction) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid profit margin rule id' });
    return;
  }
  const marginPct = req.body && req.body.marginPct;
  const parsedPct = typeof marginPct === 'string' ? parseFloat(marginPct) : marginPct;
  if (typeof parsedPct !== 'number' || Number.isNaN(parsedPct)) {
    res.status(400).json({ error: 'marginPct must be a number' });
    return;
  }
  if (parsedPct < 0 || parsedPct > 100) {
    res.status(400).json({ error: 'marginPct must be between 0 and 100' });
    return;
  }
  try {
    const userId = (req as any).user && (req as any).user.id;
    const result = await db.queryWithUser(
      `UPDATE public.profit_margin_rules
       SET margin_pct = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, margin_pct`,
      [parsedPct, id],
      userId
    );
    if (!result.rows.length) {
      res.status(404).json({ error: 'Profit margin rule not found' });
      return;
    }
    res.json({
      id: result.rows[0].id,
      marginPct: result.rows[0].margin_pct
    });
  } catch (err) {
    next(err);
  }
});

// Expedite buy-rate table: what First Class expects to pay per loaded mile
// for each vehicle, used to quote expedite loads without asking a carrier.
const EXPEDITE_VEHICLE_TYPES = [
  'Cargo Van', 'Box Truck', 'Straight Truck',
  'Reefer Cargo Van', 'Reefer Box Truck', 'Reefer Straight Truck'
];

router.get('/pricing-settings', async function(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getPricingSettings());
  } catch (err) {
    next(err);
  }
});

router.put('/pricing-settings', async function(req: Request, res: Response, next: NextFunction) {
  if (typeof (req.body && req.body.expediteAllBeforeAward) !== 'boolean') {
    res.status(400).json({ error: 'expediteAllBeforeAward must be true or false' });
    return;
  }
  try {
    const userId = (req as any).user && (req as any).user.id;
    res.json(await updatePricingSettings({ expediteAllBeforeAward: req.body.expediteAllBeforeAward }, userId || null));
  } catch (err) {
    next(err);
  }
});

router.get('/expedite-rate-rules', async function(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ vehicleTypes: EXPEDITE_VEHICLE_TYPES, rules: await listExpediteRateRules() });
  } catch (err) {
    next(err);
  }
});

router.put('/expedite-rate-rules/:vehicleType', async function(req: Request, res: Response, next: NextFunction) {
  const vehicleType = String(req.params.vehicleType || '');
  if (EXPEDITE_VEHICLE_TYPES.indexOf(vehicleType) === -1) {
    res.status(400).json({ error: 'Unknown expedite vehicle type' });
    return;
  }
  const ratePerMile = Number(req.body && req.body.ratePerMile);
  const minimumCharge = Number(req.body && req.body.minimumCharge != null ? req.body.minimumCharge : 0);
  if (!Number.isFinite(ratePerMile) || ratePerMile <= 0 || ratePerMile > 50) {
    res.status(400).json({ error: 'ratePerMile must be between 0 and 50' });
    return;
  }
  if (!Number.isFinite(minimumCharge) || minimumCharge < 0 || minimumCharge > 100000) {
    res.status(400).json({ error: 'minimumCharge must be 0 or more' });
    return;
  }
  const isActive = !(req.body && req.body.isActive === false);
  const notes = req.body && req.body.notes ? String(req.body.notes).slice(0, 1000) : null;
  try {
    const userId = (req as any).user && (req as any).user.id;
    await db.queryWithUser(
      `INSERT INTO public.expedite_rate_rules (vehicle_type, rate_per_mile, minimum_charge, is_active, notes, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (vehicle_type) DO UPDATE SET
         rate_per_mile = EXCLUDED.rate_per_mile,
         minimum_charge = EXCLUDED.minimum_charge,
         is_active = EXCLUDED.is_active,
         notes = EXCLUDED.notes,
         updated_by = EXCLUDED.updated_by`,
      [vehicleType, ratePerMile, minimumCharge, isActive, notes, userId || null],
      userId
    );
    res.json({ vehicleTypes: EXPEDITE_VEHICLE_TYPES, rules: await listExpediteRateRules() });
  } catch (err) {
    next(err);
  }
});

// List all available audit tables
router.get('/audit/tables', async function(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await db.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'audit'
         AND table_name LIKE '%_audit'
       ORDER BY table_name`
    );
    res.json({
      tables: result.rows.map((row: any) => row.table_name)
    });
  } catch (err) {
    next(err);
  }
});

// Get audit records from a specific table
router.get('/audit/:tableName', async function(req: Request, res: Response, next: NextFunction) {
  const tableName = req.params.tableName;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = (page - 1) * limit;

  // Validate table name to prevent SQL injection
  if (!/^[a-z_]+_audit$/.test(tableName)) {
    res.status(400).json({ error: 'Invalid table name' });
    return;
  }

  try {
    // Check if table exists and get whitelisted table name
    const tableExists = await db.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'audit' AND table_name = $1`,
      [tableName]
    );
    if (!tableExists.rows.length) {
      res.status(404).json({ error: 'Audit table not found' });
      return;
    }
    
    // Use the validated table name from the database (whitelist approach)
    const validatedTableName = tableExists.rows[0].table_name;
    
    // Get total count - using validated table name from database
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM audit."${validatedTableName.replace(/"/g, '""')}"`
    );
    const total = countResult.rows[0]?.total || 0;

    // Get paginated records - using validated table name from database
    // Join with users table to get email for audit_user_id
    const recordsResult = await db.query(
      `SELECT 
         a.*,
         u.email AS audit_user_email
       FROM audit."${validatedTableName.replace(/"/g, '""')}" a
       LEFT JOIN public.users u ON u.id = a.audit_user_id
       ORDER BY a.audit_timestamp DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      table: tableName,
      records: recordsResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
