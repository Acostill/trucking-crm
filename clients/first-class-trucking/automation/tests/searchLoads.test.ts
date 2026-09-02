import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import {
  parseDisplayedTotal,
  rankSearchLoadCandidates,
  sanitizeNonContactText,
  searchLoadsEquipmentUiLabel,
  selectSearchLoadsEquipment,
  type RawSearchLoadCandidate,
} from "../src/searchLoads.ts";
import { WorkflowError, type SearchLoadsRequest } from "../src/types.ts";

function candidate(
  id: string,
  sourceOrder: number,
  displayedTotal: string | null,
  overrides: Partial<RawSearchLoadCandidate> = {},
): RawSearchLoadCandidate {
  return {
    datLoadId: id,
    sourceOrder,
    canceled: false,
    displayedTotal,
    rpm: "$2.50/mi",
    tripMiles: "1,000 mi",
    origin: "Portland, OR",
    destination: "Chicago, IL",
    originDeadhead: "DH-O 15 mi",
    destinationDeadhead: "DH-D 20 mi",
    pickup: "Aug 13",
    equipmentCode: "V",
    weight: "8,000 lbs",
    lengthLoadType: "53 ft · Full",
    company: "Safe Carrier",
    creditScore: "95",
    daysToPay: "20 DTP",
    comments: null,
    commentsStatus: "not_displayed",
    ...overrides,
  };
}

test("parses only explicit positive total-dollar rates", () => {
  assert.equal(parseDisplayedTotal("$4,250"), 4250);
  assert.equal(parseDisplayedTotal("$4250.00"), 4250);
  assert.equal(parseDisplayedTotal("$2.50/mi"), null);
  assert.equal(parseDisplayedTotal("Call"), null);
  assert.equal(parseDisplayedTotal("$0"), null);
});

test("ranks highest total rates, preserves source order for ties, and caps at ten", () => {
  const input = Array.from({ length: 12 }, (_, index) =>
    candidate(`table-row-${index + 1}`, index, `$${1000 + index * 100}`),
  );
  input.push(candidate("table-row-canceled", 12, "$9,999", { canceled: true }));
  input.push(candidate("table-row-blank", 13, null));
  input.push(candidate("table-row-12", 14, "$8,888"));
  const result = rankSearchLoadCandidates(input);
  assert.equal(result.directResultCount, 15);
  assert.equal(result.eligibleCount, 12);
  assert.equal(result.excludedCount, 3);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.offers.length, 10);
  assert.equal(result.offers[0].totalUsd, 2100);
  assert.equal(result.offers[9].totalUsd, 1200);
  assert.deepEqual(result.exclusionReasons, {
    CANCELED: 1,
    MISSING_OR_NON_NUMERIC_OFFER: 1,
    DUPLICATE_STABLE_DAT_LOAD_ID: 1,
  });
});

test("omits contact-like values without leaking partial contact data", () => {
  assert.deepEqual(sanitizeNonContactText("Call 312-555-0199"), {
    value: null,
    redacted: true,
  });
  assert.deepEqual(sanitizeNonContactText("dispatch@example.com"), {
    value: null,
    redacted: true,
  });
  const result = rankSearchLoadCandidates([
    candidate("table-row-safe", 0, "$2,500", {
      comments: "Call 312-555-0199 for details",
      commentsStatus: "displayed",
    }),
  ]);
  assert.equal(result.offers[0].comments, null);
  assert.equal(result.offers[0].commentsStatus, "redacted");
});

test("returns explicit empty and no-qualifying outcomes", () => {
  assert.equal(rankSearchLoadCandidates([]).outcome, "empty");
  assert.equal(
    rankSearchLoadCandidates([
      candidate("table-row-no-rate", 0, null),
    ]).outcome,
    "no_qualifying_offers",
  );
});

const equipmentCases: Array<{
  requestLabel: SearchLoadsRequest["equipmentType"];
  uiLabel: string;
}> = [
  { requestLabel: "Vans (Standard)", uiLabel: "Vans (Standard)" },
  { requestLabel: "Flatbeds (Standard)", uiLabel: "Flatbeds" },
  { requestLabel: "Reefers (Standard)", uiLabel: "Reefers" },
];

function equipmentFixture(
  mode: "normal" | "duplicate-chip" | "ambiguous-option" | "wrong-label" = "normal",
): string {
  const duplicateReefer = mode === "ambiguous-option"
    ? '<mat-option role="option"><span aria-hidden="true">R</span><span>Reefers</span></mat-option>'
    : "";
  return `
    <mat-form-field>
      <span>Equipment Type*</span>
      <mat-chip-list role="listbox">
        <mat-chip role="option"><div class="mat-chip-ripple"></div> Vans (Standard) <mat-icon matchipremove aria-hidden="true">cancel</mat-icon></mat-chip>
        <mat-chip role="option"><div class="mat-chip-ripple"></div> Flatbeds <mat-icon matchipremove aria-hidden="true">cancel</mat-icon></mat-chip>
      </mat-chip-list>
      <div class="summary-element" contenteditable="true">Equipment</div>
      <input data-test="equipment-type-dropdown" role="combobox" placeholder="Equipment" style="display:none" />
    </mat-form-field>
    <div id="options">
      <mat-option role="option"><span aria-hidden="true">V</span><span>Vans (Standard)</span></mat-option>
      <mat-option role="option"><span aria-hidden="true">S</span><span>Vans (Specialized)</span></mat-option>
      <mat-option role="option"><span aria-hidden="true">F</span><span>Flatbeds</span></mat-option>
      <mat-option role="option"><span aria-hidden="true">R</span><span>Reefers</span></mat-option>
      ${duplicateReefer}
    </div>
    <button id="search">SEARCH</button>
    <script>
      const field = document.querySelector('mat-form-field');
      const list = field.querySelector('mat-chip-list');
      const input = field.querySelector('input');
      const wireRemove = (chip) => chip.querySelector('[matchipremove]').addEventListener('click', () => chip.remove());
      const addChip = (label) => {
        const chip = document.createElement('mat-chip');
        chip.setAttribute('role', 'option');
        const ripple = document.createElement('div');
        ripple.className = 'mat-chip-ripple';
        const selectedLabel = ${JSON.stringify(mode)} === 'wrong-label' ? label + ' Extra' : label;
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
      field.querySelector('.summary-element').addEventListener('click', () => { input.style.display = 'block'; });
      document.querySelectorAll('mat-option').forEach((option) => option.addEventListener('click', () => {
        addChip(option.querySelector('span:last-child').textContent.trim());
        if (${JSON.stringify(mode)} === 'duplicate-chip') addChip('Flatbeds');
      }));
      document.querySelector('#search').addEventListener('click', () => {
        document.body.dataset.searchClicks = String(Number(document.body.dataset.searchClicks || '0') + 1);
      });
    </script>
  `;
}

test("maps all approved request labels to the current DAT UI labels", () => {
  assert.deepEqual(
    equipmentCases.map(({ requestLabel }) => searchLoadsEquipmentUiLabel(requestLabel)),
    equipmentCases.map(({ uiLabel }) => uiLabel),
  );
});

test("clears stale equipment and retains exactly one mapped chip for all approved values", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const { requestLabel, uiLabel } of equipmentCases) {
      const page = await browser.newPage();
      await page.setContent(equipmentFixture());
      await selectSearchLoadsEquipment(page, requestLabel, 2000);
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

test("fails closed when option identity is ambiguous or selected-chip readback is not sole", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const ambiguous = await browser.newPage();
    await ambiguous.setContent(equipmentFixture("ambiguous-option"));
    await assert.rejects(
      selectSearchLoadsEquipment(ambiguous, "Reefers (Standard)", 2000),
      (error: unknown) => error instanceof WorkflowError && error.category === "UI_DRIFT",
    );
    assert.equal(await ambiguous.locator("body").getAttribute("data-search-clicks"), null);
    await ambiguous.close();

    const multiple = await browser.newPage();
    await multiple.setContent(equipmentFixture("duplicate-chip"));
    await assert.rejects(
      selectSearchLoadsEquipment(multiple, "Reefers (Standard)", 2000),
      (error: unknown) => error instanceof WorkflowError && error.category === "FORM_VALUE_REJECTED",
    );
    assert.equal(await multiple.locator("body").getAttribute("data-search-clicks"), null);
    await multiple.close();

    const wrongLabel = await browser.newPage();
    await wrongLabel.setContent(equipmentFixture("wrong-label"));
    await assert.rejects(
      selectSearchLoadsEquipment(wrongLabel, "Reefers (Standard)", 2000),
      (error: unknown) => error instanceof WorkflowError && error.category === "FORM_VALUE_REJECTED",
    );
    assert.equal(await wrongLabel.locator("body").getAttribute("data-search-clicks"), null);
    await wrongLabel.close();
  } finally {
    await browser.close();
  }
});
