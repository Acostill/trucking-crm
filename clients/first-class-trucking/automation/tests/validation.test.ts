import assert from "node:assert/strict";
import test from "node:test";
import {
  isCurrentOrFutureCalendarDate,
  requestFingerprint,
  validateRequest,
  validateSearchLoadsRequest,
} from "../src/validation.ts";
import {
  SEARCH_LOADS_SCHEMA_VERSION,
  SEARCH_LOADS_WORKFLOW_ID,
} from "../src/types.ts";

test("normalization produces one duplicate identity", () => {
  const canonical = validateRequest({
    requestId: "demo-001",
    origin: "Portland, OR",
    destination: "Chicago, IL",
    equipmentType: "Van",
    approveSearch: true,
  });
  const varied = validateRequest({
    requestId: "  DEMO-001 ",
    origin: " portland,   or ",
    destination: "CHICAGO, IL",
    equipmentType: "van",
    approveSearch: true,
  });
  assert.equal(requestFingerprint(canonical), requestFingerprint(varied));
});

test("missing required inputs stop before browser use", () => {
  assert.throws(
    () => validateRequest({ requestId: "demo", origin: "Portland, OR" }),
    /required/,
  );
});

test("only observed equipment values are accepted", () => {
  assert.throws(
    () =>
      validateRequest({
        requestId: "demo",
        origin: "Portland, OR",
        destination: "Chicago, IL",
        equipmentType: "Power Only",
      }),
    /Van, Flatbed, Reefer/,
  );
});

test("Search Loads rejects impossible calendar dates before browser use", () => {
  assert.throws(
    () => validateSearchLoadsRequest({
      workflowId: SEARCH_LOADS_WORKFLOW_ID,
      schemaVersion: SEARCH_LOADS_SCHEMA_VERSION,
      requestId: "search-date-test",
      shipmentRecordId: "shipment-date-test",
      searchFingerprint: "a".repeat(64),
      origin: "Portland, OR",
      destination: "Chicago, IL",
      equipmentType: "Vans (Standard)",
      pickupDate: "2026-02-31",
      originDeadheadMiles: 150,
      destinationDeadheadMiles: 150,
      loadType: "Full & Partial",
      includeSimilarResults: false,
      approveSearch: true,
    }),
    /approved v1 criteria/,
  );
});

test("Search Loads rejects past pickup dates before browser use", () => {
  const now = new Date("2026-09-02T15:00:00Z");
  const request = {
    workflowId: SEARCH_LOADS_WORKFLOW_ID,
    schemaVersion: SEARCH_LOADS_SCHEMA_VERSION,
    requestId: "search-past-date-test",
    shipmentRecordId: "shipment-past-date-test",
    searchFingerprint: "b".repeat(64),
    origin: "Selma, CA",
    destination: "Los Angeles, CA",
    equipmentType: "Reefers (Standard)" as const,
    originDeadheadMiles: 150 as const,
    destinationDeadheadMiles: 150 as const,
    loadType: "Full & Partial" as const,
    includeSimilarResults: false as const,
    approveSearch: true,
  } as const;
  assert.equal(
    isCurrentOrFutureCalendarDate("2026-09-01", now, "America/New_York"),
    false,
  );
  assert.equal(
    isCurrentOrFutureCalendarDate("2026-09-02", now, "America/New_York"),
    true,
  );
  assert.equal(
    isCurrentOrFutureCalendarDate("2026-09-03", now, "America/New_York"),
    true,
  );
  assert.throws(
    () => validateSearchLoadsRequest(
      { ...request, pickupDate: "2026-09-01" },
      now,
      "America/New_York",
    ),
    /approved v1 criteria/,
  );
  assert.equal(
    validateSearchLoadsRequest(
      { ...request, pickupDate: "2026-09-02" },
      now,
      "America/New_York",
    ).pickupDate,
    "2026-09-02",
  );
});

test("Search Loads preserves approved 50-mile and legacy 150-mile radii and server-provided fingerprints", () => {
  const now = new Date("2026-09-09T15:00:00Z");
  const request = {
    workflowId: SEARCH_LOADS_WORKFLOW_ID, schemaVersion: SEARCH_LOADS_SCHEMA_VERSION,
    requestId: "search-radius-test", shipmentRecordId: "shipment-radius-test",
    searchFingerprint: "c".repeat(64), origin: "Charlotte, NC", destination: "Atlanta, GA",
    equipmentType: "Vans (Standard)", pickupDate: "2026-09-09",
    originDeadheadMiles: 50, destinationDeadheadMiles: 50,
    loadType: "Full & Partial", includeSimilarResults: false, approveSearch: true,
  } as const;
  const current = validateSearchLoadsRequest(request, now);
  const legacy = validateSearchLoadsRequest({ ...request, searchFingerprint: "d".repeat(64), originDeadheadMiles: 150, destinationDeadheadMiles: 150 }, now);
  assert.equal(current.originDeadheadMiles, 50);
  assert.equal(current.destinationDeadheadMiles, 50);
  assert.equal(legacy.originDeadheadMiles, 150);
  assert.equal(legacy.destinationDeadheadMiles, 150);
  assert.notEqual(requestFingerprint(current), requestFingerprint(legacy));
  assert.throws(() => validateSearchLoadsRequest({ ...request, destinationDeadheadMiles: 150 }, now));
  assert.throws(() => validateSearchLoadsRequest({ ...request, originDeadheadMiles: 75 as 50 }, now));
});
