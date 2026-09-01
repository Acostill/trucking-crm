import assert from "node:assert/strict";
import test from "node:test";
import {
  CrmRequestError,
  crmRequest,
  type CrmTransportConfig,
  type RetryEvent,
} from "../src/workerTransport.ts";

const config: CrmTransportConfig = {
  crmBaseUrl: "https://crm.example.test",
  workerSecret: "test-secret",
  requestTimeoutMs: 1000,
  retryMaxAttempts: 3,
  retryBaseDelayMs: 100,
  retryMaxDelayMs: 1000,
  retry429MaxDelayMs: 5000,
};

function sequenceFetch(responses: Array<Response | Error>): {
  fetchImpl: typeof fetch;
  calls: RequestInit[];
} {
  const calls: RequestInit[] = [];
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push(init || {});
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch call");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test("claim preserves a 204 empty-queue response without retrying", async () => {
  const fake = sequenceFetch([new Response(null, { status: 204 })]);
  const response = await crmRequest(config, "/claim", { method: "POST" }, "idempotent", {
    fetchImpl: fake.fetchImpl,
  });
  assert.equal(response.status, 204);
  assert.equal(fake.calls.length, 1);
  const headers = new Headers(fake.calls[0].headers);
  assert.equal(headers.get("X-DAT-Worker-Secret"), "test-secret");
});

test("claim retries bounded transient statuses with exponential backoff and jitter", async () => {
  const fake = sequenceFetch([
    new Response(null, { status: 520 }),
    new Response(null, { status: 503 }),
    new Response(null, { status: 204 }),
  ]);
  const delays: number[] = [];
  const retries: RetryEvent[] = [];
  const response = await crmRequest(config, "/claim", { method: "POST" }, "idempotent", {
    fetchImpl: fake.fetchImpl,
    random: () => 0,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
    onRetry: (event) => { retries.push(event); },
  });
  assert.equal(response.status, 204);
  assert.equal(fake.calls.length, 3);
  assert.deepEqual(delays, [50, 100]);
  assert.deepEqual(retries.map((event) => event.status), [520, 503]);
});

test("an idempotent job callback retries the remaining safe transient statuses", async () => {
  const fake = sequenceFetch([
    new Response(null, { status: 502 }),
    new Response(null, { status: 504 }),
    new Response(null, { status: 200 }),
  ]);
  const response = await crmRequest(
    config,
    "/jobs/id/complete",
    { method: "POST" },
    "idempotent",
    {
      fetchImpl: fake.fetchImpl,
      random: () => 0,
      sleep: async () => undefined,
    },
  );
  assert.equal(response.status, 200);
  assert.equal(fake.calls.length, 3);
});

test("claim retries network errors but stops at the configured attempt bound", async () => {
  const fake = sequenceFetch([
    new Error("socket reset"),
    new Error("socket reset"),
    new Error("socket reset"),
  ]);
  await assert.rejects(
    crmRequest(config, "/claim", { method: "POST" }, "idempotent", {
      fetchImpl: fake.fetchImpl,
      random: () => 0,
      sleep: async () => undefined,
    }),
    (error: unknown) => {
      assert.ok(error instanceof CrmRequestError);
      assert.equal(error.category, "CRM_NETWORK_ERROR");
      assert.equal(error.attempts, 3);
      return true;
    },
  );
  assert.equal(fake.calls.length, 3);
});

test("429 is retried only with a valid bounded Retry-After value", async () => {
  const retryable = sequenceFetch([
    new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
    new Response(null, { status: 204 }),
  ]);
  const delays: number[] = [];
  await crmRequest(config, "/claim", { method: "POST" }, "idempotent", {
    fetchImpl: retryable.fetchImpl,
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });
  assert.deepEqual(delays, [2000]);

  const unsafe = sequenceFetch([
    new Response(null, { status: 429, headers: { "Retry-After": "60" } }),
    new Response(null, { status: 204 }),
  ]);
  await assert.rejects(
    crmRequest(config, "/claim", { method: "POST" }, "idempotent", {
      fetchImpl: unsafe.fetchImpl,
      sleep: async () => undefined,
    }),
    (error: unknown) => error instanceof CrmRequestError && error.status === 429,
  );
  assert.equal(unsafe.calls.length, 1);
});

test("an explicitly non-idempotent action is never transport-retried", async () => {
  const fake = sequenceFetch([
    new Response(null, { status: 520 }),
    new Response(null, { status: 200 }),
  ]);
  await assert.rejects(
    crmRequest(config, "/jobs/id/complete", { method: "POST" }, "none", {
      fetchImpl: fake.fetchImpl,
    }),
    (error: unknown) => error instanceof CrmRequestError && error.status === 520,
  );
  assert.equal(fake.calls.length, 1);
});

test("a timed-out claim is aborted and classified without leaking its cause", async () => {
  const fetchImpl = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new Error("internal socket details"));
      });
    })) as typeof fetch;
  await assert.rejects(
    crmRequest(
      { ...config, requestTimeoutMs: 10, retryMaxAttempts: 1 },
      "/claim",
      { method: "POST" },
      "idempotent",
      { fetchImpl },
    ),
    (error: unknown) => {
      assert.ok(error instanceof CrmRequestError);
      assert.equal(error.category, "CRM_REQUEST_TIMEOUT");
      assert.equal(error.message, "CRM worker request timed out.");
      return true;
    },
  );
});
