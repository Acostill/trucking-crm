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
