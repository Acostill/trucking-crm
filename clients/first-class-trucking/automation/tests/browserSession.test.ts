import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { BrowserContext, Page } from "@playwright/test";
import { WorkerBrowserSession } from "../src/browserSession.ts";
import type { AppConfig } from "../src/config.ts";
import { openAuthenticatedTools } from "../src/rateview.ts";
import { WorkflowError } from "../src/types.ts";

const config: AppConfig = {
  toolsUrl: "https://one.dat.com/tools",
  searchLoadsUrl: "https://one.dat.com/search-loads",
  userDataDir: "/unused-synthetic-profile",
  runtimeDir: "/unused-synthetic-runtime",
  browserChannel: undefined,
  headless: true,
  timezone: "America/New_York",
  sharedSessionLoginAnyway: false,
  humanAuthTimeoutMs: 50,
  resultTimeoutMs: 50,
  retentionDays: 30,
  captureTrace: false,
};

function syntheticBrowser() {
  const events = new EventEmitter();
  const state = {
    closed: false,
    closeCount: 0,
    authenticated: true,
    navigationFailure: false,
    url: "about:blank",
    targets: [] as string[],
    clicks: 0,
    landmarkChecks: 0,
  };
  const page = {
    isClosed: () => state.closed,
    url: () => state.url,
    goto: async (url: string) => {
      if (state.navigationFailure) throw new Error("Synthetic navigation failure");
      state.targets.push(url);
      state.url = state.authenticated ? url : "https://login.dat.com/u/login/identifier";
    },
    getByText: () => ({ isVisible: async () => false }),
    getByRole: () => ({
      count: async () => 0,
      waitFor: async () => { state.landmarkChecks += 1; },
      click: async () => { state.clicks += 1; },
    }),
    waitForURL: () => new Promise<void>(() => undefined),
  } as unknown as Page;
  const context = {
    once: events.once.bind(events),
    close: async () => {
      state.closed = true;
      state.closeCount += 1;
      events.emit("close");
    },
  } as unknown as BrowserContext;
  return { context, page, state };
}

test("both workflows reuse the identical context and page and revalidate every job", async () => {
  const browser = syntheticBrowser();
  let launches = 0;
  const session = new WorkerBrowserSession(async (receivedConfig) => {
    assert.equal(receivedConfig.userDataDir, config.userDataDir);
    launches += 1;
    return browser;
  });
  for (const target of ["tools", "search-loads", "tools"] as const) {
    const lease = await openAuthenticatedTools(config, {
      target, browserSession: session, allowHumanAuth: false,
    });
    assert.equal(lease.context, browser.context);
    assert.equal(lease.page, browser.page);
    await lease.release();
    assert.equal(browser.state.closeCount, 0);
  }
  assert.equal(launches, 1);
  assert.equal(browser.state.landmarkChecks, 5);
  assert.deepEqual(browser.state.targets, [config.toolsUrl, config.searchLoadsUrl, config.toolsUrl]);
  await session.shutdown();
  await session.shutdown();
  assert.equal(browser.state.closeCount, 1);
  await assert.rejects(session.acquire(config), /shut down/);
});

test("auth loss stops before any search, releases ownership, and retains the same page for recovery", async () => {
  const browser = syntheticBrowser();
  const session = new WorkerBrowserSession(async () => browser);
  browser.state.authenticated = false;
  for (const target of ["tools", "search-loads"] as const) {
    await assert.rejects(
      openAuthenticatedTools(config, { target, browserSession: session, allowHumanAuth: false }),
      (error: unknown) => error instanceof WorkflowError && error.category === "AUTH_REQUIRED",
    );
  }
  assert.equal(browser.state.clicks, 0);
  assert.equal(browser.state.landmarkChecks, 0);
  assert.equal(browser.state.closeCount, 0);
  browser.state.authenticated = true; // Simulate an authorized human restoring access.
  const recovered = await openAuthenticatedTools(config, {
    browserSession: session, allowHumanAuth: false,
  });
  assert.equal(recovered.page, browser.page);
  await recovered.release();
  await session.shutdown();
});

test("navigation failure releases the session without automatically retrying or closing it", async () => {
  const browser = syntheticBrowser();
  const session = new WorkerBrowserSession(async () => browser);
  browser.state.navigationFailure = true;
  await assert.rejects(openAuthenticatedTools(config, { browserSession: session }), /navigation failure/);
  assert.equal(browser.state.closeCount, 0);
  const lease = await session.acquire(config);
  assert.equal(lease.page, browser.page);
  await lease.release();
  await session.shutdown();
});

test("overlapping jobs and shutdown during an active job are rejected", async () => {
  const browser = syntheticBrowser();
  const session = new WorkerBrowserSession(async () => browser);
  const first = await session.acquire(config);
  await assert.rejects(session.acquire(config), /already in use/);
  await assert.rejects(session.shutdown(), /active job/);
  assert.equal(browser.state.closeCount, 0);
  await first.release();
  const second = await session.acquire(config);
  await first.release(); // A stale release must not release the newer job.
  await assert.rejects(session.acquire(config), /already in use/);
  await second.release();
  await session.shutdown();
  assert.equal(browser.state.closeCount, 1);
});

test("a dead browser is recreated only for a subsequent job using the configured profile", async () => {
  const browsers = [syntheticBrowser(), syntheticBrowser()];
  let launches = 0;
  const session = new WorkerBrowserSession(async (receivedConfig) => {
    assert.equal(receivedConfig.userDataDir, config.userDataDir);
    return browsers[launches++];
  });
  const first = await session.acquire(config);
  await first.context.close();
  await assert.rejects(session.acquire(config), /already in use/);
  await first.release();
  const second = await session.acquire(config);
  assert.equal(launches, 2);
  assert.notEqual(first.context, second.context);
  await second.release();
  await session.shutdown();
});

test("a failed launch does not permanently lock the session", async () => {
  const browser = syntheticBrowser();
  let launches = 0;
  const session = new WorkerBrowserSession(async () => {
    if (++launches === 1) throw new Error("Synthetic launch failure");
    return browser;
  });
  await assert.rejects(session.acquire(config), /launch failure/);
  const recovered = await session.acquire(config);
  await recovered.release();
  await session.shutdown();
});

test("real Chromium retains synthetic sessionStorage across both workflow navigations", async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "fct-session-test-"));
  const localConfig = { ...config, userDataDir: profile };
  const session = new WorkerBrowserSession();
  try {
    const setup = await session.acquire(localConfig);
    // Every request is fulfilled locally; no DAT or other network traffic occurs.
    await setup.context.route("**/*", (route) => route.fulfill({
      contentType: "text/html",
      body: '<h1>Tools</h1><input role="combobox" aria-label="Origin"><input role="combobox" aria-label="Destination"><button>SEARCH</button>',
    }));
    const retainedPage = setup.page;
    await setup.release();
    const first = await openAuthenticatedTools(localConfig, {
      browserSession: session, allowHumanAuth: false,
    });
    await first.page.evaluate(() => sessionStorage.setItem("synthetic-session-marker", "fictional-value"));
    await first.release();
    const second = await openAuthenticatedTools(localConfig, {
      browserSession: session, target: "search-loads", allowHumanAuth: false,
    });
    try {
      assert.equal(second.page, retainedPage);
      assert.equal(await second.page.evaluate(() => sessionStorage.getItem("synthetic-session-marker")), "fictional-value");
    } finally {
      await second.release();
    }
  } finally {
    await session.shutdown();
    await fs.rm(profile, { recursive: true, force: true });
  }
});
