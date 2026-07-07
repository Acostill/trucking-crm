# First Class Trucking — Landing

The public landing page: a cinematic scroll experience (one continuous
Higgsfield-generated truck story scrubbed frame-by-frame by scroll) with an
instant freight-quote console and a realtime voice assistant.

This app supersedes `lanely-landing/` as the public site.

## Stack

Vite (vanilla JS) · GSAP ScrollTrigger · Lenis smooth scroll.
No framework — `index.html` + `src/`.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
```

Copy `.env.example` → `.env.local` to point at your environments:

| var | default | connects to |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3001` | `server/` Express CRM API |
| `VITE_VOICE_WS_URL` | `ws://localhost:3100/ws` | `setter-agent/app` Grok voice relay |
| `VITE_CRM_BASE_URL` | `http://localhost:3000` in local landing dev, otherwise same origin | `client/` Lanely CRM app |

> The server's `CORS_ORIGINS` env must include this app's origin
> (e.g. `http://localhost:5173`).

## Infrastructure wiring (src/)

- **`config.js`** — endpoint config + `apiFetch` helper with a hard timeout;
  every backend call degrades silently to local behaviour so the page never
  blocks when infra is cold.
- **`quote.js`** — the quote console:
  1. renders the instant client-side estimate (always, immediately-ish);
  2. races `POST /calculate-rate` (carrier network: Expedite All / Forward
     Air / DAT) and, when it answers, replaces the total and rescales the
     breakdown to match;
  3. persists every quote via `POST /api/quotes` → shows the CRM quote id,
     appears as `pending` in the Lanely pipeline;
  4. **Book This Rate** → `POST /api/quotes/:id/approve`, which auto-creates
     a load record in the CRM.
- **`voice.js`** — "Speak to an assistant": browser mic → the setter-agent
  relay (`{type:"start"|"audio_chunk"}` up, `{type:"audio"|...}` down) →
  xAI Grok Voice. The xAI key never reaches the browser.
- **`sequence.js`** — scroll-scrubbed frame sequence renderer (canvas,
  cover-fit, batched preload). Landscape frames in `public/frames/`,
  a dedicated 9:16 cut in `public/frames-portrait/` picked by orientation.

## Assets

- `public/frames*/` — 271-frame JPEG sequences (18 fps) exploded from
  `public/media/story-arrival*.mp4` with:
  `ffmpeg -i story.mp4 -vf "fps=18,scale=1280:-2" -qscale:v 4 frames/frame_%04d.jpg`
- `public/brand/logo.png` — First Class Trucking mark.

Design note: the visual design is final — customer request is that
infrastructure/copy may change but not the design.
