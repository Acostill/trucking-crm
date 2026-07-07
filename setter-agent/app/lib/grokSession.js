import WebSocket from 'ws'
import { buildPrompt } from './promptBuilder.js'
import { TOOL_DEFS } from './tools.js'

// One live call: a WebSocket session against the Grok Voice Agent API
// (wss://api.x.ai/v1/realtime, OpenAI Realtime-compatible) or the local mock.
// Executes tool calls server-side via ToolRuntime and reports everything that
// happens through onEvent() so the caller (browser relay, test, or eval) can
// observe the call.
export class GrokSession {
  constructor({ url, apiKey, config, lead, tools, onEvent }) {
    this.url = url
    this.apiKey = apiKey
    this.config = config
    this.lead = lead
    this.tools = tools
    this.onEvent = onEvent
    this.handledCalls = new Set()
    this.transcript = [] // {role, text} — full call transcript for QA/eval
    this.toolLog = [] // {name, args, result}
    this.pendingText = ''
    // Response lifecycle counters: a turn is only settled when every response
    // we've requested (including ones chained after tool outputs) has completed.
    this.responsesCreated = 0
    this.responsesCompleted = 0
  }

  connect() {
    return new Promise((resolve, reject) => {
      const headers = this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}
      this.ws = new WebSocket(this.url, { headers })
      this.ws.on('open', () => {
        this.#send({
          type: 'session.update',
          session: {
            instructions: buildPrompt(this.config, this.lead),
            voice: this.config.voice || 'ara',
            turn_detection: { type: 'server_vad' },
            reasoning: { effort: 'high' },
            tools: TOOL_DEFS,
            audio: {
              input: { format: { type: 'audio/pcm', rate: 24000 } },
              output: { format: { type: 'audio/pcm', rate: 24000 } },
            },
          },
        })
        resolve()
      })
      this.ws.on('message', (raw) => this.#handle(JSON.parse(raw.toString())))
      this.ws.on('error', (err) => {
        this.onEvent({ type: 'error', message: err.message })
        reject(err)
      })
      this.ws.on('close', () => this.onEvent({ type: 'closed' }))
    })
  }

  #send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj))
  }

  settled() {
    return this.responsesCompleted >= this.responsesCreated
  }

  #createResponse() {
    this.responsesCreated++
    this.#send({ type: 'response.create' })
  }

  // The agent speaks first on a phone call.
  startCall() {
    this.#createResponse()
  }

  sendUserText(text) {
    this.transcript.push({ role: 'user', text })
    this.#send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    })
    this.#createResponse()
  }

  sendAudioChunk(base64Pcm) {
    this.#send({ type: 'input_audio_buffer.append', audio: base64Pcm })
  }

  async #handleFunctionCall({ call_id, name, arguments: argsJson }) {
    if (!call_id || this.handledCalls.has(call_id)) return
    this.handledCalls.add(call_id)
    // Reserve the follow-up response slot BEFORE the (async) tool execution so
    // settled() can never report true while a tool chain is in flight.
    this.responsesCreated++
    let args = {}
    try {
      args = JSON.parse(argsJson || '{}')
    } catch {
      /* leave args empty; tool will report what's missing */
    }
    this.onEvent({ type: 'tool_call', name, args })
    const result = await this.tools.execute(name, args)
    this.toolLog.push({ name, args, result })
    this.onEvent({ type: 'tool_result', name, result })
    this.#send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id, output: JSON.stringify(result) },
    })
    this.#send({ type: 'response.create' }) // slot already reserved above
  }

  #handle(msg) {
    const t = msg.type || ''
    // Transcript text (Grok/OpenAI event-name variants)
    if (t.endsWith('audio_transcript.delta') || t.endsWith('output_text.delta') || t === 'response.text.delta') {
      this.pendingText += msg.delta || ''
      this.onEvent({ type: 'agent_text_delta', delta: msg.delta || '' })
      return
    }
    if (t.endsWith('audio_transcript.done') || t.endsWith('output_text.done') || t === 'response.text.done') {
      const text = msg.transcript || msg.text || this.pendingText
      this.pendingText = ''
      if (text) {
        this.transcript.push({ role: 'agent', text })
        this.onEvent({ type: 'agent_text', text })
      }
      return
    }
    if (t.endsWith('audio.delta') && msg.delta) {
      this.onEvent({ type: 'audio', data: msg.delta })
      return
    }
    // Lead's own speech transcribed by Grok's ASR
    if (t.includes('input_audio_transcription') && (msg.transcript || msg.text)) {
      const text = msg.transcript || msg.text
      this.transcript.push({ role: 'user', text })
      this.onEvent({ type: 'user_transcript', text })
      return
    }
    if (t === 'response.function_call_arguments.done') {
      this.#handleFunctionCall(msg)
      return
    }
    if (t === 'response.output_item.done' && msg.item?.type === 'function_call') {
      this.#handleFunctionCall(msg.item)
      return
    }
    if (t === 'response.done') {
      this.responsesCompleted++
      this.onEvent({ type: 'turn_done', settled: this.settled() })
      return
    }
    if (t === 'error') {
      this.onEvent({ type: 'error', message: msg.error?.message || JSON.stringify(msg) })
    }
  }

  close() {
    try {
      this.ws?.close()
    } catch {
      /* already closed */
    }
  }
}
