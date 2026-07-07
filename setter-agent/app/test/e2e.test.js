import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import { startServer } from '../server.js'
import { buildPrompt, loadCoachConfig } from '../lib/promptBuilder.js'
import { ToolRuntime } from '../lib/tools.js'

const configPath = new URL('../config/coach.json', import.meta.url).pathname
const config = loadCoachConfig(configPath)

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'setter-test-'))
}

// Drives a full conversation over the browser-facing WebSocket, collecting
// every relayed event, resolving each turn on 'turn_done'.
class CallDriver {
  constructor(port) {
    this.events = []
    this.port = port
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`)
      this.ws.on('open', resolve)
      this.ws.on('error', reject)
      this.ws.on('message', (raw) => {
        const evt = JSON.parse(raw.toString())
        this.events.push(evt)
        if (evt.type === 'turn_done' && this.waiting) {
          // Only settle when every requested response (incl. tool-chained
          // follow-ups) has completed — mirrors the live eval's logic.
          clearTimeout(this.settleTimer)
          if (evt.settled) {
            this.settleTimer = setTimeout(() => {
              const w = this.waiting
              this.waiting = null
              w?.()
            }, 100)
          }
        }
      })
    })
  }
  #turn(send) {
    return new Promise((resolve, reject) => {
      this.waiting = resolve
      const guard = setTimeout(() => reject(new Error('turn timeout')), 5000)
      const orig = resolve
      this.waiting = () => {
        clearTimeout(guard)
        orig()
      }
      send()
    })
  }
  start() {
    return this.#turn(() => this.ws.send(JSON.stringify({ type: 'start' })))
  }
  say(text) {
    return this.#turn(() => this.ws.send(JSON.stringify({ type: 'user_text', text })))
  }
  agentSaid() {
    return this.events.filter((e) => e.type === 'agent_text').map((e) => e.text)
  }
  toolCalls() {
    return this.events.filter((e) => e.type === 'tool_call')
  }
  close() {
    this.ws.close()
  }
}

test('prompt builder fills every variable and embeds coach facts', () => {
  const prompt = buildPrompt(config, config.sampleLead)
  assert.ok(!/\{\{/.test(prompt), 'no unfilled {{variables}} remain')
  assert.match(prompt, /Coach Marcus/)
  assert.match(prompt, /90-Day Dad Bod Transformation/)
  assert.match(prompt, /Jake Miller/)
  assert.match(prompt, /NEVER state, estimate, or negotiate a price/)
  assert.match(prompt, /disclose that you are an AI assistant/i)
})

test('prompt builder rejects a config with missing variables', () => {
  const broken = structuredClone(config)
  delete broken.variables.CALL_NAME
  assert.throws(() => buildPrompt(broken, config.sampleLead), /Unfilled prompt variables.*CALL_NAME/)
})

test('tool runtime: availability excludes booked slots; every tool persists', async () => {
  const tools = new ToolRuntime({ dataDir: tmpDir(), config, lead: config.sampleLead })
  const { slots } = await tools.execute('check_availability', {})
  assert.ok(slots.length >= 2, 'offers at least two slots')
  await tools.execute('book_appointment', {
    slot_start: slots[0].slot_start, lead_name: 'Jake Miller', lead_phone: '+15555550123', notes: 'test',
  })
  const after = await tools.execute('check_availability', {})
  assert.ok(!after.slots.some((s) => s.slot_start === slots[0].slot_start), 'booked slot no longer offered')
  await tools.execute('log_outcome', { disposition: 'booked', summary: 'test' })
  const snap = tools.snapshot()
  assert.equal(snap.bookings.length, 1)
  assert.equal(snap.crm[0].disposition, 'booked')
  assert.equal(snap.sms[0].message_type, 'confirmation', 'booking queues a confirmation SMS')
})

test('close sync: every outcome tool writes the right records, and a Close outage never fails the tool', async () => {
  const calls = []
  const fakeClose = {
    ensureLead: async () => (calls.push('ensureLead'), 'lead_123'),
    note: async (id, text) => calls.push(`note:${text.slice(0, 20)}`),
    logCall: async (id, text) => calls.push(`call:${text.slice(0, 30)}`),
    createTask: async (id, text, date) => calls.push(`task:${date}`),
    setStatusByLabel: async (id, label) => (calls.push(`status:${label}`), true),
  }
  const tools = new ToolRuntime({ dataDir: tmpDir(), config, lead: config.sampleLead, close: fakeClose })

  const booked = await tools.execute('book_appointment', {
    slot_start: '2026-07-08T10:00:00', lead_name: 'Jake Miller', lead_phone: '+15555550123', notes: 'notes',
  })
  assert.equal(booked.crm, 'synced')
  assert.ok(calls.includes('task:2026-07-08'), 'booking creates a Close task on the right date')

  const logged = await tools.execute('log_outcome', { disposition: 'booked', summary: 's' })
  assert.equal(logged.crm, 'synced')
  assert.ok(calls.some((c) => c.startsWith('call:[AI Setter] Disposition')), 'outcome logs a Close call activity')

  const dnc = await tools.execute('mark_do_not_contact', {})
  assert.equal(dnc.crm, 'synced')
  assert.ok(calls.includes('status:Do Not Contact'))

  // A Close outage must not fail the tool call mid-conversation.
  const brokenTools = new ToolRuntime({
    dataDir: tmpDir(), config, lead: config.sampleLead,
    close: { ensureLead: async () => { throw new Error('close down') } },
  })
  const result = await brokenTools.execute('log_outcome', { disposition: 'booked', summary: 's' })
  assert.equal(result.status, 'logged', 'local persistence still succeeds')
  assert.equal(result.crm, 'sync_failed')
})

test('e2e happy path: full call → discovery → booking → CRM logged', async () => {
  const dataDir = tmpDir()
  const srv = await startServer({ port: 0, mock: true, dataDir, configPath })
  const call = new CallDriver(srv.port)
  await call.connect()
  await call.start()

  assert.match(call.agentSaid()[0], /AI assistant/i, 'greeting discloses AI up front')

  await call.say("Yeah this is Jake, now's fine")
  await call.say("Honestly I'm out of shape, no energy, gained a lot since the second kid")
  await call.say("I'd want to be down 25 pounds and keeping up with my kids")
  await call.say('Time mostly, I travel for work every week')
  await call.say('My doctor mentioned my blood pressure, that scared me')
  await call.say("Yes, I'm in a spot where I could invest in this")
  await call.say('The first one works')

  const toolNames = call.toolCalls().map((t) => t.name)
  assert.deepEqual(
    toolNames,
    ['check_availability', 'book_appointment', 'log_outcome'],
    'tools fire in the correct order',
  )

  const snap = new ToolRuntime({ dataDir, config, lead: config.sampleLead }).snapshot()
  assert.equal(snap.bookings.length, 1, 'booking persisted')
  assert.equal(snap.bookings[0].lead_name, 'Jake Miller')
  assert.ok(snap.bookings[0].notes.length > 20, 'discovery notes attached for the coach')
  assert.equal(snap.crm.at(-1).disposition, 'booked')
  assert.equal(snap.sms.at(-1).message_type, 'confirmation')

  call.close()
  await srv.close()
})

test('e2e price question: agent deflects without ever stating a number', async () => {
  const srv = await startServer({ port: 0, mock: true, dataDir: tmpDir(), configPath })
  const call = new CallDriver(srv.port)
  await call.connect()
  await call.start()
  await call.say('Before anything — how much does the program cost?')
  const reply = call.agentSaid().at(-1)
  assert.ok(!/[$€£]|\d{3,}/.test(reply), `no price in: "${reply}"`)
  assert.match(reply, /call/i, 'redirects to the strategy call')
  call.close()
  await srv.close()
})

test('e2e do-not-contact: suppression + CRM logged, immediately', async () => {
  const dataDir = tmpDir()
  const srv = await startServer({ port: 0, mock: true, dataDir, configPath })
  const call = new CallDriver(srv.port)
  await call.connect()
  await call.start()
  await call.say('Stop calling me, take me off your list')

  const snap = new ToolRuntime({ dataDir, config, lead: config.sampleLead }).snapshot()
  assert.equal(snap.dnc.length, 1, 'lead suppressed')
  assert.equal(snap.dnc[0].phone, config.sampleLead.phone)
  assert.equal(snap.crm.at(-1).disposition, 'do_not_contact')
  call.close()
  await srv.close()
})

test('e2e "are you an AI" gets an honest answer', async () => {
  const srv = await startServer({ port: 0, mock: true, dataDir: tmpDir(), configPath })
  const call = new CallDriver(srv.port)
  await call.connect()
  await call.start()
  await call.say('Wait, are you a real person or an AI?')
  assert.match(call.agentSaid().at(-1), /AI assistant/i)
  call.close()
  await srv.close()
})
