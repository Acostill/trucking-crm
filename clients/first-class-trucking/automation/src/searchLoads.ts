import fs from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import type { AppConfig } from "./config.ts";
import {
  resolveSharedSessionConflict,
  waitForAuthenticatedTarget,
} from "./rateview.ts";
import {
  SEARCH_LOADS_SCHEMA_VERSION,
  SEARCH_LOADS_WORKFLOW_ID,
  type SearchLoadOffer,
  type SearchLoadsRequest,
  type SearchLoadsResult,
  WorkflowError,
} from "./types.ts";

export interface RawSearchLoadCandidate {
  datLoadId: string;
  sourceOrder: number;
  canceled: boolean;
  displayedTotal: string | null;
  rpm: string | null;
  tripMiles: string | null;
  origin: string | null;
  destination: string | null;
  originDeadhead: string | null;
  destinationDeadhead: string | null;
  pickup: string | null;
  equipmentCode: string | null;
  weight: string | null;
  lengthLoadType: string | null;
  company: string | null;
  creditScore: string | null;
  daysToPay: string | null;
  comments: string | null;
  commentsStatus: SearchLoadOffer["commentsStatus"];
}

interface SearchControls {
  origin: Locator;
  destination: Locator;
  search: Locator;
  startDate: Locator;
  endDate: Locator;
}

const CONTACT_EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const CONTACT_PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/;
const CONTACT_LINK_PATTERN = /(?:mailto:|tel:|https?:\/\/\S*(?:contact|phone|call|email))/i;

const SEARCH_LOADS_EQUIPMENT_UI_LABELS: Readonly<
  Record<SearchLoadsRequest["equipmentType"], string>
> = {
  "Vans (Standard)": "Vans (Standard)",
  "Flatbeds (Standard)": "Flatbeds",
  "Reefers (Standard)": "Reefers",
};

function clean(value: string | null | undefined): string | null {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 1000) : null;
}

async function selectedEquipmentChipLabel(chip: Locator): Promise<string | null> {
  const label = await chip.evaluate((element) => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[matchipremove]").forEach((decoration) => {
      decoration.remove();
    });
    return clone.innerText || clone.textContent || "";
  });
  return clean(label);
}

export function searchLoadsEquipmentUiLabel(
  equipmentType: SearchLoadsRequest["equipmentType"],
): string {
  return SEARCH_LOADS_EQUIPMENT_UI_LABELS[equipmentType];
}

export function sanitizeNonContactText(value: string | null | undefined): {
  value: string | null;
  redacted: boolean;
} {
  const normalized = clean(value);
  if (!normalized) return { value: null, redacted: false };
  if (
    CONTACT_EMAIL_PATTERN.test(normalized) ||
    CONTACT_PHONE_PATTERN.test(normalized) ||
    CONTACT_LINK_PATTERN.test(normalized)
  ) {
    return { value: null, redacted: true };
  }
  return { value: normalized, redacted: false };
}

export function parseDisplayedTotal(value: string | null | undefined): number | null {
  const normalized = clean(value);
  if (!normalized || !/^\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?$|^\$\d+(?:\.\d{2})?$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function rankSearchLoadCandidates(
  candidates: RawSearchLoadCandidate[],
): Pick<SearchLoadsResult,
  "directResultCount" | "eligibleCount" | "excludedCount" |
  "exclusionReasons" | "duplicateCount" | "outcome" | "offers"
> {
  const exclusionReasons: Record<string, number> = {};
  const increment = (reason: string) => {
    exclusionReasons[reason] = (exclusionReasons[reason] || 0) + 1;
  };
  const eligible: Array<SearchLoadOffer & { sourceOrder: number }> = [];
  const seenIds = new Set<string>();
  let duplicateCount = 0;

  for (const candidate of candidates) {
    if (!/^table-row-(?!similar-matches-separator)[A-Za-z0-9_-]+$/.test(candidate.datLoadId)) {
      increment("MISSING_STABLE_DAT_LOAD_ID");
      continue;
    }
    if (seenIds.has(candidate.datLoadId)) {
      duplicateCount += 1;
      increment("DUPLICATE_STABLE_DAT_LOAD_ID");
      continue;
    }
    seenIds.add(candidate.datLoadId);
    if (candidate.canceled) {
      increment("CANCELED");
      continue;
    }
    const totalUsd = parseDisplayedTotal(candidate.displayedTotal);
    if (totalUsd === null) {
      increment("MISSING_OR_NON_NUMERIC_OFFER");
      continue;
    }

    const fields = {
      rpm: sanitizeNonContactText(candidate.rpm).value,
      tripMiles: sanitizeNonContactText(candidate.tripMiles).value,
      origin: sanitizeNonContactText(candidate.origin).value,
      destination: sanitizeNonContactText(candidate.destination).value,
      originDeadhead: sanitizeNonContactText(candidate.originDeadhead).value,
      destinationDeadhead: sanitizeNonContactText(candidate.destinationDeadhead).value,
      pickup: sanitizeNonContactText(candidate.pickup).value,
      equipmentCode: sanitizeNonContactText(candidate.equipmentCode).value,
      weight: sanitizeNonContactText(candidate.weight).value,
      lengthLoadType: sanitizeNonContactText(candidate.lengthLoadType).value,
      company: sanitizeNonContactText(candidate.company).value,
      creditScore: sanitizeNonContactText(candidate.creditScore).value,
      daysToPay: sanitizeNonContactText(candidate.daysToPay).value,
    };
    const sanitizedComments = sanitizeNonContactText(candidate.comments);
    const commentsStatus = sanitizedComments.redacted
      ? "redacted"
      : sanitizedComments.value && candidate.commentsStatus === "displayed"
        ? "displayed"
        : "not_displayed";
    eligible.push({
      rank: 0,
      datLoadId: candidate.datLoadId,
      sourceOrder: candidate.sourceOrder,
      displayedTotal: clean(candidate.displayedTotal) as string,
      totalUsd,
      ...fields,
      comments: sanitizedComments.value,
      commentsStatus,
    });
  }

  eligible.sort((left, right) =>
    right.totalUsd - left.totalUsd || left.sourceOrder - right.sourceOrder,
  );
  const offers = eligible.slice(0, 10).map((offer, index) => ({
    ...offer,
    rank: index + 1,
  }));
  const excludedCount = Object.values(exclusionReasons).reduce(
    (sum, count) => sum + count,
    0,
  );
  return {
    directResultCount: candidates.length,
    eligibleCount: eligible.length,
    excludedCount,
    exclusionReasons,
    duplicateCount,
    outcome: candidates.length === 0
      ? "empty"
      : eligible.length === 0
        ? "no_qualifying_offers"
        : "completed",
    offers,
  };
}

export async function selectExactSearchLoadsOption(
  page: Page,
  value: string,
  timeoutMs: number,
  fieldName = "field",
): Promise<void> {
  const visibleOptions = page.locator('[role="option"]:visible');
  try {
    await visibleOptions.first().waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    throw new WorkflowError(
      "UI_DRIFT",
      `DAT did not display a ${fieldName} option for the approved value.`,
      "SL-060",
    );
  }

  const exactAccessible = page
    .getByRole("option", { name: value, exact: true })
    .filter({ visible: true });
  if (await exactAccessible.count() === 1) {
    await exactAccessible.click();
    return;
  }

  // Current DAT Material options can prepend decorative text to the option's
  // accessible name. Match the exact primary visible label inside one visible
  // option, while still failing closed on a missing or ambiguous match.
  const exactPrimaryLabel = page.getByText(value, { exact: true });
  const primaryMatches = visibleOptions.filter({ has: exactPrimaryLabel });
  if (await primaryMatches.count() === 1) {
    await primaryMatches.click();
    return;
  }

  const normalizedMatchIndexes = await visibleOptions.evaluateAll(
    (options, expected) => {
      const target = expected.replace(/\s+/g, " ").trim().toLowerCase();
      const matchingIndexes: number[] = [];
      for (let index = 0; index < options.length; index += 1) {
        const option = options[index];
        const candidates = [option, ...Array.from(option.querySelectorAll("*"))];
        for (const candidate of candidates) {
          const text = ((candidate as HTMLElement).innerText || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
          if (text === target) {
            matchingIndexes.push(index);
            break;
          }
        }
      }
      return matchingIndexes;
    },
    value,
  );
  if (normalizedMatchIndexes.length !== 1) {
    throw new WorkflowError(
      "UI_DRIFT",
      `DAT ${fieldName} options are missing or ambiguous for the approved value.`,
      "SL-060",
    );
  }
  await visibleOptions.nth(normalizedMatchIndexes[0]).click();
}

async function selectCity(
  page: Page,
  field: Locator,
  value: string,
  timeoutMs: number,
  fieldName: "Origin" | "Destination",
): Promise<void> {
  await field.fill("");
  await field.fill(value);
  await selectExactSearchLoadsOption(page, value, timeoutMs, fieldName);
  await expect(field).toHaveValue(value, { timeout: timeoutMs });
}

async function fillNamedControl(
  page: Page,
  name: RegExp,
  value: string,
): Promise<Locator> {
  const control = page.getByRole("spinbutton", { name }).or(
    page.getByRole("textbox", { name }),
  );
  await expect(control).toHaveCount(1);
  await control.fill(value);
  await expect(control).toHaveValue(value);
  return control;
}

function dateControl(page: Page, kind: "start" | "end"): Locator {
  const semanticName = kind === "start"
    ? /(?:Date Range.*Start|Start.*Date|Pickup.*Start)/i
    : /(?:Date Range.*End|End.*Date|Pickup.*End)/i;
  const semantic = page.getByRole("textbox", { name: semanticName }).or(
    page.getByRole("combobox", { name: semanticName }),
  );
  const attributes = kind === "start"
    ? 'input[data-test="date-picker-start"], input[matstartdate], input[aria-label*="start" i], input[name*="start" i], input[placeholder*="start" i]'
    : 'input[data-test="date-picker-end"], input[matenddate], input[aria-label*="end" i], input[name*="end" i], input[placeholder*="end" i]';
  return semantic.or(page.locator(attributes)).first();
}

async function fillDate(control: Locator, isoDate: string): Promise<void> {
  await expect(control).toBeVisible();
  const inputType = await control.getAttribute("type");
  const [year, month, day] = isoDate.split("-");
  const value = inputType === "date" ? isoDate : `${Number(month)}/${Number(day)}/${year}`;
  await control.fill(value);
  const actual = await control.inputValue();
  const acceptedValues = new Set([
    value,
    isoDate,
    `${month}/${day}/${year}`,
  ]);
  if (!acceptedValues.has(actual)) {
    throw new WorkflowError(
      "FORM_VALUE_REJECTED",
      `DAT did not retain the approved ${isoDate} date value.`,
      "SL-060",
    );
  }
}

export async function selectSearchLoadsEquipment(
  page: Page,
  equipmentType: SearchLoadsRequest["equipmentType"],
  timeoutMs: number,
): Promise<void> {
  const uiLabel = searchLoadsEquipmentUiLabel(equipmentType);
  const equipmentInput = page.locator('input[data-test="equipment-type-dropdown"]');
  const field = page.locator("mat-form-field").filter({ has: equipmentInput });
  const summary = field.locator('.summary-element[contenteditable="true"]');
  const input = field.locator('input[data-test="equipment-type-dropdown"]');
  const selectedChips = field.locator(
    'mat-chip-list[role="listbox"] mat-chip[role="option"]',
  );
  if (
    await field.count() !== 1 ||
    await summary.count() !== 1 ||
    await input.count() !== 1 ||
    !await summary.isVisible().catch(() => false)
  ) {
    throw new WorkflowError(
      "UI_DRIFT",
      "DAT Search Loads Equipment Type control is not uniquely identifiable.",
      "SL-060",
    );
  }
  if (
    await input.getAttribute("role") !== "combobox" ||
    await input.getAttribute("placeholder") !== "Equipment"
  ) {
    throw new WorkflowError(
      "UI_DRIFT",
      "DAT Search Loads Equipment Type input no longer matches the approved contract.",
      "SL-060",
    );
  }

  const openEquipmentControl = async (): Promise<void> => {
    if (await input.isVisible().catch(() => false)) return;
    try {
      await summary.click({ timeout: timeoutMs });
      await input.waitFor({ state: "visible", timeout: timeoutMs });
    } catch {
      throw new WorkflowError(
        "UI_DRIFT",
        "DAT Search Loads Equipment Type control did not open safely.",
        "SL-060",
      );
    }
  };

  while (await selectedChips.count() > 0) {
    const chip = selectedChips.first();
    const remove = chip.locator("[matchipremove]");
    if (await remove.count() !== 1) {
      throw new WorkflowError(
        "UI_DRIFT",
        "DAT Search Loads selected equipment chip cannot be removed safely.",
        "SL-060",
      );
    }
    const before = await selectedChips.count();
    await openEquipmentControl();
    try {
      // DAT animates this icon for nearly the full lifetime of the short-lived
      // editor, so Playwright's stability wait can outlast the open control.
      // The locator is already scoped to one chip and one removal control;
      // force bypasses only that animation check.
      await remove.click({ force: true, timeout: Math.min(timeoutMs, 1000) });
    } catch {
      throw new WorkflowError(
        "UI_DRIFT",
        "DAT Search Loads selected equipment chip cannot be removed safely.",
        "SL-060",
      );
    }
    try {
      await expect(selectedChips).toHaveCount(before - 1, { timeout: timeoutMs });
    } catch {
      throw new WorkflowError(
        "FORM_VALUE_REJECTED",
        "DAT did not remove a stale selected Equipment Type value.",
        "SL-060",
      );
    }
  }

  await openEquipmentControl();
  await input.fill(uiLabel);
  const exactPrimaryLabel = page.getByText(uiLabel, { exact: true });
  const option = page.locator('mat-option[role="option"]').filter({
    has: exactPrimaryLabel,
  });
  try {
    await option.first().waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    throw new WorkflowError(
      "UI_DRIFT",
      "DAT Search Loads Equipment Type option is missing or ambiguous.",
      "SL-060",
    );
  }
  if (await option.count() !== 1) {
    throw new WorkflowError(
      "UI_DRIFT",
      "DAT Search Loads Equipment Type option is missing or ambiguous.",
      "SL-060",
    );
  }
  await option.click({ timeout: timeoutMs });
  try {
    await selectedChips.first().waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    throw new WorkflowError(
      "FORM_VALUE_REJECTED",
      "DAT did not retain exactly one approved Equipment Type value.",
      "SL-060",
    );
  }
  if (await selectedChips.count() !== 1) {
    throw new WorkflowError(
      "FORM_VALUE_REJECTED",
      "DAT did not retain exactly one approved Equipment Type value.",
      "SL-060",
    );
  }
  const selectedLabel = await selectedEquipmentChipLabel(selectedChips.first());
  if (selectedLabel !== uiLabel) {
    throw new WorkflowError(
      "FORM_VALUE_REJECTED",
      "DAT did not retain exactly one approved Equipment Type value.",
      "SL-060",
    );
  }
}

async function populateSearchLoadsFormOnce(
  page: Page,
  request: SearchLoadsRequest,
  timeoutMs: number,
): Promise<SearchControls> {
  const origin = page.getByRole("combobox", { name: "Origin", exact: true });
  const destination = page.getByRole("combobox", { name: "Destination", exact: true });
  const loadType = page.getByRole("combobox", { name: /^Load Type/i });
  const search = page.getByRole("button", { name: "SEARCH", exact: true });
  await expect(origin).toHaveCount(1);
  await expect(destination).toHaveCount(1);
  await expect(loadType).toHaveCount(1);
  await expect(search).toHaveCount(1);

  await selectCity(page, origin, request.origin, timeoutMs, "Origin");
  await selectCity(page, destination, request.destination, timeoutMs, "Destination");
  await fillNamedControl(page, /^DH-O$/i, String(request.originDeadheadMiles));
  await fillNamedControl(page, /^DH-D$/i, String(request.destinationDeadheadMiles));

  await selectSearchLoadsEquipment(page, request.equipmentType, timeoutMs);
  await loadType.click();
  await selectExactSearchLoadsOption(
    page,
    request.loadType,
    timeoutMs,
    "Load Type",
  );

  const startDate = dateControl(page, "start");
  const endDate = dateControl(page, "end");
  await fillDate(startDate, request.pickupDate);
  await fillDate(endDate, request.pickupDate);

  const similar = page.getByRole("switch", { name: /Include Similar Results/i });
  if (await similar.count()) {
    await expect(similar).toHaveAttribute("aria-checked", "false");
  }
  await expect(search).toBeEnabled({ timeout: timeoutMs });
  return { origin, destination, search, startDate, endDate };
}

export async function populateSearchLoadsForm(
  page: Page,
  request: SearchLoadsRequest,
  config: AppConfig,
): Promise<SearchControls> {
  let sharedSessionConflictResolved = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const resolvedBeforeStaging = await resolveSharedSessionConflict(
      page,
      config,
      "search-loads",
      !sharedSessionConflictResolved,
    );
    if (resolvedBeforeStaging) {
      sharedSessionConflictResolved = true;
      await waitForAuthenticatedTarget(
        page,
        "search-loads",
        config.resultTimeoutMs,
      );
    }
    try {
      return await populateSearchLoadsFormOnce(
        page,
        request,
        config.resultTimeoutMs,
      );
    } catch (error) {
      const recovered = await resolveSharedSessionConflict(
        page,
        config,
        "search-loads",
        !sharedSessionConflictResolved,
      );
      if (recovered && attempt === 0) {
        sharedSessionConflictResolved = true;
        await waitForAuthenticatedTarget(
          page,
          "search-loads",
          config.resultTimeoutMs,
        );
        continue;
      }
      if (error instanceof WorkflowError) throw error;
      try {
        await waitForAuthenticatedTarget(
          page,
          "search-loads",
          Math.min(config.resultTimeoutMs, 1500),
        );
      } catch (identityError) {
        if (identityError instanceof WorkflowError) throw identityError;
      }
      const dateInputDiagnostics = await page.locator("input").evaluateAll((elements) =>
        elements.map((element) => {
          const input = element as HTMLInputElement;
          const container = input.closest(
            "mat-form-field, mat-date-range-input, dat-date-range, [class*='date' i]",
          );
          const metadata = {
            type: input.getAttribute("type"),
            ariaLabel: input.getAttribute("aria-label"),
            name: input.getAttribute("name"),
            placeholder: input.getAttribute("placeholder"),
            dataTest: input.getAttribute("data-test"),
            matStartDate: input.hasAttribute("matstartdate"),
            matEndDate: input.hasAttribute("matenddate"),
            containerText: container?.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) || null,
          };
          const candidateText = [
            metadata.type,
            metadata.ariaLabel,
            metadata.name,
            metadata.placeholder,
            metadata.dataTest,
            metadata.containerText,
          ].filter(Boolean).join(" ").toLowerCase();
          return { metadata, candidateText };
        }).filter(({ metadata, candidateText }) =>
          metadata.matStartDate || metadata.matEndDate ||
          /date|start|end|mm\/dd|yyyy/.test(candidateText),
        ).map(({ metadata }) => metadata).slice(0, 8),
      ).catch(() => []);
      const cause = (error instanceof Error ? error.message : "Unknown browser failure")
        .replace(CONTACT_EMAIL_PATTERN, "[redacted-email]")
        .replace(CONTACT_PHONE_PATTERN, "[redacted-phone]")
        .replace(/\s+/g, " ")
        .slice(0, 450);
      throw new WorkflowError(
        "UI_DRIFT",
        `DAT Search Loads form controls no longer match the approved semantic contract. Date inputs: ${JSON.stringify(dateInputDiagnostics)}. Cause: ${cause}`,
        "SL-060",
      );
    }
  }
  throw new WorkflowError(
    "SHARED_SESSION_CONFLICT",
    "DAT shared-session takeover did not return a stable Search Loads form.",
    "SL-040",
  );
}

export async function captureSearchLoadsPreSubmitEvidence(
  _page: Page,
  _controls: SearchControls,
  runDirectory: string,
): Promise<void> {
  await fs.mkdir(runDirectory, { recursive: true, mode: 0o700 });
  await fs.writeFile(
    path.join(runDirectory, "pre-submit-evidence.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      status: "FORM_VALIDATED_PRE_SUBMIT",
      redaction: "No page screenshot retained; Search Loads can display confidential rates and contact data.",
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

async function safeCellText(row: Locator, selector: string): Promise<string | null> {
  const cell = row.locator(selector).first();
  if (!(await cell.count())) return null;
  const value = await cell.evaluate((element) => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(
      'a[href^="tel:"], a[href^="mailto:"], button, [role="button"], [aria-label*="phone" i], [aria-label*="email" i], [aria-label*="contact" i], [aria-label*="call" i]',
    ).forEach((candidate) => candidate.remove());
    return clone.innerText || clone.textContent || "";
  });
  return sanitizeNonContactText(value).value;
}

function firstMatch(value: string | null, pattern: RegExp): string | null {
  return value?.match(pattern)?.[0]?.replace(/\s+/g, " ").trim() || null;
}

async function extractVisibleRow(row: Locator, sourceOrder: number): Promise<RawSearchLoadCandidate> {
  const datLoadId = clean(await row.getAttribute("id")) || "";
  const displayedTotal = clean(await row.locator(".cell-rate dat-rate .offer").first().textContent());
  const rateText = await safeCellText(row, ".cell-rate dat-rate");
  const routeText = await safeCellText(row, ".cell-route dat-route");
  const timingText = await safeCellText(row, ".cell-timing dat-timing");
  const equipmentText = await safeCellText(row, ".cell-equipment dat-equipment");
  const companyText = await safeCellText(row, ".cell-company dat-company");
  const creditText = await safeCellText(row, ".cell-credit dat-credit");
  const cities = routeText?.match(/[A-Za-z][A-Za-z .'-]+,\s*[A-Z]{2}\b/g) || [];
  const commentsPanel = row.locator("dat-notes .notes-contents.multiline").first();
  const commentsVisible = Boolean(await commentsPanel.count()) &&
    await commentsPanel.isVisible().catch(() => false);
  const rawComments = commentsVisible ? await commentsPanel.textContent() : null;
  const comments = sanitizeNonContactText(rawComments);
  return {
    datLoadId,
    sourceOrder,
    canceled: await row.getByText("CANCELED", { exact: true }).count() > 0,
    displayedTotal,
    rpm: firstMatch(rateText, /\$[\d,.]+\s*(?:\/\s*mi|per\s+mile)/i),
    tripMiles: firstMatch(routeText, /[\d,]+\s*(?:mi|miles)\b/i),
    origin: cities[0] || null,
    destination: cities[1] || null,
    originDeadhead: firstMatch(routeText, /DH[-\s]?O\s*[:]?\s*[\d,.]+\s*(?:mi|miles)?/i),
    destinationDeadhead: firstMatch(routeText, /DH[-\s]?D\s*[:]?\s*[\d,.]+\s*(?:mi|miles)?/i),
    pickup: timingText,
    equipmentCode: firstMatch(equipmentText, /\b(?:V|F|R|VAN|REEFER|FLATBED)\b/i),
    weight: firstMatch(equipmentText, /[\d,]+\s*(?:lbs?|pounds?)\b/i),
    lengthLoadType: equipmentText,
    company: companyText,
    creditScore: firstMatch(creditText, /(?:credit\s*)?\d{2,3}/i),
    daysToPay: firstMatch(creditText, /\d+\s*(?:DTP|days?(?:\s+to\s+pay)?)/i),
    comments: comments.value,
    commentsStatus: comments.redacted
      ? "redacted"
      : commentsVisible && comments.value
        ? "displayed"
        : "not_displayed",
  };
}

async function directResultCount(page: Page, timeoutMs: number): Promise<number> {
  const currentCounter = page.locator('[data-test="results-counter"]');
  const legacyCounter = page.getByText(/^\d+\s+Results?$/i);
  const summary = currentCounter.or(legacyCounter).first();
  await summary.waitFor({ state: "visible", timeout: timeoutMs });
  const match = clean(await summary.textContent())?.match(/\b(\d[\d,]*)\b/);
  if (!match) {
    throw new WorkflowError(
      "RESULT_SCOPE_UNVERIFIED",
      "DAT direct-result count could not be verified.",
      "SL-090",
    );
  }
  return Number(match[1].replace(/,/g, ""));
}

async function chooseHighestRateSort(page: Page, timeoutMs: number): Promise<void> {
  const sort = page.locator('[data-test="sort-by-button"]').or(
    page.getByRole("button", { name: /(?:Age - Newest|Sort by)/i }),
  ).first();
  await sort.waitFor({ state: "visible", timeout: timeoutMs });
  await sort.click();
  const highest = page.getByRole("menuitem", { name: "Rate - Highest", exact: true }).or(
    page.getByRole("option", { name: "Rate - Highest", exact: true }),
  );
  await highest.first().waitFor({ state: "visible", timeout: timeoutMs });
  await highest.first().click();
  await expect(sort).toContainText(/Rate\s*-\s*Highest/i, { timeout: timeoutMs });
}

export async function inspectExistingSearchLoadsStructure(
  page: Page,
  config: AppConfig,
): Promise<{
  directResultCount: number;
  eligibleCount: number;
  excludedCount: number;
  offerCount: number;
  outcome: SearchLoadsResult["outcome"];
}> {
  const count = await directResultCount(page, config.resultTimeoutMs);
  if (count > 0) await chooseHighestRateSort(page, config.resultTimeoutMs);
  const candidates = await collectCompleteDirectRows(
    page,
    count,
    config.resultTimeoutMs,
  );
  const ranked = rankSearchLoadCandidates(candidates);
  return {
    directResultCount: ranked.directResultCount,
    eligibleCount: ranked.eligibleCount,
    excludedCount: ranked.excludedCount,
    offerCount: ranked.offers.length,
    outcome: ranked.outcome,
  };
}

async function collectCompleteDirectRows(
  page: Page,
  expectedCount: number,
  timeoutMs: number,
): Promise<RawSearchLoadCandidate[]> {
  if (expectedCount === 0) return [];
  const rows = page.locator('.row-container[id^="table-row-"]:not(#table-row-similar-matches-separator)');
  const viewport = page.locator("cdk-virtual-scroll-viewport.table-rows-container").first();
  const collected = new Map<string, RawSearchLoadCandidate>();
  const deadline = Date.now() + timeoutMs;
  let unchangedPasses = 0;
  let lastSize = -1;
  while (Date.now() < deadline && collected.size < expectedCount) {
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const id = clean(await row.getAttribute("id"));
      if (!id || collected.has(id)) continue;
      collected.set(id, await extractVisibleRow(row, collected.size));
    }
    if (collected.size === lastSize) unchangedPasses += 1;
    else unchangedPasses = 0;
    lastSize = collected.size;
    if (collected.size >= expectedCount) break;
    if (!(await viewport.count())) break;
    await viewport.evaluate((element) => {
      element.scrollTop = Math.min(
        element.scrollHeight,
        element.scrollTop + Math.max(element.clientHeight * 0.8, 400),
      );
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForTimeout(200);
    if (unchangedPasses >= 5) break;
  }
  if (collected.size !== expectedCount) {
    throw new WorkflowError(
      "RESULT_SCOPE_UNVERIFIED",
      `DAT reported ${expectedCount} direct results but ${collected.size} unique direct rows were verified.`,
      "SL-090",
    );
  }
  return Array.from(collected.values()).map((candidate, index) => ({
    ...candidate,
    sourceOrder: index,
  }));
}

export async function submitAndExtractSearchLoads(
  page: Page,
  request: SearchLoadsRequest,
  controls: SearchControls,
  config: AppConfig,
): Promise<SearchLoadsResult> {
  await controls.search.click();
  await page.waitForTimeout(750);
  const count = await directResultCount(page, config.resultTimeoutMs);
  const similar = page.getByRole("switch", { name: /Include Similar Results/i });
  if (await similar.count()) {
    await expect(similar).toHaveAttribute("aria-checked", "false");
  }
  if (count > 0) {
    await chooseHighestRateSort(page, config.resultTimeoutMs);
  }
  const candidates = await collectCompleteDirectRows(page, count, config.resultTimeoutMs);
  const ranked = rankSearchLoadCandidates(candidates);
  return {
    workflowId: SEARCH_LOADS_WORKFLOW_ID,
    schemaVersion: SEARCH_LOADS_SCHEMA_VERSION,
    requestId: request.requestId,
    shipmentRecordId: request.shipmentRecordId,
    searchFingerprint: request.searchFingerprint,
    source: "DAT Search Loads",
    searchTimestamp: new Date().toISOString(),
    acceptedCriteria: {
      origin: request.origin,
      destination: request.destination,
      equipmentType: request.equipmentType,
      pickupDate: request.pickupDate,
      originDeadheadMiles: 150,
      destinationDeadheadMiles: 150,
      loadType: "Full & Partial",
      includeSimilarResults: false,
      sort: "Rate - Highest",
    },
    ...ranked,
  };
}
