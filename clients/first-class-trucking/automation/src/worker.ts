#!/usr/bin/env node
import http from "node:http";
import { loadWorkerConfig } from "./workerConfig.ts";
import { runQuote, runSearchLoads } from "./runner.ts";
import {
  SEARCH_LOADS_WORKFLOW_ID,
  type QuoteRequest,
  type SearchLoadsRequest,
  WorkflowError,
} from "./types.ts";

interface WorkerJob {
  id: string;
  request: QuoteRequest | SearchLoadsRequest;
}

async function request(
  baseUrl: string,
  secret: string,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-DAT-Worker-Secret": secret,
      ...(options.headers || {}),
    },
  });
  if (!response.ok && response.status !== 204) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `CRM worker request failed (${response.status}).`);
  }
  return response;
}

async function post(
  config: ReturnType<typeof loadWorkerConfig>,
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return request(config.crmBaseUrl, config.workerSecret, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function claim(config: ReturnType<typeof loadWorkerConfig>): Promise<WorkerJob | null> {
  const response = await post(config, "/api/dat-worker/jobs/claim", {
    workerId: config.workerId,
  });
  if (response.status === 204) return null;
  return (await response.json()) as WorkerJob;
}

async function processJob(
  config: ReturnType<typeof loadWorkerConfig>,
  job: WorkerJob,
): Promise<void> {
  await post(config, `/api/dat-worker/jobs/${encodeURIComponent(job.id)}/start`, {
    workerId: config.workerId,
  });
  try {
    let outcome;
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
    await post(config, `/api/dat-worker/jobs/${encodeURIComponent(job.id)}/complete`, {
      workerId: config.workerId,
      result: outcome.result,
    });
    process.stdout.write(`${JSON.stringify({ jobId: job.id, status: "completed", reused: outcome.reused })}\n`);
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
    });
    process.stderr.write(`${JSON.stringify({ jobId: job.id, status: state, category })}\n`);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const once = process.argv.includes("--once");
  let stopping = false;
  const healthState = {
    startedAt: new Date().toISOString(),
    lastPollAt: null as string | null,
    lastJobAt: null as string | null,
    lastErrorCategory: null as string | null,
  };
  const healthServer = once ? null : http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      ok: true,
      service: "first-class-dat-worker",
      workerId: config.workerId,
      ...healthState,
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
      healthState.lastPollAt = new Date().toISOString();
      const job = await claim(config);
      if (job) {
        healthState.lastJobAt = new Date().toISOString();
        await processJob(config, job);
      }
      else if (once) break;
    } catch (error) {
      healthState.lastErrorCategory = "WORKER_LOOP_ERROR";
      process.stderr.write(`${JSON.stringify({
        status: "worker_error",
        message: error instanceof Error ? error.message : "Unknown worker error",
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
