# First Class Trucking automation runbook

## Purpose and scope

Operate the First Class Trucking virtual employee for two read-only DAT workflows: RateView lane benchmarks and Search Loads direct-rate research. Search Loads returns at most ten highest numeric total Rates with approved non-contact fields and optional safe comments. The worker never books, contacts, calls, bids, messages, posts, saves, exports, purchases, or changes the DAT account.

## Prerequisites and access

- A Render backend with `DAT_WORKER_ENABLED=true` and `DAT_WORKER_SECRET` configured.
- A Railway DAT worker using the same `DAT_WORKER_SECRET` and a persistent volume mounted at `/data`.
- An authenticated DAT session in the worker's dedicated persistent browser profile.
- A CRM user with the quote approver role.

## Configuration and secret setup

Keep secrets in Render/Railway variables. For local recovery, use the ignored repository-level `.local-secrets/first-class-dat-worker.env` or set `DAT_ENV_FILE` to an absolute external file. Never expose the worker secret through the React client or a `REACT_APP_*` variable. Required worker values are documented in `automation/configuration.example.env`.

## Start, stop, and normal operation

Railway normally runs with `DAT_SERVICE_MODE=worker`. Its `/health` endpoint must report the worker process healthy. For authentication recovery, temporarily set `DAT_SERVICE_MODE=auth`, configure the temporary eight-character VNC password, deploy, sign in through the protected remote desktop, then restore `DAT_SERVICE_MODE=worker`, remove or rotate the VNC password, and redeploy. To stop all new DAT work immediately, set `DAT_WORKER_ENABLED=false` on Render.

## Human approvals and takeover

Saving a complete shipment does not submit a DAT search. A signed-in quote approver must click the RateView or Search Loads approval button for the exact saved snapshot. Search Loads consumes that approval for one submission. Authentication, CAPTCHA, and MFA are always completed by a human. An `uncertain` job requires human reconciliation and must not be reapproved automatically.

## Outputs and completion checks

The Quote Inbox polls while a DAT job is pending or running. RateView produces nonselectable Spot and Contract benchmark cards. Search Loads produces a nonselectable table with the direct-result count, eligible/excluded accounting, accepted criteria, and up to ten ranked rows. A successful worker completion and CRM write changes the corresponding option status to `completed`.

## Retry, resume, and duplicate prevention

The local ledger and server job fingerprint prevent duplicate submissions. A completed fingerprint reuses its stored result. A pre-submit failure can be retried with a new explicit approval after the issue is corrected. A post-submit extraction failure is `uncertain`; do not retry it until a human confirms the original DAT search outcome and resolves the job.

## Failure artifacts and troubleshooting

Use worker health output and safe structured logs, which contain IDs, step names, statuses, durations, and error categories but not credentials or authentication state. `needs_auth` means the dedicated DAT session must be restored. `RESULT_SCOPE_UNVERIFIED` means the displayed direct-result count did not match unique collected direct row IDs. Result screenshots are intentionally not retained because they can contain confidential rates and contact data.

## Disablement, rollback, and escalation

Disable by setting `DAT_WORKER_ENABLED=false` on Render. Stop the Railway worker for a full halt. Keep existing completed CRM results intact. Escalate repeated login challenges, DAT UI changes, account conflicts, or any request for a prohibited action to the Optimation AI operating owner and First Class Trucking approver; do not bypass DAT controls.

## Data retention

Safe run metadata and the local ledger are retained in `DAT_RUNTIME_DIR`. Redacted pre-submit evidence and logs are pruned after `DAT_RETENTION_DAYS` (30 by default). Browser profiles and authentication state remain on the dedicated persistent volume and are never copied into the client package or source control.
