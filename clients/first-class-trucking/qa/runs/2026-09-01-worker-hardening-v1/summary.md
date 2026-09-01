# DAT worker hardening v1 — deterministic QA

## Verdict

`READY_FOR_LIVE_QA`

No deterministic release-blocking defect was found in the 2026-09-01 worker hardening. This verdict means the repair is ready for an explicitly approved live QA sequence; it does not pass the release gate. No DAT search, credential access, or live-service mutation was performed. The live reliability gate remains blocked at 0/5 consecutive passes.

## Tested version and environment

- Repository base HEAD: `1554d585be41bdda3bfb05d1b4de046a76f1a587`
- Scope: current worker-hardening working tree for `fct-dat-search-loads-offers-v1`, specification `0.6-approved-search-loads-v1`
- Independent environment: local macOS, Node.js `v25.8.1`; synthetic/local data only
- Coordinated build evidence supplied by the Pod Lead: production client and landing builds, compiled server startup/health behavior, and client workspace validation

## Deterministic evidence

Independent source-to-spec review verified:

- CRM request retries wrap only queue claims and server-idempotent `start`, `complete`, and `fail` callbacks. The DAT browser workflow is invoked once per claimed job and is outside the transport retry loop.
- A lost claim response can be resumed by the same stable worker ID while the job remains claimed and unstarted, without incrementing the attempt count.
- Repeated `start` is accepted only for the same running job. Identical `complete` and `fail` terminal callbacks are accepted; conflicting terminal outcomes are rejected with conflict semantics.
- Network errors, timeouts, HTTP `502`, `503`, `504`, and `520` use bounded attempts and exponential backoff with jitter. HTTP `429` is retried only with a valid `Retry-After` not exceeding the configured cap. Other responses fail without retry.
- Idle readiness is based on the last successful CRM poll and becomes stale after the configured threshold. An active browser job remains ready to prevent an infrastructure restart during a potentially consequential submission.
- Render production commands consistently use locked installs, a compiled build, `npm start`, and `/api/health`.

Independent commands and results:

```text
./node_modules/.bin/tsc --noEmit false --outDir emitted --rewriteRelativeImportExtensions true
node --test --test-concurrency=1 emitted/tests/*.test.js
```

- Automation TypeScript compilation: passed.
- Automation tests: 25 passed, 0 failed. Coverage included ledger reuse, validation, parsing, Search Loads ranking/redaction, worker configuration bounds, readiness, transient status and network retries, timeout classification, bounded `429`, and non-idempotent no-retry behavior.

```text
npm exec -- tsc --noEmit
npm run test:dat-worker-state
npm run test:dat-rateview
npm run test:dat-search-loads
npm run test:truck-assignment
```

- Server TypeScript check: passed.
- Worker state-machine idempotency suite: passed.
- RateView contract regression: passed.
- Search Loads contract regression: passed.
- Truck-assignment regression: passed.

Coordinated Pod Lead results reviewed for the same working tree:

- Automation strict typecheck and 25 emitted-JavaScript tests passed.
- Client and landing production builds passed. The landing build used a disposable dependency copy after clearing a local macOS quarantine attribute from its native binding; this was an environment-only workaround, not a source change.
- Compiled server started successfully; `/api/health` returned `503` when its database dependency was intentionally unavailable.
- Client workspace validation passed.

## Limitations

- The direct `npm run check` attempt could not use the absent in-worktree automation dependencies. An isolated locked install completed, but the Node.js 25 `tsx` parallel runner stopped its esbuild transform service. Compiling the identical sources/tests and executing the emitted JavaScript avoided that local runner incompatibility and produced the 25/25 result above.
- State-machine coverage uses the deterministic fake-client contract; the deployed database and edge-path behavior still require end-to-end observation.
- Readiness intentionally remains healthy for an active browser job even if CRM polling is old. This avoids restarting a possible in-flight submission, but operational monitoring must separately alert on an abnormally long active job.
- No live DAT browser state, session expiry, permission change, popup/frame drift, or ambiguous post-submit condition was exercised.

## Exact remaining live cases

1. Run one explicitly approved fictional CRM job end to end through Render, Railway, one DAT search activation, result validation, idempotent completion, and CRM readback.
2. Complete five consecutive isolated representative live searches, each with a distinct request/fingerprint and an explicit approval immediately before the search.
3. Exercise live or safely controlled session expiry, manual reauthentication, MFA/CAPTCHA takeover, timeout/denial, fresh form staging, and a new approval checkpoint without duplicate submission.
4. Exercise permission/subscription denial and unexpected popup/frame or semantic UI drift, confirming fail-closed behavior and zero prohibited actions.
5. Exercise slow pre-submit behavior within and beyond its bound, confirming no duplicate entry or activation.
6. Exercise slow post-submit results, post-submit timeout/authentication loss, partial completion/finalization, and an identical rerun, confirming `uncertain`/reconciliation behavior and no second DAT submission.
7. Preserve safe structured evidence proving exactly one search activation, correct terminal CRM state/readback, and no booking, contacting, bidding, messaging, posting, purchasing, saving, exporting, downloading, deletion, or account action.

Deterministic readiness is complete; release remains `BLOCKED / PENDING_LIVE_RELIABILITY` until these cases satisfy the configured gate.
