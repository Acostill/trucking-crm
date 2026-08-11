import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.ts";
import { RateViewLedger } from "./ledger.ts";
import { appendSafeLog, pruneRunArtifacts } from "./logger.ts";
import {
  capturePreSubmitEvidence,
  openAuthenticatedTools,
  populateQuoteForm,
  submitAndExtract,
} from "./rateview.ts";
import { type QuoteResult, WorkflowError } from "./types.ts";
import { validateRequest } from "./validation.ts";

export interface RunQuoteInput {
  requestId?: string;
  origin?: string;
  destination?: string;
  equipmentType?: string;
  approveSearch?: boolean;
  allowHumanAuth?: boolean;
}

export interface RunQuoteOutcome {
  reused: boolean;
  runId?: string;
  result: QuoteResult;
}

export async function runQuote(input: RunQuoteInput): Promise<RunQuoteOutcome> {
  const config = loadConfig();
  const request = validateRequest(input);
  if (!request.approveSearch) {
    throw new WorkflowError(
      "SEARCH_APPROVAL_REQUIRED",
      "This specific lane must be approved before DAT SEARCH is pressed.",
      "RV-070",
    );
  }

  const runId = randomUUID();
  const startedAt = Date.now();
  const runDirectory = path.join(config.runtimeDir, "runs", runId);
  const ledger = new RateViewLedger(config.runtimeDir, config.timezone);
  await pruneRunArtifacts(config.runtimeDir, config.retentionDays);
  const reservation = await ledger.reserve(request, runId);
  await appendSafeLog(config.runtimeDir, {
    runId,
    requestId: request.requestId,
    stepId: "RV-020",
    result: reservation.reused ? "REUSED" : "RESERVED",
    submittedToday: reservation.submittedToday,
  });
  if (reservation.reused) {
    return { reused: true, result: reservation.result };
  }

  let submitted = false;
  let context: Awaited<ReturnType<typeof openAuthenticatedTools>>["context"] | undefined;
  try {
    const opened = await openAuthenticatedTools(config, {
      allowHumanAuth: input.allowHumanAuth !== false,
    });
    context = opened.context;
    if (config.captureTrace) {
      await context.tracing.start({ screenshots: true, snapshots: true });
    }
    const controls = await populateQuoteForm(
      opened.page,
      request,
      config.resultTimeoutMs,
    );
    await capturePreSubmitEvidence(opened.page, controls, runDirectory);
    const submittedToday = await ledger.markSubmitted(
      reservation.fingerprint,
      runId,
    );
    submitted = true;
    await appendSafeLog(config.runtimeDir, {
      runId,
      requestId: request.requestId,
      stepId: "RV-080",
      result: "SUBMITTED_ONCE",
      submittedToday,
    });
    const result = await submitAndExtract(
      opened.page,
      request,
      controls,
      config,
      runDirectory,
    );
    await ledger.complete(reservation.fingerprint, runId, result);
    await fs.writeFile(
      path.join(runDirectory, "result.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      { mode: 0o600 },
    );
    await appendSafeLog(config.runtimeDir, {
      runId,
      requestId: request.requestId,
      stepId: "RV-110",
      result: "COMPLETED",
      durationMs: Date.now() - startedAt,
      submittedToday,
    });
    return { reused: false, runId, result };
  } catch (error) {
    const category =
      error instanceof WorkflowError ? error.category : "UNEXPECTED_ERROR";
    if (submitted) {
      await ledger.markUncertain(reservation.fingerprint, runId, category);
    } else {
      await ledger.releaseReservation(reservation.fingerprint, runId);
    }
    await appendSafeLog(config.runtimeDir, {
      runId,
      requestId: request.requestId,
      stepId: error instanceof WorkflowError ? error.stepId : "UNKNOWN",
      result: submitted ? "UNCERTAIN" : "STOPPED_PRE_SUBMIT",
      durationMs: Date.now() - startedAt,
      errorCategory: category,
    });
    if (error && typeof error === "object") {
      Object.defineProperty(error, "datSubmissionState", {
        value: submitted ? "uncertain" : "not_submitted",
        enumerable: false,
      });
    }
    throw error;
  } finally {
    if (context && config.captureTrace) {
      await context.tracing
        .stop({ path: path.join(runDirectory, "trace.zip") })
        .catch(() => undefined);
    }
    await context?.close().catch(() => undefined);
  }
}
