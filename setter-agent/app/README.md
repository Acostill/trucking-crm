# AI Setter — runnable app

Voice appointment-setter for coaches on the xAI Grok Voice Agent API.
Browser/SIP ⇄ **this relay server** ⇄ `wss://api.x.ai/v1/realtime?model=grok-voice-latest`.
The xAI key stays server-side; all six tools (calendar, SMS, CRM, DNC) execute here.

## Run it

```bash
cd setter-agent/app
npm install
npm start            # no XAI_API_KEY → MOCK mode automatically
open http://localhost:3100
```

**Go live:** `cp .env.example .env`, paste your `XAI_API_KEY` (console.x.ai), `npm start`.
The badge in the console header flips from MOCK to LIVE and the 🎙 Mic button
streams real speech both ways.

## Test it

```bash
npm test    # 7 offline tests: prompt builder, tools, full e2e call over the relay
npm run eval  # LIVE conversation-quality eval against real Grok (needs XAI_API_KEY)
```

`npm run eval` runs three scripted lead personas (qualified dad, price-shopper/
AI-skeptic, hostile opt-out) through the real model and grades: AI disclosure in
the opening turn, never states a price, never guarantees results, honest AI
admission, short spoken turns, correct tool sequence, correct CRM disposition.
Run it after any prompt or config change before putting it in front of a coach.

## Onboard a new coach

1. Copy `config/coach.json`, fill it from `../CLIENT_INTAKE.md`.
2. Point `book_appointment` / `send_sms` / `log_outcome` in `lib/tools.js` at
   their real calendar/SMS/CRM webhooks (currently JSON files in `data/`).
3. `npm test && npm run eval`, then run the checklist in `../GROK_CONFIG.md`.

## Layout

```
prompt.template.txt   the setter system prompt ({{VARS}} filled per coach)
config/coach.json     example coach: "Coach Marcus", fitness niche
lib/promptBuilder.js  fills the template; throws on any missing variable
lib/tools.js          6 tool schemas + JSON-backed calendar/CRM/SMS/DNC
lib/grokSession.js    one call: realtime WS session + server-side tool exec
server.js             relay server + web console + /api/state
mock/mockGrok.js      protocol-faithful mock of the Grok realtime API
public/index.html     test console (transcript, mic, live CRM panel)
test/                 offline suite   ·   eval/  live-quality eval
```

## Phone calls (xAI SIP)

The telephony layer is built in: when a registered number rings, xAI POSTs a
signed `realtime.call.incoming` webhook to `/webhooks/xai`, this server
verifies it, looks the caller up in Close (returning leads are greeted by
name), attaches the agent to the call, and saves the transcript + tool log to
`data/calls/<call_id>.json` when the call ends.

Go-live steps:
1. **Enable the Agents endpoint** for your team at console.x.ai (the
   phone-number API 403s with "agents endpoint is not enabled" until then).
2. **Get a number with SIP origination** (Twilio Elastic SIP Trunking,
   Telnyx, or Plivo) pointed at xAI per their SIP docs.
3. **Expose this server publicly** (deploy it, or for testing:
   `cloudflared tunnel --url http://localhost:3100`).
4. **Register the number**:
   `node scripts/register-number.js +15551234567 https://your-host/webhooks/xai`
   and put the printed signing secret in `.env` as `XAI_WEBHOOK_SECRET`.
5. Call the number.

Read `../COMPLIANCE.md` before dialing real leads (TCPA consent, calling
hours, AI disclosure, recording notices).
