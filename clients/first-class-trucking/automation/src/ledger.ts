import fs from "node:fs/promises";
import path from "node:path";
import {
  type LedgerEntry,
  type LedgerFile,
  type WorkflowRequest,
  type WorkflowResult,
  WorkflowError,
} from "./types.ts";
import { calendarDay, requestFingerprint } from "./validation.ts";

const COUNTED_STATUSES = new Set([
  "submitted",
  "uncertain",
  "completed",
  "no-rate",
]);

export class RateViewLedger {
  private readonly ledgerPath: string;
  private readonly lockPath: string;

  constructor(
    runtimeDir: string,
    private readonly timezone: string,
  ) {
    this.ledgerPath = path.join(runtimeDir, "ledger.json");
    this.lockPath = path.join(runtimeDir, "ledger.lock");
  }

  private emptyLedger(): LedgerFile {
    return { schemaVersion: 1, timezone: this.timezone, entries: {} };
  }

  private async read(): Promise<LedgerFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.ledgerPath, "utf8"));
      if (parsed.schemaVersion !== 1 || typeof parsed.entries !== "object") {
        throw new Error("Unsupported ledger schema.");
      }
      return parsed as LedgerFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return this.emptyLedger();
      throw error;
    }
  }

  private async write(ledger: LedgerFile): Promise<void> {
    await fs.mkdir(path.dirname(this.ledgerPath), { recursive: true, mode: 0o700 });
    const temporary = `${this.ledgerPath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, {
      mode: 0o600,
    });
    await fs.rename(temporary, this.ledgerPath);
  }

  private async locked<T>(operation: () => Promise<T>): Promise<T> {
    await fs.mkdir(path.dirname(this.lockPath), { recursive: true, mode: 0o700 });
    const deadline = Date.now() + 5_000;
    let handle: fs.FileHandle | undefined;
    while (!handle) {
      try {
        handle = await fs.open(this.lockPath, "wx", 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || Date.now() >= deadline) {
          throw new WorkflowError(
            "LEDGER_LOCKED",
            "The lookup ledger is busy; try again after the active run finishes.",
            "RV-020",
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    try {
      return await operation();
    } finally {
      await handle.close();
      await fs.unlink(this.lockPath).catch(() => undefined);
    }
  }

  private countForDay(ledger: LedgerFile, day: string): number {
    return Object.values(ledger.entries).filter(
      (entry) => entry.day === day && COUNTED_STATUSES.has(entry.status),
    ).length;
  }

  async reserve(
    request: WorkflowRequest,
    runId: string,
    now = new Date(),
  ): Promise<
    | { reused: true; result: WorkflowResult; submittedToday: number }
    | { reused: false; fingerprint: string; submittedToday: number }
  > {
    return this.locked(async () => {
      const ledger = await this.read();
      const fingerprint = requestFingerprint(request);
      const day = calendarDay(now, this.timezone);
      const existing = ledger.entries[fingerprint];
      const submittedToday = this.countForDay(ledger, day);

      if (existing?.status === "completed" || existing?.status === "no-rate") {
        if (!existing.result) {
          throw new WorkflowError(
            "LEDGER_INVALID",
            "A completed ledger entry is missing its stored result.",
            "RV-020",
          );
        }
        return { reused: true, result: existing.result, submittedToday };
      }
      if (existing) {
        throw new WorkflowError(
          "DUPLICATE_REQUIRES_REVIEW",
          `This request already has ledger status ${existing.status}; it will not be submitted again automatically.`,
          "RV-020",
        );
      }
      const timestamp = now.toISOString();
      ledger.entries[fingerprint] = {
        requestId: request.requestId,
        ...( "workflowId" in request ? { workflowId: request.workflowId } : {}),
        fingerprint,
        day,
        runId,
        status: "reserved",
        reservedAt: timestamp,
      };
      await this.write(ledger);
      return { reused: false, fingerprint, submittedToday };
    });
  }

  async markSubmitted(
    fingerprint: string,
    runId: string,
    now = new Date(),
  ): Promise<number> {
    return this.locked(async () => {
      const ledger = await this.read();
      const entry = ledger.entries[fingerprint];
      const day = calendarDay(now, this.timezone);
      const submittedToday = this.countForDay(ledger, day);
      if (!entry || entry.runId !== runId || entry.status !== "reserved") {
        throw new WorkflowError(
          "DUPLICATE_REQUIRES_REVIEW",
          "The single-use lookup reservation is no longer valid.",
          "RV-070",
        );
      }
      entry.status = "submitted";
      entry.submittedAt = now.toISOString();
      await this.write(ledger);
      return submittedToday + 1;
    });
  }

  async complete(
    fingerprint: string,
    runId: string,
    result: WorkflowResult,
    now = new Date(),
  ): Promise<void> {
    await this.locked(async () => {
      const ledger = await this.read();
      const entry = ledger.entries[fingerprint];
      if (!entry || entry.runId !== runId || entry.status !== "submitted") {
        throw new WorkflowError(
          "LEDGER_FINALIZATION_FAILED",
          "The submitted lookup could not be finalized safely.",
          "RV-110",
        );
      }
      entry.status = "completed";
      entry.completedAt = now.toISOString();
      entry.result = result;
      await this.write(ledger);
    });
  }

  async markUncertain(
    fingerprint: string,
    runId: string,
    errorCategory: string,
  ): Promise<void> {
    await this.locked(async () => {
      const ledger = await this.read();
      const entry = ledger.entries[fingerprint];
      if (entry?.runId === runId && entry.status === "submitted") {
        entry.status = "uncertain";
        entry.errorCategory = errorCategory;
        await this.write(ledger);
      }
    });
  }

  async releaseReservation(fingerprint: string, runId: string): Promise<void> {
    await this.locked(async () => {
      const ledger = await this.read();
      const entry = ledger.entries[fingerprint];
      if (entry?.runId === runId && entry.status === "reserved") {
        delete ledger.entries[fingerprint];
        await this.write(ledger);
      }
    });
  }
}
