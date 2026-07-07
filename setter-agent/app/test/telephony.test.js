import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verifyWebhookSignature, extractCaller } from '../lib/telephony.js'
import { startServer } from '../server.js'

const SECRET = 'whsec_' + Buffer.from('test-signing-secret-32-bytes-ok!').toString('base64')

function sign(rawBody, { id = 'msg_1', timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const key = Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64')
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')
  return { 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${sig}` }
}

test('webhook signature: valid passes, tampered/expired/missing fail', () => {
  const body = JSON.stringify({ hello: 'world' })
  const headers = sign(body)
  assert.ok(verifyWebhookSignature(headers, body, SECRET))
  assert.ok(!verifyWebhookSignature(headers, body + ' ', SECRET), 'tampered body rejected')
  assert.ok(!verifyWebhookSignature({ ...headers, 'webhook-signature': 'v1,AAAA' }, body, SECRET))
  const old = sign(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 })
  assert.ok(!verifyWebhookSignature(old, body, SECRET), 'stale timestamp rejected')
  assert.ok(!verifyWebhookSignature({}, body, SECRET), 'missing headers rejected')
})

test('extractCaller handles bare numbers and SIP URIs', () => {
  const evt = (v) => ({ data: { sip_headers: [{ name: 'From', value: v }] } })
  assert.equal(extractCaller(evt('+14155550100')), '+14155550100')
  assert.equal(extractCaller(evt('"Jake" <sip:+14155550100@carrier.com>')), '+14155550100')
  assert.equal(extractCaller(evt('sip:14155550100@x')), '+14155550100')
  assert.equal(extractCaller({ data: { sip_headers: [] } }), null)
})

test('e2e inbound call: signed webhook → agent attaches → transcript saved', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setter-tel-'))
  process.env.XAI_WEBHOOK_SECRET = SECRET
  const srv = await startServer({
    port: 0,
    mock: true,
    dataDir,
    configPath: new URL('../config/coach.json', import.meta.url).pathname,
  })

  const event = {
    object: 'event',
    id: 'evt_test',
    type: 'realtime.call.incoming',
    data: {
      call_id: 'test-call-0001',
      sip_headers: [{ name: 'From', value: '+15555550123' }],
    },
  }
  const rawBody = JSON.stringify(event)

  // Bad signature is rejected
  const bad = await fetch(`http://127.0.0.1:${srv.port}/webhooks/xai`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...sign(rawBody), 'webhook-signature': 'v1,forged' },
    body: rawBody,
  })
  assert.equal(bad.status, 401)

  // Valid webhook is accepted and the agent attaches to the (mock) call
  const ok = await fetch(`http://127.0.0.1:${srv.port}/webhooks/xai`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...sign(rawBody) },
    body: rawBody,
  })
  assert.equal(ok.status, 200)
  assert.deepEqual(await ok.json(), { accepted: 'test-call-0001' })

  // Give the mock call time to greet, then shut down (closing saves the record)
  await new Promise((r) => setTimeout(r, 700))
  await srv.close()
  await new Promise((r) => setTimeout(r, 200))

  const recordPath = path.join(dataDir, 'calls', 'test-call-0001.json')
  assert.ok(fs.existsSync(recordPath), 'call record written')
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
  assert.equal(record.caller, '+15555550123')
  assert.ok(record.transcript.some((t) => t.role === 'agent' && /AI assistant/i.test(t.text)), 'agent greeted the caller')
  delete process.env.XAI_WEBHOOK_SECRET
})
