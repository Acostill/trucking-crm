# Phase 1 production checklist

Complete this checklist before First Class Trucking depends on the CRM for daily quote operations.

## Database and release

- [ ] Create separate Neon databases or branches for `development`, `staging`, and `production`.
- [ ] Set `DATABASE_ENVIRONMENT=production` only on the Render production service.
- [ ] Keep local and staging `DATABASE_URL` values pointed at non-production databases.
- [ ] Run `npm run db:migrate:phase1-hardening` against each environment before deploying the matching application build.
- [ ] Confirm the migration reports the expected stored `database_environment` value.
- [ ] Confirm automated backups or point-in-time recovery are enabled with the database provider.
- [ ] Perform and document one restore test; a backup is not verified until it can be restored.
- [ ] Record the restore owner, escalation contact, retention window, and last restore-test date.

## Render API

- [ ] Set `PUBLIC_APP_URL` to the customer-facing CRM origin.
- [ ] Set `DAT_WORKER_ENABLED=true`, `DAT_WORKER_SECRET`, and `DAT_WORKER_STALE_MS=90000`.
- [ ] Keep `/api/health` configured as the Render health-check path.
- [ ] Confirm `/api/health` returns HTTP 200 after deployment.
- [ ] Confirm an anonymous request to `/api/loads` returns HTTP 401.
- [ ] Confirm an anonymous request to `/api/quotes` returns HTTP 401.

## Gmail and DAT

- [ ] Confirm the dashboard reports the Gmail mailbox connected and shows a recent successful check.
- [ ] Confirm the dashboard reports a live DAT worker heartbeat.
- [ ] Stop the Railway worker and confirm the CRM reports it offline after 90 seconds.
- [ ] Restore the worker and confirm the alert clears automatically.
- [ ] Use a test quote to confirm DAT results remain labeled as market intelligence, not bookable carrier bids.

## Quote-to-load integrity

- [ ] Submit a public test quote and open its tokenized quote link.
- [ ] Approve the test quote twice and confirm only one load exists.
- [ ] Force a load-insert failure in staging and confirm the quote remains pending.
- [ ] Confirm the created load contains `source_quote_id` matching the quote.

## Finance preview

- [ ] Confirm the Finance page displays the demo-only warning above every metric.
- [ ] Do not use the preview for invoices, carrier pay, commissions, or financial reporting.
