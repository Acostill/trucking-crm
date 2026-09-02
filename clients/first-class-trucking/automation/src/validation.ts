import { createHash } from "node:crypto";
import {
  type EquipmentType,
  type QuoteRequest,
  SEARCH_LOADS_SCHEMA_VERSION,
  SEARCH_LOADS_WORKFLOW_ID,
  type SearchLoadsRequest,
  type SearchLoadsEquipmentType,
  type WorkflowRequest,
  WorkflowError,
} from "./types.ts";

const EQUIPMENT_TYPES: EquipmentType[] = ["Van", "Flatbed", "Reefer"];

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeEquipment(value: string): EquipmentType {
  const normalized = normalizeText(value).toLowerCase();
  const match = EQUIPMENT_TYPES.find(
    (equipment) => equipment.toLowerCase() === normalized,
  );
  if (!match) {
    throw new WorkflowError(
      "VALIDATION_ERROR",
      `Equipment must be one of: ${EQUIPMENT_TYPES.join(", ")}.`,
      "RV-010",
    );
  }
  return match;
}

export function validateRequest(input: {
  requestId?: string;
  origin?: string;
  destination?: string;
  equipmentType?: string;
  approveSearch?: boolean;
}): QuoteRequest {
  const requestId = normalizeText(input.requestId || "");
  const origin = normalizeText(input.origin || "");
  const destination = normalizeText(input.destination || "");
  if (!requestId || !origin || !destination || !input.equipmentType) {
    throw new WorkflowError(
      "VALIDATION_ERROR",
      "request-id, origin, destination, and equipment are required.",
      "RV-010",
    );
  }

  return {
    requestId,
    origin,
    destination,
    equipmentType: normalizeEquipment(input.equipmentType),
    approveSearch: input.approveSearch === true,
  };
}

export function requestFingerprint(request: WorkflowRequest): string {
  if ("workflowId" in request) return request.searchFingerprint;
  const canonical = [
    request.requestId.toLowerCase(),
    request.origin.toLowerCase(),
    request.destination.toLowerCase(),
    request.equipmentType.toLowerCase(),
  ].join("\u001f");
  return createHash("sha256").update(canonical).digest("hex");
}

const SEARCH_EQUIPMENT: SearchLoadsEquipmentType[] = [
  "Vans (Standard)",
  "Flatbeds (Standard)",
  "Reefers (Standard)",
];

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isCurrentOrFutureCalendarDate(
  value: string,
  now = new Date(),
  timezone = "America/New_York",
): boolean {
  return isValidCalendarDate(value) && value >= calendarDay(now, timezone);
}

export function validateSearchLoadsRequest(
  input: Partial<SearchLoadsRequest>,
  now = new Date(),
  timezone = "America/New_York",
): SearchLoadsRequest {
  const equipmentType = normalizeText(input.equipmentType || "") as SearchLoadsEquipmentType;
  const request: SearchLoadsRequest = {
    workflowId: SEARCH_LOADS_WORKFLOW_ID,
    schemaVersion: SEARCH_LOADS_SCHEMA_VERSION,
    requestId: normalizeText(input.requestId || ""),
    shipmentRecordId: normalizeText(input.shipmentRecordId || ""),
    searchFingerprint: normalizeText(input.searchFingerprint || ""),
    origin: normalizeText(input.origin || ""),
    destination: normalizeText(input.destination || ""),
    equipmentType,
    pickupDate: normalizeText(input.pickupDate || ""),
    originDeadheadMiles: input.originDeadheadMiles as 150,
    destinationDeadheadMiles: input.destinationDeadheadMiles as 150,
    loadType: input.loadType as "Full & Partial",
    includeSimilarResults: input.includeSimilarResults as false,
    approveSearch: input.approveSearch === true,
  };
  if (
    input.workflowId !== SEARCH_LOADS_WORKFLOW_ID ||
    input.schemaVersion !== SEARCH_LOADS_SCHEMA_VERSION ||
    !request.requestId || !request.shipmentRecordId || !request.origin || !request.destination ||
    !/^[a-f0-9]{64}$/.test(request.searchFingerprint) ||
    !isCurrentOrFutureCalendarDate(request.pickupDate, now, timezone) ||
    !SEARCH_EQUIPMENT.includes(equipmentType) ||
    request.originDeadheadMiles !== 150 || request.destinationDeadheadMiles !== 150 ||
    request.loadType !== "Full & Partial" || request.includeSimilarResults !== false
  ) {
    throw new WorkflowError(
      "VALIDATION_ERROR",
      "Search Loads request does not match the approved v1 criteria.",
      "SL-010",
    );
  }
  return request;
}

export function calendarDay(timestamp: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
