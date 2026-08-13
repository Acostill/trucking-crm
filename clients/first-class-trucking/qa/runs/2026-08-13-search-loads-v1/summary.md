# Search Loads v1 independent reliability QA run

- Date: 2026-08-13 America/New_York
- Verdict: `BLOCKED / PENDING_LIVE_RELIABILITY`
- Workflow: `fct-dat-search-loads-offers-v1`
- Specification: `0.6-approved-search-loads-v1`
- Repository HEAD: `53490fd8407bd9b981bca67b7e5a17474602e878` plus the source hashes in `qa-report.json`
- Environment: local macOS, Node.js v25.8.1, npm 11.11.0
- Dataset: isolated synthetic requests/results and redacted approved browser structure
- Live DAT searches executed by QA: 0
- Consecutive live passes: 0/5

No live DAT submission, contact action, booking, bid, message, post, save/favorite, export/download, purchase, payment, or account action was performed.

## Results

| Check | Passed | Failed | Notes |
|---|---:|---:|---|
| Automation TypeScript | 1 | 0 | `tsc --noEmit` |
| Automation unit suite | 12 | 0 | Ranking, exclusions, redaction, empty outcomes, ledger reuse, validation, impossible date |
| Server TypeScript | 1 | 0 | `tsc --noEmit` |
| Search Loads server contract | 1 | 0 | Request mapping, persistence mapping, sorting, contact rejection, displayed/parsed total equality |
| RateView regression | 1 | 0 | Passed independently before repair retest |
| Truck-assignment regression | 1 | 0 | Passed independently before repair retest |
| Quote Inbox page ESLint | 1 | 0 | Only dependency-age informational warnings |
| CRM optimized production build | 1 | 0 | Passed; unrelated pre-existing lint/tooling warnings remain |
| Targeted repaired-defect reproductions | 3 | 0 | FCT-SL-001 through FCT-SL-003 |
| Live consecutive reliability | 0 | 5 required | Not authorized in this QA task |

## Repaired defects independently verified

- `FCT-SL-001`: The approval control now compares every visible fingerprinted lane/date/equipment field with the saved shipment snapshot. Unsaved changes keep approval disabled.
- `FCT-SL-002`: A payload with displayed `$1,000` and numeric `9999` now fails server validation. Duplicate ranked IDs and invalid equal-rate source order are also rejected.
- `FCT-SL-003`: An otherwise valid request with `2026-02-31` now fails at `SL-010` before browser use; the automation suite includes this regression case.

## Commands

```text
cd clients/first-class-trucking/automation && npm run check
cd server && npx tsc --noEmit
cd server && npm run test:dat-search-loads
cd server && npm run test:dat-rateview
cd server && npm run test:truck-assignment
cd client && npx eslint src/pages/EmailQuoteInboxPage.js
cd client && CI=false npm run build
```

The first sandboxed automation test attempt was blocked because `tsx` could not create its local IPC socket (`EPERM`). It was rerun with the approved scoped `npm run check` escalation and passed 12/12. This was an environment restriction, not a product failure.

## Release boundary

Deterministic build quality is green and no implementation defect remains open. Release QA cannot pass because policy requires five consecutive isolated representative live DAT searches plus live or safely controlled evidence for session expiry/human takeover, permission changes, slow responses, post-submit uncertainty/partial completion, and a no-prohibited-action trace audit. Those cases were not authorized and were not simulated as passes.
