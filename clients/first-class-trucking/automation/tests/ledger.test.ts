import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RateViewLedger } from "../src/ledger.ts";
import type { QuoteRequest, QuoteResult } from "../src/types.ts";

const request: QuoteRequest = {
  requestId: "ledger-test-001",
  origin: "Portland, OR",
  destination: "Chicago, IL",
  equipmentType: "Van",
  approveSearch: true,
};

const result: QuoteResult = {
  requestId: request.requestId,
  source: "DAT RateView",
  lookupTimestamp: "2026-08-11T14:32:52.793Z",
  acceptedOrigin: request.origin,
  acceptedDestination: request.destination,
  acceptedEquipmentType: request.equipmentType,
  spot: {
    rateType: "SPOT",
    acceptedMarketLane: "Portland Mkt - Chicago Mkt",
    averageTotalUsd: 3729,
    averagePerMileUsd: 1.75,
    lowTotalUsd: 3197,
    highTotalUsd: 4092,
    lowPerMileUsd: 1.5,
    highPerMileUsd: 1.92,
    rangeUnavailableReason: null,
    miles: 2131,
    timeframe: "7d average",
    fuel: { value: null, reason: "not displayed" },
  },
  contract: {
    rateType: "CONTRACT",
    acceptedMarketLane: "Portland X-Mkt - Chicago X-Mkt",
    averageTotalUsd: 3836,
    averagePerMileUsd: 1.8,
    lowTotalUsd: 3367,
    highTotalUsd: 4539,
    lowPerMileUsd: 1.58,
    highPerMileUsd: 2.13,
    rangeUnavailableReason: null,
    miles: 2131,
    timeframe: "90d average",
    fuel: { value: null, reason: "not displayed" },
  },
};

test("completed requests are reused without another submission", async () => {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), "fct-ledger-"));
  try {
    const ledger = new RateViewLedger(runtime, "America/New_York");
    const reserved = await ledger.reserve(request, "run-1", new Date("2026-08-11T12:00:00Z"));
    assert.equal(reserved.reused, false);
    if (reserved.reused) return;
    assert.equal(await ledger.markSubmitted(reserved.fingerprint, "run-1", new Date("2026-08-11T12:01:00Z")), 1);
    await ledger.complete(reserved.fingerprint, "run-1", result, new Date("2026-08-11T12:02:00Z"));
    const reused = await ledger.reserve(request, "run-2", new Date("2026-08-11T12:03:00Z"));
    assert.equal(reused.reused, true);
    if (reused.reused) assert.deepEqual(reused.result, result);
  } finally {
    await fs.rm(runtime, { recursive: true, force: true });
  }
});

test("usage above ten is recorded without an application daily cap", async () => {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), "fct-ledger-"));
  try {
    const ledger = new RateViewLedger(runtime, "America/New_York");
    let submittedToday = 0;
    for (let index = 1; index <= 11; index += 1) {
      const runId = `run-${index}`;
      const reserved = await ledger.reserve(
        { ...request, requestId: `ledger-test-${index}` },
        runId,
        new Date("2026-08-11T12:00:00Z"),
      );
      if (reserved.reused) throw new Error("unexpected reuse");
      submittedToday = await ledger.markSubmitted(
        reserved.fingerprint,
        runId,
        new Date("2026-08-11T12:01:00Z"),
      );
    }
    assert.equal(submittedToday, 11);
  } finally {
    await fs.rm(runtime, { recursive: true, force: true });
  }
});
