import fs from 'node:fs'
import path from 'node:path'

// Tool schemas sent to Grok in session.update. Names/shapes match GROK_CONFIG.md.
export const TOOL_DEFS = [
  {
    type: 'function',
    name: 'check_availability',
    description: "Get open slots for the coach's booking calendar. Call before offering times.",
    parameters: {
      type: 'object',
      properties: {
        date_range_start: { type: 'string', description: 'ISO date' },
        date_range_end: { type: 'string', description: 'ISO date' },
        timezone: { type: 'string', description: "Lead's IANA timezone" },
      },
      required: ['date_range_start', 'date_range_end', 'timezone'],
    },
  },
  {
    type: 'function',
    name: 'book_appointment',
    description: "Book the lead onto the coach's call at a slot returned by check_availability.",
    parameters: {
      type: 'object',
      properties: {
        slot_start: { type: 'string', description: 'ISO datetime of the chosen slot' },
        lead_name: { type: 'string' },
        lead_phone: { type: 'string' },
        lead_email: { type: 'string' },
        notes: {
          type: 'string',
          description:
            "2-3 sentence discovery summary: situation, goal, obstacle, urgency — in the lead's own words",
        },
      },
      required: ['slot_start', 'lead_name', 'lead_phone', 'notes'],
    },
  },
  {
    type: 'function',
    name: 'send_sms',
    description: 'Text the lead a link (booking confirmation, free resource, or info page).',
    parameters: {
      type: 'object',
      properties: {
        message_type: { type: 'string', enum: ['confirmation', 'free_resource', 'info_link'] },
      },
      required: ['message_type'],
    },
  },
  {
    type: 'function',
    name: 'schedule_callback',
    description: 'Lead asked to be called back at a specific time.',
    parameters: {
      type: 'object',
      properties: {
        callback_time: { type: 'string', description: 'ISO datetime' },
      },
      required: ['callback_time'],
    },
  },
  {
    type: 'function',
    name: 'mark_do_not_contact',
    description:
      'Lead asked not to be contacted again. Suppresses them from all future outreach.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'log_outcome',
    description: 'Record the call result in the CRM. MUST be called once at the end of every call.',
    parameters: {
      type: 'object',
      properties: {
        disposition: {
          type: 'string',
          enum: [
            'booked', 'not_qualified', 'info_sent', 'follow_up', 'callback_scheduled',
            'no_answer_voicemail', 'wrong_number', 'do_not_contact', 'escalate',
          ],
        },
        summary: { type: 'string', description: '1-3 sentence summary of the call' },
      },
      required: ['disposition', 'summary'],
    },
  },
]

const SLOT_TIMES = [
  { h: 10, m: 0, label: '10:00 AM' },
  { h: 14, m: 30, label: '2:30 PM' },
]

// JSON-file-backed calendar + CRM. In production each method becomes a webhook
// to the coach's real calendar (Cal.com/Calendly/GHL) and CRM — the interface
// the agent sees stays identical.
export class ToolRuntime {
  constructor({ dataDir, config, lead, close = null }) {
    this.dataDir = dataDir
    this.config = config
    this.lead = lead
    this.close = close // optional CloseClient — Close CRM is the system of record when present
    fs.mkdirSync(dataDir, { recursive: true })
  }

  // Sync a tool result to Close without ever failing the live call — a CRM
  // hiccup must not stall the agent mid-conversation.
  async #closeSync(fn) {
    if (!this.close) return undefined
    try {
      await fn()
      return 'synced'
    } catch (err) {
      console.error('[close] sync failed:', err.message)
      return 'sync_failed'
    }
  }

  #file(name) {
    return path.join(this.dataDir, `${name}.json`)
  }

  read(name) {
    try {
      return JSON.parse(fs.readFileSync(this.#file(name), 'utf8'))
    } catch {
      return []
    }
  }

  #append(name, record) {
    const all = this.read(name)
    all.push({ ...record, at: new Date().toISOString() })
    fs.writeFileSync(this.#file(name), JSON.stringify(all, null, 2))
    return record
  }

  openSlots() {
    const booked = new Set(this.read('bookings').map((b) => b.slot_start))
    const days = Number(this.config.variables.BOOKING_WINDOW || 7)
    const tz = this.config.timezone
    const slots = []
    for (let d = 1; d <= days && slots.length < 6; d++) {
      const day = new Date(Date.now() + d * 86400000)
      const weekday = day.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz })
      if (weekday === 'Saturday' || weekday === 'Sunday') continue
      const dateStr = day.toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
      for (const t of SLOT_TIMES) {
        const slot_start = `${dateStr}T${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}:00`
        if (booked.has(slot_start)) continue
        slots.push({ slot_start, spoken: `${weekday} at ${t.label}`, timezone: tz })
        if (slots.length >= 6) break
      }
    }
    return slots
  }

  async execute(name, args = {}) {
    switch (name) {
      case 'check_availability':
        return { slots: this.openSlots() }
      case 'book_appointment': {
        const booking = this.#append('bookings', { ...args, coachId: this.config.coachId })
        this.#append('sms', {
          message_type: 'confirmation',
          to: args.lead_phone || this.lead.phone,
          body: `You're booked for your ${this.config.variables.CALL_NAME} with ${this.config.variables.COACH_NAME}. Reply CONFIRM to lock it in, or reply to reschedule.`,
        })
        const crm = await this.#closeSync(async () => {
          const leadId = await this.close.ensureLead(this.lead)
          await this.close.note(
            leadId,
            `[AI Setter] Booked: ${this.config.variables.CALL_NAME} at ${args.slot_start}\n\nDiscovery notes: ${args.notes}`,
          )
          await this.close.createTask(
            leadId,
            `${this.config.variables.CALL_NAME} with ${args.lead_name} at ${args.slot_start}`,
            String(args.slot_start).slice(0, 10),
          )
        })
        return { status: 'booked', slot_start: booking.slot_start, confirmation_sms: 'queued', crm }
      }
      case 'send_sms': {
        const links = {
          confirmation: 'booking confirmation',
          free_resource: this.config.variables.FREE_RESOURCE,
          info_link: this.config.variables.INFO_LINK,
        }
        this.#append('sms', {
          message_type: args.message_type,
          to: this.lead.phone,
          body: links[args.message_type] || 'link',
        })
        return { status: 'sent' }
      }
      case 'schedule_callback': {
        this.#append('callbacks', { callback_time: args.callback_time, lead: this.lead })
        const crm = await this.#closeSync(async () => {
          const leadId = await this.close.ensureLead(this.lead)
          await this.close.createTask(
            leadId,
            `[AI Setter] Callback requested for ${args.callback_time}`,
            String(args.callback_time).slice(0, 10),
          )
        })
        return { status: 'scheduled', callback_time: args.callback_time, crm }
      }
      case 'mark_do_not_contact': {
        this.#append('dnc', { phone: this.lead.phone, name: `${this.lead.firstName} ${this.lead.lastName}` })
        const crm = await this.#closeSync(async () => {
          const leadId = await this.close.ensureLead(this.lead)
          await this.close.note(leadId, '[AI Setter] DO NOT CONTACT — lead asked to be removed from all outreach.')
          await this.close.setStatusByLabel(leadId, 'Do Not Contact')
        })
        return { status: 'suppressed', crm }
      }
      case 'log_outcome': {
        this.#append('crm', { ...args, lead: this.lead, coachId: this.config.coachId })
        const crm = await this.#closeSync(async () => {
          const leadId = await this.close.ensureLead(this.lead)
          await this.close.logCall(leadId, `[AI Setter] Disposition: ${args.disposition}\n\n${args.summary}`)
        })
        return { status: 'logged', crm }
      }
      default:
        return { error: `unknown tool: ${name}` }
    }
  }

  snapshot() {
    return {
      bookings: this.read('bookings'),
      crm: this.read('crm'),
      sms: this.read('sms'),
      dnc: this.read('dnc'),
      callbacks: this.read('callbacks'),
    }
  }
}
