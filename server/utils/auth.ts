import { NextFunction, Request, Response } from 'express';
import db from '../db';

const SESSION_COOKIE = 'session_token';

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  permissions: string[];
}

function stringArray(value: any): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export async function getAuthenticatedUserFromRequest(
  req: Request
): Promise<AuthenticatedUser | null> {
  const attached = (req as any).user as AuthenticatedUser | undefined;
  if (attached && attached.id && Array.isArray(attached.permissions)) {
    return attached;
  }

  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token) return null;

  const result = await db.query(
    `SELECT u.id, u.email, u.first_name, u.last_name,
            COALESCE(array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles,
            COALESCE(array_agg(DISTINCT p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS permissions
     FROM public.sessions s
     JOIN public.users u ON u.id = s.user_id
     LEFT JOIN public.user_roles ur ON ur.user_id = u.id
     LEFT JOIN public.roles r ON r.id = ur.role_id
     LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
     LEFT JOIN public.permissions p ON p.id = rp.permission_id
     WHERE s.session_token = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND u.is_active = TRUE
     GROUP BY u.id`,
    [token]
  );
  if (!result.rows.length) return null;

  const row = result.rows[0];
  const user: AuthenticatedUser = {
    id: row.id,
    email: row.email,
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    roles: stringArray(row.roles),
    permissions: stringArray(row.permissions)
  };
  (req as any).user = user;
  return user;
}

export function userHasPermission(
  user: Pick<AuthenticatedUser, 'permissions'> | null,
  permission: string
): boolean {
  return Boolean(user && user.permissions.indexOf(permission) > -1);
}

export function requirePermission(permission: string) {
  return async function(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await getAuthenticatedUserFromRequest(req);
      if (!user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      if (!userHasPermission(user, permission)) {
        res.status(403).json({ error: `Permission required: ${permission}` });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAnyRole(allowedRoles: string[]) {
  return async function(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await getAuthenticatedUserFromRequest(req);
      if (!user) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const allowed = user.roles.some(function(role) {
        return allowedRoles.indexOf(role) > -1;
      });
      if (!allowed) {
        res.status(403).json({ error: 'Operations access required' });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Get user ID from request (from session cookie or req.user)
export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  try {
    const user = await getAuthenticatedUserFromRequest(req);
    return user ? user.id : null;
  } catch (err) {
    console.error('Error getting user ID from session:', err);
    return null;
  }
}
