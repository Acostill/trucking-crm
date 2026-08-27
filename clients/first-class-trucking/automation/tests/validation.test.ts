import assert from "node:assert/strict";
import test from "node:test";
import {
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
