BEGIN;

-- Seed default roles
INSERT INTO public.roles (name, description, is_system)
VALUES
  ('admin',   'Full administrative access', TRUE),
  ('manager', 'Manage users and data for their team', FALSE),
  ('agent',   'Create and manage assigned records', FALSE),
  ('viewer',  'Read-only access', FALSE)
ON CONFLICT (name) DO NOTHING;

-- Seed example permissions (adjust to your app domain)
INSERT INTO public.permissions (key, description)
VALUES
  ('users.read',          'Read user profiles'),
  ('users.write',         'Create or update users'),
  ('users.disable',       'Disable/enable users'),
  ('roles.read',          'Read roles'),
  ('roles.write',         'Create or update roles'),
  ('roles.assign',        'Assign roles to users'),
  ('permissions.read',    'Read permissions'),
  ('permissions.write',   'Create or update permissions'),
  ('quotes.read',         'Read quotes'),
  ('quotes.create',       'Create quotes'),
  ('quotes.manage',       'Manage quotes and pricing')
ON CONFLICT (key) DO NOTHING;

-- Helper CTEs to link role <-> permissions
WITH rp AS (
  SELECT r.id AS role_id, p.id AS permission_id, r.name AS role_name, p.key AS perm_key
  FROM public.roles r CROSS JOIN public.permissions p
)
-- Admin gets all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role_id, permission_id
FROM rp
WHERE role_name = 'admin'
ON CONFLICT DO NOTHING;

-- Manager: user/role read, assign roles, create/manage quotes
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  'users.read', 'roles.read', 'roles.assign', 'quotes.read', 'quotes.create', 'quotes.manage'
)
WHERE r.name = 'manager'
ON CONFLICT DO NOTHING;

-- Agent: create and read quotes
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN ('quotes.read', 'quotes.create')
WHERE r.name = 'agent'
ON CONFLICT DO NOTHING;

-- Viewer: read-only quotes
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN ('quotes.read')
WHERE r.name = 'viewer'
ON CONFLICT DO NOTHING;

COMMIT;


