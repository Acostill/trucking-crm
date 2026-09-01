export type RetrySafety = "none" | "idempotent";

export interface CrmTransportConfig {
  crmBaseUrl: string;
  workerSecret: string;
  requestTimeoutMs: number;
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  retry429MaxDelayMs: number;
}

export interface RetryEvent {
  attempt: number;
  nextAttempt: number;
  delayMs: number;
  reason: "network" | "timeout" | "status" | "rate_limited";
  status?: number;
}

interface RequestDependencies {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  onRetry?: (event: RetryEvent) => void;
}

export class CrmRequestError extends Error {
  readonly category: "CRM_NETWORK_ERROR" | "CRM_REQUEST_TIMEOUT" | "CRM_HTTP_ERROR";
  readonly status?: number;
  readonly attempts: number;

  constructor(
    category: CrmRequestError["category"],
    message: string,
    attempts: number,
    status?: number,
  ) {
    super(message);
    this.name = "CrmRequestError";
    this.category = category;
    this.status = status;
    this.attempts = attempts;
  }
}

const transientStatuses = new Set([502, 503, 504, 520]);

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(
  value: string | null,
  now: number,
  maximum: number,
): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  let milliseconds: number;
  if (/^\d+$/.test(trimmed)) {
    milliseconds = Number(trimmed) * 1000;
  } else {
    const retryAt = Date.parse(trimmed);
    if (!Number.isFinite(retryAt)) return null;
    milliseconds = Math.max(0, retryAt - now);
  }
  if (!Number.isSafeInteger(milliseconds) || milliseconds > maximum) return null;
  return milliseconds;
}

function backoffMilliseconds(
  attempt: number,
  base: number,
  maximum: number,
  random: () => number,
): number {
  const capped = Math.min(maximum, base * 2 ** (attempt - 1));
  return Math.floor(capped / 2 + random() * capped / 2);
}

async function discardResponse(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

export async function crmRequest(
  config: CrmTransportConfig,
  path: string,
  options: RequestInit = {},
  retrySafety: RetrySafety = "none",
  dependencies: RequestDependencies = {},
): Promise<Response> {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const wait = dependencies.sleep || sleep;
  const random = dependencies.random || Math.random;
  const now = dependencies.now || Date.now;
  const maximumAttempts = retrySafety === "idempotent" ? config.retryMaxAttempts : 1;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.requestTimeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(`${config.crmBaseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-DAT-Worker-Secret": config.workerSecret,
          ...(options.headers || {}),
        },
      });
    } catch {
      clearTimeout(timeout);
      const reason = timedOut ? "timeout" : "network";
      if (attempt < maximumAttempts) {
        const delayMs = backoffMilliseconds(
          attempt,
          config.retryBaseDelayMs,
          config.retryMaxDelayMs,
          random,
        );
        dependencies.onRetry?.({ attempt, nextAttempt: attempt + 1, delayMs, reason });
        await wait(delayMs);
        continue;
      }
      throw new CrmRequestError(
        timedOut ? "CRM_REQUEST_TIMEOUT" : "CRM_NETWORK_ERROR",
        timedOut ? "CRM worker request timed out." : "CRM worker network request failed.",
        attempt,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok || response.status === 204) return response;

    let delayMs: number | null = null;
    let reason: RetryEvent["reason"] = "status";
    if (transientStatuses.has(response.status)) {
      delayMs = backoffMilliseconds(
        attempt,
        config.retryBaseDelayMs,
        config.retryMaxDelayMs,
        random,
      );
    } else if (response.status === 429) {
      reason = "rate_limited";
      delayMs = retryAfterMilliseconds(
        response.headers.get("Retry-After"),
        now(),
        config.retry429MaxDelayMs,
      );
    }

    if (delayMs !== null && attempt < maximumAttempts) {
      await discardResponse(response);
      dependencies.onRetry?.({
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
        reason,
        status: response.status,
      });
      await wait(delayMs);
      continue;
    }

    await discardResponse(response);
    throw new CrmRequestError(
      "CRM_HTTP_ERROR",
      `CRM worker request failed (${response.status}).`,
      attempt,
      response.status,
    );
  }

  throw new CrmRequestError(
    "CRM_NETWORK_ERROR",
    "CRM worker request failed without a response.",
    maximumAttempts,
  );
}
