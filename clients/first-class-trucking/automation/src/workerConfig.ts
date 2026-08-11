import os from "node:os";
import { loadConfig } from "./config.ts";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the CRM worker.`);
  return value;
}

export function loadWorkerConfig() {
  loadConfig();
  const crmBaseUrl = required("DAT_CRM_BASE_URL").replace(/\/+$/, "");
  const parsedUrl = new URL(crmBaseUrl);
  if (parsedUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsedUrl.hostname)) {
    throw new Error("DAT_CRM_BASE_URL must use HTTPS outside localhost.");
  }
  const pollIntervalMs = Number(process.env.DAT_WORKER_POLL_INTERVAL_MS || 5000);
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1000) {
    throw new Error("DAT_WORKER_POLL_INTERVAL_MS must be an integer of at least 1000.");
  }
  const healthPort = Number(process.env.PORT || 8080);
  if (!Number.isSafeInteger(healthPort) || healthPort <= 0 || healthPort > 65535) {
    throw new Error("PORT must be a valid TCP port.");
  }
  return {
    crmBaseUrl,
    workerSecret: required("DAT_WORKER_SECRET"),
    workerId: process.env.DAT_WORKER_ID?.trim() || `${os.hostname()}-dat-worker`,
    pollIntervalMs,
    healthPort,
  };
}
