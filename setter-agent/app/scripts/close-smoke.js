// Live smoke test for the Close CRM integration. Creates a clearly-marked
// test lead, runs every sync path the agent uses, prints what landed in
// Close, then deletes the test lead again.
//
// Usage: CLOSE_API_KEY=... node scripts/close-smoke.js   (or key in .env)

import dotenv from 'dotenv'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { CloseClient } from '../lib/close.js'
import { ToolRuntime } from '../lib/tools.js'
import { loadCoachConfig } from '../lib/promptBuilder.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

if (!process.env.CLOSE_API_KEY) {
  console.error('CLOSE_API_KEY is not set — add it to setter-agent/app/.env')
  process.exit(1)
}

const close = new CloseClient(process.env.CLOSE_API_KEY)
const config = loadCoachConfig(path.join(__dirname, '..', 'config', 'coach.json'))

const testLead = {
  firstName: 'AI-Setter',
  lastName: 'SMOKE-TEST',
  phone: '+15005550006', // reserved test number, won't collide with real leads
  email: 'ai-setter-smoke-test@example.com',
  source: 'integration smoke test',
}

console.log('1. Authenticating…')
const me = await close.me()
console.log(`   ✓ connected to Close as ${me.first_name} ${me.last_name} (org: ${me.organizations?.[0]?.name || 'n/a'})`)

const tools = new ToolRuntime({
  dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'close-smoke-')),
  config,
  lead: testLead,
  close,
})

console.log('2. book_appointment → lead + note + task…')
const booked = await tools.execute('book_appointment', {
  slot_start: '2026-07-08T10:00:00',
  lead_name: 'AI-Setter SMOKE-TEST',
  lead_phone: testLead.phone,
  lead_email: testLead.email,
  notes: 'Smoke test discovery notes — safe to delete.',
})
console.log(`   ✓ crm: ${booked.crm}`)

console.log('3. log_outcome → call activity…')
const logged = await tools.execute('log_outcome', {
  disposition: 'booked',
  summary: 'Smoke test call log — safe to delete.',
})
console.log(`   ✓ crm: ${logged.crm}`)

console.log('4. mark_do_not_contact → note + status…')
const dnc = await tools.execute('mark_do_not_contact', {})
console.log(`   ✓ crm: ${dnc.crm}`)

console.log('5. Verifying lead in Close…')
const lead = await close.findLeadByPhone(testLead.phone)
if (!lead) throw new Error('test lead not found in Close after sync')
console.log(`   ✓ found lead "${lead.name}" (${lead.id}), status: ${lead.status_label}`)

console.log('6. Cleaning up test lead…')
await close.deleteLead(lead.id)
console.log('   ✓ deleted')

const failed = [booked.crm, logged.crm, dnc.crm].filter((c) => c !== 'synced').length
console.log(failed ? `\n${failed} sync(s) FAILED — see [close] errors above` : '\nClose integration working ✓')
process.exit(failed ? 1 : 0)
