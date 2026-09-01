import assert from "node:assert/strict";
import test from "node:test";
import { workerReadiness, type WorkerHealthState } from "../src/workerHealth.ts";

function state(overrides: Partial<WorkerHealthState> = {}): WorkerHealthState {
  return {
    startedAt: new Date(1000).toISOString(),
    startedAtMs: 1000,
    lastPollAttemptAt: null,
    lastSuccessfulCrmPollAt: null,
    lastSuccessfulCrmPollAtMs: null,
    lastJobAt: null,
    activeJobId: null,
    lastErrorCategory: null,
    ...overrides,
  };
}

test("readiness allows a bounded startup window before the first successful poll", () => {
  assert.deepEqual(workerReadiness(state(), 60_000, 31_000), {
    ok: true,
    reason: "starting",
    staleForMs: 30_000,
  });
  assert.deepEqual(workerReadiness(state(), 60_000, 61_001), {
    ok: false,
    reason: "crm_poll_stale",
    staleForMs: 60_001,
  });
});

test("readiness fails when the most recent successful CRM poll is stale", () => {
  const health = state({
    lastSuccessfulCrmPollAt: new Date(5000).toISOString(),
    lastSuccessfulCrmPollAtMs: 5000,
  });
  assert.equal(workerReadiness(health, 60_000, 65_000).ok, true);
  assert.deepEqual(workerReadiness(health, 60_000, 65_001), {
    ok: false,
    reason: "crm_poll_stale",
    staleForMs: 60_001,
  });
});

test("an active browser job remains ready so health checks cannot restart it mid-submit", () => {
  const health = state({
    activeJobId: "job-redacted",
    lastSuccessfulCrmPollAt: new Date(5000).toISOString(),
    lastSuccessfulCrmPollAtMs: 5000,
  });
  assert.deepEqual(workerReadiness(health, 60_000, 500_000), {
    ok: true,
    reason: "job_active",
    staleForMs: 495_000,
  });
});
