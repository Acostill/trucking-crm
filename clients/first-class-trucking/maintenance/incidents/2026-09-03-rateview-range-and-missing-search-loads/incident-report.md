# DAT RateView range extraction and missing Search Loads

## Status

Repair authorized on 2026-09-03. The affected production RateView job remains `uncertain` and is not reset or resubmitted by this repair.

## User-visible symptom

One completed DAT browser search did not produce a RateView benchmark in the CRM. The same legacy quote also had no Search Loads job, so its market-offer section remained empty.

## Evidence and classification

- The worker reserved and submitted the RateView fingerprint once, then reported `EXTRACTION_UNVERIFIED` at `RV-100` immediately after the result view appeared.
- The retained safe artifact proves the pre-submit state. No result payload was persisted because the range parser rejected the displayed result contract.
- The delivered parser accepted only ASCII hyphens, whole-dollar totals, and `/mi` in one exact combined total/per-mile range shape.
- The quote was priced before automatic dual-workflow queueing was deployed. Its later manual control requested only RateView, so no Search Loads job existed.
- The resulting primary classifications are `UI/result-contract drift` for RateView and `legacy orchestration gap` for Search Loads. Authentication, permissions, deployment availability, and CRM rendering were not the causes of these two symptoms.

## Repair

1. Normalize DAT spacing and accept only bounded verified range variants: hyphen/en-dash/em-dash, decimal totals, `/mi` or `/mile`, and a total-only range.
2. Recognize a blank verified range field or a small exact allowlist of explicit unavailable-range labels. Persist null optional range values plus a safe reason while keeping the displayed average benchmark usable.
3. Keep every other unmatched range string fail-closed as `EXTRACTION_UNVERIFIED`; a post-submit failure remains `uncertain` and cannot be retried automatically.
4. Add an authenticated combined manual retry endpoint. It attempts RateView and Search Loads independently, never resets an uncertain fingerprint, and permits a missing counterpart job to be queued.
5. Expose a `Queue missing DAT searches` control for eligible legacy CRM records that do not yet have a Search Loads job.

## Verification contract

- Parser tests cover the original range, alternate dash and `/mile` formatting, total-only ranges, explicit unavailable ranges, and rejection of ambiguous text.
- The redacted result-state screenshot is captured before parsing so a post-submit extraction failure still retains permitted diagnostic evidence.
- Server contract tests cover null optional ranges with a required reason and reject missing reasons.
- Queue tests prove automatic idempotency, manual reset of pre-submit failures, preservation of uncertain RateView state, and independent creation of a missing Search Loads job.
- Typecheck, worker tests, server tests, client production build, workspace validation, deployment health, and a read-only production UI inspection are required before closure.

## Operational note

This code cannot retroactively recover the unretained RateView values from the existing uncertain job. Staff must reconcile that job before any future resubmission. Search Loads may be queued independently only while the saved pickup date and shipment snapshot remain valid.
