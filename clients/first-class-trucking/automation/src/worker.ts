#!/usr/bin/env node
import http from "node:http";
import { loadWorkerConfig } from "./workerConfig.ts";
import { runQuote, runSearchLoads } from "./runner.ts";
import {
  SEARCH_LOADS_WORKFLOW_ID,
  type QuoteRequest,
  type QuoteResult,
  type SearchLoadsRequest,
  type SearchLoadsResult,
  WorkflowError,
} from "./types.ts";
import { CrmRequestError, crmRequest, type RetrySafety } from "./workerTransport.ts";
import { workerReadiness, type WorkerHealthState } from "./workerHealth.ts";

interface WorkerJob {
  id: string;
  request: QuoteRequest | SearchLoadsRequest;
}

async function post(
  config: ReturnType<typeof loadWorkerConfig>,
  path: string,
  body: Record<string, unknown>,
  retrySafety: RetrySafety = "none",
  operation = "non_idempotent",
): Promise<Response> {
  return crmRequest(
    config,
    path,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    retrySafety,
    {
      onRetry: (event) => {
        process.stderr.write(`${JSON.stringify({
          status: "crm_request_retry",
          operation,
          ...event,
        })}\n`);
      },
    },
  );
}

async function claim(config: ReturnType<typeof loadWorkerConfig>): Promise<WorkerJob | null> {
  const response = await post(config, "/api/dat-worker/jobs/claim", {
    workerId: config.workerId,
  }, "idempotent", "claim");
  if (response.status === 204) return null;
  return (await response.json()) as WorkerJob;
}

async function processJob(
  config: ReturnType<typeof loadWorkerConfig>,
  job: WorkerJob,
): Promise<void> {
  await post(config, `/api/dat-worker/jobs/${encodeURIComponent(job.id)}/start`, {
    workerId: config.workerId,
  }, "idempotent", "start");
  let outcome: {
    reused: boolean;
    result: QuoteResult | SearchLoadsResult;
  };
  try {
    if (
      "workflowId" in job.request &&
      job.request.workflowId === SEARCH_LOADS_WORKFLOW_ID
    ) {
      outcome = await runSearchLoads({ ...job.request, approveSearch: true });
    } else {
      outcome = await runQuote({
        ...job.request,
        approveSearch: true,
        allowHumanAuth: false,
      });
    }
  } catch (error) {
    const category = error instanceof WorkflowError
      ? error.category
      : "UNEXPECTED_ERROR";
    const submissionState = error && typeof error === "object"
      ? (error as { datSubmissionState?: string }).datSubmissionState
      : undefined;
    const state = submissionState === "uncertain"
      ? "uncertain"
      : category === "AUTH_REQUIRED"
        ? "needs_auth"
        : "failed";
    await post(config, `/api/dat-worker/jobs/${encodeURIComponent(job.id)}/fail`, {
      workerId: config.workerId,
      state,
      category,
      message: error instanceof Error ? error.message : "DAT lookup failed",
    }, "idempotent", "fail");
    process.stderr.write(`${JSON.stringify({ jobId: job.id, status: state, category })}\n`);
    return;
  }
  // Result delivery is intentionally outside the browser-work catch block.
  // Identical CRM callbacks are server-idempotent and may be retried, but the
  // DAT browser action is never repeated. A conflicting terminal transition
  // is rejected by the server and remains available for reconciliation.
  await post(config, `/api/dat-worker/jobs/${encodeURIComponent(job.id)}/complete`, {
    workerId: config.workerId,
    result: outcome.result,
  }, "idempotent", "complete");
  process.stdout.write(`${JSON.stringify({ jobId: job.id, status: "completed", reused: outcome.reused })}\n`);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const once = process.argv.includes("--once");
  let stopping = false;
  const startedAtMs = Date.now();
  const healthState: WorkerHealthState = {
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    lastPollAttemptAt: null,
    lastSuccessfulCrmPollAt: null,
    lastSuccessfulCrmPollAtMs: null,
    lastJobAt: null,
    activeJobId: null,
    lastErrorCategory: null,
  };
  const healthServer = once ? null : http.createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, service: "first-class-dat-worker" }));
      return;
    }
    const readiness = workerReadiness(healthState, config.readinessStaleMs);
    response.writeHead(readiness.ok ? 200 : 503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      ok: readiness.ok,
      service: "first-class-dat-worker",
      workerId: config.workerId,
      readiness: readiness.reason,
      staleForMs: readiness.staleForMs,
      staleAfterMs: config.readinessStaleMs,
      startedAt: healthState.startedAt,
      lastPollAttemptAt: healthState.lastPollAttemptAt,
      lastSuccessfulCrmPollAt: healthState.lastSuccessfulCrmPollAt,
      lastJobAt: healthState.lastJobAt,
      activeJob: healthState.activeJobId !== null,
      lastErrorCategory: healthState.lastErrorCategory,
    }));
  });
  if (healthServer) {
    await new Promise<void>((resolve) => {
      healthServer.listen(config.healthPort, "0.0.0.0", resolve);
    });
  }
  const stop = () => {
    stopping = true;
    healthServer?.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.stdout.write(`${JSON.stringify({ status: "worker_started", workerId: config.workerId, once })}\n`);

  while (!stopping) {
    try {
      healthState.lastPollAttemptAt = new Date().toISOString();
      const job = await claim(config);
      const successfulPollAtMs = Date.now();
      healthState.lastSuccessfulCrmPollAtMs = successfulPollAtMs;
      healthState.lastSuccessfulCrmPollAt = new Date(successfulPollAtMs).toISOString();
      healthState.lastErrorCategory = null;
      if (job) {
        healthState.lastJobAt = new Date().toISOString();
        healthState.activeJobId = job.id;
        try {
          await processJob(config, job);
        } finally {
          healthState.activeJobId = null;
        }
      }
      else if (once) break;
    } catch (error) {
      healthState.lastErrorCategory = error instanceof CrmRequestError
        ? error.category
        : "WORKER_LOOP_ERROR";
      process.stderr.write(`${JSON.stringify({
        status: "worker_error",
        category: healthState.lastErrorCategory,
        httpStatus: error instanceof CrmRequestError ? error.status : undefined,
      })}\n`);
      if (once) throw error;
    }
    if (!once && !stopping) await delay(config.pollIntervalMs);
    if (once) break;
  }
}

main().catch(() => {
  process.exitCode = 1;
});
