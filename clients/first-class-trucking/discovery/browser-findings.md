# Browser findings

## Discovery run: 2026-08-09 America/New_York

- Status: `HUMAN_LOGIN_REQUIRED`
- Approved scope: First Class Trucking's read-only DAT RateView workflow in DAT production.
- Browser selection: the isolated in-app Browser remained unavailable. The Pod Lead explicitly approved the user's visible Chrome browser for this run so the user can perform the required shared-login authentication and MFA manually.
- `RV-030` observation: a fresh Chrome tab was opened at the approved supplied entry point `https://login.dat.com/u/login/identifier`. DAT redirected it to the token-free URL pattern `https://www.dat.com/login` with page title `Customer Login | DAT One | RateView - DAT`.
- Authentication boundary: reached and handed to the human. The discovery agent did not inspect authentication form contents or browser password/session stores. No login field value, credential, MFA, CAPTCHA, token, cookie, storage state, or authentication artifact was entered, inspected, logged, captured, or stored.
- Search boundary: not reached. No RateView lane values were entered and no lane-credit lookup was executed.
- UI evidence: the public DAT login page identity and redacted URL pattern above were observed from page title and URL only. Authentication controls, popup/frame behavior, RateView navigation, required fields, locator candidates, wait conditions, subscription indicators, logout signals, and search success/failure states have not yet been observed.
- Screenshots: none captured at the authentication boundary to avoid exposing autofill, credentials, or other authentication information.
- Consequential actions: none. No booking, posting, messaging, purchase/payment, deletion, submission, or account-setting change occurred.
- Required next action: the authorized user must complete login, SSO, MFA, CAPTCHA, or other DAT challenges manually in the retained Chrome tab and report when an authenticated DAT application page is visible. Discovery will then resume at `RV-050` without inspecting authentication artifacts. It must stop again at `RV-070` for per-search approval before activating any credit-consuming RateView search.

### Resume check: 2026-08-11 America/New_York

- The user reported that DAT's 30-day device-recognition option had already been enabled.
- Three DAT tabs were visible in the discovery Chrome group. The most recently active candidate reported the token-free pattern `https://one.dat.com/dashboard` and title `Dashboard - DAT One` before it was claimed.
- On claiming that exact candidate, it resolved to the public unauthenticated pattern `https://www.dat.com/login` with title `Customer Login | DAT One | RateView - DAT`. This is treated as an authentication redirect/session-loss signal, not as authenticated access.
- Only page title, redacted URL pattern, and public navigation landmarks were inspected. No credential field, entered value, MFA/CAPTCHA content, cookie, token, storage, password manager, or session artifact was inspected or captured.
- The authenticated `RV-040` postcondition was not met. Discovery did not proceed to `RV-050`, inspect RateView search controls, enter lane data, or execute a lookup.
- No screenshots were captured because the session remained at the authentication boundary.

No RateView UI facts or selectors should be inferred before post-login discovery resumes.

## Authenticated discovery: 2026-08-11 America/New_York

- Status: `READY_FOR_SEARCH_APPROVAL`.
- The authorized user completed DAT authentication and MFA manually. The discovery agent did not inspect or record credentials, MFA values, cookies, tokens, password-manager data, or browser storage.
- Authenticated entry was confirmed at `https://iq.dat.com/dashboard` with title `DAT iQ Don't Guess. Know.`
- DAT iQ navigation exposes `More Tools` -> `DAT One`. DAT One opened in a new tab at the token-free pattern `https://one.dat.com/dashboard`.
- DAT One displayed the documented shared-session conflict dialog: another device was logged in and `LOGIN ANYWAY` would log it out. The client had already approved this shared-login exception and confirmed that the automation should log back in when the shared session is displaced, so the agent activated `LOGIN ANYWAY`. The dialog closed and DAT One remained authenticated.
- The stable DAT One Tools route is `https://one.dat.com/tools` (`a[href="/tools"]`). Clicking the SPA navigation link did not transition during discovery, while direct navigation to the observed `/tools` href loaded the Tools page successfully.
- Tools -> Quick Rate Lookup is the reliable RateView entry. The standalone RateView card opens `https://iq.dat.com/rateview` in a new tab, but with no lane context that route redirected to the DAT iQ dashboard. The automation should therefore populate Quick Rate Lookup first rather than depend on a bare `/rateview` navigation.
- Required Quick Rate Lookup inputs observed:
  - Origin accessible name: `Origin (City, ST / ZIP)*`; city autocomplete is required.
  - Destination accessible name: `Destination (City, ST / ZIP)*`; city autocomplete is required.
  - Equipment accessible name while selected: `Equipment Type Van`; observed options are `Van`, `Flatbed`, and `Reefer`.
  - Submit control: button accessible name `SEARCH`.
- The `SEARCH` button remained disabled for unconfirmed free text. It became enabled only after selecting exact origin and destination autocomplete options and retaining an equipment option.
- Fictional staged test lane: `Portland, OR` -> `Chicago, IL`, equipment `Van`. The exact autocomplete options were selected successfully. `SEARCH` is enabled and has **not** been activated.
- Candidate stable locators observed from the live DOM:
  - `getByRole('combobox', { name: 'Origin (City, ST / ZIP)*', exact: true })`
  - `getByRole('option', { name: 'Portland, OR', exact: true })`
  - `getByRole('combobox', { name: 'Destination (City, ST / ZIP)*', exact: true })`
  - `getByRole('option', { name: 'Chicago, IL', exact: true })`
  - `getByRole('combobox', { name: 'Equipment Type Van', exact: true })`
  - `getByRole('button', { name: 'SEARCH', exact: true })`
- Evidence: `screenshots/060-RV-060-quick-rate-ready.png` captures the authenticated Tools form with fictional lane data only. No credential, MFA, token, cookie, customer quote, or commercially confidential rate result is present.
- Search/credit boundary: zero RateView lookups were executed in this discovery run. A specific human approval is still required immediately before `SEARCH` because the lookup may consume one lane credit.

### Approved search and result observation

- Approval: the operator explicitly approved one lookup for `Portland, OR` -> `Chicago, IL`, `Van` in the Codex task immediately before submission.
- Submission: `SEARCH` was resolved uniquely, confirmed enabled, and activated once at `2026-08-11T14:32:52.793Z`. The same control was not retried.
- Result transition: DAT replaced the search action with two visible result cards and a `NEW SEARCH` button on the same `https://one.dat.com/tools` page. No popup or redirect is required for the successful Quick Rate Lookup path.
- The Spot card exposed the accepted market lane, displayed average total/per-mile, mileage, 7-day timeframe, and displayed low/high total and per-mile range.
- The Contract card exposed the accepted cross-market lane, displayed average total/per-mile, mileage, 90-day timeframe, and displayed low/high total and per-mile range.
- Live lane and rate values are intentionally omitted from this shared discovery log. They are stored only in the gitignored functional ledger/result boundary required for idempotent reuse.
- A separate fuel value was not displayed by Quick Rate Lookup. The typed output should set fuel to `null` with reason `Quick Rate Lookup did not display a separate fuel value` rather than infer or calculate one.
- Stable result structure observed:
  - two `dat-market-rate-data` elements;
  - Spot card root `.details-container.spot` and Contract card root `.details-container.contract`;
  - within each card: `.geo-label`, `.rate-data`, `.rate-permile`, `.miles-day-average`, and `.range-data`.
- Evidence policy: the raw results screenshot was not retained because it exposed commercially confidential live market values. `result-structure-redacted.json` records the observed field/selector contract with values masked. The retained browser tab remains available to the authorized operator.
- Usage accounting: this discovery lookup is recorded as the first submitted RateView lookup for `2026-08-11` America/New_York. The count is audit-only; D-017 removed the application-level daily cap.

## Search Loads partial discovery: 2026-08-13 America/New_York

- Status: `HUMAN_LOGIN_REQUIRED`; Search Loads discovery is incomplete and no Search Loads build is approved yet.
- The retained client-authorized Chrome session already had DAT One at the token-free route `https://one.dat.com/search-loads`. A shared-session displacement dialog reported that this session had been logged out because the account was used on another device. The dialog and authentication boundary were not bypassed by automation.
- Before the displaced session removed the previously rendered application DOM, read-only structural inspection confirmed the Search Loads form, a prior result table, the row-details panel, and a virtual-scroll container. No new Search Loads query was submitted and no booking, contact, bidding, messaging, posting, purchase, save, download, account, or result-row action was activated.
- Search form controls observed: Origin, DH-O, Destination, DH-D, Equipment Type, Load Type, Length (ft), Weight (lbs), Date Range start/end, Load Requirements, Search Back, Company, Book/Bid, and a `SEARCH` button. Exact required/default behavior, accepted values, validation, and CRM mappings still require authenticated discovery.
- Result landmarks observed: separate direct and similar result counts, an `Include Similar Results` switch, and a sort control. V1 will not include similar results unless a later approved change explicitly requests them.
- Direct result rows use a virtualized list: `cdk-virtual-scroll-viewport.table-rows-container` -> `.cdk-virtual-scroll-content-wrapper` -> `.row-container`. Full-scope terminal behavior and descending Rate sort still require authenticated verification; the automation must not assume the first rendered viewport is complete.
- The visible result header is `Rate`. Each row's `.cell-rate dat-rate` contains a displayed total in `.offer` and a separate per-mile amount. For the user's requested highest-offer ranking, the intended v1 comparison value is the displayed total dollar amount, never RPM or RateView market data. This needs one fresh authenticated result check before approval.
- Candidate non-contact row fields are age, total/per-mile rate, route and trip miles, origin deadhead, pickup, equipment/weight/length/load type, company, credit score, and days to pay. Candidate detail fields are origin/destination, pickup dates, miles, load/truck/length/weight, commodity, Reference ID, comments, displayed rate/market information, and non-contact company facts.
- Comments were structurally observed at `dat-notes .notes-contents.multiline`. Contact information is displayed elsewhere in the same details area and is explicitly prohibited from extraction, logging, persistence, or CRM display. If contact data cannot be separated deterministically from comments or another allowed field, that field must be omitted and counted as `CONTACT_DATA_OMITTED`.
- No raw result screenshot was retained because the existing page contained commercially confidential values and contact data. `search-loads-structure-redacted.json` records only labels, structural candidates, prohibited regions, and unresolved checks.
- Required next action: the authorized human must sign back in to DAT in the retained Chrome tab and report when the authenticated Search Loads page is visible. Discovery will resume without inspecting credentials or authentication artifacts. A new Search Loads submission will still require an explicit approval for one staged fictional or otherwise approved lane immediately before `SEARCH` is activated.

### Authenticated Search Loads resume and staged search

- The authorized human restored the shared session. The authenticated Search Loads page was confirmed at `https://one.dat.com/search-loads`; no credential, MFA, token, cookie, password-manager, or browser-storage content was inspected or retained.
- The form exposes exact accessible controls for `Origin`, `Destination`, `DH-O`, `DH-D`, `Load Type`, `Length ft`, `Weight lbs`, Date Range start/end, and `SEARCH`. Origin and Destination accept exact autocomplete options; free text was not treated as accepted state.
- Observed defaults were 150 miles for both deadhead fields, `Full & Partial` load type, a same-day start/end Date Range, and a 24-hour search-back control. At least one equipment chip and both dates remained present when `SEARCH` was enabled.
- The existing direct-result summary remained separate from Similar Results. `Include Similar Results` was observed `false`; Search Loads v1 excludes Similar Results.
- The Sort by menu exposes `Rate - Highest` and `Rate per mile - Highest` as separate choices. Selecting `Rate - Highest` and waiting for the bounded update produced descending numeric total-dollar values. V1 ranks the total-dollar `.offer` value only and never the adjacent RPM value.
- Rows visibly marked `CANCELED` are unavailable. Rows without a numeric total-dollar Rate are deterministically excluded as `MISSING_OR_NON_NUMERIC_OFFER`; the workflow does not infer a number from RPM, comments, market rates, or another field.
- The observed result count and 40 `.row-container` elements differed in the previously loaded state, so fresh-result full-scope verification remains required. Every observed row had a unique `table-row-*` DOM id; it remains a candidate identifier until the approved fresh result confirms stability.
- A single fictional Search Loads query is staged but not submitted: Portland, OR -> Chicago, IL, Vans (Standard), Full & Partial, 150-mile origin and destination radius, same-day 2026-08-13 date range, Similar Results off. The `SEARCH` button is enabled.
- Current boundary: `SEARCH` has **not** been activated. The staged page remains retained for an explicit approval tied to those exact criteria. No booking, contact, bid, message, post, purchase, save, export, account, or result-row action occurred.

### Approved submission interrupted before activation

- The operator explicitly approved the exact staged Portland, OR -> Chicago, IL Search Loads query.
- Immediate pre-submit validation found DAT's shared-session displacement dialog active: another device had logged into the shared account. The stale page still rendered the staged fields underneath the dialog, but the authenticated precondition was not satisfied.
- The discovery agent did not activate `SEARCH`. The logout notice was dismissed once, DAT redirected to the token-free `https://login.dat.com/u/login/identifier?...` pattern, and the tab was handed back for human authentication.
- Submission count for this approved query remains zero. The approval has not been consumed, but after human login the complete criteria must be staged and read back again before a new immediate approval checkpoint; stale form state will not be reused.

### Approved fresh Search Loads result

- The operator restored authentication and the exact approved criteria were restaged and read back: Portland, OR -> Chicago, IL; Vans (Standard); Full & Partial; 150-mile DH-O and DH-D; same-day 2026-08-13 Date Range; Similar Results false. No stale form value was reused.
- The previously granted single-search approval was consumed by exactly one `SEARCH` activation at `2026-08-13T16:34:43.226Z`. No retry occurred.
- DAT produced a criteria-matching result state with 23 direct Results and 106 Similar Results. Similar Results remained off. The DOM contained the 23 unique direct `table-row-*` rows plus `table-row-similar-matches-separator`, proving the direct result boundary without relying on viewport position.
- `Rate - Highest` was selected from the observed Sort by menu. After the bounded update, eligible numeric total-dollar Rate values were descending. Fifteen direct rows had numeric total Rates and eight were blank or nonnumeric; the v1 output therefore contains ten rows and records the eight exclusions.
- Unique `table-row-*` identities persisted through the sort/update observations and are the only v1 deduplication key. The worker must still fail closed if a future result count does not equal the collected unique direct row identities.
- The row allowlist is total Rate, RPM, trip miles, origin/destination, DH-O/DH-D, pickup, equipment, weight, length/load type, company, credit score/days-to-pay, and comments. Contact links and controls are present in the same rows and are strictly excluded.
- The previously observed comments structure remains `dat-notes .notes-contents.multiline`. A fresh row did not expose that details panel through the safe observed row controls, so v1 treats comments as optional: sanitize the panel when it is actually displayed; otherwise return `comments: null` with `comment_status: not_displayed`. A phone/email-like comment is omitted, not partially returned.
- No screenshot or raw result payload was retained because the live table contained commercially confidential rates and contact information. Only counts, state transitions, selector contracts, and timestamps are recorded here.
- No Book/Bid, contact, phone, email, message, post, purchase, save, export, download, or account action was activated.
