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
| `lanely-landing/` | Previous landing page (superseded by `landing/`) | Vite + React | 3000 |

`lanely/`, `lanely---modern-logistics-crm/` and the root `.zip`s are older
duplicates kept for reference.

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
