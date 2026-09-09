import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { WorkflowError, type SearchLoadsRequest } from "./types.ts";

/** UI contract observed 2026-09-09: editing the form does NOT change this
 * selected-tab summary. It identifies the submitted search independently. */
export interface SearchLoadsScopeSnapshot {
  origin: string | null;
  destination: string | null;
  count: number | null;
  loading: boolean;
  revision: number;
  identityRevision: number;
}

const normalize = (value: string | null): string => (value || "").replace(/\s+/g, " ").trim().toLowerCase();

export function scopeMatchesRequest(snapshot: SearchLoadsScopeSnapshot, request: SearchLoadsRequest): boolean {
  return normalize(snapshot.origin) === normalize(request.origin) &&
    normalize(snapshot.destination) === normalize(request.destination);
}

/** A DOM-only observer records short progress transitions that polling can miss.
 * Never inspects application internals, requests, browser storage or credentials. */
export async function observeSearchLoadsScope(page: Page): Promise<{
  read: () => Promise<SearchLoadsScopeSnapshot>;
  dispose: () => Promise<void>;
}> {
  const key = `fct_scope_${randomUUID().replace(/-/g, "")}`;
  await page.evaluate((key) => {
    const group = document.querySelector('[data-test="search-tab-group"]');
    if (!group) throw new Error("DAT search tab group is unavailable.");
    const state = {
      group, revision: 0, identityRevision: 0, identity: "", loading: false,
      observer: null as MutationObserver | null,
      update() {
        const loading = Array.from(group!.querySelectorAll('mat-progress-bar[role="progressbar"]')).some((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        });
        if (loading && !this.loading) this.revision += 1;
        this.loading = loading;
        const active = group!.querySelectorAll('[role="tab"][aria-selected="true"]');
        const labels = active.length === 1
          ? active[0].querySelectorAll('[data-test="search-tab-summary-labels"] .load-details > div') : [];
        const identity = labels.length === 2
          ? Array.from(labels).map((label) => (label.textContent || "").replace(/\s+/g, " ").trim().toLowerCase()).join("\u001f") : "";
        if (identity !== this.identity) this.identityRevision += 1;
        this.identity = identity;
      },
    };
    state.update();
    state.observer = new MutationObserver(() => {
      // Only a visibly observed progress state counts. A hidden inserted node
      // (or a transition too fast to observe) cannot establish freshness.
      state.update();
    });
    state.observer.observe(group, { childList: true, subtree: true, attributes: true, characterData: true });
    (window as unknown as Record<string, unknown>)[key] = state;
  }, key);
  return {
    read: async () => page.evaluate((key) => {
      const state = (window as unknown as Record<string, { group: Element; revision: number; identityRevision: number; loading: boolean; update: () => void }>)[key];
      const group = document.querySelector('[data-test="search-tab-group"]');
      if (!state || !group || state.group !== group) throw new Error("DAT result scope observer was lost.");
      state.update();
      const tabs = group.querySelectorAll('[role="tab"][aria-selected="true"]');
      const labels = tabs.length === 1
        ? tabs[0].querySelectorAll('[data-test="search-tab-summary-labels"] .load-details > div') : [];
      const counters = document.querySelectorAll('[data-test="results-counter"]');
      const countText = counters.length === 1 ? (counters[0].textContent || "").replace(/\s+/g, "") : "";
      const match = countText.match(/^(\d[\d,]*)Results?$/i);
      const count = match ? Number(match[1].replace(/,/g, "")) : null;
      return {
        origin: labels.length === 2 ? labels[0].textContent : null,
        destination: labels.length === 2 ? labels[1].textContent : null,
        count: count !== null && Number.isSafeInteger(count) ? count : null,
        loading: state.loading,
        revision: state.revision,
        identityRevision: state.identityRevision,
      };
    }, key),
    dispose: async () => {
      await page.evaluate((key) => {
        const states = window as unknown as Record<string, { observer: MutationObserver }>;
        states[key]?.observer.disconnect();
        delete states[key];
      }, key).catch(() => undefined);
    },
  };
}

export async function waitForSearchLoadsScope(
  read: () => Promise<SearchLoadsScopeSnapshot>,
  timeoutMs: number,
  options: { request?: SearchLoadsRequest; afterRevision?: number } = {},
): Promise<SearchLoadsScopeSnapshot> {
  const deadline = Date.now() + timeoutMs;
  do {
    const snapshot = await read();
    if (!snapshot.loading && snapshot.count !== null && snapshot.origin && snapshot.destination &&
      (options.afterRevision === undefined || snapshot.revision > options.afterRevision) &&
      (!options.request || scopeMatchesRequest(snapshot, options.request))) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw new WorkflowError("RESULT_SCOPE_UNVERIFIED", "DAT did not establish a fresh completed result for the approved lane. Human reconciliation is required; do not resubmit.", "SL-090");
}

export function assertStableSearchLoadsScope(
  snapshot: SearchLoadsScopeSnapshot,
  accepted: SearchLoadsScopeSnapshot,
  request: SearchLoadsRequest,
): void {
  if (snapshot.loading || snapshot.revision !== accepted.revision || snapshot.identityRevision !== accepted.identityRevision || snapshot.count !== accepted.count ||
    !scopeMatchesRequest(snapshot, request)) {
    throw new WorkflowError("RESULT_SCOPE_UNVERIFIED", "DAT result scope changed during extraction. Human reconciliation is required; do not resubmit.", "SL-090");
  }
}
