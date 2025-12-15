import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../db';

const router = express.Router();

const SESSION_COOKIE = 'session_token';
const SESSION_TTL_DAYS = 30;

function makeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: false, // set true behind https in prod
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  };
}

async function findUserByEmail(email: string) {
  const result = await db.query(
    'SELECT id, email, password_hash, first_name, last_name, is_active FROM public.users WHERE email = $1',
    [email]
  );
  return result.rows[0];
}

async function createUser(email: string, password: string, firstName?: string | null, lastName?: string | null) {
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const result = await db.query(
    'INSERT INTO public.users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name, is_active',
    [email, passwordHash, firstName || null, lastName || null]
  );
  return result.rows[0];
}

async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    'INSERT INTO public.sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expiresAt]
  );
  return { token, expiresAt };
}

async function getUserFromToken(token: string | undefined) {
  if (!token) return null;
  const result = await db.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.is_active
     FROM public.sessions s
     JOIN public.users u ON u.id = s.user_id
     WHERE s.session_token = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [token]
  );
  return result.rows[0] || null;
}

async function revokeSession(token: string | undefined) {
  if (!token) return;
  await db.query('UPDATE public.sessions SET revoked_at = NOW() WHERE session_token = $1', [token]);
}

router.get('/me', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies && req.cookies[SESSION_COOKIE];
    const user = await getUserFromToken(token);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const rolesRes = await db.query(
      `SELECT r.name FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [user.id]
    );
    const roles = rolesRes.rows.map(function(r){ return r.name; });
    res.json({ user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, roles } });
  } catch (err) {
    next(err);
  }
});

router.post('/signup', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const firstName = body.firstName ? String(body.firstName) : null;
    const lastName = body.lastName ? String(body.lastName) : null;

    if (!email || !password || password.length < 8) {
      return res.status(400).json({ error: 'Email and password (min 8 chars) are required' });
    }
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    const user = await createUser(email, password, firstName, lastName);
    const session = await createSession(user.id);
    res.cookie(SESSION_COOKIE, session.token, makeCookieOptions());
    res.status(201).json({ user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, roles: [] } });
  } catch (err) {
    next(err);
  }
});

router.post('/signin', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = await findUserByEmail(email);
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.is_active) return res.status(403).json({ error: 'Account disabled' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    await db.query('UPDATE public.users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    const rolesRes = await db.query(
      `SELECT r.name
       FROM public.user_roles ur
       JOIN public.roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [user.id]
    );
    const roles = rolesRes.rows.map(function(row) { return row.name; });
    const session = await createSession(user.id);
    res.cookie(SESSION_COOKIE, session.token, makeCookieOptions());
    res.json({ user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, roles } });
  } catch (err) {
    next(err);
  }
});

router.post('/signout', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies && req.cookies[SESSION_COOKIE];
    await revokeSession(token);
    res.clearCookie(SESSION_COOKIE, makeCookieOptions());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;

