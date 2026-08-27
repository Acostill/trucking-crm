import fs from "node:fs/promises";
import path from "node:path";
import { WORKFLOW_ID } from "./types.ts";

export interface SafeLogEvent {
  runId: string;
  requestId?: string;
  stepId: string;
  result: string;
  durationMs?: number;
  errorCategory?: string;
  submittedToday?: number;
}

export async function appendSafeLog(
  runtimeDir: string,
  event: SafeLogEvent,
): Promise<void> {
  const logDir = path.join(runtimeDir, "logs");
  await fs.mkdir(logDir, { recursive: true, mode: 0o700 });
  const record = {
    timestamp: new Date().toISOString(),
    workflowId: WORKFLOW_ID,
    ...event,
  };
  await fs.appendFile(
    path.join(logDir, "events.jsonl"),
    `${JSON.stringify(record)}\n`,
    { mode: 0o600 },
  );
}

export async function pruneRunArtifacts(
  runtimeDir: string,
  retentionDays: number,
): Promise<void> {
  const runsDir = path.join(runtimeDir, "runs");
  const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const target = path.join(runsDir, entry.name);
    const stat = await fs.stat(target);
    if (stat.mtimeMs < cutoff) {
      await fs.rm(target, { recursive: true, force: true });
    }
  }
}
