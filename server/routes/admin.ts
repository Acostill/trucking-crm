import express, { Request, Response, NextFunction } from 'express';
import db from '../db';

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

