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
PORT=3001
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

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
