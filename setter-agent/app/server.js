import dotenv from 'dotenv'
import express from 'express'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

// Load the .env sitting next to this file, not the launch directory's.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') })
import { loadCoachConfig } from './lib/promptBuilder.js'
import { ToolRuntime } from './lib/tools.js'
import { GrokSession } from './lib/grokSession.js'
import { CloseClient } from './lib/close.js'
import { verifyWebhookSignature, handleIncomingCall } from './lib/telephony.js'
import { createMockGrok } from './mock/mockGrok.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Relay architecture: browser (or SIP leg) ⇄ this server ⇄ Grok realtime API.
// The xAI key stays server-side and every tool call is executed here, next to
// the calendar/CRM integrations.
export async function startServer({
  port = Number(process.env.PORT || 3100),
  configPath = path.join(__dirname, 'config', 'coach.json'),
  dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'),
  mock = process.env.MOCK === '1' || !process.env.XAI_API_KEY,
  grokUrl = process.env.GROK_URL || 'wss://api.x.ai/v1/realtime?model=grok-voice-latest',
} = {}) {
  const config = loadCoachConfig(configPath)
  let upstreamUrl = grokUrl
  let mockHandle = null
  if (mock) {
    mockHandle = await createMockGrok(0)
    upstreamUrl = `ws://127.0.0.1:${mockHandle.port}`
    if (!process.env.XAI_API_KEY && process.env.MOCK !== '1') {
      console.log('[setter] No XAI_API_KEY found — running in MOCK mode. Add it to setter-agent/app/.env to go live.')
    }
  }

  // All selectable voices — fetched live from xAI when we have a key,
  // falling back to the five documented realtime voices.
  let voices = [
    { id: 'ara', gender: 'female' }, { id: 'eve', gender: 'female' },
    { id: 'rex', gender: 'male' }, { id: 'sal', gender: 'male' }, { id: 'leo', gender: 'male' },
  ]
  if (!mock && process.env.XAI_API_KEY) {
    try {
      const r = await fetch('https://api.x.ai/v1/tts/voices', {
        headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      })
      if (r.ok) voices = (await r.json()).voices.map((v) => ({ id: v.voice_id, gender: v.gender }))
    } catch {
      /* keep fallback list */
    }
  }

  const app = express()
  app.use(express.static(path.join(__dirname, 'public')))

  // Live CRM/calendar snapshot for the console side panel and for tests.
  const stateTools = new ToolRuntime({ dataDir, config, lead: config.sampleLead })
  app.get('/api/state', (_req, res) => res.json(stateTools.snapshot()))
  app.get('/api/meta', (_req, res) =>
    res.json({
      mode: mock ? 'mock' : 'live',
      model: mock ? 'mock-grok-voice' : 'grok-voice-latest',
      coach: config.variables.COACH_NAME,
      agent: config.variables.AGENT_NAME,
      voice: config.voice,
      voices,
      lead: config.sampleLead,
    }),
  )

  const server = http.createServer(app)
  const wss = new WebSocketServer({ server, path: '/ws' })

  const close = process.env.CLOSE_API_KEY ? new CloseClient(process.env.CLOSE_API_KEY) : null
  if (close) console.log('[setter] Close CRM sync enabled')

  // ---- Telephony: xAI SIP webhook --------------------------------------
  // Register your phone number with scripts/register-number.js; xAI then
  // POSTs realtime.call.incoming here for every inbound call.
  const webhookSecret = process.env.XAI_WEBHOOK_SECRET
  app.post('/webhooks/xai', express.raw({ type: '*/*' }), async (req, res) => {
    const rawBody = req.body.toString('utf8')
    if (!webhookSecret) {
      console.error('[telephony] webhook received but XAI_WEBHOOK_SECRET is not set — rejecting')
      return res.status(503).json({ error: 'webhook secret not configured' })
    }
    if (!verifyWebhookSignature(req.headers, rawBody, webhookSecret)) {
      return res.status(401).json({ error: 'invalid signature' })
    }
    let event
    try {
      event = JSON.parse(rawBody)
    } catch {
      return res.status(400).json({ error: 'invalid JSON' })
    }
    if (event.type !== 'realtime.call.incoming' || !event.data?.call_id) {
      return res.status(200).json({ ignored: event.type })
    }
    res.status(200).json({ accepted: event.data.call_id }) // ack fast, then attach the agent
    handleIncomingCall({
      event,
      config,
      dataDir,
      close,
      apiKey: process.env.XAI_API_KEY,
      realtimeBase: mock ? upstreamUrl : undefined,
    }).catch((err) => console.error(`[telephony] failed to attach agent to call: ${err.message}`))
  })

  wss.on('connection', async (client, req) => {
    const lead = config.sampleLead
    const voiceOverride = new URL(req.url, 'http://local').searchParams.get('voice')
    const callConfig = voiceOverride ? { ...config, voice: voiceOverride } : config
    const tools = new ToolRuntime({ dataDir, config, lead, close })
    const session = new GrokSession({
      url: upstreamUrl,
      apiKey: process.env.XAI_API_KEY,
      config: callConfig,
      lead,
      tools,
      onEvent: (evt) => {
        if (client.readyState === 1) client.send(JSON.stringify(evt))
      },
    })
    // Register the handler before the (async) upstream connect and queue any
    // early messages — otherwise a fast client's first message is dropped.
    const pending = []
    let ready = false
    const handle = (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      if (msg.type === 'start') session.startCall()
      else if (msg.type === 'user_text' && typeof msg.text === 'string') session.sendUserText(msg.text)
      else if (msg.type === 'audio_chunk' && typeof msg.data === 'string') session.sendAudioChunk(msg.data)
    }
    client.on('message', (raw) => (ready ? handle(raw) : pending.push(raw)))
    client.on('close', () => session.close())

    try {
      await session.connect()
    } catch (err) {
      client.send(JSON.stringify({ type: 'error', message: `Upstream connect failed: ${err.message}` }))
      client.close()
      return
    }
    ready = true
    pending.splice(0).forEach(handle)
  })

  await new Promise((resolve) => server.listen(port, resolve))
  const actualPort = server.address().port
  console.log(`[setter] ${mock ? 'MOCK' : 'LIVE'} mode — console at http://localhost:${actualPort}`)

  return {
    port: actualPort,
    close: async () => {
      wss.close()
      await new Promise((r) => server.close(r))
      mockHandle?.close()
    },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer()
}
