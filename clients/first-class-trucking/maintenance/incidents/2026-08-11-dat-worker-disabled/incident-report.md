# DAT worker disabled in CRM

## Triage status

- Status: `TRIAGED`
- Date: 2026-08-11
- Client: First Class Trucking
- Affected surface: CRM Quote Inbox DAT RateView card and approval path
- Primary classification: `client data` (persisted stale DAT placeholder created before enablement)
- Contributing classification: `environment` (the flag was disabled when the affected quote was last rated)
- Confidence: high. Live configuration and heartbeat evidence show that the backend and Railway worker are currently enabled and authenticated, while the selected quote still contains the earlier stored `disabled` placeholder.
- Recommended next owner: David Castillo / Optimation AI as the recorded technical and operating owner; refresh the affected quote through the existing re-rate path, then return to reliability QA.

## Incident statement

The user-reported CRM screenshot shows the DAT RateView card message `DAT worker is not enabled on the server.` The repository produces that exact text only when the CRM backend evaluates `DAT_WORKER_ENABLED` as something other than case-insensitive `true`. This occurs before a DAT job is prepared, approved, or submitted.

The evidence supports persisted quote state as the current cause, not DAT UI drift, authentication, permissions, dependency, network, rate limit, or a business-rule change. The production deployment was inspected read-only by the Pod Lead: `DAT_WORKER_ENABLED` resolves to `true`, the worker secret is present without its value being exposed, and the Railway worker is authenticated to the Render queue.

## Symptom versus evidence

### Reported symptom

- A user screenshot of the CRM DAT RateView card contains `DAT worker is not enabled on the server.` The screenshot itself was not present in the approved repository artifacts, so the incident retains the reported text rather than copying or claiming visual inspection of the original.

### Direct evidence

1. `server/services/datRateViewJobs.ts:64-66` defines enablement as `String(process.env.DAT_WORKER_ENABLED || '').toLowerCase() === 'true'`.
2. `server/services/datRateViewJobs.ts:248-254` returns a `disabled` DAT placeholder with the exact reported message whenever that check is false.
3. `server/services/datRateViewJobs.ts:283-290` independently blocks the staff approval endpoint with HTTP 503 when the same check is false. Therefore the symptom is generated before any DAT browser or network activity.
4. `server/.env.example:30-33` defaults the feature flag to false, while `README.md:82-97` and `automation/README.md:46-63` require the hosted CRM backend to set the flag to true and configure the worker secret server-side.
5. Safe local reproduction with `DAT_WORKER_ENABLED=false` invoked `prepareDatRateViewOptions` using an empty synthetic request. It returned the exact `disabled` card and message without connecting to DAT or submitting a lookup.
6. `npm run test:dat-rateview` passed the non-production server integration contract. This reduces the likelihood of a general request/result mapping defect but does not verify deployment configuration.
7. The retained discovery screenshot and evidence manifest confirm that the approved DAT Quick Rate Lookup UI was reachable on 2026-08-11 and that an approved fictional lookup completed. This does not verify the CRM queue deployment, but it weighs against DAT UI drift as the cause of this pre-browser message.
8. Read-only Render inspection on 2026-08-11 confirmed `DAT_WORKER_ENABLED=true`; `DAT_WORKER_SECRET` is configured, with its value neither read nor recorded.
9. Render application logs showed the Railway worker successfully calling `POST /api/dat-worker/jobs/claim` about every five seconds and receiving HTTP `204`, including calls at 1:31:18 PM through 1:31:55 PM. This proves the current shared secret is accepted and the worker-to-backend connection is healthy.

### Missing or non-probative evidence

- No restart record showing exactly when the feature flag became effective was retained.
- Railway's own worker log was not needed because the Render queue heartbeat supplied equivalent connectivity evidence.
- No incident trace exists. Traces are intentionally disabled by default because they may contain commercially confidential data, and this failure occurs before Playwright starts.
- The local automation event log contains only a stored-result reuse event and does not demonstrate hosted queue health.
- There are no prior incident directories for this client.

## Reproduction

Authorized non-production reproduction succeeded without production access, credentials, browser launch, database writes, or a DAT search:

1. Set only the test process's `DAT_WORKER_ENABLED` value to false.
2. Invoke `prepareDatRateViewOptions` with a synthetic request.
3. Observe one DAT placeholder with status `disabled` and the exact reported message.

The existing server DAT integration contract also passed. No live endpoint, worker queue, or DAT account was exercised.

## Cause classification

Primary cause: `client data` (persisted stale quote state), with an earlier `environment` condition as the contributor.

The immediate cause is deterministic: the CRM backend process did not see the exact enabling value when it created the affected card. The production flag is now true and the worker heartbeat is healthy, but the DAT placeholder is stored in `carrier_quotes`; reading the record does not regenerate it. The affected quote therefore continues showing the old disabled card until it passes through the approved re-rating/preparation path.

The retained evidence does not distinguish exactly why the flag was false when the quote was originally rated. Earlier possibilities were:

- the variable is absent;
- it is set to false or another malformed value;
- it was changed but the running process was not restarted/redeployed;
- the quote was rated before the later configuration correction became effective.

## Blast radius

- All email quote records newly rated or re-rated while the backend process evaluates the flag as disabled receive the disabled DAT card.
- The CRM disables `Approve & run DAT lookup` for records whose DAT status is `disabled`, and direct approval requests are rejected with HTTP 503 while the flag remains false.
- Forward Air and ExpediteAll rating remains available by design; this incident does not indicate a whole-CRM outage.
- No evidence indicates that a DAT lane lookup, lane credit, booking, posting, message, purchase, deletion, or account change occurred because of this failure.
- Previously stored completed DAT results may remain visible until a record is re-rated. Previously queued jobs are a separate state: the worker claim routes do not use this feature flag, so their status must be inspected rather than inferred from the card.

## Safe workaround

- Continue using the connected carrier rates already available in the CRM.
- If business operations require a DAT benchmark before repair, an authorized human may use the existing approved manual RateView process and record the result according to client policy. Do not automate authentication or repeat an uncertain lookup.
- Do not repeatedly retry the disabled CRM action. It cannot create a new job while the server-side guard is false.

## Smallest proposed repair scope

No application, Playwright, credential, or deployment change is indicated for this incident.

1. Re-rate only the affected quote through the existing authorized CRM path: use **Parse email again**, or save the shipment details to refresh connected carrier rates.
2. Confirm the DAT card changes from `disabled` to `awaiting_approval`.
3. Do not rotate the worker secret or redeploy either service; current heartbeat evidence shows both are already connected.
4. Do not bulk-update production records without separate authorization.

## Verification scope

The minimum verification after the configuration repair is:

1. Read-only backend check: call the existing secured DAT worker status endpoint and confirm `enabled` is true. Do not log the request secret.
2. Controlled quote check: in an authorized non-production environment, rate one synthetic quote with a supported equipment type and confirm the DAT card becomes `awaiting_approval`, not `disabled`.
3. Queue contract check: with explicit test authorization, approve that synthetic quote once and confirm exactly one pending job is created. Do not initiate a DAT search as part of this configuration check.
4. Worker check: confirm the worker health endpoint is healthy and that it can authenticate to the CRM queue. Use a no-job poll or an isolated synthetic job; avoid claiming unrelated production work.
5. Only under separate explicit approval, perform one fictional read-only end-to-end DAT lookup and verify the stored result, single submission, and duplicate protection.
6. Return the repaired build/configuration to independent QA. The existing release target of five consecutive approved live passes and the session-recovery checks remains unmet.

## Release and operational readiness note

The client workspace records stage `qa`, `qa_passed: false`, and `client_accepted: false`. The acceptance report has no delivered version, and the delivery runbook is still entirely TBD. Accordingly, this incident is triaged, but the artifacts do not support treating the automation as an accepted release. Production operation should not be represented as handed off until the existing release gates and runbook are completed.

## Evidence index

- `server/services/datRateViewJobs.ts:64-66,248-254,283-290`
- `server/services/emailQuoteWorkflow.ts:264-285`
- `server/routes/emailQuotes.ts:220-229`
- `client/src/pages/EmailQuoteInboxPage.js:824-833`
- `server/.env.example:30-33`
- `README.md:82-109`
- `clients/first-class-trucking/automation/README.md:46-120`
- `clients/first-class-trucking/discovery/evidence-manifest.json`
- `clients/first-class-trucking/discovery/screenshots/060-RV-060-quick-rate-ready.png`
- `clients/first-class-trucking/qa/qa-report.json`
- `clients/first-class-trucking/project-state.json`
- `clients/first-class-trucking/delivery/acceptance-report.json`
- `clients/first-class-trucking/delivery/RUNBOOK.md`
- Git change `f9afc8a3ed3a454f3aa0331007bc8aec06db4ec5` (`Add DAT RateView cloud worker integration`, 2026-08-11)
