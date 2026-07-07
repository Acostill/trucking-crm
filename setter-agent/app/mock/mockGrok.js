import { WebSocketServer } from 'ws'

// Protocol-faithful stand-in for wss://api.x.ai/v1/realtime so the ENTIRE
// pipeline (session config, event relay, tool execution, calendar, CRM, UI)
// can be exercised end-to-end without an API key. It plays a rule-based
// setter that walks the same arc as the real prompt: open → discovery →
// qualify → check_availability → book_appointment → log_outcome, plus the
// price-question and do-not-contact paths.
//
// It does NOT test conversation quality — that's what eval/live-eval.js does
// against the real model.

let callSeq = 0

function extractVar(instructions, marker, fallback) {
  // Best-effort: mock replies reuse the coach/agent names from the real prompt.
  const m = instructions?.match(marker)
  return m ? m[1].trim() : fallback
}

export function createMockGrok(port = 0) {
  const wss = new WebSocketServer({ port, host: '127.0.0.1' })

  wss.on('connection', (ws) => {
    const state = {
      instructions: '',
      tools: [],
      step: 'greet',
      discovery: 0,
      slots: null,
      lastUser: '',
      callName: (name) => name, // populated below
    }

    const send = (obj) => ws.send(JSON.stringify(obj))
    // Like the real API, exactly ONE response.done is emitted per
    // response.create — a response may contain speech, a tool call, or both.
    const say = (text) => {
      send({ type: 'response.output_audio_transcript.delta', delta: text })
      send({ type: 'response.output_audio_transcript.done', transcript: text })
    }
    const callTool = (name, args) => {
      send({
        type: 'response.function_call_arguments.done',
        call_id: `call_${++callSeq}`,
        name,
        arguments: JSON.stringify(args),
      })
    }
    const done = () => send({ type: 'response.done' })

    send({ type: 'session.created', session: { model: 'mock-grok-voice' } })

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())

      if (msg.type === 'session.update') {
        state.instructions = msg.session?.instructions || ''
        state.tools = msg.session?.tools || []
        state.agentName = extractVar(state.instructions, /You are (\w+),/, 'Riley')
        state.coachFirst = extractVar(state.instructions, /assistant for Coach (\w+)/, 'Marcus')
        return
      }

      if (msg.type === 'conversation.item.create') {
        const item = msg.item || {}
        if (item.type === 'message' && item.role === 'user') {
          state.lastUser = (item.content?.[0]?.text || '').toLowerCase()
        }
        if (item.type === 'function_call_output') {
          const out = JSON.parse(item.output || '{}')
          if (out.slots) state.slots = out.slots
          state.gotToolOutput = true
        }
        return
      }

      if (msg.type !== 'response.create') return

      // A response.create right after a tool output → continue the flow.
      if (state.gotToolOutput) {
        state.gotToolOutput = false
        if (state.step === 'availability' && state.slots?.length >= 2) {
          state.step = 'offer'
          say(
            `Okay — I've got ${state.slots[0].spoken} or ${state.slots[1].spoken}. Which works better for you?`,
          )
        } else if (state.step === 'booked') {
          state.step = 'log'
          callTool('log_outcome', {
            disposition: 'booked',
            summary: 'Qualified lead booked onto the strategy call. Wants to lose weight, main obstacle is time.',
          })
        } else if (state.step === 'log') {
          state.step = 'done'
          say(`You're all set — you'll get a text in a second, just tap confirm. Talk soon!`)
        } else if (state.step === 'dnc') {
          state.step = 'dnc_log'
          callTool('log_outcome', {
            disposition: 'do_not_contact',
            summary: 'Lead asked not to be contacted. Suppressed.',
          })
        } else if (state.step === 'dnc_log') {
          state.step = 'done'
          say('Understood — you will not hear from us again. Take care.')
        } else {
          say('Got it.')
        }
        done()
        return
      }

      const u = state.lastUser
      state.lastUser = ''

      // Hard paths that win over everything
      if (/stop calling|don'?t call|remove me|never contact/.test(u)) {
        state.step = 'dnc'
        say(`I'm sorry about that — removing you right now.`)
        callTool('mark_do_not_contact', {})
        done()
        return
      }
      if (/how much|price|cost|expensive/.test(u)) {
        say(
          `Great question — it honestly depends on which program fits, so I'd be guessing. That's exactly what ${state.coachFirst} covers on the call, and there's zero obligation. Fair?`,
        )
        done()
        return
      }
      if (/are you (an? )?(ai|bot|robot|real)/.test(u)) {
        say(
          `Yep — I'm ${state.coachFirst}'s AI assistant. I handle the scheduling so ${state.coachFirst} can spend the actual call time with you. Still happy to get you booked in.`,
        )
        done()
        return
      }

      // Main arc
      switch (state.step) {
        case 'greet':
          state.step = 'discovery'
          say(
            `Hey, is this Jake? This is ${state.agentName}, ${state.coachFirst}'s AI assistant — you requested info about the 90-day program earlier today. Did I catch you at an okay time?`,
          )
          break
        case 'discovery': {
          const questions = [
            `Awesome — quick couple questions to see if it even makes sense to get you time with ${state.coachFirst}. What's going on with your health and training right now?`,
            `Got it. And six months from now, what would you want to be different?`,
            `That makes sense. What do you think has been getting in the way?`,
            `Okay. And why now — what made you reach out today?`,
            `Last one: if ${state.coachFirst} maps out a plan and it's a fit, are you in a spot where you could invest in yourself right now?`,
          ]
          if (state.discovery < questions.length) {
            say(questions[state.discovery++])
          } else {
            state.step = 'availability'
            say(`Perfect — let's grab you a time with ${state.coachFirst}. One sec.`)
            callTool('check_availability', {
              date_range_start: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
              date_range_end: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
              timezone: 'America/New_York',
            })
          }
          break
        }
        case 'offer': {
          const pick = /second|latter/.test(u) ? state.slots[1] : state.slots[0]
          state.step = 'booked'
          say(`${pick.spoken} it is — booking that now.`)
          callTool('book_appointment', {
            slot_start: pick.slot_start,
            lead_name: 'Jake Miller',
            lead_phone: '+15555550123',
            lead_email: 'jake@example.com',
            notes:
              'Wants to lose about 25 lbs, low energy, travels for work so time is the main obstacle. Reached out after seeing the IG ad. Confirmed ready to invest if fit.',
          })
          break
        }
        default:
          say('Got it.')
      }
      done()
    })
  })

  return new Promise((resolve) => {
    wss.on('listening', () => {
      resolve({
        port: wss.address().port,
        close: () => {
          for (const client of wss.clients) client.close()
          wss.close()
        },
      })
    })
  })
}
