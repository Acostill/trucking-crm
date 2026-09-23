import fs from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import type { AppConfig } from "./config.ts";

export interface BrowserLease {
  context: BrowserContext;
  page: Page;
  release(): Promise<void>;
}

type OpenBrowser = (config: AppConfig) => Promise<{
  context: BrowserContext;
  page: Page;
}>;

export const launchDatBrowser: OpenBrowser = async (config) => {
  await fs.mkdir(config.userDataDir, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(config.userDataDir, {
    ...(config.browserChannel ? { channel: config.browserChannel } : {}),
    headless: config.headless,
    viewport: null,
  });
  try {
    return { context, page: context.pages()[0] || await context.newPage() };
  } catch (error) {
    await context.close().catch(() => undefined);
    throw error;
  }
};

/** One context AND tab for the sequential worker, preserving session-only state. */
export class WorkerBrowserSession {
  private browser?: Awaited<ReturnType<OpenBrowser>>;
  private active = false;
  private stopped = false;

  constructor(private readonly openBrowser: OpenBrowser = launchDatBrowser) {}

  async acquire(config: AppConfig): Promise<BrowserLease> {
    if (this.stopped) throw new Error("DAT browser session has shut down.");
    if (this.active) throw new Error("DAT browser session is already in use.");
    this.active = true;
    try {
      if (this.browser?.page.isClosed()) {
        await this.browser.context.close().catch(() => undefined);
        this.browser = undefined;
      }
      if (!this.browser) {
        const browser = await this.openBrowser(config);
        this.browser = browser;
        browser.context.once("close", () => {
          if (this.browser === browser) this.browser = undefined;
        });
      }
      let released = false;
      return {
        ...this.browser,
        release: async () => {
          if (released) return;
          released = true;
          this.active = false;
        },
      };
    } catch (error) {
      this.active = false;
      throw error;
    }
  }

  /** Call after the active job settles; never interrupt a possible submission. */
  async shutdown(): Promise<void> {
    if (this.active) throw new Error("DAT browser session still has an active job.");
    this.stopped = true;
    const browser = this.browser;
    this.browser = undefined;
    await browser?.context.close();
  }
}

/** CLI/authentication invocations own and close their browser as before. */
export async function acquireDatBrowser(
  config: AppConfig,
  session?: WorkerBrowserSession,
): Promise<BrowserLease> {
  if (session) return session.acquire(config);
  const browser = await launchDatBrowser(config);
  return { ...browser, release: () => browser.context.close() };
}
