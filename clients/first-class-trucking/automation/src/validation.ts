import { createHash } from "node:crypto";
import {
  type EquipmentType,
  type QuoteRequest,
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

export function requestFingerprint(request: QuoteRequest): string {
  const canonical = [
    request.requestId.toLowerCase(),
    request.origin.toLowerCase(),
    request.destination.toLowerCase(),
    request.equipmentType.toLowerCase(),
  ].join("\u001f");
  return createHash("sha256").update(canonical).digest("hex");
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
