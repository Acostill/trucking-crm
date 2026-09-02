# DAT Search Loads results do not appear in CRM

## Triage status

- Status: `TRIAGED`
- Triaged at: 2026-09-02T16:05:42Z
- Client: First Class Trucking
- Deployed source named by reporter: commit `1a5dbedb4ad2786d3c15f8a6c11c79c236d6ed37` (`Add DAT Search Loads virtual employee`)
- Affected workflow: `fct-dat-search-loads-offers-v1`
- Confirmed failing step: `SL-060` (populate and validate the Search Loads form)
- Primary classification: `UI drift`
- Confidence: high for a DAT equipment-option interaction-contract mismatch; medium for its exact subtype because no current DOM, screenshot, or trace was retained
- Recommended next owner: `browser_discovery` to re-observe the equipment control, then `playwright_builder` for the smallest authorized locator/value repair, followed by `reliability_qa`

## Incident statement

The CRM has no Search Loads offers to display because the confirmed Railway job failed before DAT `SEARCH` was pressed. On the current successful Railway deployment, the worker reached the Search Loads form and identified the expected start/end date controls, but timed out waiting for a visible option whose accessible name exactly matched `Reefers (Standard)`. The worker classified the error as `UI_DRIFT` at `SL-060`, stopped pre-submit, and successfully reported a failed job to the CRM API.

This is a mismatch between the delivered equipment-selection contract and the currently rendered DAT control, not evidence of a CRM results-table rendering failure. The retained artifacts do not distinguish whether DAT changed the option label, accessible role, popup structure, or availability, or whether Reefer support was insufficiently verified during the original Vans-only live discovery. Fresh, redacted browser discovery is therefore part of the proposed repair scope.

## Symptom versus evidence

### Reported symptom

- The user reports that DAT Search Loads results do not show in the CRM after commit `1a5dbed` was deployed to the Render UI/API and Railway worker.
- No current-incident CRM screenshot was supplied or captured, so this report does not claim visual inspection of the affected CRM record.

### Direct runtime evidence

1. `railway status` identified the linked production project `first-class-dat-worker`, service `dat-rateview-worker`.
2. Read-only Railway deployment inspection showed the current deployment created at `2026-09-02T15:33:58.831Z` in `SUCCESS` state. Runtime logs show the worker starting at `2026-09-02T15:34:39.774Z`.
3. Current-deployment logs contain one confirmed Search Loads failure. The failure is categorized `UI_DRIFT`, step `SL-060`, after a 30-second wait for `getByRole('option')` containing exact text `Reefers (Standard)`. The diagnostic also lists the expected start and end date inputs, showing that the Search Loads page/form had loaded far enough for semantic inspection.
4. The worker later emitted its structured job outcome with status `failed` and category `UI_DRIFT`. In `automation/src/worker.ts:95-101`, that outcome is written only after the worker's awaited POST to `/api/dat-worker/jobs/:id/fail` returns successfully. This is evidence that the Render API accepted the failure transition; it is not evidence of a worker-to-API network failure.
5. No matching `UI_DRIFT` records were returned from the three immediately preceding removed Railway deployments inspected read-only. This limits confirmed runtime impact to the one observed job; it does not prove that earlier deployments were healthy.

### Repository evidence

1. Repository `HEAD`, `origin/main`, and the reporter's deployed commit all resolve to `1a5dbedb4ad2786d3c15f8a6c11c79c236d6ed37`. The working tree had no pre-existing or triage-created implementation changes.
2. `automation/src/searchLoads.ts:172-175` requires a visible exact accessible `option`; `:245` locates the Equipment Type combobox, and `:259-260` clicks it and requires the request's exact equipment label. The runtime timeout matches this path precisely.
3. `automation/src/runner.ts:203-225` keeps `submitted=false` through form population and changes it only after all controls validate and the ledger is marked submitted. The observed `SL-060` failure therefore occurred before `submitAndExtractSearchLoads` and before the `SEARCH` click.
4. `automation/src/runner.ts:254-275` releases the reservation and records `STOPPED_PRE_SUBMIT` when a failure occurs while `submitted=false`. The confirmed job did not consume an automated DAT search submission.
5. `server/services/datRateViewJobs.ts:513-610` validates and maps a valid result to the `datLoadOffers` carrier option. `:1033-1062` persists a validated completed Search Loads result into the originating quote. `client/src/pages/EmailQuoteInboxPage.js:1218-1287` displays that option and its offers when it is available. These paths are downstream of a worker result that the failed job never produced.
6. The current local server contract test, `npm run test:dat-search-loads`, passed on 2026-09-02. It covers request mapping, completed-result validation, `datLoadOffers` mapping, option merge behavior, sort rejection, contact-data rejection, and displayed/numeric total consistency. This is deterministic evidence against a general result-mapping/merge defect, but it is not a live Render database or browser test.
7. The checked-in source hashes exactly match the deterministic QA hashes in `qa/qa-report.json`. That QA report passed local automation/server/client checks but recorded `0/5` required live Search Loads passes, no QA live DAT search, and pending browser/session/failure-path evidence.
8. Original authenticated browser discovery on 2026-08-13 staged and submitted only `Vans (Standard)`. It did not retain proof that `Reefers (Standard)` used the same exact option name/role. The current failing input is Reefer, so the exact present-day DAT equipment contract must be re-observed rather than guessed.

### Logs, traces, and screenshots

- The repository-local automation event log contains only an older RateView reuse event from 2026-08-11 and has no current Search Loads evidence.
- No current Search Loads screenshot was retained. This is consistent with the delivery policy that avoids retaining pages containing commercial rates or contact data.
- No current trace was available. Search Loads tracing is disabled by default and screenshots are intentionally omitted.
- The retained discovery Search Loads artifact is a redacted structural JSON record from 2026-08-13, not current incident evidence.

## Cause classification

Primary cause: `UI drift`.

The operational cause is an input-control contract mismatch: the currently rendered DAT equipment dropdown did not expose the requested Reefer option under the delivered exact role/name locator before the timeout. The exact subtype remains unconfirmed without fresh browser discovery. Plausible subtypes are a changed label, changed accessible role, changed popup/overlay structure, delayed option population, or a subscription-dependent availability change. The smallest next action is observation, not a speculative broader selector.

The evidence does not support the other primary classifications:

- `authentication`: the worker reached the Search Loads form and did not emit `AUTH_REQUIRED` or `needs_auth`.
- `permissions`: no access-denied or role/subscription message was observed. Option availability still must be checked during discovery because it can mimic UI drift.
- `client data`: the request reached the exact Reefer-selection step; no invalid lane/date/equipment validation error occurred before browser use.
- `environment`: the Railway deployment succeeded, the worker started, and the API accepted its failure report.
- `dependency` or `network`: no dependency-load or network/HTTP error was logged.
- `rate limit`: no throttling signal was logged.
- `business-rule change`: the approved workflow still allows mapped Reefer searches; no client rule change was supplied.

## Blast radius

- Confirmed: one Search Loads job using mapped equipment `Reefers (Standard)` failed before submission and produced no offers for its originating CRM quote.
- Likely until repaired: repeated approval of the same Reefer snapshot will reach the same equipment-selection mismatch and fail again.
- Potential: other Search Loads equipment selections share the same exact-option helper, but no current runtime evidence proves that Vans or Flatbeds are affected. Do not state that all Search Loads searches are broken based on this single Reefer failure.
- RateView uses a separate workflow and selector path; no current evidence indicates a RateView outage.
- The CRM/API result display and persistence paths were not exercised by this failed job because no result payload existed.
- No evidence shows a DAT search submission, lane-credit use, booking, contact, bid, message, post, purchase, save, export, or account action for the confirmed job.

## Safe workaround

- Do not keep reapproving the affected Reefer Search Loads snapshot; it will not produce results while the control contract remains unmatched.
- Use the existing authorized human DAT Search Loads process if a load-board result is operationally required, and record it according to client policy. Authentication, MFA, CAPTCHA, and contact actions remain human-controlled.
- Continue using connected carrier rates and RateView when available; this incident does not establish an outage in those paths.
- Do not edit the failed job, database row, credentials, permissions, or deployment configuration as a workaround.

## Smallest proposed repair scope

No repair was performed in this triage.

1. `browser_discovery`: in an explicitly authorized session, open Search Loads without submitting a search and capture a redacted semantic/DOM inventory of the Equipment Type combobox and its visible Van, Flatbed, and Reefer choices. Confirm each option's accessible role/name, popup or frame boundary, readiness signal, selected-chip readback, and whether the account exposes Reefer.
2. If Reefer remains an allowed visible choice, `playwright_builder`: change only the Search Loads equipment-selection helper and its semantic readback in `automation/src/searchLoads.ts`, plus a focused DOM-fixture regression test for all three approved equipment values. Do not weaken selection to an unbounded text match or change result extraction, server persistence, CRM rendering, credentials, or permissions.
3. If the account no longer exposes Reefer or its meaning changed, route the finding to `workflow_architect` and the client approver before changing the server mapping or approved equipment scope. Treat that as a business-rule/permissions decision, not a locator patch.

## Minimum verification scope

1. Re-run automation typecheck and focused Search Loads tests, including exact selected-value readback for Van, Flatbed, and Reefer against the newly observed structure.
2. Re-run the server `test:dat-search-loads` contract to protect result validation, mapping, and merge behavior.
3. In an authorized non-production or staged path, populate one Reefer request through `SL-060` and verify the exact selected equipment chip plus enabled `SEARCH` state without pressing `SEARCH`.
4. Only with a separate explicit per-search approval, execute one fictional read-only Reefer Search Loads query and verify: one submission, completed worker result, API persistence to `datLoadOffers`, and visible ranked rows in the originating CRM quote.
5. Return to independent QA. The workspace still requires five consecutive approved live passes and the documented failure/session checks before release acceptance.

## Release and operational readiness

The client workspace structurally validates, but it remains at stage `qa` with `qa_passed: false` and `client_accepted: false`. The Search Loads QA report records `0/5` consecutive live passes. The deployed commit should not be represented as an accepted reliability release until the existing gate requirements are satisfied.

## Evidence index

- Git commit `1a5dbedb4ad2786d3c15f8a6c11c79c236d6ed37`
- Read-only Railway status, deployment list, and current/preceding deployment logs inspected 2026-09-02
- `clients/first-class-trucking/automation/src/searchLoads.ts:172-175,238-274`
- `clients/first-class-trucking/automation/src/runner.ts:203-275`
- `clients/first-class-trucking/automation/src/worker.ts:57-101`
- `server/services/datRateViewJobs.ts:513-610,990-1096`
- `server/services/carrierQuoteOptions.ts:82-99`
- `client/src/pages/EmailQuoteInboxPage.js:920-955,1218-1287`
- `server/scripts/test-dat-search-loads.ts`
- `clients/first-class-trucking/discovery/browser-findings.md`
- `clients/first-class-trucking/discovery/search-loads-structure-redacted.json`
- `clients/first-class-trucking/discovery/workflow-spec.json`
- `clients/first-class-trucking/qa/qa-report.json`
- `clients/first-class-trucking/qa/runs/2026-08-13-search-loads-v1/summary.md`
- `clients/first-class-trucking/delivery/RUNBOOK.md`
- `clients/first-class-trucking/project-state.json`
- Prior incidents `2026-08-11-dat-worker-disabled` and `2026-08-12-local-dat-worker-disabled`
