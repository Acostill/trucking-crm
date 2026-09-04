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

export function searchLoadsLabelsEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return String(left || "").replace(/\s+/g, " ").trim().toLowerCase() ===
    String(right || "").replace(/\s+/g, " ").trim().toLowerCase();
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

export function parseDirectResultCountText(
  value: string | null | undefined,
): number | null {
  // DAT renders the count and label in adjacent spans, so textContent is
  // currently `5Results` even though the UI displays `5 Results`.
  const normalized = String(value || "").replace(/\s+/g, "").trim();
  const match = normalized.match(/^(\d[\d,]*)Results?$/i);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
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
  const exactAccessible = page
    .getByRole("option", { name: value, exact: true })
    .filter({ visible: true });
  const exactPrimaryLabel = page.getByText(value, { exact: true });
  const primaryMatches = visibleOptions.filter({ has: exactPrimaryLabel });
  const deadline = Date.now() + timeoutMs;
  let sawAmbiguousMatch = false;

  const clickVerifiedOption = async (option: Locator): Promise<boolean> => {
    try {
      await option.scrollIntoViewIfNeeded({ timeout: Math.min(timeoutMs, 750) });
    } catch {
      return false;
    }
    if (
      await option.count() !== 1 ||
      !await option.isVisible().catch(() => false) ||
      await option.getAttribute("aria-disabled") === "true"
    ) return false;
    try {
      await option.click({ timeout: Math.min(timeoutMs, 750) });
      return true;
    } catch {
      // DAT Material autocomplete options can remain animated even after the
      // exact, unique, enabled business value is visible. Force bypasses only
      // Playwright's stability wait; selectCity still verifies the retained
      // field value before the workflow can continue to SEARCH.
      try {
        await option.click({ force: true, timeout: Math.min(timeoutMs, 750) });
        return true;
      } catch {
        return false;
      }
    }
  };

  // DAT can briefly expose a stale autocomplete option while the requested
  // city is still loading. Wait for the approved exact value itself instead
  // of treating the first visible option as the final result set.
  do {
    const accessibleCount = await exactAccessible.count();
    if (accessibleCount > 1) {
      sawAmbiguousMatch = true;
      await page.waitForTimeout(100);
      continue;
    }
    if (accessibleCount === 1) {
      if (await clickVerifiedOption(exactAccessible)) return;
      await page.waitForTimeout(100);
      continue;
    }

    // Current DAT Material options can prepend decorative text to the
    // accessible name. Match the exact primary visible label inside one
    // option, while still failing closed on ambiguity.
    const primaryCount = await primaryMatches.count();
    if (primaryCount > 1) {
      sawAmbiguousMatch = true;
      await page.waitForTimeout(100);
      continue;
    }
    if (primaryCount === 1) {
      if (await clickVerifiedOption(primaryMatches)) return;
      await page.waitForTimeout(100);
      continue;
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
    if (normalizedMatchIndexes.length > 1) {
      sawAmbiguousMatch = true;
      await page.waitForTimeout(100);
      continue;
    }
    if (normalizedMatchIndexes.length === 1) {
      if (await clickVerifiedOption(visibleOptions.nth(normalizedMatchIndexes[0]))) return;
      await page.waitForTimeout(100);
      continue;
    }
    await page.waitForTimeout(100);
  } while (Date.now() < deadline);

  throw new WorkflowError(
    "UI_DRIFT",
    sawAmbiguousMatch
      ? `DAT ${fieldName} options remained ambiguous for the approved value.`
      : `DAT did not display a ${fieldName} option for the approved value.`,
    "SL-060",
  );
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
  const retained = await field.inputValue();
  if (!searchLoadsLabelsEqual(retained, value)) {
    throw new WorkflowError(
      "FORM_VALUE_REJECTED",
      `DAT did not retain the approved ${fieldName} value.`,
      "SL-060",
    );
  }
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

function firstMatch(value: string | null, pattern: RegExp): string | null {
  return value?.match(pattern)?.[0]?.replace(/\s+/g, " ").trim() || null;
}

async function snapshotVisibleRows(rows: Locator): Promise<RawSearchLoadCandidate[]> {
  const snapshots = await rows.evaluateAll((elements) => {
    const removableSelector = [
      'a[href^="tel:"]',
      'a[href^="mailto:"]',
      "button",
      '[role="button"]',
      '[aria-label*="phone" i]',
      '[aria-label*="email" i]',
      '[aria-label*="contact" i]',
      '[aria-label*="call" i]',
    ].join(",");
    return elements.map((element) => {
      const cellTexts = [
        { selector: ".cell-rate dat-rate .offer" },
        { selector: '[data-test="load-rate-cell"]' },
        { selector: ".cell-rate dat-rate" },
        { selector: ".cell-route dat-route" },
        { selector: '[data-test="load-trip-cell"]' },
        {
          selector: '[data-test="load-origin-cell"]',
          removeNestedSelector: '[data-test="load-destination-cell"]',
        },
        { selector: '[data-test="load-destination-cell"]' },
        { selector: '[data-test="load-dho-cell"]' },
        { selector: '[data-test="load-dhd-cell"]' },
        { selector: ".cell-timing dat-timing" },
        { selector: ".cell-equipment dat-equipment" },
        { selector: ".cell-company-small .info-container > div:first-child" },
        { selector: ".cell-company dat-company" },
        { selector: ".cell-company-small .company" },
        { selector: ".cell-credit dat-credit" },
      ].map(({ selector, removeNestedSelector }) => {
        const source = element.querySelector(selector);
        if (!source) return null;
        const clone = source.cloneNode(true) as HTMLElement;
        if (removeNestedSelector) {
          clone.querySelectorAll(removeNestedSelector).forEach((candidate) => candidate.remove());
        }
        clone.querySelectorAll(removableSelector).forEach((candidate) => candidate.remove());
        return clone.innerText || clone.textContent || null;
      });
      const commentsPanel = element.querySelector("dat-notes .notes-contents.multiline");
      const commentsStyle = commentsPanel
        ? window.getComputedStyle(commentsPanel as HTMLElement)
        : null;
      const commentsRect = commentsPanel
        ? (commentsPanel as HTMLElement).getBoundingClientRect()
        : null;
      const commentsVisible = Boolean(commentsPanel && commentsStyle && commentsRect) &&
        commentsStyle?.display !== "none" && commentsStyle?.visibility !== "hidden" &&
        Number(commentsRect?.width) > 0 && Number(commentsRect?.height) > 0;
      return {
        datLoadId: element.getAttribute("id") || "",
        canceled: Array.from(element.querySelectorAll("*")).some((candidate) =>
          (candidate.textContent || "").trim() === "CANCELED"
        ),
        displayedTotal: cellTexts[0],
        rateText: cellTexts[1] || cellTexts[2],
        routeText: cellTexts[3],
        tripText: cellTexts[4],
        originText: cellTexts[5],
        destinationText: cellTexts[6],
        originDeadheadText: cellTexts[7],
        destinationDeadheadText: cellTexts[8],
        timingText: cellTexts[9],
        equipmentText: cellTexts[10] || cellTexts[11],
        companyText: cellTexts[12] || cellTexts[13],
        creditText: cellTexts[14],
        rawComments: commentsVisible && commentsPanel
          ? commentsPanel.textContent
          : null,
        commentsVisible,
      };
    });
  });
  return snapshots.map((snapshot, sourceOrder) => {
    const rateText = sanitizeNonContactText(snapshot.rateText).value;
    const routeText = sanitizeNonContactText(snapshot.routeText).value;
    const timingText = sanitizeNonContactText(snapshot.timingText).value;
    const equipmentText = sanitizeNonContactText(snapshot.equipmentText).value;
    const companyText = sanitizeNonContactText(snapshot.companyText).value;
    const creditText = sanitizeNonContactText(snapshot.creditText).value;
    const compactOrigin = sanitizeNonContactText(snapshot.originText).value;
    const compactDestination = sanitizeNonContactText(snapshot.destinationText).value;
    const compactTrip = sanitizeNonContactText(snapshot.tripText).value;
    const compactOriginDeadhead = sanitizeNonContactText(snapshot.originDeadheadText).value;
    const compactDestinationDeadhead = sanitizeNonContactText(
      snapshot.destinationDeadheadText,
    ).value;
    const cities = routeText?.match(/[A-Za-z][A-Za-z .'-]+,\s*[A-Z]{2}\b/g) || [];
    const cityState = (value: string | null): string | null => {
      const match = value?.match(/^(.+?)[,\s]+([A-Z]{2})$/);
      return match ? `${match[1].replace(/,\s*$/, "").trim()}, ${match[2]}` : null;
    };
    const miles = (value: string | null, prefix = ""): string | null => {
      const match = value?.match(/^\(?\s*([\d,]+)\s*\)?(?:\s*(?:mi|miles))?$/i);
      return match ? `${prefix}${match[1]} mi` : null;
    };
    const comments = sanitizeNonContactText(snapshot.rawComments);
    return {
      datLoadId: clean(snapshot.datLoadId) || "",
      sourceOrder,
      canceled: snapshot.canceled,
      displayedTotal: clean(snapshot.displayedTotal),
      rpm: firstMatch(rateText, /\$[\d,.]+\s*[*†‡]?\s*(?:\/\s*mi|per\s+mile)/i),
      tripMiles: miles(compactTrip) ||
        firstMatch(routeText, /[\d,]+\s*(?:mi|miles)\b/i),
      origin: cityState(compactOrigin) || cities[0] || null,
      destination: cityState(compactDestination) || cities[1] || null,
      originDeadhead: miles(compactOriginDeadhead, "DH-O ") ||
        firstMatch(routeText, /DH[-\s]?O\s*[:]?\s*[\d,.]+\s*(?:mi|miles)?/i),
      destinationDeadhead: miles(compactDestinationDeadhead, "DH-D ") ||
        firstMatch(routeText, /DH[-\s]?D\s*[:]?\s*[\d,.]+\s*(?:mi|miles)?/i),
      pickup: timingText,
      equipmentCode: firstMatch(equipmentText, /\b(?:VR|V|F|R|VAN|REEFER|FLATBED)\b/i),
      weight: firstMatch(equipmentText, /[\d,]+(?:\.\d+)?\s*K?\s*(?:lbs?|pounds?)\b/i),
      lengthLoadType: equipmentText,
      company: companyText,
      creditScore: firstMatch(creditText, /(?:credit\s*)?\d{2,3}/i),
      daysToPay: firstMatch(creditText, /\d+\s*(?:DTP|days?(?:\s+to\s+pay)?)/i),
      comments: comments.value,
      commentsStatus: comments.redacted
        ? "redacted"
        : snapshot.commentsVisible && comments.value
          ? "displayed"
          : "not_displayed",
    };
  });
}

async function directResultCount(page: Page, timeoutMs: number): Promise<number> {
  const currentCounter = page.locator('[data-test="results-counter"]');
  const legacyCounter = page.getByText(/^\d+\s+Results?$/i);
  const summary = currentCounter.or(legacyCounter).first();
  await summary.waitFor({ state: "visible", timeout: timeoutMs });
  const deadline = Date.now() + timeoutMs;
  do {
    const count = parseDirectResultCountText(await summary.textContent());
    if (count !== null) return count;
    await page.waitForTimeout(100);
  } while (Date.now() < deadline);
  throw new WorkflowError(
    "RESULT_SCOPE_UNVERIFIED",
    "DAT direct-result count could not be verified.",
    "SL-090",
  );
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
  fieldCoverage: Record<string, number>;
}> {
  const count = await directResultCount(page, config.resultTimeoutMs);
  if (count > 0) await chooseHighestRateSort(page, config.resultTimeoutMs);
  const candidates = await collectCompleteDirectRows(
    page,
    count,
    config.resultTimeoutMs,
  );
  const ranked = rankSearchLoadCandidates(candidates);
  const fieldCoverage = [
    "rpm",
    "tripMiles",
    "origin",
    "destination",
    "originDeadhead",
    "destinationDeadhead",
    "pickup",
    "equipmentCode",
    "weight",
    "lengthLoadType",
    "company",
    "creditScore",
    "daysToPay",
    "comments",
  ].reduce<Record<string, number>>((coverage, field) => {
    coverage[field] = ranked.offers.filter((offer) =>
      Boolean(offer[field as keyof SearchLoadOffer])
    ).length;
    return coverage;
  }, {});
  return {
    directResultCount: ranked.directResultCount,
    eligibleCount: ranked.eligibleCount,
    excludedCount: ranked.excludedCount,
    offerCount: ranked.offers.length,
    outcome: ranked.outcome,
    fieldCoverage,
  };
}

export async function collectCompleteDirectRows(
  page: Page,
  expectedCount: number,
  timeoutMs: number,
): Promise<RawSearchLoadCandidate[]> {
  if (expectedCount === 0) return [];
  const rows = page.locator('.row-container[id^="table-row-"]:not(#table-row-similar-matches-separator)');
  const viewport = page.locator("cdk-virtual-scroll-viewport.table-rows-container").first();
  if (await viewport.count()) {
    await viewport.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForTimeout(250);
  }
  const collected = new Map<string, RawSearchLoadCandidate>();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && collected.size < expectedCount) {
    const visibleRows = await snapshotVisibleRows(rows);
    for (const visibleRow of visibleRows) {
      const id = clean(visibleRow.datLoadId);
      if (!id || collected.has(id)) continue;
      collected.set(id, {
        ...visibleRow,
        datLoadId: id,
        sourceOrder: collected.size,
      });
      // DAT can render direct rows and its Similar Results batch in one DOM
      // snapshot even while the separate direct-result counter is smaller.
      // Direct rows precede the observed similar-results separator, so stop
      // exactly at the independently verified direct count.
      if (collected.size >= expectedCount) break;
    }
    if (collected.size >= expectedCount) break;
    if (!(await viewport.count())) break;
    await viewport.evaluate((element) => {
      element.scrollTop = Math.min(
        element.scrollHeight,
        element.scrollTop + Math.max(element.clientHeight * 0.8, 400),
      );
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    // A sorted DAT result set can retain the prior virtual window briefly
    // while the new rows hydrate. Continue through the bounded result timeout
    // instead of treating five unchanged frames as a terminal list.
    await page.waitForTimeout(250);
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
