// Register a phone number with xAI so inbound SIP calls hit our webhook.
//
// Prereqs:
//   1. "Agents" endpoint enabled for your team (console.x.ai — currently gated;
//      if you see "agents endpoint is not enabled for this team", enable it
//      there or contact xAI support).
//   2. A number on a SIP-capable carrier (Twilio Elastic SIP / Telnyx / Plivo)
//      with origination pointed at xAI per their SIP docs.
//   3. A public HTTPS URL for this server's /webhooks/xai route
//      (deploy, or for testing: `cloudflared tunnel --url http://localhost:3100`).
//
// Usage:
//   node scripts/register-number.js +15551234567 https://your-host/webhooks/xai
//
// SAVE THE SIGNING SECRET IT PRINTS — xAI returns it exactly once. Put it in
// .env as XAI_WEBHOOK_SECRET.

import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

const [phoneNumber, webhookUrl] = process.argv.slice(2)
if (!phoneNumber || !webhookUrl) {
  console.error('Usage: node scripts/register-number.js <+E164 number> <https webhook url>')
  process.exit(1)
}
if (!process.env.XAI_API_KEY) {
  console.error('XAI_API_KEY not set in .env')
  process.exit(1)
}

const res = await fetch('https://api.x.ai/v2/phone-numbers', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    phone_number: phoneNumber,
    origin: 'byo_trunk',
    webhook_url: webhookUrl,
  }),
})

const body = await res.text()
if (!res.ok) {
  console.error(`Registration failed (HTTP ${res.status}):\n${body}`)
  if (body.includes('agents endpoint is not enabled')) {
    console.error('\n→ Enable the Agents endpoint for your team at https://console.x.ai (Voice Agents / Agents section), then re-run.')
  } else if (res.status === 400) {
    console.error('\n→ The request schema may differ from this template — adjust the body per the validation error above (xAI SIP docs: https://docs.x.ai/developers/model-capabilities/audio/voice-agent/sip).')
  }
  process.exit(1)
}

const data = JSON.parse(body)
console.log('Registered:', JSON.stringify(data, null, 2))
if (data.signing_secret) {
  console.log('\n*** SIGNING SECRET (shown ONCE — add to .env now) ***')
  console.log(`XAI_WEBHOOK_SECRET=${data.signing_secret}`)
}
