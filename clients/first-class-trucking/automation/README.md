# First Class Trucking DAT virtual employee

This worker performs two explicitly approved, read-only DAT workflows:

- RateView Quick Rate Lookup returns the displayed Spot and Contract market ranges.
- Search Loads returns up to ten direct results ranked by highest numeric total Rate, with approved non-contact row fields and safely available comments.

It does not book, contact, call, bid, message, post, save, export, purchase, delete, or change the DAT account.

## 1. Install

```bash
cd /Users/davidcastillo/trucking-crm/clients/first-class-trucking/automation
npm install
npx playwright install chrome
```

The CLI defaults to a dedicated profile at `/Users/davidcastillo/Library/Application Support/Optimation AI/First Class DAT Profile`. This preserves DAT's “remember this device for 30 days” recognition without exposing authentication state to source control. Local settings are loaded from the ignored repository-level file `.local-secrets/first-class-dat-worker.env`. Set `DAT_ENV_FILE` to another absolute path when needed; Railway uses environment variables directly.

## 2. Initialize or repair authentication

```bash
npm run auth
```

Playwright opens the dedicated visible Chrome profile. The human completes username, password, MFA, or CAPTCHA. The automation never reads or types those values. If DAT reports that the approved shared login is active elsewhere, `DAT_SHARED_SESSION_LOGIN_ANYWAY=1` applies the client's approved “Login Anyway” behavior, which logs out the other DAT device.

## 3. Run one quote

```bash
npm run quote -- \
  --request-id demo-001 \
  --origin "Portland, OR" \
  --destination "Chicago, IL" \
  --equipment Van \
  --approve-search
```

`--approve-search` is the single-use search authorization. Without it, the CLI stops before opening DAT. Equipment must be `Van`, `Flatbed`, or `Reefer`, matching the live UI observed during discovery.

The JSON response includes Spot and Contract low/average/high totals, per-mile values, mileage, timeframes, the displayed market lanes, timestamp, and an explicit null reason when fuel is not displayed.

To demonstrate the completed discovery result without opening DAT or spending another lookup, run:

```bash
npm run demo:stored
```

The ledger recognizes the request and returns the stored result with `"reused": true`.

## 4. Connect the CRM worker

Run the CRM migrations and configure the hosted server first. In Render, set:

```text
DAT_WORKER_ENABLED=true
DAT_WORKER_SECRET=<one long random value>
```

For local operation, copy `configuration.example.env` to the ignored repository-level path `.local-secrets/first-class-dat-worker.env` and set:

```text
DAT_CRM_BASE_URL=https://your-render-backend.example.com
DAT_WORKER_SECRET=<the same long random value>
DAT_WORKER_ID=first-class-dat-mac
```

Never put `DAT_WORKER_SECRET` in `client/.env` or any `REACT_APP_*` variable.
Start the long-running worker on the Mac that owns the dedicated DAT Chrome
profile:

```bash
npm run auth
npm run worker
```

For a connectivity check that claims at most one already-approved CRM job:

```bash
npm run worker:once
```

An operations user authorizes one exact lookup by clicking **Approve & run DAT
lookup** or **Approve DAT Search Loads** in the Quote Inbox. The Search Loads
approval fingerprints the saved origin, destination, equipment, pickup date,
150-mile deadhead radii, Full & Partial load type, and Similar Results off. The
server releases only that approved job to the worker. If the session expired,
the job becomes `needs_auth`; run `npm run auth`, then have the operator approve
the exact lookup again. If DAT may have accepted a search but the result could
not be verified, the job becomes `uncertain` and cannot be automatically
resubmitted.

Search Loads request and result identity values remain `Vans (Standard)`,
`Flatbeds (Standard)`, and `Reefers (Standard)`. The browser layer alone maps
those values to DAT's current selected-chip labels: `Vans (Standard)`,
`Flatbeds`, and `Reefers`.

## 5. Run the worker on Railway

The Railway deployment uses a dedicated Linux browser profile on a persistent
volume mounted at `/data`. It does not copy or depend on the Mac's Chrome
profile. The service has two explicit modes:

- `DAT_SERVICE_MODE=auth` starts a temporary password-protected noVNC page so a
  human can complete the DAT login, MFA, CAPTCHA, and “remember this device”
  flow. The VNC password must be exactly eight characters.
- `DAT_SERVICE_MODE=worker` closes the remote desktop and runs the unattended
  CRM queue worker. If DAT later requires authentication, the job becomes
  `needs_auth`; temporarily switch back to `auth`, sign in, then return to
  `worker`.

Required Railway settings are:

```text
DAT_SERVICE_MODE=worker
DAT_BROWSER_CHANNEL=chromium
DAT_HEADLESS=0
DAT_USER_DATA_DIR=/data/dat-profile
DAT_RUNTIME_DIR=/data/runtime
DAT_CRM_BASE_URL=https://your-render-backend.example.com
DAT_WORKER_SECRET=<same long random value configured on Render>
DAT_WORKER_ID=first-class-railway-dat
DAT_WORKER_POLL_INTERVAL_MS=5000
DAT_CRM_REQUEST_TIMEOUT_MS=10000
DAT_CRM_RETRY_MAX_ATTEMPTS=3
DAT_CRM_RETRY_BASE_DELAY_MS=250
DAT_CRM_RETRY_MAX_DELAY_MS=5000
DAT_CRM_RETRY_429_MAX_DELAY_MS=10000
DAT_WORKER_READINESS_STALE_MS=60000
```

Set `DAT_WORKER_STALE_MS=90000` on the Render API. Every authenticated Railway
queue poll records a heartbeat in the CRM; the staff dashboard shows the worker
offline after that window and shows a separate sign-in-required alert after an
`AUTH_REQUIRED` result.

Attach one persistent volume at `/data`. Use the public Railway domain only
during the human sign-in window, with a temporary VNC password, then switch the
service to `worker` and remove or rotate that password. Never enter DAT
credentials into Railway variables or commit them to the repository.

The cloud host may present a different device or datacenter IP to DAT. If DAT
blocks it or requires repeated verification, stop and use an approved hosting
or access arrangement; do not attempt to bypass the control.

## Safety and recovery

- The local ledger at `runtime/ledger.json` prevents duplicate or uncertain resubmissions, stores completed results for reuse, and records daily usage for audit. It does not impose a daily lookup cap.
- A completed duplicate returns its stored result without opening DAT.
- A submitted or uncertain request never resubmits automatically; a human must reconcile it.
- CRM claim/start/fail/complete calls use bounded retries only because those endpoints are server-idempotent. Browser search activation is never transport-retried.
- `/health` reports readiness from the last successful CRM poll and returns 503 when polling is stale. An active browser job remains ready so a health restart cannot interrupt a possible submission.
- Logs contain IDs, workflow steps, status, duration, and safe categories only—not lanes, rates, or authentication data.
- RateView screenshots mask lane fields and complete rate cards. Search Loads stores only a safe pre-submit status record; no Search Loads page or result screenshot is retained. Artifacts are automatically pruned after 30 days.
- Traces are off by default because they may contain confidential data. Enable them only under an approved data-handling exception.

### CRM transport and readiness

- Each CRM request has a 10-second default timeout. Queue claims and identical
  `start`, `complete`, and `fail` callbacks retry at most three total attempts
  with exponential backoff and jitter for network errors and HTTP `502`,
  `503`, `504`, or `520` responses. The CRM state machine makes these repeated
  callbacks idempotent and rejects a conflicting terminal outcome.
- HTTP `429` is retried only when the server supplies a valid `Retry-After`
  value of at most 10 seconds. Other status codes fail immediately.
- Retry applies only to the CRM HTTP callback. The DAT browser search is never
  repeated by the transport layer, including after an ambiguous result-delivery
  response.
- `/health` allows a 60-second startup window, then returns HTTP `503` when an
  idle worker has not completed a successful CRM queue poll within 60 seconds.
  It stays healthy while a claimed DAT job is active so Railway cannot restart
  the browser during a potentially consequential submission. The response
  exposes timestamps and safe error categories, never secrets or lane data.

## Verification

```bash
npm run check
```

Server contract checks are run from `server/`:

```bash
npm run test:dat-rateview
npm run test:dat-search-loads
```
