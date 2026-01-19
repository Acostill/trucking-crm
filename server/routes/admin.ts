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

