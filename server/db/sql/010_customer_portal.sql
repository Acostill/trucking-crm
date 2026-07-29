BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('customer', 'Customer portal access for quotes and shipments', TRUE)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_system = TRUE;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN ('quotes.read', 'quotes.create')
WHERE r.name = 'customer'
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM public.users u
CROSS JOIN public.roles r
WHERE r.name = 'customer'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id
  )
ON CONFLICT DO NOTHING;

COMMIT;
