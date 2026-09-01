import os from "node:os";
import { loadConfig } from "./config.ts";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the CRM worker.`);
  return value;
}

function integer(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function loadWorkerConfig() {
  loadConfig();
  const crmBaseUrl = required("DAT_CRM_BASE_URL").replace(/\/+$/, "");
  const parsedUrl = new URL(crmBaseUrl);
  if (parsedUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsedUrl.hostname)) {
    throw new Error("DAT_CRM_BASE_URL must use HTTPS outside localhost.");
  }
  const pollIntervalMs = integer("DAT_WORKER_POLL_INTERVAL_MS", 5000, 1000, 300_000);
  const requestTimeoutMs = integer("DAT_CRM_REQUEST_TIMEOUT_MS", 10_000, 1000, 120_000);
  const retryMaxAttempts = integer("DAT_CRM_RETRY_MAX_ATTEMPTS", 3, 1, 5);
  const retryBaseDelayMs = integer("DAT_CRM_RETRY_BASE_DELAY_MS", 250, 50, 10_000);
  const retryMaxDelayMs = integer("DAT_CRM_RETRY_MAX_DELAY_MS", 5000, retryBaseDelayMs, 60_000);
  const retry429MaxDelayMs = integer("DAT_CRM_RETRY_429_MAX_DELAY_MS", 10_000, 1000, 120_000);
  const readinessStaleMs = integer("DAT_WORKER_READINESS_STALE_MS", 60_000, 10_000, 900_000);
  if (readinessStaleMs < pollIntervalMs * 2) {
    throw new Error("DAT_WORKER_READINESS_STALE_MS must be at least two poll intervals.");
  }
  const healthPort = integer("PORT", 8080, 1, 65_535);
  return {
    crmBaseUrl,
    workerSecret: required("DAT_WORKER_SECRET"),
    workerId: process.env.DAT_WORKER_ID?.trim() || `${os.hostname()}-dat-worker`,
    pollIntervalMs,
    requestTimeoutMs,
    retryMaxAttempts,
    retryBaseDelayMs,
    retryMaxDelayMs,
    retry429MaxDelayMs,
    readinessStaleMs,
    healthPort,
  };
}
