# Truck-assignment v1 independent QA run

- Date: 2026-08-11 America/New_York
- Verdict: `QA_PASS` for the truck-assignment v1 extension only
- Rule version: `fct-truck-assignment-v1`
- Repository HEAD: `53490fd8407bd9b981bca67b7e5a17474602e878`
- Tested `server/services/truckAssignment.ts` SHA-256: `276c7640274a2d83443e864d60eaea8c4ea57b7c5d9b463998bfaa815296d124`
- Environment: local synthetic TypeScript/Node QA and CRM production build; no live DAT lookup executed
- Dataset: isolated fictional freight values with no customer, lane, rate, authentication, or secret data

## Results

| Check | Passed | Failed | Result |
|---|---:|---:|---|
| Independent truck-assignment matrix | 36 | 0 | Pass |
| Implementation truck-assignment regression script | 1 command | 0 | Pass |
| DAT RateView integration contract regression | 1 command | 0 | Pass |
| Server TypeScript no-emit check | 1 command | 0 | Pass |
| CRM optimized production build | 1 command | 0 | Pass with unrelated existing lint/browser-data warnings |

The 36-case independent matrix covers exact inclusive capacities, smallest-truck precedence, multi-group dimension promotion, oversize and out-of-range review, empty/invalid data, canonical units, dry/reefer variants, DAT Van/Reefer mapping, staff override, deterministic reruns, and a mocked workflow assertion that `needs_review` makes zero connected-carrier and zero DAT preparation calls.

## Commands

```bash
cd clients/first-class-trucking/qa
TS_NODE_PROJECT=../../../server/tsconfig.json TS_NODE_PREFER_TS_EXTS=true node -r ../../../server/node_modules/ts-node/register truck-assignment.qa.js

cd server
npm run test:truck-assignment
npm run test:dat-rateview
npx tsc --noEmit

cd client
CI=false npm run build
```

## Scope boundary

This run validates the CRM truck-assignment extension and its local integration only. It performs no upload/download, popup/frame, authentication, permission-change, slow-DAT-response, or live session-expiry action because truck classification has no such browser operation. Those conditions remain governed by the separate DAT browser QA matrix. No live DAT consecutive pass is claimed.
