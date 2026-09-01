# Production Search Loads QA attempt 001

## Verdict

`BLOCKED`

The first authorized production QA attempt failed before submission because a delayed DAT authentication redirect was not classified by the worker's authenticated-page opener. No DAT Search Loads query was submitted, no credit was consumed, and this attempt earns no consecutive-pass credit. Release remains blocked at `0/5` consecutive live passes by open defect `FCT-SL-004`.

## Tested version and environment

- Workflow: `fct-dat-search-loads-offers-v1`
- Specification: `0.6-approved-search-loads-v1`
- CRM/API deployment: Render source `db30a19`
- DAT worker deployment: Railway source `d6a1950`
- Environment: client-authorized production CRM, production DAT One, and production Railway worker
- Dataset: one fictional immutable CRM Search Loads snapshot identified as `QA TEST FCT DAT CLOUD 001`
- Server job ID: `dat-search-job-59fc6f6a-8524-4d18-bfb4-8c7c5e209070`
- Worker run ID: `83f7e655-360d-4d7b-b96a-9d99bda2b4d3`

No lane values, rates, contact data, credentials, authentication artifacts, screenshots, or raw browser evidence are retained in this QA record.

## Authorization and execution boundary

- The user explicitly approved the single immutable CRM snapshot immediately before this attempt.
- The CRM approval request succeeded, and the worker claimed and started the job.
- The safe worker audit recorded `SL-020 RESERVED` with `submittedToday=0`.
- Browser execution stopped before `SL-080` with `UNKNOWN / STOPPED_PRE_SUBMIT`, `durationMs=11238`, and `errorCategory=UNEXPECTED_ERROR`.
- No `SL-080 / SUBMITTED_ONCE` event exists.
- The audit count remained `submittedToday=0`.
- No worker runtime run directory or failure evidence was created. This directory is the redacted QA incident record only.
- The CRM returned safely to a failed/waiting state and made the approval action available again. It was not activated a second time.

## Failure evidence and classification

The worker expected exactly one Search Loads `Origin` combobox but observed zero after the five-second locator bound. A read-only diagnostic then showed the page at the approved DAT login boundary pattern `https://login.dat.com/u/login/identifier`, with no Origin, Destination, or SEARCH controls.

This is a delayed authentication redirect between the initial navigation check and Search Loads form staging. `openAuthenticatedTools` did not reclassify the redirect as `AUTH_REQUIRED`; form population instead surfaced an untyped Playwright count assertion, which the runner recorded as `UNKNOWN / UNEXPECTED_ERROR` and the CRM recorded as a generic failed job.

Expected behavior under `SL-030` and `SL-040` is to classify this as authentication loss, stop before form entry and submission, and route the worker result to `needs_auth` for human takeover. The no-submission boundary held, but the required classification and takeover path did not.

## Result accounting

| Measure | Result |
|---|---:|
| Authorized production QA attempts | 1 |
| DAT searches submitted | 0 |
| Credits consumed by this attempt | 0 |
| Successful live passes | 0 |
| Consecutive live pass streak | 0/5 |
| Prohibited DAT actions | 0 observed |

This is a failed pre-submit QA case, not a live Search Loads pass.

## Release blocker and required retest

`FCT-SL-004` is release-blocking until independent evidence demonstrates all of the following:

1. A controlled delayed redirect to either approved DAT login URL pattern after initial navigation is classified as `AUTH_REQUIRED` at `SL-030`/`SL-040`, not as `UNKNOWN` or `UNEXPECTED_ERROR`.
2. The worker sends the CRM a `needs_auth` terminal state, performs no Search Loads form interaction, emits no `SL-080 / SUBMITTED_ONCE`, and leaves submission accounting unchanged.
3. After human reauthentication, a fresh fictional immutable snapshot receives a new explicit single-search approval and completes one end-to-end production search with exactly one `SL-080 / SUBMITTED_ONCE`, validated CRM readback, and no prohibited action.
4. The successful repaired run is the first pass in a new five-consecutive-pass sequence; the remaining four isolated fictional runs also pass with separately recorded approvals.

No additional production search is authorized by this QA record.
