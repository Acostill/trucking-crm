import assert from "node:assert/strict";
import test from "node:test";
import { requestFingerprint, validateRequest } from "../src/validation.ts";

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
