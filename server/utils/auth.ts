import { Request } from 'express';
import db from '../db';

const SESSION_COOKIE = 'session_token';

// Get user ID from request (from session cookie or req.user)
export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  // First check if user is already attached to request (from middleware)
  if ((req as any).user?.id) {
    return (req as any).user.id;
  }

  // Otherwise, try to get from session cookie
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  try {
    const result = await db.query(
      `SELECT user_id
       FROM public.sessions
       WHERE session_token = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()`,
      [token]
    );
    return result.rows[0]?.user_id || null;
  } catch (err) {
    console.error('Error getting user ID from session:', err);
    return null;
  }
}

