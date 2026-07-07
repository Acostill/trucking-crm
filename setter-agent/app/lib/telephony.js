import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { GrokSession } from './grokSession.js'
import { ToolRuntime } from './tools.js'

// xAI signs call webhooks with the standard webhook signature scheme
// (webhook-id / webhook-timestamp / webhook-signature headers, HMAC-SHA256
// over "id.timestamp.body" with the base64 signing secret from number
// registration, optionally prefixed "whsec_").
export function verifyWebhookSignature(headers, rawBody, secret, { toleranceSec = 300, now } = {}) {
  const id = headers['webhook-id']
  const timestamp = headers['webhook-timestamp']
  const signature = headers['webhook-signature']
  if (!id || !timestamp || !signature) return false

  const nowSec = now ?? Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - Number(timestamp)) > toleranceSec) return false

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signed = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64')

  // Header holds space-separated "v1,<base64>" entries; accept any match.
  return signature.split(' ').some((part) => {
    const candidate = part.split(',')[1] || ''
    const a = Buffer.from(candidate)
    const b = Buffer.from(signed)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  })
}

export function extractCaller(event) {
  const from = (event.data?.sip_headers || []).find((h) => h.name.toLowerCase() === 'from')
  // From can be a bare number or a full SIP URI like "+1415..." <sip:+1415...@host>
  const m = (from?.value || '').match(/\+?\d{7,15}/)
  return m ? (m[0].startsWith('+') ? m[0] : `+${m[0]}`) : null
}

// Bootstrap an agent session onto an incoming SIP call. Looks the caller up
// in Close so returning leads are greeted by name; saves the full transcript
// and tool log to data/calls/ when the call ends.
export async function handleIncomingCall({ event, config, dataDir, close, apiKey, realtimeBase }) {
  const callId = event.data.call_id
  const caller = extractCaller(event)

  let lead = { firstName: 'there', phone: caller, source: 'inbound call' }
  if (close && caller) {
    try {
      const found = await close.findLeadByPhone(caller)
      if (found) {
        const [firstName, ...rest] = (found.name || '').split(' ')
        lead = { firstName: firstName || 'there', lastName: rest.join(' '), phone: caller, source: 'inbound call (known lead)' }
      }
    } catch (err) {
      console.error('[telephony] Close lookup failed:', err.message)
    }
  }

  const tools = new ToolRuntime({ dataDir, config, lead, close })
  const record = {
    call_id: callId,
    caller,
    lead_name: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
    started_at: new Date().toISOString(),
  }

  const base = realtimeBase || 'wss://api.x.ai/v1/realtime'
  const url = base.includes('?') ? `${base}&call_id=${callId}` : `${base}?call_id=${callId}`
  const session = new GrokSession({
    url,
    apiKey,
    config,
    lead,
    tools,
    onEvent: (evt) => {
      if (evt.type === 'tool_call') console.log(`[call ${callId}] tool: ${evt.name}`)
      if (evt.type === 'error') console.error(`[call ${callId}] error: ${evt.message}`)
      if (evt.type === 'closed') {
        record.ended_at = new Date().toISOString()
        record.transcript = session.transcript
        record.tools = session.toolLog.map((t) => ({ name: t.name, args: t.args }))
        const dir = path.join(dataDir, 'calls')
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, `${callId}.json`), JSON.stringify(record, null, 2))
        console.log(`[call ${callId}] ended — transcript saved`)
      }
    },
  })
  await session.connect()
  session.startCall()
  console.log(`[call ${callId}] answered — caller ${caller || 'unknown'} (${record.lead_name || 'new lead'})`)
  return session
}
