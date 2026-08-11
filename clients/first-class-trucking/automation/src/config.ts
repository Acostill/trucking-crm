import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

export interface AppConfig {
  toolsUrl: "https://one.dat.com/tools";
  browserChannel: "chrome" | undefined;
  userDataDir: string;
  runtimeDir: string;
  timezone: string;
  headless: boolean;
  sharedSessionLoginAnyway: boolean;
  humanAuthTimeoutMs: number;
  resultTimeoutMs: number;
  retentionDays: number;
  captureTrace: boolean;
}

const automationRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function loadLocalEnv(): void {
  const envPath = path.join(automationRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function booleanValue(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  if (["1", "true", "yes"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no"].includes(value.toLowerCase())) return false;
  throw new Error(`${name} must be 1/0, true/false, or yes/no.`);
}

function integerValue(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function loadConfig(): AppConfig {
  loadLocalEnv();
  const userDataDir =
    process.env.DAT_USER_DATA_DIR?.trim() ||
    path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Optimation AI",
      "First Class DAT Profile",
    );
  if (!path.isAbsolute(userDataDir)) {
    throw new Error("DAT_USER_DATA_DIR must be an absolute path.");
  }
  if (userDataDir.startsWith(automationRoot)) {
    throw new Error("DAT_USER_DATA_DIR must be outside the automation workspace.");
  }

  return {
    toolsUrl: "https://one.dat.com/tools",
    browserChannel:
      process.env.DAT_BROWSER_CHANNEL?.trim().toLowerCase() === "chromium"
        ? undefined
        : "chrome",
    userDataDir,
    runtimeDir: path.resolve(
      process.env.DAT_RUNTIME_DIR?.trim() || path.join(automationRoot, "runtime"),
    ),
    timezone: process.env.DAT_TIMEZONE?.trim() || "America/New_York",
    headless: booleanValue("DAT_HEADLESS", false),
    sharedSessionLoginAnyway: booleanValue(
      "DAT_SHARED_SESSION_LOGIN_ANYWAY",
      true,
    ),
    humanAuthTimeoutMs: integerValue("DAT_HUMAN_AUTH_TIMEOUT_MS", 300_000),
    resultTimeoutMs: integerValue("DAT_RESULT_TIMEOUT_MS", 30_000),
    retentionDays: integerValue("DAT_RETENTION_DAYS", 30),
    captureTrace: booleanValue("DAT_CAPTURE_TRACE", false),
  };
}

export { automationRoot };
