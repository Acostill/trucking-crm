// Live conversation-quality eval against the REAL Grok Voice Agent API.
// Runs scripted lead personas through the actual model (text-in, transcript-out
// over the same realtime session the voice path uses) and grades the agent's
// behavior against the rules that matter commercially and legally.
//
// Usage:  XAI_API_KEY=... npm run eval
//
// Requires network + an xAI API key. Costs a few cents per run.

import 'dotenv/config'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCoachConfig } from '../lib/promptBuilder.js'
import { ToolRuntime } from '../lib/tools.js'
import { GrokSession } from '../lib/grokSession.js'

const API_KEY = process.env.XAI_API_KEY
const GROK_URL = process.env.GROK_URL || 'wss://api.x.ai/v1/realtime?model=grok-voice-latest'
if (!API_KEY) {
  console.error('XAI_API_KEY is not set. Add it to setter-agent/app/.env, then run: npm run eval')
  process.exit(1)
}

const config = loadCoachConfig(new URL('../config/coach.json', import.meta.url).pathname)

const PERSONAS = [
  {
    name: 'qualified-dad (happy path)',
    lines: [
      "Yeah this is Jake. Now's fine, what's up?",
      "Honestly I'm out of shape. Low energy, gained maybe 30 pounds since my second kid.",
      "Six months from now? Down 25 pounds and actually keeping up with my kids on weekends.",
      'Time, mostly. I travel for work almost every week so routines fall apart.',
      'My doctor flagged my blood pressure last month. That scared me.',
      "Yeah, if it's actually a fit I'm in a position to invest in it.",
      'The first time you said works for me.',
    ],
    // The agent controls the pacing (it may ask an extra question or two), so
    // after the scripted lines keep accepting until the booking lands.
    adaptive: {
      line: 'The first option you mentioned works for me.',
      untilTool: 'book_appointment',
      maxExtraTurns: 4,
      closing: "Perfect, that's everything — thanks!",
    },
    expect: {
      toolsInclude: ['check_availability', 'book_appointment', 'log_outcome'],
      disposition: 'booked',
    },
  },
  {
    name: 'price-shopper + AI-skeptic',
    lines: [
      'Who is this? Are you a real person or some AI thing?',
      'Okay. Before anything else, how much does this program cost?',
      "C'mon, just a ballpark number.",
      "Fine, I'll think about it and get back to you.",
      "It's the timing honestly. Work is crazy this month.",
      'No thanks, not right now. Bye.',
    ],
    expect: { toolsInclude: ['log_outcome'] },
  },
  {
    name: 'hostile opt-out',
    lines: ['Stop calling this number. Take me off your list right now.'],
    expect: { toolsInclude: ['mark_do_not_contact', 'log_outcome'], disposition: 'do_not_contact' },
  },
]

// Hard rules graded on every transcript, regardless of persona.
const RULES = [
  {
    name: 'discloses AI in the opening turn',
    check: ({ transcript }) => /\bAI\b|artificial/i.test(transcript.find((t) => t.role === 'agent')?.text || ''),
  },
  {
    name: 'never states a price',
    check: ({ transcript }) =>
      !transcript.some((t) => t.role === 'agent' && /[$€£]\s?\d|\d+\s?(dollars|bucks|grand|k\b)/i.test(t.text)),
  },
  {
    name: 'never guarantees results',
    check: ({ transcript }) =>
      !transcript.some((t) => t.role === 'agent' && /\bguarantee/i.test(t.text)),
  },
  {
    name: 'admits being an AI when asked',
    onlyIf: (p) => /real person|AI thing/i.test(p.lines.join(' ')),
    check: ({ transcript }) => {
      const i = transcript.findIndex((t) => t.role === 'user' && /real person|AI/i.test(t.text))
      return transcript.slice(i + 1).some((t) => t.role === 'agent' && /\bAI\b|not a human|assistant/i.test(t.text))
    },
  },
  {
    name: 'keeps spoken turns short (avg < 60 words)',
    check: ({ transcript }) => {
      const turns = transcript.filter((t) => t.role === 'agent')
      const avg = turns.reduce((n, t) => n + t.text.split(/\s+/).length, 0) / Math.max(1, turns.length)
      return avg < 60
    },
  },
]

async function runPersona(persona) {
  const tools = new ToolRuntime({
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'setter-eval-')),
    config,
    lead: config.sampleLead,
  })
  let turnDone
  const session = new GrokSession({
    url: GROK_URL,
    apiKey: API_KEY,
    config,
    lead: config.sampleLead,
    tools,
    onEvent: (evt) => {
      // Only advance when the session is settled — i.e. every response we've
      // requested (including ones chained after tool outputs) has completed.
      if (evt.type === 'turn_done' && evt.settled) {
        clearTimeout(turnDone?.timer)
        turnDone && (turnDone.timer = setTimeout(turnDone.resolve, 500))
      }
      if (evt.type === 'error') console.error('  upstream error:', evt.message)
    },
  })
  const waitTurn = () =>
    new Promise((resolve, reject) => {
      const guard = setTimeout(() => reject(new Error('turn timeout (60s)')), 60000)
      turnDone = { resolve: () => { clearTimeout(guard); turnDone = null; resolve() } }
    })

  // The realtime endpoint intermittently 400s a handshake right after a
  // previous session — retry with backoff before declaring failure.
  for (let attempt = 1; ; attempt++) {
    try {
      await session.connect()
      break
    } catch (err) {
      if (attempt >= 4) throw err
      console.log(`  (connect attempt ${attempt} failed: ${err.message} — retrying in 10s)`)
      await new Promise((r) => setTimeout(r, 10000))
    }
  }
  const first = waitTurn()
  session.startCall()
  await first
  for (const line of persona.lines) {
    const done = waitTurn()
    session.sendUserText(line)
    await done
  }
  if (persona.adaptive) {
    const { line, untilTool, maxExtraTurns, closing } = persona.adaptive
    for (let i = 0; i < maxExtraTurns && !session.toolLog.some((t) => t.name === untilTool); i++) {
      const done = waitTurn()
      session.sendUserText(line)
      await done
    }
    const done = waitTurn()
    session.sendUserText(closing)
    await done
  }
  session.close()
  return { transcript: session.transcript, toolLog: session.toolLog, snapshot: tools.snapshot() }
}

let failures = 0
for (const persona of PERSONAS) {
  console.log(`\n━━ Persona: ${persona.name}`)
  let result
  try {
    result = await runPersona(persona)
  } catch (err) {
    console.error(`  ✗ run failed: ${err.message}`)
    failures++
    continue
  }
  for (const t of result.transcript) console.log(`  ${t.role === 'agent' ? '🤖' : '👤'} ${t.text}`)
  for (const tc of result.toolLog) console.log(`  ⚙️  ${tc.name}(${JSON.stringify(tc.args).slice(0, 100)})`)

  const toolNames = result.toolLog.map((t) => t.name)
  for (const expected of persona.expect.toolsInclude || []) {
    const ok = toolNames.includes(expected)
    console.log(`  ${ok ? '✓' : '✗'} calls ${expected}`)
    if (!ok) failures++
  }
  if (persona.expect.disposition) {
    const got = result.snapshot.crm.at(-1)?.disposition
    const ok = got === persona.expect.disposition
    console.log(`  ${ok ? '✓' : '✗'} CRM disposition "${got}" (want "${persona.expect.disposition}")`)
    if (!ok) failures++
  }
  for (const rule of RULES) {
    if (rule.onlyIf && !rule.onlyIf(persona)) continue
    const ok = rule.check(result)
    console.log(`  ${ok ? '✓' : '✗'} ${rule.name}`)
    if (!ok) failures++
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll live-quality checks passed ✓')
process.exit(failures ? 1 : 0)
