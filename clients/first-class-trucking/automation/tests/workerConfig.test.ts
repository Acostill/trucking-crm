import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkerConfig } from "../src/workerConfig.ts";

const controlledNames = [
  "DAT_ENV_FILE",
  "DAT_CRM_BASE_URL",
  "DAT_WORKER_SECRET",
  "DAT_WORKER_POLL_INTERVAL_MS",
  "DAT_CRM_REQUEST_TIMEOUT_MS",
  "DAT_CRM_RETRY_MAX_ATTEMPTS",
  "DAT_CRM_RETRY_BASE_DELAY_MS",
  "DAT_CRM_RETRY_MAX_DELAY_MS",
  "DAT_CRM_RETRY_429_MAX_DELAY_MS",
  "DAT_WORKER_READINESS_STALE_MS",
] as const;

function withWorkerEnvironment(run: () => void): void {
  const saved = Object.fromEntries(
    controlledNames.map((name) => [name, process.env[name]]),
  );
  try {
    for (const name of controlledNames) delete process.env[name];
    process.env.DAT_ENV_FILE = "/tmp/first-class-dat-worker-test-env-does-not-exist";
    process.env.DAT_CRM_BASE_URL = "http://127.0.0.1:9999";
    process.env.DAT_WORKER_SECRET = "test-only-secret";
    run();
  } finally {
    for (const name of controlledNames) {
      const value = saved[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("worker transport and readiness defaults are bounded", () => {
  withWorkerEnvironment(() => {
    const config = loadWorkerConfig();
    assert.equal(config.requestTimeoutMs, 10_000);
    assert.equal(config.retryMaxAttempts, 3);
    assert.equal(config.retryBaseDelayMs, 250);
    assert.equal(config.retryMaxDelayMs, 5000);
    assert.equal(config.retry429MaxDelayMs, 10_000);
    assert.equal(config.readinessStaleMs, 60_000);
  });
});

test("readiness staleness cannot be configured below two poll intervals", () => {
  withWorkerEnvironment(() => {
    process.env.DAT_WORKER_POLL_INTERVAL_MS = "10000";
    process.env.DAT_WORKER_READINESS_STALE_MS = "15000";
    assert.throws(
      () => loadWorkerConfig(),
      /must be at least two poll intervals/,
    );
  });
});

test("retry attempts reject unbounded values", () => {
  withWorkerEnvironment(() => {
    process.env.DAT_CRM_RETRY_MAX_ATTEMPTS = "99";
    assert.throws(
      () => loadWorkerConfig(),
      /DAT_CRM_RETRY_MAX_ATTEMPTS must be an integer between 1 and 5/,
    );
  });
});
