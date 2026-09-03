import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../db';
import { getAuthenticatedUserFromRequest } from '../utils/auth';

const router = express.Router();
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

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionUser = await getAuthenticatedUserFromRequest(req);
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

function normalizeRequestedRoles(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return Array.from(new Set(value
    .map(function(role) { return String(role || '').trim().toLowerCase(); })
    .filter(Boolean)));
}

function validEmail(value: string): boolean {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function fetchValidRoles(roleNames: string[]) {
  if (!roleNames.length) return [];
  const result = await db.query(
    'SELECT id, name FROM public.roles WHERE LOWER(name) = ANY($1::text[])',
    [roleNames]
  );
  return result.rows;
}

function generatedTemporaryPassword(): string {
  return crypto.randomBytes(18).toString('base64url');
}

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

router.post('/', async function(req: Request, res: Response, next: NextFunction) {
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const requestedRoles = normalizeRequestedRoles(
    body.roles === undefined ? ['agent', 'quote_approver'] : body.roles
  );
  const suppliedPassword = String(body.password || '');

  if (!validEmail(email)) {
    res.status(400).json({ error: 'A valid email address is required' });
    return;
  }
  if (firstName.length > 100 || lastName.length > 100) {
    res.status(400).json({ error: 'First and last names must be 100 characters or fewer' });
    return;
  }
  if (requestedRoles === null || requestedRoles.length === 0) {
    res.status(400).json({ error: 'At least one role is required' });
    return;
  }
  if (suppliedPassword && suppliedPassword.length < 12) {
    res.status(400).json({ error: 'Temporary password must be at least 12 characters' });
    return;
  }

  try {
    const validRoles = await fetchValidRoles(requestedRoles);
    if (validRoles.length !== requestedRoles.length) {
      res.status(400).json({ error: 'One or more roles are invalid' });
      return;
    }

    const temporaryPassword = suppliedPassword || generatedTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const adminUserId = (req as any).user.id;
    const createdUserId = await db.transactionWithUser(async function(client) {
      const existing = await client.query(
        'SELECT id FROM public.users WHERE LOWER(email::text) = LOWER($1) LIMIT 1',
        [email]
      );
      if (existing.rows.length) {
        const duplicate: any = new Error('A user with this email already exists');
        duplicate.status = 409;
        throw duplicate;
      }

      const created = await client.query(
        `INSERT INTO public.users (email, password_hash, first_name, last_name, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id`,
        [email, passwordHash, firstName || null, lastName || null]
      );
      const userId = created.rows[0].id;
      const params: any[] = [userId];
      const values = validRoles.map(function(role, idx) {
        params.push(role.id);
        return '($1, $' + (idx + 2) + ')';
      });
      await client.query(
        'INSERT INTO public.user_roles (user_id, role_id) VALUES ' + values.join(','),
        params
      );
      return userId;
    }, adminUserId);

    const createdUser = await fetchUserSummary(createdUserId);
    res.status(201).json({
      user: createdUser,
      temporaryPassword: suppliedPassword ? undefined : temporaryPassword
    });
  } catch (err: any) {
    if (err && (err.status === 409 || err.code === '23505')) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }
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

  const uniqueNormalized = normalizeRequestedRoles(requestedRoles) || [];

  try {
    const validRolesRes = { rows: await fetchValidRoles(uniqueNormalized) };

    if (uniqueNormalized.length && validRolesRes.rows.length !== uniqueNormalized.length) {
      res.status(400).json({ error: 'One or more roles are invalid' });
      return;
    }

    const adminUser = (req as any).user;
    const adminUserId = adminUser?.id || null;
    
    await db.transactionWithUser(async function(client) {
      await client.query('SELECT pg_advisory_xact_lock($1)', [947201]);
      const target = await client.query(
        `SELECT u.id, u.is_active,
                EXISTS (
                  SELECT 1 FROM public.user_roles ur
                  JOIN public.roles r ON r.id = ur.role_id
                  WHERE ur.user_id = u.id AND r.name = 'admin'
                ) AS is_admin
         FROM public.users u
         WHERE u.id = $1
         FOR UPDATE`,
        [userId]
      );
      if (!target.rows.length) {
        const missing: any = new Error('User not found');
        missing.status = 404;
        throw missing;
      }

      if (target.rows[0].is_admin && target.rows[0].is_active && uniqueNormalized.indexOf('admin') === -1) {
        const activeAdmins = await client.query(
          `SELECT u.id
           FROM public.users u
           JOIN public.user_roles ur ON ur.user_id = u.id
           JOIN public.roles r ON r.id = ur.role_id
           WHERE r.name = 'admin' AND u.is_active = TRUE
           FOR UPDATE`
        );
        if (activeAdmins.rows.length <= 1) {
          const lastAdmin: any = new Error('At least one active admin user is required');
          lastAdmin.status = 400;
          throw lastAdmin;
        }
      }

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
  } catch (err: any) {
    if (err && (err.status === 400 || err.status === 404)) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.put('/:userId/status', async function(req: Request, res: Response, next: NextFunction) {
  const userId = req.params.userId;
  const isActive = req.body && (req.body as any).isActive;
  if (typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'isActive must be true or false' });
    return;
  }

  try {
    const adminUserId = (req as any).user.id;
    await db.transactionWithUser(async function(client) {
      await client.query('SELECT pg_advisory_xact_lock($1)', [947201]);
      const target = await client.query(
        `SELECT u.id, u.is_active,
                EXISTS (
                  SELECT 1 FROM public.user_roles ur
                  JOIN public.roles r ON r.id = ur.role_id
                  WHERE ur.user_id = u.id AND r.name = 'admin'
                ) AS is_admin
         FROM public.users u
         WHERE u.id = $1
         FOR UPDATE`,
        [userId]
      );
      if (!target.rows.length) {
        const missing: any = new Error('User not found');
        missing.status = 404;
        throw missing;
      }

      if (!isActive && target.rows[0].is_admin && target.rows[0].is_active) {
        const activeAdmins = await client.query(
          `SELECT u.id
           FROM public.users u
           JOIN public.user_roles ur ON ur.user_id = u.id
           JOIN public.roles r ON r.id = ur.role_id
           WHERE r.name = 'admin' AND u.is_active = TRUE
           FOR UPDATE`
        );
        if (activeAdmins.rows.length <= 1) {
          const lastAdmin: any = new Error('The last active admin cannot be disabled');
          lastAdmin.status = 400;
          throw lastAdmin;
        }
      }

      await client.query(
        'UPDATE public.users SET is_active = $1, updated_at = NOW() WHERE id = $2',
        [isActive, userId]
      );
      if (!isActive) {
        await client.query(
          'UPDATE public.sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
          [userId]
        );
      }
    }, adminUserId);

    res.json({ user: await fetchUserSummary(userId) });
  } catch (err: any) {
    if (err && (err.status === 400 || err.status === 404)) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.put('/:userId/password', async function(req: Request, res: Response, next: NextFunction) {
  const userId = req.params.userId;
  const suppliedPassword = String((req.body && (req.body as any).password) || '');
  if (suppliedPassword && suppliedPassword.length < 12) {
    res.status(400).json({ error: 'Temporary password must be at least 12 characters' });
    return;
  }

  try {
    const temporaryPassword = suppliedPassword || generatedTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const adminUserId = (req as any).user.id;
    const result = await db.transactionWithUser(async function(client) {
      const updated = await client.query(
        `UPDATE public.users
         SET password_hash = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id`,
        [passwordHash, userId]
      );
      if (!updated.rows.length) return false;
      await client.query(
        'UPDATE public.sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId]
      );
      return true;
    }, adminUserId);

    if (!result) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      success: true,
      temporaryPassword: suppliedPassword ? undefined : temporaryPassword
    });
  } catch (err) {
    next(err);
  }
});

export default router;
