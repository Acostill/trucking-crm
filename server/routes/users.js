var express = require('express');
var router = express.Router();
var db = require('../db');

var SESSION_COOKIE = 'session_token';

function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    isActive: row.is_active,
    roles: Array.isArray(row.roles) ? row.roles : []
  };
}

async function fetchUserSummary(userId) {
  var result = await db.query(
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

async function getSessionUser(req) {
  var token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token) return null;
  var result = await db.query(
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

async function requireAdmin(req, res, next) {
  try {
    var sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    var roles = sessionUser.roles || [];
    if (roles.indexOf('admin') === -1) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    req.user = sessionUser;
    next();
  } catch (err) {
    next(err);
  }
}

router.use(requireAdmin);

router.get('/', async function(_req, res, next) {
  try {
    var usersResult = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.is_active,
              COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
       FROM public.users u
       LEFT JOIN public.user_roles ur ON ur.user_id = u.id
       LEFT JOIN public.roles r ON r.id = ur.role_id
       GROUP BY u.id
       ORDER BY LOWER(u.email)`
    );
    var rolesResult = await db.query(
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

router.put('/:userId/roles', async function(req, res, next) {
  var userId = req.params.userId;
  var requestedRoles = req.body && req.body.roles;
  if (!Array.isArray(requestedRoles)) {
    res.status(400).json({ error: 'roles array is required' });
    return;
  }

  var normalized = requestedRoles
    .map(function(role) { return String(role || '').trim().toLowerCase(); })
    .filter(Boolean);
  var uniqueNormalized = Array.from(new Set(normalized));

  try {
    var userExists = await db.query('SELECT id FROM public.users WHERE id = $1', [userId]);
    if (!userExists.rows.length) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (uniqueNormalized.indexOf('admin') === -1) {
      var adminCount = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM public.user_roles ur
         JOIN public.roles r ON r.id = ur.role_id
         WHERE r.name = 'admin' AND ur.user_id <> $1`,
        [userId]
      );
      var remainingAdmins = adminCount.rows.length ? Number(adminCount.rows[0].count) : 0;
      if (remainingAdmins === 0) {
        res.status(400).json({ error: 'At least one admin user is required' });
        return;
      }
    }

    var validRolesRes = uniqueNormalized.length
      ? await db.query(
        'SELECT id, name FROM public.roles WHERE LOWER(name) = ANY($1::text[])',
        [uniqueNormalized]
      )
      : { rows: [] };

    if (uniqueNormalized.length && validRolesRes.rows.length !== uniqueNormalized.length) {
      res.status(400).json({ error: 'One or more roles are invalid' });
      return;
    }

    await db.query('BEGIN');
    try {
      await db.query('DELETE FROM public.user_roles WHERE user_id = $1', [userId]);
      if (validRolesRes.rows.length) {
        var params = [userId];
        var values = validRolesRes.rows.map(function(role, idx) {
          params.push(role.id);
          return '($1, $' + (idx + 2) + ')';
        });
        await db.query(
          'INSERT INTO public.user_roles (user_id, role_id) VALUES ' + values.join(','),
          params
        );
      }
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }

    var updatedUser = await fetchUserSummary(userId);
    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
