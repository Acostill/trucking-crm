import assert from 'assert';
import http from 'http';
import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import db from '../db';
import usersRouter from '../routes/users';

type TestUser = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  password_hash: string;
  roles: string[];
};

function userRow(user: TestUser) {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    is_active: user.is_active,
    password_hash: user.password_hash,
    roles: user.roles.slice()
  };
}

async function main() {
  const originalQuery = db.query;
  const originalTransaction = db.transactionWithUser;
  const users = new Map<string, TestUser>([
    ['admin-1', {
      id: 'admin-1',
      email: 'admin@example.com',
      first_name: 'Admin',
      last_name: 'User',
      is_active: true,
      password_hash: 'existing',
      roles: ['admin']
    }],
    ['staff-1', {
      id: 'staff-1',
      email: 'staff@example.com',
      first_name: 'Staff',
      last_name: 'User',
      is_active: true,
      password_hash: 'existing',
      roles: ['agent', 'quote_approver']
    }]
  ]);
  const roles = [
    { id: 'role-admin', name: 'admin', description: 'Admin' },
    { id: 'role-agent', name: 'agent', description: 'Agent' },
    { id: 'role-approver', name: 'quote_approver', description: 'Quote approver' },
    { id: 'role-viewer', name: 'viewer', description: 'Viewer' }
  ];
  const revokedUsers: string[] = [];
  let nextUser = 2;

  function roleNameForId(id: string): string {
    const role = roles.find(function(item) { return item.id === id; });
    if (!role) throw new Error(`Unknown role id in test: ${id}`);
    return role.name;
  }

  (db as any).query = async function(sql: string, params: any[] = []) {
    if (sql.indexOf('FROM public.sessions s') > -1) {
      const token = params[0];
      const sessionUser = token === 'admin-token'
        ? users.get('admin-1')
        : token === 'staff-token' ? users.get('staff-1') : null;
      if (!sessionUser || !sessionUser.is_active) return { rows: [] };
      return { rows: [{
        ...userRow(sessionUser),
        permissions: sessionUser.roles.indexOf('admin') > -1 ? ['users.read', 'users.write'] : []
      }] };
    }
    if (sql.indexOf('SELECT id, name FROM public.roles') > -1) {
      const requested = params[0] || [];
      return { rows: roles.filter(function(role) { return requested.indexOf(role.name) > -1; }) };
    }
    if (sql.indexOf('SELECT id, name, description FROM public.roles') > -1) {
      return { rows: roles };
    }
    if (sql.indexOf('WHERE u.id = $1') > -1) {
      const selected = users.get(params[0]);
      return { rows: selected ? [userRow(selected)] : [] };
    }
    if (sql.indexOf('FROM public.users u') > -1) {
      return { rows: Array.from(users.values()).map(userRow) };
    }
    throw new Error(`Unexpected admin test query: ${sql}`);
  };

  (db as any).transactionWithUser = async function(callback: (client: any) => Promise<any>) {
    return callback({
      query: async function(sql: string, params: any[] = []) {
        if (sql.indexOf('pg_advisory_xact_lock') > -1) return { rows: [] };
        if (sql.indexOf('LOWER(email::text)') > -1) {
          const duplicate = Array.from(users.values()).find(function(item) {
            return item.email.toLowerCase() === String(params[0]).toLowerCase();
          });
          return { rows: duplicate ? [{ id: duplicate.id }] : [] };
        }
        if (sql.indexOf('INSERT INTO public.users') > -1) {
          const id = `staff-${nextUser++}`;
          users.set(id, {
            id,
            email: params[0],
            password_hash: params[1],
            first_name: params[2],
            last_name: params[3],
            is_active: true,
            roles: []
          });
          return { rows: [{ id }] };
        }
        if (sql.indexOf('INSERT INTO public.user_roles') > -1) {
          const target = users.get(params[0]);
          if (!target) throw new Error('Role target missing');
          target.roles = params.slice(1).map(roleNameForId);
          return { rows: [] };
        }
        if (sql.indexOf('EXISTS (') > -1 && sql.indexOf('FROM public.users u') > -1) {
          const target = users.get(params[0]);
          return { rows: target ? [{
            id: target.id,
            is_active: target.is_active,
            is_admin: target.roles.indexOf('admin') > -1
          }] : [] };
        }
        if (sql.indexOf("WHERE r.name = 'admin' AND u.is_active = TRUE") > -1) {
          return {
            rows: Array.from(users.values())
              .filter(function(item) { return item.is_active && item.roles.indexOf('admin') > -1; })
              .map(function(item) { return { id: item.id }; })
          };
        }
        if (sql.indexOf('DELETE FROM public.user_roles') > -1) {
          const target = users.get(params[0]);
          if (target) target.roles = [];
          return { rows: [] };
        }
        if (sql.indexOf('SET is_active = $1') > -1) {
          const target = users.get(params[1]);
          if (target) target.is_active = params[0];
          return { rows: target ? [{ id: target.id }] : [] };
        }
        if (sql.indexOf('SET password_hash = $1') > -1) {
          const target = users.get(params[1]);
          if (target) target.password_hash = params[0];
          return { rows: target ? [{ id: target.id }] : [] };
        }
        if (sql.indexOf('UPDATE public.sessions SET revoked_at') > -1) {
          revokedUsers.push(params[0]);
          return { rows: [] };
        }
        throw new Error(`Unexpected admin transaction query: ${sql}`);
      }
    });
  };

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin/users', usersRouter);
  app.use(function(err: any, _req: Request, res: Response, _next: NextFunction) {
    res.status(err.status || 500).json({ error: err.message });
  });

  const server = http.createServer(app);
  try {
    await new Promise<void>(function(resolve) { server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    assert(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}/api/admin/users`;

    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: { cookie: 'session_token=staff-token' } })).status, 403);
    assert.equal((await fetch(base, { headers: { cookie: 'session_token=admin-token' } })).status, 200);

    const createdResponse = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'session_token=admin-token' },
      body: JSON.stringify({
        email: 'new.staff@example.com',
        firstName: 'New',
        lastName: 'Staff',
        roles: ['agent', 'quote_approver']
      })
    });
    assert.equal(createdResponse.status, 201);
    const createdBody: any = await createdResponse.json();
    assert.equal(createdBody.user.email, 'new.staff@example.com');
    assert.deepEqual(createdBody.user.roles.sort(), ['agent', 'quote_approver']);
    assert.equal(typeof createdBody.temporaryPassword, 'string');
    assert(createdBody.temporaryPassword.length >= 12);
    const createdStored = users.get(createdBody.user.id);
    assert(createdStored);
    assert.equal(await bcrypt.compare(createdBody.temporaryPassword, createdStored.password_hash), true);

    const resetResponse = await fetch(`${base}/staff-1/password`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: 'session_token=admin-token' },
      body: JSON.stringify({})
    });
    assert.equal(resetResponse.status, 200);
    const resetBody: any = await resetResponse.json();
    assert(resetBody.temporaryPassword.length >= 12);
    assert.equal(revokedUsers.indexOf('staff-1') > -1, true);

    const disableStaff = await fetch(`${base}/staff-1/status`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: 'session_token=admin-token' },
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(disableStaff.status, 200);
    assert.equal(users.get('staff-1')?.is_active, false);

    const disableLastAdmin = await fetch(`${base}/admin-1/status`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: 'session_token=admin-token' },
      body: JSON.stringify({ isActive: false })
    });
    assert.equal(disableLastAdmin.status, 400);
    assert.equal(users.get('admin-1')?.is_active, true);

    const demoteLastAdmin = await fetch(`${base}/admin-1/roles`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: 'session_token=admin-token' },
      body: JSON.stringify({ roles: ['agent'] })
    });
    assert.equal(demoteLastAdmin.status, 400);
    assert.deepEqual(users.get('admin-1')?.roles, ['admin']);

    console.log('Admin user management checks passed.');
  } finally {
    (db as any).query = originalQuery;
    (db as any).transactionWithUser = originalTransaction;
    if (server.listening) {
      await new Promise<void>(function(resolve, reject) {
        server.close(function(err) { if (err) reject(err); else resolve(); });
      });
    }
    await db.pool.end();
  }
}

main().catch(function(err) {
  console.error(err);
  process.exitCode = 1;
});
