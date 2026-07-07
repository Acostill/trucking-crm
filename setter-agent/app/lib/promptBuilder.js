import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = path.join(__dirname, '..', 'prompt.template.txt')

export function loadCoachConfig(configPath) {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

// Fills prompt.template.txt with coach config variables + per-call lead context.
// Throws if any {{variable}} is left unfilled so a broken config can never
// reach a live phone call.
export function buildPrompt(config, lead = {}) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8')
  const now = new Date()
  const tz = lead.timezone || config.timezone
  const vars = {
    ...config.variables,
    PROGRAM_FACTS: (config.variables.PROGRAM_FACTS || []).map((f) => `- ${f}`).join('\n'),
    QUALIFICATION_CRITERIA: (config.variables.QUALIFICATION_CRITERIA || [])
      .map((f) => `   - ${f}`)
      .join('\n'),
    lead_first_name: lead.firstName || 'there',
    lead_last_name: lead.lastName || '',
    lead_phone: lead.phone || 'unknown',
    lead_email: lead.email || 'not provided',
    lead_source: lead.source || 'inbound lead form',
    lead_date: lead.date || 'recently',
    lead_form_answers: lead.formAnswers || 'none provided',
    lead_timezone: tz,
    current_date: now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz,
    }),
    current_time: now.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: tz,
    }),
  }
  const out = template.replace(/\{\{([A-Za-z_]+)\}\}/g, (m, key) =>
    vars[key] !== undefined ? String(vars[key]) : m,
  )
  const missing = [...new Set([...out.matchAll(/\{\{([A-Za-z_]+)\}\}/g)].map((m) => m[1]))]
  if (missing.length) throw new Error(`Unfilled prompt variables: ${missing.join(', ')}`)
  return out
}
