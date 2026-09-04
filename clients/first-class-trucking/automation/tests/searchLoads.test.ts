import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "@playwright/test";
import {
  collectCompleteDirectRows,
  parseDirectResultCountText,
  parseDisplayedTotal,
  rankSearchLoadCandidates,
  sanitizeNonContactText,
  searchLoadsLabelsEqual,
  searchLoadsEquipmentUiLabel,
  selectExactSearchLoadsOption,
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

test("parses the DAT direct-result counter across adjacent result spans", () => {
  assert.equal(parseDirectResultCountText("5Results"), 5);
  assert.equal(parseDirectResultCountText("5\nResults"), 5);
  assert.equal(parseDirectResultCountText("1,234 Results"), 1234);
  assert.equal(parseDirectResultCountText("Results"), null);
  assert.equal(parseDirectResultCountText("5 Results +38 Similar Results"), null);
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

test("snapshots a full DAT row batch atomically when one row has no offer element", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const rows = Array.from({ length: 26 }, (_, index) => {
      const offer = index === 24 ? "" : `<span class="offer">$${2000 - index * 10}</span>`;
      return `
        <div class="row-container" id="table-row-${index + 1}">
          <div class="cell-rate"><dat-rate>${offer}<span>$2.50/mi</span></dat-rate></div>
          <div class="cell-route"><dat-route>Dallas, TX Atlanta, GA 780 mi</dat-route></div>
          <div class="cell-timing"><dat-timing>Sep 8</dat-timing></div>
          <div class="cell-equipment"><dat-equipment>V 850 lbs 53 ft - Full</dat-equipment></div>
          <div class="cell-company"><dat-company>Safe Carrier ${index + 1}</dat-company></div>
          <div class="cell-credit"><dat-credit>95 CS 20 DTP</dat-credit></div>
        </div>
      `;
    }).join("");
    await page.setContent(`
      <cdk-virtual-scroll-viewport class="table-rows-container">
        ${rows}
      </cdk-virtual-scroll-viewport>
    `);

    const candidates = await collectCompleteDirectRows(page, 26, 2000);

    assert.equal(candidates.length, 26);
    assert.equal(candidates[24].datLoadId, "table-row-25");
    assert.equal(candidates[24].displayedTotal, null);
    const ranked = rankSearchLoadCandidates(candidates);
    assert.equal(ranked.directResultCount, 26);
    assert.equal(ranked.exclusionReasons.MISSING_OR_NON_NUMERIC_OFFER, 1);
    assert.equal(ranked.offers.length, 10);
  } finally {
    await browser.close();
  }
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
  mode: "normal" | "duplicate-chip" | "ambiguous-option" | "wrong-label" | "keep-open" = "normal",
): string {
  const duplicateReefer = mode === "ambiguous-option"
    ? '<mat-option role="option"><span aria-hidden="true">R</span><span>Reefers</span></mat-option>'
    : "";
  const initialDisplay = mode === "keep-open" ? "block" : "none";
  return `
    <style>
      @keyframes unstable-remove-icon {
        from { transform: translateX(0); }
        to { transform: translateX(2px); }
      }
      [matchipremove] { animation: unstable-remove-icon 20ms infinite alternate; }
    </style>
    <mat-form-field>
      <span>Equipment Type*</span>
      <mat-chip-list role="listbox" style="display:${initialDisplay}">
        <mat-chip role="option"><div class="mat-chip-ripple"></div> Vans (Standard) <mat-icon matchipremove aria-hidden="true">cancel</mat-icon></mat-chip>
        <mat-chip role="option"><div class="mat-chip-ripple"></div> Flatbeds <mat-icon matchipremove aria-hidden="true">cancel</mat-icon></mat-chip>
      </mat-chip-list>
      <div class="summary-element" contenteditable="true">Equipment</div>
      <input data-test="equipment-type-dropdown" role="combobox" placeholder="Equipment" style="display:${initialDisplay}" />
    </mat-form-field>
    <div id="options" style="display:${initialDisplay}">
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
      const options = document.querySelector('#options');
      const keepOpen = ${JSON.stringify(mode)} === 'keep-open';
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
        if (!keepOpen) closeTimer = setTimeout(close, 100);
      };
      const wireRemove = (chip) => chip.querySelector('[matchipremove]').addEventListener('click', () => {
        chip.remove();
        if (!keepOpen) close();
      });
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
      field.querySelector('.summary-element').addEventListener('click', () => {
        document.body.dataset.summaryClicks = String(Number(document.body.dataset.summaryClicks || '0') + 1);
        if (input.style.display === 'none') open();
        else close();
      });
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

test("compares retained DAT location labels by exact normalized business text", () => {
  assert.equal(searchLoadsLabelsEqual("Newton, KS", "NEWTON, KS"), true);
  assert.equal(searchLoadsLabelsEqual("  Newton,   KS ", "NEWTON, KS"), true);
  assert.equal(searchLoadsLabelsEqual("Newton, IA", "NEWTON, KS"), false);
  assert.equal(searchLoadsLabelsEqual("Newton, KS Metro", "NEWTON, KS"), false);
});

test("selects one exact primary option label when DAT adds decorative accessible text", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div role="option"><span aria-hidden="true">P</span><span>Portland, OR</span></div>
      <div role="option"><span aria-hidden="true">S</span><span>Portland, OR Metro</span></div>
      <script>
        document.querySelectorAll('[role="option"]').forEach((option) => {
          option.addEventListener('click', () => {
            document.body.dataset.selected = option.textContent.trim();
          });
        });
      </script>
    `);
    await selectExactSearchLoadsOption(
      page,
      "Portland, OR",
      2000,
      "Origin",
    );
    assert.equal(await page.locator("body").getAttribute("data-selected"), "PPortland, OR");
  } finally {
    await browser.close();
  }
});

test("selects one normalized exact primary option when CRM and DAT casing differ", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div role="option"><span aria-hidden="true">N</span><span>Newton, KS</span></div>
      <div role="option"><span aria-hidden="true">N</span><span>Newton, IA</span></div>
      <script>
        document.querySelectorAll('[role="option"]').forEach((option) => {
          option.addEventListener('click', () => {
            document.body.dataset.selected = option.textContent.trim();
          });
        });
      </script>
    `);
    await selectExactSearchLoadsOption(
      page,
      "NEWTON, KS",
      2000,
      "Origin",
    );
    assert.equal(await page.locator("body").getAttribute("data-selected"), "NNewton, KS");
  } finally {
    await browser.close();
  }
});

test("waits for the approved city while DAT replaces a stale autocomplete option", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div id="options">
        <div role="option"><span aria-hidden="true">S</span><span>Selma, AL</span></div>
      </div>
      <script>
        setTimeout(() => {
          const option = document.createElement('div');
          option.setAttribute('role', 'option');
          option.innerHTML = '<span aria-hidden="true">S</span><span>Selma, CA</span>';
          option.addEventListener('click', () => {
            document.body.dataset.selected = option.textContent.trim();
          });
          document.querySelector('#options').replaceChildren(option);
        }, 150);
      </script>
    `);
    await selectExactSearchLoadsOption(page, "Selma, CA", 2000, "Origin");
    assert.equal(await page.locator("body").getAttribute("data-selected"), "SSelma, CA");
  } finally {
    await browser.close();
  }
});

test("selects one exact enabled Material option while DAT keeps it animated", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <style>
        @keyframes dat-option-motion {
          from { transform: translateY(0); }
          to { transform: translateY(2px); }
        }
        mat-option { animation: dat-option-motion 20ms infinite alternate; }
      </style>
      <mat-option role="option" aria-disabled="false">
        <span aria-hidden="true">S</span><span>Selma, CA</span>
      </mat-option>
      <script>
        document.querySelector('mat-option').addEventListener('click', (event) => {
          document.body.dataset.selected = event.currentTarget.textContent.trim();
        });
      </script>
    `);
    await selectExactSearchLoadsOption(page, "Selma, CA", 2500, "Origin");
    assert.equal(await page.locator("body").getAttribute("data-selected"), "SSelma, CA");
  } finally {
    await browser.close();
  }
});

test("fails closed when an exact primary option label is ambiguous", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div role="option"><span aria-hidden="true">A</span><span>Portland, OR</span></div>
      <div role="option"><span aria-hidden="true">B</span><span>Portland, OR</span></div>
      <script>
        document.querySelectorAll('[role="option"]').forEach((option) => {
          option.addEventListener('click', () => {
            document.body.dataset.clicks = String(Number(document.body.dataset.clicks || '0') + 1);
          });
        });
      </script>
    `);
    await assert.rejects(
      selectExactSearchLoadsOption(page, "Portland, OR", 2000, "Origin"),
      (error: unknown) => error instanceof WorkflowError && error.category === "UI_DRIFT",
    );
    assert.equal(await page.locator("body").getAttribute("data-clicks"), null);
  } finally {
    await browser.close();
  }
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
      assert.equal(Number(await page.locator("body").getAttribute("data-open-count")), 3);
      assert.ok(Number(await page.locator("body").getAttribute("data-close-count")) >= 2);
      assert.equal(await page.locator("body").getAttribute("data-search-clicks"), null);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("does not toggle an already-open equipment editor closed between removals", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(equipmentFixture("keep-open"));
    await selectSearchLoadsEquipment(page, "Reefers (Standard)", 2000);
    assert.deepEqual(
      (await page.locator('mat-chip-list[role="listbox"] mat-chip[role="option"]').allInnerTexts())
        .map((value) => value.replace(/\s+/g, " ").trim()),
      ["Reefers cancel"],
    );
    assert.equal(await page.locator("body").getAttribute("data-summary-clicks"), null);
    assert.equal(await page.locator("body").getAttribute("data-search-clicks"), null);
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
