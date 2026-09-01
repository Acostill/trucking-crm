import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  chromium,
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import type { AppConfig } from "./config.ts";
import { parseRateCard } from "./parser.ts";
import {
  type EquipmentType,
  type QuoteRequest,
  type QuoteResult,
  WorkflowError,
} from "./types.ts";

interface OpenedBrowser {
  context: BrowserContext;
  page: Page;
}

type DatTarget = "tools" | "search-loads";

function authRequired(target: DatTarget, message: string): WorkflowError {
  return new WorkflowError(
    "AUTH_REQUIRED",
    message,
    target === "search-loads" ? "SL-040" : "RV-040",
  );
}

function assertApprovedDatOneUrl(page: Page, target: DatTarget): void {
  if (isLoginUrl(page.url())) {
    throw authRequired(
      target,
      "DAT requires manual authentication. Run the documented authentication flow on the worker host.",
    );
  }
  if (new URL(page.url()).hostname !== "one.dat.com") {
    throw new WorkflowError(
      "UNKNOWN_DOMAIN",
      "DAT navigation left the approved one.dat.com domain.",
      target === "search-loads" ? "SL-030" : "RV-030",
    );
  }
}

async function waitForHumanAuthentication(
  page: Page,
  config: AppConfig,
  mode: "prompt" | "observe",
): Promise<void> {
  output.write(
    "DAT authentication is required. Complete login, MFA, or CAPTCHA manually in the visible Chrome window.\n",
  );
  if (mode === "observe") {
    await page.waitForURL(
      (url) => url.hostname === "one.dat.com",
      { timeout: config.humanAuthTimeoutMs },
    );
    return;
  }
  const prompt = readline.createInterface({ input, output });
  try {
    await Promise.race([
      prompt.question("Press Enter after the DAT dashboard is visible... "),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Human authentication timed out.")),
          config.humanAuthTimeoutMs,
        ),
      ),
    ]);
  } finally {
    prompt.close();
  }
}

function isLoginUrl(url: string): boolean {
  const parsed = new URL(url);
  return (
    parsed.hostname === "login.dat.com" ||
    (parsed.hostname === "www.dat.com" && parsed.pathname.startsWith("/login"))
  );
}

/**
 * Wait for the approved target landmark while also observing delayed DAT login
 * redirects. This runs before any workflow form locators are evaluated.
 */
export async function waitForAuthenticatedTarget(
  page: Page,
  target: DatTarget,
  timeoutMs: number,
): Promise<void> {
  assertApprovedDatOneUrl(page, target);

  const targetReady = target === "search-loads"
    ? Promise.all([
      page.getByRole("combobox", { name: "Origin", exact: true })
        .waitFor({ state: "visible", timeout: timeoutMs }),
      page.getByRole("combobox", { name: "Destination", exact: true })
        .waitFor({ state: "visible", timeout: timeoutMs }),
      page.getByRole("button", { name: "SEARCH", exact: true })
        .waitFor({ state: "visible", timeout: timeoutMs }),
    ]).then(() => "ready" as const)
    : page.getByRole("heading", { name: "Tools", exact: true })
      .waitFor({ state: "visible", timeout: timeoutMs })
      .then(() => "ready" as const);

  const loginRedirect = page.waitForURL(
    (url) => isLoginUrl(url.toString()),
    { timeout: timeoutMs },
  ).then(() => "auth" as const).catch(() => new Promise<never>(() => undefined));
  const unknownDomainRedirect = page.waitForURL(
    (url) => url.hostname !== "one.dat.com" && !isLoginUrl(url.toString()),
    { timeout: timeoutMs },
  ).then(() => "unknown" as const).catch(() => new Promise<never>(() => undefined));

  try {
    const outcome = await Promise.race([
      targetReady,
      loginRedirect,
      unknownDomainRedirect,
    ]);
    if (outcome === "auth") {
      throw authRequired(
        target,
        "DAT redirected to the manual authentication boundary while the application was loading.",
      );
    }
    if (outcome === "unknown") assertApprovedDatOneUrl(page, target);
    // Close the race where the landmark and redirect become observable together.
    assertApprovedDatOneUrl(page, target);
  } catch (error) {
    // A navigation can detach the target landmark before the URL watcher settles.
    // Reclassify from the current URL so session loss never surfaces as a raw
    // Playwright locator error.
    assertApprovedDatOneUrl(page, target);
    throw error;
  }
}

async function waitForDatOne(page: Page, config: AppConfig): Promise<void> {
  const loading = page.getByText("Loading DAT One...", { exact: true });
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: "hidden", timeout: config.resultTimeoutMs });
  }

  const loginAnyway = page.getByRole("button", {
    name: "LOGIN ANYWAY",
    exact: true,
  });
  if (await loginAnyway.isVisible().catch(() => false)) {
    if (!config.sharedSessionLoginAnyway) {
      throw new WorkflowError(
        "SHARED_SESSION_CONFLICT",
        "Another DAT device is active. Human approval is required before logging it out.",
        "RV-040",
      );
    }
    await loginAnyway.click();
    await expect(loginAnyway).toBeHidden({ timeout: config.resultTimeoutMs });
  }
}

export async function openAuthenticatedTools(
  config: AppConfig,
  options: {
    allowHumanAuth?: boolean;
    humanAuthMode?: "prompt" | "observe" | "deny";
    authenticationOnly?: boolean;
    target?: "tools" | "search-loads";
  } = {},
): Promise<OpenedBrowser> {
  await fs.mkdir(config.userDataDir, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(config.userDataDir, {
    ...(config.browserChannel ? { channel: config.browserChannel } : {}),
    headless: config.headless,
    viewport: null,
  });
  const page = context.pages()[0] || (await context.newPage());
  const target: DatTarget = options.target === "search-loads" ? "search-loads" : "tools";
  const targetUrl = target === "search-loads" ? config.searchLoadsUrl : config.toolsUrl;
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

  const humanAuthMode = options.humanAuthMode ||
    (options.allowHumanAuth === false ? "deny" : "prompt");
  let authenticationAttempted = false;
  while (true) {
    try {
      assertApprovedDatOneUrl(page, target);
      await waitForDatOne(page, config);
      // Authentication setup must prove the same stable authenticated landmark
      // as a workflow run; a transient one.dat.com URL alone is insufficient.
      await waitForAuthenticatedTarget(page, target, config.resultTimeoutMs);
      break;
    } catch (error) {
      const delayedAuthRedirect = isLoginUrl(page.url());
      const requiresAuth = error instanceof WorkflowError &&
        error.category === "AUTH_REQUIRED";
      if (!delayedAuthRedirect && !requiresAuth) {
        await context.close();
        throw error;
      }
      if (authenticationAttempted || config.headless || humanAuthMode === "deny") {
        await context.close();
        throw authRequired(
          target,
          authenticationAttempted
            ? "DAT is still showing the login boundary."
            : "DAT requires manual authentication. Run the documented authentication flow on the worker host.",
        );
      }
      authenticationAttempted = true;
      await waitForHumanAuthentication(page, config, humanAuthMode);
      if (isLoginUrl(page.url())) {
        await context.close();
        throw authRequired(target, "DAT is still showing the login boundary.");
      }
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    }
  }
  return { context, page };
}

async function selectCity(
  field: Locator,
  page: Page,
  value: string,
  timeoutMs: number,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await field.fill(value);
    const option = page.getByRole("option", { name: value, exact: true });
    try {
      await option.waitFor({ state: "visible", timeout: timeoutMs });
      await option.click();
      await expect(field).toHaveValue(value, { timeout: timeoutMs });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
      await field.fill("");
    }
  }
}

async function selectEquipment(
  page: Page,
  equipment: EquipmentType,
  timeoutMs: number,
): Promise<void> {
  const field = page.getByRole("combobox", { name: /^Equipment Type/ });
  await expect(field).toHaveCount(1);
  await field.click();
  const option = page.getByRole("option", { name: equipment, exact: true });
  await option.waitFor({ state: "visible", timeout: timeoutMs });
  await option.click();
  await expect(field).toContainText(equipment, { timeout: timeoutMs });
}

export async function populateQuoteForm(
  page: Page,
  request: QuoteRequest,
  timeoutMs: number,
): Promise<{
  origin: Locator;
  destination: Locator;
  search: Locator;
}> {
  const origin = page.getByRole("combobox", {
    name: "Origin (City, ST / ZIP)*",
    exact: true,
  });
  const destination = page.getByRole("combobox", {
    name: "Destination (City, ST / ZIP)*",
    exact: true,
  });
  const search = page.getByRole("button", { name: "SEARCH", exact: true });

  await expect(origin).toHaveCount(1);
  await expect(destination).toHaveCount(1);
  await expect(search).toHaveCount(1);
  await selectCity(origin, page, request.origin, timeoutMs);
  await selectCity(destination, page, request.destination, timeoutMs);
  await selectEquipment(page, request.equipmentType, timeoutMs);
  await expect(origin).toHaveValue(request.origin);
  await expect(destination).toHaveValue(request.destination);
  await expect(search).toBeEnabled({ timeout: timeoutMs });
  return { origin, destination, search };
}

async function text(locator: Locator): Promise<string> {
  const value = (await locator.textContent())?.replace(/\s+/g, " ").trim();
  if (!value) {
    throw new WorkflowError(
      "EXTRACTION_UNVERIFIED",
      "A required RateView result field was empty.",
      "RV-100",
    );
  }
  return value;
}

async function extractCard(
  page: Page,
  rateType: "SPOT" | "CONTRACT",
): Promise<ReturnType<typeof parseRateCard>> {
  const className = rateType === "SPOT" ? "spot" : "contract";
  const card = page.locator(`dat-market-rate-data .details-container.${className}`);
  await expect(card).toHaveCount(1);
  return parseRateCard({
    rateType,
    acceptedMarketLane: await text(card.locator(".geo-label")),
    averageTotal: await text(card.locator(".rate-data")),
    averagePerMile: await text(card.locator(".rate-permile")),
    milesAndTimeframe: await text(card.locator(".miles-day-average")),
    range: await text(card.locator(".range-data")),
  });
}

export async function submitAndExtract(
  page: Page,
  request: QuoteRequest,
  controls: { origin: Locator; destination: Locator; search: Locator },
  config: AppConfig,
  runDirectory: string,
): Promise<QuoteResult> {
  await controls.search.click();
  const newSearch = page.getByRole("button", { name: "NEW SEARCH", exact: true });
  await newSearch.waitFor({ state: "visible", timeout: config.resultTimeoutMs });

  const spot = await extractCard(page, "SPOT");
  const contract = await extractCard(page, "CONTRACT");
  await fs.mkdir(runDirectory, { recursive: true, mode: 0o700 });
  await page.screenshot({
    path: path.join(runDirectory, "result-redacted.png"),
    mask: [
      controls.origin,
      controls.destination,
      page.locator("dat-market-rate-data"),
    ],
    maskColor: "#111827",
  });

  return {
    requestId: request.requestId,
    source: "DAT RateView",
    lookupTimestamp: new Date().toISOString(),
    acceptedOrigin: request.origin,
    acceptedDestination: request.destination,
    acceptedEquipmentType: request.equipmentType,
    spot,
    contract,
  };
}

export async function capturePreSubmitEvidence(
  page: Page,
  controls: { origin: Locator; destination: Locator },
  runDirectory: string,
): Promise<void> {
  await fs.mkdir(runDirectory, { recursive: true, mode: 0o700 });
  await page.screenshot({
    path: path.join(runDirectory, "pre-submit-redacted.png"),
    mask: [controls.origin, controls.destination],
    maskColor: "#111827",
  });
}
