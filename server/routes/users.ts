import express, { Request, Response, NextFunction } from 'express';
import db from '../db';

const router = express.Router();
const SESSION_COOKIE = 'session_token';

function mapUserRow(row: any) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    isActive: row.is_active,
    roles: Array.isArray(row.roles) ? row.roles : []
  };
}

async function fetchUserSummary(userId: string) {
  const result = await db.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.is_active,
            COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
     FROM public.users u
     LEFT JOIN public.user_roles ur ON ur.user_id = u.id
     LEFT JOIN public.roles r ON r.id = ur.role_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [userId]
  );
  if (!result.rows.length) return null;
  return mapUserRow(result.rows[0]);
}

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
  return mapUserRow(result.rows[0]);
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

router.get('/', async function(_req: Request, res: Response, next: NextFunction) {
  try {
    const usersResult = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.is_active,
              COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
       FROM public.users u
       LEFT JOIN public.user_roles ur ON ur.user_id = u.id
       LEFT JOIN public.roles r ON r.id = ur.role_id
       GROUP BY u.id
       ORDER BY LOWER(u.email)`
    );
    const rolesResult = await db.query(
      'SELECT id, name, description FROM public.roles ORDER BY name'
    );
    res.json({
      users: usersResult.rows.map(mapUserRow),
      roles: rolesResult.rows
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:userId/roles', async function(req: Request, res: Response, next: NextFunction) {
  const userId = req.params.userId;
  const requestedRoles = (req.body && (req.body as any).roles) as string[] | undefined;
  if (!Array.isArray(requestedRoles)) {
    res.status(400).json({ error: 'roles array is required' });
    return;
  }

  const normalized = requestedRoles
    .map(function(role) { return String(role || '').trim().toLowerCase(); })
    .filter(Boolean);
  const uniqueNormalized = Array.from(new Set(normalized));

  try {
    const userExists = await db.query('SELECT id FROM public.users WHERE id = $1', [userId]);
    if (!userExists.rows.length) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (uniqueNormalized.indexOf('admin') === -1) {
      const adminCount = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM public.user_roles ur
         JOIN public.roles r ON r.id = ur.role_id
         WHERE r.name = 'admin' AND ur.user_id <> $1`,
        [userId]
      );
      const remainingAdmins = adminCount.rows.length ? Number(adminCount.rows[0].count) : 0;
      if (remainingAdmins === 0) {
        res.status(400).json({ error: 'At least one admin user is required' });
        return;
      }
    }

    const validRolesRes = uniqueNormalized.length
      ? await db.query(
        'SELECT id, name FROM public.roles WHERE LOWER(name) = ANY($1::text[])',
        [uniqueNormalized]
      )
      : { rows: [] as any[] };

    if (uniqueNormalized.length && validRolesRes.rows.length !== uniqueNormalized.length) {
      res.status(400).json({ error: 'One or more roles are invalid' });
      return;
    }

    const adminUser = (req as any).user;
    const adminUserId = adminUser?.id || null;
    
    await db.transactionWithUser(async function(client) {
      await client.query('DELETE FROM public.user_roles WHERE user_id = $1', [userId]);
      if (validRolesRes.rows.length) {
        const params: any[] = [userId];
        const values = validRolesRes.rows.map(function(role, idx) {
          params.push(role.id);
          return '($1, $' + (idx + 2) + ')';
        });
        await client.query(
          'INSERT INTO public.user_roles (user_id, role_id) VALUES ' + values.join(','),
          params
        );
      }
    }, adminUserId);

    const updatedUser = await fetchUserSummary(userId);
    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
});

export default router;

