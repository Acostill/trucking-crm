# DAT test quote returned no verified results

## Triage status

- Status: `TRIAGED`
- Triaged at: 2026-09-04
- Affected quote: `TEST RFQ – Selma CA to Los Angeles CA – 09/08/2026`
- Affected workflows: DAT RateView and DAT Search Loads
- Primary classifications: `UI/result-contract drift` and `client-data parsing`
- Repair status: authorized by the user; second extraction repair implemented locally and pending deployment verification

## User-visible symptom

The email quote reached the production CRM and connected carrier pricing completed, but no verified DAT RateView benchmark or DAT Search Loads offers appeared.

## Direct production evidence

1. The CRM received the message at 9:27 AM and parsed the lane as Selma, CA 93662 to Los Angeles, CA 90001 with pickup date 2026-09-08.
2. The CRM shows the Railway DAT worker as connected.
3. Railway deployment `3dcc1ba0-cf26-4992-b404-b47368dae5e6` is successful and the worker accepted both jobs.
4. RateView job `dat-job-1f1e004f-60c2-4cd1-b753-dc642522cd46` reached post-submit extraction, then failed closed at `RV-100` with `EXTRACTION_UNVERIFIED`: `Could not parse average per-mile rate.` The worker reported the job as `uncertain`, so an automatic retry is intentionally blocked.
5. Search Loads job `dat-search-job-ee4690be-8049-426c-94a5-71aa8b2d668f` failed pre-submit at `SL-060` with `UI_DRIFT`. DAT exposed one exact `Selma, CA` option, but Playwright timed out while waiting for that resolved option to become safely clickable. No Search Loads `SEARCH` submission was made.
6. After the two terminal transitions, the worker continued polling the CRM normally and received `204` responses, showing that no pending job remained.
7. The email explicitly said `Dry freight`, but the CRM parsed it as temperature-controlled, assigned `Reefer Cargo Van`, and mapped DAT equipment to `Reefer`. This did not cause the observed origin-option timeout, but it is a separate input-parsing defect and made the DAT request differ from the intended test.

## Cause classification

- RateView: result-contract drift. DAT displayed an average per-mile value that the current strict parser could not verify.
- Search Loads: UI drift in the origin autocomplete interaction. The approved exact option was present, but its Material option did not become safely clickable under the current interaction contract.
- Quote parsing: client-data parsing defect. Explicit dry-service text did not suppress an inferred `temperature_control` object from the language-model parse.

The evidence does not support worker offline, authentication loss, a CRM rendering defect, network failure, or a genuine zero-results response.

## Safe operating state

- Do not retry the uncertain RateView job automatically; reconcile it before any new RateView submission for the same fingerprint.
- The failed Search Loads job was pre-submit and did not consume a DAT search submission.
- Forward Air and ExpediteAll pricing on the quote remains usable subject to normal staff verification.

## Smallest proposed repair scope

1. Capture the current displayed RateView average-per-mile text in a redacted diagnostic and extend the parser only for the verified format.
2. Repair the Search Loads city-option click so one already-resolved exact Material option can be selected deterministically, with regression coverage for stale and animated options.
3. Add deterministic dry-service parsing so phrases such as `dry freight` set `temperatureControlled: false` and remove hallucinated temperature ranges before truck assignment.
4. Run focused automation tests, server truck-assignment/parser tests, and one separately approved live fictional quote. Verify both DAT payloads persist and render in the CRM.

## Implemented repair

1. The first RateView repair accepted a bare currency value when DAT renders the unit outside `.rate-permile`, while retaining the existing `/mi` and `per mile` contracts.
2. Search Loads still requires one exact, enabled city option. When DAT keeps that verified Material option animated, the worker bypasses only the stability wait and then verifies that the field retained the exact requested city before it can proceed to `SEARCH`.
3. Explicit dry-service phrases now override a contradictory model-generated temperature range before automatic truck assignment. The test case maps to `Cargo Van` and DAT `Van`.
4. The full worker suite passed 48/48 tests. Server automatic-queue, Search Loads contract, truck-assignment, TypeScript, and production builds passed. Existing build warnings are unrelated to this repair.

## First repair production verification

Commit `f97833c` was deployed successfully to Render and Railway. A new fictional dry-freight email, `DAT E2E TEST 20260904-094429 – Selma CA to Los Angeles CA`, was ingested automatically. The CRM correctly retained `temperatureControlled: false`, assigned `Cargo Van`, and mapped DAT equipment to `Van`, proving the client-data parsing repair.

The same approved test exposed two narrower post-submit extraction defects:

1. RateView job `dat-job-a2abcc93-9883-4da5-be13-97f94a79a3dd` reached `RV-100` but the newly accepted bare-currency shape still did not match DAT's current `.rate-permile` text. It remains `uncertain` and will not be retried automatically.
2. Search Loads job `dat-search-job-c1e4757f-1154-43d6-999b-3622b3d2889c` submitted successfully and DAT reported 14 direct results. One rendered DOM snapshot exposed 46 unique row identities because it also contained the additional Similar Results batch. The collector added the entire snapshot before checking the independently verified direct-result count, so it failed closed at `SL-090` with `RESULT_SCOPE_UNVERIFIED`.

## Second extraction repair

1. Search Loads now stops collection exactly when the independently verified direct-result count is reached, including when direct and similar rows are present in the same DOM snapshot. A 46-row regression fixture verifies that a reported direct count of 14 returns only the first 14 direct rows.
2. RateView now accepts a bounded single-number per-mile expression with optional DAT currency, unit, spacing, and footnote decoration. It still rejects multiple numeric values or unrecognized text instead of guessing.
3. An unmatched RateView value now reports only a value-free format signature: digits are replaced with `#` and words with `A`. This permits exact format diagnosis without logging the live market rate.
4. The full worker suite passes 51/51 tests. A second live DAT submission requires a new explicit approval because the first approved test was consumed.

## Release note

The client workspace remains structurally valid at the QA stage with `qa_passed: false` and `client_accepted: false`. This diagnosis does not advance a gate.
