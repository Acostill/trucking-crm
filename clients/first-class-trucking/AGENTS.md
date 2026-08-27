# Client automation workspace

Treat `project-state.json` as the gate record, `intake/client-profile.json` as the client-fact record, `discovery/workflow-spec.json` as the approved business behavior, and the browser evidence as observed UI facts.

Do not invent missing business rules, authorization, selectors, or acceptance. Record unknowns in `intake/open-questions.md` and stop the affected stage.

Never commit credentials, tokens, cookies, MFA recovery codes, Playwright storage state, raw production exports, or unnecessary personal data. Use environment variables or the client's approved secret manager. Redact screenshots and logs according to the client profile.

Do not bypass CAPTCHA, MFA, permissions, rate limits, or application controls. Require an explicit, recorded approval boundary for payments, submissions, deletions, messages, account changes, and other consequential actions.

The main Pod Lead alone updates gates in `project-state.json`. Specialist agents modify only their assigned paths:

- `client_onboarding`: `intake/`
- `workflow_architect`: `discovery/workflow-spec.json`, `intake/open-questions.md`, `intake/decisions.md`
- `browser_discovery`: `discovery/browser-findings.md`, `discovery/evidence-manifest.json`, `discovery/screenshots/`
- `playwright_builder`: `automation/` and targeted `qa/runs/`
- `reliability_qa`: `qa/`
- `client_delivery`: `delivery/`
- `automation_maintenance`: a new directory under `maintenance/incidents/`

Avoid simultaneous writes to the same path. QA reports defects to the builder and does not silently patch implementation code. Maintenance triages before any repair is authorized.
