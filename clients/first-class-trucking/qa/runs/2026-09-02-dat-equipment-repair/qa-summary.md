# Independent QA: DAT Search Loads Equipment Type repair

Verdict: `BLOCKED`

The working-tree repair passes deterministic release validation with no new implementation defect. Full release remains blocked because no live DAT search was authorized or executed and the configured consecutive live-pass target remains `0/5`.

## Tested version and environment

- Original independent-run base: pre-rebase `HEAD 1a5dbedb4ad2786d3c15f8a6c11c79c236d6ed37` plus the then-uncommitted 2026-09-02 equipment repair and recovered Railway reliability source.
- Final merged verification source: `origin/main 1ea3e4e + this repair commit`.
- Initial equipment repair file: `automation/src/searchLoads.ts`, SHA-256 `019d6129c39a03276e30fc08260058573c9d9a401157a81538e4ab5b940c64c1`.
- Follow-up live-DOM chip-readback source: `automation/src/searchLoads.ts`, SHA-256 `3b0fa57bcbd95e1617933ba7c78fe23486c64f96af3f94c5d211f56cf6dd8a09`; builder test SHA-256 `9a855d7e94fc0583cf36f6f9d1f24af34e52f6cef64a2217908b5786b0a131dc`.
- Environment: local macOS 26.5.1 arm64; Node.js v25.8.1; npm 11.11.0; Playwright 1.62.0; headless Chromium fixtures.
- Data: synthetic DOM and request data only. No live DAT query, production job, credential change, profile copy, deployment, customer data, rate result, or contact data.

## Results

| Check | Passed | Failed | Notes |
|---|---:|---:|---|
| Automation TypeScript typecheck | 1 | 0 | `npm run typecheck` |
| Original pre-rebase automation tests | 28 | 0 | Initial independent-run evidence |
| Final follow-up automation tests | 33 | 0 | Fresh typecheck and suite; realistic retained chips contain `mat-icon[matchipremove]` text `cancel` |
| Independent Equipment Type QA tests | 6 | 0 | Fresh realistic-DOM run; 3 mappings, icon exclusion, stale chips, missing/ambiguous options, removal failure, empty/wrong/extra-label/multiple selected chips, and zero `SEARCH` activation |
| Focused server contract suites | 3 | 0 | Rerun post-rebase: DAT Search Loads, DAT RateView, and worker state machine |
| Recovered Railway source hash comparisons | 7 | 0 | All seven non-repair source hashes exactly match the builder's reconciliation record |
| Client build | 0 | 0 | Not run: no client or server contract file changed |
| Live release sequence | 0 | 0 | Not authorized; required target remains 0/5 |

Final merged executable evidence: automation `33/33`, independent equipment QA `6/6`, and focused server contracts `3/3`, all passing. The separate TypeScript typecheck passed. The earlier `28/28` automation and `2/2` server results remain original pre-rebase chronology and are superseded by the broader post-rebase verification for the final merged source.

The first sandboxed launch of each `tsx` suite failed before test execution because the sandbox denied creation of the temporary local IPC socket. The authorized reruns completed successfully. This is recorded as an environment constraint, not an automation failure.

## Findings

- The browser-only mapping is exact: `Vans (Standard)` -> `Vans (Standard)`, `Flatbeds (Standard)` -> `Flatbeds`, and `Reefers (Standard)` -> `Reefers`.
- Request validation, the supplied search fingerprint, accepted-result criteria, and server mappings retain the legacy `(... Standard)` identities. No client or server contract file changed.
- Two stale selected chips were cleared before each independent mapping case; each success ended with exactly one mapped selected chip.
- Zero matching options and two matching primary-label options both failed as `UI_DRIFT` at `SL-060`.
- No selected chip, a wrong selected chip, and multiple selected chips all failed as `FORM_VALUE_REJECTED` at `SL-060`.
- A missing chip-removal control and a removal action that did not reduce the selected-chip count both failed closed.
- Observed-style decorative initials did not cause selection of `Vans (Specialized)` or another wrong option.
- Raw retained-chip text was verified as `<mapped label> cancel`; removing only the cloned `[matchipremove]` decoration yielded the exact mapped business label.
- A retained label with additional non-decoration text (`Reefers Extra`) was rejected as `FORM_VALUE_REJECTED`, proving the repair does not weaken readback to a partial match.
- Every independent success and failure fixture recorded zero `SEARCH` activations.
- The seven recovered reliability files exactly match the recorded Railway-source hashes. A filename and high-confidence token/key scan found no storage state, cookie, browser-profile artifact, private key, or common credential token form in automation source.
- `git diff --check` passed.
- No new deterministic defect was found.

## Recovered source hashes

| File | SHA-256 |
|---|---|
| `automation/src/rateview.ts` | `b8c764d32f45400c856effb39c158755130be796615876205ccbab87c35396a6` |
| `automation/src/runner.ts` | `cf286c14b0b0dcb04f513d44ae65c238cea58a900a4933f03845e434756ed475` |
| `automation/src/worker.ts` | `725160c4f6e12b668811f0dddb6ce609ecd2c6261b468fffcd3b0c929c356614` |
| `automation/src/workerConfig.ts` | `1b7da99c84126d6b8fa822524364429e5e0abf99dfb93515223c786c2f671e30` |
| `automation/src/workerHealth.ts` | `fcc2feac6de9ca253612b01b6491e2921f4c491ce38a9ff5a81ef6f08f6f9afd` |
| `automation/src/workerTransport.ts` | `e7473d605476f8fed2bc56853d85d3c290823e80b9f29a883bf5d2ffb4c6a403` |
| `automation/src/inspectSearchLoadsState.ts` | `3cea3c54d36e39e45b59ab4376e5c20c324da4d5393d11a28ecb2b929fd6cdb9` |

## Blocking condition and evidence

- Blocking defect: `FCT-SL-004` remains open pending independent controlled and live retest of the delayed-authentication repair. The deterministic builder tests do not close it.
- Release blocker: five explicitly approved live Search Loads passes have not been executed; gate remains `0/5`.
- The pre-fix deployed no-search check reached authenticated DAT One and supplied the realistic chip DOM evidence, but the follow-up source has not yet received a post-fix deployed no-search confirmation. QA did not press `SEARCH`.
- Evidence:
  - `qa/runs/2026-09-02-dat-equipment-repair/equipment-contract.qa.test.ts`
  - `qa/runs/2026-09-02-dat-equipment-repair/qa-summary.md`
  - `qa/test-matrix.md`
  - `qa/defects.md`
  - `qa/qa-report.json`

Final status: `BLOCKED` for release. The merged deterministic equipment repair passes, but `FCT-SL-004` remains open and the live reliability gate remains `0/5`.
