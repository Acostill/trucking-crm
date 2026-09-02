import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "../../../automation/node_modules/@playwright/test/index.mjs";
import {
  searchLoadsEquipmentUiLabel,
  selectSearchLoadsEquipment,
} from "../../../automation/src/searchLoads.ts";
import {
  SEARCH_LOADS_SCHEMA_VERSION,
  SEARCH_LOADS_WORKFLOW_ID,
  WorkflowError,
  type SearchLoadsEquipmentType,
  type SearchLoadsRequest,
} from "../../../automation/src/types.ts";
import {
  requestFingerprint,
  validateSearchLoadsRequest,
} from "../../../automation/src/validation.ts";

type FixtureMode =
  | "normal"
  | "missing-option"
  | "ambiguous-option"
  | "missing-remove"
  | "stuck-remove"
  | "no-chip"
  | "wrong-chip"
  | "wrong-extra-label"
  | "multiple-chip"
  | "auto-collapse"
  | "keep-open"
  | "bad-hidden-contract";

const mappings: Array<{
  requestLabel: SearchLoadsEquipmentType;
  uiLabel: string;
}> = [
  { requestLabel: "Vans (Standard)", uiLabel: "Vans (Standard)" },
  { requestLabel: "Flatbeds (Standard)", uiLabel: "Flatbeds" },
  { requestLabel: "Reefers (Standard)", uiLabel: "Reefers" },
];

function request(equipmentType: SearchLoadsEquipmentType): SearchLoadsRequest {
  return {
    workflowId: SEARCH_LOADS_WORKFLOW_ID,
    schemaVersion: SEARCH_LOADS_SCHEMA_VERSION,
    requestId: `qa-${equipmentType.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    shipmentRecordId: "qa-synthetic-shipment",
    searchFingerprint: "a".repeat(64),
    origin: "Synthetic Origin",
    destination: "Synthetic Destination",
    equipmentType,
    pickupDate: "2026-09-03",
    originDeadheadMiles: 150,
    destinationDeadheadMiles: 150,
    loadType: "Full & Partial",
    includeSimilarResults: false,
    approveSearch: true,
  };
}

function fixture(mode: FixtureMode): string {
  const removeAttribute = mode === "missing-remove" ? "" : "matchipremove";
  const timedControl = ["auto-collapse", "keep-open", "bad-hidden-contract"].includes(mode);
  const initialDisplay = mode === "keep-open" ? "block" : timedControl ? "none" : null;
  const displayStyle = initialDisplay ? `style="display:${initialDisplay}"` : "";
  const inputRole = mode === "bad-hidden-contract" ? "textbox" : "combobox";
  const reeferOptions = mode === "missing-option"
    ? ""
    : `
      <mat-option role="option"><span class="decorative" aria-hidden="true">R</span><span class="primary">Reefers</span></mat-option>
      ${mode === "ambiguous-option"
        ? '<mat-option role="option"><span class="decorative" aria-hidden="true">R</span><span class="primary">Reefers</span></mat-option>'
        : ""}`;
  return `
    <mat-form-field>
      <span>Equipment Type*</span>
      <mat-chip-list role="listbox" ${displayStyle}>
        <mat-chip role="option"><div class="mat-chip-ripple"></div> Vans (Standard) <mat-icon ${removeAttribute} aria-hidden="true">cancel</mat-icon></mat-chip>
        <mat-chip role="option"><div class="mat-chip-ripple"></div> Flatbeds <mat-icon ${removeAttribute} aria-hidden="true">cancel</mat-icon></mat-chip>
      </mat-chip-list>
      <div class="summary-element" contenteditable="true">Equipment</div>
      <input data-test="equipment-type-dropdown" role="${inputRole}" placeholder="Equipment" style="display:${initialDisplay ?? "none"}" />
    </mat-form-field>
    <div id="options" ${displayStyle}>
      <mat-option role="option"><span class="decorative" aria-hidden="true">V</span><span class="primary">Vans (Standard)</span></mat-option>
      <mat-option role="option"><span class="decorative" aria-hidden="true">S</span><span class="primary">Vans (Specialized)</span></mat-option>
      <mat-option role="option"><span class="decorative" aria-hidden="true">F</span><span class="primary">Flatbeds</span></mat-option>
      ${reeferOptions}
    </div>
    <button id="search">SEARCH</button>
    <script>
      const mode = ${JSON.stringify(mode)};
      const field = document.querySelector('mat-form-field');
      const list = field.querySelector('mat-chip-list');
      const input = field.querySelector('input');
      const options = document.querySelector('#options');
      const timedControl = ${JSON.stringify(timedControl)};
      const autoCollapse = mode === 'auto-collapse';
      const keepOpen = mode === 'keep-open';
      let closeTimer;
      const close = () => {
        input.style.display = 'none';
        list.style.display = 'none';
        options.style.display = 'none';
        document.body.dataset.closeCount = String(Number(document.body.dataset.closeCount || '0') + 1);
      };
      const open = () => {
        clearTimeout(closeTimer);
        input.style.display = 'block';
        list.style.display = 'block';
        options.style.display = 'block';
        document.body.dataset.openCount = String(Number(document.body.dataset.openCount || '0') + 1);
        if (autoCollapse) closeTimer = setTimeout(close, 100);
      };
      const wireRemove = (chip) => {
        const remove = chip.querySelector('[matchipremove]');
        if (remove) remove.addEventListener('click', () => {
          if (mode !== 'stuck-remove') chip.remove();
          if (autoCollapse) close();
        });
      };
      const addChip = (label) => {
        const chip = document.createElement('mat-chip');
        chip.setAttribute('role', 'option');
        const ripple = document.createElement('div');
        ripple.className = 'mat-chip-ripple';
        const selectedLabel = mode === 'wrong-chip'
          ? 'Flatbeds'
          : mode === 'wrong-extra-label'
            ? label + ' Extra'
            : label;
        const text = document.createTextNode(' ' + selectedLabel + ' ');
        const remove = document.createElement('mat-icon');
        remove.setAttribute('matchipremove', '');
        remove.setAttribute('aria-hidden', 'true');
        remove.textContent = 'cancel';
        chip.append(ripple, text, remove);
        list.append(chip);
        wireRemove(chip);
      };
      list.querySelectorAll('mat-chip').forEach(wireRemove);
      field.querySelector('.summary-element').addEventListener('click', () => {
        document.body.dataset.summaryClicks = String(Number(document.body.dataset.summaryClicks || '0') + 1);
        if (!timedControl) input.style.display = 'block';
        else if (input.style.display === 'none') open();
        else if (!keepOpen) close();
      });
      document.querySelectorAll('mat-option').forEach((option) => option.addEventListener('click', () => {
        const intended = option.querySelector('.primary').textContent.trim();
        if (mode === 'no-chip') return;
        addChip(intended);
        if (mode === 'multiple-chip') addChip('Flatbeds');
      }));
      document.querySelector('#search').addEventListener('click', () => {
        document.body.dataset.searchClicks = String(Number(document.body.dataset.searchClicks || '0') + 1);
      });
    </script>
  `;
}

async function expectClosedFailure(
  mode: FixtureMode,
  category: WorkflowError["category"],
): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(fixture(mode));
    await assert.rejects(
      selectSearchLoadsEquipment(page, "Reefers (Standard)", 250),
      (error: unknown) =>
        error instanceof WorkflowError &&
        error.category === category &&
        error.stepId === "SL-060",
    );
    assert.equal(await page.locator("body").getAttribute("data-search-clicks"), null);
  } finally {
    await browser.close();
  }
}

test("UI label mapping does not alter request or result identity inputs", () => {
  for (const { requestLabel, uiLabel } of mappings) {
    const validated = validateSearchLoadsRequest(request(requestLabel));
    assert.equal(validated.equipmentType, requestLabel);
    assert.equal(requestFingerprint(validated), "a".repeat(64));
    assert.equal(searchLoadsEquipmentUiLabel(validated.equipmentType), uiLabel);
  }
});

test("all mappings clear every stale chip and select one exact current DAT label", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const { requestLabel, uiLabel } of mappings) {
      const page = await browser.newPage();
      await page.setContent(fixture("normal"));
      await selectSearchLoadsEquipment(page, requestLabel, 1000);
      assert.deepEqual(
        (await page.locator('mat-chip-list[role="listbox"] mat-chip[role="option"]').allInnerTexts())
          .map((value) => value.replace(/\s+/g, " ").trim()),
        [`${uiLabel} cancel`],
      );
      assert.equal(await page.locator("body").getAttribute("data-search-clicks"), null);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("decorative initials do not select Vans Specialized or another equipment option", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(fixture("normal"));
    await selectSearchLoadsEquipment(page, "Vans (Standard)", 1000);
    assert.deepEqual(
      (await page.locator('mat-chip-list[role="listbox"] mat-chip[role="option"]').allInnerTexts())
        .map((value) => value.replace(/\s+/g, " ").trim()),
      ["Vans (Standard) cancel"],
    );
    assert.equal(await page.locator("body").getAttribute("data-search-clicks"), null);
  } finally {
    await browser.close();
  }
});

test("missing and ambiguous primary-label options fail closed before SEARCH", async () => {
  await expectClosedFailure("missing-option", "UI_DRIFT");
  await expectClosedFailure("ambiguous-option", "UI_DRIFT");
});

test("unsafe or unsuccessful stale-chip removal fails closed before SEARCH", async () => {
  await expectClosedFailure("missing-remove", "UI_DRIFT");
  await expectClosedFailure("stuck-remove", "FORM_VALUE_REJECTED");
});

test("empty, wrong, extra-label, and multiple selected-chip states fail closed before SEARCH", async () => {
  await expectClosedFailure("no-chip", "FORM_VALUE_REJECTED");
  await expectClosedFailure("wrong-chip", "FORM_VALUE_REJECTED");
  await expectClosedFailure("wrong-extra-label", "FORM_VALUE_REJECTED");
  await expectClosedFailure("multiple-chip", "FORM_VALUE_REJECTED");
});

test("reopens a 100ms auto-collapsing editor before both stale-chip removals and final fill", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(fixture("auto-collapse"));
    await selectSearchLoadsEquipment(page, "Reefers (Standard)", 1000);
    assert.deepEqual(
      (await page.locator('mat-chip-list[role="listbox"] mat-chip[role="option"]').allInnerTexts())
        .map((value) => value.replace(/\s+/g, " ").trim()),
      ["Reefers cancel"],
    );
    assert.equal(Number(await page.locator("body").getAttribute("data-summary-clicks")), 3);
    assert.equal(Number(await page.locator("body").getAttribute("data-open-count")), 3);
    assert.ok(Number(await page.locator("body").getAttribute("data-close-count")) >= 2);
    assert.equal(await page.locator("body").getAttribute("data-search-clicks"), null);
  } finally {
    await browser.close();
  }
});

test("validates a hidden input before open and never toggles an already-open editor", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const invalid = await browser.newPage();
    await invalid.setContent(fixture("bad-hidden-contract"));
    await assert.rejects(
      selectSearchLoadsEquipment(invalid, "Reefers (Standard)", 500),
      (error: unknown) =>
        error instanceof WorkflowError && error.category === "UI_DRIFT" && error.stepId === "SL-060",
    );
    assert.equal(await invalid.locator("body").getAttribute("data-summary-clicks"), null);
    assert.equal(await invalid.locator("body").getAttribute("data-search-clicks"), null);
    await invalid.close();

    const open = await browser.newPage();
    await open.setContent(fixture("keep-open"));
    await selectSearchLoadsEquipment(open, "Reefers (Standard)", 1000);
    assert.deepEqual(
      (await open.locator('mat-chip-list[role="listbox"] mat-chip[role="option"]').allInnerTexts())
        .map((value) => value.replace(/\s+/g, " ").trim()),
      ["Reefers cancel"],
    );
    assert.equal(await open.locator("body").getAttribute("data-summary-clicks"), null);
    assert.equal(await open.locator("body").getAttribute("data-search-clicks"), null);
  } finally {
    await browser.close();
  }
});
