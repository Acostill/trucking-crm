import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDisplayedTotal,
  rankSearchLoadCandidates,
  sanitizeNonContactText,
  type RawSearchLoadCandidate,
} from "../src/searchLoads.ts";

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
