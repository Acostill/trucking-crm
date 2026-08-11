BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('quote_approver', 'Review and approve email-sourced freight quotes', FALSE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN ('quotes.read', 'quotes.create', 'quotes.manage')
WHERE r.name = 'quote_approver'
ON CONFLICT DO NOTHING;

COMMIT;
