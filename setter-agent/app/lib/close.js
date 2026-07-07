// Minimal Close CRM client (https://developer.close.com) — only what the
// setter needs: find-or-create leads, notes, call logs, tasks, statuses.
// Auth is HTTP Basic with the API key as username and empty password.

const BASE = 'https://api.close.com/api/v1'

export class CloseClient {
  constructor(apiKey) {
    this.headers = {
      Authorization: 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64'),
      'Content-Type': 'application/json',
    }
  }

  async req(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Close ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`)
    }
    return res.status === 204 ? null : res.json()
  }

  me() {
    return this.req('GET', '/me/')
  }

  async findLeadByPhone(phone) {
    const q = encodeURIComponent(`phone:"${phone}"`)
    const data = await this.req('GET', `/lead/?query=${q}&_limit=1`)
    return data.data?.[0] || null
  }

  // Returns the Close lead id for this person, creating the lead if new.
  async ensureLead({ firstName, lastName, phone, email, source }) {
    const existing = phone ? await this.findLeadByPhone(phone) : null
    if (existing) return existing.id
    const name = [firstName, lastName].filter(Boolean).join(' ') || phone
    const lead = await this.req('POST', '/lead/', {
      name,
      description: source ? `Source: ${source}` : undefined,
      contacts: [
        {
          name,
          phones: phone ? [{ phone, type: 'mobile' }] : [],
          emails: email ? [{ email, type: 'office' }] : [],
        },
      ],
    })
    return lead.id
  }

  note(leadId, text) {
    return this.req('POST', '/activity/note/', { lead_id: leadId, note: text })
  }

  logCall(leadId, noteText) {
    return this.req('POST', '/activity/call/', {
      lead_id: leadId,
      direction: 'outbound',
      status: 'completed',
      note: noteText,
    })
  }

  createTask(leadId, text, dueDate) {
    return this.req('POST', '/task/', { lead_id: leadId, text, date: dueDate })
  }

  async leadStatuses() {
    const data = await this.req('GET', '/status/lead/')
    return data.data || []
  }

  async setStatusByLabel(leadId, label) {
    const statuses = await this.leadStatuses()
    const match = statuses.find((s) => s.label.toLowerCase() === label.toLowerCase())
    if (!match) return false
    await this.req('PUT', `/lead/${leadId}/`, { status_id: match.id })
    return true
  }

  deleteLead(leadId) {
    return this.req('DELETE', `/lead/${leadId}/`)
  }
}
