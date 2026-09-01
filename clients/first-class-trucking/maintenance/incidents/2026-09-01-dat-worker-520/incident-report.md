# Intermittent DAT worker CRM HTTP 520

## Triage status

- Status: `TRIAGED`; repair authorized by the operating owner on 2026-09-01
- Client: First Class Trucking
- Affected path: Railway DAT worker to Render CRM job API
- Primary classification: `network`
- Confidence: medium; the failure was intermittent and was not reproduced with an edge request identifier
- Current stage: QA; `qa_passed` and `client_accepted` remain false

## Incident statement

The Railway worker intermittently logged `CRM worker request failed (520)` while polling or reporting to the Render CRM. Current Render application logs show repeated successful `POST /api/dat-worker/jobs/claim` requests returning `204`. A `204` proves the worker secret, CRM route, and queue transaction are currently working, but means only that no job was available; it is not an end-to-end DAT browser pass.

The worker produces the generic 520 message when it receives a non-success response without the CRM's normal JSON error body. The Express API normally serializes application and database errors as JSON, and no matching request was present in the Render application log during the inspected occurrence. The strongest supported explanation is therefore a transient failure on the Railway-to-Render edge path before Express, not DAT UI drift, DAT authentication, or a normal CRM exception.

Earlier Neon compute-quota errors are a separate dependency/rate-limit incident. The later successful 204 claims demonstrate that the queue database path recovered at the observed times.

## Blast radius and safety

- A failed empty-queue poll delays work until a later poll but does not submit a DAT search.
- A lost claim response can leave a job claimed until stale-claim recovery.
- A lost response from `start`, `complete`, or `fail` can make the worker uncertain whether the CRM committed the transition.
- A browser submission with an ambiguous outcome must never be automatically repeated. Existing `uncertain` handling remains mandatory.
- No evidence from this incident shows a duplicate DAT submission or a prohibited booking, contact, message, purchase, export, or account action.

## Authorized repair scope

The operating owner authorized hardening the existing virtual employee because the official API is not economically viable for this workflow. The smallest safe implementation scope is:

1. Add explicit CRM request timeouts and bounded exponential backoff with jitter for network failures and safe transient gateway responses.
2. Resume an unstarted claim owned by the same worker after a lost claim response.
3. Make identical `start`, `complete`, and `fail` callbacks idempotent while rejecting conflicting terminal outcomes.
4. Make worker readiness reflect recent successful CRM polling rather than only process existence.
5. Use deterministic production install/build/start commands and add safe operational diagnostics.

This scope does not authorize retrying DAT submissions, bypassing login/MFA/CAPTCHA, changing the approved browser workflow, or advancing the release gate without live evidence.

## Verification plan

1. Deterministic unit/contract tests for timeout/retry classification, lost-claim resume, and idempotent job callbacks.
2. Typecheck and existing RateView/Search Loads regression suites.
3. Production build verification from locked dependencies with build-time development tools explicitly included.
4. One explicitly approved fictional end-to-end job, followed by the existing five-consecutive-pass reliability target and controlled authentication/takeover cases.

## Operational workaround

While successful 204 polling continues, do not restart or reapprove work merely because of an isolated 520. Inspect the durable job state first. A pending or claimed pre-start job can be recovered safely; a running or `uncertain` job requires reconciliation before any new approval.

## Evidence index

- `clients/first-class-trucking/automation/src/worker.ts`
- `server/routes/datWorker.ts`
- `server/services/datRateViewJobs.ts`
- `server/app.ts`
- `clients/first-class-trucking/qa/qa-report.json`
- Render application logs inspected 2026-09-01; current claim responses were 204
- Railway worker logs inspected 2026-09-01; intermittent generic HTTP 520 responses were present
