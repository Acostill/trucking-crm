# trucking-crm

Freight/trucking platform monorepo: public landing, quote/rate engine,
Lanely CRM, and an AI voice agent.

## Apps

| dir | what | stack | port |
|---|---|---|---|
| `landing/` | **Public landing page** (First Class Trucking) — cinematic scroll site, instant quote console, voice assistant | Vite (vanilla) | 5173 |
| `server/` | CRM API — quotes, loads, auth, carrier rate fan-out (Expedite All / Forward Air / DAT), AI email parsing, PDF | Express + TS + Postgres | 3001 |
| `setter-agent/` | Grok Voice relay + appointment-setter agent (browser ⇄ relay ⇄ `wss://api.x.ai/v1/realtime`), CRM tool calls, mock mode | Node + ws | 3100 |
| `client/` | Lanely CRM dashboard | CRA + React | 3000 |
| `calculate-rate/` | Standalone quote calculator (legacy; superseded by `landing/`) | CRA + React | 3000 |

## Quick start (dev)

```bash
# 1. API — needs DATABASE_URL (Postgres) in server/.env
cd server && npm i && npm run dev            # :3001

# 2. Voice relay — runs in MOCK mode without XAI_API_KEY
cd setter-agent/app && npm i && node server.js   # :3100

# 3. Landing
cd landing && npm i && npm run dev           # :5173
```

Required `server/.env`:

```
DATABASE_URL=postgresql://...
DATABASE_ENVIRONMENT=development
DATABASE_SAFETY_ENFORCED=false
PORT=3001
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
PUBLIC_APP_URL=http://localhost:3000
```

## Email quote inbox

The CRM route `/email-quotes` turns incoming quote requests into a staff
pricing queue:

1. Gmail is checked for messages addressed to `emailbot@optimation.io`.
2. The email is parsed into pickup, delivery, dimensions, weight, commodity,
   and accessorials.
3. Forward Air and ExpediteAll are rated in parallel. Staff can then approve
   one DAT RateView lookup for the parsed lane and selected equipment.
4. A local Playwright worker uses the remembered DAT browser session and writes
   Spot and Contract market benchmarks back to the inbox automatically.
5. The lowest bookable carrier cost is suggested. DAT remains a market
   benchmark—not a carrier quote—while staff sets the final margin/client price.

Run the additive database migration once:

```bash
cd server
npm run db:migrate:email-quotes
npm run db:migrate:dat-rateview
npm run db:migrate:phase1-hardening
```

Then copy the Gmail and OpenRouter settings from `server/.env.example` into
`server/.env`. Create a Google OAuth **Desktop app** client and download its
JSON file to:

```text
server/credentials.json
```

The local callback is `http://127.0.0.1:53682/oauth2callback`. Authorize the
inbox:

```bash
cd server
npm run gmail:authorize
```

Sign in as `emailbot@optimation.io`. The helper saves the refresh token into
`server/.env` without printing it; restart the API afterward. The poller uses
Gmail read-only access and deduplicates messages in Postgres; it does not mark,
move, or delete email. If `emailbot@optimation.io` is an alias, authorize its
owning mailbox and set `GMAIL_ALLOW_MAILBOX_ALIAS=true`.

To reply from a different Gmail account via a configured send-as alias, fill
in the `GMAIL_SEND_*` block in `server/.env` (`GMAIL_SEND_ACCOUNT` is the real
Gmail account, `GMAIL_SEND_FROM_ADDRESS` is the alias that owner has set up
under Gmail > Settings > Accounts > "Send mail as"). Leave
`GMAIL_SEND_CLIENT_ID` / `GMAIL_SEND_CLIENT_SECRET` blank to reuse the same
OAuth client, then authorize the sending account:

```bash
cd server
npm run gmail:authorize:send
```

The helper stores `GMAIL_SEND_REFRESH_TOKEN` in `server/.env`; restart the
API. When `GMAIL_SEND_REFRESH_TOKEN` is unset, outbound replies keep using
the inbox mailbox as before.

### DAT RateView worker

The hosted API stores approved jobs and results. The Playwright browser runs as
a separate worker with a persistent browser profile; the current First Class
deployment uses a Railway volume at `/data`, with the Mac worker retained as a
documented fallback. Set these server-side variables in Render:

```text
DAT_WORKER_ENABLED=true
DAT_WORKER_SECRET=<one long random value>
DATABASE_ENVIRONMENT=production
PUBLIC_APP_URL=https://your-production-crm.example.com
```

Use that same secret only in the Railway worker variables or in
`clients/first-class-trucking/automation/.env` for a local fallback, along with
the public Render backend URL. Railway deployment and human reauthentication
instructions are in `clients/first-class-trucking/automation/README.md`.

For the Render production service, use locked dependencies and the compiled
server instead of the development watcher:

```text
Build Command: npm ci --include=dev && npm run build
Start Command: npm start
Health Check Path: /api/health
```

Production refuses to start when `DATABASE_ENVIRONMENT` is missing or is not
`production`. A local or test server refuses a database labeled `production`
when `DATABASE_SAFETY_ENFORCED=true`, unless the explicit emergency override is
set. The Phase 1 migration also permanently labels each database; production
startup fails if the application label and stored database label do not match.
Use separate Neon databases or branches for development, staging, and production;
do not copy the production `DATABASE_URL` into local `.env` files.

For the local fallback:

```bash
cd clients/first-class-trucking/automation
npm run auth
npm run worker
```

The CRM never receives DAT credentials, cookies, MFA codes, or browser storage.
Each search requires a staff click on **Approve & run DAT lookup**. Completed
duplicates reuse the local ledger result, and an uncertain submission is never
automatically retried.

`setter-agent/app/.env` (see `.env.example` there): `XAI_API_KEY` to go
live, `CLOSE_API_KEY` for Close CRM sync; leave empty for full-pipeline
mock mode.

## How the landing talks to the platform

```
landing (5173)
  ├─ POST /calculate-rate            → carrier-network rate for the console
  ├─ POST /api/quotes                → pending quote in the Lanely pipeline
  ├─ POST /api/quotes/:id/approve    → "Book This Rate" → load record
  └─ WS   setter-agent /ws           → Grok Voice assistant (key server-side)
```

## Self-hosting: everything on one port

For a single self-hosted deployment (e.g. `http://yourhost:3000`), `server/`
serves the public landing page at `/` and the Lanely CRM at everything else
non-API (`/loads`, `/pipeline`, `/dashboard`, ...) from the same origin —
no separate `landing`/`client` dev servers needed in production, and no CORS
between them since they share an origin.

```bash
cd landing && npm i && npm run build   # → landing/dist
cd client && npm i && npm run build    # → client/build
cd server && npm i && npm run build && PORT=3000 npm start
```

Visiting `http://yourhost:3000/` shows the landing page; its "Log in" link
points at `/loads` on the same origin, landing in the CRM without a port
change. The CRM's own API calls are relative (`/api/...`) by default so they
resolve to whichever origin is serving it — set `client/.env`'s
`REACT_APP_API_BASE_URL` only if you run `client/` standalone against a
different host during development (see `client/.env`).

This is additive: `server/app.ts` serves each build with `express.static`
and falls through when a build hasn't been generated (e.g. a pure-API dev
setup), so the three-separate-dev-servers workflow above still works
unchanged.
