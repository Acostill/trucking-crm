# Open questions

No credential values or authentication artifacts should be entered here. The remaining items do not block intake review; resolve them at the indicated later gate.

| ID | Question | Owner | Due | Affected step | Blocking? | Status |
|---|---|---|---|---|---|---|
| Q-001 | What are Jack's surname, organizational title, and preferred approval contact channel? | Jack | Before client acceptance | Governance and acceptance | No | Open |
| Q-003 | What is the exact DAT permission tier and RateView subscription attached to the shared production login? | Jack / DAT administrator (TBD) | During authorized discovery; before specification approval | Access and visible RateView outputs | No | Open |
| Q-004 | Has First Class Trucking confirmed with DAT that its shared-login use complies with its contract and licensing terms? | Jack | Before ongoing production operation | Licensing and support | No; accepted client exception for intake/discovery | Open |
| Q-006 | Which CRM/email-ingestion record initiates the on-demand run, and where should captured RateView results be written or returned? | David Castillo / Optimation AI | 2026-08-11 | Workflow trigger and output handoff | No | Resolved: an authenticated staff click on an `email_quote_requests` record creates a secured worker job; DAT results are merged into that request's `carrier_quotes` for the Quote Inbox. |
| Q-007 | Beyond DAT's documented origin, destination, and equipment-type inputs, what exact visible UI fields, ordered actions, branches, and success/failure signals apply? | David Castillo / Optimation AI | During authorized discovery; before specification approval | RateView workflow | No | Open |
| Q-008 | Which displayed labels correspond to low, average, high, rate type, timeframe, per-mile, and fuel information for this subscription, and what should be returned when an optional value is unavailable? | David Castillo / Optimation AI and Jack | During authorized discovery; before specification approval | Output mapping | No | Open |
| Q-010 | Is SSO involved, and what session lifetime or concurrent-login patterns are observed beyond the client-confirmed invalidation/logout behavior? | David Castillo / Optimation AI | During authorized discovery | Authentication and recovery | No | Open |
| Q-014 | What approved deletion mechanism will enforce the 30-day screenshot/log limit, and what retention rule applies to any trace, download, or other evidence type? | David Castillo / Optimation AI | Before build completion | Evidence and operations | No | Open |
| Q-015 | What latency target, support window, and peak concurrency should apply to the on-demand initial script? | Jack and David Castillo / Optimation AI | Before delivery | Capacity and support | No | Open |
| Q-017 | What contact channel should be used to escalate operational incidents to David Castillo / Optimation AI? | David Castillo / Optimation AI | Before delivery | Support | No | Open |
