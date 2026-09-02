# DAT Search Loads equipment-control repair

Status: `DETERMINISTIC_QA_PASSED / RELEASE_BLOCKED`

## Scope

- Reconciled the checked-in worker with the newer source running on Railway before applying the repair.
- Preserved the deployed authentication-readiness, shared-session recovery, Search Loads UI diagnostics, current results-counter/sort locators, CRM transport retries, callback idempotency, and worker health behavior.
- Kept the request/result identity labels unchanged and added a browser-only mapping:
  - `Vans (Standard)` -> `Vans (Standard)`
  - `Flatbeds (Standard)` -> `Flatbeds`
  - `Reefers (Standard)` -> `Reefers`
- Scoped Equipment Type through `input[data-test="equipment-type-dropdown"]`, activated `.summary-element[contenteditable="true"]`, removed every stale selected chip, targeted an exact primary label inside `mat-option[role="option"]`, and required one exact selected-chip readback.
- Missing or ambiguous options fail as `UI_DRIFT`; failed removal, multiple chips, no selected chip, or mismatched readback fail as `FORM_VALUE_REJECTED`. These branches do not activate `SEARCH`.

## Railway source reconciliation

Read-only Railway inspection was used; no secret, browser profile, storage state, or result data was copied.

The reconstructed local SHA-256 hashes exactly matched the running Railway source before the equipment-specific edit for:

- `rateview.ts`: `b8c764d32f45400c856effb39c158755130be796615876205ccbab87c35396a6`
- `runner.ts`: `cf286c14b0b0dcb04f513d44ae65c238cea58a900a4933f03845e434756ed475`
- `worker.ts`: `725160c4f6e12b668811f0dddb6ce609ecd2c6261b468fffcd3b0c929c356614`
- `workerConfig.ts`: `1b7da99c84126d6b8fa822524364429e5e0abf99dfb93515223c786c2f671e30`
- `workerHealth.ts`: `fcc2feac6de9ca253612b01b6491e2921f4c491ce38a9ff5a81ef6f08f6f9afd`
- `workerTransport.ts`: `e7473d605476f8fed2bc56853d85d3c290823e80b9f29a883bf5d2ffb4c6a403`
- `inspectSearchLoadsState.ts`: `3cea3c54d36e39e45b59ab4376e5c20c324da4d5393d11a28ecb2b929fd6cdb9`

The deployed `searchLoads.ts` baseline hash was `1ef22c59dd91f9880b42d431ea82e3f3cf2795e353aa85b25b6580b9d5eb7eef`; it is intentionally different after this repair.

## Verification

- `npm run typecheck`: passed.
- `npm test`: passed, 28/28. The first sandboxed attempt could not create the temporary `tsx` IPC socket (`EPERM`); the approved rerun passed.
- `npm run check`: passed (`tsc --noEmit` plus 28/28 tests).
- Client workspace validation: structurally valid; existing nonblocking TBD warnings remain.
- DOM-fixture coverage proves all three mappings, stale-chip clearing, sole-chip readback, ambiguous-option `UI_DRIFT`, multiple-chip `FORM_VALUE_REJECTED`, and zero `SEARCH` activations.

No live DAT search was submitted and no deployment was performed.

## Post-rebase merged verification

The original builder checks above were run before the repair was rebased. Final merged verification used `origin/main 1ea3e4e + this repair commit` and produced:

- merged automation `npm run check`: passed, `33/33` tests;
- independent Equipment Type QA suite: passed, `6/6` tests, including zero `SEARCH` activations across the injected success and failure states;
- focused server contracts: passed, `3/3` scripts covering DAT Search Loads, DAT RateView, and the worker state machine.

These post-rebase results supersede the narrower original `28/28` automation count for final merged-source reporting while preserving it as historical builder evidence.

## Remaining QA

- In an authorized staged session, exercise `SL-060` through exact Reefer chip readback and enabled `SEARCH` without pressing `SEARCH`.
- `FCT-SL-004` remains open pending independent controlled and live retest of delayed authentication redirect classification; deterministic passing tests do not close the defect.
- A live fictional search still requires a separate explicit per-search approval.
- The workspace release gate remains blocked at 0/5 required consecutive live Search Loads passes; deterministic tests do not advance it.
