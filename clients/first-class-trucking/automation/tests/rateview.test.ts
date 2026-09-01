import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "@playwright/test";
import { waitForAuthenticatedTarget } from "../src/rateview.ts";
import { WorkflowError } from "../src/types.ts";

interface FakePageOptions {
  redirectTo?: string;
  targetReady?: boolean;
}

function fakePage(options: FakePageOptions): Page {
  let currentUrl = "https://one.dat.com/loading";
  const urlWaiters: Array<{
    predicate: (url: URL) => boolean;
    resolve: () => void;
  }> = [];
  const locator = {
    waitFor: () => options.targetReady
      ? Promise.resolve()
      : new Promise<void>(() => undefined),
  };
  const page = {
    url: () => currentUrl,
    getByRole: () => locator,
    waitForURL: (
      predicate: (url: URL) => boolean,
      waitOptions: { timeout?: number } = {},
    ) => new Promise<void>((resolve, reject) => {
      if (predicate(new URL(currentUrl))) {
        resolve();
        return;
      }
      urlWaiters.push({ predicate, resolve });
      const timer = setTimeout(
        () => reject(new Error("URL wait timed out")),
        waitOptions.timeout || 100,
      );
      timer.unref();
    }),
  } as unknown as Page;

  if (options.redirectTo) {
    queueMicrotask(() => {
      currentUrl = options.redirectTo as string;
      for (const waiter of urlWaiters) {
        if (waiter.predicate(new URL(currentUrl))) waiter.resolve();
      }
    });
  }
  return page;
}

for (const scenario of [
  { target: "tools" as const, stepId: "RV-040" },
  { target: "search-loads" as const, stepId: "SL-040" },
]) {
  test(`${scenario.target} classifies a delayed login redirect before form use`, async () => {
    const page = fakePage({
      redirectTo: "https://login.dat.com/u/login/identifier?state=redacted",
    });
    await assert.rejects(
      waitForAuthenticatedTarget(page, scenario.target, 100),
      (error: unknown) => {
        assert.ok(error instanceof WorkflowError);
        assert.equal(error.category, "AUTH_REQUIRED");
        assert.equal(error.stepId, scenario.stepId);
        return true;
      },
    );
  });
}

for (const target of ["tools", "search-loads"] as const) {
  test(`${target} requires an approved authenticated landmark before readiness`, async () => {
    await waitForAuthenticatedTarget(
      fakePage({ targetReady: true }),
      target,
      100,
    );
  });
}

test("a delayed non-DAT redirect remains an unknown-domain stop", async () => {
  await assert.rejects(
    waitForAuthenticatedTarget(
      fakePage({ redirectTo: "https://example.test/not-dat" }),
      "search-loads",
      100,
    ),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowError);
      assert.equal(error.category, "UNKNOWN_DOMAIN");
      assert.equal(error.stepId, "SL-030");
      return true;
    },
  );
});
