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
  | "multiple-chip";

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
      <mat-chip-list role="listbox">
        <mat-chip role="option"><span>Vans (Standard)</span><button ${removeAttribute} aria-label="Remove equipment"></button></mat-chip>
        <mat-chip role="option"><span>Flatbeds</span><button ${removeAttribute} aria-label="Remove equipment"></button></mat-chip>
      </mat-chip-list>
      <div class="summary-element" contenteditable="true">Equipment</div>
      <input data-test="equipment-type-dropdown" role="combobox" placeholder="Equipment" style="display:none" />
    </mat-form-field>
    <div id="options">
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
      const wireRemove = (chip) => {
        const remove = chip.querySelector('[matchipremove]');
        if (remove) remove.addEventListener('click', () => {
          if (mode !== 'stuck-remove') chip.remove();
        });
      };
      const addChip = (label) => {
        const chip = document.createElement('mat-chip');
        chip.setAttribute('role', 'option');
        const text = document.createElement('span');
        text.textContent = label;
        const remove = document.createElement('button');
        remove.setAttribute('matchipremove', '');
        chip.append(text, remove);
        list.append(chip);
        wireRemove(chip);
      };
      list.querySelectorAll('mat-chip').forEach(wireRemove);
      field.querySelector('.summary-element').addEventListener('click', () => {
        input.style.display = 'block';
      });
      document.querySelectorAll('mat-option').forEach((option) => option.addEventListener('click', () => {
        const intended = option.querySelector('.primary').textContent.trim();
        if (mode === 'no-chip') return;
        addChip(mode === 'wrong-chip' ? 'Flatbeds' : intended);
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
        await page.locator('mat-chip-list[role="listbox"] mat-chip[role="option"]').allInnerTexts(),
        [uiLabel],
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
      await page.locator('mat-chip-list[role="listbox"] mat-chip[role="option"]').allInnerTexts(),
      ["Vans (Standard)"],
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

test("empty, wrong, and multiple selected-chip states fail closed before SEARCH", async () => {
  await expectClosedFailure("no-chip", "FORM_VALUE_REJECTED");
  await expectClosedFailure("wrong-chip", "FORM_VALUE_REJECTED");
  await expectClosedFailure("multiple-chip", "FORM_VALUE_REJECTED");
});
