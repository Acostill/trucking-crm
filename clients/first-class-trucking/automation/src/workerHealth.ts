export interface WorkerHealthState {
  startedAt: string;
  startedAtMs: number;
  lastPollAttemptAt: string | null;
  lastSuccessfulCrmPollAt: string | null;
  lastSuccessfulCrmPollAtMs: number | null;
  lastJobAt: string | null;
  activeJobId: string | null;
  lastErrorCategory: string | null;
}

export function workerReadiness(
  state: WorkerHealthState,
  staleAfterMs: number,
  nowMs = Date.now(),
): { ok: boolean; reason: "starting" | "crm_poll_healthy" | "job_active" | "crm_poll_stale"; staleForMs: number } {
  const referenceMs = state.lastSuccessfulCrmPollAtMs ?? state.startedAtMs;
  const staleForMs = Math.max(0, nowMs - referenceMs);
  if (state.activeJobId) return { ok: true, reason: "job_active", staleForMs };
  if (state.lastSuccessfulCrmPollAtMs !== null && staleForMs <= staleAfterMs) {
    return { ok: true, reason: "crm_poll_healthy", staleForMs };
  }
  if (state.lastSuccessfulCrmPollAtMs === null && staleForMs <= staleAfterMs) {
    return { ok: true, reason: "starting", staleForMs };
  }
  return { ok: false, reason: "crm_poll_stale", staleForMs };
}
